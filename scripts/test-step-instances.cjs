/* eslint-disable node/no-deprecated-api */
// Purpose: progressive STEP occurrence mounting without reapplying source poses.
// Changed scene files: PandaUIDoc.js and import/StreamingStepInstances.js.
// Review regression: rebuild STEP layer indexes after source-header refreshes,
// retaining only instance/model roots and preserving non-STEP indexing behavior.
// Validation: node --test scripts/test-step-instances.cjs (no build/export needed).
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core')
const THREE = require('three')

// Load the real scene/document modules without starting Vue or the application.
const sourcePath = path.resolve(__dirname, '../src') + path.sep
const originalLoader = require.extensions['.js']
require.extensions['.js'] = (module, filename) => {
  if (filename.endsWith(path.join('three', 'build', 'three.module.js'))) { module.exports = THREE; return }
  if (filename.startsWith(sourcePath) || filename.includes(path.join('three', 'examples', 'jsm'))) {
    module._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, filename)
  } else originalLoader(module, filename)
}
let nativeModule
const appPath = path.resolve(sourcePath, 'PandaUIApp.js')
require.cache[appPath] = { id: appPath, filename: appPath, loaded: true, exports: { __esModule: true, default: { getRhino3dm: () => nativeModule } } }
const PandaUIDoc = require('../src/PandaUIDoc').default
const StreamingStepInstances = require('../src/import/StreamingStepInstances').default
const releaseTable = require('../src/import/releaseTable').default
const GraphPreviewRegistry = require('../src/display/GraphPreviewRegistry').default
const targets = new GraphPreviewRegistry({ getCurrentGroupEditContext: () => null })

const pose = new THREE.Matrix4().makeTranslation(100, 20, 30).toArray()
const descriptor = (id, parentId = null, options = {}) => ({ id, parentId, name: 'Repeated part', path: 'Assembly::Part', definitionId: 'shared-definition', transform: [...pose], visible: true, ...options })
const hierarchy = () => [descriptor('assembly'), descriptor('left', 'assembly'), descriptor('nested', 'left'), descriptor('right', 'assembly')]
const triangle = new Float32Array([100, 0, 0, 101, 0, 0, 100, 1, 0])
const packet = (options = {}) => ({ id: 'face', objectId: 'body', kind: 'mesh', positions: triangle, layerPath: 'Assembly::Part', ...options })
const fixture = () => new PandaUIDoc({ layers: () => ({ count: 0 }), delete () {} }, 'STEP instances')
const instances = doc => {
  const groups = new Map()
  doc.three.middleground.traverse(object => { if (object.userData.importedBlockInstance) groups.set(object.userData.stepInstanceId, object) })
  return groups
}
const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true }
const worldVertex = mesh => { mesh.updateWorldMatrix(true, false); return new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, 0).applyMatrix4(mesh.matrixWorld).toArray() }
const firstMesh = root => { let mesh; root.traverse(part => { if (part.isMesh && !mesh) mesh = part }); return mesh }

test('metadata creates selectable identity groups before geometry, refresh keeps ids and user edits', async () => {
  const doc = fixture(), metadata = hierarchy(), original = structuredClone(metadata)
  try {
    doc.getSceneObjectDictionary() // Also exercise already-cached layer indexing.
    const imported = []
    doc.onImportedRoot = root => imported.push(root)
    doc.setStepInstances(metadata)
    const groups = instances(doc), root = groups.get('assembly'), nested = groups.get('nested')
    assert.equal(groups.size, 4)
    assert.equal(root.parent, doc.three.middleground)
    assert.equal(nested.parent, groups.get('left'))
    groups.forEach(group => {
      assert.deepEqual(group.matrix.toArray(), new THREE.Matrix4().toArray())
      assert.equal(group.userData.localDocumentId, doc.documentId)
      assert.equal(group.userData.stepInstanceState, 'loading')
    })
    assert.equal(targets.getTransformTarget(nested), root)
    assert.equal(doc.importedObjectCount, 0)
    assert.equal(doc.displayedPartCount, 0)
    assert.equal(imported.length, 0)
    const stableId = nested.userData.pandauiObjectId
    root.visible = false; root.position.set(7, 8, 9)
    doc.three.middleground.add(nested) // A user reparent is also preserved.
    doc.setSourceDocument({ layers: () => ({ count: 0 }), delete () {} }, true)
    await doc.appendImportRecord({ stepInstances: metadata })
    assert.equal(instances(doc).get('nested'), nested)
    assert.equal(nested.userData.pandauiObjectId, stableId)
    assert.equal(nested.parent, doc.three.middleground)
    assert.equal(root.visible, false)
    assert.deepEqual(root.position.toArray(), [7, 8, 9])
    assert.deepEqual(metadata, original)
    nested.userData.stepInstance.transform[12] = 999
    assert.deepEqual(metadata, original, 'Scene metadata must not alias producer transforms')
    assert.equal(doc.importedObjectCount, 0)
  } finally { doc.dispose() }
})

