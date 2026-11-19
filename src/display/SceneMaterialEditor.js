import * as THREE from 'three'
import { materializeBrepSelection } from '../BrepDisplayRanges'
import { detachDisplayMaterials } from '../DisplayResources'
import TextureAssets from './TextureAssets'
import { applyMaterialSurface, setSurfaceSettings } from '../render/MaterialSurface'

export default class SceneMaterialEditor {
  #services
  #selectionBaseline = null
  #textures = new TextureAssets()
  #unsubscribeHistory = null

  constructor (services) {
    this.#services = services

  }

  ownedMaterials (root) {
    const owners = new Set()
    const materials = new Set()
    root.traverse(object => {
      owners.add(object.uuid)
      ;[object.material, ...Object.values(object.userData.displayMaterials || {})].flat().filter(Boolean).forEach(material => materials.add(material))
    })
    return new Set([...materials].filter(material => owners.has(material.userData?.pandauiMaterialOwner)))
  }

  releaseReplacedMaterials (root, previous) {
    const retained = this.ownedMaterials(root)
    previous.forEach(material => { if (!retained.has(material)) material.dispose() })
  }

  detachRenderMaterials (root) {
    detachDisplayMaterials(root, ['render'])
    root.traverse(object => { if (object.isMesh && object.userData.displayMaterials?.render) object.userData.renderMaterialId = null })
  }

  getSelectedRenderMaterialId () {
    const root = this.#services.getSelectedObjectRoot()
    if (root == null) return null
    const ids = new Set()
    root.traverse(object => {
      if (object.isMesh && object.userData.displayMaterials?.render != null && object.userData.renderMaterialId) ids.add(object.userData.renderMaterialId)
    })
    return ids.size === 1 ? Array.from(ids)[0] : null
  }

  materialSnapshot (material) {
    if (material == null) return null
    if (Array.isArray(material)) return material.map(item => this.materialSnapshot(item))
    this.#textures.track(material)
    return {
      texture: this.#textures.capture(material.map),
      color: material.color?.getHex(),
      emissive: material.emissive?.getHex(),
      emissiveIntensity: material.emissiveIntensity,
      metalness: material.metalness,
      roughness: material.roughness,
      opacity: material.opacity,
      transparent: material.transparent,
      wireframe: material.wireframe,
      depthWrite: material.depthWrite,
      clearcoat: material.clearcoat,
      clearcoatRoughness: material.clearcoatRoughness,
      transmission: material.transmission,
      ior: material.userData?.pandaSurface?.ior ?? material.ior,
      thickness: material.userData?.pandaSurface?.thickness ?? material.thickness,
      attenuationDistance: material.userData?.pandaSurface?.attenuationDistance ?? material.attenuationDistance,
      reflectivity: material.reflectivity,
      bumpScale: material.bumpScale,
      normalScale: material.normalScale?.x,
      surface: material.userData?.pandaSurface ? { ...material.userData.pandaSurface } : null
    }
  }

  restoreMaterialSnapshot (state, material) {
    if (state == null || material == null) return
    if (Array.isArray(state)) { state.forEach((item, index) => this.restoreMaterialSnapshot(item, material[index])); return }
    this.#textures.track(material)
    if (Object.prototype.hasOwnProperty.call(state, 'texture') && !this.#textures.matches(material.map, state.texture)) {
      const previous = material.map
      material.map = this.#textures.restore(state.texture)
      if (previous?.userData?.pandauiOwnedTexture) previous.dispose()
    }
    if (state.color != null && material.color != null) material.color.setHex(state.color)
    if (state.emissive != null && material.emissive != null) material.emissive.setHex(state.emissive)
    if (state.emissiveIntensity != null && material.emissiveIntensity != null) material.emissiveIntensity = state.emissiveIntensity
    if (state.metalness != null && material.metalness != null) material.metalness = state.metalness
    if (state.roughness != null && material.roughness != null) material.roughness = state.roughness
    if (state.opacity != null && material.opacity != null) material.opacity = state.opacity
    if (state.transparent != null && material.transparent != null) material.transparent = state.transparent
    if (state.wireframe != null && material.wireframe != null) material.wireframe = state.wireframe
    if (state.depthWrite != null) material.depthWrite = state.depthWrite
    if (state.clearcoat != null && material.clearcoat != null) material.clearcoat = state.clearcoat
    if (state.clearcoatRoughness != null && material.clearcoatRoughness != null) material.clearcoatRoughness = state.clearcoatRoughness
    if (state.transmission != null && material.transmission != null) material.transmission = state.transmission
    if (state.reflectivity != null && material.reflectivity != null) material.reflectivity = state.reflectivity
    if (state.bumpScale != null && material.bumpScale != null) material.bumpScale = state.bumpScale
    if (state.normalScale != null && material.normalScale != null) material.normalScale.setScalar(state.normalScale)
    if (state.surface) setSurfaceSettings(material, state.surface)
    if (state.reflectivity != null && material.reflectivity != null) material.reflectivity = state.reflectivity
    applyMaterialSurface(material)
    material.needsUpdate = true
  }

