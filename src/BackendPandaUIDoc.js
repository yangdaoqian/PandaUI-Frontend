import * as THREE from 'three'
import clearObjectChildren from './display/clearObjectChildren'
import ChunkStreamReader from './ChunkStreamReader'
import DisplayTaskQueue from './DisplayTaskQueue'
import { createPointMaterial } from './PointDisplaySettings'
import { prepareEdgeRanges, setBrepSmoothEdges, mergeBrepGeometries } from './BrepDisplayRanges'
import { geometryReference } from './DisplayResources'
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { documentGeometryVisible } from './GeometryDocumentViewState'
import { releaseDocumentResource } from './DocumentObjectMoves'
import { createDisplayLighting } from './DisplayLighting'
import { configureRenderShadows, disposeRenderShadows } from './RenderShadows'
import { applyRenderMaterialSettings, applyShadingMaterialSettings, normalizeRenderSettings, normalizeShadingSettings } from './DisplayMaterialSettings'
import { setSurfaceSettings } from './render/MaterialSurface'

function createLayerTree (layers) {
  const roots = []
  const nodes = new Map()
  ;(layers || []).forEach(layer => {
    const fullPath = String(layer.path || 'Default')
    const parts = fullPath.split('::').filter(Boolean)
    let parent = roots
    let path = ''
    parts.forEach((label, index) => {
      path = path === '' ? label : `${path}::${label}`
      let node = nodes.get(path)
      if (node == null) {
        node = { label, fullPath: path, visible: true, children: [] }
        nodes.set(path, node)
        parent.push(node)
      }
      if (index === parts.length - 1) node.visible = layer.visible !== false
      parent = node.children
    })
  })
  return roots
}

function createLayerVisibilityMap (layers, parentVisible = true, output = new Map()) {
  ;(layers || []).forEach(layer => {
    const visible = parentVisible && layer.visible !== false
    output.set(layer.fullPath, visible)
    createLayerVisibilityMap(layer.children || [], visible, output)
  })
  return output
}

function isPureBlack (color) {
  return color[0] === 0 && color[1] === 0 && color[2] === 0
}

function surfaceColor (color) {
  if (isPureBlack(color)) return new THREE.Color(0.72, 0.72, 0.72)
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255)
}

function createMeshTriangleEdges (geometry) {
  const position = geometry.getAttribute('position')
  if (position == null || position.count < 3) return null
  const index = geometry.index
  const triangleCount = index == null ? Math.floor(position.count / 3) : Math.floor(index.count / 3)
  if (triangleCount < 1) return null
  const edgePositions = []
  const pointIndex = triangleIndex => index == null ? triangleIndex : index.getX(triangleIndex)
  const appendEdge = (first, second) => {
    edgePositions.push(
      position.getX(first), position.getY(first), position.getZ(first),
      position.getX(second), position.getY(second), position.getZ(second)
    )
  }
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const offset = triangle * 3
    const first = pointIndex(offset)
    const second = pointIndex(offset + 1)
    const third = pointIndex(offset + 2)
    appendEdge(first, second)
    appendEdge(second, third)
    appendEdge(third, first)
  }
  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3))
  edgeGeometry.computeBoundingSphere()
  return edgeGeometry
}

const MAX_MESH_FACE_EDGE_VERTICES = 5000000
const SCENE_BATCH_BYTES = 1024 * 1024
function reportMeshProgress (detail) {
  window.dispatchEvent(new CustomEvent('pandaui-mesh-progress', { detail }))
}

function clamp01 (value, fallback = 0) {
  const number = Number(value)
  return THREE.MathUtils.clamp(Number.isFinite(number) ? number : fallback, 0, 1)
}

const MATERIAL_TYPES = ['general', 'glass', 'metal', 'plastic', 'emissive', 'paint', 'textured']

function materialTypeDefaults (type) {
  switch (type) {
    case 'glass': return { metalness: 0, roughness: 0.08, transmission: 0.95, reflectivity: 0.72, clearcoat: 0.1, clearcoatRoughness: 0.08, opacity: 1, transparent: true }
    case 'metal': return { metalness: 1, roughness: 0.24, transmission: 0, reflectivity: 0.82, clearcoat: 0.08, clearcoatRoughness: 0.2, opacity: 1, transparent: false }
    case 'plastic': return { metalness: 0, roughness: 0.38, transmission: 0, reflectivity: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.25, opacity: 1, transparent: false }
    case 'emissive': return { metalness: 0, roughness: 0.55, transmission: 0, reflectivity: 0.2, clearcoat: 0, clearcoatRoughness: 0.5, opacity: 1, transparent: false, emissiveIntensity: 2 }
    case 'paint': return { metalness: 0, roughness: 0.28, transmission: 0, reflectivity: 0.55, clearcoat: 0.75, clearcoatRoughness: 0.12, opacity: 1, transparent: false }
    case 'textured': return { metalness: 0, roughness: 0.52, transmission: 0, reflectivity: 0.5, clearcoat: 0, clearcoatRoughness: 0.3, opacity: 1, transparent: false }
    default: return { metalness: 0, roughness: 0.55, transmission: 0, reflectivity: 0.5, clearcoat: 0, clearcoatRoughness: 0.28, opacity: 1, transparent: false }
  }
}

function colorHex (value, fallback = '#ffffff') {
  if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) return value
  if (!Array.isArray(value)) return fallback
  return '#' + value.slice(0, 3).map(channel => Math.max(0, Math.min(255, Math.round(Number(channel) || 0))).toString(16).padStart(2, '0')).join('')
}

function surfacePatchFromAppearance (appearance = {}, materialType, values = {}) {
  return {
    materialType,
    reflection: appearance.reflection ?? appearance.reflectivity ?? values.reflectivity ?? 1,
    ior: appearance.ior ?? 1.5,
    transmission: values.transmission ?? appearance.transmission ?? 0,
    refractionRoughness: appearance.refractionRoughness ?? 0,
    frostDistance: appearance.frostDistance ?? 1000,
    thickness: appearance.thickness ?? 1,
    refractionColor: colorHex(appearance.refractionColor, '#ffffff'),
    attenuationDistance: appearance.attenuationDistance ?? 10,
    roughness: values.roughness,
    metalness: values.metalness,
    opacity: values.opacity,
    clearcoat: values.clearcoat,
    clearcoatRoughness: values.clearcoatRoughness,
    bumpScale: appearance.bumpScale ?? 1,
    normalScale: appearance.normalScale ?? 1,
    emissiveIntensity: appearance.emissiveIntensity ?? 0
  }
}

function resolveMaterialType (appearance = {}) {
  const explicit = String(appearance.materialType || '').toLowerCase()
  if (MATERIAL_TYPES.includes(explicit)) return explicit
  const name = String(appearance.materialName || '').toLowerCase()
  const emission = Number(appearance.emissiveIntensity) || 0
  const transmission = clamp01(appearance.transmission, 0)
  const opacity = clamp01(appearance.renderOpacity ?? appearance.opacity, 1)
  const metalness = clamp01(appearance.metalness, 0)
  const clearcoat = clamp01(appearance.clearcoat, 0)
  if (emission > 0.01 || /emiss|light/.test(name)) return 'emissive'
  if (transmission > 0.15 || opacity < 0.85 || /glass|crystal/.test(name)) return 'glass'
  if (metalness > 0.65 || /metal|steel|aluminum|chrome/.test(name)) return 'metal'
  if (clearcoat > 0.25 || /paint|coating|lacquer/.test(name)) return 'paint'
  if (appearance.hasTexture === true) return 'textured'
  if (/plastic|resin/.test(name)) return 'plastic'
  return 'general'
}

function appearanceNumber (appearance, name, fallback, minimum = 0, maximum = 1) {
  const number = Number(appearance?.[name])
  return THREE.MathUtils.clamp(Number.isFinite(number) ? number : fallback, minimum, maximum)
}

function importedMaterialSignature (appearance = {}) {
  const color = appearance.diffuse || appearance.color || [154, 167, 181]
  const emissive = appearance.emissive || [0, 0, 0]
  const normalizedNumber = (value, fallback) => Number(value ?? fallback)
  return JSON.stringify({
    name: String(appearance.materialName || 'Unnamed Material').trim() || 'Unnamed Material',
    materialType: resolveMaterialType(appearance),
    color: color.slice(0, 3).map(value => Number(value) || 0),
    emissive: emissive.slice(0, 3).map(value => Number(value) || 0),
    opacity: normalizedNumber(appearance.renderOpacity ?? appearance.opacity, 1),
    metalness: normalizedNumber(appearance.metalness, 0),
    roughness: normalizedNumber(appearance.roughness, 0.72),
    transmission: normalizedNumber(appearance.transmission, 0),
    clearcoat: normalizedNumber(appearance.clearcoat, 0),
    clearcoatRoughness: normalizedNumber(appearance.clearcoatRoughness, 0.28),
    reflectivity: normalizedNumber(appearance.reflectivity, 0.5),
    ior: normalizedNumber(appearance.ior, 1.5),
    specular: normalizedNumber(appearance.specular, 0.5),
    specularTint: normalizedNumber(appearance.specularTint, 0),
    anisotropy: normalizedNumber(appearance.anisotropy, 0),
    anisotropyRotation: normalizedNumber(appearance.anisotropyRotation, 0),
    sheen: normalizedNumber(appearance.sheen, 0),
    emissiveIntensity: normalizedNumber(appearance.emissiveIntensity, 0),
    reflection: normalizedNumber(appearance.reflection ?? appearance.reflectivity, 1),
    refractionRoughness: normalizedNumber(appearance.refractionRoughness, 0),
    frostDistance: normalizedNumber(appearance.frostDistance, 1000),
    thickness: normalizedNumber(appearance.thickness, 1),
    refractionColor: colorHex(appearance.refractionColor),
    attenuationDistance: normalizedNumber(appearance.attenuationDistance, 10),
    bumpScale: normalizedNumber(appearance.bumpScale, 1),
    normalScale: normalizedNumber(appearance.normalScale, 1),
    transparent: appearance.transparent === true,
    // Deferred images have not been compared yet; do not merge them on color.
    textureSource: appearance.hasTexture ? (appearance.materialId || appearance.materialName) : null,
    physicallyBased: appearance.physicallyBased === true,
    hasTexture: appearance.hasTexture === true
  })
}

function setPhysicalBase (material, values) {
  material.userData.pandauiPhysicalBase = {
    metalness: values.metalness,
    roughness: values.roughness,
    clearcoat: values.clearcoat,
    clearcoatRoughness: values.clearcoatRoughness,
    reflectivity: values.reflectivity
  }
}

function applyMaterialTypePreset (material, materialType) {
  const defaults = materialTypeDefaults(materialType)
  material.userData.pandauiMaterialType = materialType
  material.metalness = defaults.metalness
  material.roughness = defaults.roughness
  material.transmission = defaults.transmission
  material.reflectivity = defaults.reflectivity
  material.clearcoat = defaults.clearcoat
  material.clearcoatRoughness = defaults.clearcoatRoughness
  material.opacity = defaults.opacity
  material.transparent = defaults.transparent
  if (defaults.emissiveIntensity != null) material.emissiveIntensity = defaults.emissiveIntensity
  material.depthWrite = !material.transparent && material.transmission <= 0
  setPhysicalBase(material, defaults)
  setSurfaceSettings(material, surfacePatchFromAppearance(defaults, materialType, defaults))
  material.reflectivity = defaults.reflectivity
  setPhysicalBase(material, defaults)
}