test('progressive display packets inherit ancestor deltas/visibility and isolate repeated occurrences', async () => {
  const doc = fixture(), other = fixture(), roots = []
  try {
    doc.setStepInstances(hierarchy()); other.setStepInstances(hierarchy())
    const groups = instances(doc), assembly = groups.get('assembly')
    const unrelated = new THREE.Group(); doc.three.middleground.add(unrelated)
    doc.onImportedRoot = root => {
      assert.equal(root.parent, groups.get(root.userData.stepInstanceId), 'Callbacks must see the final container immediately')
      roots.push(root)
    }
    const firstPacket = packet(), original = structuredClone(firstPacket)
    await doc.appendImportRecord({ stepInstanceId: 'nested', displayObject: firstPacket })
    const body = roots[0], first = firstMesh(body)
    assert.deepEqual(worldVertex(first), [100, 0, 0], 'World-placed source coordinates must not be transformed twice')
    assembly.visible = false
    assembly.position.set(7, 8, 9)
    assembly.rotation.z = Math.PI / 2
    groups.get('left').position.z = 3
    await doc.appendImportRecord({ stepInstanceId: 'nested', displayObject: packet({ id: 'second-face' }) })
    assert.equal(roots[1], body, 'Material packets append to the same logical object')
    assert.equal(doc.importedObjectCount, 1)
    const expected = new THREE.Vector3(100, 0, 3).applyAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2).add(assembly.position).toArray()
    const meshes = []; body.traverse(part => { if (part.isMesh) meshes.push(part) })
    assert.equal(meshes.length, 2)
    meshes.forEach(mesh => {
      assert.equal(visible(mesh), false)
      worldVertex(mesh).forEach((value, i) => assert(Math.abs(value - expected[i]) < 1e-9))
      assert.equal(targets.getTransformTarget(mesh), assembly)
    })
    await doc.appendImportRecord({ stepInstanceId: 'right', displayObject: packet() })
    assert.notEqual(roots[2], body, 'Identical object ids in different occurrences must not merge')
    assert.notEqual(roots[2].userData.pandauiObjectId, body.userData.pandauiObjectId)
    assert.equal(doc.importedObjectCount, 2)
    assert.notEqual(groups.get('right').userData.pandauiObjectId, groups.get('left').userData.pandauiObjectId)
    assert.notEqual(groups.get('right').userData.pandauiObjectId, instances(other).get('right').userData.pandauiObjectId)
    assert.equal(unrelated.parent, doc.three.middleground)
    assert.deepEqual(firstPacket, original)
    doc.setStepInstances(hierarchy())
    assert.equal(assembly.visible, false)
    assert.equal(assembly.position.x, 7)
    await doc.finishImport()
    assert.equal(doc.stepInstanceState, 'complete')
    assert.equal(groups.get('nested').userData.stepInstanceState, 'complete')
    assert.equal(body.parent, groups.get('nested'))
    assert.equal(visible(first), false)
  } finally { doc.dispose(); other.dispose() }
})

test('fallback additions precede geometry and metadata-only/failure records never count as objects', async () => {
  const doc = fixture()
  try {
    await doc.appendImportRecord({ stepInstances: [descriptor('root')] })
    assert.equal(doc.importedObjectCount, 0)
    assert.equal(doc.displayedPartCount, 0)
    await doc.appendImportRecord({ stepInstances: [descriptor('child', 'root')], stepInstanceId: 'child', displayObject: packet() })
    const groups = instances(doc)
    assert.equal(groups.get('child').parent, groups.get('root'))
    assert.equal(doc.importedObjectCount, 1)
    const count = doc.displayedPartCount
    await doc.appendImportRecord({ stepInstanceFailure: { instanceId: 'child', entity: '#42', message: 'Failed face' } })
    assert.equal(doc.importedObjectCount, 1)
    assert.equal(doc.displayedPartCount, count)
    await doc.finishImport()
    assert.equal(doc.stepInstanceState, 'failed')
    assert.equal(groups.get('child').userData.stepInstanceState, 'failed')
    assert.deepEqual(groups.get('child').userData.stepInstanceFailures, [{ entity: '#42', message: 'Failed face' }])
    assert(firstMesh(groups.get('child')), 'Failures preserve the successfully imported display')
  } finally { doc.dispose() }
})

