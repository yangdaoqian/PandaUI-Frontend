import * as THREE from 'three'
import FolderDocumentStore from './FolderDocumentStore.mjs'
import { encodeSceneDisplay, decodeSceneDisplay, sceneDisplayReady, disposeSceneDisplay, displaySignature, localDisplayMetadata } from '../collaboration/SceneDisplayPacket'
import FrontendGeometryPublisher from '../collaboration/FrontendGeometryPublisher'
import { documentGeometryVisible } from '../GeometryDocumentViewState'
import releaseTable from '../import/releaseTable'

const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0))
const excluded = root => root.isLight || root.isCamera || root.userData?.renderBatch || root.userData?.nodePreview || root.userData?.sharedScene || root.userData?.selectionHighlight || root.userData?.groupEditBounds || root.userData?.pandauiGumball || root.userData?.renderShadowGround || root.userData?.meshFaceEdges
const check = (doc, signal) => {
  if (doc.disposed || signal?.aborted) throw new DOMException('Document operation cancelled.', 'AbortError')
  if (doc.localImportInProgress || doc.remeshStream) throw new Error('Wait for import or remeshing to finish before saving.')
}
// A scene part can keep its active material on `object.material` and its
// shade/render variants in userData.displayMaterials.  Render-only archives
// encode the latter through externalMaterialIds, so both locations must be
// collected before any display packet is written.  Keeping this in one helper
// also deduplicates the common case where the active material is the shading
// entry in the material bag.
const materialsOf = root => [
  ...(Array.isArray(root.material) ? root.material : root.material ? [root.material] : []),
  ...Object.values(root.userData?.displayMaterials || {}).flatMap(value => Array.isArray(value) ? value : [value])
].filter(Boolean)
const cloneJson = value => value == null ? value : JSON.parse(JSON.stringify(value))
const sourceId = root => root.userData.sourceGeometryId

export function localDocumentNodes (doc) {
  const result = []
  const visit = (root, parent = null, scene = 'middleground') => {
    if (excluded(root) || root.isScene || root === doc.displayLighting?.shading || root === doc.displayLighting?.render) return
    if (root.matrixAutoUpdate) root.updateMatrix()
    root.userData.pandauiObjectId ||= root.uuid
    const index = result.length
    result.push({ root, parent, scene, id: root.userData.pandauiObjectId })
    root.children.forEach(child => visit(child, index, scene))
  }
  for (const scene of ['middleground', 'foreground']) doc.three[scene]?.children.forEach(root => visit(root, null, scene))
  return result
}

export function localDocumentSummary (doc) {
  const nodes = localDocumentNodes(doc)
  const included = new Set(nodes.filter(({ root, parent }) => parent == null || root.userData.importedModelObject || root.userData.importedBlockInstance))
  const objects = nodes.filter(node => included.has(node)).map(({ root, id, parent }) => {
    while (parent != null && !included.has(nodes[parent])) parent = nodes[parent].parent
    return {
      documentId: doc.documentId,
      geometryId: id,
      localObjectId: id,
      localDocument: true,
      name: root.name || 'Object',
      geometryType: root.userData.geometryType || root.type,
      layerPath: root.fullLayerPath || 'Default',
      visible: !root.userData.pandauiHidden,
      revision: 0,
      localParentId: parent == null ? null : nodes[parent].id
    }
  })
  const layers = []
  const visit = list => list.forEach(layer => { layers.push(layer.fullPath); visit(layer.children || []) })
  visit(doc.layers)
  return { documentId: doc.documentId,
    localDocumentId: doc.documentId,
    workspaceDocumentId: doc.workspaceDocumentId,
    name: doc.name,
    kind: 'private',
    localDocument: true,
    owned: true,
    role: 'owner',
    canDelete: true,
    objectCount: objects.length,
    layers,
    localObjects: objects,
    savedAt: doc.localSavedAt,
    loading: !!doc.localImportInProgress }
}

