import { parseSceneFileNumeric } from './SceneFileNumeric'
import { collectSceneFileTransferables } from './SceneFileRecords'

self.onmessage = ({ data }) => {
  try {
    const packet = parseSceneFileNumeric(data.buffer, { format: data.format, name: data.name })
    self.postMessage({ packet }, collectSceneFileTransferables(packet))
  } catch (error) { self.postMessage({ error: { name: error.name, message: error.message } }) }
}
