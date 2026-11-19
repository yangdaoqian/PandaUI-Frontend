const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), babel = require('@babel/core')
const original = Module._extensions['.js']
Module._extensions['.js'] = function (module, filename) {
  if (!filename.startsWith(path.resolve(__dirname, '../src/import') + path.sep) && !filename.startsWith(path.resolve(__dirname, '../public/nodec') + path.sep)) return original(module, filename)
  if (filename.endsWith('NodeC.js')) return original(module, filename)
  module._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, filename)
}
const StepGeometry = require('../src/import/StepGeometry').default
const { StepOpenNurbsContext, parseOpenNurbsStep, createNativeBrepWithFaceRecovery } = require('../src/import/StepOpenNurbsImport')
const { metadata } = require('../src/import/StepNativeImport')
const { decodeStepEntities } = require('../src/import/StepEntityModel')
const ProgressiveStepImport = require('../src/import/ProgressiveStepImport').default
const prepareBrepImportRecord = require('../src/import/prepareBrepImportRecord').default
const releaseTable = require('../src/import/releaseTable').default
StepGeometry.prototype.body = () => assert.fail('Native conversion must not run the separate JS display tessellator')

function assemblyFixture (cube) {
  return Buffer.from(cube.toString().replace(/ENDSEC;\s*END-ISO-10303-21;/, `
#1000=PRODUCT('Assembly','Assembly','',(#19));
#1001=PRODUCT_DEFINITION_FORMATION('','',#1000);
#1002=PRODUCT_DEFINITION('','',#1001,#15);
#1003=PRODUCT_DEFINITION_SHAPE('','',#1002);
#1004=SHAPE_DEFINITION_REPRESENTATION(#1003,#1005);
#1005=SHAPE_REPRESENTATION('Assembly',(#126),#187);
#1006=CARTESIAN_POINT('',(1000.,2000.,3000.));
#1007=DIRECTION('',(0.,1.,0.));
#1008=AXIS2_PLACEMENT_3D('',#1006,#133,#1007);
#1009=NEXT_ASSEMBLY_USAGE_OCCURRENCE('1','','',#1002,#14,$);
#1010=PRODUCT_DEFINITION_SHAPE('','',#1009);
#1011=ITEM_DEFINED_TRANSFORMATION('','',#126,#1008);
#1012=(REPRESENTATION_RELATIONSHIP('','',#22,#1005)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#1011)SHAPE_REPRESENTATION_RELATIONSHIP());
#1013=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#1012,#1010);
#1014=CARTESIAN_POINT('',(-1000.,500.,0.));
#1015=AXIS2_PLACEMENT_3D('',#1014,#133,#134);
#1016=NEXT_ASSEMBLY_USAGE_OCCURRENCE('2','','',#1002,#14,$);
#1017=PRODUCT_DEFINITION_SHAPE('','',#1016);
#1018=ITEM_DEFINED_TRANSFORMATION('','',#126,#1015);
#1019=(REPRESENTATION_RELATIONSHIP('','',#22,#1005)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#1018)SHAPE_REPRESENTATION_RELATIONSHIP());
#1020=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#1019,#1017);
ENDSEC;END-ISO-10303-21;`))
}

