// OCCT converts a dependency-complete CAD payload. ProgressiveStepImport feeds
// STEP jobs individually; IGES/BREP currently feed the complete source file.
export const CAD_EXTENSIONS = ['step', 'stp', 'iges', 'igs', 'brep']

export function parseCad (runtime, extension, bytes, options = {}) {
  const method = { step: 'ReadStepFile', stp: 'ReadStepFile', iges: 'ReadIgesFile', igs: 'ReadIgesFile', brep: 'ReadBrepFile' }[extension]
  if (!method) throw new Error('Unsupported CAD format.')
  const result = runtime[method](bytes, {
    linearUnit: 'millimeter',
    linearDeflectionType: 'absolute_value',
    linearDeflection: options.tolerance || 0.05,
    angularDeflection: options.angleTolerance || Math.PI / 16
  })
  if (!result?.success || !result.meshes?.length) throw new Error('The CAD file contains no readable surface meshes. Wire-only shapes are not supported by this CAD reader.')
  const placements = [], paths = new Set()
  const layerName = (node, index) => String(node.name || `Assembly ${index + 1}`).replace(/::/g, ':').replace(/\//g, '_')
  const visit = (node, parent, index = 0, occurrenceName = null) => {
    const name = occurrenceName || layerName(node, index)
    const path = parent ? `${parent}::${name}` : name
    paths.add(path)
    for (const mesh of node.meshes || []) placements.push({ mesh, path })
    const used = new Set()
    ;(node.children || []).forEach((child, i) => {
      const base = layerName(child, i)
      let name = base, occurrence = 1
      while (used.has(name)) name = `${base} (${++occurrence})`
      used.add(name)
      visit(child, path, i, name)
    })
  }
  if (result.root) visit(result.root, '')
  const referenced = new Set(placements.map(item => item.mesh))
  result.meshes.forEach((mesh, index) => { if (!referenced.has(index)) placements.push({ mesh: index, path: 'Default' }) })
  placements.forEach(item => paths.add(item.path))
  const references = new Map()
  placements.forEach(({ mesh }) => references.set(mesh, (references.get(mesh) || 0) + 1))
  function * records () {
    try {
      for (let index = 0; index < placements.length; index++) {
        const entry = placements[index], mesh = result.meshes[entry.mesh]
        if (!mesh?.attributes?.position?.array?.length || !mesh.index?.array?.length) continue
        const baseColor = mesh.color || [0.7, 0.7, 0.7]
        const materials = [{ color: baseColor }], groups = [], materialIds = new Map([[baseColor.join(','), 0]])
        const addGroup = (start, count, materialIndex) => {
          const last = groups[groups.length - 1]
          if (last && last.materialIndex === materialIndex && last.start + last.count === start) last.count += count
          else groups.push({ start, count, materialIndex })
        }
        let cursor = 0
        const faces = [...(mesh.brep_faces || [])].sort((a, b) => a.first - b.first)
        for (const face of faces) {
          const start = face.first * 3, end = (face.last + 1) * 3
          if (start > cursor) addGroup(cursor, start - cursor, 0)
          let materialIndex = 0
          if (face.color) {
            const key = face.color.join(',')
            if (!materialIds.has(key)) { materialIds.set(key, materials.length); materials.push({ color: face.color }) }
            materialIndex = materialIds.get(key)
          }
          if (end > start) addGroup(start, end - start, materialIndex)
          cursor = end
        }
        if (cursor < mesh.index.array.length) addGroup(cursor, mesh.index.array.length - cursor, 0)
        const displayObject = {
          id: `cad:${index}`,
          name: mesh.name || `Part ${index + 1}`,
          layerPath: entry.path,
          kind: 'mesh',
          color: baseColor,
          materials,
          groups,
          positions: new Float32Array(mesh.attributes.position.array),
          normals: mesh.attributes.normal?.array ? new Float32Array(mesh.attributes.normal.array) : undefined,
          indices: new Uint32Array(mesh.index.array)
        }
        const remaining = references.get(entry.mesh) - 1
        references.set(entry.mesh, remaining)
        if (!remaining) result.meshes[entry.mesh] = null
        yield { displayObject }
      }
    } finally { result.meshes.length = 0; placements.length = 0 }
  }
  return { records: records(), totalObjects: placements.length, layers: [...paths].map(fullPath => ({ fullPath, visible: true })), units: extension === 'brep' ? 'model units' : 'millimeter', warnings: ['CAD surfaces are imported as editable display meshes; exact CAD topology is not retained.'] }
}
