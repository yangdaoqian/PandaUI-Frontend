const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const babel = require('@babel/core')
const Module = require('node:module')
const original = Module._extensions['.js']
Module._extensions['.js'] = function (module, filename) {
  if (!filename.startsWith(path.resolve(__dirname, '../src/import') + path.sep)) return original(module, filename)
  const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code
  module._compile(code, filename)
}
const ProgressiveStepImport = require('../src/import/ProgressiveStepImport').default
const { parseCad } = require('../src/import/CadFileImport')
const LocalImportClient = require('../src/import/LocalImportClient').default

function signature (record) {
  const item = record.displayObject, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  item.positions.forEach((value, i) => { assert(Number.isFinite(value)); min[i % 3] = Math.min(min[i % 3], value); max[i % 3] = Math.max(max[i % 3], value) })
  assert(item.indices.every(i => i < item.positions.length / 3))
  const colors = item.materials.map(m => m.color.map(v => Math.round(v * 1e6))).sort()
  return { bounds: [...min, ...max], colors: JSON.stringify(colors) }
}

async function testSource (runtime, name, bytes) {
  const baseline = [...parseCad(runtime, 'step', bytes).records]
  const file = new File([bytes], name)
  let runtimeLoads = 0
  const stream = new ProgressiveStepImport(file, async () => { runtimeLoads++; return runtime })
  const progress = []
  const header = await stream.open(value => progress.push(value))
  assert.equal(runtimeLoads, 0, 'Index construction must not tessellate the whole file')
  assert.equal(header.header, null)
  const jobs = header.stepPartsTotal
  const records = []
  let pulls = 0, firstCompleted = null, result
  try {
    do {
      result = await stream.pull(value => progress.push(value))
      assert(++pulls < 10000)
      assert(result.records.length <= 16)
      if (firstCompleted == null && result.records.length) firstCompleted = result.stepPartsComplete
      // Real transfer semantics must not detach a later instance/job.
      const transferables = new Set()
      for (const record of result.records) for (const value of Object.values(record.displayObject)) if (ArrayBuffer.isView(value)) transferables.add(value.buffer)
      const received = structuredClone(result.records, { transfer: [...transferables] })
      records.push(...received)
    } while (!result.done)
    assert.equal(records.length, baseline.length, `${name}: no missing or duplicate instances`)
    assert.equal(new Set(records.map(r => r.displayObject.id)).size, records.length, 'Part-local IDs must be namespaced')
    // Different tessellators need not generate the same vertices: compare every
    // instance by colors and bounds within twice the requested 0.05 mm deflection.
    const remaining = baseline.map(signature)
    for (const record of records) {
      const own = signature(record)
      const index = remaining.findIndex(other => other.colors === own.colors && other.bounds.every((v, i) => Math.abs(v - own.bounds[i]) <= 0.101))
      assert(index >= 0, `${name}: no reference instance matches placement/units/colors ${JSON.stringify(own)}`)
      remaining.splice(index, 1)
    }
    assert.equal(remaining.length, 0)
    assert.equal(result.stepFailedParts, 0, `${name}: no silently skipped job`)
    if (jobs > 1) assert(firstCompleted < jobs, 'First packet is available before every part finishes')
    assert.equal(stream.reader, null, 'Source index released at EOF')
    assert.equal(stream.active, null, 'Converted mesh records released at EOF')
    return { name, jobs, objects: records.length, nativeParts: result.stepNativeParts, compatibilityParts: result.stepFallbackParts, reasons: result.stepNativeFallbackReasons, firstCompleted, fallback: header.stepFallbackReason || null, timings: result.stepTimings }
  } finally { stream.dispose() }
}

async function testBackpressure () {
  let pulls = 0, resume, mounted
  const mountedPromise = new Promise(resolve => { mounted = resolve })
  const worker = {
    postMessage (data) {
      if (data.type === 'pull') pulls++
      const result = data.type === 'open' ? { header: null, stepPartsTotal: 2 } : { records: pulls <= 2 ? [{ displayObject: {} }] : [], done: pulls === 3 }
      setImmediate(() => worker.onmessage?.({ data: { id: data.id, result } }))
    },
    terminate () { this.terminated = true }
  }
  const client = new LocalImportClient(worker)
  const run = client.run({ name: 'test.step' }, { onHeader () {}, onRecord: () => { if (pulls === 1) { mounted(); return new Promise(resolve => { resume = resolve }) } } })
  await mountedPromise
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(pulls, 1, 'No next STEP conversion until scene consumes current packet')
  resume(); await run
  assert(worker.terminated)
  const blocked = new LocalImportClient({ postMessage () {}, terminate () { this.terminated = true } })
  const pending = blocked.run({ name: 'pending.step' }, { onHeader () {}, onRecord () {} })
  blocked.dispose()
  await assert.rejects(pending, { name: 'AbortError' })
}

async function testHiddenBody (runtime, bytes) {
  const text = bytes.toString('utf8').replace(/ENDSEC;\s*END-ISO-10303-21;/, '#999999=INVISIBILITY((#6247));\nENDSEC;\nEND-ISO-10303-21;')
  assert.notEqual(text, bytes.toString('utf8'))
  const stream = new ProgressiveStepImport(new File([text], 'hidden.step'), async () => runtime)
  try {
    await stream.open(() => {})
    const records = []
    let batch
    do { batch = await stream.pull(); records.push(...batch.records) } while (!batch.done)
    assert.equal(records.length, 18)
    assert.equal(records.filter(r => r.displayObject.visible === false).length, 8, 'Hidden source body must hide all eight occurrences without hiding siblings')
    assert.equal(batch.stepFailedParts, 0)
  } finally { stream.dispose() }
}

async function testPartFailure (runtime, bytes) {
  let conversions = 0
  const faulty = { ReadStepFile (...args) {
    if (++conversions === 2) throw new Error('Synthetic failed part')
    return runtime.ReadStepFile(...args)
  } }
    const stream = new ProgressiveStepImport(new File([bytes], 'partial.step'), async () => faulty, { nativeStep: false })
  try {
    await stream.open(() => {})
    let count = 0, last
    do { last = await stream.pull(); count += last.records.length } while (!last.done)
    assert.equal(last.stepFailedParts, 1)
    assert.equal(last.stepPartsComplete, last.stepPartsTotal)
    assert(count > 0 && count < 18, 'Successful jobs survive a later failed part')
    assert(last.importWarnings.length >= 1)
    assert(last.importWarnings[0].includes('Synthetic failed part'))
    assert.equal(stream.reader, null)
  } finally { stream.dispose() }
}

;(async () => {
  await testBackpressure()
  const runtime = await require('occt-import-js')()
  const base = path.join(path.dirname(require.resolve('occt-import-js')), '../test/testfiles')
  const sources = ['simple-basic-cube/cube.stp', 'cax-if/as1_pe_203.stp', 'cax-if/as1-oc-214.stp', 'cax-if/dm1-pe-214.stp']
  const results = []
  for (const source of sources) results.push(await testSource(runtime, path.basename(source), fs.readFileSync(path.join(base, source))))
  await testHiddenBody(runtime, fs.readFileSync(path.join(base, 'cax-if/as1-oc-214.stp')))
  await testPartFailure(runtime, fs.readFileSync(path.join(base, 'cax-if/as1-oc-214.stp')))
  assert(results.some(result => result.jobs > 1), 'At least one real assembly must use incremental conversion')
  console.log('PASS STEP progressive import:', JSON.stringify(results))
})().catch(error => { console.error(error); process.exitCode = 1 })
