const visibility = new Map()
const sharedVisibility = new WeakMap()
const localVisibility = new WeakMap()
const locks = new Map()
let isolation = null
const key = reference => reference.objectId
  ? JSON.stringify(['shared-object', reference.objectId])
  : JSON.stringify([reference.poolGeneration || '', reference.documentId || '', reference.geometryId ? 'geometry' : reference.nodeInstanceId ? 'node' : reference.layerPath ? 'layer' : 'document', reference.geometryId || reference.nodeInstanceId || reference.layerPath || ''])

const documentIds = reference => [reference.documentId, reference.nativeDocumentId, reference.privateDocumentId, reference.publicDocumentId].filter(Boolean)
const sameDocument = (a, b) => documentIds(a).some(id => documentIds(b).includes(id)) &&
  (!a.poolGeneration || !b.poolGeneration || a.poolGeneration === b.poolGeneration)

export function documentReferenceContains (parent, child) {
  if (!parent || !child) return false
  if (parent.objectId) return [child, ...(child.ancestorReferences || [])].some(item => item.objectId === parent.objectId)
  if (!sameDocument(parent, child)) return false
  const candidates = [child, ...(child.ancestorReferences || [])]
  if (parent.geometryId) return candidates.some(item => item.geometryId === parent.geometryId && sameDocument(parent, item))
  if (parent.nodeInstanceId) return candidates.some(item => String(item.nodeInstanceId || '') === String(parent.nodeInstanceId))
  if (parent.layerPath) return candidates.some(item => item.layerPath === parent.layerPath || item.layerPath?.startsWith(parent.layerPath + '::'))
  return true
}

export function documentIsolationActive () { return isolation != null }
export function setDocumentIsolation (reference) { isolation = reference ? JSON.parse(JSON.stringify(reference)) : null }
export function documentIsolationPath (reference) { return isolation != null && documentReferenceContains(reference, isolation) }
export function documentIsolationVisible (reference) {
  return !isolation || documentReferenceContains(isolation, reference) || documentReferenceContains(reference, isolation)
}

function ancestors (reference) {
  const result = [...(reference.ancestorReferences || [])]
  for (const current of [reference, ...result]) {
    for (const documentId of [...new Set(documentIds(current))]) {
      const document = { documentId, poolGeneration: documentId === current.documentId || documentId === current.nativeDocumentId ? current.poolGeneration : null, visible: true }
      result.push(document, { ...document, poolGeneration: null })
      const parts = (current.layerPath || '').split('::').filter(Boolean)
      parts.forEach((part, index) => {
        const layer = { ...document, layerPath: parts.slice(0, index + 1).join('::') }
        result.push(layer, { ...layer, poolGeneration: null })
      })
      if (current.nodeInstanceId && current.geometryId) result.push({ ...document, nodeInstanceId: current.nodeInstanceId })
      if (current.objectId && current.geometryId && documentId === current.nativeDocumentId) result.push({ ...document, geometryId: current.geometryId })
    }
  }
  return result
}

export function documentItemVisible (reference) {
  return visibility.has(key(reference)) ? visibility.get(key(reference)) : reference.visible !== false
}

export function documentGeometryVisible (reference) {
  if (!visibility.size && !isolation) return reference.visible !== false
  if (!documentIsolationVisible(reference)) return false
  return [reference, ...ancestors(reference)].every(item => documentIsolationPath(item) || documentItemVisible(item))
}

export function sharedDocumentGeometryVisible (reference) {
  return documentGeometryVisible(reference)
}

export function documentItemLocked (reference) { return locks.get(key(reference)) === true }
export function setDocumentItemLocked (reference, locked) { locks.set(key(reference), locked === true) }
export function documentGeometryLocked (reference) { return locks.size > 0 && [reference, ...ancestors(reference)].some(documentItemLocked) }

