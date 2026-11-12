export default class ImportChunkStream {
  constructor (jobId, document, onProgress = null) {
    this.jobId = jobId
    this.document = document
    this.onProgress = onProgress
    this.controller = new AbortController()
    this.loadedChunks = 0
    this.downloadedBytes = 0
    this.instanceProgress = progress => {
      if (this.controller.signal.aborted) return
      this.onProgress?.({ phase: 'Expanding instances', instances: progress.processed, loadedChunks: this.loadedChunks, totalChunks: this.readyCount || 0, loadedVertices: this.document.sceneVertices, totalBytes: this.downloadedBytes })
    }
    this.document.onInstanceProgress = this.instanceProgress
  }

  async run () {
    let cursor = 0
    let headerRevision = -1
    while (!this.document.disposed && !this.controller.signal.aborted) {
      const response = await fetch(`/api/models/${this.jobId}/ready-chunks?cursor=${cursor}&headerRevision=${headerRevision}`, { cache: 'no-store', signal: this.controller.signal })
      const ready = await response.json()
      if (!response.ok) throw new Error(ready.error || 'Display descriptions unavailable.')
      if (this.document.disposed) return
      this.readyCount = ready.readyCount
      if (ready.header) this.document.applyDisplayManifest(ready.header)
      headerRevision = ready.headerRevision
      const chunks = ready.chunks || []
      this.document.appendDisplayChunks(chunks)
      if (chunks.length) {
        await this.document.loadChunkBatch(this.jobId, chunks, completed => {
          const completedChunks = Array.isArray(completed) ? completed : [completed]
          this.loadedChunks += completedChunks.length
          this.downloadedBytes += completedChunks.reduce((total, chunk) => total + Number(chunk?.bytes || 0), 0)
          window.dispatchEvent(new CustomEvent('pandaui-mesh-progress', { detail: { phase: 'deferred', processed: this.loadedChunks, total: ready.readyCount, loadedVertices: this.document.sceneVertices } }))
          this.onProgress?.({ phase: 'Added object to Three.js', loadedChunks: this.loadedChunks, totalChunks: ready.readyCount, loadedVertices: this.document.sceneVertices, totalBytes: this.downloadedBytes })
        })
        cursor = ready.cursor
      }
      if (ready.state === 'complete' && cursor >= ready.readyCount) return
      if (!chunks.length) {
        await new Promise(resolve => {
          this.wake = resolve
          this.timer = window.setTimeout(resolve, 100)
        })
      }
    }
  }

  dispose () {
    this.controller.abort()
    window.clearTimeout(this.timer)
    this.wake?.()
    this.wake = null
    this.timer = null
    if (this.document.onInstanceProgress === this.instanceProgress) this.document.onInstanceProgress = null
    this.onProgress = null
  }
}
