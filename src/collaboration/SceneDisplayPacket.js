import * as THREE from 'three'
import { applyMaterialSurface } from '../render/MaterialSurface'

const constructors = { Float32Array, Float64Array, Uint32Array, Uint16Array, Uint8Array, Int32Array, Int16Array, Int8Array, Uint8ClampedArray }
const fields = ['originalType', 'originalName', 'geometryType', 'definitionObjectType', 'selectionRole', 'faceIndex', 'edgeIndex', 'faceRanges', 'edgeRanges', 'meshGeometryEdges', 'meshFaceEdges', 'surfaceWires', 'edgeLines', 'edgeColorFollowsShading', 'parameterPickAmbiguous', 'visible', 'pandauiHidden', 'importedHiddenObject', 'nonselectable', 'pandauiObjectId', 'objectId', 'geometryId', 'sourceGeometryId', 'sourceDisplayId', 'sourceObject', 'sceneFileLogicalNode', 'materialId', 'renderMaterialId']
const pick = (data, keys) => Object.fromEntries(keys.filter(key => data?.[key] !== undefined).map(key => [key, data[key]]))
const plainData = data => pick(data, fields)
const materialsOf = object => Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
const bagMaterials = object => Object.values(object.userData?.displayMaterials || {}).flat().filter(Boolean)
const isHelper = object => object.isLight || object.isCamera || object.userData?.renderBatch || object.userData?.selectionHighlight || object.userData?.groupEditBounds || object.userData?.pandauiGumball || object.userData?.renderShadowGround

// Explicit lists keep private graph data, shader functions and renderer resources
// out of the packet. Colors use linear RGB floats, not lossy 8-bit hex values.
const materialScalars = ['name', 'opacity', 'transparent', 'side', 'shadowSide', 'depthTest', 'depthWrite', 'depthFunc', 'colorWrite', 'vertexColors', 'metalness', 'roughness', 'shininess', 'size', 'sizeAttenuation', 'linewidth', 'linecap', 'linejoin', 'dashSize', 'gapSize', 'scale', 'wireframe', 'wireframeLinewidth', 'flatShading', 'emissiveIntensity', 'aoMapIntensity', 'lightMapIntensity', 'envMapIntensity', 'bumpScale', 'normalMapType', 'displacementScale', 'displacementBias', 'clearcoat', 'clearcoatRoughness', 'reflectivity', 'refractionRatio', 'transmission', 'ior', 'thickness', 'attenuationDistance', 'alphaTest', 'premultipliedAlpha', 'blending', 'blendSrc', 'blendDst', 'blendEquation', 'blendSrcAlpha', 'blendDstAlpha', 'blendEquationAlpha', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'dithering', 'toneMapped', 'fog', 'visible', 'skinning', 'morphTargets', 'morphNormals', 'combine']
const materialColors = ['color', 'emissive', 'specular', 'sheen', 'attenuationColor']
const materialVectors = ['normalScale', 'clearcoatNormalScale']
const materialMetadata = ['pandaSurface', 'pandauiPhysicalBase', 'rhinoMaterialId', 'pandaSceneMaterialSourceId', 'pandaSceneMaterialEdited']
const textureSlots = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'specularMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'transmissionMap', 'envMap', 'gradientMap']
const textureScalars = ['name', 'mapping', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'anisotropy', 'format', 'internalFormat', 'type', 'encoding', 'colorSpace', 'channel', 'rotation', 'matrixAutoUpdate', 'generateMipmaps', 'premultiplyAlpha', 'flipY', 'unpackAlignment']
const textureMetadata = ['sceneFileTexCoord', 'pandauiTextureName']
const embeddedImage = value => typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif|bmp|avif);/i.test(value)
const ownedDisplays = new WeakMap()
const readyDisplays = new WeakMap()
const disposedDisplays = new WeakSet()

// Decode stays synchronous. Await this before attaching/baselining a downloaded
// display: embedded image completion schedules the texture's first GPU upload.
export function sceneDisplayReady (root) {
  return readyDisplays.get(root) || Promise.resolve()
}

function textureState (texture) {
  const result = { ...pick(texture, textureScalars), userData: pick(texture.userData, textureMetadata) }
  for (const key of ['offset', 'repeat', 'center', 'matrix']) result[key] = texture[key].toArray()
  return result
}

function materialState (material, textureReference) {
  const result = { type: material.type, ...pick(material, materialScalars), userData: pick(material.userData, materialMetadata) }
  for (const key of [...materialColors, ...materialVectors]) if (material[key]) result[key] = material[key].toArray()
  result.textures = Object.fromEntries(textureSlots.filter(key => material[key]?.isTexture).map(key => [key, textureReference(material[key])]))
  return result
}

