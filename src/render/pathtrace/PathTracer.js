// A separate modern Three.js runtime prevents interference with the r120 editor.
let runtimeTask
function loadRuntime () {
  if (window.PandaPathTracerRuntime) return Promise.resolve(window.PandaPathTracerRuntime)
  if (!runtimeTask) {
    runtimeTask = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = '/shared/pathtracer/runtime.js?v=20261118-1'
      script.async = true
      script.onload = () => {
        if (window.PandaPathTracerRuntime?.PathTracer) resolve(window.PandaPathTracerRuntime)
        else { script.remove(); reject(new Error('Path-tracing runtime did not initialize.')) }
      }
      script.onerror = () => { script.remove(); reject(new Error('Unable to load the local path-tracing runtime.')) }
      document.head.appendChild(script)
    }).catch(error => { runtimeTask = null; throw error })
  }
  return runtimeTask
}

export class PathTracer {
  constructor (options = {}) { this.options = options; this.impl = null; this.disposed = false }
  get canvas () { return this.impl?.canvas || null }
  get progress () { return this.impl?.progress || { state: 'uninitialized', supported: false, samples: 0, done: false } }
  async initialize () {
    if (this.disposed) throw new Error('Path tracer is disposed.')
    if (!this.initializing) {
      this.initializing = loadRuntime().then(async runtime => {
        if (this.disposed) throw new Error('Path tracer is disposed.')
        this.impl = new runtime.PathTracer(this.options)
        return this.impl.initialize()
      })
    }
    return this.initializing
  }
  async setScene (snapshot) {
    await this.initialize()
    const result = await this.impl.setScene(snapshot)
    if (result?.supported === false) throw new Error(result.reason || 'Path-tracing scene preparation failed.')
    return result
  }
  configure (settings) { return this.impl.configure(settings) }
  setCamera (camera) { return this.impl.setCamera(camera) }
  step (width, height) { return this.impl.step(width, height) }
  async copyToCanvas (target) {
    const canvas = await this.impl.copyToCanvas(target || undefined)
    if (!canvas) throw new Error(this.impl?.progress.reason || 'No completed path-tracing image is available.')
    return canvas
  }
  dispose () { this.disposed = true; const done = this.impl?.dispose(); this.impl = null; return done }
}
export default PathTracer
