const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = path.resolve(__dirname, '..')
const context = {
  console,
  AbortController,
  ArrayBuffer,
  Blob: typeof Blob === 'function' ? Blob : function BlobStub () {},
  Map,
  Set,
  Promise,
  JSON,
  Math,
  Number,
  String,
  Object,
  Array,
  Boolean,
  Date,
  Error,
  TypeError,
  Uint8Array,
  Float32Array,
  navigator: {},
  setTimeout,
  clearTimeout,
  addEventListener () {},
  dispatchEvent () {},
  location: { origin: 'http://localhost:9000' },
  parent: null
}
context.window = context
context.globalThis = context
context.parent = context
vm.createContext(context)
require('./editor-test-kernel')(context)

function load (file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  vm.runInContext(source, context, { filename: file })
}

load('public/editor/js/libs/gl-matrix-min.js')
load('public/editor/src/Kernel/Attributes/NodeAttributes.js')
load('public/editor/src/PandaUI/Runtime.js')
load('public/editor/src/PandaUI/GraphCanvas.js')
;[
  'BaseNodes.js',
  'LogicNodes.js',
  'EventNodes.js',
  'MathNodes.js',
  'Math3DNodes.js',
  'StringNodes.js',
  'InterfaceNodes.js',
  'InputNodes.js',
  'GeometryNodes.js',
  'NodeTypeDefaults.js'
].forEach((file) => load('public/editor/src/PandaUI/Nodes/' + file))
load('public/editor/src/PandaUI/NativeNodes.js')
load('public/editor/plugins/Kuka_Robot.js')

const { PandaUI } = context
assert(PandaUI)
assert.strictEqual(context['Lite' + 'Graph'], undefined)
assert.strictEqual(typeof PandaUI.NativeNode, 'function')
assert.strictEqual(typeof PandaUI.BackendNode, 'function')
assert(PandaUI.nodeTypes['widget/slider'])
assert(PandaUI.nodeTypes['geometry/get_curve'])
assert(Object.keys(PandaUI.nodeTypes).length >= 125)
Object.keys(PandaUI.nodeTypes).forEach((type) => {
  const node = PandaUI.createNode(type)
  assert(node instanceof PandaUI.NativeNode, `${type} must inherit NativeNode`)
})

function SourceNode () { this.addOutput('value', 'number') }
SourceNode.prototype.onExecute = function () { this.setOutputData(0, 5) }

function WideLabelNode () {
  this.addInput('KUKA|prc Commands', 'number')
  this.addOutput('Robot Geometry Transforms', 'number')
}
PandaUI.registerNode('test/wide-label', WideLabelNode)
  const wideLabelNode = PandaUI.createNode('test/wide-label')
  assert(wideLabelNode.size[0] >= 300, 'node width must reserve separate space for long input and output labels')
  const wideLabelMinimum = wideLabelNode.getPortLabelMinimumWidth()
  const resizeCanvas = Object.create(PandaUI.GraphCanvas.prototype)
  resizeCanvas.resizeNodeTo(wideLabelNode, 180, 80)
  assert.strictEqual(wideLabelNode.size[0], wideLabelMinimum, 'manual resizing must preserve the port-label minimum width')
  wideLabelNode.configure({ size: [180, 80], inputs: [{ name: 'KUKA|prc Commands', type: 'number' }], outputs: [{ name: 'Robot Geometry Transforms', type: 'number' }] })
assert(wideLabelNode.size[0] >= 300, 'restored nodes must not shrink below their port-label width')

function TargetNode () {
  this.addInput('value', 'number')
  this.addOutput('result', 'number')
}
TargetNode.prototype.onExecute = function () { this.setOutputData(0, this.getInputData(0) * 2) }

function AsyncBackendNode () { this.addOutput('value', 'number') }
AsyncBackendNode.pandauiDefinition = { executor: 'backend' }
AsyncBackendNode.prototype.onExecute = async function () {
  await Promise.resolve()
  this.setOutputData(0, 7)
}

