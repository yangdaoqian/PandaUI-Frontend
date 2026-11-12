/* global FileReaderSync, importScripts */
import FileObj from '../FileObj'
import FilePly from '../FilePly'
import FileDraco from '../FileDraco'
import FileStl from '../FileStl'
import prepareBrepImportRecord from './prepareBrepImportRecord'
import collectTransferables from './collectTransferables'
import releaseTable from './releaseTable'
import { meshQualityOptions } from './MeshQuality'
import { CAD_EXTENSIONS, parseCad } from './CadFileImport'
import { parseDxf } from './DxfImport'

let module, reader, referenceReader, locatedInstances = 0, document, file, cache, cacheStart = 0, processedObjects = 0, totalObjects, stlTriangle = 0, stlCount = null
let meshingOptions, forceMeshing = false, deferMeshing = false, sampleEdges = false
let displayRecords = null, displayMetadata = null, occt = null
const readWindow = 1024 * 1024
const syncReader = new FileReaderSync()

function readAt (offset, target) {
  let copied = 0
  while (copied < target.length && offset < file.size) {
    if (!cache || offset < cacheStart || offset >= cacheStart + cache.length) {
      cacheStart = offset
      // The placement pass seeks between records; a large read-ahead window
      // would unnecessarily reread gigabytes of geometry that it skips.
      const windowSize = referenceReader ? 16 * 1024 : readWindow
      cache = new Uint8Array(syncReader.readAsArrayBuffer(file.slice(offset, offset + windowSize)))
    }
    const count = Math.min(target.length - copied, cache.length - (offset - cacheStart))
    if (!count) break
    target.set(cache.subarray(offset - cacheStart, offset - cacheStart + count), copied)
    offset += count
    copied += count
  }
  return copied
}

function release () {
  displayRecords?.return?.()
  displayRecords = displayMetadata = null
  reader?.delete(); referenceReader?.delete(); document?.delete()
  reader = referenceReader = document = file = cache = null
}

async function open (source, settings = {}, notify = () => {}) {
  release()
  file = source
  meshingOptions = { ...meshQualityOptions(), ...settings.meshingOptions }
  forceMeshing = settings.forceMeshing === true
  deferMeshing = settings.deferMeshing === true
  sampleEdges = settings.edgesOnly === true
  processedObjects = 0; locatedInstances = 0; totalObjects = undefined; stlTriangle = 0; stlCount = null
  const extension = file.name.split('.').pop().toLowerCase()
  if (CAD_EXTENSIONS.includes(extension) || extension === 'dxf') {
    let parsed
    if (extension === 'dxf') {
      notify({ phase: 'Parsing DXF on frontend', sourceBytes: file.size, readBytes: 0 })
      const dxf = parseDxf(await file.text(), meshingOptions)
      if (!dxf.records.length) throw new Error('No supported DXF geometry was found. ' + dxf.metadata.warnings.join('; '))
      parsed = { ...dxf.metadata,
        totalObjects: dxf.records.length,
        records: (function * () {
          for (let i = 0; i < dxf.records.length; i++) { const record = dxf.records[i]; dxf.records[i] = null; yield record }
        })() }
    } else {
      notify({ phase: 'Loading local CAD parser', sourceBytes: file.size, readBytes: 0 })
      if (!occt) {
        importScripts('/vendor/occt/occt-import-js.js')
        occt = await self.occtimportjs({ locateFile: name => '/vendor/occt/' + name })
      }
      notify({ phase: 'Parsing and meshing CAD on frontend', sourceBytes: file.size, readBytes: file.size })
      parsed = parseCad(occt, extension, new Uint8Array(await file.arrayBuffer()), meshingOptions)
    }
    displayRecords = parsed.records
    displayMetadata = { ...parsed }; delete displayMetadata.records
    totalObjects = parsed.totalObjects
    return { header: null, ...displayMetadata, readBytes: file.size, sourceBytes: file.size }
  }
  if (!module) {
    importScripts('/nodec/NodeC.js')
    module = await self.createNodeC({ locateFile: name => '/nodec/' + name })
  }
  if (file.name.toLowerCase().endsWith('.3dm')) {
    reader = settings.surfaceOnly ? new module.NodeCDocumentReader(file.size, readAt, module.ObjectType.Brep.value) : new module.NodeCDocumentReader(file.size, readAt)
    // Skip heavy geometry chunks while locating instance transforms. 3DM often
    // stores the actual scene placements AFTER gigabytes of block definitions.
    referenceReader = settings.surfaceOnly ? null : new module.NodeCDocumentReader(file.size, readAt, module.ObjectType.InstanceReference.value)
    return { header: reader.header(), phase: referenceReader ? 'Locating block placements' : 'Reading surfaces', readBytes: referenceReader?.position || reader.position, sourceBytes: file.size }
  }
  if (file.name.toLowerCase().endsWith('.stl') && file.size >= 84) {
    const prefix = syncReader.readAsArrayBuffer(file.slice(0, 84))
    const count = new DataView(prefix).getUint32(80, true)
    if (84 + count * 50 === file.size) {
      stlCount = count
      document = new module.File3dm()
      const layer = new module.Layer()
      const layers = document.layers()
      try { layer.name = 'Default'; layers.add(layer) } finally { releaseTable(layers); layer.delete() }
      return { header: module.nodecDocumentHeader(document), readBytes: 84, sourceBytes: file.size, totalObjects: Math.ceil(count / 10000) }
    }
  }
  // These existing codecs require a complete input (not a streaming parser).
  // Run them off the UI thread and drop source buffers before display transfer.
  let contents = extension === 'obj' ? await file.text() : new Uint8Array(await file.arrayBuffer())
  const parsers = { obj: FileObj, ply: FilePly, drc: FileDraco, stl: FileStl }
  if (!parsers[extension]) throw new Error('Unsupported frontend file format.')
  document = parsers[extension].readFile(file.name, extension === 'ply' ? contents.buffer : contents, module)
  contents = null
  if (!document) throw new Error('The file could not be read.')
  const objects = document.objects()
  try { totalObjects = objects.count } finally { releaseTable(objects) }
  return { header: module.nodecDocumentHeader(document), readBytes: file.size, sourceBytes: file.size, totalObjects }
}

