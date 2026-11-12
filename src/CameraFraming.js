import * as THREE from 'three'

function boundsCorners (bounds) {
  const corners = []
  for (const horizontal of [bounds.min.x, bounds.max.x]) {
    for (const vertical of [bounds.min.y, bounds.max.y]) {
      for (const depth of [bounds.min.z, bounds.max.z]) corners.push(new THREE.Vector3(horizontal, vertical, depth))
    }
  }
  return corners
}

export function updateCameraDepth (camera, target, bounds) {
  const forward = camera.getWorldDirection(new THREE.Vector3())
  let nearest = Infinity
  let farthest = -Infinity
  for (const corner of boundsCorners(bounds)) {
    const depth = corner.sub(camera.position).dot(forward)
    nearest = Math.min(nearest, depth)
    farthest = Math.max(farthest, depth)
  }
  const precision = Math.max(1e-9, camera.position.length() * Number.EPSILON * 32)
  const focusDistance = Math.max(camera.position.distanceTo(target), precision * 100)
  const near = nearest > 0 ? Math.min(nearest * 0.5, focusDistance * 0.01) : focusDistance * 0.001
  camera.near = Math.max(precision, near)
  camera.far = Math.max(farthest + Math.max((farthest - nearest) * 0.1, focusDistance * 0.01), camera.near * 1000)
  camera.updateProjectionMatrix()
}

export function fitCameraToBounds (camera, target, bounds, aspect) {
  if (!bounds || bounds.isEmpty() || !Number.isFinite(aspect) || aspect <= 0) return false
  const center = bounds.getCenter(new THREE.Vector3())
  const extent = bounds.getSize(new THREE.Vector3()).length()
  const direction = camera.position.clone().sub(target)
  if (direction.lengthSq() === 0) direction.set(1, -1, 1)
  direction.normalize()
  camera.position.copy(center).addScaledVector(direction, Math.max(extent, 1))
  camera.lookAt(center)
  const inverseRotation = camera.quaternion.clone().conjugate()
  const corners = boundsCorners(bounds).map(corner => corner.sub(center).applyQuaternion(inverseRotation))
  const margin = 1.08
  const minimumSize = extent > 0 ? Math.max(extent * 1e-9, 1e-9) : 0.01
  let distance = Math.max(extent, minimumSize)
  camera.zoom = 1
  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect
    const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const horizontalTangent = verticalTangent * aspect
    distance = minimumSize / Math.min(verticalTangent, horizontalTangent)
    for (const corner of corners) {
      distance = Math.max(distance, corner.z + Math.max(Math.abs(corner.x) * margin / horizontalTangent, Math.abs(corner.y) * margin / verticalTangent, minimumSize))
    }
  } else {
    const halfHeight = Math.max(minimumSize, ...corners.map(corner => Math.max(Math.abs(corner.y), Math.abs(corner.x) / aspect))) * margin
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.top = halfHeight
    camera.bottom = -halfHeight
  }
  camera.position.copy(center).addScaledVector(direction, distance)
  target.copy(center)
  camera.lookAt(target)
  camera.updateMatrixWorld(true)
  updateCameraDepth(camera, target, bounds)
  return true
}
