/* global importScripts */
import prepareBrepImportRecord from './prepareBrepImportRecord'
import collectTransferables from './collectTransferables'

importScripts('/nodec/NodeC.js')
const runtime = self.createNodeC({ locateFile: name => '/nodec/' + name })
runtime.catch(() => {})
self.onmessage = async ({ data }) => {
  try {
    const module = await runtime
    let lastProgress = -Infinity, lastStage = ''
    const result = prepareBrepImportRecord(module, data.record, data.options, data.forceMeshing, data.displayOnly, {
      onProgress: progress => {
        const now = performance.now(), stage = `${progress.stage}:${progress.retryStage}`
        if (now - lastProgress < 200 && stage === lastStage) return
        // Face/refinement alternation must not bypass the posting rate limit.
        if (now - lastProgress < 200 && !progress.retryStage) return
        lastProgress = now; lastStage = stage
        self.postMessage({ id: data.id, progress })
      },
      onPreview: data.streamPreview ? result => self.postMessage({ id: data.id, intermediate: true, result }, collectTransferables(result)) : undefined
    })
    self.postMessage({ id: data.id, result, heapBytes: module.HEAPU8?.byteLength || 0 }, collectTransferables(result))
  } catch (error) { self.postMessage({ id: data.id, error: error.message || String(error) }) }
}