function pull () {
  const records = []
  const start = performance.now()
  let bytes = 0, done = false
  const scanning = !!referenceReader
  let scanComplete = false, scanPosition = referenceReader?.position
  while (records.length < 16 && bytes < 4 * 1024 * 1024 && performance.now() - start < 12) {
    let record
    if (scanning) {
      const packet = referenceReader.next()
      scanPosition = referenceReader.position
      if (!packet) {
        referenceReader.delete(); referenceReader = null; scanComplete = true
        break
      }
      record = { instanceRecord: packet }
      bytes += packet.byteLength
      locatedInstances++
    } else if (displayRecords) {
      const next = displayRecords.next()
      if (next.done) { done = true; break }
      record = next.value
      bytes += collectTransferables(record).reduce((sum, buffer) => sum + buffer.byteLength, 0)
    } else if (stlCount != null) {
      const triangles = Math.min(10000, stlCount - stlTriangle)
      if (!triangles) { done = true; break }
      const buffer = syncReader.readAsArrayBuffer(file.slice(84 + stlTriangle * 50, 84 + (stlTriangle + triangles) * 50))
      const view = new DataView(buffer)
      const positions = new Float32Array(triangles * 9)
      for (let triangle = 0; triangle < triangles; triangle++) {
        for (let axis = 0; axis < 9; axis++) positions[triangle * 9 + axis] = view.getFloat32(triangle * 50 + 12 + axis * 4, true)
      }
      stlTriangle += triangles
      record = { positions }
      bytes += positions.byteLength
    } else {
      record = reader ? (sampleEdges && reader.nextEdgesOnly ? reader.nextEdgesOnly(meshingOptions.tolerance, meshingOptions.angleTolerance) : sampleEdges && reader.nextWithEdges ? reader.nextWithEdges(meshingOptions.tolerance, meshingOptions.angleTolerance) : reader.next()) : module.nodecTakeObject(document)
      if (!record) { done = true; break }
      bytes += record.objectRecord?.byteLength || record.byteLength || 0
      bytes += record.edgePreview?.positions?.byteLength || 0
      if (reader && !record.objectRecord && !record.displayInfo) {
        record = deferMeshing ? { objectRecord: record, needsMeshing: true } : prepareBrepImportRecord(module, record, meshingOptions, forceMeshing)
        bytes += record.edgePreview?.positions?.byteLength || 0
        if (record.brepPreview) for (const mesh of [record.brepPreview, ...(record.brepPreview.meshParts || [])]) bytes += mesh.positions.byteLength + mesh.normals.byteLength + mesh.indices.byteLength
      }
    }
    records.push(record)
    if (!scanning) processedObjects++
  }
  const progress = { phase: scanning ? 'Locating block placements' : 'Importing on frontend', placementScanComplete: scanComplete, locatedInstances, processedObjects, totalObjects, readBytes: scanning ? scanPosition : reader ? reader.position : stlCount != null ? 84 + stlTriangle * 50 : file.size, sourceBytes: file.size }
  // RDK embedded images can live after the geometry table. Read them only at
  // EOF, after every geometry component has been removed from the reader model.
  const materialHeader = done && sampleEdges && reader ? reader.header() : undefined
  if (done) release()
  return { records, done, ...progress, ...(materialHeader ? { materialHeader } : {}) }
}

let queue = Promise.resolve()

self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      const result = data.type === 'open' ? await open(data.file, data.settings, progress => self.postMessage({ id: data.id, progress })) : pull()
      self.postMessage({ id: data.id, result }, collectTransferables(result))
    } catch (error) {
      release()
      self.postMessage({ id: data.id, error: error?.message || String(error) })
    }
  })
}
