import * as THREE from 'three'
import { createPointMaterial } from '../PointDisplaySettings'
import { SCENE_FILE_TEXTURE_SLOTS, SCENE_FILE_MATERIAL_SCALARS } from './SceneFileRecords'

const documents = new WeakMap()

// This index only joins material packets during import. The scene owns the
// mounted roots; retaining this index after EOF keeps deleted roots alive.
export function clearDisplayObjectImport (document) {
  documents.delete(document)
}

export function normalizeImportLayerPath (path) {
  return String(path || 'Default').split(/::|\//).filter(Boolean).join('::') || 'Default'
}

function finiteArray (value, size, label) {
  if (!value || value.length % size || !value.every(Number.isFinite)) throw new Error(`Invalid display ${label}.`)
}

function validate (packet) {
  if (!packet || !['mesh', 'lines', 'points'].includes(packet.kind)) throw new Error('Invalid display kind.')
  finiteArray(packet.positions, 3, 'positions')
  for (const key of ['normals', 'colors']) {
    if (packet[key] == null) continue
    finiteArray(packet[key], 3, key)
    if (packet[key].length !== packet.positions.length) throw new Error(`Invalid display ${key} length.`)
  }
  for (const [key, size] of [['uv', 2], ['uv2', 2], ['tangents', 4]]) {
    if (packet[key] == null) continue
    finiteArray(packet[key], size, key)
    if (packet[key].length / size !== packet.positions.length / 3) throw new Error(`Invalid display ${key} length.`)
  }
  if (packet.colors && !packet.colors.every(v => v >= 0 && v <= 1)) throw new Error('Display colors must be normalized RGB (0..1).')
  if (packet.matrix) {
    finiteArray(packet.matrix, 16, 'matrix')
    if (packet.matrix.length !== 16 || packet.matrix[3] !== 0 || packet.matrix[7] !== 0 || packet.matrix[11] !== 0 || packet.matrix[15] !== 1) throw new Error('Display matrix must be affine column-major16.')
  }
  const stride = packet.kind === 'mesh' ? 3 : packet.kind === 'lines' ? 2 : 1
  const count = packet.indices?.length ?? packet.positions.length / 3
  if (count % stride) throw new Error(`Invalid display ${packet.kind} primitive count.`)
  if (packet.indices && !packet.indices.every(i => Number.isInteger(i) && i >= 0 && i < packet.positions.length / 3)) throw new Error('Invalid display indices.')
  for (const group of packet.groups || []) {
    if (!Number.isInteger(group.start) || !Number.isInteger(group.count) || group.start < 0 || group.count < 0 || group.start + group.count > count || group.start % stride || group.count % stride) throw new Error('Invalid display group range.')
    if (!Number.isInteger(group.materialIndex ?? 0) || (group.materialIndex ?? 0) < 0 || (packet.materials?.length && (group.materialIndex || 0) >= packet.materials.length)) throw new Error('Invalid display group material.')
  }
  for (const child of packet.children || []) validate(child)
}

function color (value, fallback = [0.7, 0.7, 0.7]) {
  const rgb = value || fallback
  if (rgb.length < 3 || !Array.from(rgb).every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error('Display colors must be normalized RGB (0..1).')
  return new THREE.Color(rgb[0], rgb[1], rgb[2])
}

function geometry (packet, resources) {
  const result = new THREE.BufferGeometry()
  resources.add(result)
  // Producer packets can share arrays between instances. Own the mutable
  // buffers so editing one imported object cannot edit its siblings.
  result.setAttribute('position', new THREE.BufferAttribute(new Float32Array(packet.positions), 3))
  if (packet.normals) result.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(packet.normals), 3))
  if (packet.colors) result.setAttribute('color', new THREE.BufferAttribute(new Float32Array(packet.colors), 3))
  for (const key of ['uv', 'uv2']) if (packet[key]) result.setAttribute(key, new THREE.BufferAttribute(new Float32Array(packet[key]), 2))
  if (packet.tangents) result.setAttribute('tangent', new THREE.BufferAttribute(new Float32Array(packet.tangents), 4))
  if (packet.indices) result.setIndex(new THREE.BufferAttribute(new Uint32Array(packet.indices), 1))
  if (packet.kind === 'mesh' && !result.attributes.normal) result.computeVertexNormals()
  return result
}

