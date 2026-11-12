// Stateless jobs make a hard WASM cancellation safe: no object handles survive
// between calls. A future persistent geometry pool must include its generation.
export default class NodeCClient {
  constructor ({ workerUrl = '/nodec/NodeC.worker.js', createWorker = url => new Worker(url) } = {}) {
    this.workerUrl = workerUrl
    this.createWorker = createWorker
    this.worker = null
    this.generation = 0
    this.sequence = 0
    this.pending = new Map()
    this.disposed = false
  }

  run (operation, payload = {}, { signal, taskId = 'nodec-' + (++this.sequence), transfer = [] } = {}) {
    if (this.disposed) return Promise.reject(new Error('NodeC client has been disposed.'))
    if (signal?.aborted) return Promise.reject(new DOMException('Computation cancelled.', 'AbortError'))
    if (typeof taskId !== 'string' || !taskId || this.pending.has(taskId)) return Promise.reject(new Error('A unique taskId is required.'))
    if (!this.worker) {
      try {
        const worker = this.createWorker(this.workerUrl)
        this.worker = worker
        worker.onmessage = ({ data }) => {
          if (worker !== this.worker || data?.generation !== this.generation) return
          const job = this.pending.get(data.taskId)
          if (!job) return
          this.pending.delete(data.taskId)
          job.cleanup()
          if (data.ok) job.resolve(data.result)
          else job.reject(Object.assign(new Error(data.error?.message || 'NodeC computation failed.'), { code: data.error?.code }))
        }
        worker.onerror = event => { if (worker === this.worker) this.reset(new Error(event.message || 'NodeC worker failed.')) }
        worker.onmessageerror = () => { if (worker === this.worker) this.reset(new Error('NodeC response could not be decoded.')) }
      } catch (error) { return Promise.reject(error) }
    }
    return new Promise((resolve, reject) => {
      const cancel = () => this.cancel(taskId)
      const cleanup = () => signal?.removeEventListener('abort', cancel)
      this.pending.set(taskId, { resolve, reject, cleanup })
      signal?.addEventListener('abort', cancel, { once: true })
      try { this.worker.postMessage({ taskId, generation: this.generation, operation, payload }, transfer) } catch (error) {
        this.pending.delete(taskId)
        cleanup()
        reject(error)
      }
    })
  }

  cancel (taskId) {
    if (!this.pending.has(taskId)) return false
    // A synchronous C++ call cannot receive a JS cancellation message until it
    // returns. Terminate it, rejecting all queued work in the same generation.
    this.reset(new DOMException('NodeC computation cancelled; the worker was reset.', 'AbortError'))
    return true
  }

  reset (reason = new DOMException('NodeC worker reset.', 'AbortError')) {
    const worker = this.worker
    this.worker = null
    this.generation++
    worker?.terminate()
    for (const job of this.pending.values()) { job.cleanup(); job.reject(reason) }
    this.pending.clear()
  }

  dispose () { this.disposed = true; this.reset() }
}