async function testInstances (module, cube) {
  const bytes = assemblyFixture(cube), context = new StepOpenNurbsContext(module)
  const create = module.nodecCreateBrep
  let calls = 0
  module.nodecCreateBrep = (...args) => { calls++; return create(...args) }
  try {
    const parsed = parseOpenNurbsStep(bytes, {}, context)
    assert.equal(parsed.instances.length, 3)
    assert.equal(calls, 0, 'Hierarchy must be available before conversion')
    const first = parsed.records.next().value
    assert.equal(calls, 1)
    assert.equal(first.stepInstanceId, 'step:product:1002/usage:1009')
    const second = parsed.records.next().value
    assert.equal(calls, 1, 'Repeated placements convert the definition only once')
    assert.equal(second.stepInstanceId, 'step:product:1002/usage:1016')
    assert(second.stepDefinitionReused)
    assert.notEqual(first.exactSource.id, second.exactSource.id)
    const centers = []
    for (const record of [first, second]) {
      const brep = module.CommonObject.decode(record.exactSource.geometry), bbox = brep.getBoundingBox()
      try { assert(brep.isValid && brep.isSolid); centers.push(bbox.min.map((x, i) => (x + bbox.max[i]) / 2)) } finally { bbox.delete(); brep.delete() }
    }
    // The reference cube is centred at (-10, 10, 150). Placement matrices must be
    // applied exactly once, independently for the two repeated definitions.
    assert.deepEqual(centers.map(c => c.map(Math.round)), [[990, 1990, 3150], [-1010, 510, 150]])
    assert(parsed.records.next().done)
    structuredClone(first.objectRecord, { transfer: [first.objectRecord.buffer] })
    assert(second.objectRecord.byteLength > 0, 'A transferred occurrence cannot detach its sibling')
  } finally { module.nodecCreateBrep = create; context.dispose() }
  const stream = new ProgressiveStepImport(new File([bytes], 'assembly.step'), () => assert.fail('No compatibility tessellation'), {}, async () => module)
  try {
    const header = await stream.open(() => {})
    let batch, records = [], instanceIds = new Set((header.stepInstances || []).map(n => n.id))
    do {
      batch = await stream.pull()
      for (const record of batch.records) {
        if (record.stepInstances) record.stepInstances.forEach(n => instanceIds.add(n.id))
        else {
          assert(instanceIds.has(record.stepInstanceId), 'Container must precede its first geometry')
          records.push(record)
        }
      }
      assert(batch.records.filter(r => r.objectRecord).length <= 1, 'Never hold the first completed body behind the next solve')
    } while (!batch.done)
    assert.equal(records.length, 2); assert.equal(instanceIds.size, 3)
    assert.equal(batch.stepReusedDefinitions, 1)
    assert.equal(batch.processedObjects, 2, 'Metadata barriers are not geometry objects')
  } finally { stream.dispose() }
  console.log('PASS native assembly streaming: hierarchy first, one definition solve, independent occurrences, placement, transfer and one-body packets')
}
function testRecovery () {
  const descriptor = { closed: false, faces: Array.from({ length: 8 }, (_, i) => ({ sourceEntityId: String(100 + i) })) }
  for (const strict of [false, true]) {
    createNativeBrepWithFaceRecovery({ nodecCreateBrep: spec => {
      assert.equal(spec.skipInvalidFaces, !strict, 'Small parts recover by default; strict callers must disable native recovery too')
      return {}
    } }, descriptor, { allowPartialRecovery: !strict })
  }
  for (const message of ['brep.m_L[2] is invalid', 'brep.m_F[2] is invalid']) {
    let calls = 0
    assert.throws(() => createNativeBrepWithFaceRecovery({ nodecCreateBrep: () => { calls++; throw new Error(message) } }, descriptor), /invalid/)
    assert.equal(calls, 1, 'Native topology indices must never remove a source face')
  }
  let calls = 0, saved
  const result = createNativeBrepWithFaceRecovery({ nodecCreateBrep: current => {
    calls++
    if (calls <= 2) throw new Error('STEP face 2, loop 0: Failed trim recovery')
    assert.deepEqual(current.faces.map(f => f.sourceEntityId), ['100', '101', '104', '105', '106', '107'])
    return { setUserString: (key, value) => { saved = JSON.parse(value) } }
  } }, descriptor)
  assert.deepEqual(result.skippedFaces, [2, 3])
  assert.deepEqual(saved.skippedFaces.map(f => f.entity), ['102', '103'])
  assert.throws(() => createNativeBrepWithFaceRecovery({ nodecCreateBrep: () => { throw new Error('STEP face 2: invalid') } }, descriptor, { allowPartialRecovery: false }), /invalid/)
  const largeDescriptor = { closed: false, vertices: [], edges: [], faces: Array.from({ length: 64 }, (_, i) => ({ sourceEntityId: String(1000 + i), loops: [] })) }
  const badSourceFaces = new Set(['1010', '1033'])
  let batchCalls = 0; let batchSaved
  const batchRecovery = createNativeBrepWithFaceRecovery({ nodecCreateBrep: current => {
    batchCalls++
    const badIndex = current.faces.findIndex(face => badSourceFaces.has(face.sourceEntityId))
    if (badIndex >= 0) throw new Error(`STEP face ${badIndex}: injected batch recovery failure`)
    return { delete: () => {}, setUserString: (key, value) => { batchSaved = JSON.parse(value) } }
  } }, largeDescriptor)
  assert.deepEqual(batchRecovery.skippedFaces, [10, 33])
  assert.deepEqual(batchRecovery.skippedFaceDetails.map(item => item.entity), ['1010', '1033'])
  assert(batchCalls < 32, `Batch recovery made too many native probes: ${batchCalls}`)
  assert.deepEqual(batchSaved.skippedFaces.map(item => item.entity), ['1010', '1033'])
  console.log('PASS face recovery: source identity retained, ambiguous native loop/face errors rejected, strict mode')
}

