import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader'

let FilePly = {
  readFile (name, contents, rhino3dm) {
    let loader = new PLYLoader()
    let geometry = loader.parse(contents)
    let doc = new rhino3dm.File3dm()
    let layer = new rhino3dm.Layer()
    layer.name = 'Default'
    doc.layers().add(layer)
    let attrs = new rhino3dm.ObjectAttributes()
    attrs.layerIndex = 0
    let mesh = rhino3dm.Mesh.createFromThreejsJSON(geometry.toJSON())
    try {
      doc.objects().addMesh(mesh, attrs)
      return doc
    } catch (error) { doc.delete(); throw error } finally {
      mesh.delete(); attrs.delete(); layer.delete(); geometry.dispose()
    }
  }
}

export default FilePly
