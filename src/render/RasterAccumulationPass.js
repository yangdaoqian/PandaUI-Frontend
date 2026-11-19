import { LinearFilter, NoBlending, RGBAFormat, ShaderMaterial, WebGLRenderTarget } from 'three'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'

// Static-scene temporal supersampling. No history reprojection: motion/edits reset
// history instead of mixing old positions into the current image. Accumulate
// linear scene radiance before bloom, tone mapping and output encoding.
export default class RasterAccumulationPass extends Pass {
  constructor (type) {
    super()
    this.type = type
    this.enabled = false
    this.samples = 0
    this.targetSamples = 1
    this.width = this.height = 1
    this.targets = []
    this.material = new ShaderMaterial({
      uniforms: { current: { value: null }, history: { value: null }, weight: { value: 1 } },
      vertexShader: CopyShader.vertexShader,
      fragmentShader: 'uniform sampler2D current, history; uniform float weight; varying vec2 vUv; void main() { vec4 c = texture2D(current, vUv); gl_FragColor = weight >= 1.0 ? c : mix(texture2D(history, vUv), c, weight); }',
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: NoBlending
    })
    this.quad = new Pass.FullScreenQuad(this.material)
  }

  reset () { this.samples = 0; this.key = null }
  release () { this.targets.forEach(target => target.dispose()); this.targets = []; this.reset() }
  setSize (width, height) {
    if (this.width === width && this.height === height) return
    this.width = width; this.height = height
    this.targets.forEach(target => target.setSize(width, height))
    this.reset()
  }

  configure (key, samples) {
    this.enabled = samples > 1
    if (!this.enabled) { this.release(); this.targetSamples = 1; return }
    if (this.key !== key || this.targetSamples !== samples) this.reset()
    this.key = key; this.targetSamples = samples
    if (!this.targets.length) {
      this.targets = [0, 1].map(() => new WebGLRenderTarget(this.width, this.height, { type: this.type, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, stencilBuffer: false }))
    }
  }

  render (renderer, writeBuffer, readBuffer) {
    const previous = this.targets[this.samples % 2], next = this.targets[(this.samples + 1) % 2]
    const uniforms = this.material.uniforms
    uniforms.current.value = readBuffer.texture
    uniforms.history.value = previous.texture
    uniforms.weight.value = 1 / (this.samples + 1)
    renderer.setRenderTarget(next); this.quad.render(renderer)
    uniforms.current.value = next.texture; uniforms.weight.value = 1
    renderer.setRenderTarget(writeBuffer); this.quad.render(renderer)
    this.samples++
  }

  dispose () { this.release(); this.material.dispose(); this.quad.dispose() }
}
