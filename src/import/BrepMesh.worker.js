/* global importScripts */
import prepareBrepImportRecord from './prepareBrepImportRecord'
import collectTransferables from './collectTransferables'

importScripts('/nodec/NodeC.js')
const runtime = self.createNodeC({ locateFile: name => '/nodec/' + name })
runtime.catch(() => {})
self.onmessage = async ({ data }) => {
  try {
    const module = await runtime
    const result = prepareBrepImportRecord(module, data.record, data.options, data.forceMeshing, data.displayOnly)
    self.postMessage({ id: data.id, result, heapBytes: module.HEAPU8?.byteLength || 0 }, collectTransferables(result))
  } catch (error) { self.postMessage({ id: data.id, error: error.message || String(error) }) }
}
