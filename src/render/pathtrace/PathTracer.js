/* global GPUBufferUsage, GPUTextureUsage */
import { buildScene, finiteArray, scalar, sub, cross, unit } from './scene.js'
import { COMPUTE_SHADER, PRESENT_SHADER } from './shaders.js'

const DEFAULTS = Object.freeze({ samples: 128, bounces: 4, resolutionScale: 1, exposure: 1, seed: 1, rayEpsilon: 0.0001 })
export function normalizeCamera (input = {}) {
  const position = finiteArray(input.position === undefined ? [0, 0, 3] : input.position, 3, 'camera.position')
  const target = finiteArray(input.target === undefined ? [0, 0, 0] : input.target, 3, 'camera.target')
  const forward = unit(sub(target, position))
  const right = unit(cross(forward, finiteArray(input.up === undefined ? [0, 1, 0] : input.up, 3, 'camera.up')))
  const up = unit(cross(right, forward)); const type = input.type || 'perspective'
  if (!['perspective', 'orthographic'].includes(type)) throw new Error(`Unsupported camera type: ${type}`)
  const near = scalar(input.near, 0.001, 0, 1e30, 'near'); const far = scalar(input.far, 1e30, Number.MIN_VALUE, 1e30, 'far')
  if (far <= near) throw new Error('Camera far must exceed near')
  const result = { position, forward, right, up, type, near, far }
  if (type === 'perspective') {
    result.fov = scalar(input.fov, 45, 0.01, 179, 'fov')
    result.aspect = input.aspect === undefined ? null : scalar(input.aspect, 1, 1e-8, 1e8, 'aspect')
  } else {
    for (const key of ['left', 'right', 'bottom', 'top']) result[`ortho${key}`] = scalar(input[key], (key === 'left' || key === 'bottom') ? -1 : 1, -1e30, 1e30, key)
    if (result.orthoright <= result.ortholeft || result.orthotop <= result.orthobottom) throw new Error('Orthographic bounds must have positive extent')
  }
  return result
}
export function validateSettings (settings, previous = DEFAULTS) {
  const next = { ...previous }
  for (const key of Object.keys(settings)) {
    if (!(key in DEFAULTS)) throw new Error(`Unknown path tracer setting: ${key}`)
    next[key] = settings[key]
  }
  scalar(next.samples, 128, 1, 16777216, 'samples'); scalar(next.bounces, 4, 1, 32, 'bounces')
  scalar(next.resolutionScale, 1, 1e-8, 2, 'resolutionScale'); scalar(next.exposure, 1, 1e-8, 1e30, 'exposure')
  scalar(next.rayEpsilon, 0.0001, 1e-12, 1e10, 'rayEpsilon'); scalar(next.seed, 1, 0, 0xffffffff, 'seed')
  for (const key of ['samples', 'bounces', 'seed']) if (!Number.isInteger(next[key])) throw new Error(`${key} must be an integer`)
  return next
}
export function validateBufferSize (bytes, limits, label = 'Buffer') {
  if (!Number.isSafeInteger(bytes) || bytes < 4 || bytes % 4 || bytes > limits.maxBufferSize || bytes > limits.maxStorageBufferBindingSize) throw new Error(`${label} requires ${bytes} bytes; device maxBufferSize=${limits.maxBufferSize}, maxStorageBufferBindingSize=${limits.maxStorageBufferBindingSize}`)
}
export function validateDimensions (width, height, scale, limits) {
  if (![width, height].every(x => Number.isFinite(x) && x > 0)) throw new Error('Render dimensions must be positive finite numbers')
  const w = Math.max(1, Math.floor(width * scale)); const h = Math.max(1, Math.floor(height * scale))
  if (!Number.isSafeInteger(w * h) || w * h > 0xffffffff || w > limits.maxTextureDimension2D || h > limits.maxTextureDimension2D || Math.ceil(w / 8) > limits.maxComputeWorkgroupsPerDimension || Math.ceil(h / 8) > limits.maxComputeWorkgroupsPerDimension) throw new Error(`Output ${w}x${h} exceeds device texture/dispatch/addressing limits`)
  validateBufferSize(w * h * 16, limits, 'Accumulation')
  return [w, h]
}