function fingerprint (doc, nodes) {
  return JSON.stringify([doc.layers, (doc.pandaMaterialLibrary || []).map(m => [m.uuid, m.version, m.name]), nodes.map(({ root, id, parent }) => {
    const view = Object.create(root); view.children = []
    return [id, parent, root.matrix.toArray(), root.visible, root.userData.pandauiHidden, root.fullLayerPath, displaySignature(view), doc.geometryEdits?.get(id)?.geometry?.data]
  })])
}

// Store renderer input images/HDR as pack records, never as session blob URLs.
async function saveWorkspace (workspace, transaction, signal) {
  const result = cloneJson(workspace), assets = new Map()
  const visit = async (value, key = '', textureSlot = false) => {
    if (typeof value === 'string' && value && (textureSlot || key === 'url' || key === 'texture' || /Texture$/.test(key))) {
      if (!assets.has(value)) {
        const response = await fetch(value, { signal })
        if (!response.ok) throw new Error('Cannot save render image (' + response.status + '). Reload the image and save again.')
        const blob = await response.blob()
        assets.set(value, { kind: 'panda-render-asset', ref: await transaction.put('display', blob), mime: blob.type })
      }
      return assets.get(value)
    }
    if (!value || typeof value !== 'object') return value
    if (Array.isArray(value)) { const items = []; for (const item of value) items.push(await visit(item)); return items }
    const result = {}
    for (const [name, item] of Object.entries(value)) result[name] = await visit(item, name, key === 'textures')
    return result
  }
  if (result.renderConfiguration) result.renderConfiguration = await visit(result.renderConfiguration)
  return result
}

async function readWorkspace (workspace, snapshot, doc) {
  const urls = new Map()
  doc.localRenderAssetUrls = []
  const visit = async value => {
    if (!value || typeof value !== 'object') return value
    if (value.kind === 'panda-render-asset') {
      if (!urls.has(value.ref)) {
        const url = URL.createObjectURL(new Blob([await snapshot.readBytes(value.ref)], { type: value.mime || 'application/octet-stream' }))
        urls.set(value.ref, url); doc.localRenderAssetUrls.push(url)
      }
      return urls.get(value.ref)
    }
    if (Array.isArray(value)) { const items = []; for (const item of value) items.push(await visit(item)); return items }
    const result = {}
    for (const [key, item] of Object.entries(value)) result[key] = await visit(item)
    return result
  }
  return visit(workspace || {})
}

async function saveMaterialLibrary (nodes, transaction, retained = []) {
  const materialIds = new Map()
  for (const material of retained) if (!materialIds.has(material)) materialIds.set(material, materialIds.size)
  for (const { root } of nodes) for (const material of materialsOf(root)) if (!materialIds.has(material)) materialIds.set(material, materialIds.size)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
  geometry.setDrawRange(0, 0)
  try {
    const library = new THREE.Mesh(geometry, [...materialIds.keys()])
    return { materialIds, materialRef: await transaction.put('display', encodeSceneDisplay(library, { strictTextures: true })) }
  } finally { geometry.dispose() }
}

