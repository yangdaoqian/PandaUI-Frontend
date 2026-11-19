import * as THREE from 'three'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'
import { applyMaterialSurface, applySceneReflection } from './MaterialSurface'
import { applyRenderShadowFilter } from './RenderShadowFilter'

export const isTransmissive = material => !!(material?.isMeshPhysicalMaterial && material.userData.pandaSurface && material.transmission > 0)
export const isSceneReflective = material => !!(material?.isMeshPhysicalMaterial && material.userData.pandaSurface && material.transmission <= 0 && (material.userData.pandaSurface.reflection ?? 1) > 0)

const MAX_TRANSMISSION_BANDS = 8

function planarReflectionSurface (object, camera) {
  const geometry = object.geometry
  if (!geometry?.boundingBox) geometry?.computeBoundingBox()
  const bounds = geometry?.boundingBox
  if (!bounds || bounds.isEmpty()) return null
  const size = bounds.getSize(new THREE.Vector3())
  const axes = [size.x, size.y, size.z].map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const thin = axes[0], span = axes[2].value
  if (!(span > 0) || thin.value > span * 0.0001 || thin.value > 0.001) return null
  const normal = new THREE.Vector3().setComponent(thin.index, 1)
  normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(object.matrixWorld)).normalize()
  const point = bounds.getCenter(new THREE.Vector3()).applyMatrix4(object.matrixWorld)
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3())
  if (normal.dot(cameraPosition) - normal.dot(point) < 0) normal.negate()
  const scale = new THREE.Vector3().setFromMatrixScale(object.matrixWorld)
  const area = axes[1].value * span * Math.max(scale.x, scale.y, scale.z) ** 2
  return { normal, point, constant: -normal.dot(point), area }
}

function sameReflectionPlane (left, right) {
  return left && right && Math.abs(left.constant - right.constant) < 0.001 && left.normal.dot(right.normal) > 0.9999
}

// Objects in one transmission band share the same captured background. Two
// glass objects whose projected bounds overlap therefore cannot share a band:
// the nearer one must be able to sample the farther one's filtered result.
// Keep the test conservative and use projected world-space bounding boxes so
// curved CAD glass and instanced meshes get the same ordering treatment.
function projectedTransmissionBounds (object, camera) {
  const geometry = object.geometry
  if (!geometry?.boundingBox) geometry?.computeBoundingBox()
  const bounds = geometry?.boundingBox
  if (!bounds || bounds.isEmpty()) return null
  const corners = [
    [bounds.min.x, bounds.min.y, bounds.min.z], [bounds.min.x, bounds.min.y, bounds.max.z],
    [bounds.min.x, bounds.max.y, bounds.min.z], [bounds.min.x, bounds.max.y, bounds.max.z],
    [bounds.max.x, bounds.min.y, bounds.min.z], [bounds.max.x, bounds.min.y, bounds.max.z],
    [bounds.max.x, bounds.max.y, bounds.min.z], [bounds.max.x, bounds.max.y, bounds.max.z]
  ]
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(object.matrixWorld)
  const point = new THREE.Vector3(), result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, visible: false }
  for (const corner of corners) {
    point.set(corner[0], corner[1], corner[2]).applyMatrix4(projection)
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue
    result.minX = Math.min(result.minX, point.x); result.minY = Math.min(result.minY, point.y)
    result.maxX = Math.max(result.maxX, point.x); result.maxY = Math.max(result.maxY, point.y)
    result.visible = true
  }
  if (!result.visible) return null
  return result
}

function projectedTransmissionBoundsOverlap (left, right) {
  if (!left || !right) return true
  // A one-pixel NDC margin prevents seams at adjacent projected edges from
  // being classified as independent layers.
  const margin = 2 / 1024
  return left.minX <= right.maxX + margin && left.maxX + margin >= right.minX &&
    left.minY <= right.maxY + margin && left.maxY + margin >= right.minY
}

