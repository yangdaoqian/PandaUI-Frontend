import * as THREE from 'three'

const geometryVersions = new WeakMap()

function displayedGeometryBounds (geometry) {
  const position = geometry.attributes?.position
  if (!position) {
    if (geometry.isGeometry && (!geometry.boundingBox || geometry.verticesNeedUpdate)) geometry.computeBoundingBox()
    return geometry.boundingBox || null
  }
  const version = position?.isInterleavedBufferAttribute ? position.data.version : position?.version
  const index = geometry.index
  const drawRange = geometry.drawRange || { start: 0, count: index?.count ?? position.count }
  const start = Math.max(0, drawRange.start)
  const end = Math.min(index?.count ?? position.count, start + drawRange.count)
  const previous = geometryVersions.get(geometry)
  if (previous && previous.position === position && previous.version === version && previous.index === index && previous.indexVersion === index?.version && previous.start === start && previous.end === end) return previous.bounds
  if (!geometry.boundingBox || (previous && (previous.position !== position || previous.version !== version))) geometry.computeBoundingBox()
  let bounds = geometry.boundingBox
  if (position && (index || start !== 0 || end !== position.count)) {
    bounds = new THREE.Box3()
    const point = new THREE.Vector3()
    for (let offset = start; offset < end; offset++) {
      point.fromBufferAttribute(position, index ? index.getX(offset) : offset)
      if (Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)) bounds.expandByPoint(point)
    }
  }
  geometryVersions.set(geometry, { position, version, index, indexVersion: index?.version, start, end, bounds })
  return bounds
}

export function expandVisibleSceneBounds (root, bounds, includeHidden = false) {
  if (!root) return bounds
  if (!includeHidden) for (let parent = root; parent; parent = parent.parent) if (!parent.visible) return bounds
  root.updateWorldMatrix(true, true)
  const transformed = new THREE.Box3()
  const visit = object => {
    if ((!includeHidden && !object.visible) || object.userData.renderBatch || object.userData.renderShadowGround || object.userData.selectionHighlight || object.userData.pandauiGumball || object.userData.groupEditBounds || (includeHidden && object.userData.isPlaceholder)) return
    const geometry = object.geometry
    const localBounds = geometry ? displayedGeometryBounds(geometry) : object.boundingBox
    if (localBounds && !localBounds.isEmpty()) {
      transformed.copy(localBounds).applyMatrix4(object.matrixWorld)
      if ([transformed.min.x, transformed.min.y, transformed.min.z, transformed.max.x, transformed.max.y, transformed.max.z].every(Number.isFinite)) bounds.union(transformed)
    }
    object.children.forEach(visit)
  }
  visit(root)
  return bounds
}
