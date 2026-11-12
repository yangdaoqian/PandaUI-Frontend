import { failedPreview, inspectCache } from '../../public/nodec/BrepMeshing'
import { meshBrepForDisplay, readCachedBrepDisplay } from '../../public/nodec/BrepDisplayMeshing'
import releaseTable from './releaseTable'
import { meshQualityOptions } from './MeshQuality'

// Decode one object in a worker. Display-only jobs return typed mesh buffers
// and binary attributes; compatibility jobs retain the original record.
export default function prepareBrepImportRecord (module, objectRecord, options, forceMeshing = false, displayOnly = false) {
  const document = new module.File3dm()
  let table, object, geometry, attributes, bounds
  try {
    const id = module.nodecAppendObject(document, objectRecord)
    table = document.objects()
    object = table.findId(id)
    geometry = object.geometry()
    if (module.SubD && geometry instanceof module.SubD && displayOnly) {
      attributes = module.nodecDecodeAttributes(objectRecord); bounds = geometry.getBoundingBox()
      const mesh = module.nodecSubDDisplayMesh(geometry, true, 3)
      try {
        return { objectId: id,
          displayInfo: { type: 'SubD',
            attributes: module.nodecEncodeAttributes(attributes),
            min: bounds.min,
            max: bounds.max,
            subdArchive: geometry.encode(),
            subdPreview: module.nodecMeshPreview(mesh) } }
      } finally { mesh.delete() }
    }
    const isBrep = geometry instanceof module.Brep
    let edgePreview
    if (forceMeshing && module.nodecEdgePreview && (isBrep || (module.Curve && geometry instanceof module.Curve))) {
      const settings = { ...meshQualityOptions(), ...options }
      edgePreview = module.nodecEdgePreview(geometry, settings.tolerance, settings.angleTolerance)
    }
    if (!isBrep) return edgePreview ? { objectRecord, edgePreview } : objectRecord
    let displayInfo
    if (displayOnly) {
      // The isolated meshing model has no material/layer tables. Adding a
      // geometry there normalizes its references to defaults; read the original
      // packet's first object (attributes) so display still uses source tables.
      attributes = module.nodecDecodeAttributes(objectRecord); bounds = geometry.getBoundingBox()
      displayInfo = { type: 'Brep', attributes: module.nodecEncodeAttributes(attributes), min: bounds.min, max: bounds.max }
    }
    let brepPreview
    try {
      let faceCount, missingMeshFaces
      if (displayOnly && !forceMeshing) {
        // Avoid a presence-only pass followed by reopening every saved mesh.
        // Invalid buffers fall back to the same geometry-based recovery as a miss.
        const cached = readCachedBrepDisplay(module, geometry, options, true)
        faceCount = cached.faceCount; brepPreview = cached.preview
      } else if (forceMeshing) {
        // Quality changes never consume saved meshes, including damaged ones.
        const faces = geometry.faces()
        try { faceCount = faces.count } finally { faces.delete() }
      } else {
        try { ({ faceCount, missingMeshFaces } = inspectCache(module, geometry)) } catch (error) {
          // A damaged saved mesh must not prevent geometry-based face recovery.
          const faces = geometry.faces()
          try { faceCount = faces.count; missingMeshFaces = faceCount } finally { faces.delete() }
        }
      }
      if (displayInfo) displayInfo.faceCount = faceCount
      if (!displayOnly && faceCount && !missingMeshFaces && !forceMeshing) return objectRecord
      if (!brepPreview) brepPreview = meshBrepForDisplay(module, geometry, options, faceCount)
    } catch (error) { brepPreview = failedPreview(error?.message || String(error)) }
    return displayOnly ? { objectId: id, displayInfo, brepPreview, edgePreview } : { objectRecord, brepPreview, edgePreview }
  } finally {
    bounds?.delete(); attributes?.delete(); geometry?.delete(); object?.delete(); releaseTable(table); document.delete()
  }
}
