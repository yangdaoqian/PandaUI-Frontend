import * as THREE from 'three'
import { applyLocalDocumentVisibility } from './GeometryDocumentViewState'
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import FileObj from './FileObj'
import FileDraco from './FileDraco'
import FilePly from './FilePly'
import FileStl from './FileStl'
import SceneUtilities from './SceneUtilities'
import releaseTable from './import/releaseTable'
import StreamingBlocks from './import/StreamingBlocks'
import StreamingStepInstances from './import/StreamingStepInstances'
import ImportWorkBudget from './import/ImportWorkBudget'
import { decodeDisplayRecord } from './import/DisplayRecord'
import { replaceImportedBrep } from './import/replaceImportedBrep'
import MeshTriangleEdges from './display/MeshTriangleEdges'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { createDisplayLighting } from './DisplayLighting'
import { configureRenderShadows } from './RenderShadows'
import { applyRenderMaterialSettings, applyShadingMaterialSettings, normalizeRenderSettings, normalizeShadingSettings } from './DisplayMaterialSettings'
import ImportedRenderBatcher from './display/ImportedRenderBatcher'
import DisplayResources from './import/DisplayResources'
import { mountDisplayObject, normalizeImportLayerPath, clearDisplayObjectImport, prepareDisplayMaterials, replaceDisplayImportMaterial } from './import/DisplayObjectImport'
import clearObjectChildren from './display/clearObjectChildren'
import RhinoMaterials from './import/RhinoMaterials'
import { releaseLocalArchive } from './storage/LocalDocumentArchive'

function addToDictionary (node, chunks, layer) {
  let fullPath = ''
  chunks.forEach((chunk) => {
    fullPath = fullPath === '' ? chunk : `${fullPath}::${chunk}`
    if (!node.layers.hasOwnProperty(chunk)) {
      node.layers[chunk] = {
        visible: true,
        layers: {},
        fullPath
      }
    }
    node = node.layers[chunk]
  })
  node.visible = layer.visible
}

function createNodes (dictionary) {
  let nodes = []
  let names = Object.getOwnPropertyNames(dictionary.layers)
  names.forEach((name) => {
    let node = {
      label: name,
      fullPath: dictionary.layers[name].fullPath,
      visible: dictionary.layers[name].visible
    }
    let childNodes = createNodes(dictionary.layers[name])
    if (childNodes.length > 0) {
      node.children = childNodes
    }
    nodes.push(node)
  })
  return nodes
}

export default class PandaUIDoc {
  documentId = THREE.MathUtils.generateUUID()
  rhinoDoc = null
  subdSources = new Map()
  importedGeometrySources = new Map()
  importedGeometryHeader = null
  layers = []
  three = {
    middleground: null,
    foreground: null
  }
  syncCamera = null
  clippingPlanes = []
  #threeObjectsByRootLayer = null
  name = ''
  disposableResources = new DisplayResources()
  rhinoMaterials = new RhinoMaterials(this.disposableResources, () => this.onImportDisplay?.())
  #importWork = new ImportWorkBudget()
  #retainedRenderMaterials = new WeakSet()
  #configuredRenderMaterials = new WeakSet()
  #configuredShadingMaterials = new WeakSet()
  skippedObjectCount = 0
  edgesVisible = true
  nonSharpEdgesVisible = true
  meshEdgesVisible = false
  disposed = false
  sourceFile = null
  remeshStream = null
  meshPrecision = null
  importedObjectCount = 0
  displayedPartCount = 0
  #blocks = null
  #stepInstances = null
  #importBudget = { vertices: 0, maxVertices: Number.POSITIVE_INFINITY }
  #initialMeshDiagnostics = new Map()
  #meshDisplayDiagnostics = new Map()
  #layerVisibility = new Map()
  #triangleEdges = new MeshTriangleEdges()
  #renderBatcher = null
  #batchUpdateDepth = 0
  #batchRebuildPending = false

  constructor (rhinoDoc, name) {
    this.name = name
    this.three.middleground = new THREE.Scene()
    this.three.foreground = new THREE.Scene()
    this.displayLighting = createDisplayLighting()
    this.three.middleground.add(this.displayLighting.shading)
    this.three.middleground.add(this.displayLighting.render)
    this.#renderBatcher = new ImportedRenderBatcher(this)
    this.setSourceDocument(rhinoDoc)
  }

