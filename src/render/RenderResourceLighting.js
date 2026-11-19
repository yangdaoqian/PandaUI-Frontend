import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { resourceNumber } from './RenderResourceMaterials'

let areaInitialized = false

function vector (value, fallback) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? new THREE.Vector3().fromArray(value) : fallback.clone()
}

export function resourceBounds (meshes) {
  const bounds = new THREE.Box3()
  for (const mesh of meshes) {
    if (!mesh.geometry) continue
    let visible = true
    for (let item = mesh; item; item = item.parent) if (!item.visible || item.userData?.pandauiHidden) { visible = false; break }
    if (!visible) continue
    mesh.updateWorldMatrix(true, false)
    // Do not populate shared geometry caches or change selection/display keys.
    const local = mesh.geometry.boundingBox?.clone() || new THREE.Box3()
    if (!mesh.geometry.boundingBox) {
      if (mesh.geometry.attributes?.position) local.setFromBufferAttribute(mesh.geometry.attributes.position)
      else if (mesh.geometry.vertices) local.setFromPoints(mesh.geometry.vertices)
    }
    if (mesh.isInstancedMesh) {
      const matrix = new THREE.Matrix4()
      for (let index = 0; index < mesh.count; index++) {
        mesh.getMatrixAt(index, matrix)
        matrix.premultiply(mesh.matrixWorld)
        bounds.union(local.clone().applyMatrix4(matrix))
      }
    } else bounds.union(local.applyMatrix4(mesh.matrixWorld))
  }
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)) {
    bounds.set(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5))
  }
  return bounds
}

function corners (bounds) {
  const points = []
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) points.push(new THREE.Vector3(x, y, z))
    }
  }
  return points
}

// A huge, horizontal ground receiver must not consume the sun's entire map.
// Keep it in the depth range (and shadow pass), but spend XY texels on the
// volumetric model. Projection along the light direction leaves light-space
// XY unchanged, so this also covers its shadow on the ground below.
export function resourceShadowFocus (meshes, bounds) {
  const model = new THREE.Box3()
  const receivers = []
  for (const mesh of meshes) {
    if (!mesh.geometry) continue
    let visible = true
    for (let part = mesh; part; part = part.parent) if (!part.visible || part.userData?.pandauiHidden) { visible = false; break }
    if (!visible) continue
    const box = resourceBounds([mesh]), size = box.getSize(new THREE.Vector3())
    if (size.z <= Math.max(size.x, size.y) * 0.001 && Math.min(size.x, size.y) > size.z * 100) receivers.push(box)
    else model.union(box)
  }
  if (model.isEmpty()) return bounds.clone()
  const modelSize = model.getSize(new THREE.Vector3())
  const span = Math.max(modelSize.x, modelSize.y, modelSize.z, 0.001)
  // Small sheets are model parts, not ground. Never crop their shadows.
  for (const box of receivers) {
    const size = box.getSize(new THREE.Vector3())
    if (Math.min(size.x, size.y) < span * 4) model.union(box)
  }
  return model
}

export function fitResourceShadows (rig, bounds, focusBounds = bounds) {
  // Studio roles use model-relative coordinates and follow newly imported geometry.
  const center = focusBounds.getCenter(new THREE.Vector3()), size = focusBounds.getSize(new THREE.Vector3())
  const span = Math.max(size.x, size.y, size.z, 0.001)
  rig.traverse(light => {
    const role = light.userData.studioRole
    const placements = { key: [-1.1, -1.3, 1.5], fill: [1.2, 0.4, 0.8], rim: [0, 1.3, 1.2] }
    if (!placements[role]) return
    light.position.copy(center).add(new THREE.Vector3().fromArray(placements[role]).multiplyScalar(span))
    if (light.target) light.target.position.copy(center)
    else if (light.isRectAreaLight) {
      light.lookAt(center); light.width = span * (role === 'fill' ? 0.7 : 1.2); light.height = span * 0.3
    }
  })
  rig.updateWorldMatrix(true, true)
  const points = corners(bounds)
  const padding = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.05, 0.01)
  rig.traverse(light => {
    if (!light.castShadow || !light.shadow) return
    const camera = light.shadow.camera
    camera.up.set(0, 0, 1)
    const settings = light.userData.renderShadowSettings || {}
    light.shadow.mapSize.set(settings.resolution || 2048, settings.resolution || 2048)
    light.shadow.bias = resourceNumber(settings.bias, -0.0002, -0.01, 0.01)
    light.shadow.radius = resourceNumber(settings.radius, 1.5, 0, 8)
    light.shadow.updateMatrices(light)
    const position = light.getWorldPosition(new THREE.Vector3())
    if (light.isDirectionalLight) {
      const viewBounds = new THREE.Box3().setFromPoints(points.map(point => point.clone().applyMatrix4(camera.matrixWorldInverse)))
      const focus = settings.autoFocus !== false ? focusBounds : bounds
      const focusBox = new THREE.Box3().setFromPoints(corners(focus).map(point => point.applyMatrix4(camera.matrixWorldInverse)))
      const focusPadding = Math.max(focus.getSize(new THREE.Vector3()).length() * 0.1, 0.01)
      camera.left = focusBox.min.x - focusPadding
      camera.right = focusBox.max.x + focusPadding
      camera.bottom = focusBox.min.y - focusPadding
      camera.top = focusBox.max.y + focusPadding
      if (settings.extent > 0) {
        const focus = light.target.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse)
        const half = settings.extent / 2
        camera.left = focus.x - half; camera.right = focus.x + half
        camera.bottom = focus.y - half; camera.top = focus.y + half
      }
      // Quantize projection translation to one texel to suppress crawling edges.
      const dx = (camera.right - camera.left) / light.shadow.mapSize.x
      const dy = (camera.top - camera.bottom) / light.shadow.mapSize.y
      const x = Math.round((camera.left + camera.right) / (2 * dx)) * dx - (camera.left + camera.right) / 2
      const y = Math.round((camera.top + camera.bottom) / (2 * dy)) * dy - (camera.top + camera.bottom) / 2
      camera.left += x; camera.right += x; camera.bottom += y; camera.top += y
      // Orthographic shadows can include casters behind the authored light origin.
      camera.near = -viewBounds.max.z - padding
      camera.far = Math.max(camera.near + padding, -viewBounds.min.z + padding)
    } else {
      camera.near = Math.max(padding * 0.01, 0.0001)
      camera.far = Math.max(...points.map(point => position.distanceTo(point))) + padding
    }
    const texelSize = light.isDirectionalLight ? Math.max(camera.right - camera.left, camera.top - camera.bottom) / light.shadow.mapSize.x
      : camera.far * 2 / light.shadow.mapSize.x
    light.shadow.normalBias = settings.normalBias >= 0 ? settings.normalBias : texelSize * 0.25
    camera.updateProjectionMatrix()
    light.shadow.updateMatrices(light)
    light.shadow.needsUpdate = true
  })
}

