/* global importScripts, FileReaderSync */
import releaseTable from '../import/releaseTable'

// Yield one original geometry at a time. The consumer acknowledges after its
// upload, so neither the main thread nor this WASM heap queues a whole model.
export function * geometryArchives (module, file, sourceIds, syncReader = new FileReaderSync()) {
  const wanted = new Set(sourceIds.map(id => id.toLowerCase()))
  let cache, start = 0, reader, metadata, table
  const readAt = (offset, target) => {
    let copied = 0
    while (copied < target.length && offset < file.size) {
      if (!cache || offset < start || offset >= start + cache.length) {
        start = offset
        cache = new Uint8Array(syncReader.readAsArrayBuffer(file.slice(offset, Math.min(file.size, offset + 1024 * 1024))))
      }
      const count = Math.min(target.length - copied, cache.length - (offset - start))
      if (!count) break
      target.set(cache.subarray(offset - start, offset - start + count), copied)
      copied += count; offset += count
    }
    return copied
  }
  try {
    reader = new module.NodeCDocumentReader(file.size, readAt)
    metadata = module.File3dm.fromByteArray(reader.header())
    if (!metadata) throw new Error('Unable to read original geometry metadata.')
    table = metadata.objects()
    let record
    while (wanted.size && (record = reader.next())) {
      let id, object, geometry, value
      try {
        id = module.nodecAppendObject(metadata, record)
        if (!wanted.has(String(id).toLowerCase())) continue
        object = table.findId(id); geometry = object?.geometry()
        if (!geometry) throw new Error('Unable to read original geometry ' + id)
        value = { sourceGeometryId: String(id), geometry: geometry.encode() }
        wanted.delete(String(id).toLowerCase())
      } finally { geometry?.delete(); object?.delete(); if (id) table.delete(id) }
      if (value) yield value
    }
    if (wanted.size) throw new Error('Original geometry not found: ' + [...wanted].join(', '))
  } finally { releaseTable(table); metadata?.delete(); reader?.delete(); cache = null }
}

export function encodeDisplayGeometry (module, part) {
  let geometry
  try {
    if (part.type === 'Mesh') geometry = module.Mesh.createFromThreejsJSON(part.json)
    else if (part.type === 'Points' && part.points.length === 1) geometry = new module.Point(part.points[0])
    else if (part.type === 'Line') geometry = new module.PolylineCurve(part.points)
    else throw new Error('This scene geometry cannot yet be published: ' + part.type)
    if (!geometry) throw new Error('Unable to encode original mesh/curve geometry.')
    return geometry.encode()
  } finally { geometry?.delete() }
}

if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  let runtime, iterator
  self.onmessage = async ({ data }) => {
    try {
      if (!runtime) { importScripts('/nodec/NodeC.js'); runtime = self.createNodeC({ locateFile: name => '/nodec/' + name }) }
      const module = await runtime
      if (data.operation === 'scan') iterator = geometryArchives(module, data.file, data.sourceIds)
      if (data.operation === 'scan' || data.operation === 'next') {
        const item = iterator.next()
        self.postMessage(item.done ? { done: true } : { archive: item.value })
      } else if (data.operation === 'encode') self.postMessage({ geometry: encodeDisplayGeometry(module, data.part) })
    } catch (error) { iterator?.return(); self.postMessage({ error: error.message || String(error) }) }
  }
}
