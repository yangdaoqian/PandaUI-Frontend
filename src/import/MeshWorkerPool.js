const MiB = 1024 * 1024
const abortError = () => Object.assign(new Error('Meshing cancelled.'), { name: 'AbortError' })

export function meshWorkerPolicy (requested = 0, hardware = {}) {
  const cores = Math.max(1, Number(hardware.hardwareConcurrency) || 4)
  const memory = Math.max(1, Number(hardware.deviceMemory) || 4)
  // Reserve a CPU thread for interaction/reading; keep low-memory devices
  // conservative while letting desktop clients use up to eight mesh workers.
  const memoryLimit = memory <= 2 ? 1 : Math.floor(memory)
  const limit = Math.max(1, Math.min(8, cores - 1, memoryLimit))
  const requestedLimit = Math.max(1, Math.min(8, cores - 1, memory <= 2 ? 1 : Math.round(requested)))
  const automaticBudget = Math.min(1536, Math.max(128, memory * (memory <= 2 ? 96 : 192)))
  return {
    limit: requested > 0 ? requestedLimit : limit,
    budgetBytes: (requested > 0 && memory > 2 ? Math.min(2048, memory * 384, Math.max(automaticBudget, requestedLimit * 160)) : automaticBudget) * MiB
  }
}

// The main thread owns every worker, so cancelling an import can terminate
// synchronous WASM calls immediately, including all in-flight mesh jobs.
export default class MeshWorkerPool {
  constructor (createWorker, requested, hardware, onChange = () => {}) {
    Object.assign(this, meshWorkerPolicy(requested, hardware))
    this.hardware = hardware
    this.createWorker = createWorker
    this.onChange = onChange
    this.workers = []; this.queue = []; this.sequence = 0; this.activeBytes = 0; this.disposed = false
  }

  progress () {
    const active = this.workers.filter(slot => slot.job).length
    const memoryLimited = active < this.limit && this.queue.length > 0 && active > 0 && this.nextJobIndex(active) < 0
    return { meshWorkers: active, meshWorkerLimit: this.limit, meshQueue: this.queue.length, meshMemoryLimited: memoryLimited, meshWaitingForTasks: active < this.limit && this.queue.length === 0, meshEstimatedActiveBytes: this.activeBytes, meshBudgetBytes: this.budgetBytes }
  }

  nextJobIndex (active) {
    if (!this.queue.length) return -1
    if (!active || this.activeBytes + this.queue[0].cost <= this.budgetBytes) return 0
    // Fill spare capacity with smaller records, but eventually drain the pool
    // for a waiting large object. This bounds overtaking and prevents starvation.
    if ((this.queue[0].bypassed || 0) >= this.limit * 2) return -1
    return this.queue.findIndex(job => this.activeBytes + job.cost <= this.budgetBytes)
  }

  configure (requested) {
    if (this.disposed) return
    Object.assign(this, meshWorkerPolicy(requested, this.hardware))
    this.pump()
  }

  run (record, options, forceMeshing) {
    if (this.disposed) return Promise.reject(abortError())
    if (!record?.needsMeshing) return Promise.resolve(record)
    const bytes = record.objectRecord.byteLength
    // Reserve runtime/scratch memory plus expanded source and output buffers.
    // An unlimited geometric vertex budget must not turn into an unlimited
    // worker allocation. Estimate from the serialized record and let the pool
    // enforce memory backpressure instead of rejecting valid display meshes.
    const estimatedVertices = options?.maxVertices > 0 ? options.maxVertices : Math.max(10000, Math.ceil(bytes / 12))
    const estimatedTriangles = options?.maxTriangles > 0 ? options.maxTriangles : Math.max(20000, Math.ceil(bytes / 24))
    const cost = 128 * MiB + bytes * 12 + estimatedVertices * 24 + estimatedTriangles * 12
    return new Promise((resolve, reject) => {
      this.queue.push({ id: ++this.sequence, record: record.objectRecord, displayOnly: record.displayOnly === true, options, forceMeshing, cost, resolve, reject })
      this.pump()
    })
  }

  pump () {
    if (this.disposed) return
    for (const slot of this.workers.slice()) {
      if (this.workers.length <= this.limit) break
      if (!slot.job) { slot.worker.terminate(); this.workers = this.workers.filter(item => item !== slot) }
    }
    while (this.queue.length) {
      const active = this.workers.filter(slot => slot.job).length
      if (active >= this.limit) break
      const next = this.nextJobIndex(active)
      if (next < 0) break
      const job = this.queue[next]
      if (job.cost > this.budgetBytes / 2) {
        this.workers.filter(slot => !slot.job).forEach(slot => slot.worker.terminate())
        this.workers = this.workers.filter(slot => slot.job)
      }
      let slot = this.workers.find(candidate => !candidate.job)
      if (!slot) {
        try {
          slot = { worker: this.createWorker(), job: null }
          this.workers.push(slot)
          slot.worker.onmessage = ({ data }) => {
            if (this.disposed || !slot.job || data.id !== slot.job.id) return
            const completed = slot.job
            slot.job = null; this.activeBytes -= completed.cost
            if (data.error) { completed.reject(new Error(data.error)); this.dispose(new Error(data.error)); return }
            completed.resolve(data.result)
            // WASM heaps do not shrink. Recycle a worker after a large job.
            if (completed.cost > this.budgetBytes / 2 || data.heapBytes > this.budgetBytes / this.limit) {
              slot.worker.terminate(); this.workers = this.workers.filter(candidate => candidate !== slot)
            }
            this.pump()
          }
          slot.worker.onerror = error => this.dispose(new Error(error.message || 'The mesh worker stopped.'))
          slot.worker.onmessageerror = () => this.dispose(new Error('Unable to receive mesh worker output.'))
        } catch (error) { this.dispose(error); return }
      }
      for (let i = 0; i < next; i++) this.queue[i].bypassed = (this.queue[i].bypassed || 0) + 1
      this.queue.splice(next, 1); slot.job = job; this.activeBytes += job.cost
      try {
        slot.worker.postMessage({ id: job.id, record: job.record, displayOnly: job.displayOnly, options: job.options, forceMeshing: job.forceMeshing }, [job.record.buffer])
      } catch (error) { this.dispose(error); return }
    }
    this.onChange(this.progress())
  }

  dispose (error = abortError()) {
    if (this.disposed) return
    this.disposed = true
    for (const slot of this.workers) { slot.worker.terminate(); slot.job?.reject(error) }
    this.queue.forEach(job => job.reject(error))
    this.workers = []; this.queue = []; this.activeBytes = 0
    this.onChange = () => {}
  }
}
