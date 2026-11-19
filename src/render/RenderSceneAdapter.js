import * as THREE from 'three'
import { isRenderCurve, isRenderEdge } from './RenderVisibility'

const mapSlots = ['map', 'alphaMap', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'lightMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap', 'specularIntensityMap', 'specularColorMap', 'sheenColorMap', 'sheenRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap', 'envMap']
const scalarMaterialKeys = ['opacity', 'transparent', 'alphaTest', 'alphaHash', 'side', 'vertexColors', 'flatShading', 'metalness', 'roughness', 'emissiveIntensity', 'transmission', 'ior', 'reflectivity', 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness', 'specularIntensity', 'thickness', 'attenuationDistance', 'bumpScale', 'normalMapType', 'displacementScale', 'displacementBias', 'aoMapIntensity', 'lightMapIntensity', 'envMapIntensity', 'iridescence', 'iridescenceIOR', 'anisotropy', 'anisotropyRotation', 'depthWrite', 'premultipliedAlpha']
const surfaceKeys = ['materialType', 'ior', 'reflection', 'refractionRoughness', 'thickness', 'attenuationDistance']
const helperFlags = ['renderBatch', 'selectionHighlight', 'pandauiGumball', 'renderShadowGround', 'clippingHelper', 'groupEditBounds', 'controlPointHandle']
const excluded = object => helperFlags.some(key => object.userData?.[key]) || /Helper$/.test(object.type || '')
const abort = () => Object.assign(new Error('Render scene changed during preparation.'), { name: 'AbortError' })
const copyScalars = (source, keys, target) => {
  for (const key of keys) if (['number', 'boolean', 'string'].includes(typeof source[key])) target[key] = source[key]
}
// Material/light Colors are already linear in PandaUI. CSS surface/config colors
// are sRGB. Never convert a live THREE.Color a second time.
const linearColor = (value, fallback = '#ffffff') => value?.isColor ? value.toArray() : Array.isArray(value) ? value.slice() : new THREE.Color(value ?? fallback).convertSRGBToLinear().toArray()
const visible = object => {
  for (let current = object; current; current = current.parent) if (!current.visible || current.userData?.pandauiHidden || excluded(current)) return false
  return true
}

// r120 getters return raw normalized integers; modern Three getters decode them.
// Probe once instead of assuming a revision number (the app may patch Three).
const gettersNormalize = new THREE.BufferAttribute(new Uint8Array([255]), 1, true).getX(0) === 1
function component (attribute, index, axis) {
  const value = attribute[['getX', 'getY', 'getZ', 'getW'][axis]](index)
  if (!attribute.normalized || gettersNormalize) return value
  const array = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array
  if (array instanceof Uint8Array || array instanceof Uint8ClampedArray) return value / 255
  if (array instanceof Uint16Array) return value / 65535
  if (array instanceof Uint32Array) return value / 4294967295
  if (array instanceof Int8Array) return Math.max(-1, value / 127)
  if (array instanceof Int16Array) return Math.max(-1, value / 32767)
  if (array instanceof Int32Array) return Math.max(-1, value / 2147483647)
  return value
}

/**
 * Boundary between the application's legacy Three and the isolated modern Three
 * path tracer. No Geometry, Material, Texture, Matrix or Light crosses it.
 * Geometry buffers are owned Float32Array/Uint32Array copies. Texture image/data
 * are BORROWED: consume on the main thread; never transfer/detach/dispose them.
 * Materials and texture maps use zero-based indices (absent map = no property).
 * Colors are linear; texture colorSpace declares how to decode its pixels.
 * Textures: { image, data?, width?, height?, depth?, colorSpace, encoding?,
 *   isDataTexture, isCubeTexture, matrix: number[9], offset/repeat/center?,
 *   rotation?, wrapS/wrapT?, minFilter/magFilter?, type?, format?, ... }.
 * RGB/RGBA vertex colors keep their item size: colors.length / (positions.length
 * / 3). UV and UV2 have two components; the modern runtime maps uv2 to uv1.
 * Material pandaSurface custom fields are also flattened onto the descriptor;
 * refractionColor additionally maps to attenuationColor. Runtime shader mapping
 * for reflection/refractionRoughness is the consumer's responsibility.
 * Geometry groups intersect drawRange and become shared geometry slices; each
 * instance references one slice/material and a column-major world matrix.
 * Lights: { type: sun|point|spot|area|ambient|hemisphere, color, intensity,
 *   position, matrix, target?, direction?, quaternion?, distance?, decay?,
 *   angle?, penumbra?, width?, height?, groundColor?, castShadow }.
 * Area width/height remain local; its matrix retains world scale/orientation.
 * Bounds cover drawn triangles (empty = zero box). The runtime creates studio
 * ground/environment from config + bounds, not the raster-only ground helper.
 */
export async function createRenderSnapshot (scenes, config = {}, { signal, lightScene } = {}) {
  const check = () => { if (signal?.aborted) throw abort() }
  check()
  let started = performance.now()
  const checkpoint = async () => {
    check()
    if (performance.now() - started > 8) {
      await new Promise(resolve => setTimeout(resolve, 0))
      check(); started = performance.now()
    }
  }
  const geometries = [], instances = [], materials = [], textures = [], lights = []
  const textureIds = new Map(), materialIds = new Map(), packedGeometries = new Map(), slices = new Map(), temporary = new Map()
  const bounds = new THREE.Box3(), vertex = new THREE.Vector3()
  const roots = (scenes || []).filter(Boolean)
  const textureIndex = texture => {
    if (textureIds.has(texture)) return textureIds.get(texture)
    const image = texture.image ?? texture.source?.data
    const result = { name: texture.name || '',
      image,
      colorSpace: texture.colorSpace ?? (texture.encoding === THREE.sRGBEncoding ? 'srgb' : texture.encoding === THREE.LinearEncoding ? 'srgb-linear' : ''),
      isDataTexture: !!texture.isDataTexture,
      isCubeTexture: !!texture.isCubeTexture }
    // Keep legacy encoding too; do not silently interpret RGBE/RGBM as linear.
    copyScalars(texture, ['encoding', 'mapping', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy', 'format', 'internalFormat', 'type', 'flipY', 'generateMipmaps', 'premultiplyAlpha', 'unpackAlignment', 'channel', 'rotation', 'matrixAutoUpdate'], result)
    if (image?.data) Object.assign(result, { data: image.data, width: image.width, height: image.height, depth: image.depth })
    for (const key of ['offset', 'repeat', 'center']) if (texture[key]) result[key] = texture[key].toArray()
    // updateMatrix() would mutate the raster texture. Compute on a private copy.
    const matrix = texture.matrix?.clone() || new THREE.Matrix3()
    if (texture.matrixAutoUpdate !== false) matrix.setUvTransform(texture.offset?.x ?? 0, texture.offset?.y ?? 0, texture.repeat?.x ?? 1, texture.repeat?.y ?? 1, texture.rotation || 0, texture.center?.x ?? 0, texture.center?.y ?? 0)
    result.matrix = matrix.toArray()
    const index = textures.length
    textureIds.set(texture, index); textures.push(result)
    return index
  }
  const materialIndex = (material, tint) => {
    let variants = materialIds.get(material)
    if (!variants) { variants = new Map(); materialIds.set(material, variants) }
    const key = tint ? tint.join(',') : ''
    if (variants.has(key)) return variants.get(key)
    const result = { name: material.name || '',
      type: material.type,
      color: material.color?.toArray() || [0.7, 0.7, 0.7],
      emissive: material.emissive?.toArray() || [0, 0, 0],
      roughness: material.roughness ?? 0.5,
      metalness: material.metalness ?? 0,
      opacity: material.opacity ?? 1,
      transmission: material.transmission ?? 0,
      emissiveIntensity: material.emissiveIntensity ?? 1 }
    copyScalars(material, scalarMaterialKeys, result)
    for (const field of ['specular', 'specularColor', 'sheenColor', 'attenuationColor']) if (material[field]?.isColor) result[field] = material[field].toArray()
    // r120 sheen was a Color; modern Three separates amount and color.
    if (material.sheen?.isColor) { result.sheen = 1; result.sheenColor = material.sheen.toArray() }
    for (const field of ['normalScale', 'clearcoatNormalScale']) if (material[field]?.toArray) result[field] = material[field].toArray()
    if (material.iridescenceThicknessRange) result.iridescenceThicknessRange = material.iridescenceThicknessRange.slice()
    const surface = material.userData?.pandaSurface
    if (surface) {
      const saved = {}
      copyScalars(surface, [...surfaceKeys, ...scalarMaterialKeys], saved)
      for (const field of ['color', 'emissive', 'refractionColor']) if (surface[field] != null) saved[field] = linearColor(surface[field])
      result.pandaSurface = saved
      copyScalars(surface, surfaceKeys, result)
      if (surface.refractionColor != null) {
        result.refractionColor = linearColor(surface.refractionColor)
        result.attenuationColor = result.refractionColor.slice()
      }
    }
    if (tint) result.color = result.color.map((value, axis) => value * tint[axis])
    for (const slot of mapSlots) if (material[slot]?.isTexture) result[slot] = textureIndex(material[slot])
    const index = materials.length
    variants.set(key, index); materials.push(result)
    return index
  }
  const pack = async (attribute, size) => {
    if (!attribute) return undefined
    if (attribute.itemSize < size) throw new Error('Invalid render geometry attribute size.')
    const result = new Float32Array(attribute.count * size)
    for (let i = 0; i < attribute.count; i++) {
      if (i % 16384 === 0) await checkpoint()
      for (let axis = 0; axis < size; axis++) result[i * size + axis] = component(attribute, i, axis)
    }
    return result
  }
  const geometrySlice = async (geometry, start, end) => {
    const attributes = geometry.attributes
    const version = attribute => attribute ? `${attribute.version ?? attribute.data?.version ?? 0}` : '-'
    const key = `${geometry.uuid}:${['position', 'normal', 'uv', 'uv2', 'color'].map(name => version(attributes[name])).join(':')}:${version(geometry.index)}:${start}:${end}`
    if (slices.has(key)) return slices.get(key)
    let packed = packedGeometries.get(geometry)
    if (!packed) {
      packed = { positions: await pack(attributes.position, 3) }
      for (const [name, field, size] of [['normal', 'normals', 3], ['uv', 'uv', 2], ['uv2', 'uv2', 2], ['color', 'colors', attributes.color?.itemSize]]) {
        if (!attributes[name]) continue
        if (attributes[name].count !== attributes.position.count || (name === 'color' && ![3, 4].includes(size))) throw new Error('Invalid render geometry attribute layout.')
        packed[field] = await pack(attributes[name], size)
      }
      packedGeometries.set(geometry, packed)
    }
    const indices = new Uint32Array(end - start), localBounds = new THREE.Box3()
    for (let i = start; i < end; i++) {
      if ((i - start) % 16384 === 0) await checkpoint()
      const index = geometry.index ? geometry.index.getX(i) : i
      if (!Number.isInteger(index) || index < 0 || index >= attributes.position.count) throw new Error('Invalid render geometry triangle index.')
      indices[i - start] = index
      vertex.fromArray(packed.positions, index * 3)
      if (![vertex.x, vertex.y, vertex.z].every(Number.isFinite)) throw new Error('Non-finite render geometry position.')
      localBounds.expandByPoint(vertex)
    }
    geometries.push({ geometryId: key, ...packed, indices })
    const result = { key, localBounds }
    slices.set(key, result)
    return result
  }
  try {
    roots.forEach(scene => scene.updateWorldMatrix(true, true))
    const visited = new Set(), stack = roots.slice().reverse()
    while (stack.length) {
      await checkpoint()
      const object = stack.pop()
      if (visited.has(object)) continue
      visited.add(object)
      if (!visible(object) || object.userData?.renderResourceRig) continue
      if (isRenderEdge(object)) {
        if (config.effects?.showEdges) throw new Error('Visible CAD edges use real-time rendering.')
        continue
      }
      if (isRenderCurve(object) && config.effects?.showCurves === false) continue
      for (let i = object.children.length - 1; i >= 0; i--) stack.push(object.children[i])
      if (isRenderCurve(object) || object.isPoints || object.isSprite) throw new Error('The scene contains standalone curves or points or sprites. Using real-time rendering to retain them.')
      if (!object.isMesh) continue
      if (object.isSkinnedMesh || object.morphTargetInfluences?.some(value => value !== 0)) throw new Error('Live deformation is not supported by path tracing; using real-time rendering.')
      let geometry = object.geometry
      if (geometry?.isGeometry) {
        // r120 fromGeometry writes __directGeometry onto its argument.
        // Clone first so even that legacy conversion cache stays private.
        if (!temporary.has(geometry)) temporary.set(geometry, new THREE.BufferGeometry().fromGeometry(geometry.clone()))
        geometry = temporary.get(geometry)
      }
      const positions = geometry?.attributes?.position
      if (!positions?.count) continue
      const count = geometry.index?.count ?? positions.count
      const groups = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count, materialIndex: 0 }]
      for (const group of groups) {
        const material = Array.isArray(object.material) ? object.material[group.materialIndex] : object.material
        if (!material || material.visible === false) continue
        if (material.wireframe || material.isShaderMaterial) throw new Error('Wireframe or custom shader meshes use real-time rendering.')
        const start = Math.max(0, geometry.drawRange.start, group.start)
        const end = Math.min(count, geometry.drawRange.start + geometry.drawRange.count, group.start + group.count)
        if (end <= start) continue
        if (!Number.isInteger(start) || !Number.isInteger(end) || start % 3 || (end - start) % 3) throw new Error('Invalid triangle draw range in render geometry.')
        const instanceCount = object.isInstancedMesh ? object.count : 1
        if (!instanceCount) continue
        const { key, localBounds } = await geometrySlice(geometry, start, end)
        for (let i = 0; i < instanceCount; i++) {
          if (i % 256 === 0) await checkpoint()
          const matrix = object.matrixWorld.clone()
          let tint
          if (object.isInstancedMesh) {
            const local = new THREE.Matrix4(); object.getMatrixAt(i, local); matrix.multiply(local)
            if (object.instanceColor) tint = [0, 1, 2].map(axis => component(object.instanceColor, i, axis))
          }
          if (!matrix.elements.every(Number.isFinite)) throw new Error('Non-finite render instance transform.')
          instances.push({ geometryId: key, matrix: matrix.toArray(), material: materialIndex(material, tint) })
          bounds.union(localBounds.clone().applyMatrix4(matrix))
        }
      }
    }
    // Traverse the actual resource rig even though geometry traversal excludes it.
    // An explicitly empty rig means no lights; never resurrect config lights.
    const lightRoots = lightScene ? [lightScene] : roots
    const seenLights = new Set(), lightStack = lightRoots.slice().reverse()
    lightRoots.forEach(root => root.updateWorldMatrix(true, true))
    while (lightStack.length) {
      await checkpoint()
      const light = lightStack.pop()
      if (seenLights.has(light) || !visible(light)) continue
      seenLights.add(light)
      for (let i = light.children.length - 1; i >= 0; i--) lightStack.push(light.children[i])
      if (!light.isLight) continue
      const type = light.isDirectionalLight ? 'sun' : light.isSpotLight ? 'spot' : light.isPointLight ? 'point' : light.isRectAreaLight ? 'area' : light.isHemisphereLight ? 'hemisphere' : light.isAmbientLight ? 'ambient' : null
      if (!type) throw new Error(`Unsupported path-tracing light: ${light.type}`)
      const position = new THREE.Vector3().setFromMatrixPosition(light.matrixWorld)
      const result = { type,
        name: light.name,
        color: linearColor(light.color),
        intensity: light.intensity,
        position: position.toArray(),
        matrix: light.matrixWorld.toArray(),
        castShadow: light.castShadow }
      copyScalars(light, ['distance', 'decay', 'angle', 'penumbra', 'width', 'height'], result)
      if (light.target) {
        light.target.updateWorldMatrix(true, false)
        const target = new THREE.Vector3().setFromMatrixPosition(light.target.matrixWorld)
        result.target = target.toArray(); result.direction = target.sub(position).normalize().toArray()
      }
      if (type === 'area') {
        const worldPosition = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3()
        light.matrixWorld.decompose(worldPosition, quaternion, scale)
        result.quaternion = quaternion.toArray()
        result.direction = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).toArray()
      }
      if (light.groundColor) result.groundColor = linearColor(light.groundColor)
      if (type === 'hemisphere') result.direction = position.clone().normalize().toArray()
      lights.push(result)
    }
    if (!lightScene && lights.length === 0) {
      for (const spec of config.lights || []) {
        check()
        if (!['sun', 'point', 'spot', 'area', 'ambient', 'hemisphere'].includes(spec.type)) throw new Error(`Unsupported path-tracing light: ${spec.type}`)
        const result = { ...spec, color: linearColor(spec.color), intensity: spec.intensity ?? 1 }
        result.position = (spec.position || [10, -10, 10]).slice()
        if (['sun', 'spot', 'area'].includes(spec.type)) {
          result.target = (spec.target || [0, 0, 0]).slice()
          result.direction = new THREE.Vector3(...result.target).sub(new THREE.Vector3(...result.position)).normalize().toArray()
        }
        lights.push(result)
      }
    }
    check()
    return { geometries,
      instances,
      materials,
      textures,
      environment: config.environment,
      effects: config.effects,
      lights,
      bounds: bounds.isEmpty() ? { min: [0, 0, 0], max: [0, 0, 0] } : { min: bounds.min.toArray(), max: bounds.max.toArray() } }
  } finally {
    for (const geometry of temporary.values()) geometry.dispose()
  }
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
