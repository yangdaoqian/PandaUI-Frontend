const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

function environment () {
  const context = { console, AbortController, ArrayBuffer, Float32Array, setTimeout, clearTimeout }
  context.window = context; context.parent = context; context.globalThis = context
  vm.createContext(context)
  require('./editor-test-kernel')(context)
  for (const file of ['Runtime.js', 'GraphAgent.js', 'GraphCanvas.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/editor/src/PandaUI', file), 'utf8'), context, { filename: file })
  const { PandaUI } = context
  function Value () { this.properties = { value: 1, extra: 0 }; this.addInput('In', 'number'); this.addOutput('Out', 'number') }
  Value.prototype.onExecute = function () { this.setOutputData(0, this.properties.value) }
  Value.prototype.onPropertyChanged = function (name, value) { if (name === 'value' && value < 0) { this.properties.extra = 999; return false } }
  PandaUI.registerNode('test/value', Value)
  const graph = new PandaUI.GraphDocument()
  graph.setStepMode(false)
  const create = id => { const node = PandaUI.createNode('test/value'); node.id = id; return node }
  const addOperation = id => ({ type: 'add_node', payload: { node: create(id).serialize() } })
  return { context, PandaUI, graph, create, addOperation }
}
function entities (graph) { const data = graph.serialize(); return JSON.stringify({ nodes: data.nodes, links: data.links, groups: data.groups }) }
function expectCode (action, code) { assert.throws(action, error => error.code === code) }
function ok (value) { assert.strictEqual(value.is_error, false, JSON.stringify(value)); return value.result }

