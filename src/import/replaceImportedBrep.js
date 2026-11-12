import clearObjectChildren from '../display/clearObjectChildren'

function cloneDisplay (source) {
  const view = Object.create(source)
  view.children = []; view.userData = {}
  const copy = view.clone(false)
  copy.userData = { ...source.userData }
  if (source.boundingBox) copy.boundingBox = source.boundingBox.clone()
  source.children.forEach(child => copy.add(cloneDisplay(child)))
  return copy
}

export function indexImportedBreps (scene) {
  const targets = new Map()
  scene?.traverse(root => {
    const id = root.userData?.sourceGeometryId
    if (root.userData?.importedModelObject && id) {
      if (!targets.has(id)) targets.set(id, [])
      targets.get(id).push(root)
    }
  })
  return targets
}

export function replaceImportedBrep (doc, roots, parts, resources, budget) {
  roots = roots.filter(root => {
    for (let ancestor = root; ancestor; ancestor = ancestor.parent) if (ancestor === doc.three.middleground) return true
    return false
  })
  const oldGeometry = new Set(), oldSurfaces = new Set(), newGeometry = new Set(), oldObjects = new Set()
  roots.forEach(root => root.traverse(part => { oldObjects.add(part); if (part.geometry) oldGeometry.add(part.geometry); if (part.isMesh && part.geometry) oldSurfaces.add(part.geometry) }))
  parts.forEach(root => root.traverse(part => { if (part.isMesh && part.geometry) newGeometry.add(part.geometry) }))
  const vertices = set => [...set].reduce((sum, geometry) => sum + (geometry.getAttribute('position')?.count || 0), 0)
  // Count shared surface buffers for progress only. There is no hard scene
  // vertex ceiling; MeshWorkerPool remains the memory backpressure boundary.
  const nextCount = Math.max(0, budget.vertices - vertices(oldSurfaces)) + vertices(newGeometry)
  const usedResources = new Set()
  let replacesWires = false
  parts.forEach(part => part.traverse(child => { if (child.isLine && !child.userData.meshFaceEdges) replacesWires = true }))
  for (const root of roots) {
    const oldMeshes = [], oldLines = []
    root.traverse(part => { if (part.isMesh) oldMeshes.push(part); if (part.isLine && !part.userData.meshFaceEdges) oldLines.push(part) })
    // Surface regeneration must retain each placement's analytic wires and
    // local origin, including visibility and material overrides.
    const retainedWires = replacesWires ? [] : root.children.filter(child => {
      let line = false, mesh = false
      child.traverse(part => { if (part.isLine && !part.userData.meshFaceEdges) line = true; if (part.isMesh) mesh = true })
      return line && !mesh
    })
    clearObjectChildren(root)
    let meshIndex = 0, lineIndex = 0
    parts.forEach(part => {
      const copy = cloneDisplay(part)
      copy.traverse(child => {
        const previous = child.isMesh ? oldMeshes[Math.min(meshIndex++, oldMeshes.length - 1)] : child.isLine ? oldLines[Math.min(lineIndex++, oldLines.length - 1)] : null
        if (previous) {
          child.material = previous.material
          if (previous.userData.displayMaterials) child.userData.displayMaterials = { ...previous.userData.displayMaterials }
        }
        if (child.geometry) usedResources.add(child.geometry)
        for (const material of [child.material, child.userData.displayMaterials?.shading, child.userData.displayMaterials?.render].flat()) if (material) usedResources.add(material)
      })
      root.add(copy)
    })
    retainedWires.forEach(child => {
      root.add(child)
      child.traverse(part => {
        if (part.geometry) usedResources.add(part.geometry)
        for (const material of [part.material, part.userData.displayMaterials?.shading, part.userData.displayMaterials?.render].flat()) if (material) usedResources.add(material)
      })
    })
    const baseKey = root.userData.pandauiObjectId?.slice(doc.documentId.length + 1).replace(/:0$/, '') || `object:${root.userData.sourceGeometryId}`
    doc.tagImportedObject(root, baseKey, root.fullLayerPath, root.name)
    doc.configureImportedObject(root, root.fullLayerPath, false)
    root.updateMatrixWorld(true)
  }
  // Account for materials created by conversion but replaced by user overrides.
  parts.forEach(root => root.traverse(part => {
    const materials = part.userData.displayMaterials
    if (materials) resources.push(materials.render, materials.shading)
  }))
  for (const resource of new Set(resources)) {
    if (!resource) continue
    if (usedResources.has(resource)) {
      if (!doc.disposableResources.includes(resource)) doc.disposableResources.push(resource)
    } else resource.dispose()
  }
  if (roots.length) {
    // Other block instances use the same replacement buffers. Release old GPU
    // geometry only once, after every live instance has switched over.
    if (doc.disposableResources.releaseGeometry) {
      // Register all surviving placements before releasing removed children.
      // A buffer still used by another instance must remain alive.
      roots.forEach(root => root.traverse(part => oldObjects.delete(part)))
      oldObjects.forEach(part => doc.disposableResources.untrack(part))
      oldGeometry.forEach(geometry => { if (!usedResources.has(geometry)) doc.disposableResources.releaseGeometry(geometry) })
    } else {
      // Lightweight callers outside PandaUIDoc can still supply an array.
      doc.disposableResources = doc.disposableResources.filter(resource => !oldGeometry.has(resource) || usedResources.has(resource))
      oldGeometry.forEach(geometry => { if (!usedResources.has(geometry)) geometry.dispose() })
    }
    budget.vertices = nextCount
  }
  return roots.length
}