export function mirrorCameraForPlane (camera, plane) {
  const mirror = camera.clone()
  const position = camera.getWorldPosition(new THREE.Vector3())
  const distance = plane.normal.dot(position) + plane.constant
  mirror.position.copy(position).addScaledVector(plane.normal, -2 * distance)
  const direction = camera.getWorldDirection(new THREE.Vector3())
  direction.addScaledVector(plane.normal, -2 * plane.normal.dot(direction)).normalize()
  // PandaUI uses a Z-up scene. Use the camera's actual local up vector rather
  // than assuming Three.js's default Y-up value.
  // Camera local +Y is its screen-up basis. camera.up is a world-space lookAt
  // hint (Z in this application), not a local basis to rotate a second time.
  const worldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()))
  worldUp.addScaledVector(plane.normal, -2 * plane.normal.dot(worldUp)).normalize()
  mirror.up.copy(worldUp)
  mirror.lookAt(mirror.position.clone().add(direction))
  mirror.updateMatrixWorld(true)
  return mirror
}

// r120 shadow maps cannot represent transmission. Exclude only glass slots while
// producing shadows, then restore them before the beauty draw (including mixed meshes).
export function filterTransmissionShadows (renderer) {
  const original = renderer.shadowMap.render
  renderer.shadowMap.render = function (lights, scene, camera) {
    const hidden = new Set()
    scene.traverseVisible(object => {
      for (const material of [].concat(object.material || [])) {
        if (isTransmissive(material) && material.visible) { hidden.add(material); material.visible = false }
      }
    })
    try { return original.call(this, lights, scene, camera) } finally { for (const material of hidden) material.visible = true }
  }
  return () => { renderer.shadowMap.render = original }
}