function createRenderMaterial (appearance = {}) {
  const materialType = resolveMaterialType(appearance)
  const defaults = materialTypeDefaults(materialType)
  const sourceColor = appearance.diffuse || appearance.color || [154, 167, 181]
  const sourceEmissive = appearance.emissive || [0, 0, 0]
  const opacity = appearanceNumber(appearance, 'renderOpacity', appearanceNumber(appearance, 'opacity', defaults.opacity))
  const transmission = appearanceNumber(appearance, 'transmission', defaults.transmission)
  const transparent = appearance.transparent === true || opacity < 0.995 || transmission > 0.001 || defaults.transparent
  const values = {
    metalness: appearanceNumber(appearance, 'metalness', defaults.metalness),
    roughness: appearanceNumber(appearance, 'roughness', defaults.roughness, 0.04, 1),
    transmission,
    reflectivity: appearanceNumber(appearance, 'reflectivity', appearanceNumber(appearance, 'specular', defaults.reflectivity)),
    clearcoat: appearanceNumber(appearance, 'clearcoat', defaults.clearcoat),
    clearcoatRoughness: appearanceNumber(appearance, 'clearcoatRoughness', defaults.clearcoatRoughness),
    opacity,
    transparent
  }
  const material = new THREE.MeshPhysicalMaterial({
    color: surfaceColor(sourceColor),
    emissive: new THREE.Color(sourceEmissive[0] / 255, sourceEmissive[1] / 255, sourceEmissive[2] / 255),
    emissiveIntensity: Math.max(0, Number(appearance.emissiveIntensity ?? defaults.emissiveIntensity ?? 0)),
    metalness: values.metalness,

    roughness: values.roughness,
    transparent: values.transparent,
    opacity: values.opacity,
    transmission: values.transmission,
    reflectivity: values.reflectivity,
    clearcoat: values.clearcoat,
    clearcoatRoughness: values.clearcoatRoughness,
    depthTest: true,
    depthWrite: !values.transparent && values.transmission <= 0,
    side: THREE.DoubleSide
  })
  material.userData.pandauiMaterialType = materialType
  material.userData.pandauiPhysicallyBased = appearance.physicallyBased === true
  material.userData.pandauiIor = appearanceNumber(appearance, 'ior', 1.5, 1, 3)
  material.userData.pandauiSpecularTint = appearanceNumber(appearance, 'specularTint', 0)
  material.userData.pandauiAnisotropy = appearanceNumber(appearance, 'anisotropy', 0)
  material.userData.pandauiAnisotropyRotation = appearanceNumber(appearance, 'anisotropyRotation', 0)
  material.userData.pandauiSheen = appearanceNumber(appearance, 'sheen', 0)
  if (material.userData.pandauiSheen > 0) material.sheen = material.color.clone().lerp(new THREE.Color(0xffffff), 1 - material.userData.pandauiSheen)
  setPhysicalBase(material, values)
  setSurfaceSettings(material, surfacePatchFromAppearance(appearance, materialType, values))
  // The legacy material editor exposes reflectivity separately from IOR.
  // Keep that value as the native environment response while the surface
  // shader uses the stored IOR for refraction/Fresnel.
  material.reflectivity = values.reflectivity
  setPhysicalBase(material, values)
  return material
}

function materialSettings (entry) {
  const material = entry.material
  const texture = material.map || null
  const base = material.userData.pandauiPhysicalBase || {}
  const surface = material.userData.pandaSurface || {}
  return {
    id: entry.id, name: entry.name, source: entry.source, type: material.type || 'MeshPhysicalMaterial',
    materialType: material.userData.pandauiMaterialType || 'general',
    physicallyBased: material.userData.pandauiPhysicallyBased === true,
    color: '#' + material.color.getHexString(), emissive: '#' + material.emissive.getHexString(),
    emissiveIntensity: material.emissiveIntensity ?? 0, metalness: base.metalness ?? material.metalness ?? 0,
    roughness: base.roughness ?? material.roughness ?? 0.5, transmission: material.transmission ?? 0,
    reflectivity: base.reflectivity ?? material.reflectivity ?? 0.5, clearcoat: base.clearcoat ?? material.clearcoat ?? 0,
    clearcoatRoughness: base.clearcoatRoughness ?? material.clearcoatRoughness ?? 0.25, ior: material.userData.pandauiIor ?? 1.5,
    reflection: surface.reflection ?? base.reflectivity ?? material.reflectivity ?? 0.5,
    refractionRoughness: surface.refractionRoughness ?? 0,
    frostDistance: surface.frostDistance ?? 1000,
    thickness: surface.thickness ?? 1,
    refractionColor: surface.refractionColor ?? '#ffffff',
    attenuationDistance: surface.attenuationDistance ?? 10,
    specularTint: material.userData.pandauiSpecularTint ?? 0, anisotropy: material.userData.pandauiAnisotropy ?? 0,
    anisotropyRotation: material.userData.pandauiAnisotropyRotation ?? 0, sheen: material.userData.pandauiSheen ?? 0,
    opacity: material.opacity ?? 1, transparent: material.transparent === true, wireframe: material.wireframe === true,
    textureName: texture?.userData?.pandauiTextureName || '', uvScaleU: texture?.repeat?.x ?? 1, uvScaleV: texture?.repeat?.y ?? 1,
    uvOffsetU: texture?.offset?.x ?? 0, uvOffsetV: texture?.offset?.y ?? 0,
    uvRotation: texture == null ? 0 : THREE.MathUtils.radToDeg(texture.rotation),
    uvWrapMode: texture?.wrapS === THREE.ClampToEdgeWrapping ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping,
    supportsUv: texture != null
  }
}

function captureMaterialState (material) {
  const base = material.userData.pandauiPhysicalBase || {}
  return {
    name: material.name, color: material.color.getHex(), emissive: material.emissive.getHex(), emissiveIntensity: material.emissiveIntensity,
    materialType: material.userData.pandauiMaterialType || 'general', physicallyBased: material.userData.pandauiPhysicallyBased === true,
    metalness: base.metalness ?? material.metalness, roughness: base.roughness ?? material.roughness,
    clearcoat: base.clearcoat ?? material.clearcoat, clearcoatRoughness: base.clearcoatRoughness ?? material.clearcoatRoughness,
    opacity: material.opacity, transparent: material.transparent, wireframe: material.wireframe, transmission: material.transmission,
    reflectivity: base.reflectivity ?? material.reflectivity, ior: material.userData.pandauiIor, specularTint: material.userData.pandauiSpecularTint,
    anisotropy: material.userData.pandauiAnisotropy, anisotropyRotation: material.userData.pandauiAnisotropyRotation, sheen: material.userData.pandauiSheen, map: material.map || null,
    surface: material.userData.pandaSurface ? { ...material.userData.pandaSurface } : null
  }
}

export default class BackendPandaUIDoc {
  constructor (name, manifest) {
    this.name = name
    this.rhinoDoc = null
    this.three = { middleground: new THREE.Scene(), foreground: new THREE.Scene() }
    this.displayLighting = createDisplayLighting()
    this.three.middleground.add(this.displayLighting.shading)
    this.three.middleground.add(this.displayLighting.render)
    this.syncCamera = null
    this.clippingPlanes = []
    const manifestLayers = Array.isArray(manifest.layers) ? manifest.layers : []
    const chunkLayers = (Array.isArray(manifest.chunks) ? manifest.chunks : [])
      .map(chunk => ({ path: chunk.layer || 'Backend meshes', visible: true }))
    this.layers = createLayerTree(manifestLayers.concat(chunkLayers))
    if (this.layers.length === 0) this.layers = [{ label: 'Backend meshes', fullPath: 'Backend meshes', visible: true, children: [] }]
    this.layerVisibility = createLayerVisibilityMap(this.layers)
    this.chunks = manifest.chunks || []
    this.stepHierarchy = Array.isArray(manifest.stepHierarchy) ? manifest.stepHierarchy : []
    this.stepGeometrySpace = manifest.geometrySpace || 'local'
    this.stepHierarchyNodes = new Map()
    this.stepRootGroup = null
    this.objects = []
    this.objectsByGeometryId = new Map()
    this.documentId = manifest.documentId || null
    this.poolGeneration = manifest.poolGeneration || null
    this.deferredChunks = 0
    this.deferredVertices = 0
    this.sceneVertices = 0
    this.sceneSurfaceVertices = 0
    this.maxSceneVertices = Infinity
    this.sceneEdgeVertices = 0
    this.maxSceneEdgeVertices = 5000000
    this.deferredChunkQueue = []
    this.deferredChunkQueueFiles = new Set()
    this.chunkObjectOrder = new Map()
    this.nextChunkObjectOrder = 0
    this.deferredDrainPromise = null
    this.chunkAbortControllers = new Set()
    this.progressiveAbortController = new AbortController()
    this.instanceQueue = new DisplayTaskQueue(progress => {
      if (this.disposed) return
      this.onDisplayPart?.([])
      this.onDisplayChunk?.()
      window.dispatchEvent(new CustomEvent('pandaui-display-changed'))
      reportMeshProgress({ phase: 'instances', processed: progress.processed, loadedVertices: this.sceneVertices })
      this.onInstanceProgress?.(progress)
    })
    this.edgesVisible = true
    this.nonSharpEdgesVisible = true
    this.meshEdgesVisible = false
    this.meshFaceEdgesVisible = false
    this.meshFaceEdgeVertices = 0
    this.disposed = false
    this.loadedChunkFiles = new Set()
    this.sharedInstanceGeometries = new Map()
    this.pendingSharedInstanceBindings = new Map()
    this.appliedSharedInstanceBindings = new Set()
    this.deferredMeshingPromise = null
    this.initialChunkTransferComplete = false
    this.initialChunkTransferPromise = new Promise(resolve => { this.resolveInitialChunkTransfer = resolve })
    this.renderMaterialLibrary = new Map()
    this.displayMaterialPool = new Map()
    this.ownedGeometries = new Set()
    this.preparedEdgeGeometries = new WeakMap()
    this.renderMaterialAliases = new Map()
    this.renderMaterialSignatures = new Map()
    this.renderModeEnabled = false
    this.renderEnvironment = null
    this.renderSettings = normalizeRenderSettings()
    this.initializeStepHierarchy()
    ;(manifest.materials || []).forEach(item => this.registerImportedRenderMaterial(item.appearance || item))
    this.chunks.forEach(chunk => this.registerImportedRenderMaterial(chunk.appearance))
  }

  initializeStepHierarchy () {
    if (this.stepHierarchy.length === 0) return
    if (this.stepRootGroup == null) this.stepRootGroup = new THREE.Group()
    this.stepRootGroup.name = this.name || 'STEP Document'
    this.stepRootGroup.userData.documentId = this.documentId
    this.stepRootGroup.userData.originalType = 'stepDocument'
    this.stepRootGroup.userData.selectionRole = 'stepDocument'
    if (!this.stepRootGroup.parent) this.three.middleground.add(this.stepRootGroup)
    const addNode = (node, parent) => {
      if (node == null || typeof node !== 'object') return null
      let group = this.stepHierarchyNodes.get(String(node.id || ''))
      const created = group == null
      if (group == null) group = new THREE.Group()
      group.name = String(node.name || 'unnamed').trim() || 'unnamed'
      group.userData.documentId = this.documentId
      group.userData.stepNodeId = String(node.id || '')
      group.userData.stepKind = String(node.kind || 'definition')
      group.userData.originalType = group.userData.stepKind === 'occurrence' ? 'instance' : group.userData.stepKind
      group.userData.selectionRole = group.userData.stepKind === 'occurrence' ? 'instanceReference' : 'instanceDefinition'
      group.userData.stepTransform = node.transform
      if (created && node.layer != null) {
        group.fullLayerPath = node.layer
        group.userData.visible = node.visible !== false
        group.visible = documentGeometryVisible(group.userData) && this.layerVisibility.get(node.layer) !== false
      }
      if (created && this.stepGeometrySpace !== 'world') this.applyInstanceTransform(group, node.transform)
      if (group.parent !== parent) parent.add(group)
      if (group.userData.stepNodeId !== '') this.stepHierarchyNodes.set(group.userData.stepNodeId, group)
      for (const child of Array.isArray(node.children) ? node.children : []) addNode(child, group)
      return group
    }
    for (const node of this.stepHierarchy) addNode(node, this.stepHierarchyNodes.get(String(node.parentId || '')) || this.stepRootGroup)
  }