export function createResourceLights (settings, bounds, scope, issue, maxTextureSize = 4096) {
  const group = new THREE.Group()
  group.userData.renderResourceRig = true
  const center = bounds.getCenter(new THREE.Vector3())
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 0.5)
  const defaultPosition = center.clone().add(new THREE.Vector3(radius, -radius, radius * 2))
  // An authored zero-intensity light still suppresses all default illumination.
  const authored = Array.isArray(settings) && settings.length > 0
  if (!authored) group.add(new THREE.AmbientLight(0xffffff, 0.35))
  for (const spec of authored ? settings : [{ id: 'default-sun', type: 'sun', intensity: 0.9, castShadow: true }]) {
    const color = new THREE.Color(spec.color ?? 0xffffff).convertSRGBToLinear()
    const intensity = resourceNumber(spec.intensity, 1)
    let light
    switch (spec.type) {
      case 'sun': light = new THREE.DirectionalLight(color, intensity); break
      case 'point': light = new THREE.PointLight(color, intensity, 0, 2); break
      case 'spot': light = new THREE.SpotLight(color, intensity, 0, resourceNumber(spec.angle, Math.PI / 6, 0.001, Math.PI / 2), 0.2, 2); break
      case 'area':
        if (!areaInitialized) { RectAreaLightUniformsLib.init(); areaInitialized = true }
        light = new THREE.RectAreaLight(color, intensity, resourceNumber(spec.width, 5, 0.001), resourceNumber(spec.height, 5, 0.001))
        if (spec.castShadow) issue('unsupported-area-shadow', 'Three r120 RectAreaLight does not support shadows.', { lightId: spec.id })
        break
      default:
        issue('unsupported-light', `Unknown light type: ${spec.type}`, { lightId: spec.id })
        continue
    }
    light.userData.studioRole = spec.studioRole || 'manual'
    light.name = String(spec.id ?? spec.type)
    light.userData.renderLightId = spec.id
    light.position.copy(vector(spec.position, defaultPosition))
    light.up.set(0, 0, 1)
    const target = vector(spec.target, center)
    if (light.target) {
      light.target.position.copy(target)
      group.add(light.target)
    } else if (light.isRectAreaLight) light.lookAt(target)
    light.castShadow = !!spec.castShadow && !!light.shadow
    if (light.shadow) {
      // Point shadows use a 4x2 atlas. Budget the per-face map accordingly.
      const maximum = Math.max(1, Math.min(4096, Math.floor(maxTextureSize / (light.isPointLight ? 4 : 1))))
      const requested = resourceNumber(spec.shadowResolution, 2048, 256, 4096)
      light.userData.renderShadowSettings = {
        resolution: 2 ** Math.floor(Math.log2(Math.min(requested, maximum))),
        bias: resourceNumber(spec.shadowBias, -0.0002, -0.01, 0.01),
        normalBias: resourceNumber(spec.shadowNormalBias, -1, -1, 1e9),
        radius: resourceNumber(spec.shadowRadius, 1.5, 0, 8),
        extent: resourceNumber(spec.shadowExtent, 0, 0, 1e12),
        autoFocus: spec.shadowAutoFocus !== false
      }
    }
    group.add(light)
  }
  scope.own({
    dispose () {
      const maps = new Set()
      group.traverse(light => {
        if (light.shadow?.map) maps.add(light.shadow.map)
        if (light.shadow?.mapPass) maps.add(light.shadow.mapPass)
      })
      for (const map of maps) map.dispose()
      if (group.parent) group.parent.remove(group)
    }
  })
  fitResourceShadows(group, bounds)
  return group
}
