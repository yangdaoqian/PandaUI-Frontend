import * as THREE from 'three'
import { geometryReference } from './DisplayResources'

const selections = new WeakMap()

export function rangeAtIntersection (hit) {
  const data = hit?.object?.userData
  const ranges = data?.faceRanges || data?.edgeRanges
  if (!ranges) return null
  const offset = data.faceRanges ? hit.faceIndex * 3 : hit.index
  if (!Number.isInteger(offset)) return null
  let lower = 0
  let upper = ranges.length - 1
  while (lower <= upper) {
    const middle = (lower + upper) >>> 1
    const range = ranges[middle]
    if (offset < range.indexStart) upper = middle - 1
    else if (offset >= range.indexStart + range.indexCount) lower = middle + 1
    else return { type: data.faceRanges ? 'brepFace' : 'brepEdge', index: data.faceRanges ? range.faceIndex : range.edgeIndex, range }
  }
  return null
}

export function compactRangeGeometry (source, range) {
  const sourceIndex = source.index
  const count = range.indexCount
  const remap = new Map()
  const indices = new Uint32Array(count)
  for (let offset = 0; offset < count; offset++) {
    const vertex = sourceIndex ? sourceIndex.getX(range.indexStart + offset) : range.indexStart + offset
    if (!remap.has(vertex)) remap.set(vertex, remap.size)
    indices[offset] = remap.get(vertex)
  }
  const geometry = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const values = new attribute.array.constructor(remap.size * attribute.itemSize)
    for (const [original, target] of remap) {
      for (let component = 0; component < attribute.itemSize; component++) values[target * attribute.itemSize + component] = attribute.array[original * attribute.itemSize + component]
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized))
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometryReference(geometry)
  return geometry
}

export function createBrepSelection (source, subobject) {
  const range = subobject.range || (source.userData.faceRanges || source.userData.edgeRanges || []).find(range => (subobject.type === 'brepFace' ? range.faceIndex : range.edgeIndex) === subobject.index)
  if (!range) return null
  const geometry = compactRangeGeometry(source.geometry, range)
  const materialIndex = source.isMesh && source.geometry.groups.length > 0
    ? source.geometry.groups.find(group => range.indexStart >= group.start && range.indexStart < group.start + group.count)?.materialIndex
    : null
  const selectionMaterial = Array.isArray(source.material) && materialIndex != null ? source.material[materialIndex] : source.material
  const object = source.isMesh ? new THREE.Mesh(geometry, selectionMaterial) : new THREE.LineSegments(geometry, source.material)
  object.name = `${subobject.type === 'brepFace' ? 'Face' : 'Edge'} ${subobject.index + 1}`
  object.userData = { ...source.userData, selectionRole: subobject.type, [subobject.type === 'brepFace' ? 'faceIndex' : 'edgeIndex']: subobject.index, brepSelection: true }
  delete object.userData.faceRanges
  delete object.userData.edgeRanges
  if (source.userData.displayMaterials) object.userData.displayMaterials = { ...source.userData.displayMaterials }
  object.userData.pandauiObjectId = `${source.userData.pandauiObjectId}:${subobject.type}:${subobject.index}`
  object.fullLayerPath = source.fullLayerPath
  object.matrix.copy(source.matrix)
  object.matrix.decompose(object.position, object.quaternion, object.scale)
  object.parent = source.parent
  object.boundingBox = geometry.boundingBox.clone()
  object.updateWorldMatrix(true, false)
  selections.set(object, { source, range, materialized: false })
  return object
}

export function materializeBrepSelection (object) {
  const state = selections.get(object)
  if (!state || state.materialized) return false
  const { source, range } = state
  const key = source.isMesh ? 'faceRanges' : 'edgeRanges'
  const ranges = source.userData[key]
  const current = ranges.find(entry => (source.isMesh ? entry.faceIndex === range.faceIndex : entry.edgeIndex === range.edgeIndex))
  if (!current) return false
  const previous = source.geometry
  const geometry = new THREE.BufferGeometry()
  for (const [name, attribute] of Object.entries(previous.attributes)) geometry.setAttribute(name, attribute)
  const indices = previous.index.array
  const remaining = new indices.constructor(indices.length - current.indexCount)
  remaining.set(indices.subarray(0, current.indexStart))
  remaining.set(indices.subarray(current.indexStart + current.indexCount), current.indexStart)
  geometry.setIndex(new THREE.BufferAttribute(remaining, 1))
  geometry.boundingBox = previous.boundingBox
  geometry.boundingSphere = previous.boundingSphere
  geometry.setDrawRange(0, Math.max(0, Math.min(remaining.length, previous.drawRange.count - (current.indexStart < previous.drawRange.count ? current.indexCount : 0))))
  source.geometry = geometry
  geometryReference(geometry)
  source.userData[key] = ranges.filter(entry => entry !== current).map(entry => entry.indexStart > current.indexStart ? { ...entry, indexStart: entry.indexStart - current.indexCount } : entry)
  object.parent.add(object)
  delete object.userData.brepSelection
  state.materialized = true
  source.onBrepDisplayChanged?.(object, source)
  return true
}