export function sceneDocumentReference (object, documentId = null) {
  const own = current => {
    const data = current.userData || {}
    const shared = data.sharedObject || data.sharedDocument
    if (shared) return { ...shared, documentId: shared.nativeDocumentId || shared.privateDocumentId || shared.publicDocumentId }
    return { documentId: data.localDocumentId || data.documentId || documentId,
      geometryId: data.localDocumentId || documentId ? data.pandauiObjectId : data.geometryId,
      localDocument: !!(data.localDocumentId || documentId),
      localObjectId: data.pandauiObjectId,
      poolGeneration: data.localDocumentId || documentId ? null : data.poolGeneration,
      layerPath: current.fullLayerPath || data.layerPath,
      nodeInstanceId: data.origin?.nodeInstanceId || data.nodeId }
  }
  const reference = own(object)
  reference.ancestorReferences = []
  for (let parent = object.parent; parent && !parent.isScene; parent = parent.parent) {
    const ancestor = own(parent)
    if (ancestor.geometryId || ancestor.objectId) reference.ancestorReferences.push(ancestor)
  }
  return reference
}

export function sceneObjectLocked (object) {
  return locks.size > 0 && !!object && documentGeometryLocked(sceneDocumentReference(object))
}

export function applyLocalDocumentVisibility (object, document = null, sourceVisible) {
  const previous = localVisibility.get(object)
  const logical = object.userData.importedModelObject || object.userData.importedBlockInstance || (object.userData.pandauiObjectId && !object.geometry)
  // Imported edge previews carry edgeLines on a parent Group. Their actual
  // lines (and point primitives) must also recover source visibility rather
  // than treating last frame's document filter as an original hidden state.
  const managedDisplay = object.isMesh || object.isLine || object.isPoints || object.userData.edgeLines || object.userData.surfaceWires || object.userData.meshGeometryEdges || object.userData.meshFaceEdges
  const source = logical || (document && managedDisplay)
    ? (document?.importedObjectSourceVisible?.(object) ?? object.userData.pandauiHidden !== true)
    : sourceVisible ?? (previous && object.visible === previous.displayed ? previous.source : object.visible)
  const reference = { ...sceneDocumentReference(object, document?.localFileLoaded ? document.documentId : null), visible: source !== false }
  let enabled = true
  if (document) {
    if (object.isMesh) enabled = document.surfaceMeshesVisible !== false
    if (object.userData.edgeLines) enabled = document.edgesVisible !== false && (object.userData.sharpEdge === true || document.nonSharpEdgesVisible !== false)
    if (object.userData.surfaceWires && !object.userData.edgeLines) enabled = document.surfaceMeshesVisible === false
    if (object.userData.meshGeometryEdges && !object.userData.surfaceWires) enabled = document.meshEdgesVisible === true
    if (object.userData.meshFaceEdges) enabled = document.meshFaceEdgesVisible === true
  }
  object.visible = enabled && documentGeometryVisible(reference)
  localVisibility.set(object, { source: source !== false, displayed: object.visible })
  return object.visible
}

export function documentViewSnapshot () {
  return { visibility: [...visibility], locks: [...locks], isolation: isolation ? JSON.parse(JSON.stringify(isolation)) : null }
}

export function restoreDocumentViewSnapshot (state) {
  visibility.clear(); locks.clear()
  for (const [name, value] of state.visibility || []) visibility.set(name, value)
  for (const [name, value] of state.locks || []) locks.set(name, value)
  setDocumentIsolation(state.isolation)
}

// Keep the synchronized visibility separate from this client's tree filters.
export function sharedObjectSourceVisible (object) {
  const state = sharedVisibility.get(object) || localVisibility.get(object)
  return state && object.visible === state.displayed ? state.source : object.visible
}

export function applySharedDocumentVisibility (object, sourceVisible = sharedObjectSourceVisible(object)) {
  object.visible = sharedDocumentGeometryVisible({ ...(object.userData.sharedObject || object.userData.sharedDocument), visible: sourceVisible !== false })
  sharedVisibility.set(object, { source: sourceVisible !== false, displayed: object.visible })
  return object.visible
}

export function setDocumentItemVisible (reference, visible) {
  visibility.set(key(reference), visible)
}

export function moveDocumentItemVisibility (previous, current) {
  const visible = documentItemVisible(previous)
  visibility.delete(key(previous))
  visibility.set(key(current), visible)
}