  setSourceDocument (rhinoDoc, preserveLayerState = false) {
    const visibility = preserveLayerState ? new Map(this.#layerVisibility) : null
    const existingLayers = new Map()
    const remember = nodes => nodes?.forEach(node => { existingLayers.set(node.fullPath, node); remember(node.children) })
    if (preserveLayerState) remember(this.layers)
    this.rhinoDoc?.delete()
    this.rhinoDoc = rhinoDoc
    this.rhinoMaterials.bind(rhinoDoc)
    let layers = rhinoDoc.layers()
    // Rhino3dm 8 exposes collection counts as properties, whereas earlier
    // builds exposed them as methods. Keep both forms so loading a valid
    // document never fails while its layer tree is being initialized.
    let count = typeof layers.count === 'function' ? layers.count() : layers.count
    let topLayers = {
      layers: {},
      visible: true
    }
    for (let i = 0; i < count; i++) {
      let layer = layers.get(i)
      let fullpath = layer.fullPath
      let chunks = fullpath.split('::')
      addToDictionary(topLayers, chunks, layer)
      layer.delete()
    }
    this.layers = createNodes(topLayers)
    if (preserveLayerState) {
      const retain = nodes => nodes.map(node => {
        const previous = existingLayers.get(node.fullPath)
        const children = node.children ? retain(node.children) : undefined
        if (!previous) return { ...node, ...(children ? { children } : {}) }
        if (children) previous.children = children
        return previous
      })
      this.layers = retain(this.layers)
    }
    releaseTable(layers)
    const initializeVisibility = (layers, parentVisible = true) => layers.forEach(layer => {
      const visible = visibility?.has(layer.fullPath) ? visibility.get(layer.fullPath) : parentVisible && layer.visible !== false
      this.#layerVisibility.set(layer.fullPath, visible)
      initializeVisibility(layer.children || [], visible)
    })
    this.#layerVisibility.clear()
    initializeVisibility(this.layers)
    this.#threeObjectsByRootLayer = null
  }

  setImportMetadata (metadata = {}) {
    this.importWarnings = [...(metadata.warnings || [])]
    this.sourceUnits = metadata.units ?? metadata.sourceUnits ?? null
    const nodes = new Map()
    this.layers = []
    for (const layer of metadata.layers || []) {
      const path = normalizeImportLayerPath(layer.fullPath || layer.path || layer.name)
      let children = this.layers, fullPath = ''
      for (const label of path.split('::')) {
        fullPath = fullPath ? `${fullPath}::${label}` : label
        let node = nodes.get(fullPath)
        if (!node) {
          node = { label, fullPath, visible: true, children: [] }
          nodes.set(fullPath, node); children.push(node)
        }
        children = node.children
      }
      nodes.get(path).visible = layer.visible !== false
    }
    this.#layerVisibility.clear()
    const initialize = (layers, parentVisible = true) => layers.forEach(layer => {
      const visible = parentVisible && layer.visible !== false
      this.#layerVisibility.set(layer.fullPath, visible)
      initialize(layer.children, visible)
      if (!layer.children.length) delete layer.children
    })
    initialize(this.layers)
    this.#threeObjectsByRootLayer = null
    this.#layerVisibility.forEach((visible, path) => this.setLayerVisibility(path, visible))
  }

  async buildSceneIncrementally (batchSize = 32, renderWires = true, options = {}) {
    const doc = this.rhinoDoc
    let objects = doc.objects()
    const layerTable = doc.layers()
    // Track retained display geometry; streaming imports have no vertex quota.
    const conversionBudget = options.budget || null
    const count = options.ids ? options.ids.length : objects.count
    try {
      for (let i = 0; i < count; i++) {
        if (this.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
        const objectKey = options.ids ? options.ids[i] : i
        let modelObject = null
        let geometry = null
        let attr = null
        let layer = null
        try {
          if (options.displayInfo) {
            const decoded = decodeDisplayRecord(options.module, options.displayInfo)
            geometry = decoded.geometry; attr = decoded.attributes
          } else {
            modelObject = options.ids ? objects.findId(objectKey) : objects.get(i)
            if (modelObject == null) continue
            geometry = modelObject.geometry()
            attr = modelObject.attributes()
          }
          if (attr == null || geometry == null || (attr.isInstanceDefinitionObject && !options.definition)) continue

          const layerIndex = attr.layerIndex
          layer = layerTable.get(layerIndex)
          if (layer == null) throw new Error(`Missing layer ${layerIndex}`)
          const previousDiagnostics = ['missingMeshObjects', 'missingMeshFaces', 'meshingFailures'].map(key => conversionBudget?.[key] || 0)
          const objectsToAdd = SceneUtilities.createThreeGeometryOnLayer([[geometry, attr, options.brepPreviews?.get(objectKey), options.edgePreviews?.get(objectKey)]], doc, this.disposableResources, renderWires, conversionBudget, options.edgesOnly)
          if (conversionBudget === this.#importBudget) {
            this.#initialMeshDiagnostics.set(attr.id || String(objectKey), {
              missingMeshObjects: (conversionBudget.missingMeshObjects || 0) - previousDiagnostics[0],
              missingMeshFaces: (conversionBudget.missingMeshFaces || 0) - previousDiagnostics[1],
              meshingFailures: (conversionBudget.meshingFailures || 0) - previousDiagnostics[2]
            })
          }
          let roots = objectsToAdd.map(([part, bbox], partIndex) => {
            if (bbox) {
              part.boundingBox = new THREE.Box3(new THREE.Vector3(...bbox.min), new THREE.Vector3(...bbox.max))
              bbox.delete()
            }
            if (!part.isObject3D) return part
            if (attr.visible === false) {
              const hidden = new THREE.Group()
              hidden.visible = false
              hidden.userData.importedHiddenObject = true
              hidden.userData.pandauiHidden = true
              hidden.add(part)
              part = hidden
            }
            this.tagImportedObject(part, `object:${objectKey}:part:${partIndex}`, layer.fullPath, attr.name || `Object ${i + 1}`)
            part.userData.sourceGeometryId = attr.id || String(objectKey)
            return part
          })
          const isSubD = !!geometry.displayMesh || (typeof geometry.subdivide === 'function' && typeof geometry.vertices === 'function')
          if (isSubD && !this.subdSources.has(attr.id)) this.subdSources.set(attr.id, SceneUtilities.subdSource(geometry, attr))
          if (isSubD && !this.subdSourceHeader) this.subdSourceHeader = SceneUtilities.subdSourceHeader(doc)
          const isBrep = !isSubD && typeof geometry.faces === 'function' && typeof geometry.edges === 'function'
          const isCurve = typeof geometry.pointAt === 'function' && typeof geometry.tangentAt === 'function'
          if ((isBrep || isCurve || isSubD) && (roots.length || options.edgesOnly)) {
            // One model object, one transform: surface meshes and edge wires
            // must never become independent gumball targets.
            const root = new THREE.Group()
            root.name = attr.name || `Object ${i + 1}`
            root.userData.importedModelObject = true
            root.userData.geometryType = isSubD ? 'SubD' : isBrep ? 'Brep' : 'Curve'
            if (isBrep) {
              const faces = geometry.faces()
              try { root.userData.sourceFaceCount = faces.count } finally { faces.delete() }
            }
            if (isSubD) root.userData.subdDisplayMode = geometry.subdDisplayMode || 'smooth'
            root.userData.sourceGeometryId = attr.id || String(objectKey)
            if (attr.visible === false) { root.visible = false; root.userData.pandauiHidden = true; root.userData.importedHiddenObject = true }
            roots.forEach(part => { if (part.isObject3D) root.add(part) })
            this.tagImportedObject(root, `object:${objectKey}`, layer.fullPath, root.name)
            roots = [root]
          }
          if (options.onObjects) options.onObjects(roots.filter(root => root.isObject3D))
          else {
            roots.forEach(root => {
              if (root instanceof THREE.Plane) this.clippingPlanes.push(root)
              else {
                const label = root instanceof CSS2DObject || root.children.some(child => child instanceof CSS2DObject)
                const scene = label ? this.three.foreground : this.three.middleground
                scene.add(root)
                this.configureImportedObject(root, layer.fullPath)
                this.countImportedParts(root)
                this.onImportedRoot?.(root)
              }
            })
          }
        } catch (error) {
          this.skippedObjectCount++
          console.warn(`Skipped model object ${i + 1}:`, error)
        } finally {
          if (layer != null) layer.delete()
          if (geometry != null) geometry.delete()
          if (attr != null) attr.delete()
          if (modelObject != null) modelObject.delete()
          if (options.release) objects.delete(objectKey)
        }
        if (options.importBytes) this.onImportDisplay?.(options.importBytes)
        if ((i + 1) % batchSize === 0 || this.#importWork.expired) {
          this.onImportDisplay?.(0)
          await this.#importWork.yield()
        }
      }
    } finally { releaseTable(objects); releaseTable(layerTable) }
  }

