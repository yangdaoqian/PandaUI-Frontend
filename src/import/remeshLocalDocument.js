import createLocalImport from './createLocalImport'
import { meshQualityOptions, normalizeMeshPrecision } from './MeshQuality'
import { indexImportedBreps } from './replaceImportedBrep'
import releaseTable from './releaseTable'
import SceneUtilities from '../SceneUtilities'
import { validateDisplayPreview } from '../../public/nodec/BrepDisplayMeshing'
import { decodeDisplayRecord } from './DisplayRecord'
import ControlPointGeometrySource from '../modeling/ControlPointGeometrySource'

export default async function remeshLocalDocument (doc, module, quality, { signal, onProgress, beforeReplace, afterReplace, workerCount = 0, reuseCachedMeshes = false, importTargets = null, scheduling = null, stream = createLocalImport() } = {}) {
  const targets = importTargets || indexImportedBreps(doc.three.middleground)
  let metadata = null, updated = 0
  const failures = []
  const recordArchiveFailures = result => {
    const byPlacement = new Map()
    doc.three.middleground.traverse(root => { if (root.userData?.importedModelObject) byPlacement.set(root.userData.pandauiObjectId, root) })
    for (const failure of result.failures) {
      const root = byPlacement.get(failure.objectId)
      if (root) doc.recordMeshDisplayResult?.([root], { ...failure, status: 'failed' })
    }
  }
  let batchUpdate = false
  let editSource
  let restoreDispose
  const cancel = () => { stream.dispose(); editSource?.dispose() }
  const check = () => { if (signal?.aborted || doc.disposed || doc.remeshStream !== stream) throw Object.assign(new Error('Meshing cancelled.'), { name: 'AbortError' }) }
  const checkRecord = () => {
    check()
    // A resolved worker result may already be awaiting its mounted target when
    // the feed is cancelled. Its consumer must unwind without replacing edges.
    if (stream.signal?.aborted) throw Object.assign(new Error('Meshing cancelled.'), { name: 'AbortError' })
  }
  try {
    if (signal?.aborted || doc.disposed) throw Object.assign(new Error('Meshing cancelled.'), { name: 'AbortError' })
    if ((!doc.sourceFile && !doc.importedGeometrySources?.size && !doc.localGeometryRefs?.size) || (!importTargets && !targets.size)) return { updated, failures }
    doc.remeshStream?.dispose()
    doc.remeshStream = stream
    doc.beginRenderBatchUpdate?.()
    batchUpdate = true
    signal?.addEventListener('abort', cancel, { once: true })
    if (!importTargets && (doc.importedGeometrySources?.size || doc.localGeometryRefs?.size)) {
      editSource = new ControlPointGeometrySource({ getModule: () => module })
      const disposeStream = stream.dispose
      stream.dispose = function (...args) { editSource.dispose(); return disposeStream.apply(this, args) }
      restoreDispose = () => { stream.dispose = disposeStream }
      // Archive remeshing replaces objects one at a time. Failure/cancellation
      // can leave mixed qualities, so the previous quality is no longer valid.
      doc.meshPrecision = null
      const result = await editSource.remeshEdits(doc, { signal, quality, beforeReplace, afterReplace, onProgress, check, includeImported: true, header: doc.importedGeometryHeader })
      check()
      recordArchiveFailures(result)
      if (!result.failures.length) doc.meshPrecision = normalizeMeshPrecision(quality)
      return result
    }
    await stream.run(doc.sourceFile, {
      meshingOptions: meshQualityOptions(quality),
      forceMeshing: !reuseCachedMeshes,
      workerCount,
      concurrentRecords: !!importTargets,
      surfaceOnly: !!importTargets,
      scheduling,
      onHeader: header => { metadata = module.File3dm.fromByteArray(header); if (!metadata) throw new Error('Unable to read model metadata for remeshing.'); doc.rhinoMaterials?.bind(metadata) },
      onProgress: progress => onProgress?.({
        ...progress,
        updated,
        failedMeshObjects: failures.filter(item => item.status !== 'partial').length,
        partialMeshObjects: failures.filter(item => item.status === 'partial').length,
        documentName: doc.name
      }),
      onRecord: async record => {
        checkRecord()
        if (record.instanceRecord || (!record.brepPreview && !record.edgePreview && !reuseCachedMeshes)) return
        // Each STEP mesh job retains its own cumulative table snapshot. Never
        // replace shared metadata while another consumer is suspended on await.
        const recordMetadata = record.sourceHeader ? module.File3dm.fromByteArray(record.sourceHeader) : metadata
        if (!recordMetadata) throw new Error('Unable to read mesh record metadata.')
        doc.rhinoMaterials?.bind(recordMetadata)
        const table = recordMetadata.objects()
        let object, geometry, attributes, id, roots
        const resources = []
        try {
          id = record.displayInfo ? record.objectId : module.nodecAppendObject(recordMetadata, record.objectRecord || record)
          const placements = importTargets ? await importTargets.wait(id, stream.signal || signal) : targets.get(id)
          // Shared definition IDs must not cause source-file meshes to overwrite
          // a single placement's authoritative edited archive (including undo).
          roots = placements?.filter(root => !doc.geometryEdits?.has(root.userData?.pandauiObjectId))
          checkRecord()
          if (!roots?.length) return
          await scheduling?.wait(stream.signal || signal)
          checkRecord()
          const conversionStarted = performance.now()
          if (record.displayInfo) {
            const decoded = decodeDisplayRecord(module, record.displayInfo)
            geometry = decoded.geometry; attributes = decoded.attributes
          } else { object = table.findId(id); geometry = object.geometry(); attributes = object.attributes() }
          // Initial surface fill must leave already imported curves untouched.
          if (!record.edgePreview && module.Curve && geometry instanceof module.Curve) return
          if (record.brepPreview) {
            const faces = geometry.faces()
            try { record.brepPreview = validateDisplayPreview(record.brepPreview, faces.count) } finally { faces.delete() }
            if (record.brepPreview.status === 'failed' || record.brepPreview.status === 'partial') {
              const { status, message, failedFaces, sourceFaceCount, faceCount } = record.brepPreview
              if (!record.meshIntermediate) failures.push({ objectId: id, status, message, failedFaces, sourceFaceCount, faceCount })
              if (status === 'failed') {
                doc.recordMeshDisplayResult?.(roots, record.brepPreview)
                return
              }
            }
          }
          // Quality changes replace both buffers. Initial surface fill reuses
          // the edges already sampled by the reader at the same quality.
          const parts = SceneUtilities.createThreeGeometryOnLayer([[geometry, attributes, record.brepPreview, record.edgePreview]], recordMetadata, resources, !!record.edgePreview)
          for (const [part, bounds] of parts) {
            bounds?.delete()
            if (!part.isObject3D) throw new Error('Unexpected non-display result while remeshing a Brep.')
          }
          checkRecord()
          beforeReplace?.(roots)
          try {
            const replaced = doc.replaceBrepDisplay(roots, parts.map(([part]) => part), resources)
            if (!record.meshIntermediate) updated += replaced
            const meshBytes = [record.brepPreview, ...(record.brepPreview?.meshParts || [])].reduce((total, preview) => total + (preview?.positions?.byteLength || 0) + (preview?.normals?.byteLength || 0) + (preview?.indices?.byteLength || 0), 0)
            doc.onImportDisplay?.(meshBytes, record.meshIntermediate === true)
            // A cancelled/failed run can leave a mixture of qualities. Do not
            // skip rebuilding it if the user switches back to the old quality.
            if (replaced) doc.meshPrecision = null
          } finally { afterReplace?.(roots) }
          scheduling?.sample(performance.now() - conversionStarted)
        } catch (error) {
          resources.forEach(resource => { if (!doc.disposableResources.includes(resource)) resource.dispose() })
          if (error.name === 'AbortError') throw error
          if (!record.meshIntermediate) {
            failures.push({ objectId: id, message: error.message })
            if (roots?.length) doc.recordMeshDisplayResult?.(roots, { status: 'failed', message: error.message })
          }
        } finally {
          geometry?.delete(); attributes?.delete(); object?.delete()
          if (id) table.delete(id)
          releaseTable(table)
          if (record.sourceHeader) recordMetadata.delete()
        }
      }
    })
    check()
    if (doc.geometryEdits?.size) {
      editSource = new ControlPointGeometrySource({ getModule: () => module })
      // The import stream has completed, but doc.remeshStream remains the
      // document's cancellation handle while edited archives are being meshed.
      // Closing the document or starting another remesh must terminate these
      // synchronous WASM jobs too, even when no AbortSignal was supplied.
      const disposeStream = stream.dispose
      stream.dispose = function (...args) { editSource.dispose(); return disposeStream.apply(this, args) }
      restoreDispose = () => { stream.dispose = disposeStream }
      const edits = await editSource.remeshEdits(doc, {
        signal,
        quality,
        beforeReplace,
        afterReplace,
        check,
        header: doc.importedGeometryHeader || (metadata ? module.nodecDocumentHeader(metadata) : undefined),
        onProgress: progress => onProgress?.({ ...progress, updated: updated + progress.updated, documentName: doc.name, phase: 'Meshing edited geometry' })
      })
      updated += edits.updated
      failures.push(...edits.failures)
      recordArchiveFailures(edits)
    }
    check()
    if (!failures.length) doc.meshPrecision = normalizeMeshPrecision(quality)
    return { updated, failures }
  } finally {
    signal?.removeEventListener('abort', cancel)
    stream.dispose(); editSource?.dispose(); metadata?.delete()
    restoreDispose?.()
    if (doc.remeshStream === stream) doc.remeshStream = null
    if (batchUpdate) doc.endRenderBatchUpdate?.()
  }
}