function mappedFixture (cube) {
  return Buffer.from(cube.toString().replace(/ENDSEC;\s*END-ISO-10303-21;/, `
#1000=CARTESIAN_POINT('',(10.,20.,30.));
#1001=AXIS2_PLACEMENT_3D('',#1000,#133,#134);
#1002=REPRESENTATION_MAP(#1001,#22);
#1003=CARTESIAN_POINT('',(1000.,2000.,3000.));
#1004=MAPPED_ITEM('Mirrored scaled cube',#1002,#1005);
#1005=CARTESIAN_TRANSFORMATION_OPERATOR_3DNON_UNIFORM('',#1007,#1008,#1003,2.,#133,3.,4.);
#1006=MAPPED_ITEM('Second cube',#1002,#1009);
#1007=DIRECTION('',(-1.,0.,0.));
#1008=DIRECTION('',(0.,1.,0.));
#1009=(CARTESIAN_TRANSFORMATION_OPERATOR($,$,#1011,1.)CARTESIAN_TRANSFORMATION_OPERATOR_3D($)GEOMETRIC_REPRESENTATION_ITEM()REPRESENTATION_ITEM(''));
#1010=SHAPE_REPRESENTATION('Mapped only assembly',(#1004,#1006),#187);
#1011=CARTESIAN_POINT('',(100.,200.,300.));
#1012=INVISIBILITY((#1004));
#1013=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT($,.METRE.));
#1014=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((#1013))REPRESENTATION_CONTEXT('',''));
#1020=SHAPE_REPRESENTATION('Nested metre assembly',(#1023),#1014);
#1021=CARTESIAN_POINT('',(0.,0.,0.));
#1022=AXIS2_PLACEMENT_3D('',#1021,#133,#134);
#1023=MAPPED_ITEM('Nested',#1024,#1025);
#1024=REPRESENTATION_MAP(#1022,#1010);
#1025=CARTESIAN_TRANSFORMATION_OPERATOR_3D('',$,$,#1026,1.,$);
#1026=CARTESIAN_POINT('',(2.,0.,0.));
ENDSEC;END-ISO-10303-21;`))
}

function testRecoveryArchive (module, cube) {
  const context = new StepOpenNurbsContext(module), create = module.nodecCreateBrep
  let calls = 0, sourceEntity
  module.nodecCreateBrep = descriptor => {
    if (++calls === 1) { sourceEntity = descriptor.faces[2].sourceEntityId; throw new Error('STEP face 2: injected source trim failure') }
    return create(descriptor)
  }
  try {
    const parsed = parseOpenNurbsStep(cube, {}, context), records = [...parsed.records]
    assert.deepEqual(parsed.failures, [])
    assert.equal(records.length, 1)
    assert.deepEqual(records[0].stepSkippedFaces, [2])
    const brep = module.CommonObject.decode(records[0].exactSource.geometry), faces = brep.faces()
    try {
      assert(brep.isValid && !brep.isSolid)
      assert.equal(faces.count, 5)
      const recovery = JSON.parse(brep.getUserString('PandaUI.STEP.Recovery'))
      assert.equal(recovery.skippedFaces[0].entity, sourceEntity)
      assert.equal(recovery.openedDeclaredClosedShell, true)
    } finally { faces.delete(); brep.delete() }
  } finally { module.nodecCreateBrep = create; context.dispose() }
  console.log('PASS partial native archive: five-face open Brep, skipped source entity and reason survive serialization')
}

