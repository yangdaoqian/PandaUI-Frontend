import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import RenderResourceScope from './RenderResourceScope'
import { loadResourceEnvironment } from './RenderResourceEnvironment'
import { createResourceMaterial, resourceMeshes, resourceNumber, resourceTextureRoles, resourceTextureSource, resourceTextureSlots } from './RenderResourceMaterials'
import { createResourceLights, fitResourceShadows, resourceBounds, resourceShadowFocus } from './RenderResourceLighting'

/**
 * Reversible render-only resources for Three r120. See RenderResources.md.
 * apply is a full snapshot; omitted environment/bindings clear those overrides.
 * resolveTargets(ids) returns Object3D[] (or one Object3D), never metadata.
 * The parent owns renderer settings, mode switching and batch invalidation.
 */
export default class RenderResources {
  constructor ({ renderer, invalidate = () => {}, onStatus = () => {}, textureLoader, rgbeLoader, createPMREM, createCubeTarget } = {}) {
    this.renderer = renderer
    this.invalidate = invalidate
    this.onStatus = onStatus
    this.textureLoader = textureLoader || new THREE.TextureLoader()
    this.rgbeLoader = rgbeLoader || new RGBELoader().setDataType(THREE.HalfFloatType)
    this.createPMREM = createPMREM || (renderer => new THREE.PMREMGenerator(renderer))
    this.createCubeTarget = createCubeTarget || (size => new THREE.WebGLCubeRenderTarget(size))
    this.rig = new THREE.Group()
    this.rig.name = 'Render resource lights'
    this.rig.userData.renderResourceRig = true
    this._generation = 0
    this._disposed = false
    this._pending = null
    this._active = null
    this._objects = new Map()
    this._scenes = new Map()
    this._environment = null
    this._background = null
    this._bounds = new THREE.Box3()
    this._context = {}
    this._config = null
    this._blobIds = new WeakMap()
    this._nextBlobId = 0
  }

  get bounds () { return this._shadowFocus || this._bounds }
  get environment () { return this._environment }
  get background () { return this._background }
  get lightScene () { return this.rig }
  sourceMaterial (mesh) {
    const original = this._objects.get(mesh)?.original
    return original?.displayMaterials?.render || original?.material || mesh.userData.displayMaterials?.render || mesh.material
  }

  editSourceMaterials (action) {
    const previous = this._objects
    this._restore()
    try { return action() } finally { this._objects = previous; this.refreshTargets(this._context) }
  }

  attach (scene) {
    if (this._disposed) throw new Error('RenderResources is disposed')
    if (!scene?.isScene) throw new Error('The light rig must be attached to the scene being rendered')
    scene.add(this.rig)
    // Cancel a transformed scene root: authored positions are world coordinates.
    scene.updateWorldMatrix(true, false)
    this.rig.matrixAutoUpdate = false
    this.rig.matrix.getInverse(scene.matrixWorld)
    this.rig.matrixWorldNeedsUpdate = true
    if (!this._bounds.isEmpty()) fitResourceShadows(this.rig, this._bounds, this._shadowFocus || this._bounds)
    return this.rig
  }

  detach () {
    if (this.rig.parent) this.rig.parent.remove(this.rig)
    this.rig.matrix.identity()
    this.rig.matrixWorldNeedsUpdate = true
    this.rig.updateMatrixWorld(true)
    return this.rig
  }

