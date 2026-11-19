import {
  Color, CustomBlending, HalfFloatType, LinearFilter, NoBlending, NoToneMapping, OneFactor, ZeroFactor,
  PerspectiveCamera, RGBAFormat, Scene, Vector2, Vector3, Vector4,
  WebGLRenderTarget, sRGBEncoding, GammaEncoding
} from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'
import { RasterSSAOPass } from './RasterSSAOPass.js'
import MaterialRefractionPass, { filterTransmissionShadows } from './MaterialRefractionPass'
import RasterAccumulationPass from './RasterAccumulationPass'
import StudioFloor from './StudioFloor'

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const amount = (value, fallback) => clamp(finite(typeof value === 'object' && value ? value.strength : value, fallback), 0, 10)

export function rasterResolution (width, height, quality, gpuMax) {
  const settings = quality && typeof quality === 'object' ? quality : {}
  const preset = { low: 0.5, medium: 0.75, high: 1, ultra: 1 }
  const scale = clamp(finite(settings.scale, typeof quality === 'number' ? quality : (preset[quality] || 1)), 0.1, 2)
  const maxDimension = Math.max(1, Math.min(gpuMax, finite(settings.maxDimension, 4096)))
  const maxPixels = clamp(finite(settings.maxPixels, 4194304), 1, 16777216)
  const w = Math.max(1, finite(width, 1)) * scale
  const h = Math.max(1, finite(height, 1)) * scale
  const fit = Math.min(1, maxDimension / w, maxDimension / h, Math.sqrt(maxPixels / (w * h)))
  return { width: Math.max(1, Math.floor(w * fit)), height: Math.max(1, Math.floor(h * fit)) }
}

function shaderPass (shader) {
  const pass = new ShaderPass(shader)
  pass.material.toneMapped = false
  pass.material.depthTest = false
  pass.material.depthWrite = false
  pass.material.blending = NoBlending
  return pass
}

export function saveState (renderer) {
  return {
    target: renderer.getRenderTarget(),
    // PandaUI's r120 build exposes these to support nested scene/environment
    // rendering. Postprocessing clears both pointers after each internal draw.
    renderList: renderer.getRenderList ? renderer.getRenderList() : undefined,
    renderState: renderer.getRenderState ? renderer.getRenderState() : undefined,
    face: renderer.getActiveCubeFace(),
    mip: renderer.getActiveMipmapLevel(),
    viewport: renderer.getViewport(new Vector4()),
    scissor: renderer.getScissor(new Vector4()),
    scissorTest: renderer.getScissorTest(),
    clearColor: renderer.getClearColor().clone(),
    clearAlpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    autoClearColor: renderer.autoClearColor,
    autoClearDepth: renderer.autoClearDepth,
    autoClearStencil: renderer.autoClearStencil,
    clippingPlanes: renderer.clippingPlanes,
    localClippingEnabled: renderer.localClippingEnabled,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    outputEncoding: renderer.outputEncoding,
    sortObjects: renderer.sortObjects
  }
}

export function restoreState (renderer, state) {
  const { target, renderList, renderState, face, mip, viewport, scissor, scissorTest, clearColor, clearAlpha, ...properties } = state
  Object.assign(renderer, properties)
  renderer.setClearColor(clearColor, clearAlpha)
  // Restore the default framebuffer rectangles first. Binding a saved target
  // then restores its own rectangles, which need not match the defaults.
  renderer.setViewport(viewport)
  renderer.setScissor(scissor)
  renderer.setScissorTest(scissorTest)
  renderer.setRenderTarget(target, face, mip)
  if (renderer.setRenderList) renderer.setRenderList(renderList)
  if (renderer.setRenderState) renderer.setRenderState(renderState)
}

/**
 * Owns only render targets/passes, never the supplied renderer or scene assets.
 * render({ scenes, camera, width, height, background, environment,
 *   effects: { exposure = 1, ao = 0, bloom = 0 }, quality })
 * returns { texture, target, width, height, status }. Dimensions are physical
 * pixels; the caller applies DPR once. Output is ACES-tonemapped once and
 * encoded for renderer.outputEncoding. Copy it without further tone mapping.
 * Targets are reused: an output remains valid only until the next render or
 * dispose. Unsupported/context-lost results have null texture and target.
 * quality: low/medium/high/ultra, numeric scale, or
 * { scale, maxDimension, maxPixels, fxaa:false }. AO/bloom accept a number or
 * { strength, radius, minDistance, maxDistance } / { strength, radius, threshold }.
 */