async function testMappedInstances (module, cube) {
  const bytes = mappedFixture(cube), context = new StepOpenNurbsContext(module)
  const create = module.nodecCreateBrep
  let calls = 0
  module.nodecCreateBrep = (...args) => { calls++; return create(...args) }
  try {
    const parsed = parseOpenNurbsStep(bytes, {}, context), records = [...parsed.records]
    assert.deepEqual(parsed.failures, [])
    assert.equal(parsed.instances.length, 4)
    assert.equal(records.length, 2)
    assert.equal(calls, 1, 'Mapped occurrences share one exact definition conversion')
    const centers = [], visibility = []
    for (const record of records) {
      const brep = module.CommonObject.decode(record.exactSource.geometry), box = brep.getBoundingBox()
      const attributes = module.nodecDecodeAttributes(record.exactSource.attributes)
      try {
        assert(brep.isValid && brep.isSolid)
        centers.push(box.min.map((x, i) => Math.round((x + box.max[i]) / 2)))
        visibility.push(attributes.visible)
      } finally { attributes.delete(); box.delete(); brep.delete() }
    }
    assert.deepEqual(centers, [[3040, 1970, 3480], [2080, 190, 420]])
    assert.deepEqual(visibility, [false, true], 'Mapped invisibility must not hide a sibling definition use')
  } finally { module.nodecCreateBrep = create; context.dispose() }
  const check = text => { const entities = decodeStepEntities(Buffer.from(text)); return metadata(entities, new StepGeometry(entities)) }
  assert.throws(() => check(bytes.toString().replace('#1003,2.,#133', '#1003,0.,#133')), /mapping scale/)
  assert.throws(() => check(bytes.toString().replace('REPRESENTATION_MAP(#1022,#1010)', 'REPRESENTATION_MAP(#1022,#1020)')), /Cyclic STEP assembly/)
  assert.throws(() => check(bytes.toString().replace('GLOBAL_UNIT_ASSIGNED_CONTEXT((#1013))', 'GLOBAL_UNIT_ASSIGNED_CONTEXT((#1013,#194))')), /Conflicting geometry length units/)
  const overflow = bytes.toString().replace("#1013=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT($,.METRE.));", `
#1013=(CONVERSION_BASED_UNIT('overflow',#1030)LENGTH_UNIT()NAMED_UNIT(*));
#1030=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E308),#1031);
#1031=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.EXA.,.METRE.));`)
  assert.throws(() => check(overflow), /unit conversion is out of range/)
  assert(check(bytes.toString().replace(/FILE_SCHEMA\s*\(\([\s\S]*?\)\);/i, "FILE_SCHEMA(('UNSUPPORTED_TEST_SCHEMA'));" )).warnings.some(message => message.includes('Unrecognized schema')))
  const stream = new ProgressiveStepImport(new File([bytes], 'mapped.step'), () => assert.fail('No display-only fallback'), {}, async () => module)
  try {
    await stream.open(() => {})
    const records = []; let batch
    do { batch = await stream.pull(); records.push(...batch.records.filter(r => r.objectRecord)) } while (!batch.done)
    assert.equal(records.length, 2, 'Partitioned mapped metadata must preserve both occurrences')
    assert.equal(batch.stepReusedDefinitions, 1)
    const visibility = records.map(record => {
      const attributes = module.nodecDecodeAttributes(record.exactSource.attributes)
      try { return attributes.visible } finally { attributes.delete() }
    })
    assert.deepEqual(visibility, [false, true])
  } finally { stream.dispose() }
  console.log('PASS mapped assemblies: nested mixed units, source origin, nonuniform mirror, visibility, native solid and progressive reuse')
}