  setDocumentLayers (paths) {
    this.layers = createLayerTree(paths.map(path => ({ path, visible: this.layerVisibility.get(path) !== false })))
    this.layerVisibility = createLayerVisibilityMap(this.layers)
  }

  applyDisplayManifest (manifest) {
    this.documentId = manifest.documentId || this.documentId
    this.poolGeneration = manifest.poolGeneration || this.poolGeneration
    this.stepGeometrySpace = manifest.geometrySpace || this.stepGeometrySpace
    if (Array.isArray(manifest.stepHierarchy) || Array.isArray(manifest.stepNodes)) {
      this.stepHierarchy = manifest.stepHierarchy?.length ? manifest.stepHierarchy : manifest.stepNodes || []
      this.initializeStepHierarchy()
    }
    const layers = (manifest.layers || []).filter(layer => !this.layerVisibility.has(layer.path))
    if (layers.length) {
      const existing = Array.from(this.layerVisibility, ([path, visible]) => ({ path, visible }))
      this.layers = createLayerTree(existing.concat(layers))
      this.layerVisibility = createLayerVisibilityMap(this.layers)
    }
    ;(manifest.materials || []).forEach(item => this.registerImportedRenderMaterial(item.appearance || item))
    if (Array.isArray(manifest.geometryObjects)) {
      const records = new Map(manifest.geometryObjects.map(record => [record.geometryId, record]))
      this.three.middleground.traverse(object => {
        const record = records.get(object.userData.geometryId)
        if (!record) return
        object.userData.poolGeneration = this.poolGeneration
        object.userData.geometryType = record.geometryType
        object.userData.originalName = record.name
        object.userData.visible = record.visible !== false
        if (this.objectsByGeometryId.get(record.geometryId) === object) object.visible = documentGeometryVisible(object.userData)
      })
    }
    for (const chunk of manifest.chunks || []) {
      const group = this.objectsByGeometryId.get(chunk.geometryId)
      const nodeId = chunk.stepNodeId || chunk.parts?.find(part => part.stepNodeId)?.stepNodeId
      const parent = this.stepHierarchyNodes.get(String(nodeId || ''))
      if (group && parent && group.parent !== parent) parent.add(group)
    }
    this.onDisplayMetadata?.()
  }

  appendDisplayChunks (chunks) {
    if (!this.displayChunksBySource) this.displayChunksBySource = new Map(this.chunks.map(chunk => [chunk.sourceObject, chunk]))
    const layers = new Map()
    for (const chunk of chunks) {
      const existing = this.displayChunksBySource.get(chunk.sourceObject)
      if (!existing) {
        this.chunks.push(chunk)
        this.displayChunksBySource.set(chunk.sourceObject, chunk)
      } else if (existing.file !== chunk.file && chunk.parts) {
        const files = new Set((existing.parts || []).map(part => part.file))
        existing.parts = (existing.parts || []).concat(chunk.parts.filter(part => !files.has(part.file)))
        let offset = 0
        existing.parts = existing.parts.map(part => {
          const result = { ...part, offset }
          offset += part.bytes
          return result
        })
        existing.bytes = offset
        existing.vertices = existing.parts.reduce((total, part) => total + Number(part.vertices || 0), 0)
        existing.indices = existing.parts.reduce((total, part) => total + Number(part.indices || 0), 0)
        existing.surfaceVertices = existing.parts.reduce((total, part) => total + (this.chunkIsEdge(part) ? 0 : Number(part.vertices || 0)), 0)
        existing.primitive = existing.parts.every(part => this.chunkIsEdge(part)) ? 'lineSegments' : 'object'
      }
      for (const part of chunk.parts || [chunk]) {
        this.registerImportedRenderMaterial(part.appearance)
        const path = part.layer || 'Backend meshes'
        if (!this.layerVisibility.has(path)) layers.set(path, { path, visible: true })
      }
    }
    if (layers.size) this.applyDisplayManifest({ layers: Array.from(layers.values()) })
  }
  registerImportedRenderMaterial (appearance = {}) {
    const id = String(appearance.materialId || '').trim()
    if (id === '') return null
    const knownId = this.renderMaterialAliases.get(id) || id
    if (this.renderMaterialLibrary.has(knownId)) return this.renderMaterialLibrary.get(knownId)

    const signature = importedMaterialSignature(appearance)
    const duplicateId = this.renderMaterialSignatures.get(signature)
    if (duplicateId != null) {
      this.renderMaterialAliases.set(id, duplicateId)
      return this.renderMaterialLibrary.get(duplicateId) || null
    }

    const material = createRenderMaterial(appearance)
    const name = String(appearance.materialName || 'Unnamed Material').trim() || 'Unnamed Material'
    material.name = name
    material.userData.pandauiMaterialId = id
    const entry = { id, name, source: 'Rhino', material, original: captureMaterialState(material) }
    this.renderMaterialLibrary.set(id, entry)
    this.renderMaterialAliases.set(id, id)
    this.renderMaterialSignatures.set(signature, id)
    return entry
  }

  getRenderMaterial (id) {
    const requestedId = String(id || '')
    const canonicalId = this.renderMaterialAliases.get(requestedId) || requestedId
    return this.renderMaterialLibrary.get(canonicalId) || null
  }

  getRenderMaterials () {
    return Array.from(this.renderMaterialLibrary.values()).map(materialSettings)
  }

  createRenderMaterial (name = 'New Material', id = globalThis.crypto?.randomUUID?.() || 'custom-' + Date.now() + '-' + Math.random().toString(16).slice(2)) {
    if (this.renderMaterialLibrary.has(id)) return materialSettings(this.renderMaterialLibrary.get(id))
    const material = createRenderMaterial({ diffuse: [200, 200, 200], roughness: 0.55 })
    const materialName = String(name || 'New Material').trim() || 'New Material'
    material.name = materialName
    material.userData.pandauiMaterialId = id
    const entry = { id, name: materialName, source: 'Custom', material, original: captureMaterialState(material) }
    this.renderMaterialLibrary.set(id, entry)
    this.renderMaterialAliases.set(id, id)
    applyRenderMaterialSettings(material, this.renderSettings, this.renderEnvironment, this.renderModeEnabled)
    return materialSettings(entry)
  }

  updateRenderMaterial (id, settings = {}) {
    const entry = this.getRenderMaterial(id)
    if (entry == null) return null
    const material = entry.material
    if (settings.name != null) {

      entry.name = String(settings.name).trim() || entry.name
      material.name = entry.name
    }
    const requestedType = String(settings.materialType || material.userData.pandauiMaterialType || 'general').toLowerCase()
    const typeChanged = MATERIAL_TYPES.includes(requestedType) && requestedType !== material.userData.pandauiMaterialType
    if (typeChanged) {
      applyMaterialTypePreset(material, requestedType)
    }
    if (settings.color != null) material.color.set(settings.color)
    if (settings.emissive != null) material.emissive.set(settings.emissive)
    if (settings.emissiveIntensity != null) material.emissiveIntensity = Math.max(0, Number(settings.emissiveIntensity))
    const base = material.userData.pandauiPhysicalBase || materialTypeDefaults(requestedType)
    if (settings.metalness != null) base.metalness = clamp01(settings.metalness)
    if (settings.roughness != null) base.roughness = THREE.MathUtils.clamp(Number(settings.roughness), 0.04, 1)
    if (settings.clearcoat != null) base.clearcoat = clamp01(settings.clearcoat)
    if (settings.clearcoatRoughness != null) base.clearcoatRoughness = clamp01(settings.clearcoatRoughness)
    if (settings.reflectivity != null) base.reflectivity = clamp01(settings.reflectivity, 0.5)
    material.userData.pandauiPhysicalBase = base
    if (settings.transmission != null) material.transmission = clamp01(settings.transmission)
    if (settings.opacity != null) material.opacity = clamp01(settings.opacity, 1)
    if (settings.transparent != null) material.transparent = settings.transparent === true
    if (settings.wireframe != null) material.wireframe = settings.wireframe === true
    if (settings.ior != null) material.userData.pandauiIor = THREE.MathUtils.clamp(Number(settings.ior), 1, 3)
    if (settings.specularTint != null) material.userData.pandauiSpecularTint = clamp01(settings.specularTint)
    if (settings.anisotropy != null) material.userData.pandauiAnisotropy = clamp01(settings.anisotropy)
    if (settings.anisotropyRotation != null) material.userData.pandauiAnisotropyRotation = clamp01(settings.anisotropyRotation)
    if (settings.sheen != null) {
      material.userData.pandauiSheen = clamp01(settings.sheen)
      material.sheen = material.userData.pandauiSheen > 0 ? material.color.clone().lerp(new THREE.Color(0xffffff), 1 - material.userData.pandauiSheen) : null
    }
    setSurfaceSettings(material, surfacePatchFromAppearance(settings, requestedType, {
      metalness: material.userData.pandauiPhysicalBase.metalness,
      roughness: material.userData.pandauiPhysicalBase.roughness,
      transmission: material.transmission,
      reflectivity: material.userData.pandauiPhysicalBase.reflectivity,
      clearcoat: material.userData.pandauiPhysicalBase.clearcoat,
      clearcoatRoughness: material.userData.pandauiPhysicalBase.clearcoatRoughness,
      opacity: material.opacity,
      emissiveIntensity: material.emissiveIntensity
    }))
    // setSurfaceSettings may derive Three's legacy reflectivity from IOR;
    // restore the editor's explicit reflectivity value after that conversion.
    material.reflectivity = material.userData.pandauiPhysicalBase.reflectivity
    material.userData.pandauiIor = material.userData.pandaSurface.ior
    material.depthWrite = material.transparent !== true && material.transmission <= 0
    const texture = material.map
    if (texture != null) {
      if (settings.uvScaleU != null) texture.repeat.x = Number(settings.uvScaleU)
      if (settings.uvScaleV != null) texture.repeat.y = Number(settings.uvScaleV)
      if (settings.uvOffsetU != null) texture.offset.x = Number(settings.uvOffsetU)
      if (settings.uvOffsetV != null) texture.offset.y = Number(settings.uvOffsetV)
      if (settings.uvRotation != null) texture.rotation = THREE.MathUtils.degToRad(Number(settings.uvRotation))
      if (settings.uvWrapMode != null) texture.wrapS = texture.wrapT = Number(settings.uvWrapMode)
      texture.needsUpdate = true
    }
    applyRenderMaterialSettings(material, this.renderSettings, this.renderEnvironment, this.renderModeEnabled)
    return materialSettings(entry)
  }

  removeRenderMaterial (id) {
    const entry = this.renderMaterialLibrary.get(id)
    if (!entry) return false
    if (entry.source !== 'Custom' || this.objects.some(object => object.userData.renderMaterialId === id)) throw new Error('Cannot remove a material that is still assigned to an object.')
    entry.material.dispose()
    this.renderMaterialLibrary.delete(id)
    for (const [alias, target] of this.renderMaterialAliases) if (target === id) this.renderMaterialAliases.delete(alias)
    return true
  }