export class RasterRenderer {
  constructor (renderer) {
    // r120 does not yet expose the isWebGLRenderer flag.
    if (!renderer || typeof renderer.getContext !== 'function' || !renderer.capabilities || typeof renderer.render !== 'function') throw new TypeError('RasterRenderer requires an existing THREE.WebGLRenderer')
    this.renderer = renderer
    this.scene = new Scene()
    this.scene.autoUpdate = false
    this.disposed = false
    this.refraction = new MaterialRefractionPass()
    this.studioFloor = new StudioFloor()
    this.output = null
    this.status = { supported: true, degraded: false, reason: null }
    const gl = renderer.getContext()
    if (!gl || gl.isContextLost()) {
      this.aoSupported = this.hdrSupported = false
      this.maxDimension = 0
      this.status = { supported: false, degraded: false, reason: 'WebGL context unavailable', capabilities: { ao: false, hdr: false, maxDimension: 0 } }
      return
    }
    const webgl2 = renderer.capabilities.isWebGL2
    const has = name => !!renderer.extensions.get(name)
    this.aoSupported = webgl2 || (has('WEBGL_depth_texture') && has('OES_texture_float'))
    this.hdrSupported = webgl2 ? has('EXT_color_buffer_float')
      : (has('OES_texture_half_float') && has('OES_texture_half_float_linear') && has('EXT_color_buffer_half_float'))
    this.maxDimension = Math.min(renderer.capabilities.maxTextureSize, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), ...gl.getParameter(gl.MAX_VIEWPORT_DIMS))
    this.status.capabilities = { ao: this.aoSupported, hdr: this.hdrSupported, maxDimension: this.maxDimension }
    if (!this.maxDimension) {
      this.status = { ...this.status, supported: false, reason: 'WebGL context unavailable' }
      return
    }
    const target = new WebGLRenderTarget(1, 1, { minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat })
    if (this.hdrSupported) target.texture.type = HalfFloatType
    target.texture.name = 'Raster.linear'
    this.composer = new EffectComposer(renderer, target)
    this.composer.renderToScreen = false
    const camera = new PerspectiveCamera()
    this.beautyPass = new RenderPass(this.scene, camera)
    this.composer.addPass(this.beautyPass)
    if (this.aoSupported) {
      this.aoPass = new RasterSSAOPass(this.scene, camera)
      this.aoPass.beautyRenderTarget.texture.type = target.texture.type
      this.composer.addPass(this.aoPass)
    }
    this.accumulation = new RasterAccumulationPass(target.texture.type)
    this.composer.addPass(this.accumulation)
    this.bloomPass = new UnrealBloomPass(new Vector2(1, 1), 0, 0.4, 0.85)
    for (const buffer of [this.bloomPass.renderTargetBright, ...this.bloomPass.renderTargetsHorizontal, ...this.bloomPass.renderTargetsVertical]) {
      buffer.texture.type = target.texture.type
      buffer.depthBuffer = false
    }
    for (const material of [this.bloomPass.materialHighPassFilter, ...this.bloomPass.separableBlurMaterials, this.bloomPass.compositeMaterial, this.bloomPass.materialCopy, this.bloomPass.basic]) material.toneMapped = false
    this.bloomPass.materialCopy.blending = CustomBlending
    this.bloomPass.materialCopy.blendSrc = this.bloomPass.materialCopy.blendDst = OneFactor
    this.bloomPass.materialCopy.blendSrcAlpha = ZeroFactor
    this.bloomPass.materialCopy.blendDstAlpha = OneFactor
    this.composer.addPass(this.bloomPass)
    this.outputPass = shaderPass({
      uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, rasterEncoding: { value: 0 }, rasterGamma: { value: 2 } },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform int rasterEncoding;
        uniform float rasterGamma;
        varying vec2 vUv;
        #include <tonemapping_pars_fragment>
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          color.rgb = ACESFilmicToneMapping(color.rgb);
          if (rasterEncoding == 1) color = LinearTosRGB(color);
          if (rasterEncoding == 2) color = LinearToGamma(color, rasterGamma);
          gl_FragColor = color;
        }`
    })
    this.composer.addPass(this.outputPass)
    this.fxaaPass = shaderPass(FXAAShader)
    this.composer.addPass(this.fxaaPass)
    this.copyPass = shaderPass(CopyShader)
    this.outputTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false, minFilter: LinearFilter, magFilter: LinearFilter, format: RGBAFormat })
    this.outputTarget.texture.name = 'Raster.output'
    this.width = this.height = 0
  }

  render ({ scenes = [], camera, width = 1, height = 1, background, environment, bounds, effects = {}, quality = 'high' } = {}) {
    if (this.disposed) throw new Error('RasterRenderer has been disposed')
    if (!camera || !camera.isCamera) throw new TypeError('RasterRenderer.render requires a camera')
    if (!this.composer || this.renderer.getContext().isContextLost()) {
      this.status = { ...this.status, supported: false, reason: 'WebGL context unavailable' }
      return { texture: null, target: null, width: 0, height: 0, status: this.status }
    }
    const renderer = this.renderer
    const state = saveState(renderer)
    const restoreGlassShadows = filterTransmissionShadows(renderer)
    const shadowState = { autoUpdate: renderer.shadowMap.autoUpdate, needsUpdate: renderer.shadowMap.needsUpdate }
    const projection = camera.projectionMatrix.clone(), projectionInverse = camera.projectionMatrixInverse.clone()
    try {
      this.scene.children.length = 0
      const roots = [...new Set(scenes.filter(Boolean))]
      // Borrow root references directly, retaining their original parent/world
      // transforms, visibility and child ordering. Never call proxy.add().
      for (const root of roots) {
        if (roots.some(other => { for (let p = root.parent; p; p = p.parent) if (p === other) return true; return false })) continue
        root.updateWorldMatrix(true, true)
        this.scene.children.push(root)
      }
      camera.updateWorldMatrix(true, false)
      this.scene.background = background === undefined ? ((roots[0] && roots[0].background) || null) : background
      if (this.scene.background !== null && !this.scene.background.isColor && !this.scene.background.isTexture) this.scene.background = new Color(this.scene.background)
      this.scene.environment = environment === undefined ? ((roots[0] && roots[0].environment) || null) : environment
      const size = rasterResolution(width, height, quality, this.maxDimension)
      if (size.width !== this.width || size.height !== this.height) {
        this.width = size.width
        this.height = size.height
        this.composer.setSize(this.width, this.height)
        this.outputTarget.setSize(this.width, this.height)
        this.fxaaPass.uniforms.resolution.value.set(1 / this.width, 1 / this.height)
      }
      const requestedSamples = Math.round(clamp(finite(quality?.rasterSamples, 1), 1, 32))
      const key = JSON.stringify([quality?.revision, this.width, this.height, camera.matrixWorld.elements, projection.elements, effects, state.outputEncoding, renderer.gammaFactor])
      const reflectionCamera = camera.clone()
      this.accumulation.configure(key, requestedSamples)
      if (requestedSamples > 1 && this.accumulation.samples >= requestedSamples) return this.output
      const shadowKey = quality?.revision == null ? null : JSON.stringify([quality.revision, effects.shadows, renderer.shadowMap.type])
      renderer.shadowMap.autoUpdate = false
      renderer.shadowMap.needsUpdate = shadowKey === null || this.shadowKey !== shadowKey
      const floor = this.studioFloor.configure(effects, bounds)
      // Clear transient optical bindings before the floor mirror pass. This
      // keeps a previous frame's scene reflection from being captured again.
      this.refraction.finish()
      if (floor) {
        const reflectionState = saveState(renderer)
        try {
          renderer.toneMapping = NoToneMapping; renderer.toneMappingExposure = 1
          renderer.autoClear = true; renderer.setScissorTest(false)
          this.studioFloor.prepare(renderer, this.scene, camera, effects, quality?.revision == null ? null : key, this.composer.renderTarget1.texture.type)
        } finally { restoreState(renderer, reflectionState) }
        this.scene.children.push(this.studioFloor.mesh)
      }
      if (requestedSamples > 1) {
        // A paired Halton sequence has zero-mean jitter even with a short budget.
        const halton = (i, base) => { let value = 0, fraction = 1; while (i > 0) { fraction /= base; value += fraction * (i % base); i = Math.floor(i / base) } return value }
        const i = this.accumulation.samples, pair = Math.floor(i / 2) + 1, sign = i % 2 ? -1 : 1
        const dx = 2 * sign * (halton(pair, 2) - 0.5) / this.width
        const dy = 2 * sign * (halton(pair, 3) - 0.5) / this.height
        const matrix = camera.projectionMatrix.elements
        for (let column = 0; column < 4; column++) { matrix[column * 4] += dx * matrix[column * 4 + 3]; matrix[column * 4 + 1] += dy * matrix[column * 4 + 3] }
        camera.projectionMatrixInverse.getInverse(camera.projectionMatrix)
      }
      const ao = amount(effects.ao, 0)
      const bloom = amount(effects.bloom, 0)
      this.beautyPass.camera = camera
      this.beautyPass.enabled = !(ao > 0 && this.aoSupported)
      if (this.aoPass) {
        this.aoPass.enabled = ao > 0 && this.aoSupported
        this.aoPass.configure(camera, ao)
        const options = typeof effects.ao === 'object' && effects.ao ? effects.ao : {}
        this.aoPass.kernelRadius = Math.max(0.001, finite(options.radius, bounds ? Math.max(0.001, bounds.getSize(new Vector3()).length() * finite(effects.aoRadius, 0.02)) : 8))
        this.aoPass.minDistance = Math.max(0, finite(options.minDistance, bounds ? this.aoPass.kernelRadius * 0.01 / (camera.far - camera.near) : 0.0001))
        this.aoPass.maxDistance = Math.max(this.aoPass.minDistance, finite(options.maxDistance, bounds ? this.aoPass.kernelRadius / (camera.far - camera.near) : 0.1))
      }
      this.bloomPass.enabled = bloom > 0
      this.bloomPass.strength = bloom
      const bloomOptions = typeof effects.bloom === 'object' && effects.bloom ? effects.bloom : {}
      this.bloomPass.radius = clamp(finite(bloomOptions.radius, finite(effects.bloomRadius, 0.4)), 0, 1)
      this.bloomPass.threshold = Math.max(0, finite(bloomOptions.threshold, finite(effects.bloomThreshold, 1)))
      this.fxaaPass.enabled = !(quality === 0 || (quality && quality.fxaa === false) || effects.fxaa === false || effects.fxaa === 0)
      this.outputPass.uniforms.toneMappingExposure.value = clamp(finite(effects.exposure, 1), 0, 100)
      this.outputPass.uniforms.rasterEncoding.value = state.outputEncoding === sRGBEncoding ? 1 : (state.outputEncoding === GammaEncoding ? 2 : 0)
      this.outputPass.uniforms.rasterGamma.value = renderer.gammaFactor
      renderer.toneMapping = NoToneMapping
      renderer.toneMappingExposure = 1
      renderer.sortObjects = true
      renderer.autoClear = true
      renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = true
      renderer.setScissorTest(false)
      this.refraction.prepare(renderer, this.scene, camera, this.width, this.height, this.composer.renderTarget1.texture.type, quality?.revision == null ? null : key, reflectionCamera)
      this.composer.render(0)
      this.shadowKey = shadowKey
      this.copyPass.renderToScreen = false
      this.copyPass.render(renderer, this.outputTarget, this.composer.readBuffer)
      const reasons = []
      if (!this.hdrSupported) reasons.push('HDR render targets unavailable; using LDR')
      if (ao > 0 && !this.aoSupported) reasons.push('AO requires depth and float textures')
      this.status = { ...this.status, supported: true, degraded: reasons.length > 0, reason: reasons.join('; ') || null, samples: requestedSamples > 1 ? this.accumulation.samples : 1, targetSamples: requestedSamples, done: requestedSamples <= 1 || this.accumulation.samples >= requestedSamples }
      this.output = { texture: this.outputTarget.texture, target: this.outputTarget, width: this.width, height: this.height, status: this.status }
      return this.output
    } finally {
      camera.projectionMatrix.copy(projection); camera.projectionMatrixInverse.copy(projectionInverse)
      this.refraction.finish()
      restoreGlassShadows()
      const floorIndex = this.scene.children.indexOf(this.studioFloor.mesh)
      if (floorIndex >= 0) this.scene.children.splice(floorIndex, 1)
      this.scene.overrideMaterial = null
      Object.assign(renderer.shadowMap, shadowState)
      restoreState(renderer, state)
    }
  }

  compositeToScreen (output = this.output) {
    if (this.disposed) throw new Error('RasterRenderer has been disposed')
    if (!output || !output.texture || this.renderer.getContext().isContextLost()) return false
    const state = saveState(this.renderer)
    try {
      this.renderer.autoClear = false
      this.renderer.clippingPlanes = []
      this.renderer.localClippingEnabled = false
      this.copyPass.renderToScreen = true
      this.copyPass.render(this.renderer, null, output)
      return true
    } finally {
      this.copyPass.renderToScreen = false
      restoreState(this.renderer, state)
    }
  }

  dispose () {
    if (this.disposed) return
    this.disposed = true
    this.refraction.dispose()
    this.studioFloor.dispose()
    this.accumulation?.dispose()
    if (this.composer) {
      if (this.aoPass) this.aoPass.dispose()
      this.bloomPass.dispose()
      // r120 UnrealBloomPass.dispose releases targets but not materials/quad.
      for (const material of [this.bloomPass.materialHighPassFilter, ...this.bloomPass.separableBlurMaterials, this.bloomPass.compositeMaterial, this.bloomPass.materialCopy, this.bloomPass.basic]) material.dispose()
      this.bloomPass.fsQuad.dispose()
      for (const pass of [this.outputPass, this.fxaaPass, this.copyPass, this.composer.copyPass]) {
        pass.material.dispose()
        pass.fsQuad.dispose()
      }
      this.composer.renderTarget1.dispose()
      this.composer.renderTarget2.dispose()
      this.outputTarget.dispose()
    }
    this.scene.children.length = 0
    this.scene.background = this.scene.environment = null
    this.output = null
  }
}

export default RasterRenderer