function restoreMaterial (material, settings) {
  for (const [key, value] of Object.entries(pick(settings, materialScalars))) material[key] = value
  for (const key of materialColors) if (settings[key] != null) material[key] = Array.isArray(settings[key]) ? new THREE.Color().fromArray(settings[key]) : new THREE.Color(settings[key])
  for (const key of materialVectors) if (settings[key]) material[key] = new THREE.Vector2().fromArray(settings[key])
  material.userData = pick(settings.userData, materialMetadata)
  applyMaterialSurface(material)
}

function materialDescription (material) {
  const result = { type: material.type, color: material.color?.getHex() ?? 0xdddddd, opacity: material.opacity, transparent: material.transparent, side: material.side, depthTest: material.depthTest, depthWrite: material.depthWrite, vertexColors: material.vertexColors }
  for (const key of ['metalness', 'roughness', 'shininess', 'size', 'sizeAttenuation', 'linewidth', 'dashSize', 'gapSize', 'wireframe', 'flatShading']) if (material[key] !== undefined) result[key] = material[key]
  if (material.emissive) result.emissive = material.emissive.getHex()
  return result
}

export function captureDisplayMaterials (root) {
  const result = []
  root.traverse(object => {
    if (!object.geometry || isHelper(object)) return
    result.push(materialsOf(object).map(material => {
      const { type, ...settings } = materialDescription(material)
      return settings
    }))
  })
  return result
}

export function applyDisplayMaterials (root, states) {
  if (!Array.isArray(states)) return
  let index = 0
  root.traverse(object => {
    if (!object.geometry || isHelper(object)) return
    const settings = states[index++]
    if (!settings) return
    materialsOf(object).forEach((material, materialIndex) => { if (settings[materialIndex]) { material.setValues(settings[materialIndex]); material.needsUpdate = true } })
  })
}

export function displaySignature (root) {
  const entries = []
  const textureReference = texture => ({ uuid: texture.uuid, version: texture.version, ...textureState(texture) })
  const visit = object => {
    if (isHelper(object)) return
    if (object !== root && object.matrixAutoUpdate) object.updateMatrix()
    const geometry = object.geometry
    const data = plainData(object.userData)
    // Root visibility is synchronized separately; tree filters may reset the
    // local hidden flag without changing the shared object or its display.
    if (object === root) { delete data.pandauiHidden; delete data.visible }
    entries.push([object.uuid, object.type, object === root ? null : object.matrix.elements, object === root ? null : object.visible, geometry?.uuid,
      geometry ? Object.entries(geometry.attributes || {}).map(([name, attribute]) => [name, attribute.version, attribute.count, attribute.data?.version]) : null,
      geometry?.isGeometry ? [geometry.vertices, geometry.colors, geometry.faces, geometry.faceVertexUvs] : null,
      geometry?.index?.version, geometry?.index?.count, object.instanceMatrix?.version, object.instanceColor?.version, object.count,
      materialsOf(object).map(material => materialState(material, textureReference)),
      Object.fromEntries(Object.entries(object.userData?.displayMaterials || {}).map(([key, value]) => [key, (Array.isArray(value) ? value : [value]).map(material => material && materialState(material, textureReference))])),
      data, object.fullLayerPath, object.renderOrder, object.castShadow, object.receiveShadow,
      geometry?.groups, geometry?.drawRange, plainData(geometry?.userData)])
    object.children.forEach(visit)
  }
  visit(root)
  return JSON.stringify(entries)
}

