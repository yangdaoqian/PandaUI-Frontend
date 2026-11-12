import MeshWorkerPool from './MeshWorkerPool'
import collectTransferables from './collectTransferables'

const abortError = () => Object.assign(new Error('Meshing cancelled.'), { name: 'AbortError' })

// Consumes records already read for edges. Transfers their ownership only after
// edge mounting; no second file reader and no cloned full geometry archives.
export default class ImportMeshFeed {
  controller = new AbortController()
  pending = new Set()
  bytes = 0
  displayBytes = 0
  ended = false
  disposed = false
  capacityWaiters = new Set()

  constructor (header, createWorker, hardware) {
    Object.assign(this, { header, createWorker, hardware })
  }

  get signal () { return this.controller.signal }

  async run (file, options) {
    if (this.disposed) throw abortError()
    this.options = options
    this.completion = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject })
    // Install handlers before a producer can fail/cancel this feed.
    this.completion.catch(() => {})
    this.meshPool = new MeshWorkerPool(this.createWorker, options.workerCount, this.hardware, state => {
      this.wakeProducer()
      this.reportProgress(state)
    })
    try {
      await options.onHeader(this.header)
      this.header = null
      await this.completion
    } finally {
      this.dispose()
      // Consumers can hold native metadata across an await. Let them unwind
      // before the caller releases that metadata or drops the document.
      await Promise.allSettled(this.pending)
      this.options = this.resolve = this.reject = this.completion = null
    }
  }

  async push (record) {
    if (this.disposed || this.ended) return
    while (!this.disposed && this.pending.size && (this.pending.size >= this.meshPool.limit * 2 || this.bytes + this.displayBytes >= 64 * 1024 * 1024)) {
      // Capacity can grow without a job finishing (live Worker count change).
      await new Promise(resolve => this.capacityWaiters.add(resolve))
    }
    if (this.disposed) return
    const bytes = record.objectRecord.byteLength
    let displayBytes = 0
    this.bytes += bytes
    const task = this.meshPool.run({ ...record, needsMeshing: true, displayOnly: true }, this.options.meshingOptions, this.options.forceMeshing)
      .then(result => {
        if (this.disposed) return
        displayBytes = collectTransferables(result).reduce((sum, buffer) => sum + buffer.byteLength, 0)
        this.displayBytes += displayBytes
        this.reportProgress()
        return this.options.onRecord(result)
      })
      .catch(error => { this.dispose(error) })
      .finally(() => {
        this.bytes -= bytes
        this.displayBytes -= displayBytes
        this.pending.delete(task)
        this.wakeProducer()
        this.reportProgress()
        this.finishIfReady()
      })
    this.pending.add(task)
    // Pool callbacks can fire before this record enters pending. Report the
    // retained source buffers too, including jobs queued behind a large Brep.
    this.reportProgress()
  }

  finish () { this.ended = true; this.reportProgress(); this.finishIfReady() }

  reportProgress (state = this.meshPool?.progress()) {
    this.options?.onProgress?.({
      ...state,
      meshReaderDone: this.ended,
      meshBufferedSourceBytes: this.bytes,
      meshBufferedDisplayBytes: this.displayBytes,
      meshBufferLimited: !this.ended && (this.pending.size >= this.meshPool.limit * 2 || this.bytes + this.displayBytes >= 64 * 1024 * 1024),
      done: false
    })
  }

  wakeProducer () {
    for (const resolve of this.capacityWaiters) resolve()
    this.capacityWaiters.clear()
  }

  finishIfReady () {
    if (this.ended && !this.pending.size && !this.disposed) this.resolve?.()
  }

  dispose (error = abortError()) {
    if (this.disposed) return
    this.disposed = true
    this.wakeProducer()
    this.controller.abort()
    this.meshPool?.dispose(error)
    this.header = null
    this.reject?.(error)
  }
}