  restoreMaterialCollection (state, material) {
    if (!state || !material) return material
    if (Array.isArray(state)) {
      return state.map((item, index) => this.restoreMaterialCollection(item,
        Array.isArray(material) ? (material[index] || material[0].clone()) : material.clone()))
    }
    if (Array.isArray(material)) material = material[0].clone()
    this.restoreMaterialSnapshot(state, material)
    return material
  }

  captureSelectedMaterialSnapshot () {
    const root = this.#services.getSelectedObjectRoot()
    if (root == null) return null
    const snapshot = {
      marker: this.#services.createSceneObjectMarker(root),
      documentId: root.userData?.documentId || null,
      geometryId: root.userData?.geometryId || null,
      meshes: [],
      edges: []
    }
    root.traverse(object => {
      if (object.isMesh) {
        snapshot.meshes.push({
          shading: this.materialSnapshot(object.userData.displayMaterials?.shading),
          objectId: object.uuid,
          render: this.materialSnapshot(object.userData.displayMaterials?.render),
          renderMaterialId: object.userData.renderMaterialId || null
        })
      } else if (object.isLine || object.isLineSegments) {
        snapshot.edges.push({ material: this.materialSnapshot(object.material), objectId: object.uuid })
      }
    })
    return snapshot
  }

  restoreSelectedMaterialSnapshot (snapshot) {
    if (!snapshot?.marker) return false
    const root = this.#services.resolveSceneObjects(snapshot.marker)[0]
    if (!root) return false
    materializeBrepSelection(root)
    detachDisplayMaterials(root, ['shading', 'render', 'edge'])
    const previousMaterials = this.ownedMaterials(root)
    const meshes = []; const edges = []
    root.traverse(object => {
      if (object.isMesh) meshes.push(object)
      else if (object.isLine || object.isLineSegments) edges.push(object)
    })
    const meshById = new Map(meshes.map(object => [object.uuid, object]))
    const edgeById = new Map(edges.map(object => [object.uuid, object]))
    snapshot.meshes.forEach((state, index) => {
      const object = meshById.get(state.objectId) || meshes[index]
      if (!object) return
      const materials = object.userData.displayMaterials
      if (materials) materials.shading = this.restoreMaterialCollection(state.shading, materials.shading || object.material)
      else object.material = this.restoreMaterialCollection(state.shading, object.material)
      const entry = state.renderMaterialId && this.#services.getRenderMaterial(state.renderMaterialId, snapshot.documentId)
      if (entry?.material && materials) materials.render = entry.material
      else if (materials) materials.render = this.restoreMaterialCollection(state.render, materials.render || object.material)
      else object.material = this.restoreMaterialCollection(state.render, object.material)
      object.userData.renderMaterialId = state.renderMaterialId || null
      if (materials) object.material = this.#services.isRenderEnabled() ? materials.render : materials.shading
    })
    snapshot.edges.forEach((state, index) => {
      const object = edgeById.get(state.objectId) || edges[index]
      if (object) object.material = this.restoreMaterialCollection(state.material || state, object.material)
    })
    this.releaseReplacedMaterials(root, previousMaterials)
    this.#services.notifySelectionChanged(this.getSelectedMaterialSettings())
    this.#services.setDirtyFlag()
    return true
  }

