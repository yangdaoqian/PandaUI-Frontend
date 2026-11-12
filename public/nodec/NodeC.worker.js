/* global importScripts, createNodeC, PandaUILocalNodeExecution, PandaUIBrepMeshing, PandaUIControlPoints */
importScripts('NodeC.js')
importScripts('GeometryControlPoints.js')
importScripts('GraphControlPointExecution.js')
importScripts('GraphPointExecution.js')
importScripts('GraphLocalExecution.js')
importScripts('BrepMeshing.js')

const runtime = createNodeC({ locateFile: name => new URL(name, self.location.href).href })
// Preserve the rejection for requests arriving after a failed initialization.
runtime.catch(() => {})
const operations = ['capabilities', 'curve.preview', 'curve.evaluate', 'mesh.preview', 'brep.mesh', 'geometry.transform', 'geometry.controlPoints', 'geometry.setControlPoints', 'document.inspect', 'node.execute']

function fail (code, message) { throw Object.assign(new Error(message), { code }) }

function releaseTable (table) {
  for (let prototype = Object.getPrototypeOf(table || {}); prototype; prototype = Object.getPrototypeOf(prototype)) {
    if (Object.prototype.hasOwnProperty.call(prototype, 'isDeleted') && Object.prototype.hasOwnProperty.call(prototype, 'delete')) {
      if (!prototype.isDeleted.call(table)) prototype.delete.call(table)
      return
    }
  }
}

function decode (module, archive) {
  if (!archive || typeof archive.data !== 'string' || !archive.data.length) fail('INVALID_GEOMETRY', 'An encoded geometry archive is required.')
  const geometry = module.CommonObject.decode(archive)
  if (!geometry) fail('INVALID_GEOMETRY', 'The geometry archive could not be decoded.')
  return geometry
}

function execute (module, operation, payload) {
  if (operation === 'capabilities') {
    return { runtime: 'NodeC', version: module.NodeCVersion, openNurbsVersion: module.Version, operations: operations.filter(name => name !== 'brep.mesh' || typeof module.nodecBrepPreview === 'function'), dotnet: false, rhinoInside: false, occt: false }
  }
  if (!operations.includes(operation)) fail('UNSUPPORTED_OPERATION', 'This operation requires another execution backend: ' + operation)
  if (operation === 'node.execute') return PandaUILocalNodeExecution.executePlan(module, payload)
  if (operation === 'document.inspect') {
    const bytes = payload.bytes
    if (!(bytes instanceof ArrayBuffer) && !(bytes instanceof Uint8Array)) fail('INVALID_DOCUMENT', 'Expected 3DM bytes.')
    const document = module.File3dm.fromByteArray(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes)
    if (!document) fail('INVALID_DOCUMENT', 'The 3DM document could not be read.')
    let objects, layers
    try {
      objects = document.objects()
      layers = document.layers()
      return { objectCount: objects.count, layerCount: layers.count }
    } finally {
      // Release Embind wrappers through the base destructor, not delete(id).
      releaseTable(objects); releaseTable(layers)
      document.delete()
    }
  }
  const geometry = decode(module, payload.geometry)
  try {
    if (operation === 'geometry.controlPoints') return PandaUIControlPoints.read(module, geometry)
    if (operation === 'geometry.setControlPoints') return PandaUIControlPoints.set(module, geometry, payload)
    if (operation === 'brep.mesh') {
      if (!(geometry instanceof module.Brep)) fail('INVALID_GEOMETRY_TYPE', 'Expected a Brep.')
      return { primitive: 'mesh', ...PandaUIBrepMeshing.meshBrep(module, geometry, payload.options) }
    }
    if (operation === 'curve.preview' || operation === 'curve.evaluate') {
      if (!(geometry instanceof module.Curve)) fail('INVALID_GEOMETRY_TYPE', 'Expected a curve.')
      if (operation === 'curve.preview') {
        const chord = payload.chordTolerance ?? 0.01
        const angle = payload.angleTolerance ?? Math.PI / 90
        const depth = payload.maximumDepth ?? 12
        if (!Number.isFinite(chord) || chord <= 0 || !Number.isFinite(angle) || angle <= 0 || !Number.isInteger(depth) || depth < 1 || depth > 20) fail('INVALID_ARGUMENT', 'Invalid curve preview tolerances or depth.')
        return { primitive: 'polyline', positions: module.nodecCurvePreview(geometry, chord, angle, depth) }
      }
      const parameters = payload.parameters
      if ((!Array.isArray(parameters) && !(parameters instanceof Float64Array)) || parameters.some(t => !Number.isFinite(t))) fail('INVALID_ARGUMENT', 'Expected finite curve parameters.')
      const positions = new Float64Array(parameters.length * 3)
      parameters.forEach((t, i) => positions.set(geometry.pointAt(t), i * 3))
      return { positions }
    }
    if (operation === 'mesh.preview') {
      if (!(geometry instanceof module.Mesh)) fail('INVALID_GEOMETRY_TYPE', 'Expected a mesh.')
      const preview = module.nodecMeshPreview(geometry)
      return { primitive: 'mesh', ...preview, indices: new Uint32Array(preview.indices.buffer) }
    }
    if (operation === 'geometry.transform') {
      const matrix = payload.matrix
      if ((!Array.isArray(matrix) && !(matrix instanceof Float64Array)) || matrix.length !== 16 || matrix.some(value => !Number.isFinite(value))) fail('INVALID_ARGUMENT', 'Expected a finite 4x4 row-major matrix.')
      if (!(geometry instanceof module.GeometryBase)) fail('INVALID_GEOMETRY_TYPE', 'Expected transformable geometry.')
      const transform = new module.Transform(1)
      try {
        for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) transform['m' + row + column] = matrix[row * 4 + column]
        if (!geometry.transform(transform)) fail('TRANSFORM_FAILED', 'The geometry could not be transformed.')
        return { geometry: geometry.encode() }
      } finally { transform.delete() }
    }
  } finally { geometry.delete() }
}

function transferables (value) {
  const found = new Set(), visited = new Set()
  function collect (item) {
    if (item instanceof ArrayBuffer) found.add(item)
    else if (ArrayBuffer.isView(item)) found.add(item.buffer)
    else if (item && typeof item === 'object' && !visited.has(item)) {
      visited.add(item)
      Object.values(item).forEach(collect)
    }
  }
  collect(value)
  return [...found]
}

let queue = Promise.resolve()
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    const { taskId, generation, operation, payload = {} } = data || {}
    if (typeof taskId !== 'string' || !Number.isSafeInteger(generation)) return
    try {
      const module = await runtime
      const result = execute(module, operation, payload)
      self.postMessage({ taskId, generation, ok: true, result }, transferables(result))
    } catch (error) {
      self.postMessage({ taskId, generation, ok: false, error: { code: error?.code || 'NODEC_FAILED', message: error?.message || String(error) } })
    }
  }).catch(error => {
    // A failed postMessage/transport must reach the client, not strand promises.
    setTimeout(() => { throw error }, 0)
  })
}
