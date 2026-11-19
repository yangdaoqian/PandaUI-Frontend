const assert = require('node:assert/strict')
const fs = require('fs'), path = require('path'), babel = require('@babel/core')
const root = path.resolve(__dirname, '..'), originalLoader = require.extensions['.js']
require.extensions['.js'] = (module, filename) => {
  if (filename.startsWith(path.join(root, 'src/import') + path.sep)) module._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, filename)
  else originalLoader(module, filename)
}
const { default: Pool, meshWorkerPolicy } = require('../src/import/MeshWorkerPool')
const Client = require('../src/import/LocalImportClient').default
const record = size => ({ needsMeshing: true, objectRecord: new Uint8Array(size || 4) })
function workers () {
  const list = []
  return { list, create () {
    const worker = { terminated: 0, tasks: [], postMessage (data, transfers) { assert.equal(transfers.length, 1); assert.equal(transfers[0], data.record.buffer); this.tasks.push(data) }, terminate () { this.terminated++ }, finish () { const job = this.tasks.shift(); this.onmessage({ data: { id: job.id, result: job.id, heapBytes: 0 } }) } }
    list.push(worker); return worker
  } }
}
async function main () {
  assert.equal(meshWorkerPolicy(0, { hardwareConcurrency: 16, deviceMemory: 8 }).limit, 8)
  assert.equal(meshWorkerPolicy(0, { hardwareConcurrency: 8, deviceMemory: 4 }).limit, 4)
  assert.equal(meshWorkerPolicy(8, { hardwareConcurrency: 8, deviceMemory: 8 }).limit, 7)
  assert.equal(meshWorkerPolicy(8, { hardwareConcurrency: 16, deviceMemory: 4 }).limit, 8)
  assert.equal(meshWorkerPolicy(0, { hardwareConcurrency: 4, deviceMemory: 2 }).limit, 1)
  assert.equal(meshWorkerPolicy(0, {}).limit, 3)
  assert.equal(meshWorkerPolicy(1, { hardwareConcurrency: 16, deviceMemory: 8 }).limit, 1)
  const w = workers(), pool = new Pool(w.create, 0, { hardwareConcurrency: 16, deviceMemory: 8 })
  const jobs = Array.from({ length: 10 }, () => pool.run(record(), {}, false))
  assert.equal(w.list.length, 8); assert.equal(pool.progress().meshWorkers, 8); assert.equal(pool.progress().meshQueue, 2)
  w.list[0].finish(); w.list[1].finish()
  w.list.forEach(worker => worker.finish())
  assert.deepEqual(await Promise.all(jobs), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  pool.dispose(); assert(w.list.every(worker => worker.terminated === 1))

  const previewWorkers = workers(), streamed = new Pool(previewWorkers.create, 1, { hardwareConcurrency: 8, deviceMemory: 8 })
  let releasePreview, previewStarted = false, finalDelivered = false
  const previewGate = new Promise(resolve => { releasePreview = resolve })
  const streamedJob = streamed.run({ ...record(), displayOnly: true }, {}, false, async result => {
    assert.equal(result, 'primary'); previewStarted = true; await previewGate
  }).then(result => { finalDelivered = true; return result })
  const streamingWorker = previewWorkers.list[0], streamingId = streamingWorker.tasks[0].id
  assert.equal(streamingWorker.tasks[0].streamPreview, true)
  streamingWorker.onmessage({ data: { id: streamingId, progress: { faceIndex: 90, sourceFaceCount: 100 } } })
  assert.equal(streamed.progress().meshFaceProgress[0].faceIndex, 90)
  assert.equal(streamed.progress().meshWorkers, 1, 'Progress is not task completion')
  streamingWorker.onmessage({ data: { id: streamingId, intermediate: true, result: 'primary' } })
  await Promise.resolve()
  assert(previewStarted); assert(!finalDelivered)
  assert.equal(streamed.progress().meshWorkers, 1, 'Intermediate display must retain the worker job')
  streamingWorker.finish()
  await Promise.resolve(); assert(!finalDelivered, 'Final result waits for intermediate mounting')
  releasePreview(); assert.equal(await streamedJob, streamingId)
  assert.deepEqual(streamed.progress().meshFaceProgress, [])
  streamed.dispose()

  const previewFailure = workers(), rejectedPreview = new Pool(previewFailure.create, 1, {})
  const rejectedJob = rejectedPreview.run(record(), {}, false, () => { throw new Error('Preview consumer failed') })
  const checkedRejection = assert.rejects(rejectedJob, /Preview consumer failed/)
  previewFailure.list[0].onmessage({ data: { id: 1, intermediate: true, result: {} } })
  await checkedRejection
  assert(previewFailure.list[0].terminated)

  let previewPulls = 0, previewMountStarted = false, resumeMount, previewRunFinished = false
  const mountGate = new Promise(resolve => { resumeMount = resolve })
  const previewReader = { postMessage (data) {
    const result = data.type === 'open' ? { header: new Uint8Array() }
      : { records: ++previewPulls === 1 ? [record()] : [], done: previewPulls > 1 }
    queueMicrotask(() => this.onmessage?.({ data: { id: data.id, result } }))
  }, terminate () {} }
  const previewClientWorkers = workers()
  const previewClient = new Client(previewReader, { completionOrder: true, createMesher: previewClientWorkers.create })
  const previewRun = previewClient.run({ name: 'preview.3dm' }, { surfaceOnly: true, concurrentRecords: true,
    onHeader () {}, async onRecord (record) { if (record.meshIntermediate) { previewMountStarted = true; await mountGate } }
  }).finally(() => { previewRunFinished = true })
  const previewRunCheck = assert.rejects(previewRun, { name: 'AbortError' })
  while (!previewClientWorkers.list.length) await new Promise(resolve => setTimeout(resolve, 0))
  const previewClientWorker = previewClientWorkers.list[0]
  assert.equal(previewClientWorker.tasks[0].streamPreview, true)
  previewClientWorker.onmessage({ data: { id: 1, intermediate: true, result: { meshIntermediate: true } } })
  await Promise.resolve(); assert(previewMountStarted)
  previewClient.dispose()
  await new Promise(resolve => setTimeout(resolve, 0))
  assert(!previewRunFinished, 'Cancellation waits for the preview consumer before releasing document metadata')
  resumeMount(); await previewRunCheck

  const dynamic = workers(), live = new Pool(dynamic.create, 2, { hardwareConcurrency: 16, deviceMemory: 4 })
  const liveJobs = Array.from({ length: 12 }, () => live.run(record()))
  assert.equal(live.progress().meshWorkers, 2)
  live.configure(8)
  assert.equal(live.progress().meshWorkers, 8, 'Increasing the setting must immediately schedule queued work')
  live.configure(2)
  assert.equal(live.progress().meshWorkers, 8, 'Shrinking the pool must preserve running jobs')
  while (dynamic.list.some(w => w.tasks.length)) dynamic.list.filter(w => w.tasks.length).forEach(w => w.finish())
  assert.equal((await Promise.all(liveJobs)).length, 12)
  assert.equal(live.workers.length, 2)
  live.dispose()

  const large = workers(), bounded = new Pool(large.create, 0, { hardwareConcurrency: 16, deviceMemory: 8 })
  const big = [bounded.run(record(64 * 1024 * 1024), {}, false), bounded.run(record(64 * 1024 * 1024), {}, false)]
  assert.equal(bounded.progress().meshWorkers, 1, 'Large-object scratch estimates must reduce concurrency')
  assert.equal(bounded.progress().meshMemoryLimited, true)
  large.list[0].finish(); assert.equal(large.list[0].terminated, 1, 'Large heaps must be recycled')
  large.list[1].finish(); await Promise.all(big); bounded.dispose()

  const filling = workers(), backfill = new Pool(filling.create, 8, { hardwareConcurrency: 16, deviceMemory: 8 })
  backfill.budgetBytes = 400 * 1024 * 1024
  const fillingJobs = [backfill.run(record()), backfill.run(record(20 * 1024 * 1024)), backfill.run(record())]
  assert.equal(backfill.progress().meshWorkers, 2, 'A large waiting object must not block a smaller job that fits')
  assert.deepEqual(filling.list.map(w => w.tasks[0].id), [1, 3])
  filling.list[0].finish(); filling.list[1].finish()
  assert.equal(backfill.progress().meshWorkers, 1)
  filling.list.find(w => w.tasks.length).finish()
  assert.deepEqual(await Promise.all(fillingJobs), [1, 2, 3])
  backfill.dispose()

  const fairWorkers = workers(), fair = new Pool(fairWorkers.create, 2, { hardwareConcurrency: 16, deviceMemory: 8 })
  fair.budgetBytes = 400 * 1024 * 1024
  const fairJobs = [fair.run(record()), fair.run(record(20 * 1024 * 1024)), ...Array.from({ length: 8 }, () => fair.run(record()))]
  for (let i = 0; i < 4; i++) fairWorkers.list.find(w => w.tasks.some(job => job.id > 2)).finish()
  assert.equal(fair.progress().meshWorkers, 1, 'Stop overtaking after a bounded number of small jobs')
  fairWorkers.list.find(w => w.tasks.some(job => job.id === 1)).finish()
  assert(fairWorkers.list.some(w => w.tasks.some(job => job.id === 2)), 'Drain and run the large job before more small jobs')
  while (fairWorkers.list.some(w => w.tasks.length)) fairWorkers.list.filter(w => w.tasks.length).forEach(w => w.finish())
  await Promise.all(fairJobs); fair.dispose()

  const cancelled = workers(), c = new Pool(cancelled.create, 1, { hardwareConcurrency: 8, deviceMemory: 8 })
  const pending = [c.run(record()), c.run(record())]
  c.dispose()
  const results = await Promise.allSettled(pending)
  assert(results.every(result => result.status === 'rejected' && result.reason.name === 'AbortError'))
  cancelled.list[0].finish(); assert.equal(c.progress().meshWorkers, 0)

  let pulls = 0, continueFirst, startedSecond, readerTerminated = 0
  const started = new Promise(resolve => { startedSecond = resolve })
  const gate = new Promise(resolve => { continueFirst = resolve })
  const meshWorkers = [], consumed = []
  const reader = { postMessage (data) {
    let result
    if (data.type === 'open') { assert(data.settings.deferMeshing); result = { header: new Uint8Array() } } else {
      pulls++; result = { records: pulls <= 2 ? [{ needsMeshing: true, objectRecord: new Uint8Array([pulls]) }] : [], done: pulls > 2 }
    }
    queueMicrotask(() => reader.onmessage({ data: { id: data.id, result } }))
  }, terminate () { readerTerminated++ } }
  const client = new Client(reader, { hardware: { hardwareConcurrency: 8, deviceMemory: 8 }, createMesher: () => {
    const worker = { terminated: false, async postMessage (data) {
      if (data.record[0] === 1) await gate
      else startedSecond()
      if (!this.terminated) this.onmessage({ data: { id: data.id, result: data.record } })
    }, terminate () { this.terminated = true } }
    meshWorkers.push(worker); return worker
  } })
  const run = client.run({ name: 'test.3dm' }, { onHeader () {}, onRecord: r => consumed.push(r[0]), meshingOptions: {} })
  await started
  assert(pulls <= 3, 'Reading remains bounded while the first job is blocked')
  assert.equal(meshWorkers.length, 2, 'Meshing the next batch must overlap the current batch')
  assert.deepEqual(consumed, [])
  continueFirst(); await run
  assert.deepEqual(consumed, [1, 2], 'Out-of-order completions must retain file application order')
  assert.equal(readerTerminated, 1); assert(meshWorkers.every(worker => worker.terminated))

  // Real regression: each reader batch has just one Brep. The old two-batch
  // prefetch kept six of eight workers idle, regardless of the pool setting.
  let singlePulls = 0
  const single = workers(), applied = []
  const singleReader = { postMessage (data) {
    const result = data.type === 'open' ? { header: new Uint8Array() } : { records: [record()], done: ++singlePulls === 12 }
    queueMicrotask(() => singleReader.onmessage({ data: { id: data.id, result } }))
  }, terminate () {} }
  const streaming = new Client(singleReader, { hardware: { hardwareConcurrency: 16, deviceMemory: 4 }, createMesher: single.create })
  const streamingTask = streaming.run({ name: 'single-brep-batches.3dm' }, { workerCount: 2, onHeader () {}, onRecord: r => applied.push(r) })
  const tick = () => new Promise(resolve => setTimeout(resolve, 10))
  await tick()
  assert.equal(singlePulls, 3, 'Two workers allow only three outstanding batches')
  streaming.meshPool.configure(8)
  await tick()
  assert.equal(streaming.meshPool.progress().meshWorkers, 8, 'Live expansion must wake the reader and fill eight workers')
  assert.equal(singlePulls, 9, 'Eight workers allow only nine outstanding batches')
  for (let i = 0; i < 30 && streaming.worker; i++) {
    single.list.filter(w => w.tasks.length).reverse().forEach(w => w.finish())
    await tick()
  }
  await streamingTask
  assert.deepEqual(applied, Array.from({ length: 12 }, (_, i) => i + 1), 'Completion out of order must not reorder imported records')
  let edgePulls = 0
  const edgeRecords = []
  const edgeReader = { postMessage (data) {
    if (data.type === 'open') assert.equal(data.settings.deferMeshing, true)
    const result = data.type === 'open' ? { header: new Uint8Array() } : { records: [record()], done: ++edgePulls === 3 }
    queueMicrotask(() => edgeReader.onmessage({ data: { id: data.id, result } }))
  }, terminate () {} }
  await new Client(edgeReader, { createMesher: () => assert.fail('The edge pass must not start mesh workers') }).run({ name: 'edges.3dm' }, {
    edgesOnly: true, onHeader () {}, onRecord: r => edgeRecords.push(r)
  })
  assert.equal(edgeRecords.length, 3)
  assert(edgeRecords.every(r => r.edgesOnly && r.objectRecord.byteLength === 4), 'All edges are delivered without transferring their records to a mesher')

  let orderedPulls = 0
  const orderedWorkers = workers(), orderedReader = { postMessage (data) {
    const result = data.type === 'open' ? { header: new Uint8Array() } : { records: [record()], done: ++orderedPulls === 48 }
    queueMicrotask(() => orderedReader.onmessage({ data: { id: data.id, result } }))
  }, terminate () {} }
  const orderedClient = new Client(orderedReader, { hardware: { hardwareConcurrency: 16, deviceMemory: 8 }, createMesher: orderedWorkers.create })
  const orderedTask = orderedClient.run({ name: 'ordered-baseline.3dm' }, { workerCount: 8, onHeader () {}, onRecord () { assert.fail('First record still blocked') } })
  const orderedStopped = assert.rejects(orderedTask, { name: 'AbortError' })
  await tick()
  for (let round = 0; round < 3; round++) {
    orderedWorkers.list.filter(w => w.tasks.length && w.tasks[0].id !== 1).forEach(w => w.finish())
    await tick()
  }
  assert.equal(orderedClient.meshPool.progress().meshWorkers, 1, 'Reproduce the original scheduling stall with 47 later records available')
  assert.equal(orderedPulls, 9)
  orderedClient.dispose(); await orderedStopped

  // One early slow Brep used to pin the entire ordered application window.
  // Later completed objects must mount, release their budget, and feed the pool.
  let fastPulls = 0
  const fast = workers(), fastApplied = [], fastProgress = []
  const fastReader = { postMessage (data) {
    const result = data.type === 'open' ? { header: new Uint8Array() } : { records: [record()], done: ++fastPulls === 48, processedObjects: fastPulls }
    queueMicrotask(() => fastReader.onmessage({ data: { id: data.id, result } }))
  }, terminate () {} }
  const concurrent = new Client(fastReader, { completionOrder: true, hardware: { hardwareConcurrency: 16, deviceMemory: 8 }, createMesher: fast.create })
  const concurrentTask = concurrent.run({ name: 'slow-first.3dm' }, { workerCount: 8, onHeader () {}, onRecord: id => fastApplied.push(id), onProgress: state => fastProgress.push(state) })
  await tick()
  assert.equal(concurrent.meshPool.progress().meshWorkers, 8)
  for (let round = 0; round < 3; round++) {
    fast.list.filter(w => w.tasks.length && w.tasks[0].id !== 1).forEach(w => w.finish())
    await tick()
    assert.equal(concurrent.meshPool.progress().meshWorkers, 8, 'Refill every free worker while the first Brep remains blocked')
  }
  assert(fastPulls > 16, 'Completed later results must release the original prefetch window')
  assert(fastApplied.length > 0 && !fastApplied.includes(1))
  assert(fastProgress.some(p => p.meshReadyRecords >= 0))
  for (let round = 0; round < 30 && concurrent.worker; round++) {
    fast.list.filter(w => w.tasks.length).forEach(w => w.finish())
    await tick()
  }
  await concurrentTask
  assert.deepEqual(fastApplied.slice().sort((a, b) => a - b), Array.from({ length: 48 }, (_, i) => i + 1))

  let placementPulls = 0, placementApplied = false
  const placementReader = { postMessage (data) {
    const result = data.type === 'open' ? { header: new Uint8Array() } : ++placementPulls === 1
      ? { records: [{ instanceRecord: new Uint8Array([7]) }], phase: 'Locating block placements', placementScanComplete: true }
      : { records: [], done: true }
    if (placementPulls > 1) assert(placementApplied, 'Do not submit geometry before the placement barrier is mounted')
    queueMicrotask(() => placementReader.onmessage({ data: { id: data.id, result } }))
  }, terminate () {} }
  await new Client(placementReader, { completionOrder: true, createMesher: () => assert.fail('Placement records are not mesh jobs') }).run({ name: 'placements.3dm' }, {
    onHeader () {}, async onRecord () { await tick(); placementApplied = true },
    onProgress (p) { if (p.placementScanComplete) assert(placementApplied) }
  })

  const stopping = workers(), stoppedReader = { postMessage (data) {
    const result = data.type === 'open' ? { header: new Uint8Array() } : { records: Array.from({ length: 16 }, () => record()), done: false }
    queueMicrotask(() => stoppedReader.onmessage({ data: { id: data.id, result } }))
  }, terminate () {} }
  const stopped = new Client(stoppedReader, { completionOrder: true, createMesher: stopping.create })
  const stoppedRun = stopped.run({ name: 'cancel-prefetch.3dm' }, { onHeader () {}, onRecord () {} })
  const stoppedCheck = assert.rejects(stoppedRun, { name: 'AbortError' })
  await tick(); stopped.dispose(); await stoppedCheck
  assert(stopping.list.every(w => w.terminated))
  console.log('PASS adaptive mesh pool: hardware limits, byte budget, heap recycling, cancellation, transfer ownership, ordered results, bounded prefetch and real concurrent scheduling')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