async function main () {
  testRecovery()
  const module = await require(path.resolve(__dirname, '..', process.env.NODEC_TEST_RUNTIME || 'public/nodec', 'NodeC.js'))()
  const fixtures = path.join(path.dirname(require.resolve('occt-import-js')), '../test/testfiles')
  if (!process.argv[2]) {
    const cube = fs.readFileSync(path.join(fixtures, 'simple-basic-cube/cube.stp'))
    testRecoveryArchive(module, cube)
    await testInstances(module, cube)
    await testMappedInstances(module, cube)
  }
  const inputs = process.argv[2] ? [process.argv[2]] : ['simple-basic-cube/cube.stp', 'conical-surface/conical-surface.step'].map(n => path.join(fixtures, n))
  const report = []
  for (const filename of inputs) {
    const started = performance.now(), context = new StepOpenNurbsContext(module), entries = [], failures = []
    let totalFaces = 0, auxiliaryObjects = 0
    try {
      const parsed = parseOpenNurbsStep(fs.readFileSync(filename), { tolerance: 0.05, angleTolerance: Math.PI / 16 }, context)
      for (const record of parsed.records) {
        if (record.conversionFailure) { failures.push(record.conversionFailure); console.log('FAIL', JSON.stringify(record.conversionFailure)); continue }
        if (record.displayObject) {
          assert.equal(record.stepAuxiliary, true)
          assert.equal(record.displayObject.kind, 'points')
          assert(record.displayObject.positions.length > 0)
          auxiliaryObjects++
          continue
        }
        assert(record.objectRecord.byteLength > 0); assert(record.sourceHeader.byteLength > 0)
        const brep = module.CommonObject.decode(record.exactSource.geometry), faces = brep.faces()
        assert(brep instanceof module.Brep && brep.isValid)
        assert.equal(record.displayInfo.faceCount, faces.count, 'Display metadata counts native chart patches')
        totalFaces += faces.count
        assert(Object.values(record.stepConversionTimings).every(value => Number.isFinite(value) && value >= 0))
        const diagnostics = record.stepGeometryDiagnostics
        assert(Object.values(diagnostics.detailTimings).every(value => Number.isFinite(value) && value >= 0))
        const work = diagnostics.projectionWork
        assert(diagnostics.maxFitError <= diagnostics.tolerance, 'Projection changes must preserve the original fitting budget')
        assert(diagnostics.maxSampledDeviation <= diagnostics.repairTolerance, 'Source repair ceiling is unchanged')
        assert.equal(work.total.pointEvaluations + work.total.derivativeEvaluations, diagnostics.surfaceEvaluations)
        for (const key of Object.keys(work.recovery)) assert(work.recovery[key] <= work.total[key], `Cumulative work must include recovery: ${key}`)
        entries.push({ entity: record.stepEntityId, faces: faces.count, solid: brep.isSolid, bytes: record.objectRecord.byteLength, conversionMs: record.stepConversionMs, timings: record.stepConversionTimings, diagnostics: record.stepGeometryDiagnostics })
        faces.delete(); brep.delete()
        // Metadata must describe the same stable native object ID and layer.
        const attributes = module.nodecDecodeAttributes(record.exactSource.attributes), layers = context.document.layers()
        assert.equal(attributes.id, record.exactSource.id)
        assert(attributes.layerIndex >= 0 && attributes.layerIndex < layers.count)
        // Scene mounting uses the transferred snapshot, not context.document.
        // A valid Brep with a missing serialized layer was silently skipped.
        const snapshot = module.File3dm.fromByteArray(record.sourceHeader)
        assert(snapshot, 'Native source header must decode')
        const snapshotLayers = snapshot.layers(), snapshotObjects = snapshot.objects()
        let sourceLayer, snapshotLayer
        try {
          assert.equal(snapshotLayers.count, layers.count, 'Cumulative layer tables must survive header serialization')
          assert.equal(snapshotObjects.count, 0, 'Metadata snapshots must not retain converted geometry')
          sourceLayer = layers.get(attributes.layerIndex)
          snapshotLayer = snapshotLayers.get(attributes.layerIndex)
          assert(snapshotLayer, 'The display attribute layer must exist in the transferred header')
          assert.equal(snapshotLayer.id, sourceLayer.id)
          assert.equal(snapshotLayer.fullPath, sourceLayer.fullPath)
        } finally {
          sourceLayer?.delete(); snapshotLayer?.delete()
          releaseTable(snapshotLayers); releaseTable(snapshotObjects); snapshot.delete()
        }
        attributes.delete()
        releaseTable(layers)
        if (!process.argv[2]) {
          const prepared = prepareBrepImportRecord(module, record.objectRecord, { tolerance: 0.05, angleTolerance: Math.PI / 16 }, true, true)
          assert(prepared.brepPreview?.positions.length); assert.equal(prepared.objectId, record.exactSource.id)
        }
        const { diagnostics: entryDiagnostics, ...entry } = entries.at(-1)
        console.log('OBJECT', JSON.stringify({ ...entry, sourceGap: entryDiagnostics?.sourceGap, repairedTrims: entryDiagnostics?.repairedTrims }))
      }
      assert.equal(entries.length + failures.length + auxiliaryObjects, parsed.totalObjects)
      report.push({ filename: path.basename(filename), objects: entries.length, auxiliaryObjects, faces: totalFaces, failures, totalMs: performance.now() - started, entries })
    } finally { context.dispose() }
  }
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2))
  assert(report.every(r => !r.failures.length), JSON.stringify(report.flatMap(r => r.failures)))
  if (!process.argv[2]) {
    const file = new File([fs.readFileSync(inputs[0])], 'cube.step')
    const stream = new ProgressiveStepImport(file, () => assert.fail('No mesh compatibility runtime allowed'), {}, async () => module)
    const meta = await stream.open(() => {})
    assert(meta.header.byteLength)
    let result, count = 0
    do { result = await stream.pull(); count += result.records.length; result.records.forEach(r => assert(r.objectRecord && r.edgesOnly && r.exactSource && !r.displayObject)) } while (!result.done)
    assert.equal(count, 1); assert.equal(result.stepExactObjects, 1); assert.equal(result.stepDisplayOnlyObjects, 0); assert.equal(result.stepFailedObjects, 0)
  }
  console.log('PASS OpenNURBS-first STEP import:', JSON.stringify(report.map(({ entries, ...summary }) => summary)))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
