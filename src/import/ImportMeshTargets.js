const abortError = () => Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })

// Coordinates two independent readers using IDs and scene references only.
// The mesh reader waits for one source record's complete set of placements;
// its bounded batches provide backpressure without blocking the edge reader.
export default class ImportMeshTargets {
  roots = new Map()
  ready = new Set()
  waiting = new Map()
  finished = false
  disposed = false

  add (root) {
    const id = root.userData?.sourceGeometryId
    if (this.disposed || !root.userData?.importedModelObject || !id) return
    if (!this.roots.has(id)) this.roots.set(id, [])
    this.roots.get(id).push(root)
  }

  complete (id) {
    if (this.disposed || !id) return
    this.ready.add(id)
    this.waiting.get(id)?.forEach(waiter => waiter.resolve(this.roots.get(id) || []))
  }

  wait (id, signal) {
    if (this.disposed || signal?.aborted) return Promise.reject(abortError())
    if (this.finished || this.ready.has(id)) return Promise.resolve(this.roots.get(id) || [])
    return new Promise((resolve, reject) => {
      const done = (callback, value) => {
        signal?.removeEventListener('abort', cancel)
        const waiters = this.waiting.get(id)
        waiters?.delete(waiter)
        if (!waiters?.size) this.waiting.delete(id)
        callback(value)
      }
      const waiter = { resolve: value => done(resolve, value), reject: error => done(reject, error) }
      const cancel = () => waiter.reject(abortError())
      if (!this.waiting.has(id)) this.waiting.set(id, new Set())
      this.waiting.get(id).add(waiter)
      signal?.addEventListener('abort', cancel, { once: true })
    })
  }

  finish () {
    this.finished = true
    for (const [id, waiters] of this.waiting) waiters.forEach(waiter => waiter.resolve(this.roots.get(id) || []))
  }

  dispose () {
    this.disposed = true
    for (const waiters of this.waiting.values()) waiters.forEach(waiter => waiter.reject(abortError()))
    this.roots.clear(); this.ready.clear(); this.waiting.clear()
  }
}
