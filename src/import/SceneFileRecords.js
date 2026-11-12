import * as THREE from 'three'

export const sceneFileAbortError = () => Object.assign(new Error('Scene file import cancelled.'), { name: 'AbortError' })
export const checkSceneFileAbort = signal => { if (signal?.aborted) throw sceneFileAbortError() }

export const SCENE_FILE_TEXTURE_SLOTS = Object.freeze(['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'specularMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'transmissionMap'])
export const SCENE_FILE_MATERIAL_SCALARS = Object.freeze(['metalness', 'roughness', 'emissiveIntensity', 'aoMapIntensity', 'lightMapIntensity', 'bumpScale', 'displacementScale', 'displacementBias', 'normalMapType', 'clearcoat', 'clearcoatRoughness', 'reflectivity', 'refractionRatio', 'transmission', 'ior', 'shininess', 'alphaTest'])

function textureImage (texture) {
  const image = texture.image
  const width = image?.naturalWidth || image?.width, height = image?.naturalHeight || image?.height
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error('image is unavailable')
  if (texture.isCompressedTexture) throw new Error('compressed pixels are unsupported')
  let pixels
  if (image.data) {
    if (texture.type !== THREE.UnsignedByteType || !(image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray)) throw new Error('only unsigned byte image pixels are supported')
    const channels = texture.format === THREE.RGBAFormat ? 4 : texture.format === THREE.RGBFormat ? 3 : 0
    if (!channels || image.data.length !== width * height * channels) throw new Error('invalid pixel format or dimensions')
    pixels = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      pixels.set(image.data.subarray(i * channels, i * channels + 3), i * 4)
      pixels[i * 4 + 3] = channels === 4 ? image.data[i * channels + 3] : 255
    }
  } else {
    if (typeof document === 'undefined') throw new Error('image conversion requires the main thread')
    const canvas = document.createElement('canvas')
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('canvas image conversion is unavailable')
    context.drawImage(image, 0, 0)
    pixels = new Uint8Array(context.getImageData(0, 0, width, height).data)
    canvas.width = canvas.height = 0
  }
  return { width, height, pixels }
}

function materialRecord (material, textureCache, imageCache, warn) {
  const result = {}, textures = {}
  for (const key of SCENE_FILE_MATERIAL_SCALARS) if (Number.isFinite(material[key])) result[key] = material[key]
  for (const key of ['emissive', 'specular', 'normalScale', 'clearcoatNormalScale']) if (material[key]?.toArray) result[key] = material[key].toArray()
  for (const key of ['transparent', 'depthWrite', 'premultipliedAlpha', 'flatShading']) if (typeof material[key] === 'boolean') result[key] = material[key]
  if (material.isMeshBasicMaterial) result.unlit = true
  for (const slot of SCENE_FILE_TEXTURE_SLOTS) {
    const texture = material[slot]
    if (!texture?.isTexture) continue
    const colorSpace = ['map', 'emissiveMap'].includes(slot) ? 'srgb' : 'linear'
    const texCoord = texture.userData?.sceneFileTexCoord ?? (slot === 'aoMap' || slot === 'lightMap' ? 1 : 0)
    const key = texture.uuid + ':' + colorSpace + ':' + texCoord
    if (!textureCache.has(key)) {
      try {
        let image = imageCache.get(texture.image)
        if (!image) { image = textureImage(texture); imageCache.set(texture.image, image) }
        if (texture.matrixAutoUpdate) texture.updateMatrix()
        textureCache.set(key, {
          id: `scene-texture-${textureCache.size}`,
          name: texture.name || '',
          ...image,
          colorSpace,
          encoding: colorSpace === 'srgb' ? THREE.sRGBEncoding : THREE.LinearEncoding,
          wrapS: texture.wrapS,
          wrapT: texture.wrapT,
          minFilter: texture.minFilter,
          magFilter: texture.magFilter,
          anisotropy: texture.anisotropy,
          generateMipmaps: texture.generateMipmaps,
          offset: texture.offset.toArray(),
          repeat: texture.repeat.toArray(),
          center: texture.center.toArray(),
          rotation: texture.rotation,
          matrix: texture.matrix.toArray(),
          matrixAutoUpdate: texture.matrixAutoUpdate,
          texCoord,
          flipY: texture.flipY,
          premultiplyAlpha: texture.premultiplyAlpha,
          unpackAlignment: 1
        })
      } catch (error) {
        warn(`Optional texture ${texture.name || slot} is unavailable (${error.message}); using material values.`)
        textureCache.set(key, null)
      }
    }
    if (textureCache.get(key)) textures[slot] = textureCache.get(key)
  }
  if (Object.keys(textures).length) result.textures = textures
  return result
}