  assignSelectedRenderMaterial (entry) {
    const root = this.#services.getSelectedObjectRoot()
    if (root?.userData?.readOnly) return false
    if (root == null || entry?.material == null) return false
    materializeBrepSelection(root)
    const beforeSnapshot = this.captureSelectedMaterialSnapshot()
    const previousMaterials = this.ownedMaterials(root)
    let assigned = false
    const renderModeActive = this.#services.viewModel?.().model1?.displayMode === 'render' || this.#services.isRenderEnabled()
    root.traverse(object => {
      const materials = object.userData.displayMaterials
      if (!object.isMesh || materials?.render == null) return
      if (entry.material.map != null) this.ensureTextureCoordinates(object)
      materials.render = entry.material
      object.userData.renderMaterialId = entry.id
      if (renderModeActive) object.material = entry.material
      assigned = true
    })
    if (assigned) {
      this.releaseReplacedMaterials(root, previousMaterials)
      const afterSnapshot = this.captureSelectedMaterialSnapshot()

      this.#services.getOperations().recordState('scene.materials', beforeSnapshot, afterSnapshot, 'Assign Render material')
      this.#services.notifySelectionChanged(this.getSelectedMaterialSettings())
      this.#services.setDirtyFlag()
    }
    return assigned
  }

  getEditableMaterials (object = this.#services.getSelectedObject()) {
    if (object == null) return []
    const materials = []
    const addMaterial = material => {
      if (material != null && !materials.includes(material)) materials.push(material)
    }
    object.traverse(child => {
      if (child.isLine) {
        const lineMaterials = Array.isArray(child.material) ? child.material : [child.material]
        lineMaterials.forEach(addMaterial)
        return
      }
      if (!child.isMesh) return
      const displayMaterials = child.userData.displayMaterials
      if (displayMaterials?.render != null) {
        const renderMaterials = Array.isArray(displayMaterials.render) ? displayMaterials.render : [displayMaterials.render]
        renderMaterials.forEach(addMaterial)
        return
      }
      const activeMaterials = Array.isArray(child.material) ? child.material : [child.material]
      activeMaterials.forEach(addMaterial)
    })
    return materials
  }

  getSelectedShadingMaterialSettings () {
    const root = this.#services.getSelectedObjectRoot()
    if (root == null) return null
    let material = null
    root.traverse(object => {
      if (material == null && (object.isMesh || object.isLine)) material = object.userData.displayMaterials?.shading || object.material
    })
    if (material == null) return null
    return { color: '#' + (material.color?.getHex() ?? 0xffffff).toString(16).padStart(6, '0'), opacity: material.opacity ?? 1, transparent: material.transparent === true, name: root.name || root.userData?.originalName || 'Selected object' }
  }

