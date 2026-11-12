import * as THREE from 'three'

export function viewportControlSize (width, height) {
  return THREE.MathUtils.clamp(0.85 * Math.min(Math.max(1, width), Math.max(1, height)) / 900, 0.85, 2.4)
}

export function viewportControlWorldSize (camera, position, width, height) {
  const factor = camera.isOrthographicCamera
    ? (camera.top - camera.bottom) / camera.zoom
    : position.distanceTo(camera.getWorldPosition(new THREE.Vector3())) * Math.min(1.9 * Math.tan(Math.PI * camera.fov / 360) / camera.zoom, 7)
  return Math.max(1e-9, factor * viewportControlSize(width, height) / 7)
}