function textureMaps (descriptors, resources, cache) {
  const maps = {}
  for (const slot of SCENE_FILE_TEXTURE_SLOTS) {
    const descriptor = descriptors?.[slot]
    if (!descriptor) continue
    const { width, height, pixels } = descriptor
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !(pixels instanceof Uint8Array) || pixels.length !== width * height * 4) throw new Error(`Invalid display texture ${slot} RGBA pixels.`)
    const encoding = ['map', 'emissiveMap'].includes(slot) ? THREE.sRGBEncoding : THREE.LinearEncoding
    let variants = cache.get(descriptor)
    if (!variants) { variants = new Map(); cache.set(descriptor, variants) }
    if (!variants.has(encoding)) {
      const texture = new THREE.DataTexture(new Uint8Array(pixels), width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
      resources.add(texture)
      texture.name = descriptor.name || descriptor.id || ''
      texture.encoding = encoding
      texture.userData = { sceneFileTexCoord: descriptor.texCoord ?? (slot === 'aoMap' || slot === 'lightMap' ? 1 : 0) }
      for (const key of ['wrapS', 'wrapT', 'minFilter', 'magFilter', 'anisotropy', 'rotation']) {
        if (descriptor[key] === undefined) continue
        if (!Number.isFinite(descriptor[key])) throw new Error(`Invalid display texture ${key}.`)
        texture[key] = descriptor[key]
      }
      for (const key of ['repeat', 'offset', 'center']) {
        if (!descriptor[key]) continue
        finiteArray(descriptor[key], 2, `texture ${key}`)
        if (descriptor[key].length !== 2) throw new Error(`Invalid display texture ${key}.`)
        texture[key].fromArray(descriptor[key])
      }
      texture.flipY = descriptor.flipY ?? false
      texture.generateMipmaps = descriptor.generateMipmaps ?? true
      texture.premultiplyAlpha = descriptor.premultiplyAlpha ?? false
      texture.unpackAlignment = 1
      texture.matrixAutoUpdate = descriptor.matrixAutoUpdate ?? true
      if (descriptor.matrix) {
        finiteArray(descriptor.matrix, 9, 'texture matrix')
        if (descriptor.matrix.length !== 9) throw new Error('Invalid display texture matrix.')
        texture.matrix.fromArray(descriptor.matrix)
      } else texture.updateMatrix()
      texture.needsUpdate = true
      variants.set(encoding, texture)
    }
    maps[slot] = variants.get(encoding)
  }
  return maps
}

function materials (packet, descriptor, resources, textureCache) {
  const options = { ...packet, ...(Array.isArray(descriptor) ? { color: descriptor } : descriptor) }
  const opacity = Number.isFinite(options.opacity) ? THREE.MathUtils.clamp(options.opacity, 0, 1) : 1
  const common = { color: color(options.color), vertexColors: !!packet.colors, opacity, transparent: options.transparent ?? opacity < 1, depthTest: true, depthWrite: options.depthWrite ?? opacity === 1 }
  const maps = textureMaps(options.textures, resources, textureCache)
  const retain = material => { resources.add(material); return material }
  if (packet.kind === 'lines') return { material: retain(new THREE.LineBasicMaterial({ ...common, toneMapped: false })) }
  if (packet.kind === 'points') {
    const material = retain(createPointMaterial({ ...common, toneMapped: false }))
    if (Number.isFinite(options.pointSize)) material.size = Math.max(1, options.pointSize)
    if (maps.map) material.map = maps.map
    if (maps.alphaMap) material.alphaMap = maps.alphaMap
    return { material }
  }
  const side = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].includes(options.side) ? options.side : THREE.DoubleSide
  const shading = retain(new THREE.MeshPhongMaterial({ ...common, side, toneMapped: false, shininess: 42 }))
  const render = retain(options.unlit ? new THREE.MeshBasicMaterial({ ...common, side }) : new THREE.MeshPhysicalMaterial({ ...common, side, metalness: options.metalness ?? 0.12, roughness: options.roughness ?? 0.42, clearcoat: options.clearcoat ?? 0.08 }))
  for (const material of [shading, render]) {
    for (const key of SCENE_FILE_MATERIAL_SCALARS) if (key in material && Number.isFinite(options[key])) material[key] = options[key]
    for (const key of ['emissive', 'specular']) if (key in material && options[key]) material[key].copy(color(options[key], [0, 0, 0]))
    for (const key of ['normalScale', 'clearcoatNormalScale']) {
      if (!(key in material) || !options[key]) continue
      finiteArray(options[key], 2, key)
      if (options[key].length !== 2) throw new Error(`Invalid display ${key}.`)
      material[key].fromArray(options[key])
    }
    for (const key of ['premultipliedAlpha', 'flatShading']) if (typeof options[key] === 'boolean') material[key] = options[key]
    for (const [slot, texture] of Object.entries(maps)) if (slot in material) material[slot] = texture
    if (packet.tangents) material.vertexTangents = true
  }
  return { material: shading, displayMaterials: { shading, render } }
}

