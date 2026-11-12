import * as THREE from 'three'
import { isRenderCurve, isRenderEdge } from './RenderVisibility'

const color = (value, fallback) => new THREE.Color(value || fallback).convertSRGBToLinear().toArray()
const excluded = object => {
  const data = object.userData || {}
  return data.renderBatch || data.selectionHighlight || data.pandauiGumball || data.renderShadowGround || data.renderResourceRig || data.clippingHelper
}
const abort = () => Object.assign(new Error('Render scene changed during preparation.'), { name: 'AbortError' })

// Preserve one geometry/BLAS per shared buffer and one transform per instance.
// Render batches are disposable raster caches and never authoritative geometry.
export async function createRenderSnapshot (scenes, configuration, { signal } = {}) {
  if (configuration.effects?.shadows === false) throw new Error('Disabling shadows uses real-time rendering.')
  if (configuration.environment?.preset === 'hdri') throw new Error('HDRI path tracing is not available yet; using real-time rendering with the HDRI.')
  if (configuration.environment?.background === false) throw new Error('A hidden environment background currently uses real-time rendering.')
  const geometries = [], instances = [], seen = new Map(), visited = new Set()
  const stack = scenes.filter(Boolean).slice().reverse()
  let started = performance.now()
  scenes.filter(Boolean).forEach(scene => scene.updateMatrixWorld(true))
  while (stack.length) {
    if (signal?.aborted) throw abort()
    const object = stack.pop()
    if (visited.has(object)) continue
    visited.add(object)
    if (!object.visible || object.userData?.pandauiHidden || excluded(object)) continue
    if (isRenderEdge(object)) {
      if (configuration.effects?.showEdges) throw new Error('Visible CAD edges use real-time rendering.')
      continue
    }
    if (isRenderCurve(object) && configuration.effects?.showCurves === false) continue
    for (let i = object.children.length - 1; i >= 0; i--) stack.push(object.children[i])
    if (isRenderCurve(object) || object.isPoints) {
      // CAD edge wires are overlays, but standalone lines/points must not vanish.
      if (!object.userData?.surfaceWires && !object.userData?.edgeLines && !object.userData?.meshGeometryEdges && !object.userData?.meshFaceEdges) throw new Error('The scene contains standalone curves or points. Using real-time rendering to retain them.')
      continue
    }
    if (!object.isMesh) continue
    if (object.isSkinnedMesh || object.morphTargetInfluences?.some(value => value !== 0)) throw new Error('Live deformation is not supported by path tracing; using real-time rendering.')
    const geometry = object.geometry, positions = geometry?.attributes.position
    if (!positions?.count) continue
    const count = geometry.index?.count ?? positions.count
    const groups = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]
    for (const group of groups) {
      const material = Array.isArray(object.material) ? object.material[group.materialIndex] : object.material
      if (!material || material.visible === false) continue
      const start = Math.max(geometry.drawRange.start, group.start)
      const end = Math.min(count, geometry.drawRange.start + geometry.drawRange.count, group.start + group.count)
      if (end <= start) continue
      if (start % 3 || (end - start) % 3) throw new Error('Invalid triangle draw range in render geometry.')
      const key = `${geometry.uuid}:${positions.version}:${geometry.attributes.normal?.version || 0}:${geometry.index?.version || 0}:${start}:${end}`
      if (!seen.has(key)) {
        const packed = attribute => {
          if (!attribute) return undefined
          const result = new Float32Array(attribute.count * 3)
          for (let i = 0; i < attribute.count; i++) {
            result[i * 3] = attribute.getX(i); result[i * 3 + 1] = attribute.getY(i); result[i * 3 + 2] = attribute.getZ(i)
          }
          return result
        }
        const indices = new Uint32Array(end - start)
        for (let i = start; i < end; i++) indices[i - start] = geometry.index ? geometry.index.getX(i) : i
        geometries.push({ geometryId: key, positions: packed(positions), normals: packed(geometry.attributes.normal), indices })
        seen.set(key, true)
      }
      const maps = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'lightMap']
      if (maps.some(name => material[name]) || material.vertexColors) throw new Error('Textured or vertex-colored materials currently use real-time rendering; path tracing will not discard those colors.')
      if (material.transparent || material.opacity < 1 || material.alphaTest > 0 || material.transmission > 0) throw new Error('Transparent or transmissive materials currently use real-time rendering.')
      if (material.userData?.pandaSurface && ((material.userData.pandaSurface.reflection ?? 1) !== 1 || (material.userData.pandaSurface.ior ?? 1.5) !== 1.5)) throw new Error('Custom reflection / IOR currently uses real-time rendering.')
      if (material.clearcoat > 0 || (material.sheen?.isColor && material.sheen.r + material.sheen.g + material.sheen.b > 0)) throw new Error('Clearcoat or sheen currently uses real-time rendering.')
      const descriptor = {
        color: material.color?.toArray() || [0.7, 0.7, 0.7],
        metalness: material.metalness || 0,
        roughness: material.roughness ?? 0.5,
        emissive: material.emissive?.toArray() || [0, 0, 0],
        emissiveIntensity: material.emissiveIntensity ?? 1
      }
      const instanceCount = object.isInstancedMesh ? object.count : 1
      for (let i = 0; i < instanceCount; i++) {
        const matrix = object.matrixWorld.clone()
        if (object.isInstancedMesh) {
          const local = new THREE.Matrix4(); object.getMatrixAt(i, local); matrix.multiply(local)
        }
        const instanceMaterial = { ...descriptor }
        if (object.isInstancedMesh && object.instanceColor) {
          const tint = new THREE.Color().fromArray(object.instanceColor.array, i * 3)
          instanceMaterial.color = descriptor.color.map((component, axis) => component * tint.toArray()[axis])
        }
        instances.push({ geometryId: key, matrix: matrix.toArray(), material: instanceMaterial })
      }
    }
    if (performance.now() - started > 8) { await new Promise(resolve => setTimeout(resolve, 0)); started = performance.now() }
  }
  const lights = (configuration.lights || []).map(light => {
    if (!['sun', 'point'].includes(light.type)) throw new Error('Spot and area lights currently use real-time rendering.')
    if (light.castShadow === false) throw new Error('Lights with disabled shadows currently use real-time rendering.')
    const result = { type: light.type, color: color(light.color, '#ffffff'), intensity: light.intensity ?? 1 }
    if (light.type === 'point') result.position = light.position || [0, 0, 10]
    else result.direction = new THREE.Vector3(...(light.target || [0, 0, 0])).sub(new THREE.Vector3(...(light.position || [10, -10, 10]))).normalize().toArray()
    return result
  })
  const environment = configuration.environment || {}
  return { geometries, instances, lights, sky: { top: color(environment.topColor, '#b6d4ff'), bottom: color(environment.bottomColor, '#343942'), intensity: environment.intensity ?? 1, up: [0, 0, 1] } }
}

export function renderCameraDescriptor (camera) {
  camera.updateMatrixWorld(true)
  const position = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
  const direction = camera.getWorldDirection(new THREE.Vector3())
  const up = new THREE.Vector3(0, 1, 0).transformDirection(camera.matrixWorld)
  const result = { position: position.toArray(), target: position.clone().add(direction).toArray(), up: up.toArray(), near: camera.near, far: camera.far }
  if (camera.isOrthographicCamera) {
    const cx = (camera.left + camera.right) / 2, cy = (camera.top + camera.bottom) / 2
    const halfWidth = (camera.right - camera.left) / (2 * camera.zoom), halfHeight = (camera.top - camera.bottom) / (2 * camera.zoom)
    Object.assign(result, { type: 'orthographic', left: cx - halfWidth, right: cx + halfWidth, bottom: cy - halfHeight, top: cy + halfHeight })
  } else Object.assign(result, { type: 'perspective', fov: camera.getEffectiveFOV(), aspect: camera.aspect })
  return result
}