export default class MaterialRefractionPass {
  constructor () {
    this.stages = []
    this.active = []
    this.reflectionTarget = null
    this.reflectionDepthTarget = null
    this.reflectionDepthSupported = false
    this.reflectionPlane = null
    this.reflectionMirrorProjection = new THREE.Matrix4()
    this.reflectionKey = null
    this.reflectionMaterials = new Map()
    this.layerScene = new THREE.Scene(); this.layerScene.autoUpdate = false
    this.reflectionDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide })
    this.reflectionDepthMaterial.onBeforeCompile = shader => {
      // Three expands shader chunks before onBeforeCompile runs. Removing the
      // include names is needed for r120's pre-expansion hook; the second
      // replacement also handles builds that pass expanded chunks. The
      // reflection shader decodes a conventional packed depth.
      const stripLogDepth = source => source
        .replace(/#include <logdepthbuf_(?:pars_)?(?:vertex|fragment)>/g, '')
        .replace(/#ifdef USE_LOGDEPTHBUF[\s\S]*?#endif\s*#endif/g, '')
        .replace(/#if defined\( USE_LOGDEPTHBUF \) && defined\( USE_LOGDEPTHBUF_EXT \)[\s\S]*?#endif/g, '')
      shader.vertexShader = stripLogDepth(shader.vertexShader)
      shader.fragmentShader = stripLogDepth(shader.fragmentShader)
    }
    this.reflectionDepthMaterial.customProgramCacheKey = () => 'Panda-reflection-conventional-depth-v2'
    this.copy = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
      vertexShader: CopyShader.vertexShader,
      fragmentShader: CopyShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false
    })
    this.depthCopy = new THREE.ShaderMaterial({
      uniforms: { image: { value: null } },
      vertexShader: 'varying vec2 uv_; void main(){uv_=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `varying vec2 uv_; uniform sampler2D image;
        #include <packing>
        void main(){gl_FragColor=texture2D(image,uv_);gl_FragDepthEXT=unpackRGBAToDepth(gl_FragColor);}`,
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.AlwaysDepth,
      blending: THREE.NoBlending,
      toneMapped: false,
      extensions: { fragDepth: true }
    })
    this.filter = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      uniforms: { image: { value: null }, step: { value: new THREE.Vector2() } },
      vertexShader: 'varying vec2 uv_; void main(){ uv_=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
      // Bilinear Gaussian taps: continuous blur instead of displaced sharp images.
      fragmentShader: `varying vec2 uv_; uniform sampler2D image; uniform vec2 step;
        void main(){
          gl_FragColor = texture2D(image, uv_) * 0.2270270270;
          gl_FragColor += texture2D(image, uv_ + step * 1.3846153846) * 0.3162162162;
          gl_FragColor += texture2D(image, uv_ - step * 1.3846153846) * 0.3162162162;
          gl_FragColor += texture2D(image, uv_ + step * 3.2307692308) * 0.0702702703;
          gl_FragColor += texture2D(image, uv_ - step * 3.2307692308) * 0.0702702703;
        }`
    })
    this.quad = new Pass.FullScreenQuad(this.filter)
  }

  get target () { return this.stages[0]?.target || null }
  get levels () { return this.stages[0]?.levels || [] }

  releaseBlur (stage) {
    for (const level of stage.levels) for (const target of level) target.dispose()
    stage.levels = []
    this.filter.uniforms.image.value = null
  }

  releaseStage (stage, shared = false) {
    this.releaseBlur(stage)
    for (const entry of stage.materials.values()) entry.material.dispose()
    // Only the base target owns the opaque depth attachment shared by the layers.
    if (shared) stage.target.depthTexture = null
    stage.target.dispose()
    stage.depthTarget?.dispose()
  }

  releaseReflection () {
    this.screenCapture?.reflectionTarget?.dispose(); this.screenCapture?.reflectionDepthTarget?.dispose(); this.screenCapture = null
    this.mirrorTransmission?.releaseTargets()
    for (const entry of this.reflectionMaterials.values()) entry.material.dispose()
    this.reflectionMaterials.clear()
    if (this.reflectionTarget) {
      const depth = this.reflectionTarget.depthTexture
      this.reflectionTarget.depthTexture = null
      depth?.dispose()
      this.reflectionTarget.dispose()
      this.reflectionTarget = null
    }
    this.reflectionDepthTarget?.dispose()
    this.reflectionDepthTarget = null
    this.reflectionDepthSupported = false
    this.reflectionPlane = null
    this.reflectionMirrorProjection.identity()
    this.reflectionKey = null
  }

  releaseTargets () {
    while (this.stages.length) this.releaseStage(this.stages.pop(), this.stages.length > 0)
    this.releaseReflection()
    this.copy.uniforms.tDiffuse.value = null
    this.depthCopy.uniforms.image.value = null
  }

  stage (index, width, height, type, depth) {
    if (!this.stages[index]) {
      const target = new THREE.WebGLRenderTarget(width, height, { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, stencilBuffer: false })
      if (depth) target.depthTexture = depth
      this.stages[index] = { target, levels: [], materials: new Map() }
    }
    return this.stages[index]
  }

  captureTransmissionDepth (renderer, scene, camera, stage, previousStage = null) {
    const { width, height } = stage.target
    if (!stage.depthTarget) {
      stage.depthTarget = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
        stencilBuffer: false
      })
    }
    const target = renderer.getRenderTarget(), auto = renderer.autoClear
    const color = renderer.getClearColor().clone(), alpha = renderer.getClearAlpha()
    const clips = renderer.clippingPlanes, local = renderer.localClippingEnabled, override = scene.overrideMaterial, background = scene.background
    try {
      scene.background = null
      renderer.setRenderTarget(stage.depthTarget); renderer.setClearColor(0xffffff, 1); renderer.clear()
      renderer.autoClear = false
      if (previousStage) {
        // Preserve the transmitted background depth PER PIXEL through panes.
        // Writing the preceding pane's surface depth here caps the gap at that
        // pane: a clear sheet next to frost then makes distant objects sharp.
        // Color still contains every rear glass band; only the depth used for
        // transmitted blur continues through glass to the opaque background.
        renderer.clippingPlanes = []; renderer.localClippingEnabled = false
        this.depthCopy.uniforms.image.value = previousStage.depthTarget.texture
        this.quad.material = this.depthCopy; this.quad.render(renderer)
        return
      }
      scene.overrideMaterial = this.reflectionDepthMaterial
      renderer.render(scene, camera)
    } finally {
      scene.overrideMaterial = override; scene.background = background; renderer.autoClear = auto
      this.depthCopy.uniforms.image.value = null
      renderer.clippingPlanes = clips; renderer.localClippingEnabled = local
      renderer.setClearColor(color, alpha); renderer.setRenderTarget(target)
    }
  }

  blur (renderer, stage, rough) {
    if (!rough) { this.releaseBlur(stage); return }
    const { width, height } = stage.target
    const clips = renderer.clippingPlanes, local = renderer.localClippingEnabled, auto = renderer.autoClear
    try {
      renderer.clippingPlanes = []; renderer.localClippingEnabled = false; renderer.autoClear = true
      this.quad.material = this.filter
      let source = stage.target
      for (let i = 0; i < 4; i++) {
        // Four taps/levels cover contact detail through distant diffuse color
        // without increasing sampler count or allocating full-size blur buffers.
        const divisor = [2, 8, 32, 128][i]
        const w = Math.max(1, Math.ceil(width / divisor))
        const h = Math.max(1, Math.ceil(height / divisor))
        if (!stage.levels[i]) {
          stage.levels[i] = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, {
            type: source.texture.type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false
          }))
        }
        const [scratch, result] = stage.levels[i]
        this.filter.uniforms.image.value = source.texture
        this.filter.uniforms.step.value.set(1 / w, 0)
        renderer.setRenderTarget(scratch); this.quad.render(renderer)
        this.filter.uniforms.image.value = scratch.texture
        this.filter.uniforms.step.value.set(0, 1 / h)
        renderer.setRenderTarget(result); this.quad.render(renderer)
        source = result
      }
    } finally { renderer.clippingPlanes = clips; renderer.localClippingEnabled = local; renderer.autoClear = auto }
  }

  bind (stage, source, camera) {
    let entry = stage.materials.get(source)
    if (!entry) {
      const material = applyRenderShadowFilter(source.clone())
      applyMaterialSurface(material)
      entry = { material, version: -1 }; stage.materials.set(source, entry)
    }
    const material = entry.material
    material.copy(source); material.depthWrite = false
    if (entry.version !== source.version) { material.needsUpdate = true; entry.version = source.version }
    const uniforms = applyMaterialSurface(material)
    uniforms.pandaScene.value = stage.target.texture
    for (let i = 0; i < 4; i++) uniforms['pandaSceneBlur' + (i + 1)].value = stage.levels[i]?.[1].texture || stage.target.texture
    uniforms.pandaSceneReady.value = 1; uniforms.pandaProjection.value.copy(camera.projectionMatrix)
    uniforms.pandaSceneDepth.value = stage.depthTarget?.texture || stage.target.texture
    uniforms.pandaSceneDepthReady.value = stage.depthTarget ? 1 : 0
    uniforms.pandaSceneSize.value.set(stage.target.width, stage.target.height)
    uniforms.pandaCameraRange.value.set(camera.near, camera.far, camera.isPerspectiveCamera ? 1 : 0)
    return material
  }

  bindReflection (source, camera, plane, capture = this) {
    let entry = this.reflectionMaterials.get(source)
    if (!entry) {
      const material = applyRenderShadowFilter(source.clone())
      applyMaterialSurface(material)
      applySceneReflection(material)
      entry = { material, version: -1 }
      this.reflectionMaterials.set(source, entry)
    }
    const material = entry.material
    // Reflection does not make an opaque open surface transparent. Preserve the
    // authored depth state so later solid/glass draws cannot overwrite it.
    material.copy(source)
    if (entry.version !== source.version) { material.needsUpdate = true; entry.version = source.version }
    applyMaterialSurface(material)
    const uniforms = applySceneReflection(material)
    uniforms.pandaReflectionScene.value = capture.reflectionTarget.texture
    const depthReady = this.reflectionDepthSupported && capture.reflectionDepthTarget
    uniforms.pandaReflectionDepth.value = depthReady ? capture.reflectionDepthTarget.texture : null
    uniforms.pandaReflectionReady.value = 1
    uniforms.pandaReflectionDepthReady.value = depthReady ? 1 : 0
    uniforms.pandaReflectionProjection.value.copy(camera.projectionMatrix)
    uniforms.pandaReflectionDistance.value = Math.max(25, Math.min(10000, (camera.far || 100) * 0.25))
    uniforms.pandaReflectionNear.value = camera.near || 0.1
    uniforms.pandaReflectionFar.value = camera.far || 1000
    uniforms.pandaReflectionPerspective.value = camera.isPerspectiveCamera ? 1 : 0
    uniforms.pandaReflectionPlanar.value = plane ? 1 : 0
    uniforms.pandaReflectionMirrorProjection.value.copy(plane ? this.reflectionMirrorProjection : camera.projectionMatrix)
    return material
  }

  prepare (renderer, scene, camera, width, height, type, cacheKey = null, reflectionCamera = null, includeReflections = true) {
    this.finish()
    // Progressive AA jitters the beauty projection. Keep reflection capture
    // and its sampling projection on the stable camera so one capture can be
    // reused by all AA samples without ghosting or moving reflection detail.
    const captureCamera = reflectionCamera || camera
    const meshes = [], lights = [], glass = new Set(), reflective = new Set(), reflectionItems = [], reflectionPlanes = new Map()
    scene.traverseVisible(object => {
      if (object.isLight) lights.push(object)
      if (!object.isMesh || !object.layers.test(camera.layers)) return
      const materials = [].concat(object.material || [])
      const visibleMaterials = materials.filter(material => material.visible)
      for (const material of visibleMaterials) if (includeReflections && isSceneReflective(material)) reflective.add(material)
      if (includeReflections && visibleMaterials.some(isSceneReflective)) {
        reflectionItems.push({ mesh: object, original: object.material })
        const plane = planarReflectionSurface(object, captureCamera)
        for (const material of visibleMaterials.filter(isSceneReflective)) {
          if (!reflectionPlanes.has(material)) reflectionPlanes.set(material, plane)
          else if (!sameReflectionPlane(reflectionPlanes.get(material), plane)) reflectionPlanes.set(material, null)
        }
      }
      if (!materials.some(material => material.visible && isTransmissive(material))) return
      for (const material of materials) if (material.visible && isTransmissive(material)) glass.add(material)
      const geometry = object.geometry
      if (!geometry.boundingSphere) geometry.computeBoundingSphere()
      const center = geometry.boundingSphere.center.clone().applyMatrix4(object.matrixWorld).applyMatrix4(camera.matrixWorldInverse)
      meshes.push({ mesh: object, depth: center.z, original: object.material, screenBounds: projectedTransmissionBounds(object, captureCamera) })
    })
    const sharedDepth = renderer.capabilities.isWebGL2 || !!renderer.extensions.get('WEBGL_depth_texture')
    // The packed depth capture is currently guaranteed only on WebGL2. On
    // WebGL1 use the conservative no-depth fallback; a partially supported
    // depth extension must not reintroduce false reflection hits.
    if (!meshes.length && !reflective.size) { this.releaseTargets(); return }
    if (!reflective.size) this.releaseReflection()
    else for (const [source, entry] of this.reflectionMaterials) if (!reflective.has(source)) { entry.material.dispose(); this.reflectionMaterials.delete(source) }
    const currentTarget = this.target || this.reflectionTarget
    if (currentTarget && (currentTarget.width !== width || currentTarget.height !== height || currentTarget.texture.type !== type)) this.releaseTargets()
    this.reflectionDepthSupported = renderer.capabilities.isWebGL2
    const depth = this.target?.depthTexture || (meshes.length && sharedDepth ? new THREE.DepthTexture(width, height, THREE.UnsignedIntType) : null)
    const distanceBlur = (renderer.capabilities.isWebGL2 || !!renderer.extensions.get('EXT_frag_depth')) && [...glass].some(material => Math.max(material.roughness || 0, material.userData.pandaSurface.refractionRoughness || 0) > 0)
    meshes.sort((a, b) => a.depth - b.depth || a.mesh.id - b.mesh.id)
    let count = Math.min(MAX_TRANSMISSION_BANDS, meshes.length)
    const bands = Array.from({ length: count }, () => [])
    // Every overlapping farther pane is a dependency, including panes in a
    // later band. A first-free-band search can place a near pane in band zero
    // and skip a wide middle pane that overlaps it and a disjoint far pane.
    for (const item of meshes) {
      let assigned = 0
      for (let band = 0; band < count; band++) {
        if (bands[band].some(previous => projectedTransmissionBoundsOverlap(previous.screenBounds, item.screenBounds))) {
          assigned = band + 1
        }
      }
      // Eight bands are a deliberate bounded approximation. If a pixel has
      // more than eight overlapping panes, retain the nearest available band
      // rather than allocating unbounded render targets.
      assigned = Math.min(assigned, count - 1)
      bands[assigned].push(item)
    }
    while (bands.length && bands[bands.length - 1].length === 0) bands.pop()
    count = bands.length
    const planeCandidates = [...reflective].map(material => reflectionPlanes.get(material)).filter(Boolean)
    // Keep the largest authored mirror plane even when a curved object also
    // reflects. One planar capture plus one optional SSR capture bounds cost.
    const planar = planeCandidates.sort((a, b) => b.area - a.area)[0] || null
    const planarMaterials = new Set([...reflective].filter(material => sameReflectionPlane(planar, reflectionPlanes.get(material))))
    const needsScreenCapture = !!planar && planarMaterials.size < reflective.size
    const mirrorCamera = planar ? mirrorCameraForPlane(captureCamera, planar) : captureCamera
    if (planar) {
      this.reflectionPlane = planar
      this.reflectionMirrorProjection.copy(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse)
    } else {
      this.reflectionPlane = null
      this.reflectionMirrorProjection.identity()
    }
    while (this.stages.length > count) this.releaseStage(this.stages.pop(), this.stages.length > 0)
    const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear
    const clips = renderer.clippingPlanes, localClips = renderer.localClippingEnabled
    const hidden = new Set()
    try {
      if (reflective.size) {
        if (!needsScreenCapture && this.screenCapture) {
          this.screenCapture.reflectionTarget?.dispose(); this.screenCapture.reflectionDepthTarget?.dispose(); this.screenCapture = null
        }
        if (!planar) this.mirrorTransmission?.releaseTargets()
        const captureView = (capture, viewCamera, plane, excluded) => {
          if (!capture.reflectionTarget) capture.reflectionTarget = new THREE.WebGLRenderTarget(width, height, { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, stencilBuffer: true })
          if (!plane && this.reflectionDepthSupported && !capture.reflectionDepthTarget) capture.reflectionDepthTarget = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: true })
          if (plane && capture.reflectionDepthTarget) { capture.reflectionDepthTarget.dispose(); capture.reflectionDepthTarget = null }
          const viewKey = cacheKey == null ? null : JSON.stringify([cacheKey, plane?.constant, plane?.normal.toArray(), [...excluded].map(material => material.uuid)])
          if (viewKey != null && capture.reflectionKey === viewKey) return
          const omit = plane ? excluded : new Set([...glass, ...excluded])
          for (const material of omit) material.visible = false
          const hiddenObjects = new Set([...reflectionItems.filter(item => [].concat(item.original).some(material => excluded.has(material))).map(item => item.mesh), ...meshes.map(item => item.mesh)])
          const visibleObjects = []
          const background = scene.background, override = scene.overrideMaterial
          const clearColor = renderer.getClearColor().clone(), clearAlpha = renderer.getClearAlpha()
          try {
            renderer.clippingPlanes = plane ? [...clips, new THREE.Plane(plane.normal.clone(), plane.constant)] : clips
            if (plane && glass.size) {
              this.mirrorTransmission ||= new MaterialRefractionPass()
              this.mirrorTransmission.prepare(renderer, scene, viewCamera, width, height, type, null, viewCamera, false)
            } else if (plane) this.mirrorTransmission?.releaseTargets()
            renderer.autoClear = true; renderer.setRenderTarget(capture.reflectionTarget); renderer.clear(); renderer.render(scene, viewCamera)
            this.mirrorTransmission?.finish()
            for (const object of hiddenObjects) if (object.visible) { visibleObjects.push(object); object.visible = false }
            if (capture.reflectionDepthTarget) {
              scene.background = null; scene.overrideMaterial = this.reflectionDepthMaterial
              renderer.setClearColor(0xffffff, 1); renderer.setRenderTarget(capture.reflectionDepthTarget); renderer.clear(); renderer.render(scene, viewCamera)
            }
          } finally {
            this.mirrorTransmission?.finish()
            scene.background = background; scene.overrideMaterial = override
            renderer.setClearColor(clearColor, clearAlpha)
            renderer.clippingPlanes = clips
            for (const object of visibleObjects) object.visible = true
            for (const material of omit) material.visible = true
          }
          capture.reflectionKey = viewKey
        }
        captureView(this, mirrorCamera, planar, planar ? planarMaterials : reflective)
        if (needsScreenCapture) {
          this.screenCapture ||= {}
          captureView(this.screenCapture, captureCamera, null, reflective)
        }
        const copies = new Map([...reflective].map(source => {
          const onPlane = planarMaterials.has(source)
          return [source, this.bindReflection(source, captureCamera, onPlane ? planar : null, planar && !onPlane ? this.screenCapture : this)]
        }))
        for (const item of reflectionItems) {
          const replace = material => copies.get(material) || material
          item.mesh.material = Array.isArray(item.original) ? item.original.map(replace) : replace(item.original)
          this.active.push(item)
        }
      }
      if (!meshes.length) return
      for (const material of glass) material.visible = false
      const base = this.stage(0, width, height, type, depth)
      renderer.autoClear = true; renderer.setRenderTarget(base.target); renderer.clear(); renderer.render(scene, camera)
      if (distanceBlur) this.captureTransmissionDepth(renderer, scene, camera, base)
      for (const material of glass) material.visible = true
      this.layerScene.environment = scene.environment; this.layerScene.fog = scene.fog
      for (let i = 0; i < count; i++) {
        const stage = this.stage(i, width, height, type, depth)
        if (i > 0) {
          if (sharedDepth) {
            // Copy color only. The common opaque depth attachment rejects glass
            // hidden behind solid objects without redrawing the entire CAD model.
            renderer.autoClear = false; renderer.clippingPlanes = []; renderer.localClippingEnabled = false
            this.copy.uniforms.tDiffuse.value = this.stages[i - 1].target.texture; this.quad.material = this.copy
            renderer.setRenderTarget(stage.target); this.quad.render(renderer)
            renderer.clippingPlanes = clips; renderer.localClippingEnabled = localClips
            this.layerScene.children = [...lights, ...bands[i - 1].map(item => item.mesh)]
            for (const item of bands[i - 1]) {
              for (const material of [].concat(item.mesh.material)) {
                if (!isTransmissive(material) && material.visible) { hidden.add(material); material.visible = false }
              }
            }
            renderer.render(this.layerScene, camera)
          } else {
            // No depth-texture extension: retain correctness with a bounded full
            // background capture, hiding this layer and all nearer glass slots.
            for (const band of bands.slice(i)) {
              for (const item of band) {
                for (const material of [].concat(item.mesh.material)) {
                  if (isTransmissive(material) && material.visible) { hidden.add(material); material.visible = false }
                }
              }
            }
            renderer.autoClear = true; renderer.setRenderTarget(stage.target); renderer.clear(); renderer.render(scene, camera)
          }
          for (const material of hidden) material.visible = true
          hidden.clear()
          if (distanceBlur) {
            this.layerScene.children = [...bands[i - 1].map(item => item.mesh)]
            this.captureTransmissionDepth(renderer, this.layerScene, camera, stage, this.stages[i - 1])
          }
        }
        if (!distanceBlur && stage.depthTarget) { stage.depthTarget.dispose(); stage.depthTarget = null }
        const sources = new Set(bands[i].flatMap(item => [].concat(item.original).filter(material => material.visible && isTransmissive(material))))
        this.blur(renderer, stage, [...sources].some(material => Math.max(material.roughness || 0, material.userData.pandaSurface.refractionRoughness || 0) > 0))
        for (const [source, entry] of stage.materials) if (!sources.has(source)) { entry.material.dispose(); stage.materials.delete(source) }
        const copies = new Map([...sources].map(source => [source, this.bind(stage, source, camera)]))
        for (const item of bands[i]) {
          const replace = material => copies.get(material) || this.reflectionMaterials.get(material)?.material || material
          item.mesh.material = Array.isArray(item.original) ? item.original.map(replace) : replace(item.original)
          this.active.push(item)
        }
      }
      // Each bound pane already contains all rear bands and outputs alpha one.
      // The beauty pass must retain the nearest pane even when CAD meshes have
      // coincident origins or authored renderOrder overrides depth sorting.
      // Enable writes only AFTER captures: those share the opaque depth texture
      // and must not record glass depth while constructing later backgrounds.
      for (const stage of this.stages) {
        for (const { material } of stage.materials.values()) material.depthWrite = true
      }
    } catch (error) { this.finish(); throw error } finally {
      for (const material of glass) material.visible = true
      for (const material of reflective) material.visible = true
      for (const material of hidden) material.visible = true
      this.layerScene.children = []; this.layerScene.environment = null; this.layerScene.fog = null
      renderer.autoClear = autoClear; renderer.clippingPlanes = clips; renderer.localClippingEnabled = localClips
      renderer.setRenderTarget(previous)
    }
  }

  finish () {
    for (const item of this.active) item.mesh.material = item.original
    this.active = []
    for (const { material } of this.reflectionMaterials.values()) {
      const uniforms = applySceneReflection(material)
      uniforms.pandaReflectionReady.value = 0; uniforms.pandaReflectionDepthReady.value = 0
      uniforms.pandaReflectionScene.value = null; uniforms.pandaReflectionDepth.value = null
    }
    for (const stage of this.stages) {
      for (const { material } of stage.materials.values()) {
        const uniforms = applyMaterialSurface(material)
        uniforms.pandaSceneReady.value = 0; uniforms.pandaScene.value = null
        uniforms.pandaSceneDepthReady.value = 0; uniforms.pandaSceneDepth.value = null
        for (let i = 1; i <= 4; i++) uniforms['pandaSceneBlur' + i].value = null
      }
    }
  }

  dispose () { this.finish(); this.releaseTargets(); this.mirrorTransmission?.dispose(); this.mirrorTransmission = null; this.reflectionDepthMaterial.dispose(); this.filter.dispose(); this.copy.dispose(); this.depthCopy.dispose(); this.quad.dispose() }
}