export function encodeSceneDisplay (root) {
  const buffers = []
  const geometries = []
  const geometryIds = new Map()
  const temporaryGeometries = []
  const materials = []
  const materialIds = new Map()
  const textures = []
  const textureIds = new Map()
  const images = []
  const imageIds = new Map()
  let byteLength = 0
  const attribute = value => {
    if (!value) return null
    let array = value.array
    if (value.isInterleavedBufferAttribute) {
      array = new value.data.array.constructor(value.count * value.itemSize)
      for (let index = 0; index < value.count; index++) for (let component = 0; component < value.itemSize; component++) array[index * value.itemSize + component] = value.data.array[index * value.data.stride + value.offset + component]
    }
    const offset = byteLength
    const padding = (8 - array.byteLength % 8) % 8
    buffers.push(array, new Uint8Array(padding))
    byteLength += array.byteLength + padding
    return { offset, length: array.length, type: array.constructor.name, itemSize: value.itemSize, normalized: value.normalized, instanced: value.isInstancedBufferAttribute === true, meshPerAttribute: value.meshPerAttribute }
  }
  const imageReference = image => {
    if (!image) return null
    if (imageIds.has(image)) return imageIds.get(image)
    let result = null
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height
    if (ArrayBuffer.isView(image.data) && constructors[image.data.constructor.name] && width > 0 && height > 0) {
      result = { width, height, pixels: attribute({ array: image.data, itemSize: 1 }) }
    } else {
      // Reuse an embedded original, or draw an already accessible image. Never
      // follow an HTTP/file/blob URL from a packet or fetch a missing image.
      const src = image.currentSrc || image.src
      if (embeddedImage(src)) result = { url: src }
      else {
        let canvas
        try {
          if (image.toDataURL) result = { url: image.toDataURL('image/png') }
          else if (width > 0 && height > 0 && typeof document !== 'undefined') {
            canvas = document.createElement('canvas')
            canvas.width = width; canvas.height = height
            const context = canvas.getContext('2d')
            context.drawImage(image, 0, 0)
            result = { url: canvas.toDataURL('image/png') }
          }
        } catch (_) { /* Missing, tainted or GPU-only images use material values. */ } finally { if (canvas) canvas.width = canvas.height = 0 }
        if (result && !embeddedImage(result.url)) result = null
      }
    }
    const id = result ? images.length : null
    imageIds.set(image, id)
    if (result) images.push(result)
    return id
  }
  const textureReference = texture => {
    if (textureIds.has(texture)) return textureIds.get(texture)
    // Render targets and compressed textures need a GPU readback/decoder;
    // their backing image is not a portable source image.
    const source = !texture.isRenderTargetTexture && !texture.isCompressedTexture ? texture.image : null
    const image = Array.isArray(source) ? source.map(face => imageReference(face.isDataTexture ? face.image : face)) : imageReference(source)
    const available = Array.isArray(image) ? image.length === 6 && image.every(id => id !== null) : image !== null
    const id = available ? textures.length : null
    textureIds.set(texture, id)
    if (available) textures.push({ ...textureState(texture), image, cube: texture.isCubeTexture === true })
    return id
  }
  const materialReference = material => {
    if (!material) return null
    if (!materialIds.has(material)) { materialIds.set(material, materials.length); materials.push(materialState(material, textureReference)) }
    return materialIds.get(material)
  }
  const materialBag = bag => Object.fromEntries(Object.entries(bag).map(([key, value]) => [key, Array.isArray(value) ? value.map(materialReference) : materialReference(value)]))
  const visit = object => {
    if (isHelper(object)) return null
    if (object.matrixAutoUpdate) object.updateMatrix()
    const data = { type: object.type, name: object.name, matrix: object === root ? new THREE.Matrix4().toArray() : object.matrix.toArray(), visible: object === root || object.visible, userData: plainData(object.userData), children: object.children.map(visit).filter(Boolean) }
    data.userData.pandauiObjectId ??= object.userData?.objectId || object.uuid
    Object.assign(data, pick(object, ['fullLayerPath', 'castShadow', 'receiveShadow', 'renderOrder', 'frustumCulled', 'matrixAutoUpdate']))
    if (object.userData?.displayMaterials) data.displayMaterials = materialBag(object.userData.displayMaterials)
    if (object.geometry) {
      if (!geometryIds.has(object.geometry)) {
        // Older imported points/clouds can still be alive in an open scene.
        // Normalize their display without replacing or disposing source data.
        let geometry = object.geometry
        if (geometry.isGeometry) {
          geometry = new THREE.BufferGeometry().setFromObject(object)
          temporaryGeometries.push(geometry)
        }
        geometryIds.set(object.geometry, geometries.length)
        geometries.push({ attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => [name, attribute(value)])), index: attribute(geometry.index), groups: geometry.groups, userData: plainData(geometry.userData), drawRange: { start: geometry.drawRange.start, count: Number.isFinite(geometry.drawRange.count) ? geometry.drawRange.count : null } })
      }
      data.geometry = geometryIds.get(object.geometry)
      data.materials = materialsOf(object).map(materialReference)
      data.materialArray = Array.isArray(object.material)
      if (object.isInstancedMesh) {
        data.count = object.count
        data.instanceMatrix = attribute(object.instanceMatrix)
        data.instanceColor = attribute(object.instanceColor)
      }
    }
    return data
  }
  try {
    const tree = visit(root)
    const metadata = new TextEncoder().encode(JSON.stringify({ version: 2, tree, geometries, materials, textures, images }))
    const header = new Uint32Array([0x50445331, metadata.byteLength])
    return new Blob([header, metadata, new Uint8Array((8 - metadata.byteLength % 8) % 8), ...buffers], { type: 'application/octet-stream' })
  } finally { temporaryGeometries.forEach(geometry => geometry.dispose()) }
}