  resetRenderMaterial (id) {
    const entry = this.getRenderMaterial(id)
    if (entry == null) return null
    const state = entry.original
    entry.name = state.name || entry.name
    const material = entry.material
    material.name = entry.name
    material.color.setHex(state.color)
    material.emissive.setHex(state.emissive)
    material.emissiveIntensity = state.emissiveIntensity
    material.opacity = state.opacity
    material.transparent = state.transparent
    material.wireframe = state.wireframe
    material.transmission = state.transmission
    material.userData.pandauiMaterialType = state.materialType
    material.userData.pandauiPhysicallyBased = state.physicallyBased
    material.userData.pandauiIor = state.ior
    material.userData.pandauiSpecularTint = state.specularTint
    material.userData.pandauiAnisotropy = state.anisotropy
    material.userData.pandauiAnisotropyRotation = state.anisotropyRotation
    material.userData.pandauiSheen = state.sheen
    material.sheen = state.sheen > 0 ? material.color.clone().lerp(new THREE.Color(0xffffff), 1 - state.sheen) : null
    if (material.map != null && material.map !== state.map) material.map.dispose()
    material.map = state.map
    material.userData.pandauiPhysicalBase = { metalness: state.metalness, roughness: state.roughness, clearcoat: state.clearcoat, clearcoatRoughness: state.clearcoatRoughness, reflectivity: state.reflectivity }
    if (state.surface) setSurfaceSettings(material, state.surface)
    material.reflectivity = state.reflectivity
    material.userData.pandauiPhysicalBase.reflectivity = state.reflectivity
    material.depthWrite = material.transparent !== true && material.transmission <= 0
    applyRenderMaterialSettings(material, this.renderSettings, this.renderEnvironment, this.renderModeEnabled)
    return materialSettings(entry)
  }

  ensureTextureCoordinates (object) {
    const geometry = object?.geometry
    const position = geometry?.getAttribute('position')
    if (position == null || geometry.getAttribute('uv') != null) return
    geometry.computeBoundingBox()
    const size = new THREE.Vector3()
    geometry.boundingBox.getSize(size)
    const axes = [0, 1, 2].sort((left, right) => size.getComponent(right) - size.getComponent(left))
    const uAxis = axes[0]
    const vAxis = axes[1]
    const min = geometry.boundingBox.min
    const uSize = Math.max(size.getComponent(uAxis), 0.000001)
    const vSize = Math.max(size.getComponent(vAxis), 0.000001)
    const coordinateAt = (index, axis) => {
      if (axis === 0) return position.getX(index)
      if (axis === 1) return position.getY(index)
      return position.getZ(index)
    }
    const uv = new Float32Array(position.count * 2)
    for (let index = 0; index < position.count; index++) {
      uv[index * 2] = (coordinateAt(index, uAxis) - min.getComponent(uAxis)) / uSize
      uv[index * 2 + 1] = (coordinateAt(index, vAxis) - min.getComponent(vAxis)) / vSize
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  }

  async setRenderMaterialTexture (id, file) {
    const entry = this.getRenderMaterial(id)
    if (entry == null || file == null) return null
    const url = URL.createObjectURL(file)
    try {
      const texture = await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject)
      })
      if (texture.userData == null) texture.userData = {}
      texture.encoding = THREE.sRGBEncoding
      texture.flipY = false
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.needsUpdate = true
      texture.userData.pandauiTextureName = file.name || 'Texture'
      this.objects.forEach(object => {
        if (object.isMesh && object.userData.renderMaterialId === entry.id) this.ensureTextureCoordinates(object)
      })
      const previous = entry.material.map
      entry.material.map = texture
      entry.material.needsUpdate = true
      if (previous != null && previous !== entry.original.map) previous.dispose()
      return materialSettings(entry)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  clearRenderMaterialTexture (id) {
    const entry = this.getRenderMaterial(id)
    if (entry == null) return null
    const texture = entry.material.map
    entry.material.map = null
    entry.material.needsUpdate = true
    if (texture != null && texture !== entry.original.map) texture.dispose()
    return materialSettings(entry)
  }

  applyInstanceTransform (group, values) {
    if (!Array.isArray(values) || values.length !== 16) return
    const matrix = new THREE.Matrix4()
    matrix.set(...values.map(value => Number(value)))

    matrix.decompose(group.position, group.quaternion, group.scale)
    group.updateMatrix()
    group.updateMatrixWorld(true)
  }

  instanceChunkParent (root, chunk) {
    const path = Array.isArray(chunk.instancePath) ? chunk.instancePath : []
    if (path.length === 0) {
      if (chunk.partVisible !== false) return root
      if (!(root.userData.instanceHierarchyNodes instanceof Map)) root.userData.instanceHierarchyNodes = new Map()
      const groups = root.userData.instanceHierarchyNodes
      if (!groups.has('hidden-display-parts')) {
        const hiddenParts = new THREE.Group()
        hiddenParts.name = 'Hidden geometry'
        hiddenParts.userData.pandauiHidden = true
        hiddenParts.visible = false
        root.add(hiddenParts)
        groups.set('hidden-display-parts', hiddenParts)
      }
      return groups.get('hidden-display-parts')
    }
    let nodes = root.userData.instanceHierarchyNodes
    if (!(nodes instanceof Map)) {
      nodes = new Map()
      root.userData.instanceHierarchyNodes = nodes
    }

    const topReference = path[0]
    if (root.userData.instanceHierarchyInitialized !== true) {
      root.userData.instanceHierarchyInitialized = true
      root.userData.instanceReferenceId = topReference.referenceId || null
      root.userData.instanceReferenceName = topReference.referenceName || root.name
      root.userData.instanceDefinitionId = topReference.definitionId || null
      root.userData.instanceDefinitionName = topReference.definitionName || 'Unnamed Definition'
      this.applyInstanceTransform(root, topReference.transform)
    }

    let parent = root
    path.forEach((entry, pathIndex) => {
      if (pathIndex > 0) {
        const referenceKey = path.slice(0, pathIndex + 1).map(item => item.referenceId || item.definitionId || 'instance').join('/') + ':reference'
        let referenceGroup = nodes.get(referenceKey)
        if (referenceGroup == null) {
          referenceGroup = new THREE.Group()
          referenceGroup.name = entry.referenceName || 'Unnamed Instance'
          referenceGroup.userData.instanceReferenceId = entry.referenceId || null
          referenceGroup.userData.instanceReferenceName = referenceGroup.name
          referenceGroup.userData.instanceDefinitionId = entry.definitionId || null
          referenceGroup.userData.instanceDefinitionName = entry.definitionName || 'Unnamed Definition'
          referenceGroup.userData.originalType = 'instance'
          referenceGroup.userData.selectionRole = 'instanceReference'
          referenceGroup.userData.pandauiHidden = entry.visible === false
          referenceGroup.visible = !referenceGroup.userData.pandauiHidden
          this.applyInstanceTransform(referenceGroup, entry.transform)
          parent.add(referenceGroup)
          nodes.set(referenceKey, referenceGroup)
        }
        parent = referenceGroup
      }

      const definitionKey = path.slice(0, pathIndex + 1).map(item => item.referenceId || item.definitionId || 'instance').join('/') + ':definition'
      let definitionGroup = nodes.get(definitionKey)
      if (definitionGroup == null) {
        definitionGroup = new THREE.Group()
        definitionGroup.name = entry.definitionName || 'Unnamed Definition'
        definitionGroup.userData.instanceDefinitionId = entry.definitionId || null
        definitionGroup.userData.instanceDefinitionName = definitionGroup.name
        definitionGroup.userData.originalType = 'instanceDefinition'
        definitionGroup.userData.selectionRole = 'instanceDefinition'
        parent.add(definitionGroup)
        nodes.set(definitionKey, definitionGroup)
      }
      parent = definitionGroup
    })

    const leafId = chunk.definitionObjectId || chunk.file
    const leafKey = path.map(item => item.referenceId || item.definitionId || 'instance').join('/') + ':object:' + leafId
    let leafGroup = nodes.get(leafKey)
    if (leafGroup == null) {
      leafGroup = new THREE.Group()
      leafGroup.name = String(chunk.definitionObjectName || 'unnamed').trim() || 'unnamed'
      leafGroup.userData.definitionObjectId = chunk.definitionObjectId || null
      leafGroup.userData.definitionObjectName = leafGroup.name
      leafGroup.userData.definitionObjectType = String(chunk.definitionObjectType || 'geometry').toLowerCase()
      leafGroup.userData.definitionObjectLayer = chunk.definitionObjectLayer || 'Default'
      leafGroup.userData.originalType = leafGroup.userData.definitionObjectType
      leafGroup.userData.selectionRole = 'definitionObject'
      leafGroup.userData.pandauiHidden = chunk.definitionObjectVisible === false
      leafGroup.visible = !leafGroup.userData.pandauiHidden
      parent.add(leafGroup)
      nodes.set(leafKey, leafGroup)
    }
    return leafGroup
  }

  pooledDisplayMaterial (key, create) {
    let material = this.displayMaterialPool.get(key)
    if (!material) {
      material = create()
      material.userData.pandauiPooledMaterial = true
      this.displayMaterialPool.set(key, material)
    }
    return material
  }

  createChunkRenderable (geometry, chunk, flags) {
    const sourceAppearance = chunk.appearance || {}
    const sourceColor = sourceAppearance.color || [154, 167, 181]
    const shadingColor = surfaceColor(sourceColor)
    const wireColor = shadingColor
    if (flags & 4) {
      const material = this.pooledDisplayMaterial('point:' + wireColor.getHex(), () => createPointMaterial({ color: wireColor, sizeAttenuation: false, depthTest: true, depthWrite: true }))
      return new THREE.Points(geometry, material)
    }
    const shadingOpacity = flags & 2
      ? Math.min(1, Math.max(0, Number(sourceAppearance.opacity ?? 1)))
      : 1
    const shadingTransparent = shadingOpacity < 0.995
    if (flags & 2) {
      const meshGeometryEdges = chunk.type === 'meshGeometryEdge'
      const meshFeatureEdges = chunk.type === 'meshFeatureEdge'
      const dashedStructureEdges = meshGeometryEdges || meshFeatureEdges
      if (dashedStructureEdges && geometry.boundingSphere == null) geometry.computeBoundingSphere()
      const dashSize = Math.max(0.002, (geometry.boundingSphere?.radius || 1) * 0.018)
      const materialKey = JSON.stringify(['edge', chunk.type, wireColor.getHex(), shadingOpacity, dashedStructureEdges ? dashSize : 0])
      const lineMaterial = this.pooledDisplayMaterial(materialKey, () => dashedStructureEdges
        ? new THREE.LineDashedMaterial({ color: meshFeatureEdges ? 0x37474f : 0x607d8b, dashSize, gapSize: dashSize * 0.62, linewidth: 1, toneMapped: false, transparent: true, opacity: meshFeatureEdges ? 0.72 : 0.55, depthTest: true, depthWrite: false })
        : new THREE.LineBasicMaterial({ color: wireColor, toneMapped: false, transparent: shadingTransparent, opacity: shadingOpacity, depthTest: true, depthWrite: !shadingTransparent }))
      const object = new THREE.LineSegments(geometry, lineMaterial)
      if (dashedStructureEdges && geometry.getAttribute('lineDistance') == null) object.computeLineDistances()
      if (!dashedStructureEdges) object.renderOrder = 20
      // edgeCurve is the current backend type. Accept edge so previously
      // converted model caches retain their edge visibility behaviour.
      object.userData.edgeLines = chunk.type === 'edge' || chunk.type === 'edgeCurve' || chunk.type === 'meshFeatureEdge'
      object.userData.sharpEdge = chunk.sharpEdge == null ? chunk.type === 'meshFeatureEdge' : chunk.sharpEdge === true
      object.userData.edgeColorFollowsShading = !meshFeatureEdges && !meshGeometryEdges
      object.userData.meshGeometryEdges = meshGeometryEdges
      return object
    }

    const shadingMaterial = this.pooledDisplayMaterial(`shade:${shadingColor.getHex()}:${shadingOpacity}`, () => new THREE.MeshPhongMaterial({ color: shadingColor, emissive: shadingColor.clone().multiplyScalar(0.045), specular: new THREE.Color(0x8a949c), shininess: 42, toneMapped: false, side: THREE.DoubleSide, transparent: shadingTransparent, opacity: shadingOpacity, depthTest: true, depthWrite: !shadingTransparent }))
    const importedMaterial = this.registerImportedRenderMaterial(sourceAppearance)
    const renderMaterial = importedMaterial?.material || this.pooledDisplayMaterial(`render:${importedMaterialSignature(sourceAppearance)}`, () => createRenderMaterial(sourceAppearance))
    applyShadingMaterialSettings(shadingMaterial, this.shadingSettings || normalizeShadingSettings(), this.shadingEnvironment)
    applyRenderMaterialSettings(renderMaterial, this.renderSettings, this.renderEnvironment, this.renderModeEnabled)
    const object = new THREE.Mesh(geometry, this.renderModeEnabled ? renderMaterial : shadingMaterial)
    object.castShadow = true
    object.receiveShadow = true
    object.userData.displayMaterials = { shading: shadingMaterial, render: renderMaterial }
    object.userData.renderMaterialId = importedMaterial?.id || null
    if (this.meshFaceEdgesVisible) this.ensureMeshFaceEdges(object)
    return object
  }