function attributeArray (attribute, size) {
  if (!attribute || attribute.itemSize < size) return undefined
  const result = new Float32Array(attribute.count * size)
  const source = attribute.isInterleavedBufferAttribute ? attribute.data.array : attribute.array
  const stride = attribute.isInterleavedBufferAttribute ? attribute.data.stride : attribute.itemSize
  const offset = attribute.isInterleavedBufferAttribute ? attribute.offset : 0
  const divisors = { Uint8Array: 255, Uint8ClampedArray: 255, Uint16Array: 65535, Uint32Array: 4294967295, Int8Array: 127, Int16Array: 32767, Int32Array: 2147483647 }
  const divisor = attribute.normalized && divisors[source.constructor.name]
  for (let i = 0; i < attribute.count; i++) {
    for (let c = 0; c < size; c++) {
      const value = source[i * stride + offset + c]
      result[i * size + c] = divisor ? Math.max(value / divisor, -1) : value
    }
  }
  return result
}

// Arrays are owned by the packet, never by the loader's disposable scene.
// Instances share attribute arrays; collectSceneFileTransferables deduplicates them.
export function sceneFileRecords (root, { name = 'scene', format = '', warnings = [], signal } = {}) {
  const records = [], layers = [], layerIds = new Map(), geometryCache = new Map()
  const textureCache = new Map(), imageCache = new Map(), materialCache = new Map()
  const warn = message => { if (!warnings.includes(message)) warnings.push(message) }
  root.updateMatrixWorld(true)
  const visit = (object, path, indices, parentVisible) => {
    checkSceneFileAbort(signal)
    const hierarchyPath = [...path, object.name || (indices.length ? `${object.type} ${indices[indices.length - 1] + 1}` : name)]
    const visible = parentVisible && object.visible !== false
    if (object.animations?.length) warn('Animations are imported as a static initial pose; animation playback is not preserved.')
    if (object.isMesh || object.isLine || object.isPoints) {
      let geometry = object.geometry
      if (geometry?.isGeometry) geometry = new THREE.BufferGeometry().fromGeometry(geometry)
      const position = geometry?.getAttribute('position')
      if (position?.count) {
        let data = geometryCache.get(geometry)
        if (!data) {
          data = { positions: attributeArray(position, 3), normals: attributeArray(geometry.getAttribute('normal'), 3), colors: attributeArray(geometry.getAttribute('color'), 3) }
          for (const [key, size] of [['uv', 2], ['uv2', 2], ['tangents', 4]]) {
            const attribute = geometry.getAttribute(key === 'tangents' ? 'tangent' : key)
            if (!attribute) continue
            data[key] = attributeArray(attribute, size)
            if (!data[key]?.every(Number.isFinite) || data[key].length !== position.count * size) throw new Error(`Invalid vertex ${key}.`)
          }
          if (!data.positions?.every(Number.isFinite)) throw new Error(`Invalid or non-finite positions in ${hierarchyPath.join('/')}.`)
          if (data.normals && !data.normals.every(Number.isFinite)) throw new Error('Invalid vertex normals.')
          if (data.colors && !data.colors.every(Number.isFinite)) throw new Error('Invalid vertex colors.')
          geometryCache.set(geometry, data)
        }
        const morphs = geometry.morphAttributes.position
        if (object.isSkinnedMesh || (morphs?.length && object.morphTargetInfluences?.some(value => value !== 0))) {
          const positions = data.positions.slice(), vector = new THREE.Vector3()
          const morphArrays = (morphs || []).map(attribute => attributeArray(attribute, 3))
          object.skeleton?.update()
          for (let i = 0; i < position.count; i++) {
            vector.fromArray(data.positions, i * 3)
            morphArrays.forEach((array, m) => {
              const weight = object.morphTargetInfluences?.[m] || 0
              vector.x += weight * (array[i * 3] - (geometry.morphTargetsRelative ? 0 : data.positions[i * 3]))
              vector.y += weight * (array[i * 3 + 1] - (geometry.morphTargetsRelative ? 0 : data.positions[i * 3 + 1]))
              vector.z += weight * (array[i * 3 + 2] - (geometry.morphTargetsRelative ? 0 : data.positions[i * 3 + 2]))
            })
            if (object.isSkinnedMesh) object.boneTransform(i, vector)
            vector.toArray(positions, i * 3)
          }
          if (!positions.every(Number.isFinite)) throw new Error('Invalid deformed vertex positions.')
          data = { ...data, positions, normals: undefined }
          warn('Skinning and morph targets are baked into the static initial pose; normals are regenerated by the viewer.')
        }
        const kind = object.isMesh ? 'mesh' : object.isPoints ? 'points' : 'lines'
        const materialList = Array.isArray(object.material) ? object.material : [object.material]
        const total = geometry.index ? geometry.index.count : position.count
        const groups = Array.isArray(object.material) ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }]
        const layerPath = hierarchyPath.slice(0, -1).join('/') || name
        if (!layerIds.has(layerPath)) {
          const id = `scene-layer-${layers.length}`
          layerIds.set(layerPath, id)
          layers.push({ id, name: hierarchyPath.length > 1 ? hierarchyPath[hierarchyPath.length - 2] : name, path: layerPath })
        }
        groups.forEach((group, groupIndex) => {
          const material = materialList[group.materialIndex || 0]
          if (!material) return
          if (!materialCache.has(material)) materialCache.set(material, materialRecord(material, textureCache, imageCache, warn))
          const start = Math.max(group.start, geometry.drawRange.start)
          const end = Math.min(total, group.start + group.count, geometry.drawRange.start + geometry.drawRange.count)
          if (end <= start) return
          const sourceIndices = new Uint32Array(end - start)
          for (let i = start; i < end; i++) {
            const index = geometry.index ? geometry.index.getX(i) : i
            if (!Number.isInteger(index) || index < 0 || index >= position.count) throw new Error('Geometry references an invalid vertex index.')
            sourceIndices[i - start] = index
          }
          let outputIndices = sourceIndices
          if (kind === 'lines' && !object.isLineSegments) {
            const pairs = []
            for (let i = 1; i < sourceIndices.length; i++) pairs.push(sourceIndices[i - 1], sourceIndices[i])
            if (object.isLineLoop && sourceIndices.length > 1) pairs.push(sourceIndices[sourceIndices.length - 1], sourceIndices[0])
            outputIndices = new Uint32Array(pairs)
          }
          if (kind === 'mesh' && outputIndices.length % 3 !== 0) throw new Error('Mesh triangle index count is not divisible by three.')
          if (kind === 'lines' && outputIndices.length % 2 !== 0) throw new Error('Line segment index count is not even.')
          const count = object.isInstancedMesh ? object.count : 1
          for (let instance = 0; instance < count; instance++) {
            const matrix = object.matrixWorld.clone(), color = material.color?.clone() || new THREE.Color(0xcccccc)
            if (object.isInstancedMesh) {
              const local = new THREE.Matrix4()
              object.getMatrixAt(instance, local)
              matrix.multiply(local)
              if (object.instanceColor) { const tint = new THREE.Color(); object.getColorAt(instance, tint); color.multiply(tint) }
            }
            if (!matrix.elements.every(Number.isFinite)) throw new Error('Invalid object transform.')
            records.push({ displayObject: {
              id: `scene:${encodeURIComponent(name)}:${indices.join('.') || 'root'}:${groupIndex}:${instance}`,
              objectId: `scene:${encodeURIComponent(name)}:${object.userData.sceneFileLogicalNode === undefined ? indices.join('.') || 'root' : 'gltf-node-' + object.userData.sceneFileLogicalNode}:instance:${instance}`,
              name: object.name || hierarchyPath[hierarchyPath.length - 1],
              layerPath,
              hierarchyPath,
              kind,
              positions: data.positions,
              indices: outputIndices,
              ...(data.normals ? { normals: data.normals } : {}),
              ...(data.colors && material.vertexColors ? { colors: data.colors } : {}),
              ...(data.uv ? { uv: data.uv } : {}),
              ...(data.uv2 ? { uv2: data.uv2 } : {}),
              ...(data.tangents ? { tangents: data.tangents } : {}),
              ...materialCache.get(material),
              matrix: matrix.toArray(),
              color: color.toArray(),
              opacity: material.opacity,
              visible: visible && material.visible !== false,
              side: material.side,
              ...(kind === 'points' ? { pointSize: material.size } : {})
            } })
          }
        })
      }
      if (geometry !== object.geometry) geometry?.dispose()
    } else if (object.isLight || object.isCamera) warn('Cameras and lights are not imported into the model display.')
    object.children.forEach((child, index) => visit(child, hierarchyPath, [...indices, index], visible))
  }
  visit(root, [], [], true)
  if (!records.length) throw new Error('No supported mesh, line, or point geometry was found in this file.')
  return { format, layers, records, warnings }
}

export function disposeSceneFileObject (root) {
  const resources = new Set()
  root?.traverse(object => {
    if (object.geometry) resources.add(object.geometry)
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue
      resources.add(material)
      Object.values(material).forEach(value => { if (value?.isTexture) resources.add(value) })
    }
    if (object.skeleton?.boneTexture) resources.add(object.skeleton.boneTexture)
  })
  resources.forEach(resource => { resource.image?.close?.(); resource.dispose() })
}

export function collectSceneFileTransferables (packet) {
  const buffers = new Set(), visited = new Set()
  const visit = value => {
    if (!value || typeof value !== 'object' || visited.has(value)) return
    visited.add(value)
    if (ArrayBuffer.isView(value)) {
      if (value.buffer instanceof ArrayBuffer) buffers.add(value.buffer)
    } else Object.values(value).forEach(visit)
  }
  visit(packet.records)
  return [...buffers]
}

// Call only after the consumer has adopted/uploaded the typed arrays.
export function releaseSceneFilePacket (packet) {
  if (!packet) return
  packet.records.length = 0
  packet.layers.length = 0
}