function PreservedBackendStateNode () { this.addOutput('value', 'number') }
PreservedBackendStateNode.pandauiDefinition = { executor: 'backend' }
PreservedBackendStateNode.prototype.onExecute = async function () {
  this._runtimeMessages = { errors: [], warnings: [], remarks: [] }
  this._executionState = 'success'
  this.setOutputData(0, 11)
}

PandaUI.registerNode('tests/source', SourceNode)
PandaUI.registerNode('tests/target', TargetNode)
PandaUI.registerNode('tests/backend', AsyncBackendNode)
PandaUI.registerNode('tests/preserved-backend-state', PreservedBackendStateNode)

async function run () {
  const graph = new PandaUI.GraphDocument()
  graph.setStepMode(false)
  const source = graph.add(PandaUI.createNode('tests/source'))
  const target = graph.add(PandaUI.createNode('tests/target'))
  const backend = graph.add(PandaUI.createNode('tests/backend'))
  const preservedBackend = graph.add(PandaUI.createNode('tests/preserved-backend-state'))
  graph.connect(source, 0, target, 0)
  await graph.solveAll()

  assert.strictEqual(target.getOutputData(0), 10)
  assert.strictEqual(backend.getOutputData(0), 7)
  assert.strictEqual(backend.nodeKind, 'backend')
  assert.strictEqual(preservedBackend.getOutputData(0), 11)
  assert.strictEqual(preservedBackend._executionState, 'success')

  const kukaNode = PandaUI.createNode('robot/kuka2700')
  assert.deepStrictEqual(Array.from(kukaNode.inputs, input => input.name), ['Transforms', 'Colors', 'Robot Name', 'Tool'])
  const kukaMessages = []
  const originalParent = context.parent
  context.parent = { postMessage: message => kukaMessages.push(message) }
  kukaNode.inputs[1].data = ['255, 57, 0', null, '#00ff00', { r: 252, g: 57, b: 0 }]
  kukaNode.inputs[2].data = 'Custom Robot.3dm'
  kukaNode.onExecute()
  context.parent = originalParent
  assert.strictEqual(kukaMessages.length, 1)
  assert.strictEqual(kukaMessages[0].assetUrl, '/editor/plugins/data/Custom%20Robot.3dm')
  assert.deepStrictEqual(Array.from(kukaMessages[0].colors[0]), [1, 57 / 255, 0])
  assert.strictEqual(kukaMessages[0].colors[1], null)
  assert.strictEqual(kukaMessages[0].colors[2], null)
  assert.strictEqual(kukaMessages[0].colors[3], null)
  const toolMarker = { __pandauiSceneObject: true, source: 'model', id: 'picked-tool' }
  context.parent = { postMessage: message => kukaMessages.push(message) }
  const toolTransforms = Array.from({ length: 11 }, (_, index) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, index * 10, 0, 0, 1])
  kukaNode.inputs[0].data = toolTransforms
  kukaNode.properties.toolObjects = [toolMarker]
  kukaNode.onExecute()
  assert.equal(kukaMessages.at(-1).transforms.length, 11)
  assert.equal(kukaMessages.at(-1).transforms[10][12], 100)
  assert.equal(kukaMessages.at(-1).tools[0].id, 'picked-tool')
  kukaNode.inputs[0].data = new Float32Array(toolTransforms.flat())
  kukaNode._lastKey = ''
  kukaNode.onExecute()
  assert.equal(kukaMessages.at(-1).transforms.length, 11)
  const wiredMarker = { ...toolMarker, id: 'connected-tool' }
  kukaNode.inputs[3].data = { _isDualData: true, display: { treeData: { datas: [wiredMarker] } } }
  kukaNode.onExecute()
  assert.equal(kukaMessages.at(-1).tools[0].id, 'connected-tool')
  kukaNode.inputs[3].data = null
  kukaNode.removeInput(3)
  kukaNode.onConfigure()
  assert.equal(kukaNode.inputs[3].name, 'Tool', 'Existing three-input nodes migrate without replacing other ports')
  assert.equal(kukaNode.properties.toolObjects[0].id, 'picked-tool')
  assert(kukaNode.getExtraMenuOptions().some(item => item.content === 'Pick Tool from Scene'))
  context.parent = originalParent

  const previewEvents = []
  context.PandaUIParamPreviewDispatcher = (port, command) => previewEvents.push({ kind: command.action, value: port.rawValue })
  context.PandaUIGeometryOutputDispatcher = (node, index, port, value) => previewEvents.push({ kind: 'draw', value })
  let resolvePreviewRefresh
  function PreviewRefreshNode () { this.addOutput('geometry', 'geometry') }
  PreviewRefreshNode.prototype.onExecute = async function () {
    await new Promise(resolve => { resolvePreviewRefresh = resolve })
    this.setOutputData(0, { _isDualData: true, id: 'new-preview' })
  }
  PandaUI.registerNode('tests/preview-refresh', PreviewRefreshNode)
  const previewGraph = new PandaUI.GraphDocument()
  previewGraph.setStepMode(false)
  const previewNode = previewGraph.add(PandaUI.createNode('tests/preview-refresh'))
  previewEvents.length = 0
  const oldPreview = { _isDualData: true, id: 'old-preview' }
  previewNode.outputs[0]._data = oldPreview
  previewNode.outputs[0].rawValue = oldPreview
  const previewToken = ++previewGraph._solutionToken
  const pendingPreviewRefresh = previewGraph.executeNode(previewNode, previewToken)
  await Promise.resolve()
  assert.strictEqual(previewNode.outputs[0].rawValue, oldPreview, 'dirty execution must retain the previous preview while computing')
  assert.deepStrictEqual(previewEvents, [], 'dirty execution must not clear or redraw preview before refresh completes')
  resolvePreviewRefresh()
  await pendingPreviewRefresh
  assert.deepStrictEqual(previewEvents.map(event => event.kind), ['clear', 'draw'], 'successful refresh must replace preview after computation')
  assert.strictEqual(previewNode.outputs[0].rawValue.id, 'new-preview')

  previewEvents.length = 0
  function FailedPreviewNode () { this.addOutput('geometry', 'geometry') }
  FailedPreviewNode.prototype.onExecute = async function () {
    this.setOutputData(0, { _isDualData: true, id: 'failed-preview' })
    throw new Error('preview refresh failed')
  }
  PandaUI.registerNode('tests/failed-preview-refresh', FailedPreviewNode)
  const failedNode = previewGraph.add(PandaUI.createNode('tests/failed-preview-refresh'))
  previewEvents.length = 0
  failedNode.outputs[0]._data = oldPreview
  failedNode.outputs[0].rawValue = oldPreview
  await previewGraph.executeNode(failedNode, previewGraph._solutionToken)
  assert.strictEqual(failedNode.outputs[0].rawValue, oldPreview, 'failed refresh must restore the previous output')
  assert.deepStrictEqual(previewEvents, [], 'failed refresh must keep the previous preview visible')

  previewEvents.length = 0
  function ScalarRefreshNode () { this.addOutput('value', 'number') }
  ScalarRefreshNode.prototype.onExecute = function () { this.setOutputData(0, 42) }
  PandaUI.registerNode('tests/scalar-preview-refresh', ScalarRefreshNode)
  const scalarNode = previewGraph.add(PandaUI.createNode('tests/scalar-preview-refresh'))
  previewEvents.length = 0
  scalarNode.outputs[0]._data = oldPreview
  scalarNode.outputs[0].rawValue = oldPreview
  await previewGraph.executeNode(scalarNode, previewGraph._solutionToken)
  assert.strictEqual(scalarNode.outputs[0].rawValue, 42)
  assert.deepStrictEqual(previewEvents.map(event => event.kind), ['clear'], 'non-geometry refresh must clear the old preview only after success')

  assert(source.getNodeAttributes() instanceof context.PandaUIKernel.NodeAttributes)
  source.getNodeAttributes().setExecutionState('running')
  assert.strictEqual(source._executionState, 'running')
  assert.strictEqual(source.getNodeAttributes().getStyle().label, 'Computing')

  const serialized = graph.serialize()
  assert.strictEqual(serialized.format, 'PandaUI.NodeDocument')
  assert.strictEqual(serialized.nodes.length, 4)
  assert.strictEqual(serialized.links.length, 1)

  const restored = new PandaUI.GraphDocument()
  restored.setStepMode(false)
  restored.configure(serialized)
  assert.strictEqual(restored._nodes.length, 4)
  assert.strictEqual(restored.links.size, 1)
  assert(restored.canUndo() === false)

  const extra = restored.add(PandaUI.createNode('tests/source'))
  assert(extra)
  assert(restored.canUndo())
  assert(restored.undo())
  assert.strictEqual(restored._nodes.length, 4)
  assert(restored.redo())
  assert.strictEqual(restored._nodes.length, 5)

  const groupGraph = new PandaUI.GraphDocument()
  groupGraph.setStepMode(false)
  groupGraph.commitHistory('initial')
  const group = groupGraph.addGroup(new PandaUI.GraphGroup({ title: 'Advanced Group', pos: [20, 30], size: [240, 160] }))
  assert.strictEqual(groupGraph.serialize().groups.length, 1)
  assert.strictEqual(groupGraph.serialize().groups[0].title, 'Advanced Group')
  assert(groupGraph.undo())
  assert.strictEqual(groupGraph._groups.length, 0)
  assert(groupGraph.redo())
  assert.strictEqual(groupGraph._groups.length, 1)
  assert.strictEqual(groupGraph._groups[0].pos[0], 20)
  groupGraph.clear()
  assert.strictEqual(groupGraph.serialize().groups.length, 0)
  assert(groupGraph.undo())
  assert.strictEqual(groupGraph._groups.length, 1)

  const menuCalls = []
  const menuCanvas = {
    portMenuAt () { return null },
    showNodeMenu () { menuCalls.push('node') },
    showGroupMenu () { menuCalls.push('group') },
    showLinkMenu () { menuCalls.push('link') },
    showAddNodeMenu () { menuCalls.push('add-node') },
    toGraph () { return [0, 0] }
  }
  PandaUI.GraphCanvas.prototype.showContextMenu.call(menuCanvas, { clientX: 10, clientY: 20 }, { id: 1 }, null, null)
  PandaUI.GraphCanvas.prototype.showContextMenu.call(menuCanvas, { clientX: 10, clientY: 20 }, null, { id: 'group' }, null)
  PandaUI.GraphCanvas.prototype.showContextMenu.call(menuCanvas, { clientX: 10, clientY: 20 }, null, null, { id: 'link' })
  PandaUI.GraphCanvas.prototype.showContextMenu.call(menuCanvas, { clientX: 10, clientY: 20 }, null, null, null)
  assert.deepStrictEqual(menuCalls, ['node', 'group', 'link', 'add-node'])

  const categoryCanvas = Object.create(PandaUI.GraphCanvas.prototype)
  const originalTypes = Object.keys(PandaUI.nodeTypes)
  const menuPath = type => Array.from(categoryCanvas.nodeMenuPath(type))
  assert.deepStrictEqual(menuPath('display/a'), menuPath('Display/b'))
  assert.deepStrictEqual(menuPath('Input/a'), menuPath('input/b'))
  assert.deepStrictEqual(menuPath('Input/a'), menuPath('widget/slider'))
  assert.deepStrictEqual(menuPath('Maths/a'), menuPath('math/b'))
  assert.deepStrictEqual(menuPath('Transform/a'), menuPath('transform/b'))
  assert.deepStrictEqual(menuPath('pandaui/tree_packer'), ['Data', 'Trees'])
  assert.deepStrictEqual(menuPath('NodeC/Edit/Set_Curve_Control_Points'), ['Geometry', 'Control Points'])
  assert.deepStrictEqual(menuPath('WASM/NodeCurveC/FilletEdge/some-guid'), ['Geometry', 'Curves', 'WASM', 'Fillet Edge'])
  assert.deepStrictEqual(menuPath('WASM/NodeMathC/Analysis/some-guid'), ['Math', 'WASM', 'Analysis'])
  assert.deepStrictEqual(menuPath('CustomPlugin/UV_tools/a'), ['Extensions', 'Custom Plugin', 'UV Tools'])
  assert.deepStrictEqual(menuPath('WASM/constructor/a'), ['Extensions', 'WASM', 'Constructor'])
  assert.deepStrictEqual(Object.keys(PandaUI.nodeTypes), originalTypes, 'Menu normalization must not rename graph types')

  const clipboardGraph = new PandaUI.GraphDocument()
  clipboardGraph.setStepMode(false)
  const clipboardSource = clipboardGraph.add(PandaUI.createNode('tests/source'), { silent: true })
  const clipboardTarget = clipboardGraph.add(PandaUI.createNode('tests/target'), { silent: true })
  clipboardSource.pos = [10, 20]
  clipboardTarget.pos = [160, 40]
  clipboardGraph.connect(clipboardSource, 0, clipboardTarget, 0, { silent: true })
  clipboardGraph.commitHistory('initial')
  const clipboardCanvas = Object.create(PandaUI.GraphCanvas.prototype)
  Object.assign(clipboardCanvas, {
    graph: clipboardGraph,
    selected_nodes: {},
    selected_group: null,
    graph_mouse: [300, 200],
    clipboardOffset: 0,
    setDirty () {},
    scale: 1
  })
  clipboardCanvas.selectNode(clipboardSource, true)
  clipboardCanvas.selectNode(clipboardTarget, true)
  const copied = clipboardCanvas.copySelection()
  assert.strictEqual(copied.nodes.length, 2)
  assert.strictEqual(copied.links.length, 1)
  const oldIds = new Set([String(clipboardSource.id), String(clipboardTarget.id)])
  const pasted = clipboardCanvas.pasteSelection([300, 200])
  assert.strictEqual(pasted.length, 2)
  assert.strictEqual(clipboardGraph._nodes.length, 4)
  assert.strictEqual(clipboardGraph.links.size, 2)
  pasted.forEach((node) => assert(!oldIds.has(String(node.id))))
  assert(pasted.some((node) => node.pos[0] >= 318 && node.pos[1] >= 218))

  const rectangleNodes = clipboardCanvas.nodesInRectangle([295, 195, 520, 320])
  assert.strictEqual(rectangleNodes.length, 2)
  pasted[0].flags.collapsed = true
  assert.strictEqual(clipboardCanvas.nodeBodyHeight(pasted[0]), 0)
  assert(clipboardCanvas.nodeDisplayWidth(pasted[0]) >= 90)

  clipboardGraph.commitHistory('collapse-node', pasted[0])
  const selectionGroup = clipboardCanvas.groupSelection()
  assert(selectionGroup, 'Multiple selected nodes can be grouped')
  assert.strictEqual(clipboardCanvas.selected_group, selectionGroup)
  pasted.forEach(node => {
    assert(selectionGroup.pos[0] < node.pos[0])
    assert(selectionGroup.pos[1] < node.pos[1] - PandaUI.NODE_TITLE_HEIGHT)
    assert(selectionGroup.pos[0] + selectionGroup.size[0] > node.pos[0] + clipboardCanvas.nodeDisplayWidth(node))
    assert(selectionGroup.pos[1] + selectionGroup.size[1] > node.pos[1] + clipboardCanvas.nodeBodyHeight(node))
  })
  assert.strictEqual(clipboardCanvas.updateGroupNodes(selectionGroup).length, 2)
  const restoredGroupGraph = new PandaUI.GraphDocument()
  restoredGroupGraph.setStepMode(false)
  restoredGroupGraph.configure(clipboardGraph.serialize())
  assert.strictEqual(restoredGroupGraph._groups.length, 1, 'Groups survive document save/load')
  assert(clipboardGraph.undo())
  assert.strictEqual(clipboardGraph._groups.length, 0)
  assert(clipboardGraph.redo())
  assert.strictEqual(clipboardGraph._groups.length, 1)
  assert.strictEqual(clipboardCanvas.deleteSelection(), 2)
  assert.strictEqual(clipboardGraph._nodes.length, 2)
  assert.strictEqual(clipboardGraph.links.size, 1)
  assert.strictEqual(Object.keys(clipboardCanvas.selected_nodes).length, 0)
  assert(clipboardGraph.undo(), 'Multi-node deletion is undone in one step')
  assert.strictEqual(clipboardGraph._nodes.length, 4)
  assert.strictEqual(clipboardGraph.links.size, 2)
  clipboardCanvas.selectNode(clipboardSource)
  assert.strictEqual(clipboardCanvas.groupSelection(), null, 'Grouping requires at least two selected nodes')

  const widgetGraph = new PandaUI.GraphDocument()
  widgetGraph.setStepMode(false)
  const topWidgetNode = widgetGraph.add(PandaUI.createNode('widget/internal_slider'), { silent: true })
  topWidgetNode.pos = [50, 50]
  assert.strictEqual(topWidgetNode.widgetUI, 'slider')
  const widgetCanvas = Object.create(PandaUI.GraphCanvas.prototype)
  Object.assign(widgetCanvas, { graph: widgetGraph, scale: 1 })
  const widgetHit = widgetCanvas.widgetAt([70, 64])
  assert.strictEqual(widgetHit, null)
  assert(topWidgetNode.widgetContentTop() > 34)
  assert(topWidgetNode.size[1] >= topWidgetNode.getMinimumSize()[1])

  const connectionGraph = new PandaUI.GraphDocument()
  connectionGraph.setStepMode(false)
  const connectionSource = connectionGraph.add(PandaUI.createNode('tests/source'))
  const connectionCanvas = { graph: connectionGraph }
  const connectedNode = PandaUI.GraphCanvas.prototype.addNodeAt.call(connectionCanvas, 'tests/target', [120, 80], {
    node: connectionSource,
    index: 0,
    type: 'number'
  })
  assert(connectedNode)
  assert.strictEqual(connectedNode.inputs[0].link != null, true)
  assert.strictEqual(connectionGraph.links.size, 1)

  const reverseGraph = new PandaUI.GraphDocument()
  reverseGraph.setStepMode(false)
  const reverseTarget = reverseGraph.add(PandaUI.createNode('tests/target'))
  const reverseCanvas = { graph: reverseGraph }
  const reverseSource = PandaUI.GraphCanvas.prototype.addNodeAt.call(reverseCanvas, 'tests/source', [20, 80], {
    node: reverseTarget,
    index: 0,
    direction: 'input',
    type: 'number'
  })
  assert(reverseSource)
  assert.strictEqual(reverseTarget.inputs[0].link != null, true)
  assert.strictEqual(reverseGraph.links.size, 1)

  const boundedMenu = {
    parentNode: {},
    classList: { contains: () => false },
    style: {},
    offsetWidth: 220,
    offsetHeight: 200,
    _pandauiAnchorX: 890,
    _pandauiAnchorY: 640
  }
  PandaUI.GraphCanvas.prototype.fitMenuToCanvas.call({
    canvas: {
      getBoundingClientRect: () => ({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600 })
    }
  }, boundedMenu)
  assert.strictEqual(boundedMenu.style.left, '674px')
  assert.strictEqual(boundedMenu.style.top, '444px')
  assert.strictEqual(boundedMenu.style.maxWidth, '788px')
  assert.strictEqual(boundedMenu.style.maxHeight, '588px')

  const index = fs.readFileSync(path.join(root, 'public/editor/index.html'), 'utf8')
  const runtime = fs.readFileSync(path.join(root, 'public/editor/src/PandaUI/Runtime.js'), 'utf8')
  const canvasRuntime = fs.readFileSync(path.join(root, 'public/editor/src/PandaUI/GraphCanvas.js'), 'utf8')
  const canvasRenderer = fs.readFileSync(path.join(root, 'public/editor/src/Kernel/Rendering/CanvasRenderer.js'), 'utf8')
  assert(!runtime.includes('function GraphCanvas'))
  assert(canvasRuntime.includes('else this.showAddNodeMenu(event.clientX, event.clientY'))
  assert(canvasRuntime.includes('GraphCanvas.prototype.showGroupMenu'))
  assert(canvasRuntime.includes('GraphCanvas.prototype.showLinkMenu'))
  assert(canvasRuntime.includes('GraphCanvas.prototype.updateVisibleArea'))
  assert(canvasRuntime.includes('GraphCanvas.prototype.widgetStartOffset'))
  assert(canvasRuntime.includes("local[1] >= 0 && typeof node.onMouseDown === 'function'"))
  assert(!canvasRuntime.includes('context.arc(width - 12, -14, 4'))
  assert(canvasRenderer.includes('this.showStateOutline = false'))
  assert(!canvasRenderer.includes('context.fillRect(0, -titleHeight, 3, totalHeight)'))
  assert(!canvasRuntime.includes("context.strokeStyle = 'rgba(255,255,255,0.055)'"))
  const drawCanvas = Object.create(PandaUI.GraphCanvas.prototype)
  Object.assign(drawCanvas, { selected_nodes: {}, scale: 1 })
  function drawNodeAppearance (active) {
    drawCanvas.editorModeActive = active
    const fills = []; const labels = []; const stack = []
    const drawing = new Proxy({
      save () { stack.push({ globalAlpha: this.globalAlpha, filter: this.filter }) },
      restore () { Object.assign(this, stack.pop()) },
      fillRect (...args) { fills.push({ style: this.fillStyle, args }) },
      fillText (text) { labels.push({ text, alpha: this.globalAlpha, filter: this.filter }) }
    }, { get (target, key) { return key in target ? target[key] : () => {} } })
    drawCanvas.drawNode(drawing, target)
    assert(labels.length >= 3)
    assert(labels.every(label => label.alpha === 1 && label.filter === 'none'))
    assert.strictEqual(fills.length, drawCanvas.appearance.backgroundOpacity > 0 ? 2 : 1)
    assert.strictEqual(fills[fills.length - 1].style, context.PandaUINodeAppearance.rgba(drawCanvas.appearance.titleBackgroundColor, drawCanvas.appearance.titleOpacity))
    return { fills, labels }
  }
  assert.deepStrictEqual(drawNodeAppearance(true), drawNodeAppearance(false))
  drawCanvas.appearance = context.PandaUINodeAppearance.normalize({ backgroundColor: '#112233', backgroundOpacity: 0.6, titleOpacity: 0.1, textColor: '#ccddff', fontSize: 18 })
  assert.strictEqual(drawNodeAppearance(true).fills[0].style, 'rgba(17,34,51,0.6)')
  assert.deepStrictEqual(drawNodeAppearance(true), drawNodeAppearance(false), 'Background opacity must not fade labels or change with interaction mode')
  ;['Lite' + 'Graph', 'L' + 'GraphNode', 'L' + 'GraphCanvas', 'Legacy' + 'Executor', 'src/nodes/'].forEach((term) => {
    assert(!index.includes(term), `production editor must not load ${term}`)
  })
  assert(index.includes('src/PandaUI/Runtime.js'))
  assert(index.includes('src/PandaUI/GraphCanvas.js'))
  assert(index.includes('src/PandaUI/NativeNodes.js'))

  const editorCode = fs.readFileSync(path.join(root, 'public/editor/js/code.js'), 'utf8')
  const mainLayout = fs.readFileSync(path.join(root, 'src/layouts/MainLayout.vue'), 'utf8')
  const editorBridge = fs.readFileSync(path.join(root, 'src/composables/useEditorBridge.js'), 'utf8')
  const kukaRobot = fs.readFileSync(path.join(root, 'public/editor/plugins/Kuka_Robot.js'), 'utf8')
  assert(kukaRobot.includes("context.textAlign = 'left'"))
  assert(kukaRobot.includes('context.clip()'))
  assert(kukaRobot.includes("this.addInput('Colors'"))
  assert(kukaRobot.includes("this.addInput('Robot Name'"))
  assert(kukaRobot.includes("'/editor/plugins/data/'"))
  assert(!kukaRobot.includes('/editor/plugins/datas/'))
  assert(editorBridge.includes('`Loading ${robotName}...`'))
  assert(editorCode.includes("event.data.type === 'pandaui-editor-mode'"))
  assert(editorCode.includes('graphcanvas.setEditorMode(event.data.active === true)'))
  assert(mainLayout.includes("postToEditor({ type: 'pandaui-editor-mode', active: editorMode.value })"))
  assert(editorBridge.includes("watch(editorMode, active =>"))

  console.log('PandaUI node runtime tests passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
