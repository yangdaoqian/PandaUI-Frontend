import { DepthTexture, NearestFilter, OneFactor, UnsignedIntType, ZeroFactor } from 'three'
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js'

// r120's beauty depth is logarithmic on the shared CAD renderer. Reconstruct
// view positions only from the normal pass's conventional projection depth.
export class RasterSSAOPass extends SSAOPass {
  constructor (scene, camera) {
    super(scene, camera, 1, 1)
    const depth = new DepthTexture(1, 1, UnsignedIntType)
    depth.minFilter = depth.magFilter = NearestFilter
    this.normalRenderTarget.depthTexture = depth
    this.normalRenderTarget.depthBuffer = true
    this.ssaoMaterial.uniforms.tDepth.value = depth
    this.depthRenderMaterial.uniforms.tDepth.value = depth
    this.normalMaterial.onBeforeCompile = shader => {
      const strip = source => source.replace(/#include <logdepthbuf_(?:pars_)?(?:vertex|fragment)>/g, '')
      shader.vertexShader = strip(shader.vertexShader)
      shader.fragmentShader = strip(shader.fragmentShader)
    }
    this.normalMaterial.customProgramCacheKey = () => 'Raster-normal-projection-depth-v1'
    // Both r120 shaders contain this typo in their orthographic branch.
    for (const material of [this.ssaoMaterial, this.depthRenderMaterial]) {
      material.fragmentShader = material.fragmentShader.replace(/texture2D\( depthSampler, coord \)/g, 'texture2D( tDepth, screenPosition )')
      material.toneMapped = false
    }
    this.ssaoMaterial.uniforms.rasterAOIntensity = { value: 1 }
    this.ssaoMaterial.fragmentShader = this.ssaoMaterial.fragmentShader
      .replace('uniform float kernelRadius;', 'uniform float kernelRadius;\nuniform float rasterAOIntensity;')
      .replace('vec3( 1.0 - occlusion )', 'vec3( 1.0 - clamp( occlusion * rasterAOIntensity, 0.0, 1.0 ) )')
    this.normalMaterial.toneMapped = false
    this.blurMaterial.toneMapped = false
    this.copyMaterial.toneMapped = false
    // Do not multiply beauty alpha by its own alpha in r120's AO blend.
    this.copyMaterial.blendSrcAlpha = ZeroFactor
    this.copyMaterial.blendDstAlpha = OneFactor
  }

  configure (camera, amount) {
    this.camera = camera
    const perspective = camera.isPerspectiveCamera ? 1 : 0
    for (const material of [this.ssaoMaterial, this.depthRenderMaterial]) {
      if (material.defines.PERSPECTIVE_CAMERA !== perspective) {
        material.defines.PERSPECTIVE_CAMERA = perspective
        material.needsUpdate = true
      }
      material.uniforms.cameraNear.value = camera.near
      material.uniforms.cameraFar.value = camera.far
    }
    this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix)
    this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.getInverse(camera.projectionMatrix)
    this.ssaoMaterial.uniforms.rasterAOIntensity.value = amount
  }

  renderOverride (renderer, material, target, color, alpha) {
    const background = this.scene.background
    const override = this.scene.overrideMaterial
    const clearColor = renderer.getClearColor().clone()
    const clearAlpha = renderer.getClearAlpha()
    const autoClear = renderer.autoClear
    const hidden = []
    // A scene background must not overwrite normals. Non-mesh primitives do
    // not have mesh normals; glass should not become an opaque AO occluder.
    this.scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (object.visible && (object.isLine || object.isPoints || object.isSprite ||
        (object.isMesh && materials.every(item => item && item.transparent)))) {
        hidden.push(object)
        object.visible = false
      }
    })
    this.scene.background = null
    try {
      super.renderOverride(renderer, material, target, color, alpha)
    } finally {
      for (const object of hidden) object.visible = true
      this.scene.background = background
      this.scene.overrideMaterial = override
      renderer.setClearColor(clearColor, clearAlpha)
      renderer.autoClear = autoClear
    }
  }

  dispose () {
    // SSAOPass.dispose in r120 omits both of these GPU resources.
    this.ssaoMaterial.dispose()
    this.noiseTexture.dispose()
    super.dispose()
  }
}
