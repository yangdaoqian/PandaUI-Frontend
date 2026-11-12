/* global FileReaderSync, importScripts */
import { meshBrepForDisplay, validateDisplayPreview } from '../../public/nodec/BrepDisplayMeshing'
import { execute as executeControlPoints } from '../../public/nodec/GeometryControlPoints'
import { meshQualityOptions } from '../import/MeshQuality'
import releaseTable from '../import/releaseTable'
import collectTransferables from '../import/collectTransferables'

const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }

// File3dm tables hide Embind's delete() with delete(id). Always release both
// the record and the table wrapper; otherwise a scan retains the entire file.
export function readGeometrySource (module, file, sourceGeometryId, syncReader = new FileReaderSync()) {
  if (!file || !/\.3dm$/i.test(file.name || '') || !Number.isSafeInteger(file.size) || file.size <= 0) fail('INVALID_SOURCE_FILE', 'Control point editing requires the original local .3dm file.')
  if (!sourceGeometryId) fail('MISSING_SOURCE_ID', 'The selected placement has no source geometry ID.')
  let cache, cacheStart = 0, reader, metadata, table
  const readAt = (offset, target) => {
    let copied = 0
    while (copied < target.length && offset < file.size) {
      if (!cache || offset < cacheStart || offset >= cacheStart + cache.length) {
        cacheStart = offset
        cache = new Uint8Array(syncReader.readAsArrayBuffer(file.slice(offset, Math.min(file.size, offset + 1024 * 1024))))
      }
      const count = Math.min(target.length - copied, cache.length - (offset - cacheStart))
      if (!count) break
      target.set(cache.subarray(offset - cacheStart, offset - cacheStart + count), copied)
      offset += count; copied += count
    }
    return copied
  }
  try {
    reader = new module.NodeCDocumentReader(file.size, readAt)
    const header = reader.header()
    metadata = module.File3dm.fromByteArray(header)
    if (!metadata) fail('INVALID_SOURCE_FILE', 'Unable to read the model metadata.')
    table = metadata.objects()
    let record
    while ((record = reader.next())) {
      let id, object, geometry, attributes
      try {
        id = module.nodecAppendObject(metadata, record)
        if (String(id).toLowerCase() !== String(sourceGeometryId).toLowerCase()) continue
        object = table.findId(id)
        geometry = object?.geometry(); attributes = object?.attributes()
        if (!geometry || !attributes) fail('INVALID_SOURCE_GEOMETRY', 'Unable to read the selected source geometry.')
        return {
          geometry: geometry.encode(),
          // An ordinary number array survives JSON history serialization.
          attributes: Array.from(module.nodecEncodeAttributes(attributes)),
          displayAttributes: { id: attributes.id, name: attributes.name, layerIndex: attributes.layerIndex, materialIndex: attributes.materialIndex, visible: attributes.visible },
          header
        }
      } finally {
        attributes?.delete(); geometry?.delete(); object?.delete()
        if (id) table.delete(id)
      }
    }
    fail('SOURCE_GEOMETRY_NOT_FOUND', 'The selected geometry was not found in the original .3dm file.')
  } finally {
    releaseTable(table); metadata?.delete(); reader?.delete()
    cache = null
  }
}

export function previewGeometry (module, archive, options) {
  if (!archive?.data) fail('INVALID_GEOMETRY', 'An encoded geometry archive is required.')
  const geometry = module.CommonObject.decode(archive)
  let brep, bounds, faces
  if (!geometry) fail('INVALID_GEOMETRY', 'Unable to decode the edited geometry.')
  try {
    let display = geometry, type = 'Curve'
    if (module.SubD && geometry instanceof module.SubD) type = 'SubD'
    else if (geometry instanceof module.Brep) type = 'Brep'
    else if (geometry instanceof module.Surface) {
      // Surface archives remain surfaces. Only the disposable display proxy is
      // converted to a Brep, because SceneUtilities renders Brep mesh buffers.
      brep = module.Brep.createFromSurface(geometry)
      if (!brep) fail('PREVIEW_FAILED', 'Unable to create a surface display.')
      display = brep; type = 'Brep'
    } else if (!(geometry instanceof module.Curve)) fail('INVALID_GEOMETRY_TYPE', 'Control point display requires a curve or surface.')
    const { subdDisplayMode, ...meshOptions } = options || {}
    const settings = { ...meshQualityOptions(), ...meshOptions }
    bounds = display.getBoundingBox()
    const info = { type, min: bounds.min, max: bounds.max }
    if (type === 'SubD') {
      info.subdDisplayMode = subdDisplayMode === 'mesh' ? 'mesh' : 'smooth'
      const mesh = module.nodecSubDDisplayMesh(geometry, info.subdDisplayMode === 'smooth', 3)
      try { info.subdPreview = module.nodecMeshPreview(mesh) } finally { mesh.delete() }
      return info
    }
    if (type === 'Brep') {
      faces = display.faces()
      info.faceCount = faces.count
      info.brepPreview = validateDisplayPreview(meshBrepForDisplay(module, display, settings, faces.count), faces.count)
      if (info.brepPreview.status !== 'success') {
        const detail = info.brepPreview.failedFaces?.[0]?.message
        fail('PREVIEW_FAILED', [info.brepPreview.message || 'Unable to mesh all edited faces.', detail].filter(Boolean).join(' '))
      }
    }
    info.edgePreview = module.nodecEdgePreview(display, settings.tolerance, settings.angleTolerance)
    if (!info.edgePreview?.positions?.length) fail('PREVIEW_FAILED', 'Unable to sample the edited geometry edges.')
    return info
  } finally { faces?.delete(); bounds?.delete(); brep?.delete(); geometry.delete() }
}

export function executeSourceOperation (module, operation, payload) {
  if (operation === 'source.load') return readGeometrySource(module, payload.file, payload.sourceGeometryId)
  if (operation === 'geometry.preview') return previewGeometry(module, payload.geometry, payload.meshingOptions)
  if (operation === 'geometry.controlPoints' || operation === 'geometry.setControlPoints') return executeControlPoints(module, operation, payload)
  fail('UNSUPPORTED_OPERATION', 'Unsupported control point source operation: ' + operation)
}

// The client uses a disposable worker per request. terminate() can cancel even
// synchronous native file reading/meshing, releasing the WASM heap immediately.
if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  let runtime, queue = Promise.resolve()
  self.onmessage = ({ data }) => {
    queue = queue.then(async () => {
      try {
        if (!runtime) {
          importScripts('/nodec/NodeC.js')
          runtime = self.createNodeC({ locateFile: name => '/nodec/' + name })
        }
        const result = executeSourceOperation(await runtime, data.operation, data.payload || {})
        self.postMessage({ id: data.id, result }, collectTransferables(result))
      } catch (error) {
        self.postMessage({ id: data.id, error: { name: error.name, code: error.code, message: error.message || String(error) } })
      }
    })
  }
}