export async function saveLocalDocument (doc, module, directory, { signal, onProgress = () => {}, workspace = {} } = {}) {
  check(doc, signal)
  if (doc.renderOnly) throw new Error('Render-only documents cannot be saved as full documents.')
  doc.finishRenderBatches?.()
  const nodes = localDocumentNodes(doc), initial = fingerprint(doc, nodes)
  const store = new FolderDocumentStore(directory)
  const transaction = await store.begin(doc.documentId, { signal })
  const sameDirectory = doc.localDirectory === directory || (doc.localDirectory && directory.isSameEntry && await directory.isSameEntry(doc.localDirectory))
  if (sameDirectory && doc.localCommitHash && doc.localCommitHash !== transaction.previous?.hash) {
    transaction.abort()
    throw new Error('This folder was saved by another window. Reopen it, or use Save as to a different folder.')
  }
  const geometry = new Map(), edits = new Map(), needed = new Set(nodes.map(({ root }) => sourceId(root)).filter(Boolean))
  const bufferSourceIds = new Set()
  let header = doc.importedGeometryHeader || doc.subdSourceHeader || (doc.rhinoDoc && module.nodecDocumentHeader(doc.rhinoDoc))
  const storeGeometry = async (id, source) => {
    if (!source?.geometry || !source.attributes) throw new Error('Original geometry/attributes unavailable: ' + id)
    const key = await transaction.putJson('geometry', { id, geometry: source.geometry, attributes: Array.from(source.attributes) })
    geometry.set(id, key); needed.delete(id)
  }
  try {
    if (transaction.previous?.commit.metadata.renderOnly) throw new Error('Choose a full-document folder, not a render-data folder.')
    for (const id of [...needed]) {
      check(doc, signal)
      const reusable = doc.localGeometryRefs?.get(id) || (doc.sourceFile && doc.localSavedFile === doc.sourceFile && doc.localSavedGeometryRefs?.get(id))
      if (reusable && transaction.previous?.records.has(reusable)) { transaction.retain(reusable); geometry.set(id, reusable); needed.delete(id); continue }
      const source = doc.importedGeometrySources.get(id) || doc.subdSources.get(id) || await doc.loadLocalGeometry?.(id)
      if (source) await storeGeometry(id, source)
    }
    // Legacy in-memory imports still own exact native objects. Read those
    // directly instead of requiring a source File or decoding display meshes.
    if (needed.size && doc.rhinoDoc) {
      const table = doc.rhinoDoc.objects()
      try {
        for (const id of [...needed]) {
          check(doc, signal)
          let object, native, attributes
          try {
            object = table.findId(id)
            if (!object) continue
            native = object.geometry(); attributes = object.attributes()
            if (native && attributes) await storeGeometry(id, { geometry: native.encode(), attributes: module.nodecEncodeAttributes(attributes) })
          } finally { attributes?.delete(); native?.delete(); object?.delete() }
        }
      } finally { releaseTable(table) }
    }
    if (needed.size && /\.3dm$/i.test(doc.sourceFile?.name || '')) {
      const exporter = new FrontendGeometryPublisher({ upload: () => {} })
      await exporter.worker({ operation: 'scan', file: doc.sourceFile, sourceIds: [...needed] }, async source => {
        header ||= source.sourceHeader
        await storeGeometry(source.sourceGeometryId, source)
        onProgress({ phase: 'Saving original geometry', completed: geometry.size })
      }, signal)
    }
    // These source formats contain mesh data, not analytic Breps. Their native
    // parser has already released its transient objects after streaming. Keep
    // the loaded buffers as geometry; never apply this fallback to CAD/3DM.
    if (/\.(obj|ply|drc|stl)$/i.test(doc.sourceFile?.name || '')) {
      const analyticIds = new Set(nodes.filter(({ root }) => /brep|subd|surface|extrusion|curve/i.test(root.userData.geometryType || root.userData.originalType || '')).map(({ root }) => sourceId(root)))
      for (const id of [...needed]) {
        if (analyticIds.has(id)) continue
        bufferSourceIds.add(id); needed.delete(id)
      }
    }
    for (const { id } of nodes) {
      const reusable = !doc.geometryEdits?.has(id) && doc.localGeometryEditRefs?.get(id)
      if (reusable && transaction.previous?.records.has(reusable)) { transaction.retain(reusable); edits.set(id, reusable); continue }
      const edit = doc.geometryEdits?.get(id) || await doc.loadLocalGeometryEdit?.(id)
      if (edit) edits.set(id, await transaction.putJson('geometry', { ...edit, attributes: Array.from(edit.attributes) }))
    }
    if (needed.size) throw new Error('Original geometry is unavailable for ' + needed.size + ' object(s). Reopen the source file before saving.')
    // One material library for all display records preserves shared references,
    // editable materials and texture deduplication across the whole document.
    const { materialIds, materialRef } = await saveMaterialLibrary(nodes, transaction, doc.pandaMaterialLibrary)
    const savedWorkspace = await saveWorkspace(workspace, transaction, signal)
    const rows = [], indexRefs = []
    const flushRows = async () => { if (rows.length) { indexRefs.push(await transaction.putJson('metadata', rows)); rows.length = 0 } }
    let completed = 0
    for (const { root, parent, scene, id } of nodes) {
      check(doc, signal)
      // Shallow copy avoids reserializing large instances recursively. Every
      // child retains its parent index and is mounted independently on reopen.
      const view = Object.create(root)
      view.children = []
      view.name = ''; view.fullLayerPath = ''
      view.matrix = new THREE.Matrix4(); view.matrixAutoUpdate = false
      view.userData = { displayMaterials: root.userData.displayMaterials, pandauiObjectId: 'display-template' }
      // The codec intentionally strips graph/auth/renderer state.
      const displayRef = await transaction.put('display', encodeSceneDisplay(view, { externalMaterialIds: materialIds, local: true }))
      const bounds = root.boundingBox?.isBox3 ? root.boundingBox : root.geometry ? (root.geometry.computeBoundingBox(), root.geometry.boundingBox) : null
      const data = cloneJson(localDisplayMetadata(root.userData))
      if (bufferSourceIds.has(sourceId(root))) delete data.sourceGeometryId
      rows.push({ id,
        parent,
        scene,
        name: root.name,
        layerPath: root.fullLayerPath || 'Default',
        matrix: root.matrix.toArray(),
        matrixAutoUpdate: root.matrixAutoUpdate,
        visible: (root.geometry ? true : root.visible) && !root.userData.pandauiHidden && !root.userData.importedHiddenObject && documentGeometryVisible({ documentId: doc.documentId, geometryId: id, layerPath: root.fullLayerPath }),
        data,
        bounds: !bounds || bounds.isEmpty() ? null : { min: bounds.min.toArray(), max: bounds.max.toArray() },
        displayRef,
        edgeFirst: root.isLine === true,
        geometryRef: geometry.get(sourceId(root)) || (root.geometry ? displayRef : null),
        geometryFormat: geometry.has(sourceId(root)) ? 'opennurbs' : root.geometry ? 'display-buffer' : null,
        editRef: edits.get(id) })
      if (rows.length >= 512) await flushRows()
      onProgress({ phase: 'Saving display cache', completed: ++completed, total: nodes.length })
      if (completed % 16 === 0) await yieldFrame()
    }
    await flushRows()
    const headerRef = header ? await transaction.put('geometry', new Blob([header])) : null
    check(doc, signal)
    if (initial !== fingerprint(doc, localDocumentNodes(doc))) throw new Error('The document changed during saving. Please save again after editing.')
    const result = await transaction.commit({ name: doc.name,
      objectCount: nodes.length,
      indexRefs,
      materialRef,
      headerRef,
      layers: cloneJson(doc.layers),
      meshPrecision: doc.meshPrecision,
      displayCacheVersion: 1,
      importWarnings: cloneJson(doc.importWarnings || []),
      workspace: savedWorkspace,
      clippingPlanes: doc.clippingPlanes.map(plane => ({ normal: plane.normal.toArray(), constant: plane.constant })) })
    doc.localDirectory = directory; doc.localSavedAt = new Date().toISOString()
    doc.localCommitHash = result.hash
    doc.localSavedFile = doc.sourceFile; doc.localSavedGeometryRefs = new Map(geometry)
    // A successfully committed save remains successful if best-effort cleanup
    // is temporarily denied. Unreferenced blobs are retried at the next save.
    await store.collectGarbage().catch(error => console.warn('Document cache cleanup deferred:', error))
    return result
  } catch (error) { transaction.abort(); throw error }
}

