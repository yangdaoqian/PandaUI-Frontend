const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

// Exercise the real document, ports, serialization, scheduler and widgets.
// Only browser messaging and the file picker are simulated.
const listeners = new Map()
const messages = []
const origin = 'https://pandaui.test'
const context = {
  console, AbortController, setTimeout, clearTimeout,
  location: { origin },
  parent: { postMessage (message, targetOrigin) {
    assert.strictEqual(targetOrigin, origin)
    messages.push(JSON.parse(JSON.stringify(message)))
  } },
  addEventListener (type, handler) {
    if (!listeners.has(type)) listeners.set(type, [])
    listeners.get(type).push(handler)
  }
}
context.window = context
context.globalThis = context
vm.createContext(context)
require('./editor-test-kernel')(context)
for (const file of ['src/Kernel/Data/Path.js', 'src/Kernel/Data/Goo.js', 'src/Kernel/Data/DataTree.js', 'src/PandaUI/Runtime.js', 'src/PandaUI/Nodes/InterfaceNodes.js', 'shared/MaterialSchema.js', 'shared/SceneReferences.js', 'plugins/Render_Nodes.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/editor', file), 'utf8'), context, { filename: file })
}
const { PandaUI, PandaUIKernel } = context
const plain = value => JSON.parse(JSON.stringify(value))
const configs = () => messages.filter(message => message.type === 'pandaui-render-config')
const emit = (type, event = {}) => (listeners.get(type) || []).forEach(handler => handler(event))
const reply = (data, overrides) => emit('message', Object.assign({ data, source: context.parent, origin }, overrides))
const createGraph = () => { const graph = new PandaUI.GraphDocument(); graph.stepMode = false; return graph }
const add = (graph, type) => graph.add(PandaUI.createNode('render/' + type))
const setInput = (node, name, value) => { node.inputs[node.findInputSlot(name)].data = value }
const connect = (graph, source, target, name, append = false) => graph.connect(source, 0, target, target.findInputSlot(name), { append })
const execute = node => { node.onExecute(); return plain(node.getOutputData(0)) }

