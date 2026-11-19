/* eslint-env node */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const moduleValue = { exports: {} }
vm.runInNewContext(babel.transformSync(fs.readFileSync('src/import/CadFileImport.js', 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, { module: moduleValue, exports: moduleValue.exports, Float32Array, Uint32Array })
const { parseCad } = moduleValue.exports

function checkRecords (result, records) {
  assert(records.length > 0)
  assert.equal(records.length, result.totalObjects)
  assert.equal(new Set(records.map(record => record.displayObject.id)).size, records.length)
  for (const { displayObject: item } of records) {
    assert.equal(item.kind, 'mesh')
    assert(item.positions instanceof Float32Array)
    assert(item.positions.length > 0 && item.positions.length % 3 === 0)
    assert(item.positions.every(Number.isFinite))
    assert(item.indices instanceof Uint32Array)
    assert(item.indices.length > 0 && item.indices.length % 3 === 0)
    assert(item.indices.every(index => index < item.positions.length / 3))
    assert(item.normals instanceof Float32Array)
    assert.equal(item.normals.length, item.positions.length)
    assert(item.normals.every(Number.isFinite))
    assert(result.layers.some(layer => layer.fullPath === item.layerPath))
    assert.equal(item.color.length, 3)
    assert(item.color.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1))
    let cursor = 0
    for (const group of item.groups) {
      assert.equal(group.start, cursor, 'Groups must cover indices without gaps or overlap')
      assert(group.count > 0 && group.count % 3 === 0)
      assert(Number.isInteger(group.materialIndex) && group.materialIndex >= 0 && group.materialIndex < item.materials.length)
      const color = item.materials[group.materialIndex].color
      assert.equal(color.length, 3)
      assert(color.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1))
      cursor += group.count
    }
    assert.equal(cursor, item.indices.length)
  }
}

function bounds (records) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const { displayObject: item } of records) {
    item.positions.forEach((value, index) => {
      min[index % 3] = Math.min(min[index % 3], value)
      max[index % 3] = Math.max(max[index % 3], value)
    })
  }
  return { min, max }
}

// Execute the actual worker protocol, substituting only browser I/O and its
// imports. structuredClone transfers genuinely detach the sender's buffers.
function workerHarness (runtime) {
  const messages = [], loads = [], worker = {
    postMessage (message, transfers = []) { messages.push(structuredClone(message, { transfer: transfers })) }
  }
  const source = fs.readFileSync('src/import/LocalImport.worker.js', 'utf8').replace(/^import .*$/gm, '')
  const context = vm.createContext({
    self: worker,
    performance,
    ArrayBuffer,
    Uint8Array,
    Float32Array,
    Uint32Array,
    DataView,
    FileReaderSync: class {},
    CAD_EXTENSIONS: ['step', 'stp', 'iges', 'igs', 'brep'],
    parseCad,
    meshQualityOptions: () => ({ tolerance: 0.05, angleTolerance: Math.PI / 16 }),
    importScripts (url) {
      loads.push(url)
      assert.equal(url, '/vendor/occt/occt-import-js.js', 'CAD must not initialize NodeC')
      worker.occtimportjs = async options => {
        assert.equal(options.locateFile('occt-import-js.wasm'), '/vendor/occt/occt-import-js.wasm')
        return runtime
      }
    }
  })
  vm.runInContext(fs.readFileSync('src/import/collectTransferables.js', 'utf8').replace('export default ', '') + '\n' + source, context)
  let sequence = 0
  return {
    loads,
    async request (type, file) {
      messages.length = 0
      worker.onmessage({ data: { id: ++sequence, type, file } })
      await vm.runInContext('queue', context)
      const response = messages.find(message => message.result || message.error)
      assert(response, 'Worker must finish its request')
      assert.equal(response.id, sequence)
      return { ...response, progress: messages.filter(message => message.progress).map(message => message.progress) }
    }
  }
}