  ensureMeshFaceEdges (object) {
    if (!object?.isMesh || object.userData.meshFaceEdgeObject != null) return 0
    const geometry = object.geometry
    const triangleCount = geometry.index == null
      ? Math.floor((geometry.getAttribute('position')?.count || 0) / 3)
      : Math.floor(geometry.index.count / 3)
    const requiredVertices = triangleCount * 6
    if (requiredVertices < 1 || this.meshFaceEdgeVertices + requiredVertices > MAX_MESH_FACE_EDGE_VERTICES) return 0
    const meshTriangleEdges = createMeshTriangleEdges(geometry)
    if (meshTriangleEdges == null) return 0
    if (geometry.boundingSphere == null) geometry.computeBoundingSphere()
    const diagonal = geometry.boundingSphere?.radius ? geometry.boundingSphere.radius * 0.035 : 1
    const edgeObject = new THREE.LineSegments(meshTriangleEdges, new THREE.LineDashedMaterial({ color: 0x263238, dashSize: diagonal, gapSize: diagonal * 0.55, toneMapped: false, transparent: true, opacity: 0.72, depthTest: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }))
    edgeObject.computeLineDistances()
    edgeObject.renderOrder = 21
    edgeObject.userData.meshFaceEdges = true
    edgeObject.raycast = () => {}
    object.userData.meshFaceEdgeObject = edgeObject
    object.add(edgeObject)
    this.meshFaceEdgeVertices += requiredVertices
    return requiredVertices
  }

  disposeMeshFaceEdges (object) {
    const edgeObject = object?.userData?.meshFaceEdgeObject
    if (edgeObject == null) return
    this.meshFaceEdgeVertices = Math.max(0, this.meshFaceEdgeVertices - (edgeObject.geometry?.getAttribute('position')?.count || 0))
    object.remove(edgeObject)
    edgeObject.geometry?.dispose()
    edgeObject.material?.dispose()
    object.userData.meshFaceEdgeObject = null
  }

  sharedBindingKey (chunk, instancePath) {
    if (!chunk.sharedGeometryKey) return null
    const pathKey = (Array.isArray(instancePath) ? instancePath : []).map(entry => entry.referenceId || entry.definitionId || 'instance').join('/')
    return `${chunk.geometryId || chunk.sourceObject || 'geometry'}:${chunk.sharedGeometryKey}:${pathKey}`
  }

  ensureChunkGroup (chunk, geometryId, geometryType, originalName, originalType) {
    let group = this.objectsByGeometryId.get(geometryId)
    if (group != null) return group
    group = new THREE.Group()
    group.name = originalName
    group.fullLayerPath = chunk.layer || 'Backend meshes'
    group.userData.documentId = this.documentId
    group.userData.geometryId = geometryId
    group.userData.geometryType = geometryType
    group.userData.originalName = originalName
    group.userData.originalType = originalType
    group.userData.poolGeneration = this.poolGeneration
    group.userData.selectionRole = 'whole'
    group.userData.pandauiObjectId = geometryId
    group.userData.sourceObject = Number.isInteger(chunk.sourceObject) ? chunk.sourceObject : null
    group.userData.visible = chunk.visible !== false
    group.visible = documentGeometryVisible(group.userData)
    this.objectsByGeometryId.set(geometryId, group)
    const stepParent = this.stepHierarchyNodes.get(String(chunk.stepNodeId || '')) || this.stepRootGroup
    ;(stepParent || this.three.middleground).add(group)
    return group
  }

