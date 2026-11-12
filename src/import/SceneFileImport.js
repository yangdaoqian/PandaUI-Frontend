import { checkSceneFileAbort, disposeSceneFileObject, sceneFileRecords } from './SceneFileRecords'
import { createSceneFileResources, withSceneFileAbort } from './SceneFileResources'
import { Texture } from 'three'

export const SCENE_FILE_FORMATS = Object.freeze(['glb', 'gltf', 'fbx', '3ds', 'dae', '3mf', 'amf', 'vtk', 'vtp', 'pcd', 'xyz', 'off', 'wrl', 'vrml'])
const workerFormats = ['pcd', 'vtk', 'xyz', 'off']
const decode = buffer => new TextDecoder().decode(buffer)
const warnOnce = (warnings, message) => { if (!warnings.includes(message)) warnings.push(message) }

function xmlDocument (text, expectedRoot) {
  if (typeof DOMParser === 'undefined') throw new Error('This format requires a browser DOMParser; parse it on the main thread.')
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror') || xml.documentElement.localName.toLowerCase() !== expectedRoot.toLowerCase()) throw new Error(`Invalid ${expectedRoot} XML document.`)
  return xml
}

function prepareGLTF (buffer, format, resources, warnings) {
  let json, binary
  if (format === 'glb') {
    if (buffer.byteLength < 20) throw new Error('Truncated GLB header.')
    const view = new DataView(buffer)
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error('Invalid GLB 2 header or length.')
    let offset = 12
    while (offset < buffer.byteLength) {
      if (offset + 8 > buffer.byteLength) throw new Error('Truncated GLB chunk header.')
      const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true)
      if (length % 4 || offset + 8 + length > buffer.byteLength) throw new Error('Invalid GLB chunk length.')
      if (type === 0x4e4f534a) {
        if (json || offset !== 12) throw new Error('GLB must begin with one JSON chunk.')
        json = JSON.parse(decode(buffer.slice(offset + 8, offset + 8 + length)).trim())
      } else if (type === 0x004e4942) {
        if (binary) throw new Error('Multiple GLB binary chunks are unsupported.')
        binary = buffer.slice(offset + 8, offset + 8 + length)
      }
      offset += 8 + length
    }
    if (!json) throw new Error('Missing GLB JSON chunk.')
  } else json = JSON.parse(decode(buffer).replace(/^\uFEFF/, ''))
  if (!/^2\./.test(json.asset?.version || '')) throw new Error('Only glTF 2 is supported.')
  const supported = ['KHR_lights_punctual', 'KHR_materials_unlit', 'KHR_materials_pbrSpecularGlossiness', 'KHR_texture_transform', 'KHR_mesh_quantization', 'KHR_materials_clearcoat', 'KHR_materials_transmission']
  for (const extension of json.extensionsRequired || []) if (!supported.includes(extension)) throw new Error(`Required glTF extension is unsupported: ${extension}. Export an uncompressed glTF 2 model.`)
  for (const extension of json.extensionsUsed || []) {
    if (['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'EXT_mesh_gpu_instancing'].includes(extension)) throw new Error(`glTF extension ${extension} requires a decoder or instance adapter not installed in this viewer.`)
    if (!supported.includes(extension)) warnOnce(warnings, `Optional glTF extension is not preserved: ${extension}.`)
  }
  const imageViews = new Set((json.images || []).map(image => image.bufferView).filter(index => index !== undefined))
  const requiredViews = new Set()
  for (const accessor of json.accessors || []) {
    for (const index of [accessor.bufferView, accessor.sparse?.indices?.bufferView, accessor.sparse?.values?.bufferView]) if (index !== undefined) requiredViews.add(index)
  }
  const imageBuffers = new Set(), requiredBuffers = new Set()
  ;(json.bufferViews || []).forEach((view, index) => {
    if (imageViews.has(index)) imageBuffers.add(view.buffer)
    if (!imageViews.has(index) || requiredViews.has(index)) requiredBuffers.add(view.buffer)
  })
  ;(json.buffers || []).forEach((item, index) => {
    if (!item.uri || /^data:/i.test(item.uri)) return
    try { resources.find(item.uri) } catch (error) {
      if (!imageBuffers.has(index) || requiredBuffers.has(index)) throw error
      warnOnce(warnings, error.message)
      // Only image data uses this buffer. Give the optional texture loader an
      // empty buffer to reject locally, without changing geometry dependencies.
      item.uri = 'data:application/octet-stream;base64,'
    }
  })
  for (const item of json.images || []) {
    if (item.uri && !/^data:/i.test(item.uri)) {
      try { resources.find(item.uri) } catch (error) { warnOnce(warnings, error.message) }
    }
  }
  if (json.animations?.length) warnOnce(warnings, 'Animations are imported as a static initial pose; animation playback is not preserved.')
  if (json.scenes?.length > 1) warnOnce(warnings, 'Only the default glTF scene is imported; alternate scenes are omitted.')
  if (!binary) return JSON.stringify(json)
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json)), padded = Math.ceil(jsonBytes.length / 4) * 4
  const output = new ArrayBuffer(12 + 8 + padded + 8 + binary.byteLength), view = new DataView(output)
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, output.byteLength, true)
  view.setUint32(12, padded, true); view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(output, 20, padded).fill(32); new Uint8Array(output, 20, jsonBytes.length).set(jsonBytes)
  view.setUint32(20 + padded, binary.byteLength, true); view.setUint32(24 + padded, 0x004e4942, true)
  new Uint8Array(output, 28 + padded).set(new Uint8Array(binary))
  return output
}