async function main () {
  const runtime = await require('occt-import-js')()
  const fixtureRoot = path.join(path.dirname(require.resolve('occt-import-js')), '../test/testfiles')
  const file = fs.readFileSync(path.join(fixtureRoot, 'simple-basic-cube/cube.stp'))
  const result = parseCad(runtime, 'step', file)
  const records = [...result.records]
  checkRecords(result, records)
  assert.equal(result.units, 'millimeter')
  const igesBytes = fs.readFileSync(path.join(fixtureRoot, 'cube-10x10mm/Cube 10x10.igs'))
  for (const extension of ['iges', 'igs']) {
    const iges = parseCad(runtime, extension, igesBytes), meshes = [...iges.records]
    checkRecords(iges, meshes)
    assert.equal(iges.units, 'millimeter')
    assert.equal(meshes.length, 1)
    assert.equal(meshes[0].displayObject.indices.length, 36)
    assert.deepEqual(bounds(meshes), { min: [-5, 0, -5], max: [5, 10, 5] }, 'IGES cube dimensions and placement must stay in millimeters')
    assert(meshes[0].displayObject.layerPath.endsWith('::Solid1'))
    assert.throws(() => parseCad(runtime, extension, new Uint8Array([0])), /no readable/)
  }
  const brepBytes = fs.readFileSync(path.join(fixtureRoot, 'cax-if-brep/as1_pe_203.brep'))
  const brep = parseCad(runtime, 'brep', brepBytes), brepRecords = [...brep.records]
  checkRecords(brep, brepRecords)
  assert.equal(brepRecords.length, 18, 'All 18 BREP solids must survive conversion')
  assert.equal(brep.units, 'model units')
  const companion = parseCad(runtime, 'stp', fs.readFileSync(path.join(fixtureRoot, 'cax-if/as1_pe_203.stp')))
  const companionRecords = [...companion.records]
  checkRecords(companion, companionRecords)
  assert.equal(companionRecords.length, 18)
  assert.deepEqual(bounds(brepRecords), bounds(companionRecords), 'BREP keeps the same assembly placements as the companion STEP')
  assert.deepEqual(bounds(brepRecords), { min: [-3810, -685.7999877929688, -1905], max: [1270, 1524, 1905] })
  brepRecords.forEach((record, index) => {
    // OCCT can pick different triangulation diagonals/order for identical
    // surfaces. Compare every part's placement, not a tessellator snapshot.
    const actual = bounds([record]), expected = bounds([companionRecords[index]])
    for (const side of ['min', 'max']) {
      actual[side].forEach((value, axis) => assert(Math.abs(value - expected[side][axis]) < 0.001, `BREP/STEP part ${index} ${side}[${axis}] placement differs`))
    }
  })
  assert.throws(() => parseCad(runtime, 'brep', new Uint8Array([0])), /no readable/)
  const worker = workerHarness(runtime)
  const open = await worker.request('open', { name: 'ASSEMBLY.BREP', size: brepBytes.length, arrayBuffer: async () => Uint8Array.from(brepBytes).buffer })
  assert.equal(open.error, undefined)
  assert.equal(open.result.header, null)
  assert.equal(open.result.totalObjects, 18)
  assert.equal(open.result.units, 'model units')
  assert.equal(open.progress.length, 2)
  const received = []
  let pulls = 0, done = false
  while (!done) {
    assert(++pulls < 30, 'Worker must finish importing BREP')
    const batch = await worker.request('pull')
    assert.equal(batch.error, undefined)
    assert(batch.result.records.length <= 16)
    received.push(...batch.result.records)
    assert.equal(batch.result.processedObjects, received.length)
    assert.equal(batch.result.sourceBytes, brepBytes.length)
    done = batch.result.done
  }
  assert(pulls >= 2, '18 BREP solids require multiple transfer batches')
  checkRecords(open.result, received)
  assert.deepEqual(bounds(received), bounds(brepRecords))
  const reopen = await worker.request('open', { name: 'cube.IGS', size: igesBytes.length, arrayBuffer: async () => Uint8Array.from(igesBytes).buffer })
  assert.equal(reopen.error, undefined)
  assert.equal(reopen.result.totalObjects, 1)
  assert.equal(worker.loads.length, 1, 'Worker reuses its OCCT runtime')
  const reopenedBatch = await worker.request('pull')
  assert.equal(reopenedBatch.error, undefined)
  assert.equal(reopenedBatch.result.records.length, 1)
  assert.deepEqual(bounds(reopenedBatch.result.records), { min: [-5, 0, -5], max: [5, 10, 5] })
  assert.throws(() => parseCad(runtime, 'step', new Uint8Array([0])), /no readable/)
  let parameters
  const fake = { ReadBrepFile (bytes, options) {
    parameters = options
    return { success: true, root: { name: 'Root', meshes: [0], children: [{ name: 'Assembly', meshes: [0] }] }, meshes: [{ attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }, index: { array: [0, 1, 2] } }] }
  } }
  const placed = parseCad(fake, 'brep', file, { tolerance: 0.2, angleTolerance: 0.3 })
  const items = [...placed.records]
  assert.equal(items.length, 2)
  assert.notEqual(items[0].displayObject.id, items[1].displayObject.id)
  assert.notEqual(items[0].displayObject.positions.buffer, items[1].displayObject.positions.buffer, 'Transfers must not detach a later placement')
  assert.equal(parameters.linearDeflection, 0.2)
  assert.equal(parameters.angularDeflection, 0.3)
  assert.equal(placed.units, 'model units')
  const duplicateAssemblies = { ReadStepFile () {
    const mesh = { attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }, index: { array: [0, 1, 2] } }
    return { success: true, root: { name: 'Root', children: ['Bracket', 'Bracket', 'Bracket (2)', 'Bracket'].map(name => ({ name, meshes: [0] })) }, meshes: [mesh] }
  } }
  const duplicateRecords = [...parseCad(duplicateAssemblies, 'step', file).records]
  assert.equal(new Set(duplicateRecords.map(record => record.displayObject.layerPath)).size, 4, 'Repeated assembly names need independently visible layer paths, including collisions with suffix-like source names')
  console.log('PASS frontend CAD: real STEP/STP, IGES/IGS and 18-solid BREP fixtures; dimensions, units, finite buffers, normals, contiguous material groups, placements, precision, malformed files; worker batching, real buffer transfers and reopen')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
