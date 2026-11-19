import { validateManifest, packageURL, fetchPackageFile } from './NodePackageProtocol.mjs'

export class NodePackageLoader {
  constructor ({ workerFactory = () => new Worker('/nodec/NodePackage.worker.mjs', { type: 'module' }), timeout = 30000 } = {}) {
    this.workerFactory = workerFactory
    this.timeout = timeout
    this.packages = new Map()
    this.pending = new Map()
    this.sequence = 0
    this.worker = null
    this.disposed = false
  }
  request (operation, manifest, url, nodeIndex, signal) {
    if (this.disposed) return Promise.reject(new Error('WASM package loader is disposed.'))
    if (signal?.aborted) return Promise.reject(new DOMException('Node cancelled.', 'AbortError'))
    if (!this.worker) {
      this.worker = this.workerFactory()
      this.worker.onmessage = ({ data }) => {
        const request = this.pending.get(data.requestId)
        if (!request) return
        data.error ? request.reject(new Error(data.error)) : request.resolve(data.result)
      }
      this.worker.onerror = event => this.reset(new Error(event.message || 'WASM package worker failed.'))
      this.worker.onmessageerror = () => this.reset(new Error('Invalid WASM package worker message.'))
    }
    const requestId = ++this.sequence
    return new Promise((resolve, reject) => {
      let timer
      const finish = (callback, value) => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        this.pending.delete(requestId)
        callback(value)
      }
      const abort = () => finish(reject, new DOMException('Node cancelled.', 'AbortError'))
      this.pending.set(requestId, { resolve: result => finish(resolve, result), reject: error => finish(reject, error) })
      signal?.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => this.reset(new Error('WASM package worker timed out. Retry loading the package.')), this.timeout)
      try { this.worker.postMessage({ requestId, operation, manifest, url, nodeIndex }) } catch (error) { finish(reject, error) }
    })
  }
  reset (error = new Error('WASM package worker stopped.')) {
    this.worker?.terminate()
    this.worker = null
    for (const request of [...this.pending.values()]) request.reject(error)
  }
  async loadManifest (manifestURL) {
    manifestURL = packageURL(manifestURL, globalThis.location.href)
    const manifest = validateManifest(await fetchPackageFile(manifestURL, true))
    const url = packageURL(manifest.module, manifestURL)
    const existing = this.packages.get(manifest.id)
    if (existing && (existing.url !== url || JSON.stringify(existing.manifest) !== JSON.stringify(manifest))) throw new Error('Conflicting WASM package id: ' + manifest.id)
    await this.request('load', manifest, url)
    const record = { manifest, url }
    this.packages.set(manifest.id, record)
    return record
  }
  async loadAll (indexURL = '/nodec/packages/index.json', onLoad = () => {}) {
    indexURL = packageURL(indexURL, globalThis.location.href)
    const index = await fetchPackageFile(indexURL, true)
    if (index.schemaVersion !== 1 || !Array.isArray(index.packages) || index.packages.length > 128 || index.packages.some(p => typeof p !== 'string')) throw new Error('Invalid WASM package index.')
    const queue = [...new Set(index.packages)]
    const results = []
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length) {
        const path = queue.shift()
        try {
          const record = await this.loadManifest(packageURL(path, indexURL))
          await onLoad(record)
          results.push({ id: record.manifest.id, status: 'loaded' })
        } catch (error) { results.push({ path, status: 'failed', error: error.message }) }
      }
    }))
    return results
  }
  async solve (id, nodeId, { signal } = {}) {
    const record = this.packages.get(id)
    if (!record) throw new Error('WASM package has not been loaded: ' + id)
    const index = record.manifest.nodes.findIndex(n => n.id === nodeId)
    if (index < 0) throw new Error('Unknown node in WASM package: ' + nodeId)
    return this.request('solve', record.manifest, record.url, index, signal)
  }
  dispose () { this.disposed = true; this.reset(); this.packages.clear() }
}
