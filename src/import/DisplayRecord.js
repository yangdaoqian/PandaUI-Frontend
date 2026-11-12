// Minimal adapter for existing material/layer conversion. No analytical Brep
// is reconstructed on the UI thread; only small object attributes are decoded.
export function decodeDisplayRecord (module, info) {
  const attributes = module.nodecDecodeAttributes(info.attributes)
  if (!attributes) throw new Error('Unable to decode display attributes.')
  const geometry = {
    objectType: module.ObjectType[info.type],
    getBoundingBox: () => ({ min: info.min, max: info.max, delete () {} }),
    delete () {}
  }
  if (info.type === 'Brep') {
    geometry.faces = () => ({ count: info.faceCount, delete () {} })
    geometry.edges = () => { throw new Error('Display records require sampled edges.') }
  } else if (info.type === 'SubD') {
    geometry.subdArchive = info.subdArchive
    geometry.subdDisplayMode = info.subdDisplayMode || 'smooth'
    geometry.displayMesh = () => ({
      toThreejsBuffers: () => ({ position: info.subdPreview.positions, normal: info.subdPreview.normals, index: info.subdPreview.indices }),
      vertices: () => ({ count: info.subdPreview.positions.length / 3, delete () {} }),
      getBoundingBox: geometry.getBoundingBox,
      delete () {}
    })
  } else if (info.type === 'Curve') {
    geometry.pointAt = geometry.tangentAt = () => { throw new Error('Display records require sampled curves.') }
  }
  return { attributes, geometry }
}
