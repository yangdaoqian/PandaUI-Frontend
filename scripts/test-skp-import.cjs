/* eslint-env node */
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), babel = require('@babel/core')
const THREE = require('three')
const root = path.resolve(__dirname, '..')
process.chdir(root)
const originalLoader = require.extensions['.js']
require.extensions['.js'] = (module, file) => {
  if (file.endsWith(path.join('three', 'build', 'three.module.js'))) { module.exports = THREE; return }
  if (file.startsWith(path.join(root, 'src') + path.sep) || file.includes(path.join('three', 'examples', 'jsm'))) module._compile(babel.transformSync(fs.readFileSync(file, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, file)
  else originalLoader(module, file)
}
const appPath = path.join(root, 'src/PandaUIApp.js')
require.cache[appPath] = { id: appPath, filename: appPath, loaded: true, exports: { __esModule: true, default: {} } }
const { parseSketchUp, sketchUpMatrix } = require('../src/import/SketchUpImport')
const PandaUIDoc = require('../src/PandaUIDoc').default
const ImportedMaterialEditor = require('../src/render/ImportedMaterialEditor').default
const SceneSelection = require('../src/display/SceneSelection').default
const GroupEditContext = require('../src/display/GroupEditContext').default
const runtime = vm.createContext({ TextDecoder, TextEncoder, Uint8Array, Uint16Array, Uint32Array, Float32Array, Float64Array, ArrayBuffer, DataView, console, performance })
vm.runInContext(fs.readFileSync('public/shared/skp/PandaSkp.js', 'utf8'), runtime)
const decoder = runtime.PandaSkp
const matrix = new THREE.Matrix4().makeTranslation(2, 3, 4).toArray()
const close = (a, b, tolerance = 1e-6) => a.forEach((v, i) => assert(Math.abs(v - b[i]) < tolerance, `${a} != ${b}`))

function definition () { return { vertices: [], edges: [], faces: [], instances: [] } }
function face (d, loops, options = {}) {
  const uses = loops.map(points => {
    const first = d.vertices.length
    points.forEach(([x, y, z]) => d.vertices.push({ id: d.vertices.length, x, y, z }))
    return points.map((_, i) => {
      const id = d.edges.length
      d.edges.push({ id, v1Id: first + i, v2Id: first + (i + 1) % points.length, ...options })
      return { edgeId: id, orientation: 1 }
    })
  })
  d.faces.push({ id: d.faces.length, loops: uses, normal: [0, 0, 1], materialId: null, ...options })
}
const square = z => [[0, 0, z], [10, 0, z], [10, 10, z], [0, 10, z]]
function fixture () {
  const child = definition(), top = definition()
  face(child, [square(0), [[3, 3, 0], [3, 7, 0], [7, 7, 0], [7, 3, 0]]], { materialId: 1 })
  face(child, [square(1)], { hidden: true })
  face(child, [square(2)], { layer: 'Hidden tag' })
  face(child, [square(3)], { smooth: true, soft: true })
  top.instances.push({ refIdx: 1, name: 'Visible', matrix }, { refIdx: 1, name: 'Hidden', matrix: new THREE.Matrix4().makeScale(-1, 2, 1).toArray(), hidden: true })
  return { root: top, definitions: new Map([[1, child]]), materialsById: new Map([[1, { name: 'Red lacquer', color: { r: 255, g: 0, b: 0 }, transparency: 0.3 }]]), layers: [{ name: 'Hidden tag', hidden: true }] }
}
function area (packet) {
  if (packet.kind !== 'mesh') return 0
  let sum = 0
  const p = packet.positions, idx = packet.indices
  for (let i = 0; i < idx.length; i += 3) {
    const a = new THREE.Vector3().fromArray(p, idx[i] * 3), b = new THREE.Vector3().fromArray(p, idx[i + 1] * 3), c = new THREE.Vector3().fromArray(p, idx[i + 2] * 3)
    sum += b.sub(a).cross(c.sub(a)).length() / 2
  }
  return sum
}
const effective = object => { for (let p = object; p; p = p.parent) if (!p.visible) return false; return true }
async function main () {
  close(sketchUpMatrix([1, 0, 0, 0, 1, 0, 0, 0, 1, 10, 20, 30, 2]), [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0.508, 1.016, 1.524, 1])
  assert.throws(() => sketchUpMatrix([1, 2]), /Invalid/)
  assert.throws(() => decoder.parseSkp(new ArrayBuffer(32)))
  // Independent SDK oracle: unequal corner angles must not get a simple
  // arithmetic average. Two perpendicular triangles share a smooth edge.
  const fold = definition()
  fold.vertices = [[0, 0, 0], [4, 0, 0], [0, 4, 0], [0, 0, 2]].map(([x, y, z], id) => ({ id, x, y, z }))
  fold.edges = [[0, 1], [1, 2], [2, 0], [0, 3], [3, 1]].map(([v1Id, v2Id], id) => ({ id, v1Id, v2Id, smooth: id === 0 }))
  fold.faces = [{ normal: [0, 0, 1], loops: [[0, 1, 2].map(edgeId => ({ edgeId, orientation: 1 }))] }, { normal: [0, 1, 0], loops: [[{ edgeId: 3, orientation: 1 }, { edgeId: 4, orientation: 1 }, { edgeId: 0, orientation: -1 }]] }]
  const smoothModel = { root: fold, definitions: new Map(), materialsById: new Map(), layers: [] }
  const smooth = [...parseSketchUp({ ...decoder, parseSkp: () => smoothModel }, new ArrayBuffer(0), 'Fold').records].find(r => r.displayObject?.kind === 'mesh').displayObject
  for (let i = 0; i < smooth.positions.length; i += 3) {
    if (Math.abs(smooth.positions[i] - 4 * 0.0254) < 1e-7) close([...smooth.normals.slice(i, i + 3)], [0, 0.5083625004309731, 0.8611431751779542])
    if ([...smooth.positions.slice(i, i + 3)].every(v => v === 0)) close([...smooth.normals.slice(i, i + 3)], [0, Math.SQRT1_2, Math.SQRT1_2])
  }
  const source = fixture()
  const parsed = parseSketchUp({ ...decoder, parseSkp: () => source }, new ArrayBuffer(0), 'Fixture')
  const records = [...parsed.records].filter(r => r.displayObject)
  assert.equal(parsed.totalObjects, 2)
  assert.equal(parsed.progress().processedObjects, 2)
  assert.equal(parsed.progress().skippedFaces, 0)
  const hole = records.find(r => r.displayObject.color?.[0] === 1).displayObject
  close([area(hole)], [84 * 0.0254 ** 2])
  assert.equal(hole.opacity, 0.3)
  assert.equal(records.filter(r => r.displayObject.objectId === 'skp/root/0' && r.displayObject.kind === 'lines').reduce((n, r) => n + r.displayObject.positions.length / 6, 0), 16, 'Soft/smooth edges excluded; explicit hidden and tag-hidden retained')
  const doc = new PandaUIDoc({ layers: () => ({ count: 0 }), delete () {} }, 'SKP fixture')
  doc.setImportMetadata(parsed)
  for (const record of records) await doc.appendImportRecord(record)
  const roots = doc.three.middleground.children.filter(r => r.userData.importedModelObject)
  assert.equal(roots.length, 2, 'Batches join one editable root per occurrence')
  const hidden = roots.find(r => r.name === 'Hidden')
  assert(hidden && !hidden.visible)
  const features = [], topology = [], hiddenMeshes = [], shownMeshes = []
  roots[0].traverse(o => {
    if (o.isMesh) (effective(o) ? shownMeshes : hiddenMeshes).push(o)
    if (o.isLineSegments && o.userData.sharpEdge) features.push(o)
    if (o.userData.meshGeometryEdges) topology.push(o)
  })
  assert.equal(shownMeshes.length, 2)
  assert.equal(hiddenMeshes.length, 1, 'Hidden face and hidden tag share one hidden bucket')
  assert(topology.every(o => !o.visible), 'Mesh topology starts off')
  assert(features.every(o => o.material.isLineDashedMaterial && o.geometry.attributes.lineDistance))
  const red = shownMeshes.find(o => o.userData.displayMaterials.render.color.r === 1)
  assert.equal(red.userData.displayMaterials.shading.opacity, 1)
  assert.equal(red.userData.displayMaterials.render.opacity, 0.3)
  assert.equal(red.userData.displayMaterials.render.name, 'Red lacquer')
  doc.setMeshEdgeVisibility(true)
  assert(topology.some(effective))
  doc.setMeshEdgeVisibility(false)
  doc.setEdgeVisibility(false)
  assert(features.every(o => !o.visible))
  doc.setEdgeVisibility(true)
  doc.setRenderMode(true)
  doc.setRenderMode(false)
  assert(hiddenMeshes.every(o => !effective(o)))
  assert(!effective(hidden), 'Display toggles cannot unhide hidden instances')
  const preview = new THREE.Scene()
  let selection
  const services = {
    getTransformTarget: object => object, getActiveModel: () => doc, getPreviewScene: () => preview,
    getSelectionHighlight: () => selection.highlight, getSceneRevision: () => 1,
    setSelectedObject: object => selection.setSelectedObject(object), setDirtyFlag () {},
    captureSelection () {}, clearMaterialSelection () {}, getSelectedMaterialSettings: () => null,
    isPicking: () => false, attachGumball () {}, detachGumball () {}, notifySelectionChanged () {},
    ui: { clearSelection () {} }
  }
  selection = new SceneSelection(services)
  const edit = new GroupEditContext(services)
  assert(edit.enterGroupEditLevel(roots[0]))
  const member = edit.directChildUnder(roots[0], red)
  selection.setSelectedObject(member)
  const overlay = selection.highlight
  assert(overlay, 'A mesh-only member inside a progressive instance must highlight')
  assert.equal(overlay.children.length, 1)
  assert.notEqual(overlay.children[0].geometry, red.geometry)
  assert(overlay.children[0].isLineSegments)
  assert.equal(overlay.children[0].geometry.attributes.position.count, 16, 'Hole face has eight boundary edges; no triangulation diagonals')
  assert.equal(overlay.children[0].material.color.getHex(), 0xffff00)
  assert.equal(overlay.children[0].material.opacity, 1)
  edit.refreshGroupEditIsolation()
  assert.equal(overlay.children[0].material.opacity, 1, 'Isolation must not dim the selection overlay')
  const originalMatrix = member.matrix.clone()
  member.matrix.elements[12] += 2
  member.updateWorldMatrix(true, true)
  selection.refreshSelectionHighlight()
  assert.deepEqual(selection.highlight.children[0].matrix.toArray(), red.matrixWorld.toArray())
  let geometryDisposed = false
  const disposed = () => { geometryDisposed = true }
  red.geometry.addEventListener('dispose', disposed)
  let outlineDisposed = false
  selection.highlight.children[0].geometry.addEventListener('dispose', () => { outlineDisposed = true })
  selection.setSelectedObject(null)
  assert.equal(geometryDisposed, false, 'Clearing highlight must preserve source geometry')
  assert.equal(outlineDisposed, true, 'Clearing highlight must release derived outline geometry')
  red.geometry.removeEventListener('dispose', disposed)
  member.matrix.copy(originalMatrix); member.updateWorldMatrix(true, true)
  edit.clearGroupEditMode()
  const rangeGeometry = new THREE.BufferGeometry()
  rangeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0], 3))
  rangeGeometry.setIndex([0, 1, 2, 3, 4, 5]); rangeGeometry.setDrawRange(0, 3)
  const rangeMesh = new THREE.Mesh(rangeGeometry, new THREE.MeshBasicMaterial())
  rangeMesh.userData.selectionRole = 'brepFace'
  selection.setSelectedObject(rangeMesh)
  assert(selection.highlight.children.every(o => o.isLineSegments), 'Face selection highlights edges only')
  const outlinePositions = selection.highlight.children[0].geometry.attributes.position
  assert.equal(outlinePositions.count, 6)
  for (let i = 0; i < outlinePositions.count; i++) assert(outlinePositions.getX(i) <= 1, 'Do not highlight another material draw range')
  selection.setSelectedObject(null); rangeGeometry.dispose(); rangeMesh.material.dispose()
  // One large instance must publish edges before triangulation, then partial
  // meshes before the final face; changing material mid-import affects late batches.
  const large = fixture(), component = large.definitions.get(1)
  large.root.instances.length = 1
  component.faces = Array.from({ length: 10000 }, (_, id) => ({ ...component.faces[0], id }))
  const totalFaces = component.faces.length
  let triangulated = 0
  const stream = parseSketchUp({ ...decoder, triangulate: (...args) => { triangulated++; return decoder.triangulate(...args) }, parseSkp: () => large }, new ArrayBuffer(0), 'Large instance')
  const target = new PandaUIDoc({ layers: () => ({ count: 0 }), delete () {} }, 'Large instance')
  const first = stream.records.next().value
  assert.equal(first.displayObject.kind, 'lines'); assert.equal(triangulated, 0)
  await target.appendImportRecord(first)
  let early
  while (!early) { const value = stream.records.next().value; if (value.displayObject?.kind === 'mesh') early = value }
  assert(triangulated < totalFaces, 'Must not triangulate an entire definition before emitting its first mesh')
  await target.appendImportRecord(early)
  const editor = new ImportedMaterialEditor({ documents: () => [target], source: m => m.userData.displayMaterials?.render || m.material, edit: action => action(), invalidate () {} })
  const catalog = editor.catalog()
  assert.equal(catalog.length, 1); assert.equal(catalog[0].name, 'Red lacquer')
  await editor.update(catalog[0].key, { roughness: 0.23, color: '#00ff00' })
  const largeRoot = target.three.middleground.children.find(r => r.userData.importedModelObject)
  largeRoot.position.x += 7
  const before = largeRoot.children.length
  for (const value of stream.records) if (value.displayObject) await target.appendImportRecord(value)
  assert(largeRoot.children.length > before)
  assert.equal(target.three.middleground.children.filter(r => r.userData.importedModelObject).length, 1)
  assert.equal(largeRoot.userData.geometryType, 'Mesh')
  assert.equal(largeRoot.position.x, sketchUpMatrix(matrix)[12] + 7, 'Incoming batches must preserve user transforms')
  const renderMaterials = new Set()
  largeRoot.traverse(o => { if (o.isMesh) renderMaterials.add(o.userData.displayMaterials.render) })
  assert.equal(renderMaterials.size, 1, 'All batches reference the same edited library material')
  assert.equal([...renderMaterials][0].roughness, 0.23)
  close([...renderMaterials][0].color.toArray(), [0, 1, 0])
  assert.equal(editor.catalog().length, 1)
  editor.dispose(); target.dispose()
  // Buffers from one placement can transfer without invalidating the next.
  const transferred = structuredClone(records[0], { transfer: [records[0].displayObject.positions.buffer] })
  assert(transferred.displayObject.positions.length > 0)
  assert(records.find(r => r.displayObject.objectId === 'skp/root/1').displayObject.positions.length > 0)
  // Retain valid faces and source edges if one face has broken topology.
  const invalid = fixture(); invalid.definitions.get(1).faces[0].loops[0][0].edgeId = 9999
  const partial = parseSketchUp({ ...decoder, parseSkp: () => invalid }, new ArrayBuffer(0), 'Partial')
  assert([...partial.records].length > 0); assert.equal(partial.progress().skippedFaces, 2); assert(partial.progress().importWarnings.length)
  const cyclic = fixture(); cyclic.definitions.get(1).instances.push({ refIdx: 1 })
  const cycle = parseSketchUp({ ...decoder, parseSkp: () => cyclic }, new ArrayBuffer(0), 'Cycle')
  assert([...cycle.records].length); assert(cycle.progress().importWarnings.some(w => /recursive/.test(w)))
  // Decode a shared component only when pulling its geometry, keep it alive
  // for both placements, then release it without dropping either occurrence.
  const deferred = fixture(), pending = deferred.definitions.get(1)
  const saved = { vertices: pending.vertices, edges: pending.edges, faces: pending.faces }
  pending.vertices = []; pending.edges = []; pending.faces = []; pending.hasGeometry = true
  let loads = 0
  pending.loadGeometry = function () { loads++; Object.assign(this, saved); this.loadGeometry = null }
  const lazy = parseSketchUp({ ...decoder, parseSkp: () => deferred }, new ArrayBuffer(0), 'Deferred')
  assert.equal(loads, 0, 'Metadata must not decode component geometry')
  const lazyPackets = [...lazy.records].filter(r => r.displayObject)
  assert.equal(loads, 1, 'Shared component geometry must decode once')
  assert.equal(new Set(lazyPackets.map(r => r.displayObject.objectId)).size, 2)
  assert.equal(lazy.progress().skippedFaces, 0)
  assert.equal(pending.faces.length, 0, 'Finished component must not retain its face graph')
  for (const file of process.argv.slice(2)) {
    const bytes = fs.readFileSync(file), result = parseSketchUp(decoder, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), path.basename(file))
    const packets = [...result.records].filter(r => r.displayObject).map(r => r.displayObject)
    assert(packets.length); assert.equal(result.progress().skippedFaces, 0)
    assert(packets.every(p => p.positions.every(Number.isFinite)))
    console.log(JSON.stringify({ file: path.basename(file), objects: result.totalObjects, packets: packets.length, triangles: packets.reduce((n, p) => n + (p.indices?.length || 0) / 3, 0), area: packets.reduce((n, p) => n + area(p), 0), ...result.progress() }))
  }
  doc.dispose()
  console.log('PASS SKP: holes, units, transforms, material opacity, hidden tags/faces/instances, edge modes, transfer ownership, partial failure, cycle protection; real file decoding when paths supplied.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
