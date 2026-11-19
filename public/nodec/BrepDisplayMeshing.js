/* global globalThis */
// Display-only recovery. Analytic geometry and the strict mesher remain unchanged.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./BrepMeshing'))
  else root.PandaUIBrepDisplayMeshing = factory(root.PandaUIBrepMeshing)
})(typeof self !== 'undefined' ? self : globalThis, function ({ validateOptions, validatePreview, failedPreview, meshBrep }) {
  // A saved face is not a render object. Pack compatible faces before crossing
  // the worker boundary, retaining source face ranges for subobject picking.
  // Keep distinct local origins (including repaired faces) separate to avoid
  // losing precision. A single large face is reused without another copy.
  function packCachedChunks (chunks) {
    const groups = new Map()
    for (const chunk of chunks) {
      const key = JSON.stringify([chunk.origin || null, !!chunk.uv])
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ mesh: chunk, faceIndex: chunk.faceRanges[0].faceIndex })
    }
    chunks.length = 0
    for (const entries of groups.values()) {
      const first = entries[0].mesh
      chunks.push(entries.length === 1 ? first : {
        ...mergeGroup(entries, first.origin),
        message: 'Packed saved and recovered face meshes for display.',
        engine: 'saved-face-display'
      })
      entries.length = 0
    }
  }

  // Import-only fast path: inspect and extract each saved mesh once. Repair only
  // near-complete caches, with at most eight independent missing faces. Explicit
  // object budgets and damaged buffers retain whole-Brep recovery. Forced quality
  // changes never call this helper; saved meshes retain their original sampling.
  function readCachedBrepDisplay (module, brep, options, recoverMissing = false) {
    const faces = brep.faces()
    try {
      const faceCount = faces.count, chunks = [], missing = []
      const repairLimit = recoverMissing && typeof module.nodecBrepDisplayPreview === 'function' ? Math.min(8, Math.floor(faceCount / 4)) : 0
      try {
        for (let faceIndex = 0; faceIndex < faceCount; faceIndex++) {
          let face, mesh
          try {
            face = faces.get(faceIndex); mesh = face?.getMesh(module.MeshType.Any)
            if (!mesh) {
              missing.push(faceIndex)
              if (missing.length > repairLimit) return { faceCount }
              continue
            }
            const buffers = mesh.toThreejsBuffers(false)
            // Rhino can save an empty Mesh handle instead of a null cache.
            // No triangles means a cache miss, never a renderable saved face.
            if (buffers.position instanceof Float32Array && buffers.normal instanceof Float32Array && buffers.index instanceof Uint32Array && !buffers.index.length) {
              missing.push(faceIndex)
              if (missing.length > repairLimit) return { faceCount }
              continue
            }
            const chunk = validatePreview({ status: 'success', message: 'Saved face mesh.', positions: buffers.position, normals: buffers.normal, indices: buffers.index, ...(buffers.uv?.length ? { uv: buffers.uv } : {}) }, 1, module.HEAPU8?.buffer)
            if (chunk.status !== 'success') return { faceCount }
            chunks.push({ ...chunk, faceRanges: [{ faceIndex, firstIndex: 0, indexCount: chunk.indices.length }] })
          } finally { mesh?.delete(); face?.delete() }
        }
      } catch (_) { return { faceCount } }
      if (missing.length) {
        const settings = validateOptions(options, true)
        // Separate native calls must not multiply an object-wide quota.
        if (settings.maxVertices || settings.maxTriangles) return { faceCount }
        const failedFaces = []
        for (const faceIndex of missing) {
          let face, isolated
          try {
            face = faces.get(faceIndex)
            // Older runtimes can still reuse complete caches.
            if (typeof face.duplicateFace !== 'function') return { faceCount }
            isolated = face.duplicateFace(false)
            if (!isolated) throw new Error('Unable to isolate missing source face.')
            const mesh = meshBrepForDisplay(module, isolated, settings, 1)
            if (mesh.status !== 'success') throw new Error(mesh.message)
            const { sourceFaceCount, failedFaces, meshParts, wholeObjectError, ...chunk } = mesh
            // One isolated source face must produce one validated mesh chunk.
            if (meshParts?.length) throw new Error('Unexpected parts for isolated source face.')
            chunks.push({ ...chunk, faceRanges: [{ faceIndex, firstIndex: 0, indexCount: chunk.indices.length }] })
          } catch (error) { failedFaces.push({ faceIndex, message: error?.message || String(error) }) } finally { isolated?.delete(); face?.delete() }
        }
        const rendered = faceCount - failedFaces.length
        const message = `Reused ${faceCount - missing.length} saved Brep face meshes; ${missing.length - failedFaces.length} missing faces meshed; ${failedFaces.length} skipped.`
        packCachedChunks(chunks)
        return { faceCount, preview: { ...chunks[0], status: failedFaces.length ? 'partial' : 'success', message, faceCount: rendered, sourceFaceCount: faceCount, failedFaces, meshParts: chunks.slice(1) } }
      }
      packCachedChunks(chunks)
      return { faceCount, ...(chunks.length ? { preview: { ...chunks[0], faceCount, sourceFaceCount: faceCount, failedFaces: [], meshParts: chunks.slice(1) } } : {}) }
    } finally { faces.delete() }
  }

  function validateDisplayPreview (preview, sourceFaceCount, heapBuffer) {
    if (preview?.sourceFaceCount === undefined && preview?.meshParts === undefined && preview?.failedFaces === undefined) return validatePreview(preview, sourceFaceCount, heapBuffer)
    const invalid = reason => failedPreview('Invalid partial Brep display: ' + reason)
    if (!Number.isInteger(sourceFaceCount) || sourceFaceCount < 1 || preview.sourceFaceCount !== sourceFaceCount || !Array.isArray(preview.failedFaces) || !Array.isArray(preview.meshParts)) return invalid('missing source coverage metadata.')
    const seen = new Set()
    for (const failure of preview.failedFaces) {
      if (!Number.isInteger(failure?.faceIndex) || failure.faceIndex < 0 || failure.faceIndex >= sourceFaceCount || seen.has(failure.faceIndex) || typeof failure.message !== 'string' || !failure.message) return invalid('invalid failed face.')
      seen.add(failure.faceIndex)
    }
    const rendered = sourceFaceCount - seen.size
    if (preview.faceCount !== rendered) return invalid('face count disagrees with skipped faces.')
    const expected = rendered === 0 ? 'failed' : seen.size ? 'partial' : 'success'
    if (preview.status !== expected || typeof preview.message !== 'string') return invalid('incorrect completion status.')
    if (!rendered) {
      if (preview.indices?.length || preview.positions?.length || preview.normals?.length || preview.meshParts.length) return invalid('failed display contains geometry.')
      return { ...failedPreview(preview.message), sourceFaceCount, faceCount: 0, failedFaces: preview.failedFaces.map(f => ({ ...f })), meshParts: [] }
    }
    const chunks = []
    for (const [index, part] of [preview, ...preview.meshParts].entries()) {
      if (index && (part?.meshParts !== undefined || part?.failedFaces !== undefined)) return invalid('nested display parts.')
      if (!Array.isArray(part?.faceRanges) || !part.faceRanges.length) return invalid('missing face ranges.')
      for (const range of part.faceRanges) {
        if (!Number.isInteger(range?.faceIndex) || range.faceIndex < 0 || range.faceIndex >= sourceFaceCount || seen.has(range.faceIndex)) return invalid('duplicate or out-of-range face.')
        seen.add(range.faceIndex)
      }
      const checked = validatePreview({ ...part, status: 'success', faceCount: part.faceRanges.length, faceRanges: part.faceRanges.map((r, i) => ({ ...r, faceIndex: i })) }, part.faceRanges.length, heapBuffer)
      if (checked.status !== 'success') return invalid(checked.message)
      chunks.push({ ...checked, faceRanges: part.faceRanges.map(r => ({ ...r })) })
    }
    if (seen.size !== sourceFaceCount) return invalid('unaccounted source faces.')
    return { ...chunks[0], status: preview.status, message: preview.message, faceCount: rendered, sourceFaceCount, failedFaces: preview.failedFaces.map(f => ({ ...f })), meshParts: chunks.slice(1), wholeObjectError: typeof preview.wholeObjectError === 'string' ? preview.wholeObjectError : '' }
  }

  function mergeGroup (entries, origin) {
    const vertexCount = entries.reduce((n, e) => n + e.mesh.positions.length / 3, 0)
    const indexCount = entries.reduce((n, e) => n + e.mesh.indices.length, 0)
    const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount), faceRanges = []
    const uv = entries.every(entry => entry.mesh.uv) ? new Float32Array(vertexCount * 2) : null
    let vertex = 0, index = 0
    for (const { mesh, faceIndex } of entries) {
      positions.set(mesh.positions, vertex * 3); normals.set(mesh.normals, vertex * 3)
      if (uv) uv.set(mesh.uv, vertex * 2)
      for (let i = 0; i < mesh.indices.length; i++) indices[index + i] = mesh.indices[i] + vertex
      faceRanges.push({ faceIndex, firstIndex: index, indexCount: mesh.indices.length })
      vertex += mesh.positions.length / 3; index += mesh.indices.length
    }
    return { status: 'success', message: 'Meshed independent source faces for display.', positions, normals, indices, faceRanges, faceCount: entries.length, ...(uv ? { uv } : {}), ...(origin ? { origin } : {}), engine: 'panda-brep-mesher' }
  }

  function meshBrepForDisplay (module, brep, options, sourceFaceCount, observer) {
    const nativeDisplay = typeof module.nodecBrepDisplayPreview === 'function'
    const settings = validateOptions(options, true)
    if (nativeDisplay) {
      try {
        if (sourceFaceCount === undefined) {
          const faces = brep.faces()
          try { sourceFaceCount = faces.count } finally { faces.delete() }
        }
        const observedSettings = { ...settings }
        if (typeof observer?.onProgress === 'function') observedSettings.onProgress = observer.onProgress
        if (typeof observer?.onPreview === 'function') observedSettings.onPreview = preview => {
          const checked = validateDisplayPreview(preview, sourceFaceCount, module.HEAPU8?.buffer)
          if (checked.status !== 'failed') observer.onPreview(checked)
        }
        return validateDisplayPreview(module.nodecBrepDisplayPreview(brep, observedSettings), sourceFaceCount, module.HEAPU8?.buffer)
      } catch (error) { return failedPreview(error?.message || String(error)) }
    }
    // Compatibility with older runtimes lacking native partial display output.
    const legacySettings = { ...settings, maxVertices: settings.maxVertices || 2000000, maxTriangles: settings.maxTriangles || 4000000 }
    const strict = meshBrep(module, brep, legacySettings, sourceFaceCount)
    if (strict.status === 'success' || strict.status === 'partial') return strict
    // Old runtimes/test doubles retain their existing strict failure behaviour.
    if (!module.Transform?.translationXYZ || typeof brep.getBoundingBox !== 'function') return strict
    let faces, bounds, translation
    try {
      faces = brep.faces(); sourceFaceCount = faces.count
      if (!sourceFaceCount) return strict
      bounds = brep.getBoundingBox()
      const center = bounds.min.map((x, i) => x * 0.5 + bounds.max[i] * 0.5)
      if (!center.every(Number.isFinite)) return strict
      translation = module.Transform.translationXYZ(...center.map(x => -x))
      const groups = new Map(), failedFaces = []
      let vertices = 0, triangles = 0
      for (let faceIndex = 0; faceIndex < sourceFaceCount; faceIndex++) {
        let face, isolated
        try {
          const maxVertices = legacySettings.maxVertices - vertices, maxTriangles = legacySettings.maxTriangles - triangles
          if (maxVertices < 3 || maxTriangles < 1) throw new Error('Remaining object display budget exhausted.')
          face = faces.get(faceIndex)
          isolated = face.duplicateFace(false)
          if (!isolated) throw new Error('Unable to isolate source face.')
          if (!isolated.transform(translation)) throw new Error('Unable to translate isolated face.')
          const mesh = meshBrep(module, isolated, { ...settings, maxVertices, maxTriangles }, 1)
          if (mesh.status !== 'success') throw new Error(mesh.message)
          const origin = mesh.origin ? mesh.origin.map((x, i) => x + center[i]) : center
          const key = JSON.stringify(origin)
          if (!groups.has(key)) groups.set(key, { origin, entries: [] })
          groups.get(key).entries.push({ mesh, faceIndex })
          vertices += mesh.positions.length / 3; triangles += mesh.indices.length / 3
        } catch (error) { failedFaces.push({ faceIndex, message: error?.message || String(error) }) } finally { isolated?.delete(); face?.delete() }
      }
      const chunks = [...groups.values()].map(group => mergeGroup(group.entries, group.origin))
      const rendered = sourceFaceCount - failedFaces.length
      const status = !rendered ? 'failed' : failedFaces.length ? 'partial' : 'success'
      const message = `${rendered}/${sourceFaceCount} Brep faces meshed for display; ${failedFaces.length} skipped.${failedFaces.length ? ' Skipped face IDs: ' + failedFaces.slice(0, 8).map(f => f.faceIndex).join(', ') + (failedFaces.length > 8 ? ', ...' : '') : ''}`
      return validateDisplayPreview({ ...(chunks[0] || failedPreview(message)), status, message, faceCount: rendered, sourceFaceCount, failedFaces, meshParts: chunks.slice(1), wholeObjectError: strict.message }, sourceFaceCount, module.HEAPU8?.buffer)
    } catch (error) { return failedPreview(error?.message || String(error)) } finally { translation?.delete(); bounds?.delete(); faces?.delete() }
  }
  return { meshBrepForDisplay, validateDisplayPreview, readCachedBrepDisplay }
})
