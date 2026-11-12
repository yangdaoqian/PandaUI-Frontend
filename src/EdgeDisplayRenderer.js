import * as THREE from 'three'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

export function normalizeEdgeWidth (value) {
  const width = Number(value)
  return Number.isFinite(width) ? Math.min(6, Math.max(1, Math.round(width))) : 1
}

function createWideLineMaterial () {
  const material = new LineMaterial()
  material.vertexShader = material.vertexShader
    .replace('varying vec2 vUv;', 'varying vec2 vUv;\nvarying vec4 vEdgeCoord;')
    .replace('dir = normalize( dir );', 'dir = length( dir ) > 1e-6 ? normalize( dir ) : vec2( 1.0, 0.0 );')
    .replace('gl_Position = clip;', `gl_Position = clip;
      float edgeLength = length( ( ndcEnd - ndcStart ) * resolution ) / linewidth;
      vEdgeCoord = vec4( vec3( position.x, position.y < 0.5 ? -1.0 : edgeLength + 1.0, edgeLength ) * clip.w, clip.w );`)
  material.fragmentShader = material.fragmentShader
    .replace('varying vec2 vUv;', 'varying vec2 vUv;\nvarying vec4 vEdgeCoord;')
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec3 edgeCoord = vEdgeCoord.xyz / vEdgeCoord.w;
      float cap = max( max( -edgeCoord.y, edgeCoord.y - edgeCoord.z ), 0.0 );
      if ( dot( vec2( edgeCoord.x, cap ), vec2( edgeCoord.x, cap ) ) > 1.0 ) discard;`)
    .replace('if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard;', 'if ( edgeCoord.y < 0.0 || edgeCoord.y > edgeCoord.z ) discard;')
    .replace('if ( abs( vUv.y ) > 1.0 )', 'if ( false )')
  return material
}

export function buildEdgeGeometry (source, segments, loop = false, dashed = true) {
  const position = source.getAttribute('position')
  const index = source.index
  const drawRange = source.drawRange || { start: 0, count: index?.count ?? position.count }
  const start = Math.max(0, drawRange.start)
  const end = Math.min(index?.count ?? position.count, start + drawRange.count)
  const count = Math.max(0, segments ? Math.floor((end - start) / 2) : end - start - (loop ? 0 : 1))
  const directPositions = segments && !index && !position.isInterleavedBufferAttribute && position.itemSize === 3 && position.array instanceof Float32Array
  const positions = directPositions ? position.array.subarray(start * 3, (start + count * 2) * 3) : new Float32Array(count * 6)
  const color = source.getAttribute('color')
  const directColors = color && segments && !index && !color.isInterleavedBufferAttribute && color.itemSize === 3 && color.array instanceof Float32Array
  const colors = directColors ? color.array.subarray(start * 3, (start + count * 2) * 3) : color ? new Float32Array(count * 6) : null
  const distance = source.getAttribute('lineDistance')
  const distances = dashed ? new Float32Array(count * 2) : null
  let accumulated = 0
  const copyCount = !directPositions || (colors && !directColors) || dashed ? count : 0
  for (let segment = 0; segment < copyCount; segment++) {
    const first = start + segment * (segments ? 2 : 1)
    const second = first + 1 < end ? first + 1 : start
    const firstIndex = index ? index.getX(first) : first
    const secondIndex = index ? index.getX(second) : second
    const offset = segment * 6
    if (!directPositions) {
      positions[offset] = position.getX(firstIndex)
      positions[offset + 1] = position.getY(firstIndex)
      positions[offset + 2] = position.getZ(firstIndex)
      positions[offset + 3] = position.getX(secondIndex)
      positions[offset + 4] = position.getY(secondIndex)
      positions[offset + 5] = position.getZ(secondIndex)
    }
    if (colors && !directColors) {
      colors[offset] = color.getX(firstIndex)
      colors[offset + 1] = color.getY(firstIndex)
      colors[offset + 2] = color.getZ(firstIndex)
      colors[offset + 3] = color.getX(secondIndex)
      colors[offset + 4] = color.getY(secondIndex)
      colors[offset + 5] = color.getZ(secondIndex)
    }
    if (distances) {
      distances[segment * 2] = distance ? distance.getX(firstIndex) : accumulated
      accumulated += Math.hypot(positions[offset + 3] - positions[offset], positions[offset + 4] - positions[offset + 1], positions[offset + 5] - positions[offset + 2])
      distances[segment * 2 + 1] = distance ? distance.getX(secondIndex) : accumulated
    }
  }
  const geometry = new LineSegmentsGeometry()
  geometry.setIndex([0, 2, 1, 2, 3, 1])
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 2, 0, 1, 2, 0, -1, -1, 0, 1, -1, 0], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([-1, 2, 1, 2, -1, -2, 1, -2], 2))
  const instanceBuffer = new THREE.InstancedInterleavedBuffer(positions, 6, 1)
  geometry.setAttribute('instanceStart', new THREE.InterleavedBufferAttribute(instanceBuffer, 3, 0))
  geometry.setAttribute('instanceEnd', new THREE.InterleavedBufferAttribute(instanceBuffer, 3, 3))
  if (source.boundingBox) geometry.boundingBox = source.boundingBox.clone()
  else geometry.computeBoundingBox()
  if (source.boundingSphere) geometry.boundingSphere = source.boundingSphere.clone()
  else geometry.computeBoundingSphere()
  if (colors) geometry.setColors(colors)
  if (distances) {
    const distanceBuffer = new THREE.InstancedInterleavedBuffer(distances, 2, 1)
    geometry.setAttribute('instanceDistanceStart', new THREE.InterleavedBufferAttribute(distanceBuffer, 1, 0))
    geometry.setAttribute('instanceDistanceEnd', new THREE.InterleavedBufferAttribute(distanceBuffer, 1, 1))
  }
  geometry.instanceCount = count
  return geometry
}

export default class EdgeDisplayRenderer {
  constructor (cacheLimitBytes = 128 * 1024 * 1024) {
    this.width = 1
    this.geometries = new Map()
    this.materials = new Map()
    this.scenes = new WeakMap()
    this.frustum = new THREE.Frustum()
    this.projection = new THREE.Matrix4()
    this.sphere = new THREE.Sphere()
    this.cacheLimitBytes = cacheLimitBytes
    this.cacheBytes = 0
    this.frameOpen = false
    this.usedGeometries = new Set()
    this.usedMaterials = new Set()
    this.fallbackObjects = 0
  }

  beginFrame () {
    this.frameOpen = true
    this.usedGeometries.clear()
    this.usedMaterials.clear()
    this.fallbackObjects = 0
  }

  endFrame () {
    for (const [source, entry] of this.geometries) if (!this.usedGeometries.has(source)) entry.release()
    for (const [source, entry] of this.materials) if (!this.usedMaterials.has(source)) entry.release()
    this.frameOpen = false
  }

  diagnostics () {
    return { bytes: this.cacheBytes, limitBytes: this.cacheLimitBytes, geometries: this.geometries.size, materials: this.materials.size, fallbackObjects: this.fallbackObjects }
  }

  configure (width) {
    const next = normalizeEdgeWidth(width)
    if (next === this.width) return false
    this.width = next
    if (next === 1) this.dispose()
    return true
  }

  geometryFor (object) {
    const source = object.geometry
    const drawRange = source.drawRange || { start: 0, count: source.index?.count ?? source.attributes.position?.count ?? 0 }
    const count = Math.max(0, Math.min(source.index?.count ?? source.attributes.position.count, drawRange.start + drawRange.count) - drawRange.start)
    const segments = object.isLineSegments ? Math.floor(count / 2) : Math.max(0, count - (object.isLineLoop ? 0 : 1))
    const bytes = segments * (24 + (source.attributes.color ? 24 : 0) + (object.material.isLineDashedMaterial ? 8 : 0)) + 128
    const attributes = [source.attributes.position, source.index, source.attributes.color, source.attributes.lineDistance]
    const signature = [...attributes.map(attribute => attribute?.version ?? attribute?.data?.version), drawRange.start, drawRange.count].join(':')
    const variant = [object.isLineSegments, object.isLineLoop, object.material.isLineDashedMaterial].join(':')
    let cache = this.geometries.get(source)
    if (!cache) {
      const variants = new Map()
      const release = () => {
        for (const entry of variants.values()) { entry.geometry.dispose(); this.cacheBytes -= entry.bytes }
        source.removeEventListener('dispose', release)
        this.geometries.delete(source)
      }
      cache = { variants, release }
      this.geometries.set(source, cache)
      source.addEventListener('dispose', release)
    }
    const entry = cache.variants.get(variant)
    if (entry?.signature === signature && attributes.every((attribute, index) => entry.attributes[index] === attribute)) {
      this.usedGeometries.add(source)
      return entry.geometry
    }
    if (entry) { entry.geometry.dispose(); this.cacheBytes -= entry.bytes; cache.variants.delete(variant) }
    for (const [other, candidate] of this.geometries) {
      if (this.cacheBytes + bytes <= this.cacheLimitBytes) break
      if (other !== source && !this.usedGeometries.has(other)) candidate.release()
    }
    if (this.cacheBytes + bytes > this.cacheLimitBytes) {
      if (!cache.variants.size) cache.release()
      this.fallbackObjects++
      return null
    }
    const geometry = buildEdgeGeometry(source, object.isLineSegments, object.isLineLoop, object.material.isLineDashedMaterial === true)
    cache.variants.set(variant, { geometry, signature, attributes, bytes })
    this.cacheBytes += bytes
    this.usedGeometries.add(source)
    return geometry
  }

  materialFor (source, width, height) {
    this.usedMaterials.add(source)
    let entry = this.materials.get(source)
    if (!entry) {
      const material = createWideLineMaterial()
      if (source.isLineDashedMaterial) material.defines.USE_DASH = ''
      const release = () => {
        material.dispose()
        source.removeEventListener('dispose', release)
        this.materials.delete(source)
      }
      entry = { material, release }
      this.materials.set(source, entry)
      source.addEventListener('dispose', release)
    }
    const material = entry.material
    material.color.copy(source.color || source.uniforms.color.value)
    material.linewidth = this.width
    material.resolution.set(width, height)
    for (const key of ['opacity', 'transparent', 'depthTest', 'depthWrite', 'depthFunc', 'colorWrite', 'blending', 'blendSrc', 'blendDst', 'blendEquation', 'clippingPlanes', 'clipIntersection', 'clipShadows']) material[key] = source[key]
    material.polygonOffset = false
    for (const key of ['vertexColors', 'toneMapped', 'fog']) {
      if (material[key] !== source[key]) { material[key] = source[key]; material.needsUpdate = true }
    }
    if (source.isLineDashedMaterial) {
      material.dashSize = source.dashSize
      material.gapSize = source.gapSize
      material.dashScale = source.scale
    }
    return material
  }

  render (renderer, scene, camera, width, height, revision) {
    if (this.width === 1) { renderer.render(scene, camera); return }
    const ownFrame = !this.frameOpen
    if (ownFrame) this.beginFrame()
    let lines = revision == null ? null : this.scenes.get(scene)
    if (!lines || lines.revision !== revision) {
      lines = { revision, objects: [] }
      scene.traverseVisible(object => {
        if (!object.isLine || !object.geometry?.attributes?.position || Array.isArray(object.material)) return
        if (object.userData?.pandauiGumball || object.userData?.clippingHelper) return
        lines.objects.push(object)
      })
      if (revision != null) this.scenes.set(scene, lines)
    }
    const restored = []
    const frameMaterials = new Map()
    const autoUpdate = scene.autoUpdate
    if (autoUpdate) scene.updateMatrixWorld()
    if (!camera.parent) camera.updateMatrixWorld()
    this.frustum.setFromProjectionMatrix(this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    scene.autoUpdate = false
    try {
      for (const object of lines.objects) {
        if (!object.visible || !object.material?.visible) continue
        if (!object.material.isLineBasicMaterial && !object.material.uniforms?.color) continue
        if (object.frustumCulled && object.geometry.boundingSphere) {
          this.sphere.copy(object.geometry.boundingSphere).applyMatrix4(object.matrixWorld)
          const distance = camera.isPerspectiveCamera ? this.sphere.center.distanceTo(camera.position) + this.sphere.radius : 1
          this.sphere.radius += this.width * distance / (height * Math.abs(camera.projectionMatrix.elements[5]))
          if (!this.frustum.intersectsSphere(this.sphere)) continue
        }
        const geometry = this.geometryFor(object)
        if (!geometry?.instanceCount) continue
        let material = frameMaterials.get(object.material)
        if (!material) {
          material = this.materialFor(object.material, width, height)
          frameMaterials.set(object.material, material)
        }
        restored.push({ object, geometry: object.geometry, material: object.material, isMesh: object.isMesh })
        object.geometry = geometry
        object.material = material
        object.isMesh = true
      }
      renderer.render(scene, camera)
    } finally {
      scene.autoUpdate = autoUpdate
      for (const state of restored) {
        state.object.geometry = state.geometry
        state.object.material = state.material
        if (state.isMesh === undefined) delete state.object.isMesh
        else state.object.isMesh = state.isMesh
      }
      if (ownFrame) this.endFrame()
    }
  }

  dispose () {
    for (const entry of this.geometries.values()) entry.release()
    for (const entry of this.materials.values()) entry.release()
    this.scenes = new WeakMap()
    this.usedGeometries.clear()
    this.usedMaterials.clear()
    this.cacheBytes = 0
  }
}