  async apply (snapshot = {}, context = this._context) {
    if (this._disposed) throw new Error('RenderResources is disposed')
    let key
    try {
      key = JSON.stringify({ environment: snapshot.environment || null, lights: snapshot.lights || [], bindings: snapshot.bindings || [] }, (name, value) => {
        if (typeof Blob !== 'undefined' && value instanceof Blob) {
          if (!this._blobIds.has(value)) this._blobIds.set(value, ++this._nextBlobId)
          return { renderResourceBlob: this._blobIds.get(value) }
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]))
        return value
      })
    } catch (error) {
      const issues = [{ code: 'resource-error', message: error.message }]
      this.onStatus({ state: 'error', generation: this._generation, issues })
      return { applied: false, generation: this._generation, issues }
    }
    this._context = context
    if (key === this._config?.key) {
      if (this._pending) {
        this._pending.dispose()
        this._pending = null
        this._config.generation = ++this._generation
      }
      return this.refreshTargets(context)
    }
    if (this._pending && key === this._pendingKey) return this._pendingResult
    this._pendingKey = key
    this._pendingResult = this._apply(snapshot, key)
    return this._pendingResult
  }

  async _apply ({ environment = null, lights = [], bindings = [] }, key) {
    if (this._disposed) throw new Error('RenderResources is disposed')
    const generation = ++this._generation
    this._pending?.dispose()
    const scope = new RenderResourceScope()
    this._pending = scope
    const issues = []
    let changedObjects = []
    const issue = (code, message, detail = {}) => issues.push({ code, message, ...detail })
    const current = () => !this._disposed && generation === this._generation && !scope.closed
    this.onStatus({ state: 'loading', generation, issues: [] })
    try {
      const cache = new Map()
      const stagedBindings = bindings.map((binding, index) => {
        const material = { ...binding.material, textures: resourceTextureSlots(binding.material?.textures) }
        if (resourceNumber(material.transmission, 0) > 0 && !material.materialType) issue('unsupported-transmission', 'Use a typed Scene Material for screen-space refraction. Legacy transmission remains disabled; opacity is independent.', { binding: index })
        if (material.ior != null && (!Number.isFinite(material.ior) || material.ior < 1 || material.ior > 7 / 3)) issue('unsupported-ior', 'Dielectric Fresnel IOR is supported in [1, 7/3]; the value is clamped.', { binding: index })
        return { targets: [...(binding.targets || [])], material, textures: {} }
      })
      const environmentSettings = environment ? { ...environment } : null
      const lightSettings = lights.map(light => ({ ...light, position: light.position?.slice(), target: light.target?.slice() }))
      const textureWork = stagedBindings.flatMap(binding => resourceTextureRoles.map(async role => {
        const source = resourceTextureSource(binding.material.textures[role])
        if (source == null || source === '') return
        const encoding = role === 'map' || role === 'emissiveMap' ? THREE.sRGBEncoding : THREE.LinearEncoding
        // Same source/encoding can share; a color and data role must never alias.
        if (!cache.has(source)) cache.set(source, new Map())
        const variants = cache.get(source)
        if (!variants.has(encoding)) {
          variants.set(encoding, scope.load(this.textureLoader, source).then(texture => {
            if (scope.closed) return null
            texture.encoding = encoding
            texture.needsUpdate = true
            return texture
          }))
        }
        binding.textures[role] = await variants.get(encoding)
      }))
      const [loadedEnvironment] = await Promise.all([
        loadResourceEnvironment(environmentSettings, scope, this),
        Promise.all(textureWork)
      ])
      if (!current()) { scope.dispose(); return { applied: false, generation, issues } }

      const previous = this._active
      const config = { key, environmentTexture: loadedEnvironment.texture, background: loadedEnvironment.background, environmentSettings, stagedBindings, lightSettings, generation, issues }
      changedObjects = this._commit(config, scope, false, issue)
      this._config = config
      this._active = scope
      this._pending = null
      previous?.dispose()
    } catch (error) {
      const isCurrent = current()
      scope.dispose()
      if (!isCurrent) return { applied: false, generation, issues }
      this._pending = null
      issue('resource-error', error.message)
      this.onStatus({ state: 'error', generation, issues })
      return { applied: false, generation, issues }
    }
    // Callbacks are outside the allocation transaction; a host callback exception
    // must never dispose resources already committed to the live scene.
    this.invalidate({ reason: 'render-resources-applied', objects: changedObjects })
    this.onStatus({ state: 'ready', generation, issues })
    return { applied: true, generation, issues }
  }

  // Scene revisions never reload textures/PMREM or replace unchanged materials.
  refreshTargets (context = this._context) {
    if (this._disposed) throw new Error('RenderResources is disposed')
    this._context = context
    if (!this._config) return { applied: false, generation: this._generation, issues: [] }
    const { generation, issues } = this._config
    let objects
    try {
      objects = this._commit(this._config, this._active, true)
    } catch (error) {
      const errors = [...issues, { code: 'resource-error', message: error.message }]
      this.onStatus({ state: 'error', generation, issues: errors })
      return { applied: false, generation, issues: errors }
    }
    this.invalidate({ reason: 'render-resources-refreshed', objects })
    this.onStatus({ state: 'ready', generation, issues })
    return { applied: true, generation, issues }
  }

  updateScene (context) { return this.refreshTargets(context) }

  _commit (config, scope, refresh, issue) {
    const { scenes = [], resolveTargets = () => [] } = this._context
    const { environmentTexture, environmentSettings, stagedBindings, lightSettings } = config
    const sceneList = [...new Set(scenes)].filter(scene => scene?.isScene)
    const byMesh = new Map()
    // Previews receive global IBL, but never become document binding targets.
    const meshes = resourceMeshes(sceneList, true)
    for (const binding of stagedBindings) {
      const resolved = resolveTargets(binding.targets)
      const roots = resolved?.isObject3D ? [resolved] : Array.from(resolved || [])
      for (const mesh of resourceMeshes(roots)) {
        meshes.add(mesh)
        byMesh.set(mesh, binding)
      }
    }
    const bounds = resourceBounds(meshes)
    const lightGroup = refresh ? this.rig.children[0] : createResourceLights(lightSettings, bounds, scope, issue, this.renderer?.capabilities?.maxTextureSize || 4096)
    const shadows = lightGroup.children.some(light => light.isLight && light.castShadow)
    const intensity = resourceNumber(environmentSettings?.intensity, 1)
    const staged = new Map()
    const allocations = new RenderResourceScope()
    try {
      for (const mesh of meshes) {
        const previous = this._objects.get(mesh)
        const original = {}
        for (const key of ['material', 'displayMaterials', 'castShadow', 'receiveShadow']) {
          const value = key === 'displayMaterials' ? mesh.userData.displayMaterials : mesh[key]
          original[key] = previous && value === previous[key] ? previous.original[key] : value
        }
        // A document mode reset may replace render inside our shallow variant bag.
        if (previous && mesh.userData.displayMaterials === previous.displayMaterials && previous.displayMaterials?.render !== previous.render) {
          original.displayMaterials = { ...mesh.userData.displayMaterials }
        }
        const binding = byMesh.get(mesh)
        const source = original.displayMaterials?.render ?? original.material
        const sourceList = Array.isArray(source) ? source : [source]
        const versions = sourceList.map(value => value?.version)
        const reusable = refresh && previous?.source === source && previous.binding === binding && versions.every((value, index) => value === previous.versions[index])
        const convert = value => createResourceMaterial(value, binding, environmentTexture, intensity, allocations, shadows)
        const material = reusable ? previous.render : (Array.isArray(source) ? source.map(convert) : convert(source))
        const materialList = Array.isArray(material) ? material : [material]
        const owned = materialList.filter((value, index) => value !== sourceList[index])
        const changed = owned.length > 0
        if (!changed && !shadows) continue
        let displayMaterials = original.displayMaterials
        if (changed && displayMaterials) {
          displayMaterials = reusable && displayMaterials === previous.original.displayMaterials && previous.displayMaterials.render === material
            ? previous.displayMaterials : { ...displayMaterials, render: material }
        }
        staged.set(mesh, { original, source, versions, binding, owned, render: material, material: changed ? material : original.material, displayMaterials, castShadow: shadows || original.castShadow, receiveShadow: shadows || original.receiveShadow })
      }
    } catch (error) {
      allocations.dispose()
      throw error
    }
    for (const material of allocations.resources) scope.own(material)
    allocations.resources.clear()
    allocations.dispose()
    const oldStates = this._objects
    const objects = [...new Set([...oldStates.keys(), ...staged.keys()])]
    this._restore()
    for (const [mesh, state] of staged) {
      mesh.material = state.material
      if (state.displayMaterials !== state.original.displayMaterials) mesh.userData.displayMaterials = state.displayMaterials
      mesh.castShadow = state.castShadow
      mesh.receiveShadow = state.receiveShadow
    }
    this._objects = staged
    this._environment = environmentTexture
    this._background = config.background
    if (environmentTexture) {
      for (const scene of sceneList) {
        this._scenes.set(scene, { environment: scene.environment, background: scene.background })
        scene.environment = this._environment
        scene.background = this._background
      }
    }
    if (!refresh) {
      while (this.rig.children.length) this.rig.remove(this.rig.children[0])
      this.rig.add(lightGroup)
    }
    this._bounds = bounds
    this._shadowFocus = resourceShadowFocus(meshes, bounds)
    if (this.rig.parent) this.attach(this.rig.parent)
    else fitResourceShadows(this.rig, bounds, this._shadowFocus)
    if (refresh) {
      const retained = new Set([...staged.values()].flatMap(state => state.owned))
      for (const state of oldStates.values()) {
        for (const material of state.owned) { if (!retained.has(material)) scope.release(material) }
      }
    }
    return objects
  }

  _restore () {
    for (const [mesh, state] of this._objects) {
      if (mesh.material === state.material) mesh.material = state.original.material
      if (mesh.userData.displayMaterials === state.displayMaterials && state.displayMaterials !== state.original.displayMaterials) mesh.userData.displayMaterials = state.original.displayMaterials
      if (mesh.castShadow === state.castShadow) mesh.castShadow = state.original.castShadow
      if (mesh.receiveShadow === state.receiveShadow) mesh.receiveShadow = state.original.receiveShadow
    }
    this._objects = new Map()
    for (const [scene, original] of this._scenes) {
      if (scene.environment === this._environment) scene.environment = original.environment
      if (scene.background === this._background) scene.background = original.background
    }
    this._scenes.clear()
  }

  dispose () {
    if (this._disposed) return
    this._disposed = true
    ++this._generation
    this._pending?.dispose()
    this._pending = null
    const objects = [...this._objects.keys()]
    this._restore()
    this.detach()
    this._active?.dispose()
    this._active = null
    this._environment = null
    this._background = null
    this._config = null
    this.invalidate({ reason: 'render-resources-disposed', objects })
  }
}
