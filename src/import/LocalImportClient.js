import MeshWorkerPool from './MeshWorkerPool'
import collectTransferables from './collectTransferables'

const abortError = () => Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0))

// One reader and a bounded look-ahead window keep mesh workers supplied even
// when a reader batch contains just one expensive Brep.
export default class LocalImportClient {
  constructor (worker, { createMesher, hardware = {}, completionOrder = false } = {}) {
    this.worker = worker
    this.createMesher = createMesher
    this.hardware = hardware
    this.completionOrder = completionOrder
    this.meshPool = null
    this.pending = null
    this.sequence = 0
    this.controller = new AbortController()
    worker.onmessage = ({ data }) => {
      if (data.id !== this.pending?.id) return
      if (data.progress) { this.onProgress?.(data.progress); return }
      const pending = this.pending
      this.pending = null
      if (data.error) pending.reject(new Error(data.error))
      else pending.resolve(data.result)
    }
    worker.onerror = error => this.dispose(new Error(error.message || 'The file import worker stopped.'))
    worker.onmessageerror = () => this.dispose(new Error('Unable to receive imported geometry.'))
  }

  get signal () { return this.controller.signal }

  request (type, file, settings) {
    if (!this.worker) return Promise.reject(abortError())
    if (this.pending) return Promise.reject(new Error('A file import batch is still pending.'))
    return new Promise((resolve, reject) => {
      const id = ++this.sequence
      this.pending = { id, resolve, reject }
      try { this.worker.postMessage({ id, type, file, ...(settings ? { settings } : {}) }) } catch (error) { this.dispose(error) }
    })
  }

  async run (file, { onHeader, onRecord, onProgress, onMaterialHeader, meshingOptions, forceMeshing = false, workerCount = 0, edgesOnly = false, concurrentRecords = false, surfaceOnly = false, scheduling = null }) {
    this.onProgress = onProgress
    let latestProgress = {}
    const parallel = !edgesOnly && !!this.createMesher && file.name?.toLowerCase().endsWith('.3dm')
    if (parallel) {
      this.meshPool = new MeshWorkerPool(this.createMesher, scheduling ? scheduling.workerLimit(workerCount) : workerCount, this.hardware, state => {
        this.wakePrefetch?.()
        onProgress?.({ ...latestProgress, ...state })
      })
    }
    try {
      let metadata = await this.request('open', file, { meshingOptions, forceMeshing, deferMeshing: parallel || edgesOnly, edgesOnly, surfaceOnly })
      if (!this.worker) throw abortError()
      await onHeader(metadata.header, metadata)
      delete metadata.header
      latestProgress = { ...metadata }
      onProgress?.({ ...metadata, ...(this.meshPool?.progress() || {}) })
      metadata = null
      await yieldToUI()
      if (parallel && this.completionOrder) {
        await this.completedRecords({ onRecord, onProgress: progress => { latestProgress = progress; onProgress?.({ ...progress, ...this.meshPool.progress() }) }, meshingOptions, forceMeshing, concurrentRecords, surfaceOnly, scheduling, workerCount })
        return
      }
      const prepareBatch = batch => {
        const sourceBytes = batch.records.reduce((sum, record) => sum + (record.objectRecord?.byteLength || record.byteLength || 0), 0)
        const prepared = parallel ? batch.records.map(record => this.meshPool.run(record, meshingOptions, forceMeshing)) : batch.records
        if (parallel) prepared.forEach(promise => promise.catch(() => {}))
        return { batch, prepared, sourceBytes }
      }
      for await (const { batch, prepared } of this.batches(prepareBatch, parallel)) {
        const materialHeader = batch.materialHeader
        delete batch.materialHeader
        const progress = { ...batch }
        delete progress.records
        latestProgress = progress
        let frameStart = performance.now()
        for (let index = 0; index < batch.records.length; index++) {
          if (!this.worker) throw abortError()
          const record = parallel ? await prepared[index] : batch.records[index]
          if (!this.worker) throw abortError()
          await onRecord(edgesOnly && record.objectRecord ? { ...record, edgesOnly: true } : record)
          batch.records[index] = null
          prepared[index] = null
          if (performance.now() - frameStart >= 8) { await yieldToUI(); frameStart = performance.now() }
        }
        if (!this.worker) throw abortError()
        if (materialHeader) await onMaterialHeader?.(materialHeader)
        delete batch.records
        onProgress?.({ ...batch, ...(this.meshPool?.progress() || {}) })
        await yieldToUI()
      }
    } finally { this.dispose() }
  }