// Render-only archives intentionally contain display packets, materials and
// viewport settings, but no analytic geometry, geometry headers or edit data.
// They can therefore be opened quickly as a visual reference document.
export async function saveLocalRenderDocument (doc, directory, { signal, onProgress = () => {}, workspace = {} } = {}) {
  check(doc, signal)
  doc.finishRenderBatches?.()
  const nodes = localDocumentNodes(doc), initial = fingerprint(doc, nodes)
  const store = new FolderDocumentStore(directory)
  const transaction = await store.begin(doc.documentId, { signal })
  const rows = [], indexRefs = []
  let phase = 'preparing the render archive'
  try {
    if (transaction.previous && !transaction.previous.commit.metadata.renderOnly) throw new Error('Choose a render-data folder, not a full document folder.')
    const sameDirectory = doc.localRenderDirectory === directory || (doc.localRenderDirectory && directory.isSameEntry && await directory.isSameEntry(doc.localRenderDirectory))
    if (sameDirectory && doc.localRenderCommitHash && doc.localRenderCommitHash !== transaction.previous?.hash) throw new Error('This render folder was saved by another window. Reopen it, or use Save as.')
    phase = 'saving the material library'
    const { materialIds, materialRef } = await saveMaterialLibrary(nodes, transaction, doc.pandaMaterialLibrary)
    phase = 'saving render settings and assets'
    const savedWorkspace = await saveWorkspace(workspace, transaction, signal)
    let completed = 0
    const flushRows = async () => { if (!rows.length) return; indexRefs.push(await transaction.putJson('metadata', rows.splice(0))) }
    for (const { root, parent, scene, id } of nodes) {
      phase = `saving display object ${completed + 1} of ${nodes.length}`
      check(doc, signal)
      const view = Object.create(root)
      view.children = []
      view.name = ''; view.fullLayerPath = ''
      view.matrix = new THREE.Matrix4(); view.matrixAutoUpdate = false
      view.userData = { displayMaterials: root.userData.displayMaterials, pandauiObjectId: 'display-template' }
      const displayRef = await transaction.put('display', encodeSceneDisplay(view, { externalMaterialIds: materialIds, local: true }))
      rows.push({
        id,
        parent,
        scene,
        name: root.name,
        layerPath: root.fullLayerPath || 'Default',
        matrix: root.matrix.toArray(),
        matrixAutoUpdate: root.matrixAutoUpdate,
        visible: (root.geometry ? true : root.visible) && !root.userData.pandauiHidden && !root.userData.importedHiddenObject && documentGeometryVisible({ documentId: doc.documentId, geometryId: id, layerPath: root.fullLayerPath }),
        data: cloneJson(localDisplayMetadata(root.userData)),
        bounds: null,
        displayRef,
        edgeFirst: root.isLine === true,
        geometryRef: displayRef,
        geometryFormat: 'display-buffer'
      })
      onProgress({ phase: 'Saving render data', completed: ++completed, total: nodes.length })
      if (rows.length >= 512) await flushRows()
      if (completed % 16 === 0) await yieldFrame()
    }
    await flushRows()
    phase = 'checking for scene changes'
    check(doc, signal)
    if (initial !== fingerprint(doc, localDocumentNodes(doc))) throw new Error('The document changed during saving. Please save again after editing.')
    phase = 'committing the render archive'
    const result = await transaction.commit({ name: doc.name, objectCount: nodes.length, indexRefs, materialRef, layers: cloneJson(doc.layers), meshPrecision: doc.meshPrecision, displayCacheVersion: 1, renderOnly: true, workspace: savedWorkspace, clippingPlanes: doc.clippingPlanes.map(plane => ({ normal: plane.normal.toArray(), constant: plane.constant })) })
    doc.localRenderDirectory = directory; doc.localRenderCommitHash = result.hash; doc.localSavedAt = new Date().toISOString()
    await store.collectGarbage().catch(error => console.warn('Render archive cleanup deferred:', error))
    return result
  } catch (error) {
    transaction.abort()
    if (error.name !== 'AbortError') error.message = `Render data save failed while ${phase}: ${error.message}`
    throw error
  }
}

