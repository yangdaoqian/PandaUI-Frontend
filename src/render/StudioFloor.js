import * as THREE from 'three'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { applyRenderShadowFilter } from './RenderShadowFilter'
import MaterialRefractionPass, { mirrorCameraForPlane } from './MaterialRefractionPass'
import { applyMaterialSurface, applySceneReflection } from './MaterialSurface'

// Render-only Z-up receiver. It never enters document, picking or export geometry.
// One bounded mirror capture per camera/scene revision; reuse it across AA samples.
export default class StudioFloor {
  constructor () {
    this.uniforms = {
      studioReflection: { value: null },
      studioFarReflection: { value: null },
      studioScale: { value: 1 },
      studioDistanceBlur: { value: 1 },
      studioBlurDistance: { value: 4 },
      studioMatrix: { value: new THREE.Matrix4() },
      studioStrength: { value: 0 },
      studioRoughness: { value: 0.25 }
    }
    this.material = applyRenderShadowFilter(new THREE.MeshStandardMaterial({ color: '#383c43', roughness: 0.25 }))
    const compile = this.material.onBeforeCompile, cacheKey = this.material.customProgramCacheKey()
    this.material.onBeforeCompile = (shader, renderer) => {
      compile.call(this.material, shader, renderer)
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = 'varying vec3 studioWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nstudioWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = `varying vec3 studioWorld;
        uniform sampler2D studioReflection, studioFarReflection; uniform mat4 studioMatrix;
        uniform float studioScale, studioDistanceBlur, studioBlurDistance;
        uniform float studioStrength; uniform float studioRoughness;
        ` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `
        vec4 projected = studioMatrix * vec4(studioWorld, 1.0);
        vec2 uv = projected.xy / max(projected.w, 0.00001);
        float border = smoothstep(0.0, 0.04, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
        vec3 eye = normalize(cameraPosition - studioWorld);
        float fresnel = 0.04 + 0.96 * pow(1.0 - clamp(abs(eye.z), 0.0, 1.0), 5.0);
        float weight = clamp(studioStrength * fresnel * (1.0 - 0.65 * studioRoughness) * border, 0.0, 1.0);
        float distanceOnFloor = length(cameraPosition.xy - studioWorld.xy) / studioScale;
        float farBlend = smoothstep(0.25 * studioBlurDistance, studioBlurDistance, distanceOnFloor) * min(studioDistanceBlur, 1.0);
        if (studioStrength > 0.0 && projected.w > 0.0) {
          vec3 reflection = mix(texture2D(studioReflection, uv).rgb, texture2D(studioFarReflection, uv).rgb, farBlend);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, reflection, weight);
        }
        #include <tonemapping_fragment>`)
    }
    this.material.customProgramCacheKey = () => cacheKey + ':studio-floor-v2'
    this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1), this.material)
    this.mesh.name = 'Studio floor (render only)'
    this.mesh.receiveShadow = true
    this.mesh.userData.renderStudioFloor = true
    this.blur = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { image: { value: null }, step: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 uv_; void main(){ uv_=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      fragmentShader: `varying vec2 uv_; uniform sampler2D image; uniform vec2 step;
        void main(){ vec4 sum=vec4(0.0); float weights=0.0;
          for(int i=-4;i<=4;i++){float x=float(i); float w=exp(-x*x/8.0); sum+=texture2D(image,uv_+step*x)*w; weights+=w;}
          gl_FragColor=sum/weights;
        }`
    })
    this.resolve = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    })
    this.quad = new Pass.FullScreenQuad(this.blur)
    this.captures = 0
    this.transmission = new MaterialRefractionPass()
  }

  configure (effects, bounds) {
    if (!effects.ground || !bounds || bounds.isEmpty()) { this.releaseTargets(); return false }
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3())
    const span = Math.max(size.x, size.y, size.z, 0.001)
    const groundZ = effects.groundAutoHeight !== false ? bounds.min.z - span * 0.0001 : effects.groundHeight || 0
    const groundScale = span * (effects.groundSize || 4)
    const moved = this.mesh.position.x !== center.x || this.mesh.position.y !== center.y || this.mesh.position.z !== groundZ || this.mesh.scale.x !== groundScale
    this.mesh.position.set(center.x, center.y, groundZ)
    this.mesh.scale.setScalar(groundScale)
    this.mesh.updateMatrixWorld(true)
    if (moved) this.key = null
    this.material.color.set(effects.groundColor || '#383c43').convertSRGBToLinear()
    this.material.roughness = effects.groundRoughness ?? 0.25
    this.uniforms.studioRoughness.value = this.material.roughness
    this.uniforms.studioScale.value = span
    this.uniforms.studioDistanceBlur.value = effects.groundDistanceBlur ?? 1
    this.uniforms.studioBlurDistance.value = Math.max(0.1, effects.groundBlurDistance ?? 4)
    this.uniforms.studioStrength.value = 0
    return true
  }

  prepare (renderer, scene, camera, effects, key, type) {
    if (!(effects.groundReflection > 0) || camera.getWorldPosition(new THREE.Vector3()).z <= this.mesh.position.z) {
      this.releaseTargets(); return
    }
    const resolution = Math.max(64, Math.min(2048, renderer.capabilities.maxTextureSize, effects.reflectionResolution || 512))
    if (!this.targets || this.resolution !== resolution || this.type !== type) {
      this.releaseTargets()
      this.resolution = resolution; this.type = type
      const gl = renderer.getContext()
      // Query format-specific MSAA support, including the depth format; float
      // renderability alone does not imply that it supports four samples.
      const format = type === THREE.HalfFloatType ? gl.RGBA16F : gl.RGBA8
      const colors = renderer.capabilities.isWebGL2 ? Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, format, gl.SAMPLES)) : []
      const depths = renderer.capabilities.isWebGL2 ? Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, gl.SAMPLES)) : []
      this.samples = Math.max(0, ...colors.filter(n => n > 1 && n <= 4 && depths.includes(n)))
      const captureSize = this.samples ? resolution : Math.min(resolution * 2, 2048, renderer.capabilities.maxTextureSize)
      const options = { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false }
      const Capture = this.samples ? THREE.WebGLMultisampleRenderTarget : THREE.WebGLRenderTarget
      // r120's depth-only renderbuffer defaults to 16 bits. Close CAD shells
      // then fight even with logarithmic depth. Packed depth/stencil supplies
      // 24-bit depth on both WebGL1 and WebGL2, including the MSAA attachment.
      const capture = new Capture(captureSize, captureSize, { ...options, depthBuffer: true, stencilBuffer: true })
      if (this.samples) capture.samples = this.samples
      this.targets = [capture, ...[1, 2, 3, 4].map(() => new THREE.WebGLRenderTarget(resolution, resolution, options))]
      this.resolve.uniforms.resolution.value.set(1 / captureSize, 1 / captureSize)
    }
    this.uniforms.studioReflection.value = this.targets[3].texture
    this.uniforms.studioFarReflection.value = this.targets[4].texture
    this.uniforms.studioStrength.value = effects.groundReflection
    if (key != null && key === this.key) return
    const mirror = mirrorCameraForPlane(camera, new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.mesh.position.z))
    // A world clipping plane supports both perspective and orthographic cameras.
    const clips = renderer.clippingPlanes, xr = renderer.xr.enabled
    const opticalState = []
    scene.traverseVisible(object => {
      if (!object.isMesh) return
      for (const material of [].concat(object.material || [])) {
        if (!material?.isMeshPhysicalMaterial || !material.userData?.pandaSurface) continue
        const surface = applyMaterialSurface(material)
        const reflection = applySceneReflection(material)
        if (surface) {
          opticalState.push([surface.pandaSceneReady, surface.pandaSceneReady.value, surface.pandaSceneDepthReady, surface.pandaSceneDepthReady.value])
          surface.pandaSceneReady.value = 0; surface.pandaSceneDepthReady.value = 0
        }
        if (reflection) {
          opticalState.push([reflection.pandaReflectionReady, reflection.pandaReflectionReady.value, reflection.pandaReflectionDepthReady, reflection.pandaReflectionDepthReady.value])
          reflection.pandaReflectionReady.value = 0; reflection.pandaReflectionDepthReady.value = 0
        }
      }
    })
    try {
      renderer.xr.enabled = false
      renderer.clippingPlanes = [...clips, new THREE.Plane(new THREE.Vector3(0, 0, 1), -this.mesh.position.z)]
      this.uniforms.studioMatrix.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
        .multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse)
      // A reflected view needs its own glass inputs/depth, never the main
      // camera's buffers or the unbound environment-only glass fallback.
      // Disable scene-reflection recursion inside this bounded mirror capture.
      this.transmission.prepare(renderer, scene, mirror, this.targets[0].width, this.targets[0].height, type, null, mirror, false)
      renderer.setRenderTarget(this.targets[0]); renderer.clear(); renderer.render(scene, mirror)
      this.transmission.finish()
      renderer.clippingPlanes = []
      // Resolve/FXAA once, then filter two levels without re-rendering geometry.
      this.quad.material = this.resolve
      this.resolve.uniforms.tDiffuse.value = this.targets[0].texture
      renderer.setRenderTarget(this.targets[1]); this.quad.render(renderer)
      this.quad.material = this.blur
      const filter = (source, destination, radius) => {
        this.blur.uniforms.step.value.set(radius / resolution, 0)
        this.blur.uniforms.image.value = source.texture
        renderer.setRenderTarget(this.targets[2]); this.quad.render(renderer)
        this.blur.uniforms.step.value.set(0, radius / resolution)
        this.blur.uniforms.image.value = this.targets[2].texture
        renderer.setRenderTarget(destination); this.quad.render(renderer)
      }
      const nearRadius = this.material.roughness * this.material.roughness * 5 * resolution / 512
      filter(this.targets[1], this.targets[3], nearRadius)
      filter(this.targets[3], this.targets[4], this.uniforms.studioDistanceBlur.value * 3 * resolution / 512)
      this.key = key; this.captures++
    } finally {
      this.transmission.finish()
      for (const state of opticalState) {
        state[0].value = state[1]
        state[2].value = state[3]
      }
      renderer.clippingPlanes = clips; renderer.xr.enabled = xr
    }
  }

  releaseTargets () {
    this.transmission?.releaseTargets()
    this.targets?.forEach(target => target.dispose())
    this.targets = null; this.key = null
    this.uniforms.studioReflection.value = null; this.uniforms.studioFarReflection.value = null; this.uniforms.studioStrength.value = 0
    this.resolve.uniforms.tDiffuse.value = null
    this.blur.uniforms.image.value = null
  }

  dispose () {
    this.releaseTargets(); this.transmission.dispose(); this.mesh.geometry.dispose(); this.material.dispose(); this.blur.dispose(); this.resolve.dispose(); this.quad.dispose()
  }
}