  async completedRecords ({ onRecord, onProgress, meshingOptions, forceMeshing, concurrentRecords, surfaceOnly, scheduling, workerCount }) {
    const ready = [], waiters = new Set()
    const applying = new Set()
    let outstanding = 0, sourceBytes = 0, readyBytes = 0, readerDone = false, failure, progress = {}
    const wake = () => { for (const resolve of waiters) resolve(); waiters.clear() }
    const wait = () => new Promise(resolve => waiters.add(resolve))
    const waitWhile = async predicate => { while (predicate()) await wait() }
    const bufferBytes = value => collectTransferables(value).reduce((sum, buffer) => sum + buffer.byteLength, 0)
    const byteLimit = () => Math.min(64 * 1024 * 1024, this.meshPool.budgetBytes / 4)
    const report = () => onProgress?.({ ...progress, meshReaderDone: readerDone, meshReadyRecords: ready.length, meshBufferLimited: !readerDone && (sourceBytes + readyBytes >= byteLimit() || outstanding >= this.meshPool.limit * 2) })
    this.wakePrefetch = wake
    this.signal.addEventListener('abort', wake)
    const producer = (async () => {
      try {
        for (;;) {
          if (scheduling) {
            await scheduling.wait(this.signal)
            const limit = scheduling.workerLimit(workerCount)
            if (limit !== this.meshPool.limit) this.meshPool.configure(limit)
          }
          // Bound records and both source and completed display buffers. A
          // single oversized batch can enter an empty window, then drains first.
          await waitWhile(() => this.worker && (outstanding >= this.meshPool.limit * 2 || sourceBytes + readyBytes >= byteLimit()))
          if (!this.worker) throw abortError()
          const batch = await this.request('pull')
          const records = batch.records
          delete batch.records
          // Placement discovery is an ordering barrier. Its completion event
          // must follow every placement, before any deferred geometry is applied.
          const placement = batch.phase === 'Locating block placements' || batch.placementScanComplete
          if (!placement) progress = batch
          for (const record of records) {
            const bytes = record.objectRecord?.byteLength || record.byteLength || 0
            outstanding++; sourceBytes += bytes
            this.meshPool.run(surfaceOnly ? { ...record, displayOnly: true } : record, meshingOptions, forceMeshing).then(result => {
              if (!this.worker) return
              const outputBytes = bufferBytes(result)
              sourceBytes -= bytes; readyBytes += outputBytes
              ready.push({ record: result, bytes: outputBytes }); wake()
            }, error => { failure = error; wake() })
          }
          if (placement) {
            await waitWhile(() => this.worker && outstanding && !failure)
            if (!this.worker) throw abortError()
            if (failure) throw failure
            progress = batch
          }
          report()
          if (batch.done) break
        }
      } catch (error) { failure = error } finally { readerDone = true; wake() }
    })()
    try {
      let frameStart = performance.now()
      for (;;) {
        await waitWhile(() => !ready.length && !failure && this.worker && !(readerDone && !outstanding))
        if (!this.worker) throw abortError()
        if (failure) throw failure
        if (!ready.length) break
        const entry = ready.shift()
        const apply = async () => {
          try { await onRecord(entry.record) } finally {
            outstanding--; readyBytes -= entry.bytes; entry.record = null; wake()
          }
        }
        if (concurrentRecords) {
          // A surface awaiting its edge placements must not hold back another
          // object's ready surface. These retained buffers still count toward
          // the same bounded prefetch allowance until application finishes.
          const task = apply().catch(error => { failure = error; wake() }).finally(() => applying.delete(task))
          applying.add(task)
        } else await apply()
        report()
        if (performance.now() - frameStart >= 8) { await yieldToUI(); frameStart = performance.now() }
      }
    } finally {
      if (!readerDone || outstanding) this.dispose()
      await producer
      await Promise.allSettled(applying)
      ready.length = 0
      this.signal.removeEventListener('abort', wake)
      this.wakePrefetch = null
    }
  }

  async * batches (prepare, parallel) {
    if (!parallel) {
      for (;;) {
        const entry = prepare(await this.request('pull'))
        yield entry
        if (entry.batch.done) return
      }
    }
    const queue = [], waiters = new Set()
    let count = 0, records = 0, bytes = 0, failure
    const state = { done: false }
    const wake = () => { for (const resolve of waiters) resolve(); waiters.clear() }
    const wait = () => new Promise(resolve => waiters.add(resolve))
    this.wakePrefetch = wake
    this.signal.addEventListener('abort', wake)
    const producer = (async () => {
      try {
        for (;;) {
          // Include the batch currently being mounted. A single oversized
          // record is allowed, but stops further reading until it is released.
          while (this.worker && (count >= this.meshPool.limit + 1 || records >= this.meshPool.limit * 2 || bytes >= Math.min(64 * 1024 * 1024, this.meshPool.budgetBytes / 4))) await wait()
          if (!this.worker) throw abortError()
          const entry = prepare(await this.request('pull'))
          entry.recordCount = entry.batch.records.length
          count++; records += entry.recordCount; bytes += entry.sourceBytes; queue.push(entry); wake()
          if (entry.batch.done) break
        }
      } catch (error) { failure = error } finally { state.done = true; wake() }
    })()
    try {
      for (;;) {
        while (!queue.length && !state.done && this.worker) await wait()
        if (!this.worker) throw abortError()
        if (failure) throw failure
        if (!queue.length) return
        const entry = queue.shift()
        try { yield entry } finally { count--; records -= entry.recordCount; bytes -= entry.sourceBytes; wake() }
      }
    } finally {
      if (!state.done) this.dispose()
      await producer
      this.signal.removeEventListener('abort', wake)
      this.wakePrefetch = null
    }
  }

  dispose (error = abortError()) {
    this.controller.abort()
    this.meshPool?.dispose(error)
    if (this.worker) this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null
    this.worker?.terminate()
    this.worker = null
    this.pending?.reject(error)
    this.pending = null
    this.onProgress = null
  }
}