test('STEP layer indexes survive cache rebuilds without mesh parts or non-STEP nested objects', async () => {
  const doc = fixture()
  const refresh = () => doc.setSourceDocument({ layers: () => ({ count: 0 }), delete () {} }, true)
  try {
    const legacy = new THREE.Group(), legacyChild = new THREE.Group()
    legacy.fullLayerPath = legacyChild.fullLayerPath = 'Legacy'
    legacy.add(legacyChild); doc.three.middleground.add(legacy)
    const foreground = new THREE.Group(); foreground.fullLayerPath = 'Overlay'
    doc.three.foreground.add(foreground)
    doc.getSceneObjectDictionary()
    doc.setStepInstances(hierarchy())
    const groups = [...instances(doc).values()]
    assert.deepEqual(doc.layers, [], 'Instance scene groups do not synthesize source layer metadata')
    const check = expected => {
      const indexed = doc.getSceneObjectsOnLayer('Assembly::Part') || []
      assert.equal(indexed.length, expected.length, 'Index contains roots exactly once, with no mesh/wire parts')
      assert.deepEqual(new Set(indexed), new Set(expected))
      assert.deepEqual(doc.getSceneObjectsOnLayer('Legacy'), [legacy], 'Non-STEP child indexing stays unchanged')
      assert.deepEqual(doc.getSceneObjectsOnLayer('Overlay'), [foreground])
    }
    check(groups)
    refresh(); check(groups)
    let body
    doc.onImportedRoot = root => { body = root }
    await doc.appendImportRecord({ stepInstanceId: 'nested', displayObject: packet() })
    await doc.appendImportRecord({ stepInstanceId: 'nested', displayObject: packet({ id: 'later-material' }) })
    check([...groups, body])
    refresh(); check([...groups, body])
    doc.setLayerVisibility('Assembly::Part', false)
    assert([...groups, body].every(root => root.visible === false))
    doc.setLayerVisibility('Assembly::Part', true)
    assert([...groups, body].every(root => root.visible === true))
    await doc.finishImport()
    refresh(); check([...groups, body]) // Helper indexes have already been released.
    const removed = instances(doc).get('left')
    removed.parent.remove(removed)
    refresh(); check(groups.filter(group => ['assembly', 'right'].includes(group.userData.stepInstanceId)))
  } finally { doc.dispose() }
})

test('deleted ancestors and deleted containers never resurrect on later metadata or geometry', async () => {
  const doc = fixture()
  try {
    doc.setStepInstances(hierarchy())
    const groups = instances(doc), deleted = groups.get('left')
    deleted.parent.remove(deleted)
    doc.setStepInstances(hierarchy())
    await doc.appendImportRecord({ stepInstances: [descriptor('late-child', 'nested')], stepInstanceId: 'late-child', displayObject: packet() })
    await doc.appendImportRecord({ stepInstanceId: 'nested', objectRecord: new Uint8Array([1]) }, { nodecAppendObject () { assert.fail('Deleted branches must not decode geometry') } })
    assert.equal(doc.importedObjectCount, 0)
    assert.equal(doc.displayedPartCount, 0)
    assert.equal(deleted.parent, null)
    assert.equal(instances(doc).has('left'), false)
    assert.equal(instances(doc).has('late-child'), false)
    assert.equal(groups.get('nested').userData.stepInstanceState, 'cancelled')
    const root = groups.get('assembly'); root.parent.remove(root)
    await doc.appendImportRecord({ stepInstanceId: 'right', displayObject: packet() })
    assert.equal(doc.importedObjectCount, 0)
    assert.equal(instances(doc).size, 0)
  } finally { doc.dispose() }
})