export class PathTracer {
  constructor ({ onStatus = () => {}, invalidate = () => {} } = {}) {
    this.onStatus = onStatus; this.invalidate = invalidate
    this._canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    // A swapchain canvas is transient after browser presentation. Keep the public
    // CanvasTexture source persistent using a GPU-backed 2D canvas copy.
    this._gpuCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
    this._copyContext = this._canvas ? this._canvas.getContext('2d') : null
    this._settings = { ...DEFAULTS }; this._camera = normalizeCamera()
    this._state = 'uninitialized'; this._reason = ''; this._samples = 0; this._epoch = 0
    this._width = 0; this._height = 0; this._disposed = false; this._pending = null
    this._submitting = false
    this._device = null; this._initializing = null; this._scene = null; this._uploadedScene = null
    this._sceneQueue = Promise.resolve(); this._sceneVersion = 0; this._sceneBuffer = null
    this._worker = null; this._workerJobs = new Map(); this._building = false
    this._accumulation = null; this._output = null; this._uniform = null; this._context = null
    this._compute = null; this._present = null; this._computeGroup = null; this._presentGroup = null
  }
  get canvas () { return this._canvas }
  get progress () {
    const supported = !!this._device && !['fallback', 'disposed', 'initializing'].includes(this._state)
    return { state: this._state, supported, samples: this._samples, targetSamples: this._settings.samples, progress: this._samples / this._settings.samples, done: supported && this._samples >= this._settings.samples, pending: !!this._pending, building: this._building, width: this._width, height: this._height, ...(this._reason ? { reason: this._reason } : {}) }
  }
  _emit () { this.onStatus(this.progress) }
  _assertAlive () { if (this._disposed) throw new Error('PathTracer is disposed') }
  static async detectSupport () {
    if (typeof navigator === 'undefined' || !navigator.gpu) return { supported: false, reason: 'WebGPU unavailable; requires a supported browser and secure context' }
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      return adapter ? { supported: true, adapterInfo: adapter.info || null } : { supported: false, reason: 'No WebGPU adapter available' }
    } catch (error) { return { supported: false, reason: error.message } }
  }
  async initialize () {
    if (this._disposed) return { supported: false, reason: 'PathTracer is disposed' }
    if (this._initializing && this._state === 'fallback' && !this._device) return { supported: false, reason: this._reason }
    if (this._initializing) return this._initializing
    this._initializing = this._initialize()
    return this._initializing
  }
  async _initialize () {
    this._state = 'initializing'; this._emit()
    try {
      if (!this._canvas || typeof navigator === 'undefined' || !navigator.gpu) throw new Error('WebGPU unavailable; requires a supported browser and secure context')
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) throw new Error('No WebGPU adapter available')
      this._assertAlive()
      const limits = adapter.limits
      if (limits.maxStorageBuffersPerShaderStage < 2 || limits.maxStorageTexturesPerShaderStage < 1 || limits.maxComputeInvocationsPerWorkgroup < 64 || limits.maxComputeWorkgroupSizeX < 8 || limits.maxComputeWorkgroupSizeY < 8) throw new Error('WebGPU adapter lacks required compute binding/workgroup limits')
      const device = await adapter.requestDevice({ requiredLimits: { maxBufferSize: limits.maxBufferSize, maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize } })
      if (this._disposed) { device.destroy(); throw new Error('PathTracer is disposed') }
      this._device = device
      device.lost.then(info => { if (!this._disposed && this._device === device) this._fail(new Error(`WebGPU device lost (${info.reason}): ${info.message || 'unknown reason'}`), true) })
      device.addEventListener('uncapturederror', event => { if (this._device === device && !this._disposed) this._fail(event.error, true) })
      this._context = this._gpuCanvas.getContext('webgpu')
      if (!this._context) throw new Error('Cannot create WebGPU canvas context')
      if (!this._copyContext) throw new Error('Cannot create persistent canvas copy context')
      this._format = navigator.gpu.getPreferredCanvasFormat()
      this._context.configure({ device, format: this._format, alphaMode: 'opaque' })
      const computeModule = device.createShaderModule({ label: 'Path tracer WGSL', code: COMPUTE_SHADER })
      const presentModule = device.createShaderModule({ label: 'Path tracer presentation', code: PRESENT_SHADER })
      for (const module of [computeModule, presentModule]) {
        const info = await module.getCompilationInfo()
        const errors = info.messages.filter(m => m.type === 'error')
        if (errors.length) throw new Error(errors.map(m => `WGSL ${m.lineNum}:${m.linePos}: ${m.message}`).join('\n'))
      }
      this._assertAlive()
      await this._checked(() => {
        this._compute = device.createComputePipeline({ label: 'Path tracer compute', layout: 'auto', compute: { module: computeModule, entryPoint: 'main' } })
        this._present = device.createRenderPipeline({ label: 'Path tracer present', layout: 'auto', vertex: { module: presentModule, entryPoint: 'vertexMain' }, fragment: { module: presentModule, entryPoint: 'fragmentMain', targets: [{ format: this._format }] }, primitive: { topology: 'triangle-list' } })
        this._uniform = device.createBuffer({ label: 'Path tracer camera', size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
      })
      if (!this._scene) this._scene = this._compact(buildScene())
      await this._uploadScene(this._scene)
      this._assertAlive()
      if (this._device !== device) throw new Error('WebGPU device lost during initialization')
      this._state = 'ready'; this._reason = ''; this.reset()
      return { supported: true, adapterInfo: adapter.info || null }
    } catch (error) {
      if (!this._disposed) this._fail(error, true)
      return { supported: false, reason: error.message }
    }
  }
  // Push/pop scopes synchronously: concurrent async scene/export calls cannot cross scopes.
  _checked (operation) {
    const device = this._device
    if (!device) return Promise.reject(new Error('WebGPU device unavailable'))
    device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation'); device.pushErrorScope('internal')
    let result; let exception
    try { result = operation() } catch (error) { exception = error }
    const scopes = [device.popErrorScope(), device.popErrorScope(), device.popErrorScope()]
    return Promise.all(scopes).then(errors => {
      if (exception) throw exception
      const failure = errors.find(Boolean)
      if (failure) throw new Error(failure.message)
      return result
    })
  }
  _compact (scene) { return { data: scene.data, sky: scene.sky, stats: scene.stats } }
  _stopWorker (reason) {
    if (this._worker) this._worker.terminate()
    this._worker = null
    for (const job of this._workerJobs.values()) job.reject(new Error(reason))
    this._workerJobs.clear(); this._building = false
  }
  _buildScene (snapshot, id) {
    // CPU-only environments can run validation without a browser Worker.
    if (typeof document === 'undefined') return Promise.resolve(this._compact(buildScene(snapshot)))
    if (typeof Worker === 'undefined') return Promise.reject(new Error('Scene construction requires a module Worker'))
    if (!this._worker) {
      this._worker = new Worker(new URL('./PathScene.worker.js', import.meta.url), { type: 'module', name: 'Path tracer BVH builder' })
      this._worker.onmessage = event => {
        const job = this._workerJobs.get(event.data.id)
        if (!job) return
        this._workerJobs.delete(event.data.id)
        if (event.data.error) job.reject(new Error(event.data.error))
        else job.resolve(event.data.scene)
      }
      this._worker.onerror = event => this._stopWorker(`Path tracer scene Worker failed: ${event.message || 'module load error'}`)
      this._worker.onmessageerror = () => this._stopWorker('Path tracer scene Worker message could not be decoded')
    }
    return new Promise((resolve, reject) => {
      this._workerJobs.set(id, { resolve, reject })
      try { this._worker.postMessage({ id, snapshot }) } catch (error) { this._workerJobs.delete(id); reject(error) }
    })
  }
  async setScene (snapshot) {
    this._assertAlive()
    const version = ++this._sceneVersion
    this._building = true; this.reset()
    let scene
    try { scene = await this._buildScene(snapshot, version) } catch (error) {
      if (version !== this._sceneVersion) return { superseded: true }
      this._building = false
      if (!this._disposed) this._fail(error, false)
      throw error
    }
    this._assertAlive()
    if (version !== this._sceneVersion) return { superseded: true }
    this._building = false
    this._scene = scene; this.reset()
    const job = this._sceneQueue.catch(() => {}).then(async () => {
      if (this._initializing) await this._initializing
      this._assertAlive()
      if (version !== this._sceneVersion) return { superseded: true }
      if (this._device && this._uploadedScene !== scene) {
        if (this._pending) await this._pending
        if (version !== this._sceneVersion) return { superseded: true }
        await this._uploadScene(scene)
      }
      if (version !== this._sceneVersion) return { superseded: true }
      if (this._device) { this._state = 'ready'; this._reason = ''; this.reset() }
      return scene.stats
    })
    this._sceneQueue = job
    try { return await job } catch (error) {
      if (version !== this._sceneVersion) return { superseded: true }
      if (!this._disposed) this._fail(error, false)
      throw error
    }
  }
  async _uploadScene (scene) {
    const device = this._device
    validateBufferSize(scene.data.byteLength, device.limits, 'Scene')
    let buffer
    try {
      await this._checked(() => {
        buffer = device.createBuffer({ label: 'Path tracer BLAS/TLAS scene', size: scene.data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
        device.queue.writeBuffer(buffer, 0, scene.data)
      })
      if (this._disposed || this._device !== device) throw new Error('Path tracer device no longer available')
      if (this._sceneBuffer) this._sceneBuffer.destroy()
      this._sceneBuffer = buffer; this._uploadedScene = scene; this._computeGroup = null
    } catch (error) { if (buffer) buffer.destroy(); throw error }
  }
  setCamera (descriptor) {
    this._assertAlive()
    const next = normalizeCamera(descriptor)
    if (JSON.stringify(next) !== JSON.stringify(this._camera)) { this._camera = next; this.reset() }
  }
  configure (options = {}) {
    this._assertAlive()
    const next = validateSettings(options, this._settings)
    if (JSON.stringify(next) !== JSON.stringify(this._settings)) { this._settings = next; this.reset() }
    return { ...this._settings }
  }
  reset () {
    if (this._disposed) return
    this._epoch++; this._samples = 0
    if (this._state === 'complete' || this._state === 'rendering') this._state = 'ready'
    this._emit(); this.invalidate()
  }
  _resize (width, height) {
    const device = this._device
    if (this._accumulation) this._accumulation.destroy()
    if (this._output) this._output.destroy()
    this._width = width; this._height = height; this._canvas.width = width; this._canvas.height = height
    this._gpuCanvas.width = width; this._gpuCanvas.height = height
    this._accumulation = device.createBuffer({ label: 'Path tracer mean radiance', size: width * height * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
    this._output = device.createTexture({ label: 'Path tracer retained image', size: [width, height], format: 'rgba8unorm', usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC })
    this._computeGroup = null
    this._presentGroup = device.createBindGroup({ layout: this._present.getBindGroupLayout(0), entries: [{ binding: 0, resource: this._output.createView() }] })
    this.reset()
  }
  _parameters () {
    const data = new ArrayBuffer(160); const u = new Uint32Array(data); const f = new Float32Array(data)
    const c = this._camera; const s = this._settings; const sky = this._uploadedScene.sky
    u.set([this._width, this._height, this._samples, s.bounces])
    f.set([...c.position, c.type === 'orthographic' ? 1 : 0], 4)
    f.set([...c.forward, Math.tan((c.fov || 45) * Math.PI / 360)], 8)
    f.set([...c.right, c.aspect || this._width / this._height], 12)
    f.set([...c.up, s.exposure], 16); f.set([c.near, c.far, s.rayEpsilon], 20); u[23] = s.seed
    if (c.type === 'orthographic') f.set([c.ortholeft, c.orthoright, c.orthobottom, c.orthotop], 24)
    f.set([...sky.top, sky.intensity], 28); f.set(sky.bottom, 32)
    f.set(sky.up, 36)
    return data
  }
  _draw (encoder) {
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this._context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] })
    pass.setPipeline(this._present); pass.setBindGroup(0, this._presentGroup); pass.draw(3); pass.end()
  }
  step (width, height) {
    this._assertAlive()
    if (!this._device || ['fallback', 'initializing'].includes(this._state) || this._pending || this._submitting || this._building || this._scene !== this._uploadedScene) return this.progress
    let dimensions
    try { dimensions = validateDimensions(width, height, this._settings.resolutionScale, this._device.limits) } catch (error) { this._fail(error, false); return this.progress }
    const resized = dimensions[0] !== this._width || dimensions[1] !== this._height
    if (!resized && this._samples >= this._settings.samples) return this.progress
    const device = this._device
    this._submitting = true
    // Scopes are popped before returning; GPU errors surface through the pending completion.
    const validation = this._checked(() => {
      if (resized) this._resize(...dimensions)
      if (!this._computeGroup) {
        this._computeGroup = device.createBindGroup({ layout: this._compute.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this._uniform } },
            { binding: 1, resource: { buffer: this._sceneBuffer } },
            { binding: 2, resource: { buffer: this._accumulation } },
            { binding: 3, resource: this._output.createView() }
          ] })
      }
      device.queue.writeBuffer(this._uniform, 0, this._parameters())
      const encoder = device.createCommandEncoder({ label: 'Progressive path sample' })
      const pass = encoder.beginComputePass(); pass.setPipeline(this._compute); pass.setBindGroup(0, this._computeGroup)
      pass.dispatchWorkgroups(Math.ceil(this._width / 8), Math.ceil(this._height / 8)); pass.end()
      this._draw(encoder); device.queue.submit([encoder.finish()])
      // Copy before browser presentation, without CPU pixel readback.
      this._copyContext.drawImage(this._gpuCanvas, 0, 0)
    })
    const epoch = this._epoch
    this._state = 'rendering'
    this._pending = Promise.all([validation, device.queue.onSubmittedWorkDone()]).then(() => {
      if (this._disposed || this._device !== device) return
      if (epoch === this._epoch) {
        this._samples++; this._state = this._samples >= this._settings.samples ? 'complete' : 'ready'
      }
    }).catch(error => { if (!this._disposed && this._device === device) this._fail(error, true) }).finally(() => {
      this._pending = null
      if (!this._disposed) { this._emit(); this.invalidate() }
    })
    this._submitting = false
    return this.progress
  }
  render (width, height) { return this.step(width, height) }
  async copyToCanvas (target) {
    this._assertAlive()
    if (this._pending) await this._pending
    if (!this._device || !this._output || !this._samples || this._state === 'fallback') throw new Error('No completed path tracer image to export')
    const destination = target || document.createElement('canvas')
    if (destination === this._canvas) return destination
    const context = destination.getContext('2d')
    if (!context) throw new Error('Export target must be a 2D canvas')
    destination.width = this._width; destination.height = this._height
    context.drawImage(this._canvas, 0, 0)
    return destination
  }
  _release () {
    this._stopWorker('Path tracer resources released')
    for (const key of ['_sceneBuffer', '_accumulation', '_output', '_uniform']) { if (this[key]) this[key].destroy(); this[key] = null }
    if (this._context) { this._context.unconfigure(); this._context = null }
    const device = this._device; this._device = null
    if (device) device.destroy()
    for (const canvas of [this._canvas, this._gpuCanvas]) if (canvas) { canvas.width = 1; canvas.height = 1 }
    this._width = 0; this._height = 0
    this._compute = null; this._present = null; this._computeGroup = null; this._presentGroup = null; this._uploadedScene = null
  }
  _fail (error, release) {
    this._epoch++; this._samples = 0; this._state = 'fallback'; this._reason = error.message || String(error)
    if (release) this._release()
    this._emit(); this.invalidate()
  }
  dispose () {
    if (this._disposed) return
    this._disposed = true; this._epoch++; this._sceneVersion++; this._release(); this._scene = null
    this._state = 'disposed'; this._samples = 0; this._emit()
  }
}

export default PathTracer
