import { sceneFileAbortError } from './SceneFileRecords'

export function parseSceneFileInWorker (buffer, { format, name, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(sceneFileAbortError()); return }
    const worker = new Worker(new URL('./SceneFile.worker.js', import.meta.url))
    const finish = (error, packet) => {
      signal?.removeEventListener('abort', abort)
      worker.terminate()
      if (error) reject(error)
      else resolve(packet)
    }
    const abort = () => finish(sceneFileAbortError())
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => finish(data.error ? Object.assign(new Error(data.error.message), { name: data.error.name }) : null, data.packet)
    worker.onerror = event => { event.preventDefault(); finish(new Error(event.message || 'Scene import worker failed.')) }
    worker.onmessageerror = () => finish(new Error('Unable to receive scene geometry from the worker.'))
    try { worker.postMessage({ buffer, format, name }, [buffer]) } catch (error) { finish(error) }
  })
}
