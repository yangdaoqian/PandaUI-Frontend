const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), babel = require('@babel/core')
const original = Module._extensions['.js']
Module._extensions['.js'] = function (module, filename) {
  if (!filename.startsWith(path.resolve(__dirname, '../src/import') + path.sep)) return original(module, filename)
  module._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, filename)
}
const { parseNativeStep } = require('../src/import/StepNativeImport')
const { decodeStepEntities, StepUnsupported } = require('../src/import/StepEntityModel')
const StepGeometry = require('../src/import/StepGeometry').default
const ProgressiveStepImport = require('../src/import/ProgressiveStepImport').default
const { parseCad } = require('../src/import/CadFileImport')
const fixtures = path.join(path.dirname(require.resolve('occt-import-js')), '../test/testfiles')
const wrap = text => Buffer.from("ISO-10303-21;HEADER;FILE_DESCRIPTION(('owned; #9=(test)'),'2;1');FILE_NAME('native','','','','','','');FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));ENDSEC;DATA;" + text + 'ENDSEC;END-ISO-10303-21;')

function builder () {
  const rows = []
  const entity = code => { rows.push(`#${rows.length + 1}=${code};`); return `#${rows.length}` }
  const point = p => entity(`CARTESIAN_POINT('',(${p.join(',')}))`)
  const direction = p => entity(`DIRECTION('',(${p.join(',')}))`)
  const frame = (origin = [0, 0, 0], z = [0, 0, 1], x = [1, 0, 0]) => entity(`AXIS2_PLACEMENT_3D('',${point(origin)},${direction(z)},${direction(x)})`)
  const poly = points => entity(`POLY_LOOP('',(${points.map(point).join(',')}))`)
  const bound = (loop, outer = true) => entity(`${outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',${loop},.T.)`)
  const face = (surface, loops, sense = true) => entity(`ADVANCED_FACE('',(${loops.join(',')}),${surface},${sense ? '.T.' : '.F.'})`)
  const model = faces => {
    const shell = entity(`OPEN_SHELL('',(${faces.join(',')}))`), body = entity(`SHELL_BASED_SURFACE_MODEL('Owned test',(${shell}))`)
    const unit = entity('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))')
    const context = entity(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((${unit}))REPRESENTATION_CONTEXT('',''))`)
    entity(`MANIFOLD_SURFACE_SHAPE_REPRESENTATION('Test',(${body}),${context})`)
    return wrap(rows.join('\n'))
  }
  const circleLoop = (z, radius = 5, clockwise = false) => {
    const curve = entity(`CIRCLE('',${frame([0, 0, z])},${radius})`), vertex = entity(`VERTEX_POINT('',${point([radius, 0, z])})`)
    const edge = entity(`EDGE_CURVE('',${vertex},${vertex},${curve},.T.)`), oriented = entity(`ORIENTED_EDGE('',*,*,${edge},${clockwise ? '.F.' : '.T.'})`)
    return entity(`EDGE_LOOP('',(${oriented}))`)
  }
  return { entity, point, frame, poly, bound, face, model, circleLoop, rows }
}

function metrics (records) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  let area = 0, volume = 0, triangles = 0
  for (const { displayObject: m } of records) {
    assert(m.positions.every(Number.isFinite)); assert(m.normals.every(Number.isFinite)); assert(m.indices.every(i => i < m.positions.length / 3))
    for (let i = 0; i < m.positions.length; i++) { min[i % 3] = Math.min(min[i % 3], m.positions[i]); max[i % 3] = Math.max(max[i % 3], m.positions[i]) }
    const vertex = i => Array.from(m.positions.slice(i * 3, i * 3 + 3))
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = Array.from(m.indices.slice(i, i + 3), vertex), ab = b.map((x, j) => x - a[j]), ac = c.map((x, j) => x - a[j])
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
      area += Math.hypot(...n) / 2; volume += a.reduce((s, x, j) => s + x * n[j], 0) / 6; triangles++
      const normal = m.normals.slice(m.indices[i] * 3, m.indices[i] * 3 + 3)
      assert(n.reduce((s, x, j) => s + x * normal[j], 0) >= -1e-5, 'Triangles agree with outward surface normals')
    }
  }
  return { min, max, area, volume, triangles }
}
const near = (actual, expected, error = 1e-6) => assert(Math.abs(actual - expected) <= error, `${actual} != ${expected} (+/- ${error})`)

function testPlanarHole () {
  const b = builder(), surface = b.entity(`PLANE('',${b.frame()})`)
  const outer = b.bound(b.poly([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]))
  const hole = b.bound(b.poly([[3, 3, 0], [3, 7, 0], [7, 7, 0], [7, 3, 0]]), false)
  const bytes = b.model([b.face(surface, [outer, hole])]), records = [...parseNativeStep(bytes).records]
  near(metrics(records).area, 84)
  const m = records[0].displayObject
  for (let i = 0; i < m.indices.length; i += 3) {
    const center = [0, 1].map(axis => (m.positions[m.indices[i] * 3 + axis] + m.positions[m.indices[i + 1] * 3 + axis] + m.positions[m.indices[i + 2] * 3 + axis]) / 3)
    assert(!(center[0] > 3 && center[0] < 7 && center[1] > 3 && center[1] < 7), 'Hole cannot be filled')
  }
  return bytes
}

function testCylinder () {
  const b = builder(), surface = b.entity(`CYLINDRICAL_SURFACE('',${b.frame()},5)`)
  const bytes = b.model([b.face(surface, [b.bound(b.circleLoop(0)), b.bound(b.circleLoop(10, 5, true), false)])])
  const coarse = [...parseNativeStep(bytes, { tolerance: 0.5, angleTolerance: Math.PI / 3 }).records]
  const fine = [...parseNativeStep(bytes, { tolerance: 0.01, angleTolerance: Math.PI / 36 }).records]
  assert(metrics(fine).triangles > metrics(coarse).triangles)
  near(metrics(fine).area, 100 * Math.PI, 0.2)
  for (const { displayObject: mesh } of fine) for (let i = 0; i < mesh.positions.length; i += 3) near(Math.hypot(mesh.positions[i], mesh.positions[i + 1]), 5, 1e-5)
  return bytes
}

function testNurbs () {
  const b = builder()
  const controls = [[1, 0, 0], [1, 1, 0], [0, 1, 0]].map(b.point)
  const curve = b.entity(`(BOUNDED_CURVE()B_SPLINE_CURVE(2,(${controls.join(',')}),.UNSPECIFIED.,.F.,.F.)B_SPLINE_CURVE_WITH_KNOTS((3,3),(0,1),.UNSPECIFIED.)CURVE()GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_CURVE((1,${Math.SQRT1_2},1))REPRESENTATION_ITEM(''))`)
  const row0 = [[0, 0, 0], [0, 5, 0], [0, 10, 0]].map(b.point), row1 = [[5, 0, 0], [5, 5, 5], [5, 10, 0]].map(b.point), row2 = [[10, 0, 0], [10, 5, 0], [10, 10, 0]].map(b.point)
  const surface = b.entity(`B_SPLINE_SURFACE_WITH_KNOTS('',2,2,((${row0.join(',')}),(${row1.join(',')}),(${row2.join(',')})),.UNSPECIFIED.,.F.,.F.,.F.,(3,3),(3,3),(0,1),(0,1),.UNSPECIFIED.)`)
  const boundary = b.bound(b.poly([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]))
  const bytes = b.model([b.face(surface, [boundary])])
  const geo = new StepGeometry(decodeStepEntities(bytes)), c = geo.curve({ ref: curve.slice(1) }), s = geo.surface({ ref: surface.slice(1) })
  for (const t of [0, 0.1, 0.5, 0.9, 1]) near(Math.hypot(...c.at(t)), 1, 1e-12)
  near(c.parameter(c.at(0.25)), 0.25, 1e-6)
  near(s.at(0.5, 0.5)[2], 1.25, 1e-12)
  const uv = s.inverse(s.at(0.36, 0.72)); near(uv[0], 0.36, 1e-5); near(uv[1], 0.72, 1e-5)
  const records = [...parseNativeStep(bytes, { tolerance: 0.01 }).records], m = metrics(records)
  assert(m.triangles > 2 && m.max[2] > 1.24 && m.area > 100)
  const rationalBytes = Buffer.from(bytes.toString().replace(`${surface}=B_SPLINE_SURFACE_WITH_KNOTS('',2,2,((${row0.join(',')}),(${row1.join(',')}),(${row2.join(',')})),.UNSPECIFIED.,.F.,.F.,.F.,(3,3),(3,3),(0,1),(0,1),.UNSPECIFIED.)`,
    `${surface}=(BOUNDED_SURFACE()B_SPLINE_SURFACE(2,2,((${row0.join(',')}),(${row1.join(',')}),(${row2.join(',')})),.UNSPECIFIED.,.F.,.F.,.F.)B_SPLINE_SURFACE_WITH_KNOTS((3,3),(3,3),(0,1),(0,1),.UNSPECIFIED.)GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_SURFACE(((1,1,1),(1,2,1),(1,1,1)))REPRESENTATION_ITEM('')SURFACE())`))
  const rationalSurface = new StepGeometry(decodeStepEntities(rationalBytes)).surface({ ref: surface.slice(1) })
  near(rationalSurface.at(0.5, 0.5)[2], 2, 1e-12)
  const rational = metrics([...parseNativeStep(rationalBytes, { tolerance: 0.01 }).records])
  assert(rational.max[2] > 1.99 && rational.area > m.area)
  return bytes
}

function testAnalyticEvaluators () {
  const b = builder(), placement = b.frame([10, 20, 30]), sphere = b.entity(`SPHERICAL_SURFACE('',${placement},5)`), torus = b.entity(`TOROIDAL_SURFACE('',${placement},10,2)`)
  const ellipse = b.entity(`ELLIPSE('',${placement},4,2)`)
  const g = new StepGeometry(decodeStepEntities(wrap(b.rows.join('\n'))))
  for (const id of [sphere, torus]) {
    const s = g.surface({ ref: id.slice(1) })
    for (const uv of [[0, 0], [0.3, 0.4], [-1, -0.5]]) {
      const p = s.at(...uv), recovered = s.inverse(p)
      near(recovered[0], uv[0], 1e-12); near(recovered[1], uv[1], 1e-12); near(Math.hypot(...s.normal(...uv)), 1, 1e-12)
    }
  }
  assert.throws(() => g.surface({ ref: sphere.slice(1) }).inverse([10, 20, 35]), StepUnsupported, 'Pole trims must not silently create an ambiguous chart')
  const e = g.curve({ ref: ellipse.slice(1) })
  near(e.at(Math.PI / 2)[1], 22, 1e-12); near(e.parameter(e.at(0.6)), 0.6, 1e-12)
  const c = builder(), loop = c.bound(c.poly([[0, 0, 0], [3, 0, 0], [0, 4, 0]])), face = c.entity(`FACE('',(${loop}))`)
  near(metrics([...parseNativeStep(c.model([face])).records]).area, 6)
  const circleBuilder = builder(), circleLoop = circleBuilder.circleLoop(0)
  const circleGeometry = new StepGeometry(decodeStepEntities(wrap(circleBuilder.rows.join('\n'))), { tolerance: 100, angleTolerance: Math.PI / 6 })
  const points = circleGeometry.loop({ ref: circleLoop.slice(1) })
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length]
    const change = Math.acos(Math.min(1, (a[0] * b[0] + a[1] * b[1]) / 25))
    assert(change <= Math.PI / 6 + 1e-10, 'Arc tangent-angle error includes the endpoints, not only the interior chords')
  }
}

async function testProgressiveNative (bytes) {
  let loads = 0
  const importer = new ProgressiveStepImport(new File([bytes], 'native.step'), async () => { loads++; throw new Error('OCCT must not load for native geometry') })
  await importer.open(() => {})
  let result, count = 0
  do { result = await importer.pull(); count += result.records.length } while (!result.done)
  assert(count > 0); assert.equal(loads, 0); assert(result.stepNativeParts > 0); assert.equal(result.stepFallbackParts, 0)
}

function assemblyFixture (bytes) {
  return Buffer.from(bytes.toString().replace(/ENDSEC;\s*END-ISO-10303-21;/, `
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

async function testAssemblyAndFallback (runtime) {
  const cube = fs.readFileSync(path.join(fixtures, 'simple-basic-cube/cube.stp')), bytes = assemblyFixture(cube)
  const own = [...parseNativeStep(bytes).records], baseline = [...parseCad(runtime, 'step', bytes).records]
  assert.equal(own.length, 2); assert.equal(baseline.length, 2)
  const signatures = rows => rows.map(row => { const m = metrics([row]); return [...m.min, ...m.max].map(v => Math.round(v * 1000)).join(',') }).sort()
  assert.deepEqual(signatures(own), signatures(baseline), 'Rotation and translation of repeated occurrences match OCCT')
  assert.equal(new Set(own.map(r => r.displayObject.layerPath)).size, 2)
  const first = own[0].displayObject.positions, second = own[1].displayObject.positions
  structuredClone(first, { transfer: [first.buffer] }); assert(second.byteLength > 0, 'Transferred instance does not detach another instance')
  await testProgressiveNative(bytes)
  const hidden = Buffer.from(cube.toString().replace(/ENDSEC;\s*END-ISO-10303-21;/, '#1010=INVISIBILITY((#24));ENDSEC;END-ISO-10303-21;'))
  assert.equal([...parseNativeStep(hidden).records][0].displayObject.visible, false)
  const faceHidden = Buffer.from(cube.toString().replace(/ENDSEC;\s*END-ISO-10303-21;/, '#1010=INVISIBILITY((#34));ENDSEC;END-ISO-10303-21;'))
  assert.throws(() => parseNativeStep(faceHidden), StepUnsupported, 'Unsupported visibility must fail before any native record is emitted')
  const unsupported = fs.readFileSync(path.join(fixtures, 'cube-fcstd/cube3.step'))
  assert.throws(() => parseNativeStep(unsupported), StepUnsupported)
  let loads = 0
  const stream = new ProgressiveStepImport(new File([unsupported], 'fallback.step'), async () => { loads++; return runtime })
  await stream.open(() => {})
  let batch, records = []
  do { batch = await stream.pull(); records.push(...batch.records) } while (!batch.done)
  assert(loads > 0 && batch.stepFallbackParts > 0 && batch.stepNativeFallbackReasons.length > 0)
  assert.equal(records.length, [...parseCad(runtime, 'step', unsupported).records].length, 'Fallback has no duplicate or missing objects')
}

;(async () => {
  const hole = testPlanarHole(), cylinder = testCylinder(), spline = testNurbs()
  testAnalyticEvaluators()
  for (const bytes of [hole, cylinder, spline]) await testProgressiveNative(bytes)
  const huge = decodeStepEntities(wrap("/* ignored #1=BAD(); */ #9007199254740993=CARTESIAN_POINT('name; #3 = bad ''quote''',(1.,2.,3.));"))
  assert(huge.has('9007199254740993'))
  const runtime = await require('occt-import-js')()
  await testAssemblyAndFallback(runtime)
  const reports = []
  for (const name of ['simple-basic-cube/cube.stp', 'cube-units/cube-mm.step', 'cube-units/cube-m.step', 'cube-units/cube-in.step', 'rounded-cube/rounded-cube.step', 'conical-surface/conical-surface.step']) {
    const bytes = fs.readFileSync(path.join(fixtures, name)), start = performance.now()
    const native = [...parseNativeStep(bytes).records], elapsedMs = performance.now() - start
    const baseline = [...parseCad(runtime, 'step', bytes).records], own = metrics(native), reference = metrics(baseline)
    assert.equal(native.length, baseline.length)
    for (let i = 0; i < 3; i++) { near(own.min[i], reference.min[i], 0.11); near(own.max[i], reference.max[i], 0.11) }
    near(own.area, reference.area, Math.max(0.1, reference.area * 0.025))
    near(own.volume, reference.volume, Math.max(0.1, Math.abs(reference.volume) * 0.025))
    await testProgressiveNative(bytes)
    reports.push({ name, nativeTriangles: own.triangles, occtTriangles: reference.triangles, nativeMs: Math.round(elapsedMs), areaRelativeError: Math.abs(own.area / reference.area - 1) })
  }
  assert.throws(() => parseNativeStep(wrap('#1=CSG_SOLID(\'\',#2);#2=BLOCK(\'\',#3,1.,1.,1.);')), StepUnsupported)
  console.log('PASS native STEP geometry: holes, cylinder seams, rational curve, curved B-spline surface, units, no-OCCT progressive path; differential fixtures:', JSON.stringify(reports))
})().catch(error => { console.error(error); process.exitCode = 1 })