export function releaseBrepSelection (object) {
  const state = selections.get(object)
  if (!state || state.materialized) return
  object.geometry.dispose()
  object.parent = null
  selections.delete(object)
}

export function prepareEdgeRanges (source, ranges) {
  const sorted = ranges.filter(range => Number.isInteger(range.indexStart) && Number.isInteger(range.indexCount) && range.indexStart >= 0 && range.indexCount >= 2 && range.indexStart + range.indexCount <= source.index.count)
    .slice().sort((first, second) => Number(second.sharpEdge === true) - Number(first.sharpEdge === true) || first.indexStart - second.indexStart)
  const geometry = source
  const indices = new source.index.array.constructor(sorted.reduce((total, range) => total + range.indexCount, 0))
  let offset = 0
  const mapped = sorted.map(range => {
    indices.set(source.index.array.subarray(range.indexStart, range.indexStart + range.indexCount), offset)
    const entry = { ...range, indexStart: offset }
    offset += range.indexCount
    return entry
  })
  if (indices.length === source.index.count) source.index.array.set(indices)
  else geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.boundingBox = source.boundingBox
  geometry.boundingSphere = source.boundingSphere
  return { geometry, ranges: mapped }
}

export function mergeBrepGeometries (objects, rangeKey) {
  const geometry = new THREE.BufferGeometry()
  const attributes = Object.keys(objects[0].geometry.attributes)
  const vertexCount = objects.reduce((total, object) => total + object.geometry.attributes.position.count, 0)
  for (const name of attributes) {
    const first = objects[0].geometry.attributes[name]
    if (objects.some(object => !object.geometry.attributes[name] || object.geometry.attributes[name].itemSize !== first.itemSize)) throw new Error('Incompatible Brep display attributes')
    const array = new first.array.constructor(vertexCount * first.itemSize)
    let offset = 0
    for (const object of objects) {
      const source = object.geometry.attributes[name].array
      array.set(source, offset)
      offset += source.length
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(array, first.itemSize, first.normalized))
  }
  const indices = new Uint32Array(objects.reduce((total, object) => total + object.geometry.index.count, 0))
  const ranges = []
  const materials = []
  const materialIndices = new Map()
  const modeMaterials = { shading: [], render: [] }
  const addMaterial = material => {
    if (material == null) return 0
    let index = materialIndices.get(material)
    if (index == null) {
      index = materials.length
      materialIndices.set(material, index)
      materials.push(material)
    }
    return index
  }
  let indexOffset = 0
  let vertexOffset = 0
  for (const object of objects) {
    const source = object.geometry.index.array
    for (let offset = 0; offset < source.length; offset++) indices[indexOffset + offset] = source[offset] + vertexOffset
    for (const range of object.userData[rangeKey]) ranges.push({ ...range, indexStart: range.indexStart + indexOffset })
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material]
    const sourceGroups = object.geometry.groups.length > 0
      ? object.geometry.groups
      : [{ start: 0, count: source.length, materialIndex: 0 }]
    const shadingSlots = Array.isArray(object.userData.displayMaterials?.shading) ? object.userData.displayMaterials.shading : [object.userData.displayMaterials?.shading]
    const renderSlots = Array.isArray(object.userData.displayMaterials?.render) ? object.userData.displayMaterials.render : [object.userData.displayMaterials?.render]
    sourceGroups.forEach(group => {
      const activeMaterial = sourceMaterials[group.materialIndex] || sourceMaterials[0]
      const activeIndex = addMaterial(activeMaterial)
      modeMaterials.shading[activeIndex] = shadingSlots[group.materialIndex] || shadingSlots[0]
      modeMaterials.render[activeIndex] = renderSlots[group.materialIndex] || renderSlots[0]
      geometry.addGroup(indexOffset + group.start, group.count, activeIndex)
    })
    indexOffset += source.length
    vertexOffset += object.geometry.attributes.position.count
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return rangeKey === 'edgeRanges'
    ? { ...prepareEdgeRanges(geometry, ranges), materials, modeMaterials }
    : { geometry, ranges, materials, modeMaterials }
}

export function setBrepSmoothEdges (object, visible) {
  const ranges = object.userData.edgeRanges
  if (!ranges) return
  const count = visible ? object.geometry.index.count : ranges.reduce((total, range) => total + (range.sharpEdge === true ? range.indexCount : 0), 0)
  object.geometry.setDrawRange(0, count)
}