  createIndexedRangeGeometry (geometry, range) {
    const index = geometry.index?.array
    const start = Number(range?.indexStart)
    const count = Number(range?.indexCount)
    if (index == null || !Number.isInteger(start) || !Number.isInteger(count) || start < 0 || count < 2 || start + count > index.length) return null
    const faceGeometry = new THREE.BufferGeometry()
    Object.keys(geometry.attributes).forEach(name => faceGeometry.setAttribute(name, geometry.getAttribute(name)))
    faceGeometry.setIndex(new THREE.BufferAttribute(index.slice(start, start + count), 1))
    const position = faceGeometry.getAttribute('position')
    const point = new THREE.Vector3()
    const bounds = new THREE.Box3()
    for (let offset = start; offset < start + count; offset++) {
      point.fromBufferAttribute(position, index[offset])
      bounds.expandByPoint(point)
    }
    faceGeometry.boundingBox = bounds
    faceGeometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere())
    return faceGeometry
  }

  attachBrepEdgeChunk (geometry, flags, chunk, instancePath = null) {
    const bindingKey = this.sharedBindingKey(chunk, instancePath)
    if (bindingKey != null && this.appliedSharedInstanceBindings.has(bindingKey)) return
    let prepared = this.preparedEdgeGeometries.get(geometry)
    if (!prepared) {
      prepared = prepareEdgeRanges(geometry, chunk.edgeRanges || [])
      this.preparedEdgeGeometries.set(geometry, prepared)
      this.ownedGeometries.add(prepared.geometry)
    }
    const object = this.attachChunkGeometry(prepared.geometry, flags, { ...chunk, role: 'edge', sharpEdge: prepared.ranges.some(range => range.sharpEdge === true) }, instancePath)
    if (!object) return
    object.userData.edgeRanges = prepared.ranges
    delete object.userData.edgeIndex
    setBrepSmoothEdges(object, this.nonSharpEdgesVisible)
    object.raycast = function (raycaster, hits) {
      const start = hits.length
      THREE.LineSegments.prototype.raycast.call(this, raycaster, hits)
      const end = this.geometry.drawRange.start + this.geometry.drawRange.count
      for (let index = hits.length - 1; index >= start; index--) {
        if (hits[index].index < this.geometry.drawRange.start || hits[index].index >= end) hits.splice(index, 1)
      }
    }
    return object
  }

  attachBrepFaceChunk (geometry, flags, chunk, instancePath = null) {
    const ranges = Array.isArray(chunk.faceRanges) ? chunk.faceRanges : []
    if (ranges.length === 0) return false
    const bindingKey = this.sharedBindingKey(chunk, instancePath)
    if (bindingKey != null && this.appliedSharedInstanceBindings.has(bindingKey)) return false
    const object = this.attachChunkGeometry(geometry, flags, { ...chunk, role: 'surface' }, instancePath)
    if (!object) return false
    object.userData.faceRanges = ranges.slice().sort((first, second) => first.indexStart - second.indexStart)
    delete object.userData.faceIndex
    return true
  }

  attachChunkGeometry (geometry, flags, chunk, instancePath = null) {
    const bindingKey = this.sharedBindingKey(chunk, instancePath)
    if (bindingKey != null && this.appliedSharedInstanceBindings.has(bindingKey)) return null
    const object = this.createChunkRenderable(geometry, chunk, flags)
    const geometryId = chunk.geometryId || chunk.file
    const geometryType = chunk.geometryType || (chunk.type === 'edgeCurve' ? 'Curve' : 'Mesh')
    const originalName = String(chunk.name || 'unnamed').trim() || 'unnamed'
    const originalType = String(chunk.originalType || geometryType || 'geometry').toLowerCase()
    const selectionRole = chunk.role || (chunk.type === 'edgeCurve' || chunk.type === 'edge' || chunk.type === 'meshFeatureEdge' || chunk.type === 'meshGeometryEdge' ? 'edge' : 'surface')
    const group = this.ensureChunkGroup(chunk, geometryId, geometryType, originalName, originalType)

    object.fullLayerPath = chunk.layer || 'Backend meshes'
    object.userData.documentId = this.documentId
    object.userData.geometryId = geometryId
    object.userData.geometryType = geometryType
    object.userData.poolGeneration = this.poolGeneration
    object.userData.originalName = originalName
    object.userData.originalType = originalType
    object.userData.selectionRole = selectionRole
    if (Number.isInteger(chunk.edgeIndex)) object.userData.edgeIndex = chunk.edgeIndex
    object.userData.pandauiObjectId = geometryId
    object.userData.sourceObject = Number.isInteger(chunk.sourceObject) ? chunk.sourceObject : null
    object.userData.sharedGeometryKey = chunk.sharedGeometryKey || null
    object.userData.instancePathKey = (instancePath || chunk.instancePath || []).map(entry => entry.referenceId || entry.definitionId || '').join('/')
    object.boundingBox = geometry.boundingBox.clone()
    object.visible = this.layerVisibility.get(object.fullLayerPath) !== false && (!object.userData.edgeLines || this.edgesVisible) && (!object.userData.edgeLines || object.userData.meshGeometryEdges || object.userData.sharpEdge === true || this.nonSharpEdgesVisible) && (!object.userData.meshGeometryEdges || this.meshEdgesVisible)
    if (!(flags & 6) && this.surfaceMeshesVisible === false) object.visible = false
    const instanceChunk = instancePath == null ? chunk : Object.assign({}, chunk, { instancePath })
    const objectParent = this.instanceChunkParent(group, instanceChunk)
    if (objectParent !== group) {
      object.userData.definitionObjectId = chunk.definitionObjectId || null
      object.userData.definitionObjectName = chunk.definitionObjectName || 'unnamed'
      object.userData.definitionObjectType = String(chunk.definitionObjectType || originalType).toLowerCase()
      object.userData.definitionObjectLayer = chunk.definitionObjectLayer || 'Default'
    }
    objectParent.add(object)
    object.onBrepDisplayChanged = (changed, source) => {
      this.ownedGeometries.add(changed.geometry)
      this.ownedGeometries.add(source.geometry)
      this.objects.push(changed)
    }
    this.objects.push(object)
    if (bindingKey != null) this.appliedSharedInstanceBindings.add(bindingKey)
    return object
  }

  applySharedInstanceBinding (binding) {
    const count = this.objects.length
    for (const result of this.sharedInstanceBindingTasks(binding)) { void result }
    return this.objects.length > count
  }

  * sharedInstanceBindingTasks (binding) {
    const sharedGeometryKey = String(binding?.sharedGeometryKey || '')
    if (sharedGeometryKey === '' || this.disposed) return
    const shared = this.sharedInstanceGeometries.get(sharedGeometryKey)
    if (shared == null) {
      let pending = this.pendingSharedInstanceBindings.get(sharedGeometryKey)
      if (pending == null) {
        pending = []
        this.pendingSharedInstanceBindings.set(sharedGeometryKey, pending)
      }
      pending.push(binding)
      yield false
      return
    }
    yield * this.chunkInstanceTasks(shared.geometry, shared.flags, { ...binding, faceRanges: shared.faceRanges, edgeRanges: shared.edgeRanges })
  }

  * sharedInstanceBindingsTasks (bindings) {
    for (const binding of bindings) {
      yield * this.sharedInstanceBindingTasks(binding)
    }
  }

  * chunkInstanceTasks (geometry, flags, chunk) {
    const paths = Array.isArray(chunk.instancePaths) && chunk.instancePaths.length > 0 ? chunk.instancePaths : [chunk.instancePath]
    if (!chunk.edgeRanges?.length && this.chunkIsEdge(chunk) && Number.isInteger(chunk.edgeIndex)) {
      chunk = { ...chunk, edgeRanges: [{ edgeIndex: chunk.edgeIndex, indexStart: 0, indexCount: geometry.index.count, sharpEdge: chunk.sharpEdge }] }
    }
    for (const path of paths) {
      if (this.disposed) return
      const instancePath = Array.isArray(path) ? path : null
      const count = this.objects.length
      if (chunk.role === 'brepFaces' || chunk.faceRanges?.length) this.attachBrepFaceChunk(geometry, flags, chunk, instancePath)
      else if (chunk.edgeRanges?.length) this.attachBrepEdgeChunk(geometry, flags, chunk, instancePath)
      else this.attachChunkGeometry(geometry, flags, chunk, instancePath)
      yield this.objects.length > count
    }
  }

  * decodedChunkTasks (geometry, flags, chunk, pending) {
    yield * this.chunkInstanceTasks(geometry, flags, chunk)
    yield * this.sharedInstanceBindingsTasks(pending)
  }

  parseChunkData (data, chunk) {
    const view = new DataView(data)
    const vertices = view.getUint32(0, true)
    const indices = view.getUint32(4, true)
    const flags = view.getUint32(8, true)
    const positionOffset = 12
    const normalOffset = positionOffset + vertices * 12
    const indexOffset = normalOffset + (flags & 1 ? vertices * 12 : 0)
    if (data.byteLength !== indexOffset + indices * 4) throw new Error(`Invalid mesh chunk ${chunk.file}.`)
    let geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data, positionOffset, vertices * 3), 3))
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(data, indexOffset, indices), 1))
    if (flags & 2) {
      if (chunk.type === 'meshGeometryEdge' && geometry.index != null) {
        const indexedGeometry = geometry
        geometry = indexedGeometry.toNonIndexed()
        indexedGeometry.dispose()
      }
    } else if (flags & 1) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data, normalOffset, vertices * 3), 3))
    } else if (!(flags & 4)) {
      geometry.computeVertexNormals()
    }
    geometry.computeBoundingBox()
    return { geometry, flags, vertices, indices }
  }

  attachDecodedChunkGeometry (geometry, flags, chunk, progressive = false) {
    this.ownedGeometries.add(geometry)
    geometryReference(geometry)
    const sharedGeometryKey = String(chunk.sharedGeometryKey || '')
    let reusedSharedGeometry = false
    if (sharedGeometryKey !== '') {
      const existing = this.sharedInstanceGeometries.get(sharedGeometryKey)
      if (existing != null) {
        reusedSharedGeometry = true
        geometry.dispose()
        this.ownedGeometries.delete(geometry)
        geometry = existing.geometry
      } else {
        this.sharedInstanceGeometries.set(sharedGeometryKey, { geometry, flags, faceRanges: chunk.faceRanges, edgeRanges: chunk.edgeRanges })
      }
    }

    if (!reusedSharedGeometry) {
      const gpuVertices = this.chunkVertexCost(chunk)
      this.sceneVertices += gpuVertices
      if (this.chunkIsEdge(chunk)) this.sceneEdgeVertices += gpuVertices
      else this.sceneSurfaceVertices += gpuVertices
    }

    const pending = this.pendingSharedInstanceBindings.get(sharedGeometryKey) || []
    this.pendingSharedInstanceBindings.delete(sharedGeometryKey)
    const tasks = this.decodedChunkTasks(geometry, flags, chunk, pending)
    if (progressive && (sharedGeometryKey || chunk.instancePath?.length || chunk.instancePaths?.length || pending.length)) {
      return this.instanceQueue.enqueue(tasks).then(() => {
        if (!this.disposed) this.loadedChunkFiles.add(chunk.file)
      })
    }
    for (const result of tasks) { void result }
    this.loadedChunkFiles.add(chunk.file)
  }

  addChunkData (data, chunk, progressive = false) {
    const parsed = this.parseChunkData(data, chunk)
    return this.attachDecodedChunkGeometry(parsed.geometry, parsed.flags, chunk, progressive)
  }

  consolidateBrepObjects (geometryId) {
    const root = this.objectsByGeometryId.get(geometryId)
    if (!root) return
    const groups = new Map()
    root.traverse(object => {
      const rangeKey = object.userData.faceRanges ? 'faceRanges' : object.userData.edgeRanges ? 'edgeRanges' : null
      if (!rangeKey || object.userData.sharedGeometryKey || object.children.length) return
      const key = `${object.parent.uuid}:${rangeKey}:${object.fullLayerPath}:${object.visible}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(object)
    })
    const removed = new Set()
    for (const objects of groups.values()) {
      if (objects.length < 2) continue
      const target = objects[0]
      const rangeKey = target.userData.faceRanges ? 'faceRanges' : 'edgeRanges'
      const merged = mergeBrepGeometries(objects, rangeKey)
      const previous = objects.map(object => object.geometry)
      target.geometry = merged.geometry
      target.material = merged.materials.length === 1 ? merged.materials[0] : merged.materials
      if (target.userData.displayMaterials) {
        const shading = merged.modeMaterials?.shading || []
        const render = merged.modeMaterials?.render || []
        target.userData.displayMaterials.shading = shading.length === 1 ? shading[0] : shading
        target.userData.displayMaterials.render = render.length === 1 ? render[0] : render
      }
      geometryReference(target.geometry)
      this.ownedGeometries.add(target.geometry)
      target.boundingBox = target.geometry.boundingBox.clone()
      target.userData[rangeKey] = merged.ranges
      if (rangeKey === 'edgeRanges') {
        target.userData.sharpEdge = merged.ranges.some(range => range.sharpEdge === true)
        setBrepSmoothEdges(target, this.nonSharpEdgesVisible)
      }
      for (const object of objects.slice(1)) { object.parent.remove(object); removed.add(object) }
      for (const geometry of previous) { this.ownedGeometries.delete(geometry); geometry.dispose() }
    }
    if (removed.size) this.objects = this.objects.filter(object => !removed.has(object))
  }

  chunkMergeKey (chunk) {
    if (chunk == null || chunk.sharedGeometryKey || Array.isArray(chunk.instancePaths) || (Array.isArray(chunk.instancePath) && chunk.instancePath.length > 0)) return null
    const geometryId = String(chunk.geometryId || '')
    if (geometryId === '') return null
    const pathKey = JSON.stringify(chunk.instancePath || [])
    const appearanceKey = importedMaterialSignature(chunk.appearance || {})
    const contextKey = `${String(chunk.layer || '')}|${String(chunk.stepNodeId || '')}|${String(chunk.geometryType || '')}|${String(chunk.originalType || '')}`
    if (Array.isArray(chunk.faceRanges) && chunk.faceRanges.length === 1) {
      const faceIndex = Number(chunk.faceRanges[0]?.faceIndex)
      if (Number.isInteger(faceIndex)) return `face|${geometryId}|${pathKey}|${faceIndex}|${contextKey}|${appearanceKey}`
    }
    if (this.chunkIsEdge(chunk) && Number.isInteger(Number(chunk.edgeIndex))) {
      return `edge|${geometryId}|${pathKey}|${Number(chunk.edgeIndex)}|${String(chunk.type || '')}|${contextKey}|${appearanceKey}`
    }
    return null
  }

  addChunkDataBatch (items, onChunkLoaded = null) {
    const groups = new Map()
    const singles = []
    ;(Array.isArray(items) ? items : []).forEach(item => {
      const key = this.chunkMergeKey(item.chunk)
      if (key == null) {
        singles.push(item)
        return
      }
      let group = groups.get(key)
      if (group == null) {
        group = []
        groups.set(key, group)
      }
      group.push(item)
    })

    const attachSingle = item => {
      this.addChunkData(item.data, item.chunk)
      onChunkLoaded?.(item.chunk)
    }
    singles.forEach(attachSingle)
    groups.forEach(group => {
      if (group.length === 1) {
        attachSingle(group[0])
        return
      }
      const parsed = []
      let mergedGeometry = null
      try {
        group.forEach(item => parsed.push({ item, parsed: this.parseChunkData(item.data, item.chunk) }))
        const flags = parsed[0].parsed.flags
        const hasNormals = parsed[0].parsed.geometry.getAttribute('normal') != null
        if (parsed.some(entry => entry.parsed.flags !== flags || (entry.parsed.geometry.getAttribute('normal') != null) !== hasNormals)) throw new Error('Incompatible chunk attributes.')
        mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(parsed.map(entry => entry.parsed.geometry), false)
        if (mergedGeometry == null) throw new Error('Could not merge chunk geometries.')
        mergedGeometry.computeBoundingBox()
        const first = group[0].chunk
        const mergedChunk = { ...first }
        mergedChunk.file = `merged-${first.file}`
        mergedChunk.bytes = parsed.reduce((total, entry) => total + Number(entry.item.chunk.bytes || 0), 0)
        mergedChunk.vertices = parsed.reduce((total, entry) => total + entry.parsed.vertices, 0)
        mergedChunk.indices = parsed.reduce((total, entry) => total + entry.parsed.indices, 0)
        if (Array.isArray(first.faceRanges) && first.faceRanges.length === 1) {
          const faceIndex = Number(first.faceRanges[0].faceIndex)
          const indexCount = parsed.reduce((total, entry) => total + entry.parsed.indices, 0)
          mergedChunk.faceRanges = [{ faceIndex, indexStart: 0, indexCount }]
        } else mergedChunk.faceRanges = undefined
        this.attachDecodedChunkGeometry(mergedGeometry, flags, mergedChunk)
        parsed.forEach(entry => {
          this.loadedChunkFiles.add(entry.item.chunk.file)
          onChunkLoaded?.(entry.item.chunk)
        })
        parsed.forEach(entry => entry.parsed.geometry.dispose())
      } catch (error) {
        mergedGeometry?.dispose()
        parsed.forEach(entry => entry.parsed.geometry.dispose())
        group.forEach(attachSingle)
      }
    })
  }

  setVertexBudget (maxVertices = Infinity, maxEdgeVertices = 5000000) {
    const value = Number(maxVertices)
    this.maxSceneVertices = Number.isFinite(value) && value > 0 ? Math.floor(value) : Infinity
    const edgeValue = Number(maxEdgeVertices)
    this.maxSceneEdgeVertices = Number.isFinite(edgeValue) && edgeValue > 0 ? Math.floor(edgeValue) : 5000000
  }

  enqueueDeferredChunks (chunks) {
    ;(Array.isArray(chunks) ? chunks : []).forEach(chunk => {
      if (chunk == null || this.loadedChunkFiles.has(chunk.file) || this.deferredChunkQueueFiles.has(chunk.file)) return
      const objectKey = this.chunkObjectKey(chunk)
      if (!this.chunkObjectOrder.has(objectKey)) this.chunkObjectOrder.set(objectKey, this.nextChunkObjectOrder++)
      this.deferredChunkQueue.push(chunk)
      this.deferredChunkQueueFiles.add(chunk.file)
    })
    this.deferredChunkQueue.sort((left, right) => {
      const objectOrder = this.chunkObjectOrder.get(this.chunkObjectKey(left)) - this.chunkObjectOrder.get(this.chunkObjectKey(right))
      return objectOrder || Number(this.chunkIsEdge(left)) - Number(this.chunkIsEdge(right))
    })
    this.deferredChunks = this.deferredChunkQueue.length
    this.deferredVertices = this.deferredChunkQueue.reduce((total, chunk) => total + this.chunkVertexCost(chunk), 0)
  }

  chunkVertexCost (chunk) {
    if (chunk?.parts) return chunk.parts.reduce((total, part) => total + (this.loadedChunkFiles.has(part.file) || this.chunkIsEdge(part) ? 0 : this.chunkVertexCost(part)), 0)
    if (this.chunkIsEdge(chunk)) return Math.max(Number(chunk?.vertices || 0), Number(chunk?.indices || 0))
    return Number(chunk?.vertices || 0)
  }

  chunkIsEdge (chunk) {
    const type = String(chunk?.type || '')
    return chunk?.primitive === 'lineSegments' || type === 'edgeCurve' || type === 'edge' || type === 'meshFeatureEdge' || type === 'meshGeometryEdge'
  }

  chunkObjectKey (chunk) {
    if (chunk?.geometryId) return String(chunk.geometryId)
    if (Number.isInteger(chunk?.sourceObject)) return `source:${chunk.sourceObject}`
    if (chunk?.sharedGeometryKey) return `shared:${chunk.sharedGeometryKey}`
    return String(chunk?.file || 'unknown')
  }

  async drainDeferredChunks (jobId, maximumBatches = Number.POSITIVE_INFINITY) {
    if (this.deferredDrainPromise != null) return this.deferredDrainPromise
    this.deferredDrainPromise = this._drainDeferredChunks(jobId, maximumBatches)
    try {
      return await this.deferredDrainPromise
    } finally {
      this.deferredDrainPromise = null
    }
  }

  async _drainDeferredChunks (jobId, maximumBatches = Number.POSITIVE_INFINITY) {
    if (this.disposed || this.deferredChunkQueue.length === 0) return 0
    let loaded = 0
    let loadedBatches = 0
    while (!this.disposed && this.deferredChunkQueue.length > 0 && loadedBatches < maximumBatches) {
      const batch = []
      let bytes = 0
      let edgeVertices = 0
      // Aggregate chunks across object boundaries. The queue is already sorted
      // for display ordering, so batching no longer needs to stop at each object.
      for (let index = 0; index < this.deferredChunkQueue.length;) {
        const chunk = this.deferredChunkQueue[index]
        const vertices = this.chunkVertexCost(chunk)
        const edgeChunk = this.chunkIsEdge(chunk)
        const shared = String(chunk.sharedGeometryKey || '')
        const alreadyShared = shared !== '' && this.sharedInstanceGeometries.has(shared)
        if (!alreadyShared && !edgeChunk && this.sceneSurfaceVertices + vertices > this.maxSceneVertices) {
          index++
          continue
        }
        const chunkBytes = Number(chunk.bytes || 0)
        const maximumBatchChunks = 10000
        const maximumBatchBytes = 50 * 1024 * 1024
        if (batch.length > 0 && (batch.length >= maximumBatchChunks || bytes + chunkBytes > maximumBatchBytes || (edgeChunk && edgeVertices + vertices > this.maxSceneEdgeVertices))) break
        batch.push(chunk)
        bytes += chunkBytes
        if (edgeChunk) edgeVertices += vertices
        index++
      }
      if (batch.length === 0) break
      await this.loadChunkBatch(jobId, batch, completed => { loaded += Array.isArray(completed) ? completed.length : 1 })
      loadedBatches++
      const loadedFiles = new Set(batch.map(chunk => chunk.file))
      this.deferredChunkQueue = this.deferredChunkQueue.filter(chunk => !loadedFiles.has(chunk.file) || !this.loadedChunkFiles.has(chunk.file))
      batch.forEach(chunk => this.deferredChunkQueueFiles.delete(chunk.file))
      this.deferredChunks = this.deferredChunkQueue.length
      this.deferredVertices = this.deferredChunkQueue.reduce((total, chunk) => total + this.chunkVertexCost(chunk), 0)
      reportMeshProgress({ phase: 'deferred', processed: loaded, total: loaded + this.deferredChunks, loadedVertices: this.sceneVertices, deferredChunks: this.deferredChunks, deferredVertices: this.deferredVertices })
      await new Promise(resolve => window.setTimeout(resolve, 16))
    }
    return loaded
  }

  async loadDeferredSurfaceMeshes (jobId, chunks, reportEmpty = true) {
    const pending = (Array.isArray(chunks) ? chunks : []).filter(chunk => !this.loadedChunkFiles.has(chunk.file))
    let loaded = 0
    if (pending.length > 0 || reportEmpty) reportMeshProgress({ phase: pending.length > 0 ? 'cached' : 'idle', processed: 0, total: pending.length })
    let batch = []
    let batchBytes = 0
    const flush = async () => {
      if (batch.length === 0 || this.disposed) return
      const current = batch
      batch = []
      batchBytes = 0
      await this.loadChunkBatch(jobId, current, completed => {
        loaded += Array.isArray(completed) ? completed.length : 1
        reportMeshProgress({ phase: 'cached', processed: loaded, total: pending.length })
      })
      await new Promise(resolve => window.setTimeout(resolve, 16))
    }
    for (const chunk of pending) {
      const chunkBytes = Number(chunk.bytes || 0)
      if (batch.length > 0 && (batch.length >= 10000 || batchBytes + chunkBytes > 50 * 1024 * 1024)) await flush()
      batch.push(chunk)
      batchBytes += chunkBytes
    }
    await flush()
    if (pending.length > 0) reportMeshProgress({ phase: 'cached-complete', processed: loaded, total: pending.length })
    else if (reportEmpty) reportMeshProgress({ phase: 'complete', processed: 1, total: 1 })
  }

  async beginDeferredMeshing (jobId, cachedSurfaceChunks, pendingMeshCount, sharpEdgeThreshold = 0.9, meshPrecision = 0.25, workerCount = 2, deferredChunks = [], maxSceneVertices = Infinity, maxSceneEdgeVertices = 5000000) {
    if (this.deferredMeshingPromise != null) return this.deferredMeshingPromise
    this.deferredMeshingPromise = (async () => {
      this.setVertexBudget(maxSceneVertices, maxSceneEdgeVertices)
      this.enqueueDeferredChunks(deferredChunks)
      const hasPendingMeshes = pendingMeshCount == null || Number(pendingMeshCount) > 0
      const cachedMeshes = this.loadDeferredSurfaceMeshes(jobId, cachedSurfaceChunks, !hasPendingMeshes)
      const initialDeferred = hasPendingMeshes ? Promise.resolve(0) : cachedMeshes.then(() => this.drainDeferredChunks(jobId))
      let generatedMeshes = Promise.resolve(null)
      if (hasPendingMeshes) {
        const threshold = Number(sharpEdgeThreshold)
        const precision = Number(meshPrecision)
        generatedMeshes = fetch(`/api/models/${jobId}/start-meshing`, {
          method: 'POST',
          cache: 'no-store',
          signal: this.progressiveAbortController.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sharpEdgeThreshold: Number.isFinite(threshold) ? Math.min(1, Math.max(-1, threshold)) : 0.9,
            meshPrecision: Number.isFinite(precision) ? Math.min(1, Math.max(0, precision)) : 0.25,
            workerCount: Number.isFinite(Number(workerCount)) ? Math.min(2, Math.max(1, Math.round(Number(workerCount)))) : 2
          })
        })
          .then(response => {
            if (!response.ok) throw new Error('Could not start deferred geometry meshing.')
            return this.loadProgressiveMeshes(jobId)
          })
      }
      const result = await Promise.all([cachedMeshes, generatedMeshes, initialDeferred])
      if (!this.disposed) {
        while (!this.disposed && this.deferredChunkQueue.length > 0) {
          if (await this.drainDeferredChunks(jobId) === 0) break
        }
        if (this.deferredChunkQueue.length === 0 && !this.disposed) {
          await this.initialChunkTransferPromise
        }
        if (this.deferredChunkQueue.length === 0 && !this.disposed && this.initialChunkTransferComplete) {
          const missingSharedGeometries = this.pendingSharedInstanceBindings.size
          if (missingSharedGeometries > 0) console.warn('Shared instance geometry was not received:', [...this.pendingSharedInstanceBindings.keys()])
          this.pendingSharedInstanceBindings.clear()
          await this.releaseStorage(jobId)
          const errors = (result[1]?.errors?.length || 0) + missingSharedGeometries
          reportMeshProgress({ phase: errors > 0 ? 'complete-with-errors' : 'complete', processed: 1, total: 1, errors })
        }
      }
      return result
    })()
    return this.deferredMeshingPromise
  }

  markInitialChunkTransferComplete () {
    if (this.initialChunkTransferComplete) return
    this.initialChunkTransferComplete = true
    this.resolveInitialChunkTransfer?.()
    this.resolveInitialChunkTransfer = null
  }

  async releaseStorage (jobId) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(`/api/models/${jobId}/release-storage`, { method: 'POST', cache: 'no-store' })
      if (response.ok) return
      const result = await response.json().catch(() => null)
      if (response.status !== 409 || attempt === 4) throw new Error(result?.error || 'Could not release import storage.')
      await new Promise(resolve => window.setTimeout(resolve, 250))
    }
  }

  async loadProgressiveMeshes (jobId) {
    let revision = 0
    while (!this.disposed) {
      const response = await fetch(`/api/models/${jobId}/mesh-updates?afterRevision=${revision}`, { cache: 'no-store', signal: this.progressiveAbortController.signal })
      if (!response.ok) throw new Error('Could not read progressive mesh updates.')
      const result = await response.json()
      const updates = Array.isArray(result.updates) ? result.updates : []
      const progress = result.progress || {}
      const progressDetail = {
        ...progress,
        phase: result.meshState,
        processed: Number(progress.processed || 0),
        total: Number(progress.total || 0),
        errors: Array.isArray(result.errors) ? result.errors.length : 0
      }
      const complete = ['complete', 'complete-with-errors', 'failed'].includes(result.meshState)
      if (!complete) reportMeshProgress(progressDetail)
      for (let index = 0; index < updates.length; index++) {
        const update = updates[index]
        revision = Math.max(revision, Number(update.revision || 0))
        const chunks = (Array.isArray(update.chunks) ? update.chunks : []).filter(chunk => !this.loadedChunkFiles.has(chunk.file))
        const bindings = Array.isArray(update.bindings) ? update.bindings : []
        if (this.disposed) continue
        if (chunks.length > 0) {
          this.appendDisplayChunks(chunks)
          this.enqueueDeferredChunks(chunks)
          this.drainDeferredChunks(jobId, 1).catch(error => console.warn('Deferred mesh batch stopped:', error))
        }
        if (bindings.length > 0) await this.instanceQueue.enqueue(this.sharedInstanceBindingsTasks(bindings))
        updates[index] = null
      }
      revision = Math.max(revision, Number(result.revision || 0))
      if (complete) return result
      await new Promise(resolve => window.setTimeout(resolve, 150))
    }
    return null
  }

  setEdgeVisibility (visible) {
    this.edgesVisible = visible !== false
    this.objects.forEach(object => {
      if (!object.userData.edgeLines) return
      else object.visible = this.edgesVisible && (object.userData.sharpEdge === true || this.nonSharpEdgesVisible) && this.layerVisibility.get(object.fullLayerPath) !== false
    })
  }

  setNonSharpEdgeVisibility (visible) {
    this.nonSharpEdgesVisible = visible !== false
    this.objects.forEach(object => {
      if (!object.userData.edgeLines || object.userData.meshGeometryEdges) return
      setBrepSmoothEdges(object, this.nonSharpEdgesVisible)
      object.visible = this.edgesVisible && (object.userData.sharpEdge === true || this.nonSharpEdgesVisible) && this.layerVisibility.get(object.fullLayerPath) !== false
    })
  }

  setMeshEdgeVisibility (visible) {
    this.meshEdgesVisible = visible === true
    this.objects.forEach(object => {
      if (object.userData.meshGeometryEdges) object.visible = this.meshEdgesVisible && this.layerVisibility.get(object.fullLayerPath) !== false
    })
  }

  setMeshFaceEdgeVisibility (visible) {
    this.meshFaceEdgesVisible = visible === true
    this.objects.forEach(object => {
      if (this.meshFaceEdgesVisible) this.ensureMeshFaceEdges(object)
      else this.disposeMeshFaceEdges(object)
    })
    if (this.meshFaceEdgesVisible && this.meshFaceEdgeVertices >= MAX_MESH_FACE_EDGE_VERTICES) {
      console.warn(`Mesh face edge display stopped at ${MAX_MESH_FACE_EDGE_VERTICES.toLocaleString()} GPU vertices.`)
    }
  }

  setLayerVisibility (name, visible) {
    this.layerVisibility.set(name, visible !== false)
    this.stepHierarchyNodes.forEach(group => {
      if (group.fullLayerPath === name) group.visible = visible !== false && documentGeometryVisible(group.userData)
    })
    this.getSceneObjectsOnLayer(name).forEach(object => {
      object.visible = visible !== false && (!object.userData.edgeLines || this.edgesVisible) && (!object.userData.edgeLines || object.userData.meshGeometryEdges || object.userData.sharpEdge === true || this.nonSharpEdgesVisible) && (!object.userData.meshGeometryEdges || this.meshEdgesVisible)
    })
  }

  async loadChunkBatch (jobId, chunks, onChunkLoaded = null) {
    if (this.disposed || chunks.length === 0) return
    const abortController = new AbortController()
    this.chunkAbortControllers.add(abortController)
    let reader = null
    let sceneBatchChunks = []
    const sceneBatchGeometryIds = new Set()
    try {
      const response = await fetch(`/api/models/${jobId}/chunk-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: chunks.map(chunk => chunk.file) }),
        cache: 'no-store',
        signal: abortController.signal
      })
      if (!response.ok) {
        const failure = await response.json().catch(() => null)
        throw new Error(`Could not download mesh chunk batch (HTTP ${response.status}): ${failure?.error || 'server rejected the request'}`)
      }
      if (!response.body) throw new Error('Streaming mesh response is not available.')
      reader = new ChunkStreamReader(response.body.getReader())
      const version = response.headers.get('X-PandaUI-Batch-Version')
      if (await reader.integer() !== chunks.length) throw new Error('Invalid object chunk batch.')
      let frameStarted = performance.now()
      let displayChanged = false
      let sceneBatchBytes = 0
      const flushSceneBatch = () => {
        if (sceneBatchChunks.length === 0 && !displayChanged) return
        sceneBatchGeometryIds.forEach(geometryId => this.consolidateBrepObjects(geometryId))
        sceneBatchGeometryIds.clear()
        const completedChunks = sceneBatchChunks
        sceneBatchChunks = []
        sceneBatchBytes = 0
        this.onDisplayPart?.(completedChunks)
        this.onDisplayChunk?.(completedChunks[completedChunks.length - 1])
        onChunkLoaded?.(completedChunks)
        if (displayChanged) window.dispatchEvent(new CustomEvent('pandaui-display-changed'))
        displayChanged = false
      }
      for (const chunk of chunks) {
        if (await reader.integer(version === '2' ? 8 : 4) !== chunk.bytes) throw new Error('Object chunk length mismatch.')
        let bytes = 0
        let deferred = false
        for (const part of chunk.parts || [chunk]) {
          if (part.offset != null && part.offset !== bytes) throw new Error('Invalid object part offset.')
          let data = await reader.read(part.bytes)
          bytes += part.bytes
          if (this.disposed) return
          if (!this.loadedChunkFiles.has(part.file)) {
            const shared = part.sharedGeometryKey && this.sharedInstanceGeometries.has(part.sharedGeometryKey)
            if (!shared && !this.chunkIsEdge(part) && this.sceneSurfaceVertices + this.chunkVertexCost(part) > this.maxSceneVertices) {
              deferred = true
            } else {
              const attached = this.addChunkData(data, part, true)
              if (attached) await attached
              displayChanged = true
            }
          }
          data = null
          if (performance.now() - frameStarted >= 10) {
            await new Promise(resolve => window.setTimeout(resolve, 0))
            frameStarted = performance.now()
          }
        }
        if (bytes !== chunk.bytes) throw new Error('Incomplete object display description.')
        if (deferred) this.enqueueDeferredChunks([chunk])
        else {
          this.loadedChunkFiles.add(chunk.file)
          sceneBatchChunks.push(chunk)
          if (chunk.geometryId != null) sceneBatchGeometryIds.add(chunk.geometryId)
          sceneBatchBytes += Number(chunk.bytes || 0)
          if (sceneBatchBytes >= SCENE_BATCH_BYTES) flushSceneBatch()
        }
      }
      flushSceneBatch()
      await reader.finish()
      if (this.renderModeEnabled) configureRenderShadows(this.displayLighting, this.objects)
    } catch (error) {
      if (this.disposed || abortController.signal.aborted || error?.name === 'AbortError') return
      throw error
    } finally {
      sceneBatchChunks.length = 0
      sceneBatchGeometryIds.clear()
      this.chunkAbortControllers.delete(abortController)
      await reader?.dispose()
    }
  }

  getSceneObjectsOnLayer (name) {
    return this.objects.filter(object => object.fullLayerPath === name)
  }

  setRenderMode (enabled, environment = null, settings = {}) {
    this.renderModeEnabled = enabled
    this.renderEnvironment = environment
    this.three.middleground.environment = enabled ? environment : (this.shadingEnvironment || null)
    this.displayLighting.shading.visible = !enabled
    this.displayLighting.render.visible = enabled
    configureRenderShadows(this.displayLighting, this.objects)
    this.setRenderSettings(settings)
    this.objects.forEach(object => {
      const materials = object.userData.displayMaterials
      if (materials == null) return
      object.material = enabled ? materials.render : materials.shading
      const activeMaterials = Array.isArray(object.material) ? object.material : [object.material]
      activeMaterials.filter(Boolean).forEach(material => { material.needsUpdate = true })
    })
  }

  setRenderSettings (settings) {
    const normalized = normalizeRenderSettings(settings)
    this.renderSettings = normalized
    const ambient = this.displayLighting.render.getObjectByName('Render ambient light')
    const key = this.displayLighting.render.getObjectByName('Render key light')
    const fill = this.displayLighting.render.getObjectByName('Render fill light')
    if (ambient != null) ambient.intensity = normalized.ambientLight
    if (key != null) key.intensity = normalized.keyLight
    if (fill != null) fill.intensity = normalized.fillLight
    this.objects.forEach(object => {
      const materials = object.userData.displayMaterials?.render
      ;(Array.isArray(materials) ? materials : [materials]).filter(Boolean).forEach(material => applyRenderMaterialSettings(material, normalized, this.renderEnvironment, this.renderModeEnabled))
    })
  }

  setShadingEnvironment (environment = null, settings = {}) {
    const normalized = normalizeShadingSettings(settings)
    this.shadingSettings = normalized
    this.shadingEnvironment = environment
    if (!this.renderModeEnabled) this.three.middleground.environment = environment
    const skyLight = this.displayLighting.shading.getObjectByName('Shading sky light')
    if (skyLight != null) skyLight.intensity = normalized.skyLight
    this.objects.forEach(object => {
      const materials = object.userData.displayMaterials?.shading
      ;(Array.isArray(materials) ? materials : [materials]).filter(Boolean).forEach(material => applyShadingMaterialSettings(material, normalized, environment))
    })
  }

  dispose ({ closeBackend = true } = {}) {
    if (this.disposed) return this.closePromise
    this.disposed = true
    this.instanceQueue.dispose()
    this.progressiveAbortController.abort()
    this.onInstanceProgress = null
    this.importStream?.dispose()
    this.markInitialChunkTransferComplete()
    this.chunkPrefetch?.dispose().catch(() => {})
    this.chunkAbortControllers.forEach(controller => controller.abort())
    this.chunkAbortControllers.clear()
    if (this.jobId && closeBackend) {
      this.closePromise = fetch(`/api/models/${this.jobId}`, { method: 'DELETE', cache: 'no-store' })
        .then(async response => {
          const result = await response.json()
          if (!response.ok) throw new Error(result.error || 'Could not close backend model.')
          return result
        })
      this.closePromise.catch(error => console.warn('Could not close backend model:', error))
    }
    disposeRenderShadows(this.displayLighting)
    const disposedTextures = new Set()
    const disposedMaterials = new Set()
    const disposedGeometries = new Set()
    const disposeMaterial = material => {
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial)
        return
      }
      if (material == null || disposedMaterials.has(material)) return
      disposedMaterials.add(material)
      Object.values(material).forEach(value => {
        if (value?.isTexture && !disposedTextures.has(value)) {
          disposedTextures.add(value)
          if (releaseDocumentResource(this, value)) value.dispose()
        }
      })
      if (releaseDocumentResource(this, material)) material.dispose()
    }
    const disposeObject = object => {
      if (object.geometry != null && !disposedGeometries.has(object.geometry)) {
        disposedGeometries.add(object.geometry)
        if (releaseDocumentResource(this, object.geometry)) object.geometry.dispose()
      }
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(disposeMaterial)
      if (object.userData.displayMaterials != null) Object.values(object.userData.displayMaterials).forEach(disposeMaterial)
    }
    this.three.middleground.traverse(disposeObject)
    this.three.foreground.traverse(disposeObject)
    this.ownedGeometries.forEach(geometry => {
      if (!disposedGeometries.has(geometry)) {
        disposedGeometries.add(geometry)
        if (releaseDocumentResource(this, geometry)) geometry.dispose()
      }
    })
    this.ownedGeometries.clear()
    this.displayMaterialPool.forEach(disposeMaterial)
    this.displayMaterialPool.clear()
    this.preparedEdgeGeometries = new WeakMap()
    this.renderMaterialLibrary.forEach(entry => {
      const material = entry.material
      if (material.map != null && material.map !== entry.original.map && !disposedTextures.has(material.map)) {
        disposedTextures.add(material.map)
          if (releaseDocumentResource(this, material.map)) material.map.dispose()
      }
      disposeMaterial(material)
    })
    this.renderMaterialLibrary.clear()
    this.transferredResources?.forEach(resource => {
      if (disposedGeometries.has(resource) || disposedMaterials.has(resource) || disposedTextures.has(resource)) return
      if (releaseDocumentResource(this, resource)) resource.dispose()
    })
    this.transferredResources?.clear()
    this.renderMaterialAliases.clear()
    this.renderMaterialSignatures.clear()
    this.sharedInstanceGeometries.clear()
    this.pendingSharedInstanceBindings.clear()
    this.appliedSharedInstanceBindings.clear()
    this.objectsByGeometryId.clear()
    this.loadedChunkFiles.clear()
    this.deferredChunkQueue = []
    this.deferredChunkQueueFiles.clear()
    this.chunkObjectOrder.clear()
    this.nextChunkObjectOrder = 0
    this.chunks = []
    this.displayChunksBySource?.clear()
    this.stepHierarchyNodes.clear()
    this.stepRootGroup = null
    this.deferredChunks = 0
    this.deferredVertices = 0
    this.sceneVertices = 0
    this.sceneSurfaceVertices = 0
    this.sceneEdgeVertices = 0
    this.meshFaceEdgeVertices = 0
    clearObjectChildren(this.three.middleground)
    clearObjectChildren(this.three.foreground)
    this.objects = []
    return this.closePromise
  }
}