export async function readLocalDocument (directory) {
  const store = new FolderDocumentStore(directory), snapshot = await store.open()
  const metadata = snapshot.commit.metadata
  if (!metadata || !Array.isArray(metadata.indexRefs) || !Number.isSafeInteger(metadata.objectCount)) throw new Error('Invalid Panda document metadata.')
  const rows = [], ids = new Set()
  for (const ref of metadata.indexRefs) {
    for (const row of await snapshot.readJson(ref)) {
      if (typeof row.id !== 'string' || ids.has(row.id) || (row.parent !== null && (!Number.isInteger(row.parent) || row.parent < 0 || row.parent >= rows.length)) || !['middleground', 'foreground'].includes(row.scene) || !Array.isArray(row.matrix) || row.matrix.length !== 16 || !row.matrix.every(Number.isFinite)) throw new Error('Invalid Panda document object index.')
      ids.add(row.id); rows.push(row)
    }
  }
  if (rows.length !== metadata.objectCount) throw new Error('Incomplete Panda document index.')
  return { store, snapshot, metadata, rows, directory }
}

export async function mountLocalDocument (doc, archive, { signal, onProgress = () => {}, changed = () => {} } = {}) {
  const { snapshot, metadata, rows, directory } = archive
  doc.layers = cloneJson(metadata.layers || [])
  doc.meshPrecision = metadata.meshPrecision
  doc.importWarnings = metadata.importWarnings || []
  doc.localDirectory = directory
  doc.localWorkspace = await readWorkspace(metadata.workspace, snapshot, doc)
  doc.localCommitHash = snapshot.hash
  doc.localSavedAt = snapshot.commit.savedAt
  doc.localGeometryRefs = new Map()
  doc.localGeometryEditRefs = new Map()
  if (metadata.headerRef) doc.importedGeometryHeader = await snapshot.readBytes(metadata.headerRef)
  for (const row of rows) {
    if (row.geometryRef && row.geometryFormat !== 'display-buffer' && row.data.sourceGeometryId) doc.localGeometryRefs.set(row.data.sourceGeometryId, row.geometryRef)
    if (row.editRef) doc.localGeometryEditRefs.set(row.id, row.editRef)
  }
  // No decoded Brep cache is retained here. Each operation owns its loaded
  // archive; the existing editor manages current edits/history separately.
  doc.loadLocalGeometry = id => doc.localGeometryRefs.has(id) ? snapshot.readJson(doc.localGeometryRefs.get(id)) : null
  doc.loadLocalGeometryEdit = id => doc.localGeometryEditRefs.has(id) ? snapshot.readJson(doc.localGeometryEditRefs.get(id)) : null
  const roots = []
  for (const row of rows) {
    const root = new THREE.Group()
    root.name = row.name; root.userData = { ...row.data, pandauiObjectId: row.id, localDocumentId: doc.documentId }
    root.fullLayerPath = row.layerPath; root.visible = row.visible
    root.matrixAutoUpdate = false
    root.matrix.fromArray(row.matrix).decompose(root.position, root.quaternion, root.scale)
    if (row.bounds) root.boundingBox = new THREE.Box3(new THREE.Vector3(...row.bounds.min), new THREE.Vector3(...row.bounds.max))
    ;(row.parent === null ? doc.three[row.scene] : roots[row.parent]).add(root)
    roots.push(root)
  }
  changed() // The complete tree exists before mesh/geometry data is read.
  const library = decodeSceneDisplay(await snapshot.readBytes(metadata.materialRef))
  doc.localArchiveResources = [library]
  await sceneDisplayReady(library)
  const materials = Array.isArray(library.material) ? library.material : [library.material]
  doc.pandaMaterialLibrary = materials.filter(material => material?.userData.pandaMaterialLibraryId)
  let elapsed = performance.now(), bytes = 0
  const templates = new Map()
  doc.beginRenderBatchUpdate()
  try {
    // Parent placeholders already exist; edge packets can arrive before their
    // ancestors' display packets. Parent indices stay stable throughout.
    const order = rows.map((row, index) => index).sort((a, b) => Number(!!rows[b].edgeFirst) - Number(!!rows[a].edgeFirst))
    let completed = 0
    for (const index of order) {
      if (signal?.aborted || doc.disposed) throw new DOMException('Open cancelled.', 'AbortError')
      const row = rows[index]
      let template = templates.get(row.displayRef)
      if (!template) {
        const buffer = await snapshot.readBytes(row.displayRef, { cachePack: true })
        template = decodeSceneDisplay(buffer, { shareBuffer: true, externalMaterials: materials })
        templates.set(row.displayRef, template)
        bytes += buffer.byteLength
      }
      // Geometry and material resources remain shared between placements. Each
      // object keeps independent transforms, metadata and selection identity.
      const view = Object.create(template); view.children = []; view.userData = {}
      const root = view.clone(false)
      root.userData = { ...template.userData }
      const placeholder = roots[index], children = placeholder.children.slice(), parent = placeholder.parent
      const position = parent.children.indexOf(placeholder)
      root.userData = { ...root.userData, ...placeholder.userData }
      root.name = row.name
      root.visible = row.visible
      root.matrixAutoUpdate = row.matrixAutoUpdate ?? template.matrixAutoUpdate
      root.matrix.fromArray(row.matrix).decompose(root.position, root.quaternion, root.scale)
      root.fullLayerPath = row.layerPath
      if (placeholder.boundingBox) root.boundingBox = placeholder.boundingBox
      for (const child of children) root.add(child)
      parent.remove(placeholder); parent.add(root)
      parent.children.splice(parent.children.indexOf(root), 1); parent.children.splice(position, 0, root)
      roots[index] = root
      doc.configureImportedObject(root, row.layerPath, row.parent === null)
      if (!row.visible) { root.visible = false; root.userData.pandauiHidden = true }
      onProgress({ phase: 'Loading cached display', completed: ++completed, total: rows.length, bytes })
      if (performance.now() - elapsed > 8 || bytes >= 30 * 1024 * 1024) { changed(); await yieldFrame(); elapsed = performance.now(); bytes = 0 }
    }
    doc.clippingPlanes = (metadata.clippingPlanes || []).map(plane => new THREE.Plane(new THREE.Vector3(...plane.normal), plane.constant))
    doc.initialChunkTransferComplete = true; doc.importedObjectCount = rows.filter(row => row.parent === null).length
    doc.displayedPartCount = roots.filter(root => root.geometry).length
  } finally { templates.clear(); snapshot.clearCache(); doc.endRenderBatchUpdate(); changed() }
}