const cases = [
  ['Runtime, Canvas and Kernel use the same document and group classes', async ({ context, PandaUI, graph }) => {
    assert.strictEqual(PandaUI.GraphDocument, context.PandaUIKernel.GraphDocument)
    assert.strictEqual(PandaUI.GraphGroup, context.PandaUIKernel.GraphGroup)
    assert(graph.history instanceof context.PandaUIKernel.CommandHistory)
    assert(graph.scheduler instanceof context.PandaUIKernel.SolutionScheduler)
    assert(graph.events instanceof context.PandaUIKernel.DocumentEventBus)
    assert.strictEqual(graph._history, undefined)
  }],
  ['UI commands replay into another copy of the same document', async ({ PandaUI, graph, create }) => {
    const operations = []
    graph.events.on('operation-applied', event => operations.push(JSON.parse(JSON.stringify(event.detail.operation))))
    const first = graph.add(create('first'))
    const second = graph.add(create('second'))
    graph.connect(first, 0, second, 0)
    first.setProperty('value', 25)
    const copy = new PandaUI.GraphDocument(); copy.documentId = graph.documentId; copy.setStepMode(false)
    operations.forEach(operation => copy.applyOperation(operation))
    assert.strictEqual(entities(copy), entities(graph))
    assert.strictEqual(copy.revision, graph.revision)
    assert(operations.every(operation => operation.version === 1 && operation.operationId && operation.actorId))
  }],
  ['operation IDs are idempotent and revision/document mismatches reject before mutation', async ({ graph, addOperation }) => {
    const operation = Object.assign(addOperation('first'), { operationId: 'request-1', baseRevision: 0, documentId: graph.documentId })
    graph.applyOperation(operation)
    const before = entities(graph)
    assert.strictEqual(graph.applyOperation(operation).duplicate, true)
    assert.strictEqual(graph.revision, 1)
    expectCode(() => graph.applyOperation(Object.assign(addOperation('second'), { baseRevision: 0 })), 'REVISION_CONFLICT')
    expectCode(() => graph.applyOperation(Object.assign(addOperation('second'), { operationId: 'request-1' })), 'OPERATION_ID_CONFLICT')
    expectCode(() => graph.applyOperation(Object.assign(addOperation('second'), { documentId: 'another-document' })), 'DOCUMENT_MISMATCH')
    assert.strictEqual(entities(graph), before)
    assert.strictEqual(graph.history.entries.length, 1)
  }],
  ['a failed operation batch rolls back preceding operations without publishing a commit', async ({ graph, addOperation }) => {
    const before = entities(graph)
    let published = 0
    graph.events.on('operation-applied', () => published++)
    expectCode(() => graph.applyOperation({ type: 'batch', payload: { operations: [addOperation('one'), { type: 'set_property', payload: { nodeId: 'missing', name: 'value', value: 7 } }] } }), 'NODE_NOT_FOUND')
    assert.strictEqual(entities(graph), before)
    assert.strictEqual(graph.revision, 0)
    assert.strictEqual(published, 0)
    assert.strictEqual(graph.history.entries.length, 0)
    assert.strictEqual(graph._nodeStates.size, 0)
  }],
  ['failed property callbacks restore their partial mutations', async ({ graph, create }) => {
    const node = graph.add(create('value'))
    const revision = graph.revision
    expectCode(() => graph.applyOperation({ type: 'set_property', payload: { nodeId: node.id, name: 'value', value: -1 } }), 'PROPERTY_REJECTED')
    assert.strictEqual(node.properties.value, 1)
    assert.strictEqual(node.properties.extra, 0)
    assert.strictEqual(graph.revision, revision)
  }],
  ['property changes and AI turns never serialize the whole document', async ({ PandaUI, graph, create }) => {
    const node = graph.add(create('value'))
    const unchanged = graph.add(create('unchanged'))
    const preview = { _isDualData: true, display: { buffer: new ArrayBuffer(8192) } }
    unchanged.outputs[0]._data = preview
    graph.serialize = () => { throw new Error('Whole-document snapshot requested') }
    node.setProperty('value', 12)
    assert(graph.undo()); assert.strictEqual(node.properties.value, 1)
    assert(graph.redo()); assert.strictEqual(node.properties.value, 12)
    const agent = new PandaUI.GraphAgent(graph)
    ok(await agent.beginTurn())
    ok(agent.set_property(node.id, 'value', 34))
    ok(agent.set_property(node.id, 'extra', 56))
    ok(agent.rollbackTurn())
    assert.strictEqual(node.properties.value, 12)
    assert.strictEqual(node.properties.extra, 0)
    assert.strictEqual(graph.getNodeById(unchanged.id), unchanged)
    assert.strictEqual(unchanged.outputs[0]._data, preview)
    assert(!JSON.stringify(graph.history.capture()).includes('buffer'))
    agent.dispose()
  }],
  ['delete undo restores port links and leaves unrelated node instances intact', async ({ graph, create }) => {
    const source = graph.add(create('source')); const target = graph.add(create('target')); const unrelated = graph.add(create('unrelated'))
    graph.connect(source, 0, target, 0)
    const before = entities(graph)
    graph.remove(source)
    assert.strictEqual(graph.links.size, 0)
    graph.undo()
    assert.strictEqual(entities(graph), before)
    assert.strictEqual(graph.getNodeById(target.id), target)
    assert.strictEqual(graph.getNodeById(unrelated.id), unrelated)
    graph.redo()
    assert.strictEqual(graph.getNodeById(source.id), null)
  }],
  ['append/replace inverses restore the ordered input connection list', async ({ graph, create }) => {
    const first = graph.add(create('first')); const second = graph.add(create('second')); const target = graph.add(create('target'))
    graph.connect(first, 0, target, 0)
    graph.connect(second, 0, target, 0, { append: true })
    const original = Array.from(target.getInputLinks(0))
    graph.connect(second, 0, target, 0)
    assert.strictEqual(target.getInputLinks(0).length, 1)
    graph.undo()
    assert.deepStrictEqual(Array.from(target.getInputLinks(0)), original)
    graph.redo()
    assert.strictEqual(target.getInputLinks(0).length, 1)
    expectCode(() => graph.connect(target, 0, second, 0), 'CYCLIC_CONNECTION')
  }],
  ['targeted layout and preview edits have reversible operations', async ({ graph, create }) => {
    const node = graph.add(create('value'))
    const initial = Array.from(node.pos)
    node.pos = [200, 300]
    graph.commitHistory('move-node', node)
    graph.undo(); assert.deepStrictEqual(Array.from(node.pos), initial)
    graph.redo(); assert.deepStrictEqual(Array.from(node.pos), [200, 300])
    node.outputs[0].previewAttributes.visible = false
    graph.commitHistory('port-preview', node)
    graph.undo(); assert.strictEqual(node.outputs[0].previewAttributes.visible, true)
    graph.redo(); assert.strictEqual(node.outputs[0].previewAttributes.visible, false)
  }],
  ['groups and document clear participate in the same operation history', async ({ PandaUI, graph, create }) => {
    graph.add(create('node'))
    const group = graph.addGroup(new PandaUI.GraphGroup({ title: 'Model', pos: [10, 20] }))
    group.title = 'Changed'; graph.commitHistory('rename-group', group)
    graph.undo(); assert.strictEqual(group.title, 'Model')
    graph.redo(); assert.strictEqual(group.title, 'Changed')
    const before = entities(graph)
    graph.clear(); assert.strictEqual(graph._nodes.length, 0); assert.strictEqual(graph._groups.length, 0)
    graph.undo(); assert.strictEqual(entities(graph), before)
    graph.redo(); assert.strictEqual(graph._nodes.length, 0)
  }],
  ['history capture/restore retains operations across open-document switches', async ({ PandaUI, graph, create }) => {
    const node = graph.add(create('node')); node.setProperty('value', 16)
    const saved = { graph: graph.serialize(), history: graph.history.capture() }
    const restored = new PandaUI.GraphDocument(); restored.setStepMode(false)
    restored.configure(saved.graph); restored.history.restore(saved.history)
    restored.undo(); assert.strictEqual(restored.getNodeById(node.id).properties.value, 1)
    restored.redo(); assert.strictEqual(restored.getNodeById(node.id).properties.value, 16)
    restored.history.restore(['legacy snapshot'])
    assert.strictEqual(restored.canUndo(), false)
  }],
  ['topology is cached across value edits and invalidated by structural changes', async ({ graph, create }) => {
    const first = graph.add(create('first')); const second = graph.add(create('second'))
    graph.connect(first, 0, second, 0)
    await graph.solveAll()
    const rebuilds = graph.dependencyGraph.rebuildCount
    first.setProperty('value', 20)
    await graph.solveAll()
    graph.undo(); await graph.solveAll()
    assert.strictEqual(graph.dependencyGraph.rebuildCount, rebuilds)
    const third = graph.add(create('third'))
    graph.connect(second, 0, third, 0)
    await graph.solveAll()
    assert(graph.dependencyGraph.rebuildCount > rebuilds)
    assert.deepStrictEqual(Array.from(graph.topologicalNodes(), node => node.id), ['first', 'second', 'third'])
    graph.clear()
    assert.strictEqual(graph.dependencyGraph.cachedOrder, null)
    assert.strictEqual(graph.dependencyGraph.nodes.length, 0)
    assert.strictEqual(graph.dependencyGraph.nodeById.size, 0)
    assert.strictEqual(graph._dirty.size, 0)
  }],
  ['transport operations reject unsafe fields, binary payloads and nested foreign documents', async ({ graph, create, addOperation }) => {
    const node = graph.add(create('node'))
    const before = entities(graph)
    expectCode(() => graph.applyOperation({ type: 'patch_node', payload: { nodeId: node.id, patch: { properties: [{ name: '__proto__', value: { corrupted: true } }] } } }), 'INVALID_OPERATION')
    expectCode(() => graph.applyOperation({ type: 'set_property', payload: { nodeId: node.id, name: 'value', value: new ArrayBuffer(10) } }), 'INVALID_OPERATION')
    expectCode(() => graph.applyOperation({ type: 'batch', payload: { operations: [Object.assign(addOperation('foreign'), { documentId: 'foreign' })] } }), 'DOCUMENT_MISMATCH')
    assert.strictEqual(entities(graph), before)
  }],
  ['invalid connection restoration cannot disconnect or overwrite existing links', async ({ graph, create }) => {
    const source = graph.add(create('source')); const target = graph.add(create('target')); const other = graph.add(create('other'))
    const link = graph.connect(source, 0, target, 0)
    const otherLink = graph.connect(source, 0, other, 0)
    const before = entities(graph); const revision = graph.revision
    for (const invalid of [
      { ...link, target_id: 'missing' },
      { ...link, target_slot: 20 },
      { ...link, origin_slot: 20 },
      { ...link, id: otherLink.id }
    ]) {
      assert.throws(() => graph.applyOperation({ type: 'replace_input_links', payload: { nodeId: target.id, slot: 0, links: [invalid] } }))
      assert.strictEqual(entities(graph), before)
      assert.strictEqual(graph.revision, revision)
    }
    expectCode(() => graph.applyOperation({ type: 'connect', payload: { src: source.id, dst: target.id, outSlot: 0, inSlot: 0, mode: 'replace' } }), 'INVALID_OPERATION')
    expectCode(() => graph.applyOperation({ type: 'patch_node', payload: { nodeId: target.id, patch: { fields: [{ name: 'graph', value: null }] } } }), 'INVALID_OPERATION')
    assert.strictEqual(target.graph, graph)
  }],
  ['property undo and redo restore plugin callback state', async ({ PandaUI, graph }) => {
    function CallbackNode () { this.properties = { value: 1 }; this.liveValue = 1 }
    CallbackNode.prototype.onPropertyChanged = function (name, value) { this.liveValue = value }
    PandaUI.registerNode('test/callback', CallbackNode)
    const node = graph.add(PandaUI.createNode('test/callback'))
    node.setProperty('value', 30)
    assert.strictEqual(node.liveValue, 30)
    graph.undo(); assert.strictEqual(node.liveValue, 1)
    graph.redo(); assert.strictEqual(node.liveValue, 30)
  }],
  ['history pruning keeps the state token of the retained undo boundary', async ({ graph, create }) => {
    graph.history.maxEntries = 2
    const node = graph.add(create('node'))
    const addedToken = graph.history.stateToken()
    node.setProperty('value', 2)
    const savedToken = graph.history.stateToken()
    node.setProperty('value', 3)
    assert.strictEqual(graph.history.entries.length, 2)
    graph.undo(); assert.strictEqual(graph.history.stateToken(), savedToken)
    graph.undo(); assert.strictEqual(graph.history.stateToken(), addedToken)
    assert.strictEqual(node.properties.value, 1)
    assert.strictEqual(graph.canUndo(), false)
    graph.redo(); assert.strictEqual(graph.history.stateToken(), savedToken)
  }]
]

async function run () {
  for (const [name, test] of cases) {
    const state = environment()
    try { await test(state) } finally { state.graph.abortSolution() }
    console.log('PASS:', name)
  }
  console.log(`PASS: ${cases.length} graph operation cases`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