function addSurfaceWires (parent, source, appearance, resources) {
  const start = source.drawRange.start
  const end = Math.min(source.index?.count ?? source.attributes.position.count, start + source.drawRange.count)
  const indices = new Uint32Array((end - start) * 2)
  for (let i = start, offset = 0; i < end; i += 3) {
    const a = source.index ? source.index.getX(i) : i
    const b = source.index ? source.index.getX(i + 1) : i + 1
    const c = source.index ? source.index.getX(i + 2) : i + 2
    indices.set([a, b, b, c, c, a], offset); offset += 6
  }
  const wireGeometry = new THREE.BufferGeometry()
  wireGeometry.setAttribute('position', source.attributes.position)
  wireGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
  const wireMaterial = new THREE.LineBasicMaterial({ color: appearance.color, toneMapped: false })
  resources.add(wireGeometry); resources.add(wireMaterial)
  const wires = new THREE.LineSegments(wireGeometry, wireMaterial)
  wires.userData.surfaceWires = true
  // Selection excludes mesh topology overlays, even when they are hidden.
  wires.userData.meshGeometryEdges = true
  wires.name = 'Surface wires'
  parent.add(wires)
}

function build (packet, resources, textureCache = new Map()) {
  // Visibility lives on a wrapper: switching display modes may show a mesh,
  // but must never unhide a hidden source object or a hidden child.
  const root = new THREE.Group()
  root.userData.displayOnly = true
  root.name = packet.name || ''
  if (packet.visible === false) {
    root.visible = false
    Object.assign(root.userData, { pandauiHidden: true, importedHiddenObject: true })
  }
  // sourceGeometryId is reserved for recoverable native control-point data.
  root.userData.sourceDisplayId = packet.id == null ? undefined : String(packet.id)
  if (packet.hierarchyPath) root.userData.hierarchyPath = [...packet.hierarchyPath]
  const matrix = packet.matrix ? new THREE.Matrix4().fromArray(packet.matrix) : new THREE.Matrix4()
  let content = root
  // Editable TRS at the object root, with an exact residual for affine shear.
  if (Math.abs(matrix.determinant()) > 1e-15) {
    matrix.decompose(root.position, root.quaternion, root.scale)
    root.updateMatrix()
    if (root.matrix.elements.some((v, i) => Math.abs(v - matrix.elements[i]) > 1e-10)) {
      content = new THREE.Group(); content.matrixAutoUpdate = false
      content.matrix.multiplyMatrices(new THREE.Matrix4().getInverse(root.matrix), matrix)
      root.add(content)
    }
  } else {
    content = new THREE.Group(); content.matrixAutoUpdate = false; content.matrix.copy(matrix); root.add(content)
  }
  const base = geometry(packet, resources)
  const count = base.index?.count ?? base.attributes.position.count
  // One material per child keeps the document's scalar display-material and
  // resource APIs intact. All material ranges still edit as one model object.
  const groups = packet.groups?.length ? packet.groups : [{ start: 0, count, materialIndex: 0 }]
  groups.forEach((group, index) => {
    const partGeometry = index === 0 ? base : new THREE.BufferGeometry()
    if (index) {
      Object.entries(base.attributes).forEach(([key, attribute]) => partGeometry.setAttribute(key, attribute))
      if (base.index) partGeometry.setIndex(base.index)
      resources.add(partGeometry)
    }
    if (packet.groups?.length) {
      partGeometry.addGroup(group.start, group.count, 0)
      partGeometry.setDrawRange(group.start, group.count)
    }
    const appearance = materials(packet, packet.materials?.[group.materialIndex || 0], resources, textureCache)
    const ObjectType = packet.kind === 'mesh' ? THREE.Mesh : packet.kind === 'lines' ? THREE.LineSegments : THREE.Points
    const part = new ObjectType(partGeometry, appearance.material)
    if (appearance.displayMaterials) part.userData.displayMaterials = appearance.displayMaterials
    part.userData.materialId = group.materialIndex || 0
    if (packet.kind === 'mesh') part.userData.diffuse = appearance.displayMaterials.render.color
    content.add(part)
    if (packet.kind === 'mesh' && group.count) addSurfaceWires(content, partGeometry, appearance.material, resources)
  })
  for (const child of packet.children || []) content.add(build(child, resources, textureCache))
  return root
}

