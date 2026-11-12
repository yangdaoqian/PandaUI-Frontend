// A scene reference identifies a placement, never a material or a preview mesh.
export function resolveSceneReference (documents, reference) {
  if (!reference?.documentId || !reference?.objectId) throw new Error('Connect a Geometry parameter containing a scene object.')
  let result
  for (const doc of documents) {
    if (doc.disposed) continue
    doc.three?.middleground?.traverse(object => {
      if (result) return
      const data = object.userData || {}, shared = data.sharedObject || data.sharedDocument
      const sharedMatch = shared?.objectId === reference.objectId && [shared.publicDocumentId, shared.privateDocumentId, shared.nativeDocumentId].includes(reference.documentId)
      const localMatch = String(doc.documentId) === reference.documentId && [data.pandauiObjectId, data.geometryId, data.objectId, object.uuid].includes(reference.objectId)
      if (sharedMatch || localMatch) result = { doc, root: object }
    })
  }
  if (!result) throw new Error('The referenced scene object is no longer loaded.')
  return result
}