async function main () {
  const types = Object.keys(PandaUI.nodeTypes).filter(type => type.startsWith('render/'))
  assert.strictEqual(types.length, 12)
  const index = fs.readFileSync(path.join(__dirname, '../public/editor/index.html'), 'utf8')
  assert.strictEqual((index.match(/plugins\/Render_Nodes\.js/g) || []).length, 1)
  assert(index.indexOf('plugins/Render_Nodes.js') > index.indexOf('src/PandaUI/Runtime.js'))
  const graph = createGraph()
  assert.strictEqual(graph._nodes.length, 0, 'no hidden default nodes')
  const environment = add(graph, 'environment')
  const texture = add(graph, 'texture')
  const material = add(graph, 'pbr_material')
  const assignment = add(graph, 'material_assignment')
  const secondAssignment = add(graph, 'material_assignment')
  const camera = add(graph, 'camera')
  const quality = add(graph, 'quality')
  const effects = add(graph, 'effects')
  const lights = ['sun', 'point', 'spot', 'area'].map(type => add(graph, type + '_light'))
  const embedded = 'data:image/png;base64,aGVsbG8='
  texture.setProperty('url', embedded)
  material.setProperty('roughness', 0.27)
  assignment.setProperty('targets', ['object-uuid-1', 'object-uuid-2'])
  secondAssignment.setProperty('targets', ['object-uuid-3'])
  connect(graph, texture, material, 'Color texture')
  connect(graph, material, assignment, 'Material')
  connect(graph, material, secondAssignment, 'Material')
  await graph.solveAll()
  assert.strictEqual(messages.filter(message => /^pandaui-render-/.test(message.type)).length, 0, 'descriptor nodes never publish render messages on execution')
  const output = add(graph, 'output')
  connect(graph, environment, output, 'Environment')
  lights.forEach(light => connect(graph, light, output, 'Lights', true))
  ;[assignment, secondAssignment].forEach(node => connect(graph, node, output, 'Bindings', true))
  connect(graph, camera, output, 'Camera')
  connect(graph, quality, output, 'Quality')
  connect(graph, effects, output, 'Effects')
  await graph.solveAll()
  assert.strictEqual(configs().length, 1, 'one atomic message after graph execution')
  const initial = configs()[0]
  assert.strictEqual(initial.nodeId, String(output.id))
  assert.deepStrictEqual(Object.keys(initial).sort(), ['descriptor', 'nodeId', 'type'])
  const config = initial.descriptor
  assert.strictEqual(config.kind, 'render.config')
  assert.strictEqual(config.enabled, true)
  assert.strictEqual(config.mode, 'raster')
  assert.deepStrictEqual(config.lights.map(light => light.type), ['sun', 'point', 'spot', 'area'])
  assert.deepStrictEqual(config.lights.map(light => light.id), lights.map(light => String(light.id)))
  assert.deepStrictEqual(Object.keys(config.lights[0]).sort(), ['kind', 'id', 'type', 'color', 'intensity', 'position', 'target', 'castShadow', 'angle', 'width', 'height', 'shadowResolution', 'shadowBias', 'shadowNormalBias', 'shadowRadius', 'shadowExtent', 'shadowAutoFocus', 'studioRole'].sort())
  assert.strictEqual(config.bindings.length, 2)
  assert.deepStrictEqual(config.bindings[0].targets, ['object-uuid-1', 'object-uuid-2'])
  assert.strictEqual(config.bindings[0].material.roughness, 0.27)
  assert.strictEqual(config.bindings[0].material.textures.color.url, embedded)
  assert.deepStrictEqual(config.quality, { kind: 'render.quality', resolutionScale: 1, interactionScale: 0.6, samples: 128, bounces: 4, rasterSamples: 8, denoise: true, denoiseStrength: 0.5 })
  assert.deepStrictEqual(config.effects, { kind: 'render.effects', exposure: 1, ao: 0, bloom: 0, fxaa: true, showEdges: false, showCurves: true, shadows: true, aoRadius: 0.02, bloomThreshold: 1, bloomRadius: 0.4, ground: false, groundAutoHeight: true, groundHeight: 0, groundSize: 4, groundColor: '#383c43', groundRoughness: 0.25, groundDistanceBlur: 1, groundBlurDistance: 4, groundReflection: 0.7, reflectionResolution: 512 })
  assert.strictEqual(config.camera.projection, 'perspective')
  assert.strictEqual(config.camera.orthographicHeight, 40)
  await graph.solveAll()
  assert.strictEqual(configs().length, 1, 'same values dedupe across newly allocated descriptors')
  const exportOnlyPatch = plain(output.serialize())
  exportOnlyPatch.properties.width = 2048
  output.onConfigure(exportOnlyPatch)
  output.onExecute()
  assert.strictEqual(configs().length, 1, 'export-only property patches preserve config dedupe')
  material.setProperty('roughness', 0.8)
  await graph.flushDirty()
  assert.strictEqual(configs().length, 2)
  assert.strictEqual(configs()[1].descriptor.bindings[1].material.roughness, 0.8)
  output.setProperty('mode', 'pathtrace')
  await graph.flushDirty()
  assert.strictEqual(configs().at(-1).descriptor.mode, 'pathtrace')
  output.setProperty('enabled', false)
  await graph.flushDirty()
  assert.strictEqual(configs().at(-1).descriptor.enabled, false)
  output.setProperty('enabled', true)
  await graph.flushDirty()

  // Persist descriptors, embedded textures, stable IDs and all append links.
  // Direct property edits must not be overwritten by stale serialized widgets.
  environment.properties.intensity = 2.5
  camera.properties.position = [4, 5, 6]
  camera.properties.projection = 'orthographic'
  camera.properties.orthographicHeight = 24
  effects.properties.fxaa = false
  const saved = plain(graph.serialize())
  const restored = createGraph()
  const beforeRestore = configs().length
  restored.configure(saved)
  assert.strictEqual(configs().length, beforeRestore, 'restore does not publish an incomplete config before links exist')
  await restored.solveAll()
  assert.strictEqual(configs().length, beforeRestore + 1)
  const restoredOutput = restored.getNodeById(output.id)
  const restoredConfig = execute(restoredOutput)
  assert.strictEqual(restoredConfig.environment.intensity, 2.5)
  assert.deepStrictEqual(restoredConfig.camera.position, [4, 5, 6])
  assert.strictEqual(restoredConfig.camera.projection, 'orthographic')
  assert.strictEqual(restoredConfig.camera.orthographicHeight, 24)
  assert.strictEqual(restoredConfig.effects.fxaa, false)
  assert.strictEqual(restoredConfig.bindings[0].material.textures.color.url, embedded)
  assert.strictEqual(restoredOutput.getInputLinks(1).length, 4)
  assert.strictEqual(restoredOutput.getInputLinks(2).length, 2)
  restored.clear()
  assert.strictEqual(configs().at(-1).descriptor, null)

  // All node properties and widgets survive independent serialization.
  for (const type of types) {
    const node = PandaUI.createNode(type)
    const copy = PandaUI.createNode(type)
    const data = plain(node.serialize())
    copy.configure(data)
    assert.deepStrictEqual(plain(copy.properties), data.properties, type)
    assert.strictEqual(copy.inputs.length, node.inputs.length, type)
    assert.strictEqual(copy.outputs.length, node.outputs.length, type)
    assert(copy.widgets.every(widget => /^[\x20-\x7e]+$/.test(widget.name)), type + ': English labels')
  }

  // New camera/effects controls preserve defaults on old graphs and support
  // typed/tree input overrides without modifying the saved widget properties.
  const cameraProbe = PandaUI.createNode('render/camera')
  const effectsProbe = PandaUI.createNode('render/effects')
  const qualityProbe = PandaUI.createNode('render/quality')
  assert.deepStrictEqual(plain(cameraProbe.widgets.find(widget => widget.property === 'projection').options.values), ['perspective', 'orthographic'])
  assert.strictEqual(cameraProbe.widgets.find(widget => widget.property === 'orthographicHeight').type, 'number')
  assert.strictEqual(effectsProbe.widgets.find(widget => widget.property === 'fxaa').type, 'toggle')
  assert.strictEqual(qualityProbe.widgets.find(widget => widget.property === 'bounces').options.max, 16)
  assert.strictEqual(effectsProbe.widgets.find(widget => widget.property === 'bloom').options.max, 4)
  for (const [node, newFields] of [[cameraProbe, ['projection', 'orthographicHeight']], [effectsProbe, ['fxaa', 'showEdges', 'showCurves', 'shadows', 'aoRadius', 'bloomThreshold', 'bloomRadius', 'ground', 'groundAutoHeight', 'groundHeight', 'groundSize', 'groundColor', 'groundRoughness', 'groundReflection', 'reflectionResolution', 'groundDistanceBlur', 'groundBlurDistance']]]) {
    const legacy = plain(node.serialize())
    legacy.inputs = legacy.inputs.slice(0, 3)
    legacy.widgets = legacy.widgets.filter(widget => !newFields.includes(widget.property))
    newFields.forEach(key => { delete legacy.properties[key] })
    node.configure(legacy)
    assert.deepStrictEqual(plain(node.inputs.slice(0, 3).map(port => port.name)), legacy.inputs.map(port => port.name))
    assert.strictEqual(node.inputs.length, 3 + newFields.length, 'legacy graphs gain new ports without reindexing existing links')
  }
  assert.strictEqual(execute(cameraProbe).projection, 'perspective')
  assert.strictEqual(execute(cameraProbe).orthographicHeight, 40)
  assert.strictEqual(execute(effectsProbe).fxaa, true)
  assert.strictEqual(execute(effectsProbe).showEdges, false)
  setInput(effectsProbe, 'Show edges', true)
  setInput(effectsProbe, 'Shadows', false)
  assert.strictEqual(execute(effectsProbe).showEdges, true)
  assert.strictEqual(execute(effectsProbe).shadows, false)
  setInput(effectsProbe, 'Studio floor', true)
  setInput(effectsProbe, 'Reflection resolution', 1024)
  assert.strictEqual(execute(effectsProbe).ground, true)
  assert.strictEqual(execute(effectsProbe).reflectionResolution, 1024)
  const envProbe = PandaUI.createNode('render/environment')
  setInput(envProbe, 'Preset', 'automotive'); setInput(envProbe, 'Studio rotation (degrees)', 45)
  assert.strictEqual(execute(envProbe).preset, 'automotive')
  assert.strictEqual(execute(envProbe).studioRotation, 45)
  const sunProbe = PandaUI.createNode('render/sun_light')
  setInput(sunProbe, 'Shadow resolution', 4096)
  setInput(sunProbe, 'Normal bias (-1 = auto)', 2.5)
  setInput(sunProbe, 'Shadow extent (0 = auto)', 6000)
  assert.strictEqual(execute(sunProbe).shadowResolution, 4096)
  assert.strictEqual(execute(sunProbe).shadowNormalBias, 2.5)
  assert.strictEqual(execute(sunProbe).shadowExtent, 6000)
  setInput(cameraProbe, 'Projection', { path0: ['{0}', ['orthographic']] })
  setInput(cameraProbe, 'Orthographic height', { kind: 'structRef', data: 75 })
  setInput(effectsProbe, 'FXAA', { path0: ['{0}', [false]] })
  assert.strictEqual(execute(cameraProbe).projection, 'orthographic')
  assert.strictEqual(execute(cameraProbe).orthographicHeight, 75)
  assert.strictEqual(execute(effectsProbe).fxaa, false)
  assert.strictEqual(cameraProbe.properties.projection, 'perspective')
  assert.strictEqual(cameraProbe.properties.orthographicHeight, 40)
  assert.strictEqual(effectsProbe.properties.fxaa, true)
  setInput(cameraProbe, 'Projection', 'invalid')
  setInput(cameraProbe, 'Orthographic height', -1)
  setInput(effectsProbe, 'FXAA', 'false')
  assert.strictEqual(execute(cameraProbe).projection, 'perspective')
  assert.strictEqual(execute(cameraProbe).orthographicHeight, 0.00001)
  assert.strictEqual(execute(effectsProbe).fxaa, true, 'FXAA accepts booleans, not truthy strings')
  setInput(cameraProbe, 'Orthographic height', Infinity)
  assert.strictEqual(execute(cameraProbe).orthographicHeight, 40)
  setInput(cameraProbe, 'Projection', undefined)
  setInput(cameraProbe, 'Orthographic height', undefined)
  setInput(effectsProbe, 'FXAA', undefined)
  assert.strictEqual(execute(cameraProbe).orthographicHeight, 40)
  assert.strictEqual(execute(effectsProbe).fxaa, true)
  qualityProbe.properties.bounces = 64
  effectsProbe.properties.bloom = 10
  assert.strictEqual(execute(qualityProbe).bounces, 16)
  assert.strictEqual(execute(effectsProbe).bloom, 4)
  const boundaryOutput = PandaUI.createNode('render/output')
  setInput(boundaryOutput, 'Quality', { kind: 'render.quality', bounces: 64 })
  setInput(boundaryOutput, 'Effects', { kind: 'render.effects', bloom: 10, fxaa: false })
  setInput(boundaryOutput, 'Camera', { kind: 'render.camera', projection: 'orthographic', orthographicHeight: 80 })
  const boundaryConfig = execute(boundaryOutput)
  assert.strictEqual(boundaryConfig.quality.bounces, 16)
  assert.strictEqual(boundaryConfig.effects.bloom, 4)
  assert.strictEqual(boundaryConfig.effects.fxaa, false)
  assert.strictEqual(boundaryConfig.camera.projection, 'orthographic')
  assert.strictEqual(boundaryConfig.camera.orthographicHeight, 80)

  // Nested array, wire, legacy, native DataTree, dual and paramRef inputs.
  const standalone = PandaUI.createNode('render/output')
  const lightA = execute(lights[0])
  const lightB = execute(lights[1])
  const wire = { path9: ['{9}', [[lightB]]], path0: ['{0}', [lightA]] }
  const tree = new PandaUIKernel.DataTree().add('{0}', lightA).add('{1}', [lightB])
  for (const data of [
    [[lightA], [[lightB]]], wire, { path: ['{0}', '{1}'], datas: [lightA, lightB] }, tree,
    { _isDualData: true, display: { treeData: wire } }, { _isDualData: true, raw: wire },
    { kind: 'paramRef', dataTreeSummary: wire }, { dataTree: wire }, { kind: 'structRef', data: wire }
  ]) {
    setInput(standalone, 'Lights', data)
    assert.deepStrictEqual(execute(standalone).lights.map(light => light.id), [lightA.id, lightB.id])
  }
  setInput(standalone, 'Lights', [lightA, lightA, lightB])
  assert.strictEqual(execute(standalone).lights.length, 2, 'stable light IDs deduplicate repeated branches')
  setInput(standalone, 'Bindings', { path0: ['{0}', [[execute(assignment)], execute(secondAssignment)]] })
  assert.strictEqual(execute(standalone).bindings.length, 2)

  // Numeric inputs use existing number/slider ports, never mutate saved values.
  const numeric = graph.add(PandaUI.createNode('widget/number'))
  numeric.properties.value = 0.35
  connect(graph, numeric, material, 'Roughness')
  await graph.solveAll()
  assert.strictEqual(execute(material).roughness, 0.35)
  assert.strictEqual(material.properties.roughness, 0.8)
  material.disconnectInput(material.findInputSlot('Roughness'))
  assert.strictEqual(execute(material).roughness, 0.8)
  setInput(material, 'Roughness', { path0: ['{0}', [{ kind: 'structRef', data: 0.42 }]] })
  assert.strictEqual(execute(material).roughness, 0.42)
  setInput(camera, 'Position', { path0: ['{0}', [[7, 8, 9]]] })
  assert.deepStrictEqual(execute(camera).position, [7, 8, 9])
  setInput(camera, 'Target', { kind: 'structRef', data: { X: 1, Y: 2, Z: 3 } })
  assert.deepStrictEqual(execute(camera).target, [1, 2, 3])
  const xWidget = camera.widgets.find(widget => widget.name === 'Position X')
  xWidget.callback(12)
  assert.deepStrictEqual(plain(camera.properties.position), [12, 5, 6])

  // Parameter Geometry replaces the bespoke selection capture UI.
  assert(!assignment.widgets.some(widget => /Pick selected/.test(widget.name)))
  setInput(assignment, 'Targets', { path0: ['{0}', [
    { sceneObject: { documentId: 'doc', objectId: 'stable-A', name: 'A' } },
    { kind: 'geometryRef', documentId: 'doc', geometryId: 'stable-B' },
    { geometryRef: { documentId: 'doc', geometryId: 'stable-A' } }
  ]] })
  assert.deepStrictEqual(execute(assignment).targets, ['stable-A', 'stable-B'])
  assert.deepStrictEqual(plain(assignment.properties.targets), ['object-uuid-1', 'object-uuid-2'])
  setInput(assignment, 'Targets', [])
  assert.strictEqual(execute(assignment), null)

  // Export must publish current upstream properties before the export request.
  effects.setProperty('exposure', 3)
  Object.assign(output.properties, { width: 800, height: 600, filename: 'test.png', samples: 256 })
  const exportId = await output.exportImage()
  const exportMessage = messages.at(-1)
  assert.deepStrictEqual(exportMessage, { type: 'pandaui-render-export', nodeId: String(output.id), requestId: exportId, width: 800, height: 600, filename: 'test.png', samples: 256 })
  assert.strictEqual(configs().at(-1).descriptor.effects.exposure, 3)
  const statusMessage = { type: 'pandaui-render-status', nodeId: String(output.id), state: 'rendering', error: '', message: 'Accumulating', samples: 12, backend: 'pathtrace' }
  reply(statusMessage, { origin: 'https://other.test' })
  assert.strictEqual(output.renderStatus, undefined)
  reply(statusMessage)
  assert.deepStrictEqual(plain(output.renderStatus), { state: 'rendering', error: '', message: 'Accumulating', samples: 12, backend: 'pathtrace' })
  assert(output._statusWidget.value.includes('12 samples'))
  reply(Object.assign({}, statusMessage, { state: 'error', error: 'Backend unavailable' }))
  assert(output._statusWidget.value.includes('Backend unavailable'))
  assert(!JSON.stringify(output.serialize()).includes('Backend unavailable'), 'transient status is not persisted')

  // Invalid data is bounded and normalized before the bridge, never JSON NaN,
  // cycles, executable URLs, arbitrary extra keys or unstable target objects.
  const cycle = []; cycle.push(cycle)
  setInput(standalone, 'Lights', [cycle, { kind: 'render.light', type: 'point', id: 3 }, { kind: 'render.light', type: 'unknown', id: 'x' }, { ...lightA, intensity: Infinity, position: [NaN, 2, 3], engine: cycle }])
  setInput(standalone, 'Bindings', [{ kind: 'render.binding', targets: [{ name: 'not-an-id' }], material: config.bindings[0].material }, cycle])
  setInput(standalone, 'Environment', { kind: 'render.environment', preset: 'invalid', url: 'javascript:alert(1)', intensity: NaN, topColor: 'invalid', background: 'false' })
  setInput(standalone, 'Quality', { kind: 'render.quality', samples: -2, bounces: Infinity, resolutionScale: 999, interactionScale: null })
  setInput(standalone, 'Effects', { kind: 'render.effects', exposure: 'NaN', ao: -3, bloom: 999 })
  const invalid = execute(standalone)
  assert.strictEqual(invalid.lights.length, 1)
  assert.strictEqual(invalid.lights[0].intensity, 1)
  assert.deepStrictEqual(invalid.lights[0].position, [10, 2, 3])
  assert.strictEqual(invalid.bindings.length, 0)
  assert.strictEqual(invalid.environment.url, '')
  assert.strictEqual(invalid.environment.preset, 'studio')
  assert.deepStrictEqual(invalid.quality, { kind: 'render.quality', resolutionScale: 2, interactionScale: 0.6, samples: 1, bounces: 4, rasterSamples: 8, denoise: true, denoiseStrength: 0.5 })
  assert.deepStrictEqual(invalid.effects, { ...config.effects, bloom: 4 })
  assert.strictEqual(invalid.camera, null)
  assert(!JSON.stringify(invalid).includes('engine'))
  Object.assign(output.properties, { width: -1, height: Infinity, samples: NaN, filename: '../bad.png' })
  await output.exportImage()
  assert.strictEqual(messages.at(-1).width, 1)
  assert.strictEqual(messages.at(-1).height, 1080)
  assert.strictEqual(messages.at(-1).samples, 128)
  assert.strictEqual(messages.at(-1).filename, '.._bad.png')
  setInput(output, 'Export width', { path0: ['{0}', [1024]] })
  setInput(output, 'Export height', 768)
  setInput(output, 'Export samples', 512)
  await output.exportImage()
  assert.strictEqual(messages.at(-1).width, 1024)
  assert.strictEqual(messages.at(-1).height, 768)
  assert.strictEqual(messages.at(-1).samples, 512)
  assert.strictEqual(output.properties.width, -1, 'export input preserves saved property')

  // Embedded file picker updates a serializable property through the real node.
  let picker
  let reader
  context.document = { createElement (tag) {
    if (tag === 'canvas') return {}
    picker = { click () { this.clicked = true } }; return picker
  } }
  context.FileReader = class {
    constructor () { reader = this }
    readAsDataURL (file) { this.file = file }
    abort () { this.aborted = true }
  }
  texture.pickImage()
  assert(picker.accept.includes('image/png'))
  assert.strictEqual(picker.clicked, true)
  picker.files = [{ type: 'image/png' }]
  picker.onchange()
  reader.result = embedded + 'new'
  reader.onload()
  assert.strictEqual(texture.properties.url, embedded + 'new')
  texture.pickImage()
  picker.files = [{ type: 'text/html' }]; picker.onchange()
  assert.strictEqual(texture._statusWidget.value, 'Choose an image file')
  texture.pickImage()
  picker.files = [{ type: 'image/png' }]; picker.onchange()
  graph.remove(texture)
  assert.strictEqual(reader.aborted, true)
  const textureUrl = texture.properties.url
  reader.result = 'data:image/png;base64,late'; reader.onload()
  assert.strictEqual(texture.properties.url, textureUrl, 'removed texture ignores a late file read')
  const pickerNode = add(graph, 'texture')
  pickerNode.pickImage()
  graph.remove(pickerNode)
  picker.files = [{ type: 'image/png' }]; picker.onchange()
  assert.strictEqual(pickerNode._reader, undefined, 'removed texture ignores an open file picker')
  const environmentPicker = add(graph, 'environment')
  environmentPicker.pickImage()
  assert.equal(picker.accept, '.hdr')
  picker.files = [{ name: 'studio.hdr', type: '' }]; picker.onchange()
  reader.result = 'data:application/octet-stream;base64,aGRy'; reader.onload()
  assert.equal(environmentPicker.properties.preset, 'hdri')
  assert.equal(execute(environmentPicker).url, reader.result)
  assert.equal(environmentPicker._fileWidget.value, 'studio.hdr')
  assert.equal(environmentPicker.widgets.some(widget => widget.name === 'URL'), false)
  assert.equal(environmentPicker.widgets.find(widget => widget.name === 'Top color').type, 'color')

  // Removal/clear/unload clear only output nodes; stale replies cannot revive IDs.
  graph.remove(assignment)
  await graph.solveAll()
  const beforeHide = configs().length
  emit('beforeunload')
  emit('pagehide')
  assert.strictEqual(configs().length, beforeHide + 1, 'unload/pagehide cleanup deduplicates')
  assert.strictEqual(configs().at(-1).descriptor, null)
  emit('pageshow', { persisted: true })
  await graph.flushDirty()
  assert(configs().at(-1).descriptor, 'back-forward cache restore republishes')
  const beforeRemove = configs().length
  graph.remove(output)
  assert.strictEqual(configs().length, beforeRemove + 1)
  assert.deepStrictEqual(configs().at(-1), { type: 'pandaui-render-config', nodeId: String(output.id), descriptor: null })
  const lastStatus = output._statusWidget.value
  reply(statusMessage)
  assert.strictEqual(output._statusWidget.value, lastStatus)
  await output.exportImage()
  assert.strictEqual(configs().length, beforeRemove + 1)
  graph.clear()
  const emptyCount = configs().length
  emit('pagehide')
  assert.strictEqual(configs().length, emptyCount)

  // The automatic scheduler must also restore a complete graph without a
  // manual solve call; an export awaiting a solution cannot outlive its node.
  const automatic = new PandaUI.GraphDocument()
  const beforeAutomatic = configs().length
  automatic.configure(saved)
  await automatic._flushPromise
  assert.strictEqual(configs().length, beforeAutomatic + 1)
  assert.strictEqual(configs().at(-1).descriptor.lights.length, 4)
  automatic.clear()
  await automatic._flushPromise
  const raceGraph = createGraph()
  const raceOutput = add(raceGraph, 'output')
  let finish
  raceGraph.solveAll = () => new Promise(resolve => { finish = resolve })
  const pendingExport = raceOutput.exportImage()
  raceGraph.remove(raceOutput)
  const beforeFinish = messages.length
  finish()
  await pendingExport
  assert.strictEqual(messages.length, beforeFinish, 'removed output cannot send a pending export')

  console.log('PASS: 12 render nodes; atomic protocol and dedupe; append links and DataTrees; graph restore; numeric overrides; selection correlation; export/status; embedded images; invalid inputs; removal/clear/unload cleanup')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
