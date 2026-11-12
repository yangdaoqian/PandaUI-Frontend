import * as THREE from 'three'
import { retainGeometry } from '../DisplayResources'

export function createRobotToolPreview (pipeline, references) {
  const sources = new Set()
  for (const reference of references || []) {
    const marker = reference.__pandauiSceneObject ? reference : { ...reference, __pandauiSceneObject: true }
    let matches = reference.__pandauiSceneObject && !marker.subobject
      ? pipeline.resolveSceneObjects({ ...marker, geometryId: null }) : []
    if (!matches.length) matches = pipeline.resolveSceneObjects(marker)
    matches = matches.filter(object => {
      const data = object.userData || {}
      return !data.nodePreview && !data.kukaPreview && !data.nonselectable &&
        (!marker.poolGeneration || data.poolGeneration === marker.poolGeneration) &&
        (marker.revision == null || Number(data.revision) === Number(marker.revision)) &&
        (!marker.instancePathKey || data.instancePathKey === marker.instancePathKey)
    })
    if (!matches.length) throw new Error('Tool scene object is unavailable or has changed. Pick the Tool again.')
    matches.forEach(object => sources.add(object))
  }
  if (!sources.size) return null
  const root = new THREE.Group()
  root.name = 'Kuka Tool Preview'
  root.userData = { nodePreview: true, nonselectable: true, kukaPreview: true, kukaNonSelectable: true }
  const materials = new Map()
  const copyMaterial = material => {
    if (Array.isArray(material)) return material.map(copyMaterial)
    if (!material) return material
    if (!materials.has(material)) {
      const copy = material.clone()
      copy.depthTest = true
      delete copy.userData.pandauiPooledMaterial
      delete copy.userData.pandauiMaterialOwner
      materials.set(material, copy)
    }
    return materials.get(material)
  }
  try {
    for (const source of sources) {
      let ancestor = source.parent
      while (ancestor && !sources.has(ancestor)) ancestor = ancestor.parent
      if (ancestor) continue
      source.updateWorldMatrix(true, true)
      source.traverse(object => {
        if (!object.geometry?.isBufferGeometry || (!object.isMesh && !object.isLine && !object.isPoints) ||
            object.userData?.selectionHighlight || object.userData?.isPlaceholder) return
        const clone = object.clone(false)
        clone.userData = {
          ...root.userData,
          edgeLines: object.userData.edgeLines,
          sharpEdge: object.userData.sharpEdge,
          meshGeometryEdges: object.userData.meshGeometryEdges
        }
        clone.material = copyMaterial(object.material)
        if (object.userData.displayMaterials) {
          clone.userData.displayMaterials = Object.fromEntries(
            Object.entries(object.userData.displayMaterials).map(([mode, material]) => [mode, copyMaterial(material)])
          )
        }
        clone.releaseGeometryResource = retainGeometry(object.geometry)
        clone.raycast = () => {}
        clone.renderOrder = object.isLine ? 1 : 0
        clone.matrixAutoUpdate = false
        clone.matrix.copy(object.matrixWorld)
        clone.matrix.decompose(clone.position, clone.quaternion, clone.scale)
        root.add(clone)
      })
    }
    if (!root.children.length) throw new Error('The picked Tool has no display geometry.')
    return root
  } catch (error) {
    const attachedMaterials = new Set()
    root.traverse(object => {
      ;[object.material, ...Object.values(object.userData?.displayMaterials || {})].flat().filter(Boolean).forEach(material => attachedMaterials.add(material))
    })
    releaseRobotPreview(root)
    materials.forEach(material => { if (!attachedMaterials.has(material)) material.dispose() })
    throw error
  }
}

export function releaseRobotPreview (root) {
  root?.parent?.remove(root)
  const geometries = new Set()
  const materials = new Set()
  root?.traverse(object => {
    if (object.releaseGeometryResource) object.releaseGeometryResource()
    else if (object.geometry) geometries.add(object.geometry)
    ;[object.material, ...Object.values(object.userData?.displayMaterials || {})].flat().filter(Boolean).forEach(material => materials.add(material))
  })
  geometries.forEach(geometry => geometry.dispose())
  materials.forEach(material => material.dispose())
  root?.children.slice().forEach(child => root.remove(child))
}