async function parse3MF (buffer, manager, warnings) {
  const { JSZip } = await import('three/examples/jsm/libs/jszip.module.min.js')
  const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader')
  const zip = new JSZip(buffer), models = Object.keys(zip.files).filter(path => /^3D\/.*\.model$/i.test(path))
  if (models.length !== 1) throw new Error('3MF supports one core model part; multi-part production models are unsupported.')
  const xml = xmlDocument(zip.file(models[0]).asText(), 'model'), model = xml.documentElement
  if (model.getAttribute('requiredextensions')) throw new Error('3MF required extensions are unsupported; export a core 3MF model.')
  const resources = model.querySelector('resources'), build = model.querySelector('build')
  if (!resources || !build) throw new Error('3MF is missing resources or build items.')
  const objects = new Map([...resources.querySelectorAll('object')].map(node => [node.getAttribute('id'), node]))
  const visit = (id, active = new Set(), depth = 0) => {
    if (active.has(id) || depth > 256) throw new Error('Cyclic or excessively nested 3MF components.')
    const object = objects.get(id)
    if (!object) throw new Error(`Missing 3MF object ${id}.`)
    active.add(id)
    object.querySelectorAll('component').forEach(component => {
      if ([...component.attributes].some(attribute => attribute.localName === 'path')) throw new Error('External 3MF components are unsupported.')
      visit(component.getAttribute('objectid'), active, depth + 1)
    })
    active.delete(id)
  }
  objects.forEach((_, id) => visit(id))
  // r120 reuses a mutable object for build items, losing repeated instances.
  // A synthetic core component assembly uses its existing clone-per-component path.
  let nextId = 1
  objects.forEach((_, id) => { nextId = Math.max(nextId, Number(id) + 1) })
  const wrapper = xml.createElementNS(model.namespaceURI, 'object'), components = xml.createElementNS(model.namespaceURI, 'components')
  wrapper.setAttribute('id', String(nextId)); wrapper.setAttribute('type', 'model'); wrapper.setAttribute('name', 'Build')
  wrapper.appendChild(components)
  for (const item of [...build.querySelectorAll('item')]) {
    if (item.getAttribute('printable') === '0' || item.getAttribute('printable') === 'false') continue
    if ([...item.attributes].some(attribute => attribute.localName === 'path')) throw new Error('External 3MF build items are unsupported.')
    visit(item.getAttribute('objectid'))
    const component = xml.createElementNS(model.namespaceURI, 'component')
    component.setAttribute('objectid', item.getAttribute('objectid'))
    if (item.hasAttribute('transform')) component.setAttribute('transform', item.getAttribute('transform'))
    components.appendChild(component)
  }
  resources.appendChild(wrapper)
  while (build.firstChild) build.removeChild(build.firstChild)
  const item = xml.createElementNS(model.namespaceURI, 'item'); item.setAttribute('objectid', String(nextId)); build.appendChild(item)
  zip.file(models[0], new XMLSerializer().serializeToString(xml))
  const unit = model.getAttribute('unit') || 'millimeter'
  const scale = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }[unit]
  if (!scale) throw new Error(`Unsupported 3MF unit: ${unit}`)
  const root = new ThreeMFLoader(manager).parse(zip.generate({ type: 'arraybuffer' }))
  root.scale.multiplyScalar(scale)
  warnings.push('3MF coordinates are converted to millimeters; manufacturing metadata is not preserved.')
  return root
}

