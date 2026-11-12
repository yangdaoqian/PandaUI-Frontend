const visibility = new Map()
const sharedVisibility = new WeakMap()
const key = reference => reference.objectId
  ? JSON.stringify(['shared-object', reference.objectId])
  : JSON.stringify([reference.poolGeneration || '', reference.documentId || '', reference.geometryId ? 'geometry' : reference.layerPath ? 'layer' : 'document', reference.geometryId || reference.layerPath || ''])

export function documentItemVisible (reference) {
  return visibility.has(key(reference)) ? visibility.get(key(reference)) : reference.visible !== false
}

export function documentGeometryVisible (reference) {
  if (!documentItemVisible(reference)) return false
  const document = { documentId: reference.documentId, poolGeneration: reference.poolGeneration, visible: true }
  if (!documentItemVisible(document) || !documentItemVisible({ ...document, poolGeneration: null })) return false
  const parts = (reference.layerPath || '').split('::').filter(Boolean)
  return parts.every((part, index) => {
    const layer = { ...document, layerPath: parts.slice(0, index + 1).join('::') }
    return documentItemVisible(layer) && documentItemVisible({ ...layer, poolGeneration: null })
  })
}

export function sharedDocumentGeometryVisible (reference) {
  if (!documentItemVisible(reference)) return false
  const ids = [...new Set([reference?.nativeDocumentId, reference?.privateDocumentId, reference?.publicDocumentId].filter(Boolean))]
  if (!ids.length) return documentGeometryVisible(reference)
  return ids.every(documentId => documentGeometryVisible({ documentId, poolGeneration: documentId === reference.nativeDocumentId ? reference.poolGeneration : null, geometryId: documentId === reference.nativeDocumentId ? reference.geometryId : null, layerPath: reference.layerPath, visible: true }))
}

// Keep the synchronized visibility separate from this client's tree filters.
export function sharedObjectSourceVisible (object) {
  const state = sharedVisibility.get(object)
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