  setStepInstances (descriptors = []) {
    if (this.disposed) return
    this.#stepInstances ||= new StreamingStepInstances(this)
    this.#stepInstances.setInstances(descriptors)
    this.onImportDisplay?.(0)
  }

  get stepInstanceState () { return this.#stepInstances?.state || null }

  finishStepInstances (options = {}) { return this.#stepInstances?.finish(options) }

  async appendImportRecord (record, module) {
    if (this.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
    if (record.stepInstances) this.setStepInstances(record.stepInstances)
    if (record.stepInstanceFailure) this.#stepInstances?.fail(record.stepInstanceFailure)
    const stepInstanceId = record.stepInstanceId
    if (stepInstanceId != null) {
      if (!this.#stepInstances) throw new Error(`Unknown STEP instance: ${stepInstanceId}`)
      if (!this.#stepInstances.target(stepInstanceId)) return
    }
    if (record.sourceHeader) {
      const metadata = module.File3dm.fromByteArray(record.sourceHeader)
      if (!metadata) throw new Error('Unable to read imported geometry metadata.')
      // STEP tables grow with each conversion job. Preserve live layer nodes
      // and user visibility while adding the newly discovered native tables.
      this.setSourceDocument(metadata, true)
      this.importedGeometryHeader = record.sourceHeader
    }
    if ((record.stepInstances || record.stepInstanceFailure) && !record.objectRecord && !record.instanceRecord && !record.displayInfo && !record.displayObject && !record.positions) return
    if (record.exactSource && !record.displayObject) {
      const source = record.exactSource
      if (!source.id || !source.geometry?.data || !source.attributes || !this.importedGeometryHeader) throw new Error('Incomplete exact geometry source.')
      this.importedGeometrySources.set(source.id, { id: source.id, geometry: source.geometry, attributes: source.attributes })
    }
    if (record.displayObject) {
      const target = stepInstanceId == null ? this : this.#stepInstances.displayDocument(stepInstanceId)
      if (record.displayObject.sourceMaterial) await prepareDisplayMaterials(target, record.displayObject)
      const mounted = mountDisplayObject(target, record.displayObject, record.exactSource)
      if (mounted.newObject) this.importedObjectCount++
      this.#importBudget.vertices += mounted.vertices
      this.onImportDisplay?.(record.byteLength ?? mounted.byteLength)
      if (this.#importWork.expired) await this.#importWork.yield()
      return mounted.id
    }
    if (!record.instanceRecord) this.importedObjectCount++
    const importBytes = (record.objectRecord?.byteLength || record.instanceRecord?.byteLength || record.byteLength || record.positions?.byteLength || 0) + (record.edgePreview?.positions?.byteLength || 0)
    if (record.positions) {
      // Binary STL uses bounded triangle chunks, without a full File3dm copy.
      if (!record.positions.every(Number.isFinite)) throw new Error('STL contains invalid coordinates.')
      const count = record.positions.length / 3
      const mesh = SceneUtilities.meshToThreejs({ toThreejsBuffers: () => ({ position: record.positions }) }, { r: 180, g: 180, b: 180 }, 0)
      mesh.geometry.computeVertexNormals()
      mesh.name = this.name
      mesh.fullLayerPath = 'Default'
      mesh.userData.localDocumentId = this.documentId
      mesh.userData.pandauiObjectId = `${this.documentId}:stl:${this.importedObjectCount}`
      this.#importBudget.vertices += count
      this.three.middleground.add(mesh)
      this.configureImportedObject(mesh, 'Default')
      this.countImportedParts(mesh)
      this.onImportDisplay?.(importBytes)
      return
    }
    let decoded
    if (record.displayInfo) decoded = decodeDisplayRecord(module, record.displayInfo)
    const id = decoded ? decoded.attributes.id : module.nodecAppendObject(this.rhinoDoc, record.instanceRecord || record.objectRecord || record)
    const brepPreviews = record.brepPreview ? new Map([[id, record.brepPreview]]) : undefined
    const edgePreviews = record.edgePreview ? new Map([[id, record.edgePreview]]) : undefined
    const table = this.rhinoDoc.objects()
    let object, attr, geometry, definition, instance, reference
    try {
      if (decoded) { attr = decoded.attributes; geometry = decoded.geometry } else {
        object = table.findId(id)
        attr = object.attributes()
        geometry = object.geometry()
      }
      definition = attr.isInstanceDefinitionObject
      instance = geometry instanceof module.InstanceReference
      if (instance) {
        const transform = geometry.xform
        const layers = this.rhinoDoc.layers()
        const layer = layers.get(attr.layerIndex)
        try {
          reference = { id, definition, definitionId: geometry.parentIdefId, matrix: transform.toFloatArray(false), name: attr.name, visible: attr.visible, layerPath: layer?.fullPath || '' }
        } finally { transform.delete(); layer?.delete(); releaseTable(layers) }
      }
    } finally { geometry?.delete(); attr?.delete(); object?.delete(); releaseTable(table) }
    if (instance || definition) {
      const blocks = this.streamingBlocks()
      if (instance) {
        blocks.addReference(reference)
        const objects = this.rhinoDoc.objects()
        try { objects.delete(id) } finally { releaseTable(objects) }
        this.onImportDisplay?.(importBytes)
      } else if (blocks.needsGeometry(id)) {
        await this.buildSceneIncrementally(32, true, { ids: [id], importBytes, release: true, definition: true, budget: this.#importBudget, brepPreviews, edgePreviews, edgesOnly: record.edgesOnly, displayInfo: record.displayInfo, module, onObjects: roots => blocks.addGeometry(id, roots) })
      } else {
        const objects = this.rhinoDoc.objects()
        try { objects.delete(id) } finally { releaseTable(objects) }
      }
      await blocks.drain()
      return id
    }
    const onObjects = stepInstanceId == null ? undefined : roots => {
      if (!this.#stepInstances?.mount(stepInstanceId, roots)) return
      roots.forEach(root => {
        this.configureImportedObject(root, root.fullLayerPath)
        this.countImportedParts(root)
        this.onImportedRoot?.(root)
      })
    }
    await this.buildSceneIncrementally(32, true, { ids: [id], importBytes, release: true, definition: true, budget: this.#importBudget, brepPreviews, edgePreviews, edgesOnly: record.edgesOnly, displayInfo: record.displayInfo, module, onObjects })
    return id
  }

  async finishImport (onProgress) {
    await this.#blocks?.drain()
    if (this.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
    if (this.#blocks) this.skippedObjectCount += this.#blocks.pendingObjects + this.#blocks.errors
    this.finishStepInstances()
    // Build render batches only after all streaming records have arrived. The
    // source roots remain in the scene for the tree and editing system; the
    // batcher only replaces their visible mesh buffers.
    this.rebuildRenderBatches()
    onProgress?.({ phase: 'Finishing display', processedObjects: this.importedObjectCount, ...this.importDisplayProgress() })
    this.#blocks?.dispose()
    this.#blocks = null
    this.rhinoDoc?.delete()
    this.rhinoDoc = null
    clearDisplayObjectImport(this)
  }

  replaceBrepDisplay (roots, parts, resources) {
    roots.forEach(root => this.#renderBatcher?.invalidate(root))
    const replaced = replaceImportedBrep(this, roots, parts, resources, this.#importBudget)
    if (replaced) {
      let diagnostic
      parts.forEach(part => part.traverse(child => { diagnostic ||= child.userData.brepMeshing }))
      this.recordMeshDisplayResult(roots, diagnostic || { status: 'success' })
    }
    roots.forEach(root => this.#renderBatcher?.queue(root))
    return replaced
  }

  materializeRenderObject (object) {
    return this.#renderBatcher?.materialize(object) || false
  }

  invalidateRenderObject (object) { this.#renderBatcher?.invalidate(object) }

  resolveRenderBatchHit (hit) {
    return this.#renderBatcher?.resolveHit(hit) || hit
  }

  restoreRenderBatches () {
    return this.#renderBatcher?.restore() || false
  }

  rebuildRenderBatches () {
    this.#batchRebuildPending = true
    if (!this.#batchUpdateDepth) {
      this.#renderBatcher?.rebuild()
      this.#batchRebuildPending = false
    }
  }

  beginRenderBatchUpdate () {
    if (this.#renderBatcher) this.#renderBatcher.suspended = true
    if (this.#batchUpdateDepth++ === 0) this.#renderBatcher?.clear()
    this.#batchRebuildPending = true
  }

  endRenderBatchUpdate () {
    if (this.#batchUpdateDepth > 0) this.#batchUpdateDepth--
    if (this.#renderBatcher) this.#renderBatcher.suspended = this.#batchUpdateDepth > 0
    if (!this.#batchUpdateDepth && this.#batchRebuildPending && !this.disposed) this.rebuildRenderBatches()
  }

  prepareRenderBatches (revision) { if (!this.#batchUpdateDepth) this.#renderBatcher?.prepareRender(revision) }
  finishRenderBatches () { this.#renderBatcher?.finishRender() }

  streamingBlocks () {
    if (this.#blocks) return this.#blocks
    const definitions = [], table = this.rhinoDoc.instanceDefinitions()
    try {
      for (let index = 0; index < table.count; index++) {
        const definition = table.get(index)
        try { definitions.push({ id: definition.id, objects: definition.getObjectIds() }) } finally { definition.delete() }
      }
    } finally { releaseTable(table) }
    this.#blocks = new StreamingBlocks({
      definitions,
      budget: this.#importWork,
      onRoot: (group, reference) => {
        this.tagImportedObject(group, 'instance:' + reference.id, reference.layerPath, reference.name)
        this.three.middleground.add(group)
        this.configureImportedObject(group, reference.layerPath)
      },
      onPart: (part, reference, key) => {
        this.tagImportedObject(part, 'instance:' + key, reference.layerPath)
        this.configureImportedObject(part, reference.layerPath, false)
        this.countImportedParts(part)
        this.onImportedRoot?.(part)
      },
      onChange: () => this.onImportDisplay?.()
    })
    return this.#blocks
  }

  completePlacementScan () { this.streamingBlocks().indexed = true }

  recordMeshDisplayResult (roots, preview, sourceFaceCount = preview.sourceFaceCount || preview.faceCount || 0) {
    if (this.disposed) return
    for (const root of roots) {
      let mounted = false
      for (let node = root; node; node = node.parent) if (node === this.three.middleground) mounted = true
      if (!mounted) continue
      const previous = this.#meshDisplayDiagnostics.get(root)
      const faceCount = sourceFaceCount || previous?.sourceFaceCount || root.userData.sourceFaceCount || 0
      const failed = preview.status === 'failed' || preview.status === 'partial'
      let missingMeshFaces = preview.status === 'partial' ? (preview.failedFaces?.length || Math.max(0, sourceFaceCount - (preview.faceCount || 0))) : 0
      if (preview.status === 'failed') {
        // A failed retry retains its previous display, including usable faces.
        let hasMesh = false
        root.traverse(part => { if (part.isMesh) hasMesh = true })
        missingMeshFaces = previous?.missingMeshFaces ?? (hasMesh ? (this.#initialMeshDiagnostics.get(root.userData.sourceGeometryId)?.missingMeshFaces || 0) : faceCount)
      }
      this.#meshDisplayDiagnostics.set(root, {
        objectId: root.userData.sourceGeometryId,
        status: preview.status,
        message: preview.message || '',
        failedFaces: preview.failedFaces?.map(face => ({ ...face })) || [],
        faceReports: preview.faceReports?.map(report => ({ ...report })) || [],
        sourceFaceCount: faceCount,
        missingMeshFaces,
        missingMeshObjects: missingMeshFaces > 0 ? 1 : 0,
        meshingFailures: failed ? 1 : 0
      })
    }
  }

  importDisplayProgress () {
    const result = { displayParts: this.displayedPartCount, pendingBlockObjects: this.#blocks?.pendingObjects || 0, skippedObjects: this.skippedObjectCount, missingMeshObjects: this.#importBudget.missingMeshObjects || 0, missingMeshFaces: this.#importBudget.missingMeshFaces || 0, meshingFailures: this.#importBudget.meshingFailures || 0, meshingMessages: [] }
    const objects = new Map()
    for (const [root, diagnostic] of this.#meshDisplayDiagnostics) {
      let mounted = false
      for (let node = root; node; node = node.parent) if (node === this.three.middleground) mounted = true
      if (!mounted) { this.#meshDisplayDiagnostics.delete(root); continue }
      const previous = objects.get(diagnostic.objectId)
      if (!previous || diagnostic.missingMeshFaces > previous.missingMeshFaces || (diagnostic.meshingFailures && !previous.meshingFailures)) objects.set(diagnostic.objectId, diagnostic)
    }
    result.meshingMessages = (this.#importBudget.meshingMessages || []).filter(item => !objects.has(item.objectId))
    for (const [id, diagnostic] of objects) {
      const initial = this.#initialMeshDiagnostics.get(id)
      for (const key of ['missingMeshObjects', 'missingMeshFaces', 'meshingFailures']) result[key] += diagnostic[key] - (initial?.[key] || 0)
      if (diagnostic.meshingFailures && result.meshingMessages.length < 10) result.meshingMessages.push({ objectId: id, status: diagnostic.status, message: diagnostic.message, failedFaces: diagnostic.failedFaces, faceReports: diagnostic.faceReports, sourceFaceCount: diagnostic.sourceFaceCount })
    }
    return result
  }

  tagImportedObject (root, key, layerPath, name = '') {
    let index = 0
    root.traverse(child => {
      child.userData.localDocumentId = this.documentId
      child.userData.pandauiObjectId = `${this.documentId}:${key}:${index++}`
      child.fullLayerPath = layerPath
      if (!child.name) child.name = name
      // Templates retain render materials even before they have a scene clone.
      const material = child.userData.displayMaterials?.render
      if (material && !this.#retainedRenderMaterials.has(material)) {
        this.#retainedRenderMaterials.add(material)
        this.disposableResources.push(material)
      }
    })
  }

  countImportedParts (root) {
    root.traverse(child => { if (child.geometry && (child.geometry.attributes?.position?.count || child.geometry.vertices?.length)) this.displayedPartCount++ })
  }

  configureImportedObject (root, layerPath, indexLayer = true, parentOwnsLayer = false) {
    root.fullLayerPath = layerPath
    if (indexLayer && this.#threeObjectsByRootLayer) (this.#threeObjectsByRootLayer[layerPath] ||= []).push(root)
    root.traverse(object => {
      if (object.isMesh && this.meshFaceEdgesVisible) this.#triangleEdges.ensure(object, this.disposableResources)
      if (object.userData.meshFaceEdges) object.visible = this.meshFaceEdgesVisible === true
      if (object.isMesh) object.visible = this.surfaceMeshesVisible !== false
      if (object.userData.edgeLines) object.visible = this.edgesVisible && (object.userData.sharpEdge === true || this.nonSharpEdgesVisible)
      if (object.userData.surfaceWires && !object.userData.edgeLines) object.visible = this.surfaceMeshesVisible === false
      if (object.userData.meshGeometryEdges && !object.userData.surfaceWires) object.visible = this.meshEdgesVisible === true
      const materials = object.userData.displayMaterials
      if (materials) {
        this.configureImportedMaterials(materials)
        object.material = this.renderModeEnabled ? materials.render : materials.shading
      }
    })
    root.visible &&= (parentOwnsLayer || this.#layerVisibility.get(layerPath) !== false) && root.userData.pandauiHidden !== true
    applyLocalDocumentVisibility(root, this, root.visible)
    root.traverse(object => this.disposableResources.track(object))
    this.#renderBatcher?.queue(root)
  }

  configureImportedMaterials (materials) {
    if (!materials) return
    if (materials.render && !this.#configuredRenderMaterials.has(materials.render)) {
      applyRenderMaterialSettings(materials.render, this.renderSettings, this.renderEnvironment, this.renderModeEnabled)
      this.#configuredRenderMaterials.add(materials.render)
    }
    if (materials.shading && !this.#configuredShadingMaterials.has(materials.shading)) {
      applyShadingMaterialSettings(materials.shading, this.shadingSettings, this.shadingEnvironment)
      this.#configuredShadingMaterials.add(materials.shading)
    }
  }

  replaceImportedDisplayMaterial (previous, replacement) { replaceDisplayImportMaterial(this, previous, replacement) }

  static create (name, contents, rhino3dm) {
    let rhinoDoc = null
    const lowerName = name.toLowerCase()
    if (lowerName.endsWith('.obj')) {
      rhinoDoc = FileObj.readFile(name, contents, rhino3dm)
    } else if (lowerName.endsWith('.drc')) {
      rhinoDoc = FileDraco.readFile(name, contents, rhino3dm)
    } else if (lowerName.endsWith('.ply')) {
      rhinoDoc = FilePly.readFile(name, contents, rhino3dm)
    } else if (lowerName.endsWith('.stl')) {
      rhinoDoc = FileStl.readFile(name, contents, rhino3dm)
    } else {
      const bytes = contents instanceof Uint8Array ? contents : new Uint8Array(contents)
      rhinoDoc = rhino3dm.File3dm.fromByteArray(bytes)
    }
    if (rhinoDoc != null) {
      return new PandaUIDoc(rhinoDoc, name)
    }
    return null
  }

  static async createIncrementally (name, contents, rhino3dm) {
    const doc = PandaUIDoc.create(name, contents, rhino3dm)
    // File3dm.fromByteArray has copied the source data into the Rhino WASM
    // document. Do not retain a second, large JavaScript buffer while meshes
    // are built for the Three.js scene.
    contents = null
    if (doc != null) await doc.buildSceneIncrementally()
    return doc
  }

  static async createInstanceDefinitionPreview (contents, rhino3dm, definitionNames, onProgress = null) {
    const sourceDoc = PandaUIDoc.create('kuka2700.3dm', contents, rhino3dm)
    if (sourceDoc == null) throw new Error('Unable to parse the Kuka 3DM asset.')

    const root = new THREE.Group()
    root.name = 'Kuka 2700 Preview'
    root.userData.kukaPreview = true
    root.userData.kukaNonSelectable = true
    const definitions = new Map()
    const idefTable = sourceDoc.rhinoDoc.instanceDefinitions()
    const objectTable = sourceDoc.rhinoDoc.objects()
    const tableCount = typeof idefTable.count === 'function' ? idefTable.count() : Number(idefTable.count || 0)
    const findDefinition = (name) => {
      for (let index = 0; index < tableCount; index++) {
        const definition = idefTable.get(index)
        if (definition == null) continue
        const definitionName = definition.name == null ? '' : String(definition.name)
        if (definitionName === name) return definition
      }
      return null
    }

    try {
      if (onProgress != null) await onProgress({ phase: 'started', root, sourceDoc, definitions, total: definitionNames.length })
      for (const name of definitionNames) {
        const group = new THREE.Group()
        group.name = name
        group.userData.kukaDefinitionName = name
        group.userData.pandauiObjectId = `kuka-definition-${name}`
        group.userData.kukaPreview = true
        const definition = findDefinition(name)
        root.add(group)
        definitions.set(name, group)
        if (definition != null) {
          const objectIds = definition.getObjectIds()
          for (let objectIndex = 0; objectIndex < objectIds.length; objectIndex++) {
            const objectId = objectIds[objectIndex]
            const modelObject = objectTable.findId(objectId)
            if (modelObject == null) continue
            const geometry = modelObject.geometry()
            const attributes = modelObject.attributes()
            if (geometry == null || attributes == null) continue
            const children = SceneUtilities.createThreeGeometry(
              geometry,
              attributes,
              sourceDoc.rhinoDoc,
              sourceDoc.disposableResources,
              true,
              true
            )
            children.forEach(([object]) => {
              object.fullLayerPath = `Kuka::${name}`
              object.userData.pandauiObjectId = `kuka-${name}-${objectId}`
              object.userData.kukaPreview = true
              object.traverse(child => {
                if (!child.isLine && !child.isLineSegments) return
                child.renderOrder = 10000
                const materials = Array.isArray(child.material) ? child.material : [child.material]
                materials.forEach(material => {
                  if (material == null) return
                  material.depthTest = false
                  material.depthWrite = false
                  material.needsUpdate = true
                })
              })
              group.add(object)
            })
            if (onProgress != null) {
              await onProgress({
                phase: 'object',
                name,
                group,
                root,
                sourceDoc,
                definitions,
                objectIndex,
                objectCount: objectIds.length,
                index: definitions.size - 1,
                total: definitionNames.length
              })
            }
          }
        }
        PandaUIDoc.mergeKukaDefinitionMeshes(group, sourceDoc)
        if (onProgress != null) {
          await onProgress({
            phase: 'definition',
            name,
            group,
            root,
            sourceDoc,
            definitions,
            index: definitions.size - 1,
            total: definitionNames.length
          })
        }
      }
    } catch (error) {
      root.traverse(object => {
        if (object.geometry != null) object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(material => material?.dispose?.())
      })
      sourceDoc.dispose()
      throw error
    }

    return { sourceDoc, root, definitions }
  }

  static mergeKukaDefinitionMeshes (group, sourceDoc) {
    if (group == null || sourceDoc == null) return null
    const meshObjects = group.children.filter(object => object.isMesh === true && object.geometry != null)
    if (meshObjects.length <= 1) return meshObjects[0] || null

    const geometries = []
    const shadingMaterials = []
    const renderMaterials = []
    meshObjects.forEach(object => {
      const geometry = object.geometry.index == null ? object.geometry.clone() : object.geometry.toNonIndexed()
      if (geometry.getAttribute('normal') == null) geometry.computeVertexNormals()
      ;['color', 'uv', 'uv1', 'tangent'].forEach(attributeName => geometry.deleteAttribute(attributeName))
      geometries.push(geometry)
      const displayMaterials = object.userData.displayMaterials || {}
      shadingMaterials.push(displayMaterials.shading || object.material)
      renderMaterials.push(displayMaterials.render || object.material)
    })

    const mergedGeometry = BufferGeometryUtils.mergeBufferGeometries(geometries, true)
    geometries.forEach(geometry => geometry.dispose())
    if (mergedGeometry == null) return null

    const mergedMesh = new THREE.Mesh(mergedGeometry, shadingMaterials)
    mergedMesh.name = `${group.name} Mesh`
    mergedMesh.userData = {
      ...meshObjects[0].userData,
      kukaMergedDefinitionMesh: true,
      displayMaterials: { shading: shadingMaterials, render: renderMaterials }
    }
    sourceDoc.disposableResources.push(mergedGeometry)
    meshObjects.forEach(object => group.remove(object))
    group.add(mergedMesh)
    return mergedMesh
  }

  static createEmpty (name, rhino3dm) {
    const document = typeof rhino3dm.File3dm.create === 'function'
      ? rhino3dm.File3dm.create()
      : new rhino3dm.File3dm()
    return new PandaUIDoc(document, name)
  }

  dispose () {
    this.remeshStream?.dispose()
    this.remeshStream = null
    this.sourceFile = null
    if (this.disposed) return
    this.disposed = true
    releaseLocalArchive(this)
    this.geometryEdits?.clear()
    this.subdSources.clear()
    this.importedGeometrySources.clear()
    this.importedGeometryHeader = null
    this.subdSourceHeader = null
    this.importStream?.dispose()
    this.importStream = null
    this.#blocks?.dispose()
    this.#blocks = null
    this.#renderBatcher?.dispose()
    this.#stepInstances?.dispose()
    this.#stepInstances = null
    this.#renderBatcher = null
    this.onImportDisplay = null
    this.onImportedRoot = null
    this.refreshImportDisplay = null
    clearDisplayObjectImport(this)
    const disposed = new Set()
    this.rhinoMaterials.dispose()
    const disposeMaterial = (material) => {
      if (Array.isArray(material)) { material.forEach(disposeMaterial); return }
      if (material == null || disposed.has(material)) return
      disposed.add(material)
      Object.values(material).forEach((value) => {
        if (value != null && value.isTexture && !disposed.has(value)) {
          // Environment maps belong to the viewport and can be shared by
          // other open documents. Their owner releases them on replacement.
          if (value === this.renderEnvironment || value === this.shadingEnvironment) return
          disposed.add(value)
          value.dispose()
        }
      })
      material.dispose()
    }
    const disposeScene = (scene) => {
      if (scene == null) return
      scene.traverse((object) => {
        if (object.geometry != null && !disposed.has(object.geometry)) {
          disposed.add(object.geometry)
          object.geometry.dispose()
        }
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach(disposeMaterial)
        if (object.userData.displayMaterials != null) Object.values(object.userData.displayMaterials).forEach(disposeMaterial)

        if (object.element?.parentNode != null) object.element.parentNode.removeChild(object.element)
      })
      clearObjectChildren(scene)
    }

    disposeScene(this.three.middleground)
    disposeScene(this.three.foreground)
    if (this.rhinoDoc != null) this.rhinoDoc.delete()
    this.rhinoDoc = null

    this.disposableResources.forEach((obj) => {
      if (obj != null && !disposed.has(obj)) {
        if (obj.isMaterial) { disposeMaterial(obj); return }
        disposed.add(obj)
        obj.dispose()
      }
    })
    this.disposableResources.clear()
    this.#layerVisibility.clear()
    this.#initialMeshDiagnostics.clear()
    this.#meshDisplayDiagnostics.clear()
    this.#triangleEdges = null
    this.displayLighting = null
    this.renderEnvironment = null
    this.shadingEnvironment = null
    this.#threeObjectsByRootLayer = null
    this.clippingPlanes = []
    this.three.middleground = null
    this.three.foreground = null
  }

  setRenderMode (enabled, environment = null, settings = {}) {
    this.renderModeEnabled = enabled
    this.renderEnvironment = environment
    this.three.middleground.environment = enabled ? environment : (this.shadingEnvironment || null)
    this.displayLighting.shading.visible = !enabled
    this.displayLighting.render.visible = enabled
    configureRenderShadows(this.displayLighting, [this.three.middleground])
    this.setRenderSettings(settings)
    this.three.middleground.traverse((object) => {
      const materials = object.userData.displayMaterials
      if (materials == null) return
      object.material = enabled ? materials.render : materials.shading
      object.material.needsUpdate = true
    })
  }

  setEdgeVisibility (visible) {
    this.edgesVisible = visible !== false
    this.three.middleground.traverse((object) => {
      if (object.userData?.edgeLines) object.visible = this.edgesVisible && (object.userData?.sharpEdge === true || this.nonSharpEdgesVisible)
    })
  }

  setNonSharpEdgeVisibility (visible) {
    this.nonSharpEdgesVisible = visible !== false
    this.three.middleground.traverse((object) => {
      if (!object.userData?.edgeLines || object.userData?.meshGeometryEdges) return
      object.visible = this.edgesVisible && (object.userData?.sharpEdge === true || this.nonSharpEdgesVisible)
    })
  }

  setMeshEdgeVisibility (visible) {
    this.meshEdgesVisible = visible === true
    this.three.middleground.traverse((object) => {
      if (object.userData?.meshGeometryEdges) object.visible = this.meshEdgesVisible
    })
  }

  setMeshFaceEdgeVisibility (visible) {
    this.meshFaceEdgesVisible = visible === true
    this.three.middleground.traverse(object => {
      if (object.isMesh && this.meshFaceEdgesVisible) this.#triangleEdges.ensure(object, this.disposableResources)
      if (object.userData.meshFaceEdges) object.visible = this.meshFaceEdgesVisible
      if (object.userData.surfaceWires && !object.userData.edgeLines) {
        object.visible = this.surfaceMeshesVisible === false
      }
    })
  }

  importedObjectSourceVisible (object) {
    return this.#layerVisibility.get(object.fullLayerPath) !== false && object.userData.pandauiHidden !== true
  }

  setLayerVisibility (name, visible) {
    this.#layerVisibility.set(name, visible !== false)
    for (const object of this.getSceneObjectsOnLayer(name) || []) {
      object.visible = visible !== false && object.userData.pandauiHidden !== true
      if (object.isMesh) object.visible &&= this.surfaceMeshesVisible !== false
      if (object.userData.edgeLines) object.visible &&= this.edgesVisible && (object.userData.sharpEdge === true || this.nonSharpEdgesVisible)
      if (object.userData.surfaceWires && !object.userData.edgeLines) object.visible &&= this.surfaceMeshesVisible === false
    }
  }

  setRenderSettings (settings) {
    const normalized = normalizeRenderSettings(settings)
    this.renderSettings = normalized
    this.#configuredRenderMaterials = new WeakSet()
    const ambient = this.displayLighting.render.getObjectByName('Render ambient light')
    const key = this.displayLighting.render.getObjectByName('Render key light')
    const fill = this.displayLighting.render.getObjectByName('Render fill light')
    if (ambient != null) ambient.intensity = normalized.ambientLight
    if (key != null) key.intensity = normalized.keyLight
    if (fill != null) fill.intensity = normalized.fillLight
    this.three.middleground.traverse(object => {
      this.configureImportedMaterials(object.userData.displayMaterials)
    })
  }

  setShadingEnvironment (environment = null, settings = {}) {
    const normalized = normalizeShadingSettings(settings)
    this.shadingSettings = normalized
    this.shadingEnvironment = environment
    this.#configuredShadingMaterials = new WeakSet()
    if (!this.renderModeEnabled) this.three.middleground.environment = environment
    const skyLight = this.displayLighting.shading.getObjectByName('Shading sky light')
    if (skyLight != null) skyLight.intensity = normalized.skyLight
    this.three.middleground.traverse(object => {
      this.configureImportedMaterials(object.userData.displayMaterials)
    })
  }

  getSceneObjectDictionary () {
    if (this.#threeObjectsByRootLayer == null) {
      let dict = {}
      this.three.foreground.children.forEach((item) => {
        if (typeof item.fullLayerPath !== 'string') return
        const layerPath = item.fullLayerPath
        if (!dict[layerPath]) {
          dict[layerPath] = []
        }
        dict[layerPath].push(item)
      })
      this.three.middleground.children.forEach((item) => {
        if (item.userData?.renderBatch) return
        if (typeof item.fullLayerPath !== 'string') return
        const layerPath = item.fullLayerPath
        if (!dict[layerPath]) {
          dict[layerPath] = []
        }
        dict[layerPath].push(item)
      })
      // Source-header refreshes invalidate this cache during STEP streaming.
      // Only occurrence containers and their mounted model roots carry this
      // marker; their mesh/wire children must not become separate layer targets.
      // Keep the existing direct-child indexing rules for every other format.
      this.three.middleground.traverse(item => {
        if (item.parent === this.three.middleground || item.userData?.stepInstanceId == null || item.userData?.renderBatch) return
        if (typeof item.fullLayerPath !== 'string') return
        ;(dict[item.fullLayerPath] ||= []).push(item)
      })
      this.#threeObjectsByRootLayer = dict
    }
    return this.#threeObjectsByRootLayer
  }

  getSceneObjectsOnLayer (layerPath) {
    const dict = this.getSceneObjectDictionary()
    return dict[layerPath]
  }
}
