/* global globalThis */
// Shared by the classic compute worker and the bundled progressive importer.
(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PandaUIBrepMeshing = api
})(typeof self !== 'undefined' ? self : globalThis, function () {
  const defaults = Object.freeze({ tolerance: 0.02, angleTolerance: Math.PI / 9, minimumEdgeLength: 0.000001, maximumEdgeLength: 0, maxVertices: 250000, maxTriangles: 500000, maxDepth: 16 })

  function validateOptions (options = {}, unlimited = false) {
    const invalid = () => { throw Object.assign(new Error('Invalid Brep meshing options.'), { code: 'INVALID_ARGUMENT' }) }
    if (!options || typeof options !== 'object' || Array.isArray(options) || ArrayBuffer.isView(options)) invalid()
    if (Object.keys(options).some(key => !Object.prototype.hasOwnProperty.call(defaults, key))) invalid()
    const settings = { ...defaults, ...(unlimited ? { maxVertices: 0, maxTriangles: 0 } : {}), ...options }
    if (Object.values(settings).some(value => !Number.isFinite(value)) || settings.tolerance <= 0 || settings.angleTolerance <= 0 || settings.angleTolerance > Math.PI || settings.minimumEdgeLength < 0 || settings.maximumEdgeLength < 0 || (settings.maximumEdgeLength > 0 && settings.maximumEdgeLength < settings.minimumEdgeLength)) invalid()
    for (const [key, min, max] of [['maxVertices', 3, 2000000], ['maxTriangles', 1, 4000000], ['maxDepth', 1, 24]]) {
      if (unlimited && key !== 'maxDepth' && settings[key] === 0) continue
      if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) invalid()
    }
    return settings
  }

  function failedPreview (message) {
    return { status: 'failed', message: message || 'Brep meshing failed.', positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0) }
  }

  function validatePreview (preview, faceCount, heapBuffer) {
    const invalid = reason => failedPreview('Invalid Brep mesher output: ' + reason)
    if (preview?.status === 'failed') {
      const message = typeof preview.message === 'string' ? preview.message : 'Brep meshing failed.'
      return failedPreview(message + (preview.indices?.length ? ' Incomplete triangles were discarded.' : ''))
    }
    if (preview?.status !== 'success' || typeof preview.message !== 'string') return invalid('an explicit status and message are required.')
    const { positions, normals, indices } = preview
    if (!(positions instanceof Float32Array) || !(normals instanceof Float32Array) || !(indices instanceof Uint32Array)) return invalid('expected Float32 positions/normals and Uint32 indices.')
    if (heapBuffer && [positions, normals, indices].some(array => array.buffer === heapBuffer)) return invalid('buffers must be owned by JavaScript.')
    if (!positions.length || positions.length % 3 || normals.length !== positions.length || !indices.length || indices.length % 3) return invalid('empty or inconsistent mesh buffers.')
    if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite)) return invalid('nonfinite coordinates or normals.')
    const vertexCount = positions.length / 3
    if (preview.uv !== undefined && (!(preview.uv instanceof Float32Array) || preview.uv.length !== vertexCount * 2 || !preview.uv.every(Number.isFinite) || preview.uv.buffer === heapBuffer)) return invalid('invalid texture coordinates.')
    if (indices.some(index => index >= vertexCount)) return invalid('an index is outside the vertex buffer.')
    if (!Number.isInteger(faceCount) || faceCount < 1 || (preview.faceCount !== undefined && preview.faceCount !== faceCount)) return invalid('the mesh does not cover every Brep face.')
    if (preview.faceRanges !== undefined) {
      if (!Array.isArray(preview.faceRanges) || preview.faceRanges.length !== faceCount) return invalid('incomplete face ranges.')
      let offset = 0
      const faces = new Set()
      for (const range of preview.faceRanges) {
        if (!range || !Number.isInteger(range.faceIndex) || range.faceIndex < 0 || range.faceIndex >= faceCount || faces.has(range.faceIndex) || range.firstIndex !== offset || !Number.isInteger(range.indexCount) || range.indexCount < 3 || range.indexCount % 3) return invalid('invalid face ranges.')
        faces.add(range.faceIndex)
        offset += range.indexCount
      }
      if (offset !== indices.length) return invalid('face ranges do not cover the triangle buffer.')
    }
    const diagnostics = {}
    if (preview.origin !== undefined) {
      if (!Array.isArray(preview.origin) || preview.origin.length !== 3 || !preview.origin.every(Number.isFinite)) return invalid('invalid local mesh origin.')
      diagnostics.origin = preview.origin.slice()
    }
    for (const key of ['repairedBoundarySlivers', 'discardedDegenerateTriangles', 'repairedNormalTriangles', 'repairedUVVertices', 'splitBoundaryComponents', 'maximumBoundaryDeviation']) {
      if (preview[key] === undefined) continue
      if (!Number.isFinite(preview[key]) || preview[key] < 0 || (key !== 'maximumBoundaryDeviation' && !Number.isInteger(preview[key]))) return invalid('invalid repair diagnostics.')
      diagnostics[key] = preview[key]
    }
    if (preview.faceReports !== undefined) {
      if (!Array.isArray(preview.faceReports) || preview.faceReports.some(report => !report || !Number.isInteger(report.faceIndex) || typeof report.surfaceType !== 'string' || typeof report.entryPoint !== 'string' || typeof report.boundaryPath !== 'string' || typeof report.triangulationPath !== 'string' || !Number.isInteger(report.fallbackStage) || report.fallbackStage < 0 || typeof report.success !== 'boolean' || !Number.isInteger(report.vertexCount) || report.vertexCount < 0 || !Number.isInteger(report.triangleCount) || report.triangleCount < 0 || typeof report.message !== 'string')) return invalid('invalid face path diagnostics.')
      diagnostics.faceReports = preview.faceReports.map(report => ({ ...report }))
    }
    return { status: 'success', message: preview.message, positions, normals, indices, faceCount, ...diagnostics, ...(preview.uv ? { uv: preview.uv } : {}), ...(preview.faceRanges ? { faceRanges: preview.faceRanges } : {}), ...(typeof preview.engine === 'string' ? { engine: preview.engine } : {}) }
  }

  function meshBrep (module, brep, options, faceCount) {
    const settings = validateOptions(options)
    if (typeof module.nodecBrepPreview !== 'function') return failedPreview('This NodeC runtime does not provide the Brep mesher.')
    try {
      if (faceCount === undefined) {
        const faces = brep.faces()
        try { faceCount = faces.count } finally { faces.delete() }
      }
      return validatePreview(module.nodecBrepPreview(brep, settings), faceCount, module.HEAPU8?.buffer)
    } catch (error) { return failedPreview(error?.message || String(error)) }
  }

  // Mesh/face lists are Embind handles too. Checking the cache must not retain
  // them, even when a damaged face throws while its saved mesh is read.
  function hasMeshTriangles (mesh) {
    if (!mesh) return false
    let vertices, faces
    try {
      vertices = mesh.vertices()
      faces = mesh.faces()
      return vertices.count > 0 && faces.count > 0
    } finally { faces?.delete(); vertices?.delete() }
  }

  function inspectCache (module, brep) {
    const faces = brep.faces()
    let missingMeshFaces = 0
    try {
      const faceCount = faces.count
      for (let index = 0; index < faceCount; index++) {
        let face, mesh
        try {
          face = faces.get(index)
          mesh = face?.getMesh(module.MeshType.Any)
          if (!hasMeshTriangles(mesh)) missingMeshFaces++
        } finally { mesh?.delete(); face?.delete() }
      }
      return { faceCount, missingMeshFaces }
    } finally { faces.delete() }
  }

  return { validateOptions, validatePreview, failedPreview, meshBrep, inspectCache, hasMeshTriangles }
})