test('completion/cancellation release helper indexes and disposal forbids later mounting', async () => {
  for (const options of [{}, { failed: 2 }, { cancelled: true }]) {
    const doc = fixture(), helper = new StreamingStepInstances(doc)
    helper.setInstances(hierarchy())
    const group = helper.instances.get('assembly')
    helper.displayDocument('nested')
    const state = options.cancelled ? 'cancelled' : options.failed ? 'failed' : 'complete'
    assert.equal(helper.finish(options), state)
    assert.equal(group.userData.stepInstanceState, state)
    assert.equal(helper.instances.size, 0)
    assert.equal(helper.displayDocuments.size, 0)
    helper.setInstances([descriptor('late')])
    assert.equal(instances(doc).has('late'), false)
    helper.dispose(); assert.equal(helper.document, null)
    doc.dispose()
  }
  const doc = fixture()
  doc.setStepInstances(hierarchy())
  await doc.appendImportRecord({ stepInstanceId: 'left', displayObject: packet() })
  const group = instances(doc).get('left'), geometry = firstMesh(group).geometry
  let released = 0; geometry.addEventListener('dispose', () => released++)
  doc.dispose(); doc.dispose()
  assert.equal(released, 1)
  assert.equal(group.userData.stepInstanceState, 'cancelled')
  assert.equal(doc.three.middleground, null)
  assert.equal(doc.disposableResources.size, 0)
  doc.setStepInstances(hierarchy())
  await assert.rejects(doc.appendImportRecord({ stepInstances: hierarchy() }), { name: 'AbortError' })
})

test('real native edge archives mount through onObjects and preserve exact sources across header refreshes', async () => {
  const m = nativeModule = await require('../public/nodec/NodeC.js')()
  const source = new m.File3dm(), layer = new m.Layer()
  layer.name = 'Default'
  const layers = source.layers(); layers.add(layer); releaseTable(layers); layer.delete()
  const makeRecord = () => {
    const box = new m.BoundingBox([100, 0, 0], [101, 1, 1]), brep = m.Brep.createFromBoundingBox(box)
    const attributes = new m.ObjectAttributes(); attributes.layerIndex = 0
    const objects = source.objects(), id = objects.addBrep(brep, attributes), object = objects.findId(id), stored = object.attributes()
    try {
      const encoded = m.nodecEncodeAttributes(stored)
      const exactSource = { id, geometry: brep.encode(), attributes: encoded }
      const objectRecord = m.nodecTakeObject(source)
      return { stepInstanceId: 'nested',
        objectRecord,
        exactSource,
        sourceHeader: source.toByteArray(),
        edgesOnly: true,
        displayInfo: { type: 'Brep', attributes: encoded, min: [100, 0, 0], max: [101, 1, 1], faceCount: 6 },
        edgePreview: m.nodecEdgePreview(brep, 0.05, Math.PI / 16) }
    } finally { stored.delete(); object.delete(); releaseTable(objects); attributes.delete(); brep.delete(); box.delete() }
  }
  const doc = new PandaUIDoc(m.File3dm.fromByteArray(source.toByteArray()), 'Native STEP')
  try {
    doc.setStepInstances(hierarchy())
    const groups = instances(doc), root = groups.get('assembly'), parent = groups.get('nested'), roots = []
    root.visible = false; root.position.x = 9
    doc.onImportedRoot = object => { assert.equal(object.parent, parent); roots.push(object) }
    for (const displayInfo of [true, false]) {
      const record = makeRecord(), original = structuredClone(record)
      if (!displayInfo) delete record.displayInfo
      const id = await doc.appendImportRecord(record, m)
      assert.equal(id, record.exactSource.id)
      assert.deepEqual(record.exactSource, original.exactSource)
      assert.deepEqual(record.objectRecord, original.objectRecord)
      assert.deepEqual(record.edgePreview, original.edgePreview)
      assert.equal(doc.importedGeometrySources.get(id).geometry, record.exactSource.geometry)
      const model = roots[roots.length - 1]
      assert(model.userData.importedModelObject)
      assert.equal(model.userData.sourceGeometryId, id)
      assert.equal(visible(model), false)
      assert.deepEqual(model.position.toArray(), [0, 0, 0])
      model.updateWorldMatrix(true, true)
      assert.equal(model.getWorldPosition(new THREE.Vector3()).x, 9)
      assert.deepEqual(doc.getSceneObjectsOnLayer('Default'), roots, 'Every native root survives source-header invalidation; edge parts are excluded')
      assert.deepEqual(new Set(doc.getSceneObjectsOnLayer('Assembly::Part')), new Set(groups.values()))
    }
    assert.equal(roots.length, 2)
    assert.equal(doc.importedObjectCount, 2)
    assert(doc.displayedPartCount >= 2)
    assert.equal(doc.skippedObjectCount, 0)
    assert.equal(instances(doc).get('nested'), parent)
    assert.equal(root.visible, false)
    assert.equal(root.position.x, 9)
    await doc.finishImport()
    assert.equal(parent.userData.stepInstanceState, 'complete')
    assert.equal(doc.rhinoDoc, null)
  } finally { doc.dispose(); source.delete() }
})
