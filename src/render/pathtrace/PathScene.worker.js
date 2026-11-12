import { SceneBuilder } from './scene.js'

const builder = new SceneBuilder()

// Inputs are structured-cloned, never transferred/detached from the parent's
// geometry cache. Only this worker's newly compiled packed buffer is transferred.
self.onmessage = event => {
  const { id, snapshot } = event.data
  try {
    const { data, sky, stats } = builder.build(snapshot)
    self.postMessage({ id, scene: { data, sky, stats } }, [data])
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) })
  }
}