async function parseOnMainThread (buffer, format, resources, warnings) {
  const manager = resources.manager
  if (format === 'gltf' || format === 'glb') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader')
    const data = prepareGLTF(buffer, format, resources, warnings)
    const loader = new GLTFLoader(manager)
    loader.register(parser => {
      parser.textureLoader = resources.textureLoader
      const assignTexture = parser.assignTexture.bind(parser)
      parser.assignTexture = async (parameters, slot, definition) => {
        await assignTexture(parameters, slot, definition)
        // Preserve source UV selection even where r120's shader only supports
        // uv0 (most maps) / uv1 (AO and light maps).
        const channel = definition.extensions?.KHR_texture_transform?.texCoord ?? definition.texCoord ?? 0
        const sourceTexture = parameters[slot]
        const texture = sourceTexture.userData?.sceneFileTexCoord !== undefined && sourceTexture.userData.sceneFileTexCoord !== channel ? sourceTexture.clone() : sourceTexture
        texture.userData = { ...sourceTexture.userData, sceneFileTexCoord: channel }
        parameters[slot] = texture
        if (channel !== (slot === 'aoMap' ? 1 : 0) && !(slot === 'aoMap' && channel === 0)) warnOnce(warnings, `Texture ${slot} uses UV set ${channel}; retained in the packet, but this Three.js renderer only supports its default UV set.`)
      }
      return {
        name: 'PANDAUI_optional_textures',
        async loadTexture (index) {
          try { return await parser.loadTexture(index) } catch (error) {
            warnOnce(warnings, `Optional texture ${index} could not be decoded (${error.message || 'invalid image'}); using material values.`)
            return new Texture()
          }
        }
      }
    })
    const result = await new Promise((resolve, reject) => loader.parse(data, '', resolve, reject))
    result.scene.traverse(object => {
      const association = result.parser.associations.get(object)
      if (association?.type !== 'nodes') return
      const node = result.parser.json.nodes[association.index], mesh = result.parser.json.meshes?.[node.mesh]
      if (!mesh || mesh.primitives.length < 2) return
      const hasPrimitives = group => group.children.slice(0, mesh.primitives.length).length === mesh.primitives.length && group.children.slice(0, mesh.primitives.length).every(child => child.geometry && !result.parser.associations.has(child))
      const group = hasPrimitives(object) ? object : object.children.find(hasPrimitives)
      group?.children.slice(0, mesh.primitives.length).forEach(child => { child.userData.sceneFileLogicalNode = association.index })
    })
    // Alternate scene objects can share buffers/materials; dispose all once the
    // selected scene has been serialized, without putting extras in the packet.
    return { root: result.scene, extraRoots: result.scenes.filter(scene => scene !== result.scene) }
  }
  if (format === 'fbx') {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader')
    warnings.push('FBX imports a static pose in loader coordinates; source unit and axis conventions are not normalized.')
    return { root: new FBXLoader(manager).parse(buffer, '') }
  }
  if (format === '3ds') {
    const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader')
    warnings.push('3DS imports static mesh geometry; keyframe animation and animation hierarchy are not preserved.')
    return { root: new TDSLoader(manager).parse(buffer, '') }
  }
  if (format === 'dae') {
    const text = decode(buffer), xml = xmlDocument(text, 'COLLADA')
    xml.querySelectorAll('[url]').forEach(node => { const url = node.getAttribute('url'); if (url && !url.startsWith('#')) throw new Error(`External COLLADA document references are unsupported: ${url}`) })
    const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader')
    const result = new ColladaLoader(manager).parse(text, '')
    if (result.animations?.length) warnOnce(warnings, 'Animations are imported as a static initial pose; animation playback is not preserved.')
    warnings.push('COLLADA units and up-axis are converted by the loader to meters and Y-up.')
    return { root: result.scene }
  }
  if (format === '3mf') return { root: await parse3MF(buffer, manager, warnings) }
  if (format === 'amf') {
    if (new Uint8Array(buffer)[0] === 0x50 && new Uint8Array(buffer)[1] === 0x4b) {
      const { JSZip } = await import('three/examples/jsm/libs/jszip.module.min.js')
      const zip = new JSZip(buffer), paths = Object.keys(zip.files).filter(path => /\.amf$/i.test(path))
      if (paths.length !== 1) throw new Error('AMF archive must contain exactly one .amf document.')
      buffer = zip.file(paths[0]).asArrayBuffer()
    }
    const xml = xmlDocument(decode(buffer), 'amf')
    if (xml.querySelector('constellation, edge, texmap, texture')) throw new Error('AMF constellations, curved edges, and textured geometry are unsupported; export plain triangle objects.')
    const unit = xml.documentElement.getAttribute('unit') || 'millimeter'
    if (!['millimeter', 'inch', 'feet', 'meter', 'micron'].includes(unit)) throw new Error(`Unsupported AMF unit: ${unit}`)
    const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader')
    warnings.push('AMF coordinates are converted to millimeters; manufacturing metadata is not preserved.')
    return { root: new AMFLoader(manager).parse(buffer) }
  }
  if (format === 'vtp') {
    let text = decode(buffer)
    const xml = xmlDocument(text, 'VTKFile')
    if (xml.documentElement.getAttribute('type') !== 'PolyData' || xml.querySelectorAll('Piece').length !== 1) throw new Error('VTP requires a single PolyData Piece.')
    if (xml.querySelector('AppendedData')) throw new Error('Appended VTP data is unsupported; export ASCII or inline binary PolyData.')
    const piece = xml.querySelector('Piece')
    if (Number(piece.getAttribute('NumberOfLines')) || Number(piece.getAttribute('NumberOfVerts'))) throw new Error('VTP line/vertex cells are unsupported; export polygon-only PolyData.')
    if (!text.trimStart().startsWith('<?xml')) text = '<?xml version="1.0"?>\n' + text
    const { parseSceneFileVTK } = await import('./SceneFileNumeric')
    warnings.push('VTP imports polygon/triangle-strip surfaces; scientific scalar fields are not preserved.')
    return { root: parseSceneFileVTK(new TextEncoder().encode(text).buffer) }
  }
  if (format === 'wrl' || format === 'vrml') {
    const text = decode(buffer)
    if (!/^#VRML V2\.0 utf8/.test(text)) throw new Error('Only VRML 2.0 UTF-8 scenes are supported.')
    if (/\bInline\s*\{/.test(text)) throw new Error('VRML Inline external scenes are unsupported; flatten the scene before importing.')
    const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader')
    warnings.push('VRML imports static geometry; routes, animation, and interactive behavior are not preserved.')
    return { root: new VRMLLoader(manager).parse(text, '') }
  }
  throw new Error(`Unsupported scene format: ${format}`)
}

/**
 * Returns {format,layers:[{id,name,path}],records:[{displayObject}],warnings}.
 * Colors are 0..1 RGB. Matrices are column-major world transforms. Lines are
 * indexed pairs. The caller owns packet arrays; no live Three objects escape.
 * Mesh records retain uv/uv2, tangents and material properties. textures maps
 * material slots to shared RGBA Uint8Array descriptors with sampler/UV state;
 * map/emissiveMap use sRGB, data maps use linear encoding. DOM images are
 * converted on the main thread before loader resources are disposed.
 * Numeric formats run in a dedicated terminable worker when Worker is available.
 * DOM loaders yield before parsing, but their synchronous parse is not preemptible.
 */
export async function openSceneFile (file, { files = [], signal, onProgress } = {}) {
  checkSceneFileAbort(signal)
  const format = (file?.name || '').split('.').pop().toLowerCase()
  if (!SCENE_FILE_FORMATS.includes(format)) throw new Error(`Unsupported scene file format: ${format || '(none)'}`)
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Expected a File or Blob with a filename.')
  const progress = (phase, loaded, total) => onProgress?.({ phase, loaded, total, format })
  progress('reading', 0, file.size || 0)
  const buffer = await withSceneFileAbort(file.arrayBuffer(), signal)
  checkSceneFileAbort(signal)
  if (!buffer.byteLength) throw new Error('The scene file is empty.')
  progress('parsing', buffer.byteLength, buffer.byteLength)
  if (workerFormats.includes(format)) {
    let packet
    if (typeof Worker !== 'undefined') {
      const { parseSceneFileInWorker } = await import('./SceneFileWorkerClient')
      packet = await parseSceneFileInWorker(buffer, { format, name: file.name, signal })
    } else {
      const { parseSceneFileNumeric } = await import('./SceneFileNumeric')
      packet = parseSceneFileNumeric(buffer, { format, name: file.name, signal })
    }
    checkSceneFileAbort(signal)
    progress('complete', packet.records.length, packet.records.length)
    return packet
  }
  const warnings = [], resources = createSceneFileResources(file, files, warnings)
  // The cleanup belongs to the parse task so aborts cannot revoke resources
  // still in use by an async loader or leak a scene that arrives after abort.
  const task = (async () => {
    let parsed
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      checkSceneFileAbort(signal)
      parsed = await parseOnMainThread(buffer, format, resources, warnings)
      await resources.wait()
      checkSceneFileAbort(signal)
      return sceneFileRecords(parsed.root, { format, name: file.name, warnings, signal })
    } finally {
      disposeSceneFileObject(parsed?.root)
      parsed?.extraRoots?.forEach(disposeSceneFileObject)
      resources.dispose()
    }
  })()
  const packet = await withSceneFileAbort(task, signal)
  progress('complete', packet.records.length, packet.records.length)
  return packet
}

export default openSceneFile