export async function importLocalRenderDocument (doc, archive, options = {}) {
  if (!archive.metadata.renderOnly) throw new Error('This folder contains a full document. Use Open folder instead.')
  doc.renderOnly = true
  await mountLocalDocument(doc, archive, options)
  doc.localFileLoaded = true
  doc.localImportInProgress = false
  doc.initialChunkTransferComplete = true
  doc.localDirectory = archive.directory
  if (!archive.directory.readOnly) { doc.localRenderDirectory = archive.directory; doc.localRenderCommitHash = archive.snapshot.hash }
  return doc
}

export function releaseLocalArchive (doc) {
  doc.pandaMaterialLibrary = null
  for (const url of doc.localRenderAssetUrls || []) URL.revokeObjectURL(url)
  doc.localRenderAssetUrls = null; doc.localWorkspace = null; doc.localRenderDirectory = null; doc.localRenderCommitHash = null
  doc.loadLocalGeometry = null; doc.loadLocalGeometryEdit = null
  doc.localGeometryRefs?.clear(); doc.localGeometryEditRefs?.clear()
  doc.localSavedGeometryRefs?.clear(); doc.localSavedFile = null
  for (const root of doc.localArchiveResources || []) disposeSceneDisplay(root)
  doc.localArchiveResources = null; doc.localDirectory = null; doc.localCommitHash = null
}
