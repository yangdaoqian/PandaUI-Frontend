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
    Object.assign(this.blurMaterial.uniforms, {
      tDepth: { value: depth },
      tNormal: { value: this.normalRenderTarget.texture },
      cameraNear: { value: 0.1 },
      cameraFar: { value: 1000 },
      perspective: { value: 1 },
      aoScale: { value: 1 }
    })
    this.blurMaterial.fragmentShader = `uniform sampler2D tDiffuse, tDepth, tNormal;
      uniform vec2 resolution; uniform float cameraNear, cameraFar, perspective, aoScale; varying vec2 vUv;
      #include <packing>
      float viewZ(vec2 uv) { float d=texture2D(tDepth,uv).x; return perspective > 0.5 ? perspectiveDepthToViewZ(d,cameraNear,cameraFar) : orthographicDepthToViewZ(d,cameraNear,cameraFar); }
      void main() {
        if(texture2D(tDepth,vUv).x >= 1.0){gl_FragColor=vec4(1.0);return;}
        float z=viewZ(vUv); vec3 n=unpackRGBToNormal(texture2D(tNormal,vUv).xyz);
        float sum=0.0, weight=0.0;
        for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++) {
          vec2 offset=vec2(float(x),float(y)), uv=vUv+offset/resolution;
          vec3 sampleN=unpackRGBToNormal(texture2D(tNormal,uv).xyz);
          float w=exp(-dot(offset,offset)/4.0-abs(viewZ(uv)-z)/max(aoScale*0.1,0.000001));
          w*=pow(max(dot(n,sampleN),0.0),8.0);
          sum+=texture2D(tDiffuse,uv).r*w;weight+=w;
        }
        gl_FragColor=vec4(vec3(sum/max(weight,0.00001)),1.0);
      }`
    this.ssaoMaterial.fragmentShader = this.ssaoMaterial.fragmentShader.replace('if ( delta > minDistance && delta < maxDistance )', 'if ( all(greaterThanEqual(samplePointUv, vec2(0.0))) && all(lessThanEqual(samplePointUv, vec2(1.0))) && delta > minDistance && delta < maxDistance )')
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

  render (renderer, writeBuffer, readBuffer, deltaTime, maskActive) {
    this.blurMaterial.uniforms.cameraNear.value = this.camera.near
    this.blurMaterial.uniforms.cameraFar.value = this.camera.far
    this.blurMaterial.uniforms.perspective.value = this.camera.isPerspectiveCamera ? 1 : 0
    this.blurMaterial.uniforms.aoScale.value = this.kernelRadius
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  }

  renderOverride (renderer, material, target, color, alpha) {
    const background = this.scene.background
    const override = this.scene.overrideMaterial
    const clearColor = renderer.getClearColor().clone()
    const clearAlpha = renderer.getClearAlpha()
    const autoClear = renderer.autoClear
    const hidden = [], hiddenMaterials = new Set()
    // A scene background must not overwrite normals. Non-mesh primitives do
    // not have mesh normals; glass should not become an opaque AO occluder.
    this.scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const source of materials) {
        if (source?.visible && (source.transparent || source.transmission > 0)) { hiddenMaterials.add(source); source.visible = false }
      }
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
      for (const source of hiddenMaterials) source.visible = true
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