export function decodeSceneDisplay (input, { shareBuffer = false } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const buffer = bytes.buffer, base = bytes.byteOffset, length = bytes.byteLength
  const header = new DataView(buffer, base, length)
  if (length < 8 || header.getUint32(0, true) !== 0x50445331) throw new Error('Invalid shared display packet.')
  const metadataLength = header.getUint32(4, true)
  if (metadataLength > length - 8) throw new Error('Incomplete shared display packet.')
  const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, base + 8, metadataLength)))
  if (![1, 2].includes(metadata.version)) throw new Error('Unsupported shared display version.')
  const offset = 8 + Math.ceil(metadataLength / 8) * 8
  const attribute = value => {
    if (!value) return null
    const Constructor = constructors[value.type]
    if (!Constructor || !Number.isSafeInteger(value.offset) || value.offset < 0 || !Number.isSafeInteger(value.length) || value.length < 0 || !Number.isInteger(value.itemSize) || value.itemSize < 1 || value.itemSize > 16 || value.length % value.itemSize || (base + offset + value.offset) % Constructor.BYTES_PER_ELEMENT || offset + value.offset + value.length * Constructor.BYTES_PER_ELEMENT > length) throw new Error('Invalid shared display attribute.')
    const view = new Constructor(buffer, base + offset + value.offset, value.length)
    const array = shareBuffer ? view : view.slice()
    return value.instanced ? new THREE.InstancedBufferAttribute(array, value.itemSize, value.normalized, value.meshPerAttribute) : new THREE.BufferAttribute(array, value.itemSize, value.normalized)
  }
  const resources = { geometries: new Set(), materials: new Set(), textures: new Set() }
  const imageReady = []
  const own = (kind, value) => { resources[kind].add(value); return value }
  try {
    const geometries = metadata.geometries.map(data => {
      const geometry = own('geometries', new THREE.BufferGeometry())
      Object.entries(data.attributes).forEach(([name, value]) => geometry.setAttribute(name, attribute(value)))
      if (data.index) geometry.setIndex(attribute(data.index))
      geometry.groups = data.groups || []
      geometry.userData = data.userData || {}
      geometry.setDrawRange(data.drawRange.start, data.drawRange.count ?? Infinity)
      return geometry
    })
    const textures = (metadata.textures || []).map(data => {
      const imageIds = data.cube ? data.image : [data.image]
      if (!Array.isArray(imageIds) || (data.cube && imageIds.length !== 6)) throw new Error('Invalid shared display cube image.')
      const descriptions = imageIds.map(id => {
        const image = Number.isInteger(id) && id >= 0 ? metadata.images?.[id] : null
        if (!image || (!image.pixels && !embeddedImage(image.url))) throw new Error('Invalid shared display image.')
        return image
      })
      const texture = own('textures', data.cube ? new THREE.CubeTexture() : descriptions[0].pixels ? new THREE.DataTexture() : new THREE.Texture())
      Object.assign(texture, pick(data, textureScalars))
      texture.userData = pick(data.userData, textureMetadata)
      for (const key of ['offset', 'repeat', 'center', 'matrix']) if (data[key]) texture[key].fromArray(data[key])
      let pending = 0, disposed = false, failed = false
      let settle
      imageReady.push(new Promise(resolve => { settle = resolve }))
      const loading = new Set()
      const cancel = () => {
        disposed = true
        for (const image of loading) { image.onload = image.onerror = null; image.removeAttribute?.('src') }
        loading.clear()
        settle()
        texture.removeEventListener('dispose', cancel)
      }
      texture.addEventListener('dispose', cancel)
      const images = descriptions.map(description => {
        if (description.pixels) {
          if (!Number.isSafeInteger(description.width) || description.width <= 0 || !Number.isSafeInteger(description.height) || description.height <= 0) throw new Error('Invalid shared display image dimensions.')
          const image = { data: attribute(description.pixels).array, width: description.width, height: description.height }
          return data.cube ? own('textures', new THREE.DataTexture(image.data, image.width, image.height, texture.format, texture.type)) : image
        }
        // Image decoding remains asynchronous, like Three's TextureLoader. Only
        // packet-owned embedded bytes enter the DOM; no arbitrary URL is loaded.
        const image = typeof document !== 'undefined' ? document.createElement('img') : null
        if (!image) return null
        pending++
        loading.add(image)
        const finish = success => {
          if (!loading.has(image)) return
          image.onload = image.onerror = null
          loading.delete(image)
          pending--
          failed ||= !success
          if (!disposed && !failed && pending === 0) texture.needsUpdate = true
          if (pending === 0) settle()
        }
        image.onload = () => finish(true)
        image.onerror = () => finish(false)
        image.src = description.url
        return image
      })
      texture.image = data.cube ? images : images[0]
      if (!pending && images.every(Boolean)) texture.needsUpdate = true
      if (!pending) settle()
      return texture
    })
    const materialTypes = { MeshBasicMaterial: THREE.MeshBasicMaterial, MeshStandardMaterial: THREE.MeshStandardMaterial, MeshPhysicalMaterial: THREE.MeshPhysicalMaterial, MeshPhongMaterial: THREE.MeshPhongMaterial, MeshLambertMaterial: THREE.MeshLambertMaterial, MeshToonMaterial: THREE.MeshToonMaterial, MeshNormalMaterial: THREE.MeshNormalMaterial, MeshDepthMaterial: THREE.MeshDepthMaterial, LineBasicMaterial: THREE.LineBasicMaterial, LineDashedMaterial: THREE.LineDashedMaterial, PointsMaterial: THREE.PointsMaterial }
    const materials = metadata.materials.map(({ type, ...settings }) => {
      const material = own('materials', new (materialTypes[type] || THREE.MeshStandardMaterial)())
      restoreMaterial(material, settings)
      for (const key of textureSlots) {
        const id = settings.textures?.[key]
        if (id != null) {
          if (!textures[id]) throw new Error('Invalid shared display texture reference.')
          material[key] = textures[id]
        }
      }
      return material
    })
    const materialReference = id => {
      if (id == null) return null
      if (!materials[id]) throw new Error('Invalid shared display material reference.')
      return materials[id]
    }
    const visit = data => {
      const geometry = geometries[data.geometry]
      const material = data.materialArray ? data.materials.map(materialReference) : materialReference(data.materials?.[0])
      let object
      if (data.instanceMatrix) {
        object = new THREE.InstancedMesh(geometry, material, data.count)
        object.instanceMatrix = attribute(data.instanceMatrix)
        if (data.instanceColor) object.instanceColor = attribute(data.instanceColor)
      } else if (data.type === 'Mesh') object = new THREE.Mesh(geometry, material)
      else if (data.type === 'Points') object = new THREE.Points(geometry, material)
      else if (data.type === 'LineSegments') object = new THREE.LineSegments(geometry, material)
      else if (data.type === 'LineLoop') object = new THREE.LineLoop(geometry, material)
      else if (data.type === 'Line') object = new THREE.Line(geometry, material)
      else object = new THREE.Group()
      object.name = data.name
      object.userData = data.userData || {}
      if (data.displayMaterials) object.userData.displayMaterials = Object.fromEntries(Object.entries(data.displayMaterials).map(([key, value]) => [key, Array.isArray(value) ? value.map(materialReference) : materialReference(value)]))
      object.visible = data.visible
      Object.assign(object, pick(data, ['fullLayerPath', 'castShadow', 'receiveShadow', 'renderOrder', 'frustumCulled', 'matrixAutoUpdate']))
      object.matrix.fromArray(data.matrix).decompose(object.position, object.quaternion, object.scale)
      data.children.forEach(child => object.add(visit(child)))
      return object
    }
    const root = visit(metadata.tree)
    ownedDisplays.set(root, resources)
    readyDisplays.set(root, Promise.all(imageReady).then(() => undefined))
    return root
  } catch (error) {
    releaseResources(resources)
    throw error
  }
}

function releaseResources (resources) {
  for (const set of Object.values(resources)) set.forEach(resource => resource.dispose())
}

export function disposeSceneDisplay (root) {
  if (disposedDisplays.has(root)) return
  disposedDisplays.add(root)
  const owned = ownedDisplays.get(root)
  if (owned) {
    // Ownership is established at decode, not inferred from the current scene:
    // renderer overrides can borrow external textures or detach packet resources.
    releaseResources(owned)
    ownedDisplays.delete(root)
    root.parent?.remove(root)
    return
  }
  const geometries = new Set()
  const materials = new Set()
  const textures = new Set()
  root.traverse(object => { if (object.geometry) geometries.add(object.geometry); [...materialsOf(object), ...bagMaterials(object)].forEach(material => materials.add(material)) })
  materials.forEach(material => textureSlots.forEach(key => { if (material[key]?.isTexture) textures.add(material[key]) }))
  releaseResources({ geometries, materials, textures })
  root.parent?.remove(root)
}