  updateSelectedShadingMaterial (settings = {}) {
    if (this.#services.getSelectedObjectRoot()?.userData?.readOnly) return false
    const root = this.#services.getSelectedObjectRoot()
    if (root == null) return false
    materializeBrepSelection(root)
    const beforeSnapshot = this.captureSelectedMaterialSnapshot()
    detachDisplayMaterials(root, ['shading', 'edge'])
    let updated = false
    root.traverse(object => {
      if (!object.isMesh) return
      const material = object.userData.displayMaterials?.shading || object.material
      if (material == null) return
      if (settings.color != null && material.color != null) material.color.set(settings.color)
      if (settings.opacity != null && material.opacity != null) material.opacity = THREE.MathUtils.clamp(Number(settings.opacity), 0, 1)
      if (settings.transparent != null && material.transparent != null) material.transparent = settings.transparent === true
      material.transparent = material.opacity < 0.995
      material.depthWrite = material.transparent !== true || material.opacity >= 1
      material.needsUpdate = true
      if (this.#services.viewModel?.().model1?.displayMode !== 'render') object.material = material
      updated = true
    })
    if (settings.color != null || settings.opacity != null) {
      const shadingColor = settings.color
      const shadingOpacity = settings.opacity == null ? null : THREE.MathUtils.clamp(Number(settings.opacity), 0, 1)
      root.traverse(object => {
        if (!(object.isLine || object.isLineSegments) || object.userData?.edgeColorFollowsShading === false) return
        const edgeMaterial = Array.isArray(object.material) ? object.material : [object.material]
        edgeMaterial.forEach(material => {
          if (shadingColor != null && material.color != null) material.color.set(shadingColor)
          if (shadingOpacity != null && material.opacity != null) material.opacity = shadingOpacity
          if (shadingOpacity != null && material.transparent != null) material.transparent = shadingOpacity < 0.995
          material.depthWrite = material.depthTest && !material.transparent
          material.needsUpdate = true
          updated = true
        })
      })
    }
    if (updated) {
      const afterSnapshot = this.captureSelectedMaterialSnapshot()

      this.#services.getOperations().recordState('scene.materials', beforeSnapshot, afterSnapshot, 'Change Shade material')
      this.#services.notifySelectionChanged(this.getSelectedMaterialSettings())
      this.#services.setDirtyFlag()
    }
    return updated
  }

  getSelectedMaterialSettings () {
    if (this.#services.getSelectedObject() == null) return null
    const materials = this.getEditableMaterials()
    // The material panel edits the render material only. Shading materials
    // retain the imported display color and remain independent of render edits.
    const activeMaterial = materials.find(material => material != null)
    const physicalMaterial = materials.find(material => material.roughness != null || material.metalness != null)
    const emissiveMaterial = materials.find(material => material.emissive != null)
    if (activeMaterial == null) return null
    // Textures belong to the render material and never affect Shade mode.
    const texturedMaterial = materials.find(material =>
      material.map != null && material.map.userData?.pandauiTextureName
    )
    const supportsTexture = materials.some(material => {
      return material.isMeshStandardMaterial ||
        material.isMeshPhongMaterial ||
        material.isMeshLambertMaterial ||
        material.isMeshBasicMaterial ||
        material.isLineBasicMaterial ||
        ('map' in material)
    })
    const texture = texturedMaterial?.map || null
    return {
      name: this.#services.getSelectedObject().name || this.#services.getSelectedObject().userData.pandauiObjectId || 'Selected object',
      scope: this.#services.getSelectedObject().userData.displayMaterials?.render != null ? 'Render material' : 'Material',
      type: activeMaterial.type || 'Material',
      color: `#${(activeMaterial.color?.getHex() ?? 0xffffff).toString(16).padStart(6, '0')}`,
      emissive: `#${(emissiveMaterial?.emissive?.getHex() ?? 0x000000).toString(16).padStart(6, '0')}`,
      emissiveIntensity: emissiveMaterial?.emissiveIntensity ?? 1,
      metalness: physicalMaterial?.metalness ?? 0,
      roughness: physicalMaterial?.roughness ?? 0.5,
      opacity: activeMaterial.opacity ?? 1,
      transparent: activeMaterial.transparent === true,
      wireframe: activeMaterial.wireframe === true,
      supportsEmissive: emissiveMaterial != null,
      supportsPhysical: physicalMaterial != null,
      supportsWireframe: materials.some(material => material.wireframe != null),
      supportsTexture,
      textureName: texture?.userData?.pandauiTextureName || '',
      // UV editing settings (stored on the texture object). Only meaningful
      // when a texture is actually loaded. Rotation is exposed in degrees
      // for a more intuitive UI; Three.js internally uses radians.
      uvScaleU: texture?.repeat?.x ?? 1,
      uvScaleV: texture?.repeat?.y ?? 1,
      uvOffsetU: texture?.offset?.x ?? 0,
      uvOffsetV: texture?.offset?.y ?? 0,
      uvRotation: texture != null ? (texture.rotation * 180) / Math.PI : 0,
      // wrapMode: 1 = RepeatWrapping, 2 = ClampToEdgeWrapping
      uvWrapMode: texture?.wrapS === 1 || texture?.wrapS === 2 ? texture.wrapS : 1,
      supportsUv: texture != null,
      renderMaterialId: this.getSelectedRenderMaterialId()
    }
  }

  ensureTextureCoordinates (object) {
    const geometry = object?.geometry
    const position = geometry?.getAttribute('position')
    if (position == null || geometry.getAttribute('uv') != null) return

    geometry.computeBoundingBox()
    const bounds = geometry.boundingBox
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const axes = [0, 1, 2].sort((left, right) => size.getComponent(right) - size.getComponent(left))
    const uAxis = axes[0]
    const vAxis = axes[1]
    const uSize = Math.max(size.getComponent(uAxis), 0.000001)

    const vSize = Math.max(size.getComponent(vAxis), 0.000001)
    const uMin = bounds.min.getComponent(uAxis)
    const vMin = bounds.min.getComponent(vAxis)
    const uv = new Float32Array(position.count * 2)
    const coordinateAt = (index, axis) => {
      if (axis === 0) return position.getX(index)
      if (axis === 1) return position.getY(index)
      return position.getZ(index)
    }
    for (let index = 0; index < position.count; index++) {
      uv[index * 2] = (coordinateAt(index, uAxis) - uMin) / uSize
      uv[index * 2 + 1] = (coordinateAt(index, vAxis) - vMin) / vSize
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }

  async setSelectedMaterialTexture (file) {
    if (this.#services.getSelectedObjectRoot()?.userData?.readOnly) return false
    const textureFile = Array.isArray(file) ? file[0] : file
    if (this.#services.getSelectedObject() == null || textureFile == null) return
    const target = this.#services.getSelectedObject()
    const sourceUrl = URL.createObjectURL(textureFile)
    let texture = null
    try {
      texture = await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(sourceUrl, resolve, undefined, reject)
      })
    } catch (err) {
      console.error('Failed to load texture:', err)
      URL.revokeObjectURL(sourceUrl)
      return
    }
    URL.revokeObjectURL(sourceUrl)
    if (this.#services.getSelectedObject() !== target) { texture.dispose(); return }
    materializeBrepSelection(target)
    const beforeSnapshot = this.captureSelectedMaterialSnapshot()
    this.detachRenderMaterials(target)
    // Three.js r120 Texture does not auto-initialize userData (unlike
    // Object3D / Material / BufferGeometry), so we must create it first.
    if (!texture.userData) texture.userData = {}
    texture.encoding = THREE.sRGBEncoding
    texture.flipY = false
    texture.needsUpdate = true
    texture.userData.pandauiTextureName = textureFile.name
    texture.userData.pandauiSelectedMaterialTexture = true
    this.ensureTextureCoordinates(this.#services.getSelectedObject())
    const replacedTextures = new Set()
    const materials = this.getEditableMaterials()
    let textureApplied = false
    materials.forEach(material => {
      // Only apply to material types that support a base color map.
      const supportsMap = material.isMeshStandardMaterial ||
        material.isMeshPhongMaterial ||
        material.isMeshLambertMaterial ||
        material.isMeshBasicMaterial ||
        material.isLineBasicMaterial ||
        ('map' in material)
      if (!supportsMap) return
      if (material.map != null) replacedTextures.add(material.map)
      material.map = texture
      material.needsUpdate = true
      textureApplied = true
    })
    if (!textureApplied) {
      console.warn('No material on the selected object supports texture mapping')
    }
    replacedTextures.forEach(replacedTexture => this.disposeUnusedSelectedMaterialTexture(replacedTexture))
    if (textureApplied) this.#services.getOperations().recordState('scene.materials', beforeSnapshot, this.captureSelectedMaterialSnapshot(), 'Set material texture')
    else texture.dispose()
    this.#services.notifySelectionChanged(this.getSelectedMaterialSettings())
    this.#services.setDirtyFlag()
  }

  clearSelectedMaterialTexture () {
    if (this.#services.getSelectedObject() == null) return
    materializeBrepSelection(this.#services.getSelectedObject())
    const beforeSnapshot = this.captureSelectedMaterialSnapshot()
    this.detachRenderMaterials(this.#services.getSelectedObject())
    const removedTextures = new Set()
    const materials = this.getEditableMaterials()
    materials.forEach(material => {
      // Only clear map on material types that support texture mapping.
      const supportsMap = material.isMeshStandardMaterial ||
        material.isMeshPhongMaterial ||
        material.isMeshLambertMaterial ||
        material.isMeshBasicMaterial ||
        material.isLineBasicMaterial ||
        ('map' in material)
      if (!supportsMap) return
      if (material.map != null) removedTextures.add(material.map)
      material.map = null
      material.needsUpdate = true
    })
    removedTextures.forEach(removedTexture => this.disposeUnusedSelectedMaterialTexture(removedTexture))
    this.#services.getOperations().recordState('scene.materials', beforeSnapshot, this.captureSelectedMaterialSnapshot(), 'Clear material texture')
    this.#services.notifySelectionChanged(this.getSelectedMaterialSettings())
    this.#services.setDirtyFlag()
  }

  disposeUnusedSelectedMaterialTexture (texture) {
    if (texture?.userData?.pandauiSelectedMaterialTexture !== true && texture?.userData?.pandauiOwnedTexture !== true) return
    const stillActive = this.getEditableMaterials().some(material => material.map === texture)
    const neededForReset = this.selectionTextureIds().has(texture.userData?.pandauiTextureAssetId || texture.uuid)
    if (!stillActive && !neededForReset) texture.dispose()
  }

  updateSelectedMaterial (settings) {
    if (this.#services.getSelectedObjectRoot()?.userData?.readOnly) return false
    if (this.#services.getSelectedObject() == null || settings == null) return
    materializeBrepSelection(this.#services.getSelectedObject())
    const beforeSnapshot = this.captureSelectedMaterialSnapshot()
    this.detachRenderMaterials(this.#services.getSelectedObject())
    // Render material textures and UV transforms are isolated from Shade mode.
    const textures = new Set()
    const materials = this.getEditableMaterials()
    materials.forEach(material => {
      if (material.color != null && settings.color != null) material.color.set(settings.color)
      if (material.emissive != null && settings.emissive != null) material.emissive.set(settings.emissive)
      if (material.emissiveIntensity != null && settings.emissiveIntensity != null) material.emissiveIntensity = Number(settings.emissiveIntensity)
      if (material.metalness != null && settings.metalness != null) material.metalness = Number(settings.metalness)
      if (material.roughness != null && settings.roughness != null) material.roughness = Number(settings.roughness)
      if (material.opacity != null && settings.opacity != null) material.opacity = Number(settings.opacity)
      if (material.transparent != null && settings.transparent != null) material.transparent = settings.transparent === true
      if (material.wireframe != null && settings.wireframe != null) material.wireframe = settings.wireframe === true
      material.depthWrite = material.transparent !== true || material.opacity >= 1
      material.needsUpdate = true
      if (material.map != null) textures.add(material.map)
    })
    // Apply UV settings to every texture used by the selected render material.
    const hasUvSettings = settings.uvScaleU !== undefined || settings.uvScaleV !== undefined ||
      settings.uvOffsetU !== undefined || settings.uvOffsetV !== undefined ||
      settings.uvRotation !== undefined || settings.uvWrapMode !== undefined
    if (hasUvSettings) {
      const isolated = new Map()
      materials.forEach(material => {
        const texture = material.map
        if (!texture) return
        if (!isolated.has(texture)) {
          const cloned = texture.clone()
          cloned.userData = { ...texture.userData, pandauiOwnedTexture: true }
          isolated.set(texture, cloned)
        }
        material.map = isolated.get(texture)
      })
      isolated.forEach(texture => {
        if (settings.uvScaleU !== undefined) texture.repeat.x = Number(settings.uvScaleU)
        if (settings.uvScaleV !== undefined) texture.repeat.y = Number(settings.uvScaleV)
        if (settings.uvOffsetU !== undefined) texture.offset.x = Number(settings.uvOffsetU)
        if (settings.uvOffsetV !== undefined) texture.offset.y = Number(settings.uvOffsetV)
        if (settings.uvRotation !== undefined) texture.rotation = (Number(settings.uvRotation) * Math.PI) / 180
        if (settings.uvWrapMode !== undefined) {
          const wrap = Number(settings.uvWrapMode)
          if (texture.wrapS !== wrap) {
            texture.wrapS = wrap
            texture.wrapT = wrap
          }
        }
        texture.needsUpdate = true
      })
      textures.forEach(texture => this.disposeUnusedSelectedMaterialTexture(texture))
    }
    const afterSnapshot = this.captureSelectedMaterialSnapshot()

    this.#services.getOperations().recordState('scene.materials', beforeSnapshot, afterSnapshot, 'Change Render material')
    this.#services.setDirtyFlag()
  }

  resetSelectedMaterial () {
    if (this.#services.getSelectedObjectRoot()?.userData?.readOnly) return false
    if (!this.#selectionBaseline || !this.#services.getSelectedObject()) return
    this.#services.getOperations().recordState('scene.materials', this.captureSelectedMaterialSnapshot(), this.#selectionBaseline, 'Reset material')
  }

  captureSelection () { this.#selectionBaseline = this.captureSelectedMaterialSnapshot() }
  clearSelection () { this.#selectionBaseline = null; this.pruneTextures() }

  selectionTextureIds () {
    const ids = new Set()
    const collect = value => {
      if (!value || typeof value !== 'object') return
      if (value.textureAssetId) ids.add(value.textureAssetId)
      Object.values(value).forEach(collect)
    }
    collect(this.#selectionBaseline)
    return ids
  }

  captureRenderMaterialDefinition (id) {
    const model = this.#services.getActiveModel()
    const entry = model?.getRenderMaterial?.(id)
    const settings = model?.getRenderMaterials?.().find(material => material.id === id)
    if (entry) this.#textures.track(entry.material)
    return entry && settings ? { documentId: model.documentId, id, settings, texture: this.#textures.capture(entry.material.map) } : null
  }

  restoreRenderMaterialDefinition (state) {
    const model = this.#services.getModelDocuments().find(model => model.documentId === state.documentId)
    if (!model) throw new Error('Material document is no longer open.')
    if (state.exists === false) {
      const removed = model.removeRenderMaterial(state.id)
      this.#services.notifySelectionChanged(this.getSelectedMaterialSettings())
      this.#services.setDirtyFlag()
      return removed
    }
    let entry = model.getRenderMaterial(state.id)
    if (!entry) { model.createRenderMaterial(state.settings.name, state.id); entry = model.getRenderMaterial(state.id) }
    model.updateRenderMaterial(state.id, { materialType: state.settings.materialType })
    const previous = entry.material.map
    this.#textures.track(entry.material)
    if (!this.#textures.matches(previous, state.texture)) {
      entry.material.map = this.#textures.restore(state.texture)
      if (previous?.userData?.pandauiOwnedTexture) previous.dispose()
    }
    model.updateRenderMaterial(state.id, state.settings)
    this.#services.notifySelectionChanged(this.getSelectedMaterialSettings())
    this.#services.setDirtyFlag()
    return true
  }

  createRenderMaterial (name) {
    const model = this.#services.getActiveModel()
    const result = model?.createRenderMaterial?.(name)
    if (result) this.#services.getOperations().recordState('scene.material_definition',
      { documentId: model.documentId, id: result.id, exists: false }, this.captureRenderMaterialDefinition(result.id), 'Create Render material')
    return result || null
  }

  editRenderMaterial (id, method, settings, label) {
    const before = this.captureRenderMaterialDefinition(id)
    const result = this.#services.getActiveModel()?.[method]?.(id, settings) || null
    if (before && result) this.#services.getOperations().recordState('scene.material_definition', before, this.captureRenderMaterialDefinition(id), label)
    return result
  }

  async setRenderMaterialTexture (id, file) {
    const model = this.#services.getActiveModel()
    const before = this.captureRenderMaterialDefinition(id)
    if (!before) return null
    const result = await model.setRenderMaterialTexture(id, file)
    if (model !== this.#services.getActiveModel() || model.disposed) return null
    if (result) this.#services.getOperations().recordState('scene.material_definition', before, this.captureRenderMaterialDefinition(id), 'Set Render texture')
    return result
  }

  pruneTextures () {
    if (!this.#textures.size) return
    const retained = this.#services.getOperations()?.textureResourceIds?.() || new Set()
    const retain = texture => { if (texture) retained.add(texture.userData?.pandauiTextureAssetId || texture.uuid) }
    this.#services.getModelDocuments().forEach(model => {
      model.renderMaterialLibrary?.forEach(entry => { retain(entry.material?.map); retain(entry.original?.map) })
    })
    this.selectionTextureIds().forEach(id => retained.add(id))
    this.#textures.retain(retained)
  }

  clearResources () { this.#selectionBaseline = null; this.#textures.dispose() }

  observeOperations () { this.#unsubscribeHistory = this.#services.getOperations().subscribe(() => this.pruneTextures()) }
  dispose () { this.#unsubscribeHistory?.(); this.#unsubscribeHistory = null; this.clearResources() }
}
