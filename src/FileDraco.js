let FileDraco = {
  readFile (name, buffer, rhino3dm) {
    let mesh = rhino3dm.DracoCompression.decompressByteArray(buffer)
    let doc = new rhino3dm.File3dm()
    let layer = new rhino3dm.Layer()
    layer.name = 'Default'
    doc.layers().add(layer)
    let attrs = new rhino3dm.ObjectAttributes()
    attrs.layerIndex = 0
    try {
      if (!mesh) throw new Error('Unable to decode the Draco mesh.')
      doc.objects().addMesh(mesh, attrs)
      return doc
    } catch (error) { doc.delete(); throw error } finally {
      mesh?.delete(); attrs.delete(); layer.delete()
    }
  }
}

export default FileDraco
