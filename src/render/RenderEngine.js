import * as THREE from 'three'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'
import { RenderConfigurationStore, renderConfigurationKey } from './RenderConfiguration'
import RenderResources from './RenderResources'
import { withRenderVisibility } from './RenderVisibility'
import { RasterRenderer } from './RasterRenderer'
import { createRenderSnapshot, renderCameraDescriptor } from './RenderSceneAdapter'

const aborted = () => Object.assign(new Error('Render cancelled because its scene or settings changed.'), { name: 'AbortError' })
const nextFrame = () => new Promise(resolve => setTimeout(resolve, 0))

// Node descriptions are the configuration authority. This module owns only
// rendering resources; document objects, ownership and graph previews stay put.
export default class RenderEngine {
  constructor (renderer, services) {
    this.renderer = renderer
    this.services = services
    this.store = new RenderConfigurationStore()
    this.version = 0
    this.sceneVersion = 0
    this.lastInteraction = 0
    this.disposed = false
    this.pathReady = false
    this.pathStatus = null
    this.pathCopied = -1
    this.raster = null
    this.resources = this.createResources()
    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.NoBlending
    })
    this.copyQuad = new Pass.FullScreenQuad(this.copyMaterial)
  }

  get active () { return !this.disposed && !!this.store.active }
  get configuration () { return this.store.active?.[1] || null }
  get nodeId () { return this.store.active?.[0] || null }

  status (value) {
    if (this.disposed || !this.nodeId) return
    const status = { type: 'pandaui-render-status', nodeId: this.nodeId, ...value }
    if (JSON.stringify(status) === this.lastStatus) return
    this.lastStatus = JSON.stringify(status)
    this.services.onStatus(status)
  }

  createResources () {
    return new RenderResources({ renderer: this.renderer,
      invalidate: ({ objects = [], reason }) => {
        for (const object of objects) this.services.invalidateObject(object)
        if (reason !== 'render-resources-refreshed') { this.sceneVersion++; this.pathReady = false }
        this.services.requestFrame()
      },
      onStatus: result => {
        if (result.state === 'error') this.status({ state: 'error', error: result.issues?.map(issue => issue.message).join('; ') || 'Unable to load rendering resources.' })
      }
    })
  }

  async setConfiguration (nodeId, descriptor) {
    if (this.disposed) throw new Error('Render engine is disposed.')
    const previous = this.nodeId, previousConfig = this.configuration, wasActive = this.active
    const resourceKey = config => renderConfigurationKey(config && { environment: config.environment, lights: config.lights, bindings: config.bindings })
    const traceKey = config => renderConfigurationKey(config && {
      resources: resourceKey(config),
      effects: Object.fromEntries(Object.entries(config.effects).filter(([key]) => key.startsWith('ground') || ['shadows', 'showEdges', 'showCurves'].includes(key)))
    })
    if (!this.store.set(nodeId, descriptor)) return
    const resourcesUnchanged = wasActive && this.active && !this.renderError && resourceKey(previousConfig) === resourceKey(this.configuration)
    const reuseTrace = resourcesUnchanged && this.pathReady && traceKey(previousConfig) === traceKey(this.configuration)
    const version = ++this.version
    this.renderError = null
    if (this.pathStatus?.state === 'fallback') { this.pathTracer?.dispose(); this.pathTracer = null; this.pathStatus = null }
    this.pathPreparation?.abort()
    this.pathReady = reuseTrace
    this.pathFailure = null
    this.pathCopied = -1
    if (!reuseTrace) this.snapshotSignature = null
    if (previous && previous !== this.nodeId) this.services.onStatus({ type: 'pandaui-render-status', nodeId: previous, state: 'inactive', message: 'Another Render Output controls this viewport.' })
    if (!this.active) {
      this.resources.dispose()
      this.resources = this.createResources()
      this.pathTracer?.dispose(); this.pathTracer = null
      this.pathTexture?.dispose(); this.pathTexture = null
      this.pathCanvas = null
      this.raster?.accumulation?.release()
      this.raster?.studioFloor?.releaseTargets()
      this.services.setEnabled(false)
      this.services.onStatus({ type: 'pandaui-render-status', nodeId: String(nodeId), state: 'inactive', message: 'Render Output disabled.' })
      this.services.requestFrame()
      return
    }
    if (!wasActive) this.services.setEnabled(true)
    const config = this.configuration
    const cameraKey = JSON.stringify(config.camera)
    if (config.camera && cameraKey !== this.cameraConfiguration) this.services.setCamera(config.camera)
    this.cameraConfiguration = cameraKey
    this.status({ state: 'loading', message: 'Loading render resources…', backend: 'WebGL' })
    const context = this.services.sceneContext()
    if (!resourcesUnchanged) this.resourceTask = this.resources.apply(config, context)
    const result = await this.resourceTask
    if (this.disposed || version !== this.version) return
    if (!result.applied) {
      this.renderError = result.issues?.map(issue => issue.message).join('; ') || 'Unable to apply render resources.'
      this.status({ state: 'error', error: this.renderError })
      return
    }
    this.resourceIssues = result.issues || []
    this.status({ state: 'ready', backend: 'WebGL', message: this.resourceIssues.map(issue => issue.message).join('; ') || 'Real-time render ready.' })
    this.services.requestFrame()
  }

  clear () {
    const id = this.nodeId || 'render'
    this.store.clear()
    // set(null) must perform teardown even when the store was already cleared.
    this.store.entries.set(id, { enabled: true })
    return this.setConfiguration(id, null)
  }

  invalidate (sceneChanged = true) {
    if (!this.active) return
    if (sceneChanged) { this.sceneVersion++; this.pathReady = false; this.pathFailure = null }
    this.lastInteraction = performance.now()
    this.services.requestFrame()
  }

  async preparePath (scenes, configuration, version, sceneVersion) {
    const controller = new AbortController()
    this.pathPreparation?.abort()
    this.pathPreparation = controller
    try {
      if (!this.pathTracer) {
        const { default: PathTracer } = await import('./pathtrace/index.js')
        if (controller.signal.aborted || this.disposed) throw aborted()
        this.pathTracer = new PathTracer({
          invalidate: () => this.services.requestFrame(),
          onStatus: progress => {
            this.pathStatus = progress
            if (progress.state === 'fallback') {
              this.pathReady = false; this.pathFailure = progress.reason || 'WebGL2 path tracing unavailable.'
              this.services.requestFrame()
            }
          }
        })
      }
      const capability = await this.pathTracer.initialize()
      if (!capability.supported) throw new Error(capability.reason || 'WebGL2 path tracing is unavailable in this browser.')
      const snapshot = await createRenderSnapshot(scenes, configuration, { signal: controller.signal, lightScene: this.resources.lightScene })
      if (controller.signal.aborted || version !== this.version || sceneVersion !== this.sceneVersion) throw aborted()
      // Preparing is already gated by scene/configuration versions. Avoid
      // serializing texture images and huge instance tables a second time.
      await this.pathTracer.setScene(snapshot)
      this.pathCopied = -1
      if (controller.signal.aborted || version !== this.version || sceneVersion !== this.sceneVersion) throw aborted()
      this.pathReady = true
    } catch (error) {
      if (error.name !== 'AbortError' && !controller.signal.aborted && version === this.version && sceneVersion === this.sceneVersion) this.pathFailure = error.message
    } finally {
      if (this.pathPreparation === controller) this.pathPreparation = null
      this.services.requestFrame()
    }
  }

  copyPathImage () {
    if (this.pathCopy || !this.pathTracer || this.pathStatus?.pending || !(this.pathStatus?.samples > 0) || this.pathCopied === this.pathStatus.samples) return
    const version = this.version, sceneVersion = this.sceneVersion, cameraKey = this.pathCameraKey
    const samples = this.pathStatus.samples, tracer = this.pathTracer
    this.pathCopy = tracer.copyToCanvas(this.pathCanvas).then(canvas => {
      if (this.disposed || version !== this.version || sceneVersion !== this.sceneVersion || cameraKey !== this.pathCameraKey || tracer !== this.pathTracer) return
      this.pathCanvas = canvas
      if (!this.pathTexture) { this.pathTexture = new THREE.CanvasTexture(canvas); this.pathTexture.generateMipmaps = false; this.pathTexture.minFilter = THREE.LinearFilter }
      this.pathTexture.image = canvas
      this.pathTexture.needsUpdate = true
      this.pathCopied = samples
    }).catch(error => { if (!this.disposed && version === this.version) this.pathFailure = error.message }).finally(() => { this.pathCopy = null; this.services.requestFrame() })
  }

  withScene (context, draw) {
    const hidden = []
    const remember = object => { if (object?.visible) { hidden.push(object); object.visible = false } }
    // Existing editor lighting remains intact when the node renderer is disabled.
    for (const scene of context.scenes) {
      scene.traverse(object => {
        if (object.isLight || object.userData?.renderShadowGround || object.userData?.selectionHighlight) remember(object)
      })
    }
    const documents = this.services.getDocuments()
    const shadowState = { enabled: this.renderer.shadowMap.enabled, type: this.renderer.shadowMap.type }
    const shadowLights = []
    try {
      documents.forEach(doc => doc.prepareRenderBatches?.(this.sceneVersion))
      this.renderer.shadowMap.enabled = this.configuration.effects.shadows
      // PCFSoft ignores LightShadow.radius in r120; PCF honors the node's radius.
      this.renderer.shadowMap.type = THREE.PCFShadowMap
      if (!this.configuration.effects.shadows) {
        this.resources.lightScene.traverse(light => {
          if (light.isLight && light.castShadow) { shadowLights.push(light); light.castShadow = false }
        })
      }
      return withRenderVisibility(context.scenes, this.configuration.effects, () => draw([...context.scenes, this.resources.lightScene]))
    } finally {
      Object.assign(this.renderer.shadowMap, shadowState)
      shadowLights.forEach(light => { light.castShadow = true })
      documents.forEach(doc => doc.finishRenderBatches?.())
      hidden.forEach(object => { object.visible = true })
    }
  }

  rasterFrame (context, camera, width, height, scale = 1, rasterSamples = 1) {
    if (!this.raster) this.raster = new RasterRenderer(this.renderer)
    return this.withScene(context, scenes => this.raster.render({
      scenes,
      camera,
      width,
      height,
      background: this.resources.background || new THREE.Color('#252a32'),
      environment: this.resources.environment,
      effects: this.configuration.effects,
      bounds: this.resources.bounds,
      quality: { scale, rasterSamples, revision: [this.version, this.sceneVersion, this.renderer.clippingPlanes.map(plane => [...plane.normal.toArray(), plane.constant])], maxDimension: this.renderer.capabilities.maxTextureSize, maxPixels: 16777216 }
    }))
  }

  composite (texture, target = null) {
    if (!texture) return
    const previous = this.renderer.getRenderTarget()
    this.copyMaterial.uniforms.tDiffuse.value = texture
    this.renderer.setRenderTarget(target)
    this.copyQuad.render(this.renderer)
    this.renderer.setRenderTarget(previous)
  }

  render (frame) {
    if (this.renderError) return false
    try { return this.renderFrame(frame) } catch (error) {
      this.renderError = error.message
      this.status({ state: 'error', backend: 'WebGL', error: error.message, message: 'Node rendering stopped; the editing viewport remains available.' })
      return false
    }
  }

  renderFrame ({ camera, width, height, clippingPlanes = [] }) {
    if (!this.active || this.exporting) return false
    const context = this.services.sceneContext(), config = this.configuration
    if (this.refreshedSceneVersion !== this.sceneVersion) {
      this.refreshedSceneVersion = this.sceneVersion
      this.resources.refreshTargets?.(context)
    }
    const moving = performance.now() - this.lastInteraction < 180
    const quality = config.quality
    this.renderer.clippingPlanes = clippingPlanes
    let texture
    if (config.mode === 'pathtrace' && !clippingPlanes.length && !moving && !this.pathFailure) {
      if (!this.pathReady && !this.pathPreparation) this.preparePath(context.scenes, config, this.version, this.sceneVersion)
      if (this.pathReady) {
        try {
          this.pathTracer.configure({ samples: quality.samples, bounces: quality.bounces, resolutionScale: quality.resolutionScale, exposure: config.effects.exposure, denoise: quality.denoise, denoiseStrength: quality.denoiseStrength })
          const descriptor = renderCameraDescriptor(camera), cameraKey = JSON.stringify(descriptor)
          if (cameraKey !== this.pathCameraKey) { this.pathCopied = -1; this.pathCameraKey = cameraKey }
          this.pathTracer.setCamera(descriptor)
          this.copyPathImage()
          if (!this.pathCopy) this.pathStatus = this.pathTracer.step(width, height)
          if (this.pathTexture && this.pathStatus.samples > 0 && this.pathCopied >= 0) texture = this.pathTexture
          if (this.pathStatus.state === 'fallback') throw new Error(this.pathStatus.reason || 'Path tracing stopped.')
          this.status({ ...this.pathStatus, backend: 'WebGL2 · three-gpu-pathtracer', message: quality.denoise ? 'Path tracing · edge-preserving denoising' : 'Path tracing · raw accumulation' })
        } catch (error) { this.pathFailure = error.message; this.pathReady = false }
      }
    }
    if (!texture) {
      const raster = this.rasterFrame(context, camera, width, height, quality.resolutionScale * (moving ? quality.interactionScale : 1), moving ? 1 : quality.rasterSamples)
      texture = raster?.texture
      if (raster?.status && !raster.status.done) this.services.requestFrame()
      if (config.mode === 'raster') this.status({ state: raster?.status.done ? 'ready' : 'rendering', backend: 'WebGL', samples: raster?.status.samples, targetSamples: raster?.status.targetSamples, message: this.resourceIssues?.map(issue => issue.message).join('; ') || (moving ? 'Interactive preview.' : 'Progressive anti-aliasing'), warning: raster?.status.reason })
      if (config.mode === 'pathtrace') {
        const reason = clippingPlanes.length ? 'Clipping uses real-time rendering.' : this.pathFailure
        this.status({ state: reason ? 'fallback' : 'loading', backend: 'WebGL', message: reason || (moving ? 'Interactive preview; path tracing resumes when idle.' : 'Preparing path-tracing scene…') })
      }
    }
    this.composite(texture)
    // A synchronous GPU step can finish the last sample after copyPathImage.
    // Schedule its final copy once, then allow the viewport to become idle.
    if (moving || (config.mode === 'pathtrace' && !this.pathFailure && !clippingPlanes.length && (!this.pathStatus?.done || this.pathCopy || (this.pathReady && this.pathCopied !== this.pathStatus.samples)))) this.services.requestFrame()
    return !!texture
  }

  async exportImage (nodeId, { width = 1920, height = 1080, samples = 128 } = {}) {
    if (String(nodeId) !== this.nodeId) throw new Error('Enable this Render Output before exporting.')
    if (this.exporting) throw new Error('An image export is already running.')
    width = Math.floor(Number(width)); height = Math.floor(Number(height))
    const max = this.renderer.capabilities.maxTextureSize
    if (!(width > 0 && height > 0 && width <= max && height <= max && width * height <= 16777216)) throw new Error(`Export exceeds the GPU image budget (maximum dimension ${max}, 16 megapixels).`)
    const version = this.version
    let sceneVersion
    this.exporting = true
    const check = () => { if (this.disposed || version !== this.version || (sceneVersion != null && sceneVersion !== this.sceneVersion)) throw aborted() }
    try {
      await this.resourceTask
      check()
      if (this.renderError) throw new Error(this.renderError)
      sceneVersion = this.sceneVersion
      if (this.configuration.mode === 'pathtrace' && !this.pathReady && !this.pathFailure && !this.services.getClippingPlanes().length) {
        await this.preparePath(this.services.sceneContext().scenes, this.configuration, version, sceneVersion)
        check()
      }
      const camera = this.services.getCamera().clone()
      if (camera.isPerspectiveCamera) camera.aspect = width / height
      else { const center = (camera.left + camera.right) / 2; const half = (camera.top - camera.bottom) * width / height / 2; camera.left = center - half; camera.right = center + half }
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true)
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      const context = canvas.getContext('2d')
      if (this.configuration.mode === 'pathtrace' && this.pathReady && !this.pathFailure && !this.services.getClippingPlanes().length) {
        this.lastExportBackend = 'WebGL2 · three-gpu-pathtracer'
        const sampleCount = Math.min(65536, Math.max(1, Math.floor(Number(samples) || 128)))
        this.pathTracer.setCamera(renderCameraDescriptor(camera))
        this.pathTracer.configure({ bounces: this.configuration.quality.bounces, resolutionScale: 1, samples: sampleCount, exposure: this.configuration.effects.exposure, denoise: this.configuration.quality.denoise, denoiseStrength: this.configuration.quality.denoiseStrength })
        while (true) {
          check()
          const progress = this.pathTracer.step(width, height)
          if (progress.state === 'fallback') throw new Error(progress.reason)
          this.status({ ...progress, backend: 'WebGL2 · three-gpu-pathtracer', message: 'Exporting image…' })
          if (progress.done) break
          await nextFrame()
        }
        await this.pathTracer.copyToCanvas(canvas)
      } else {
        this.lastExportBackend = 'WebGL'
        let output
        do {
          check()
          output = this.rasterFrame(this.services.sceneContext(), camera, width, height, 1, this.configuration.quality.rasterSamples)
          if (output?.status?.done !== false) break
          await nextFrame()
        } while (true)
        if (!output?.target || output.width !== width || output.height !== height) throw new Error('Requested export dimensions are unavailable on this GPU.')
        const pixels = new Uint8Array(width * height * 4)
        this.renderer.readRenderTargetPixels(output.target, 0, 0, width, height, pixels)
        const image = context.createImageData(width, height), stride = width * 4
        for (let y = 0; y < height; y++) image.data.set(pixels.subarray(y * stride, (y + 1) * stride), (height - y - 1) * stride)
        context.putImageData(image, 0, 0)
      }
      check()
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
      check()
      if (!blob) throw new Error('The browser could not encode this image.')
      return blob
    } finally { this.exporting = false; this.pathCopied = -1; this.services.requestFrame() }
  }

  dispose () {
    if (this.disposed) return
    this.disposed = true; this.version++
    this.pathPreparation?.abort()
    this.pathTracer?.dispose(); this.pathTexture?.dispose()
    this.resources.dispose(); this.raster?.dispose()
    this.copyMaterial.dispose(); this.copyQuad.dispose()
    this.store.clear()
  }
}
