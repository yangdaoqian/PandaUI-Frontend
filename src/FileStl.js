import { STLLoader } from 'three/examples/jsm/loaders/STLLoader'

function asArrayBuffer (contents) {
  if (contents instanceof ArrayBuffer) return contents
  if (ArrayBuffer.isView(contents)) {
    if (contents.byteOffset === 0 && contents.byteLength === contents.buffer.byteLength) return contents.buffer
    return contents.buffer.slice(contents.byteOffset, contents.byteOffset + contents.byteLength)
  }
  if (typeof contents === 'string') return new TextEncoder().encode(contents).buffer
  throw new TypeError('STL contents must be an ArrayBuffer, typed array, or string.')
}

const FileStl = {
  readFile (name, contents, rhino3dm) {
    const loader = new STLLoader()
    const geometry = loader.parse(asArrayBuffer(contents))
    let doc = null
    let layer = null
    let attributes = null
    let mesh = null
    try {
      const positions = geometry.getAttribute('position')
      if (!positions || positions.count < 3 || positions.count % 3 !== 0 || !positions.array.every(Number.isFinite)) {
        throw new Error('STL contains no valid triangles.')
      }
      geometry.computeVertexNormals()
      doc = new rhino3dm.File3dm()
      layer = new rhino3dm.Layer()
      layer.name = 'Default'
      attributes = new rhino3dm.ObjectAttributes()
      attributes.layerIndex = doc.layers().add(layer)
      attributes.name = name
      mesh = rhino3dm.Mesh.createFromThreejsJSON(geometry.toJSON())
      if (!mesh) throw new Error('STL mesh could not be converted.')
      doc.objects().addMesh(mesh, attributes)
      return doc
    } catch (error) {
      doc?.delete()
      throw error
    } finally {
      mesh?.delete()
      attributes?.delete()
      layer?.delete()
      geometry.dispose()
    }
  }
}

export default FileStl