function ensureLayer (document, path) {
  let nodes = document.layers, fullPath = '', visible = true, created = false
  for (const label of path.split('::')) {
    fullPath = fullPath ? `${fullPath}::${label}` : label
    let node = nodes.find(node => node.fullPath === fullPath)
    if (!node) { node = { label, fullPath, visible: true }; nodes.push(node); created = true }
    visible &&= node.visible !== false
    nodes = node.children ||= []
  }
  if (created) document.setLayerVisibility(path, visible)
}

/** Mount a packet; child matrices are local, top-level matrices are world.
 * objectId optionally joins flat material records into one editable object.
 * lines always contain independent segment pairs. Colors use normalized RGB.
 */
export function mountDisplayObject (document, packet) {
  if (document.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
  validate(packet)
  const resources = new Set()
  let part
  try { part = build(packet, resources) } catch (error) { resources.forEach(resource => resource.dispose()); throw error }
  let state = documents.get(document)
  if (!state) { state = { objects: new Map(), sequence: 0 }; documents.set(document, state) }
  const layerPath = normalizeImportLayerPath(packet.layerPath)
  const existing = packet.objectId == null ? null : state.objects.get(String(packet.objectId))
  if (existing && existing.layerPath !== layerPath) {
    resources.forEach(resource => resource.dispose())
    throw new Error('Display material records for one object must use the same layer.')
  }
  const id = String(packet.objectId ?? packet.id ?? `display-${state.sequence}`)
  const key = `display:${id}:${state.sequence++}`
  const root = existing?.root || (packet.objectId == null ? part : new THREE.Group())
  document.tagImportedObject(part, key, layerPath, packet.name || id)
  if (root !== part) {
    if (!existing) {
      root.position.copy(part.position); root.quaternion.copy(part.quaternion); root.scale.copy(part.scale)
      root.updateMatrix()
      root.name = packet.name || id
      root.userData.displayOnly = true
      if (packet.hierarchyPath) root.userData.hierarchyPath = [...packet.hierarchyPath]
      document.tagImportedObject(root, `${key}:root`, layerPath, root.name)
    }
    part.updateMatrix()
    part.matrix.premultiply(existing?.inverse || new THREE.Matrix4().getInverse(root.matrix))
    part.matrixAutoUpdate = false
    root.add(part)
  }
  if (!existing) {
    root.userData.importedModelObject = true
    root.userData.geometryType = packet.kind === 'mesh' ? 'Mesh' : packet.kind === 'points' ? 'Point' : 'Polyline'
    root.userData.sourceDisplayId = id
    root.updateMatrix()
    if (packet.objectId != null) state.objects.set(id, { root, layerPath, inverse: new THREE.Matrix4().getInverse(root.matrix) })
    ensureLayer(document, layerPath)
    document.three.middleground.add(root)
  }
  resources.forEach(resource => document.disposableResources.push(resource))
  document.configureImportedObject(root, layerPath, !existing)
  document.countImportedParts(part)
  document.onImportedRoot?.(root)
  let vertices = 0, byteLength = 0
  const textureBuffers = new Set()
  const count = item => {
    vertices += item.positions.length / 3
    for (const name of ['positions', 'normals', 'indices', 'colors', 'uv', 'uv2', 'tangents']) byteLength += item[name]?.byteLength || 0
    for (const material of [item, ...(item.materials || [])]) {
      for (const texture of Object.values(material.textures || {})) {
        if (texture?.pixels && !textureBuffers.has(texture.pixels.buffer)) { textureBuffers.add(texture.pixels.buffer); byteLength += texture.pixels.byteLength }
      }
    }
    ;(item.children || []).forEach(count)
  }
  count(packet)
  return { root, id, vertices, byteLength, newObject: !existing }
}

export default mountDisplayObject
