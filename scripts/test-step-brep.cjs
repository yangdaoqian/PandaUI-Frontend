const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), babel = require('@babel/core')
const original = Module._extensions['.js']
Module._extensions['.js'] = function (module, filename) {
  if (!filename.startsWith(path.resolve(__dirname, '../src/import') + path.sep) && !filename.endsWith(path.join('collaboration', 'FrontendGeometryPublisher.js'))) return original(module, filename)
  const source = fs.readFileSync(filename, 'utf8').replace(/import\.meta\.url/g, JSON.stringify('file://' + filename.replace(/\\/g, '/')))
  module._compile(babel.transformSync(source, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, filename)
}
const { parseNativeStep } = require('../src/import/StepNativeImport')
const { decodeStepEntities } = require('../src/import/StepEntityModel')
const StepBrep = require('../src/import/StepBrep').default
const buildRevolvedTrims = require('../src/import/StepRevolvedTrim').default
const ProgressiveStepImport = require('../src/import/ProgressiveStepImport').default
const fixtures = path.join(path.dirname(require.resolve('occt-import-js')), '../test/testfiles')
const near = (a, b, tol = 1e-5) => assert(Math.abs(a - b) <= tol, `${a} != ${b}`)

function builder () {
  const rows = []
  const entity = code => { rows.push(`#${rows.length + 1}=${code};`); return `#${rows.length}` }
  const point = p => entity(`CARTESIAN_POINT('',(${p.join(',')}))`)
  const direction = d => entity(`DIRECTION('',(${d.join(',')}))`)
  const line = (p, d) => entity(`LINE('',${point(p)},${entity(`VECTOR('',${direction(d)},1)`)})`)
  const frame = (p = [0, 0, 0], z = [0, 0, 1], x = [1, 0, 0]) => entity(`AXIS2_PLACEMENT_3D('',${point(p)},${direction(z)},${direction(x)})`)
  const poly = points => entity(`POLY_LOOP('',(${points.map(point).join(',')}))`)
  const bound = (loop, outer = true) => entity(`${outer ? 'FACE_OUTER_BOUND' : 'FACE_BOUND'}('',${loop},.T.)`)
  const finish = body => {
    const unit = entity('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))'), context = entity(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((${unit}))REPRESENTATION_CONTEXT('',''))`)
    entity(`MANIFOLD_SURFACE_SHAPE_REPRESENTATION('Test',(${body}),${context})`)
    return { bytes: Buffer.from("ISO-10303-21;HEADER;FILE_DESCRIPTION(('owned fixture'),'2;1');FILE_NAME('','','','','','','');FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));ENDSEC;DATA;" + rows.join('\n') + 'ENDSEC;END-ISO-10303-21;'), body: body.slice(1) }
  }
  const model = (surface, loops) => {
    const face = entity(`ADVANCED_FACE('',(${loops.join(',')}),${surface},.T.)`), shell = entity(`OPEN_SHELL('',(${face}))`), body = entity(`SHELL_BASED_SURFACE_MODEL('Brep test',(${shell}))`)
    return finish(body)
  }
  return { entity, point, direction, line, frame, poly, bound, model, finish }
}

function cavityFixture (orientation) {
  const b = builder()
  const cube = radius => {
    const p = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(p => p.map(v => v * radius))
    const faces = [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(ids =>
      b.entity(`FACE('',(${b.bound(b.poly(ids.map(i => p[i])))}))`))
    return b.entity(`CLOSED_SHELL('',(${faces.join(',')}))`)
  }
  const outer = cube(10), inner = cube(3)
  const oriented = b.entity(`ORIENTED_CLOSED_SHELL('',*,${inner},${orientation})`)
  return b.finish(b.entity(`BREP_WITH_VOIDS('Cavity',${outer},(${oriented}))`))
}

function torusPatch () {
  const b = builder(), major = 10, minor = 2, u0 = .2, u1 = 1.1, v0 = .3, v1 = 1.2
  const surface = b.entity(`TOROIDAL_SURFACE('',${b.frame()},${major},${minor})`)
  const at = (u, v) => [(major + minor * Math.cos(v)) * Math.cos(u), (major + minor * Math.cos(v)) * Math.sin(u), minor * Math.sin(v)]
  const corners = [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]
  const vertices = corners.map(([u,v]) => b.entity(`VERTEX_POINT('',${b.point(at(u,v))})`))
  const edges = []
  for (const [i,j,horizontal] of [[0,1,true],[1,2,false],[3,2,true],[0,3,false]]) {
    const [u,v] = corners[i]
    const frame = horizontal ? b.frame([0,0,minor*Math.sin(v)]) : b.frame([major*Math.cos(u),major*Math.sin(u),0], [Math.sin(u),-Math.cos(u),0], [Math.cos(u),Math.sin(u),0])
    const circle = b.entity(`CIRCLE('',${frame},${horizontal ? major+minor*Math.cos(v) : minor})`)
    const uv = b.line([u,v], horizontal ? [1,0] : [0,1])
    const context = b.entity("(GEOMETRIC_REPRESENTATION_CONTEXT(2)PARAMETRIC_REPRESENTATION_CONTEXT()REPRESENTATION_CONTEXT('',''))")
    const rep = b.entity(`DEFINITIONAL_REPRESENTATION('',(${uv}),${context})`)
    const pc = b.entity(`PCURVE('',${surface},${rep})`)
    const curve = b.entity(`SURFACE_CURVE('',${circle},(${pc}),.CURVE_3D.)`)
    edges.push(b.entity(`EDGE_CURVE('',${vertices[i]},${vertices[j]},${curve},.T.)`))
  }
  const uses = edges.map((edge,i) => b.entity(`ORIENTED_EDGE('',*,*,${edge},${i<2?'.T.':'.F.'})`))
  return b.model(surface, [b.bound(b.entity(`EDGE_LOOP('',(${uses.join(',')}))`))])
}

function testCavitiesAndTori (runtime) {
  for (const orientation of ['.T.', '.F.']) {
    const sample = cavityFixture(orientation)
    const spec = new StepBrep(decodeStepEntities(sample.bytes), { recoverTrims: true }).body(sample.body)
    assert.equal(spec.faces.length, 12)
    assert(!spec.skippedFaces?.length)
    const brep = runtime.nodecCreateBrep(spec), restored = runtime.CommonObject.decode(brep.encode()), faces = restored.faces()
    try {
      assert(restored.isValid && restored.isSolid)
      assert.equal(faces.count, 12)
      for (let i=0;i<12;i++) {
        const face = faces.get(i)
        try {
          const point = face.pointAt(0,0), n = face.normalAt(0,0)
          const signed = point.reduce((s,v,k) => s+v*n[k],0) * (face.orientationIsReversed ? -1 : 1)
          assert.equal(Math.sign(signed), i<6 || orientation==='.T.' ? 1 : -1, 'Void normals must reverse only for .F., including after archive roundtrip')
        } finally { face.delete() }
      }
    } finally { faces.delete(); restored.delete(); brep.delete() }
  }
  const sample = torusPatch(), spec = new StepBrep(decodeStepEntities(sample.bytes), { recoverTrims: true }).body(sample.body)
  assert(spec.faces[0].loops[0].trims.every(t => t.curve.type === 'pullback'), 'Angular STEP pcurves cannot be used on rational-circle parameters')
  const brep = runtime.nodecCreateBrep(spec), surfaces = brep.surfaces(), surface = surfaces.get(0)
  try {
    assert(brep.isValid)
    const info = JSON.parse(brep.getUserString('nodec.step.pullback'))
    assert.equal(info.recoveredTrims, 4)
    assert(info.maxFitError <= spec.tolerance)
    for (const u of [.13,.77,1.3,2.5,4.7]) for (const v of [.17,.91,1.7,3.6,5.7]) {
      const p = surface.pointAt(u,v)
      near((Math.hypot(p[0],p[1])-10)**2+p[2]**2, 4, 1e-8)
    }
  } finally { surface.delete(); surfaces.delete(); brep.delete() }
  console.log('PASS owned cavity orientation and torus angular-pcurve regression')
}

function hole () {
  const b = builder(), surface = b.entity(`PLANE('',${b.frame()})`)
  return b.model(surface, [b.bound(b.poly([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]])), b.bound(b.poly([[3, 3, 0], [3, 7, 0], [7, 7, 0], [7, 3, 0]]), false)])
}

function circleHole () {
  const b = builder(), frame = b.frame(), surface = b.entity(`PLANE('',${frame})`)
  const loop = radius => {
    const vertex = b.entity(`VERTEX_POINT('',${b.point([radius, 0, 0])})`), circle = b.entity(`CIRCLE('',${frame},${radius})`)
    const edge = b.entity(`EDGE_CURVE('',${vertex},${vertex},${circle},.T.)`), oe = b.entity(`ORIENTED_EDGE('',*,*,${edge},.T.)`)
    return b.entity(`EDGE_LOOP('',(${oe}))`)
  }
  return b.model(surface, [b.bound(loop(10)), b.bound(loop(4), false)])
}

function spline () {
  const b = builder(), points = [0, 5, 10].map(x => [0, 5, 10].map(y => b.point([x, y, x === 5 && y === 5 ? 5 : 0])))
  const net = points.map(row => `(${row.join(',')})`).join(',')
  const surface = b.entity(`(BOUNDED_SURFACE()B_SPLINE_SURFACE(2,2,(${net}),.UNSPECIFIED.,.F.,.F.,.F.)B_SPLINE_SURFACE_WITH_KNOTS((3,3),(3,3),(0,1),(0,1),.UNSPECIFIED.)GEOMETRIC_REPRESENTATION_ITEM()RATIONAL_B_SPLINE_SURFACE(((1,1,1),(1,2,1),(1,1,1)))REPRESENTATION_ITEM('')SURFACE())`)
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]], vertices = corners.map(p => b.entity(`VERTEX_POINT('',${b.point([p[0] * 10, p[1] * 10, 0])})`)), edges = []
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, p = corners[i], d = corners[j].map((v, n) => v - p[n])
    const uv = b.line(p, d), context = b.entity("(GEOMETRIC_REPRESENTATION_CONTEXT(2)PARAMETRIC_REPRESENTATION_CONTEXT()REPRESENTATION_CONTEXT('',''))")
    const rep = b.entity(`DEFINITIONAL_REPRESENTATION('',(${uv}),${context})`), pc = b.entity(`PCURVE('',${surface},${rep})`)
    const line3 = b.line([p[0] * 10, p[1] * 10, 0], [...d, 0]), c = b.entity(`SURFACE_CURVE('',${line3},(${pc}),.PCURVE_S1.)`)
    const edge = b.entity(`EDGE_CURVE('',${vertices[i]},${vertices[j]},${c},.T.)`)
    edges.push(b.entity(`ORIENTED_EDGE('',*,*,${edge},.T.)`))
  }
  return b.model(surface, [b.bound(b.entity(`EDGE_LOOP('',(${edges.join(',')}))`))])
}

function analyticStrip ({ cone = false, separateRings = false, start = 0, span = 2 * Math.PI, rotated = false } = {}) {
  const b = builder(), slope = cone ? (cone < 0 ? -0.3 : 0.3) : 0, radius = 5, height = 10
  const origin = rotated ? [17, -9, 5] : [0, 0, 0], x = rotated ? [0, 0, 1] : [1, 0, 0], y = rotated ? [1, 0, 0] : [0, 1, 0], z = rotated ? [0, 1, 0] : [0, 0, 1]
  const world = (px, py, pz) => origin.map((v, i) => v + x[i] * px + y[i] * py + z[i] * pz)
  const at = (u, h) => world((radius + slope * h) * Math.cos(u), (radius + slope * h) * Math.sin(u), h)
  const vertex = p => b.entity(`VERTEX_POINT('',${b.point(p)})`), full = Math.abs(span - 2 * Math.PI) < 1e-10
  const p0 = at(start, 0), p1 = at(start + span, 0), p2 = at(start + span, height), p3 = at(start, height)
  const v0 = vertex(p0), v1 = full ? v0 : vertex(p1), v3 = vertex(p3), v2 = full ? v3 : vertex(p2)
  const edge = (a, c, geometry) => b.entity(`EDGE_CURVE('',${a},${c},${geometry},.T.)`)
  const oriented = (edge, reverse = false) => b.entity(`ORIENTED_EDGE('',*,*,${edge},${reverse ? '.F.' : '.T.'})`)
  const ring = (h, a, c) => edge(a, c, b.entity(`CIRCLE('',${b.frame(world(0, 0, h), z, x)},${radius + slope * h})`))
  const bottom = ring(0, v0, v1), top = ring(height, v3, v2)
  const loop = items => b.entity(`EDGE_LOOP('',(${items.join(',')}))`)
  let bounds
  if (separateRings) bounds = [b.bound(loop([oriented(bottom)])), b.bound(loop([oriented(top, true)]), false)]
  else {
    const right = edge(v1, v2, b.line(p1, p2.map((v, i) => v - p1[i])))
    const left = full ? right : edge(v0, v3, b.line(p0, p3.map((v, i) => v - p0[i])))
    bounds = [b.bound(loop([oriented(bottom), oriented(right), oriented(top, true), oriented(left, true)]))]
  }
  const surface = b.entity(cone ? `CONICAL_SURFACE('',${b.frame(origin, z, x)},${radius},${Math.atan(slope)})` : `CYLINDRICAL_SURFACE('',${b.frame(origin, z, x)},${radius})`)
  return { ...b.model(surface, bounds), cone, full, radius, slope, height, at, start, span }
}

function periodicNurbsCylinder () {
  // Owned construction: an exact rational circle extruded along Z. The seam
  // follows a quarter circle in XY, lifted into z = h/2 * (1 - x/r + y/r).
  // Its two uses bound u=[0,5] on a surface with period 4, so relocating the
  // surface seam alone cannot work: this face must become two charts.
  const sample = analyticStrip(), { radius: r, height: h } = sample
  const spec = new StepBrep(decodeStepEntities(sample.bytes)).body(sample.body)
  const side = spec.faces[0], [bottom, seam, top] = side.loops[0].trims
  const ring = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]]
  const weights = ring.map((_, i) => i % 2 ? Math.SQRT1_2 : 1)
  side.surface = {
    type: 'nurbs', degrees: [2, 1],
    points: ring.map(([x, y]) => [[r * x, r * y, 0], [r * x, r * y, h]]),
    weights: weights.map(w => [w, w]),
    knots: [[0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], [0, 0, 1, 1]]
  }
  const seamEdge = spec.edges[seam.edge]
  spec.vertices[seamEdge.vertices[1]] = [0, r, h]
  seamEdge.curve = {
    type: 'nurbs', degree: 2, points: [[r, 0, 0], [r, r, h / 2], [0, r, h]],
    weights: [1, Math.SQRT1_2, 1], knots: [0, 0, 0, 1, 1, 1]
  }
  spec.edges[top.edge].curve.interval = [Math.PI / 2, Math.PI * 2.5]
  for (const trim of side.loops[0].trims) trim.curve = { type: 'pullback' }
  const cap = (edge, z, reverse) => ({
    surface: { type: 'plane', frame: { origin: [0, 0, z], x: [1, 0, 0], y: [0, 1, 0] }, domain: [[-r, r], [-r, r]] },
    loops: [{ outer: true, trims: [{ edge, reverse: false }] }], reverse
  })
  // Visit both planar caps BEFORE discovering the side's chart intersections.
  spec.faces = [cap(bottom.edge, 0, true), cap(top.edge, h, false), side]
  spec.closed = true
  spec.tolerance = 0.001
  return { spec, radius: r, height: h }
}

function checkPeriodicNurbsCylinder (brep, { spec, radius: r, height: h }) {
  assert(brep.isValid && brep.isSolid && brep.isManifold, 'Chart subdivision must preserve the closed cylinder')
  const info = JSON.parse(brep.getUserString('nodec.step.pullback'))
  assert.equal(info.chartSplits, 1)
  assert(info.maxFitError <= spec.tolerance, JSON.stringify(info))
  assert(info.sourceGap < 1e-9, 'The owned source curves lie exactly on the cylinder')
  assert.equal(info.repairedTrims, 0); assert.equal(info.repairedEdges, 0); assert.equal(info.repairedVertices, 0)
  // Independent rational quadratic circle evaluator, including whole-period
  // translation after exact seam relocation. NURBS u is NOT a polar angle.
  const circleAt = u => {
    u = ((u % 4) + 4) % 4
    const quadrant = Math.floor(u), t = u - quadrant, a = (1 - t) ** 2, b = 2 * Math.SQRT1_2 * t * (1 - t), c = t * t
    const x = r * (a + b) / (a + b + c), y = r * (b + c) / (a + b + c)
    return [[x, y], [-y, x], [-x, -y], [y, -x]][quadrant]
  }
  const samePoint = (actual, expected) => actual.forEach((p, i) => near(p, expected[i], 1e-9))
  const fractions = [0, 0.13, 0.37, 0.61, 0.89, 1]
  const faces = brep.faces(), edges = brep.edges(), vertices = brep.vertices()
  try {
    assert.equal(faces.count, 4, 'Two planar caps and two cylindrical charts')
    assert.equal(edges.count, 6, 'Four ring pieces, original slanted seam and exact chart-cut isocurve')
    assert.equal(vertices.count, 4, 'Both shared rings acquire one intersection vertex')
    const uses = new Map(), capEdges = [[], []]
    for (let i = 0; i < faces.count; i++) {
      const face = faces.get(i), loops = face.loops, loop = loops.get(0), trims = loop.trims, surface = face.underlyingSurface()
      try {
        assert.equal(loops.count, 1)
        assert.equal(trims.count, i < 2 ? 2 : 4, 'Shared ring cuts must also subdivide the earlier planar cap trims')
        for (let j = 0; j < trims.count; j++) {
          const trim = trims.get(j)
          try {
            const list = uses.get(trim.edgeIndex) || []
            list.push({ face: i, reversed: trim.isReversed !== face.orientationIsReversed })
            uses.set(trim.edgeIndex, list)
            if (i < 2) capEdges[i].push(trim.edgeIndex)
          } finally { trim.delete() }
        }
        if (i < 2) {
          for (const x of [-r, 0, r]) for (const y of [-r, 0, r]) samePoint(surface.pointAt(x, y), [x, y, i * h])
        } else {
          const nurbs = surface.toNurbsSurface()
          try {
            assert(nurbs.isRational); assert.equal(nurbs.degree(0), 2); assert.equal(nurbs.degree(1), 1)
            const u = surface.domain(0), v = surface.domain(1)
            near(u[1] - u[0], 4, 1e-10)
            near(v[0], 0, 1e-10); near(v[1], 1, 1e-10)
            for (const fu of fractions) for (const fv of fractions) {
              const t = u[0] + fu * (u[1] - u[0])
              samePoint(surface.pointAt(t, fv), [...circleAt(t), h * fv])
            }
          } finally { nurbs.delete() }
        }
      } finally { surface.delete(); trims.delete(); loop.delete(); loops.delete(); face.delete() }
    }
    assert.equal(uses.size, edges.count)
    for (const list of uses.values()) {
      assert.equal(list.length, 2, 'Every edge has exactly two incident face uses')
      assert.notEqual(list[0].face, list[1].face)
      assert.notEqual(list[0].reversed, list[1].reversed, 'Shared edges have opposite oriented uses')
    }
    for (let cap = 0; cap < 2; cap++) {
      const domains = [], neighbors = []
      for (const index of capEdges[cap]) {
        const list = uses.get(index)
        neighbors.push(list.find(use => use.face !== cap).face)
        const edge = edges.get(index), curve = edge.toNurbsCurve()
        try {
          assert(curve.isRational); assert.equal(curve.degree, 2)
          const d = edge.domain; domains.push(d)
          for (const f of fractions) {
            const t = d[0] + f * (d[1] - d[0])
            samePoint(edge.pointAt(t), [...circleAt(t + cap), cap * h])
          }
        } finally { curve.delete(); edge.delete() }
      }
      assert.deepEqual(neighbors.sort(), [2, 3], 'Each cap shares one exact ring segment with each chart')
      domains.sort((a, b) => a[0] - b[0])
      near(domains[0][0], 0, 1e-10); near(domains[0][1], domains[1][0], 1e-10); near(domains[1][1], 4, 1e-10)
    }
    let seams = 0, cuts = 0
    for (const [index, list] of uses) if (list.every(use => use.face >= 2)) {
      const edge = edges.get(index)
      try {
        const d = edge.domain, seam = Math.abs(edge.pointAtStart[0] - r) < 1e-9
        if (seam) { seams++; assert.equal(edge.degree, 2) } else { cuts++; assert.equal(edge.degree, 1) }
        for (const f of fractions) {
          const xy = circleAt(seam ? f : 2.5)
          const z = seam ? h / 2 * (1 - xy[0] / r + xy[1] / r) : h * f
          samePoint(edge.pointAt(d[0] + f * (d[1] - d[0])), [...xy, z])
        }
      } finally { edge.delete() }
    }
    assert.equal(seams, 1, 'The original slanted rational seam survives unchanged')
    assert.equal(cuts, 1, 'One exact isocurve joins the two charts')
  } finally { vertices.delete(); edges.delete(); faces.delete() }
  return info
}

function testNarrowPeriodicFace (runtime) {
  // Owned exact cylindrical strips at both sides of a periodic seam. Their
  // width is below the chart-repair allowance, but is real geometry. A branch
  // choice must not move the entire strip outside the chart and flatten it.
  for (const start of [-1e-5, 0]) {
    const end = start + 1e-5, r = 10, h = 5
    const point = (a, z) => [r * Math.cos(a), r * Math.sin(a), z]
    const vertices = [point(start, 0), point(end, 0), point(end, h), point(start, h)]
    const arc = z => ({ type: 'conic', frame: { origin: [0, 0, z], x: [1, 0, 0], y: [0, 1, 0] }, radii: [r, r], interval: [start, end] })
    const ring = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]]
    const spec = {
      vertices, closed: false, tolerance: 1e-7,
      edges: [
        { vertices: [0, 1], curve: arc(0) },
        { vertices: [1, 2], curve: { type: 'line', start: vertices[1], end: vertices[2] } },
        { vertices: [3, 2], curve: arc(h) },
        { vertices: [3, 0], curve: { type: 'line', start: vertices[3], end: vertices[0] } }
      ],
      faces: [{
        surface: { type: 'nurbs', degrees: [2, 1], points: ring.map(([x, y]) => [[r * x, r * y, 0], [r * x, r * y, h]]), weights: ring.map((_, i) => [i % 2 ? Math.SQRT1_2 : 1, i % 2 ? Math.SQRT1_2 : 1]), knots: [[0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], [0, 0, 1, 1]] },
        loops: [{ outer: true, trims: [0, 1, 2, 3].map(edge => ({ edge, reverse: edge === 2, curve: { type: 'pullback' } })) }], reverse: false
      }]
    }
    const brep = runtime.nodecCreateBrep(spec)
    try {
      assert(brep.isValid, 'The whole narrow face must survive without dropping any source topology')
      const info = JSON.parse(brep.getUserString('nodec.step.pullback'))
      assert.equal(info.skippedFaces?.length || 0, 0)
      assert(info.maxFitError <= spec.tolerance)
      const decoded = runtime.CommonObject.decode(brep.encode()), faces = decoded.faces(), edges = decoded.edges(), verts = decoded.vertices()
      try {
        assert(decoded.isValid); assert.equal(faces.count, 1); assert.equal(edges.count, 4); assert.equal(verts.count, 4)
        for (let i = 0; i < 4; i++) {
          const v = verts.get(i)
          try { v.location.forEach((x, k) => near(x, vertices[i][k], 1e-12)) } finally { v.delete() }
        }
        const face = faces.get(0), loops = face.loops, loop = loops.get(0), trims = loop.trims
        try {
          assert.equal(trims.count, 4)
          const trim = trims.get(0), edge = edges.get(trim.edgeIndex)
          try {
            const a = edge.pointAtStart, b = edge.pointAtEnd
            near(Math.hypot(...a.map((x, k) => x - b[k])), 2 * r * Math.sin((end - start) / 2), 1e-12)
          } finally { edge.delete(); trim.delete() }
        } finally { trims.delete(); loop.delete(); loops.delete(); face.delete() }
      } finally { verts.delete(); edges.delete(); faces.delete(); decoded.delete() }
    } finally { brep.delete() }
  }
}

function testTouchingHoleDisplay (runtime) {
  for (const reversed of [false, true]) for (const holeSize of [4, .001]) {
    const b = builder(), outer = [[-10, -10, 0], [10, -10, 0], [10, 10, 0], [-10, 10, 0]]
    // Two holes touch at exactly one existing point. Even the tiny lobe must
    // survive: neither may be dropped as a sub-tolerance sliver or filled.
    const inner = [[0, 0, 0], [-4, 0, 0], [-4, -4, 0], [0, -4, 0], [0, 0, 0], [holeSize, 0, 0], [holeSize, holeSize, 0], [0, holeSize, 0]]
    if (reversed) inner.reverse()
    const fixture = b.model(b.entity(`PLANE('',${b.frame()})`), [b.bound(b.poly(outer)), b.bound(b.poly(inner), false)])
    const spec = new StepBrep(decodeStepEntities(fixture.bytes)).body(fixture.body)
    const brep = runtime.nodecCreateBrep(spec)
    try {
      assert(brep.isValid)
      const bounds = brep.getBoundingBox(); bounds.delete()
      const before = JSON.stringify(brep.encode())
      const mesh = runtime.nodecBrepPreview(brep, { tolerance: .05, angleTolerance: Math.PI / 16 })
      assert.equal(mesh.status, 'success', mesh.message)
      assert.equal(mesh.faceCount, 1)
      let area = 0
      const point = i => Array.from(mesh.positions.slice(3 * i, 3 * i + 3), (v, k) => v + (mesh.origin?.[k] || 0))
      const edgeKey = (a, c) => [a, c].map(p => p.map(v => Math.round(v * 1e8)).join(',')).sort().join('|')
      const boundary = new Set([outer, inner].flatMap(ring => ring.map((p, i) => edgeKey(p, ring[(i + 1) % ring.length]))))
      const usage = new Map()
      for (let i = 0; i < mesh.indices.length; i += 3) {
        const [a, c, d] = Array.from(mesh.indices.slice(i, i + 3), point)
        for (const [p, q] of [[a, c], [c, d], [d, a]]) { const key = edgeKey(p, q); usage.set(key, (usage.get(key) || 0) + 1) }
        const doubleArea = (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0])
        assert(doubleArea > 0, 'Every display triangle has positive area')
        area += doubleArea / 2
        const x = (a[0] + c[0] + d[0]) / 3, y = (a[1] + c[1] + d[1]) / 3
        assert(!(x > -4 && x < 0 && y > -4 && y < 0) && !(x > 0 && x < holeSize && y > 0 && y < holeSize), 'Neither touching hole may be filled')
      }
      near(area, 400 - 16 - holeSize ** 2, 1e-6)
      for (const key of boundary) assert.equal(usage.get(key), 1, 'Every original boundary segment is retained exactly once, including the tiny hole')
      for (const [key, count] of usage) assert.equal(count, boundary.has(key) ? 1 : 2, 'All interior triangle edges are paired')
      for (const p of [...outer, ...inner]) {
        assert(Array.from({ length: mesh.positions.length / 3 }, (_, i) => point(i)).some(q => Math.hypot(...p.map((v, k) => v - q[k])) < 1e-9), 'Original boundary positions survive')
      }
      assert.equal(JSON.stringify(brep.encode()), before, 'Meshing must not change the source Brep')
    } finally { brep.delete() }
  }
  console.log('PASS owned touching-hole display: both lobes empty, correct area, boundary positions, windings and source immutability')
}

async function main () {
  const runtime = await require(path.resolve(__dirname, '..', process.env.NODEC_TEST_RUNTIME || 'public/nodec', 'NodeC.js'))()
  testCavitiesAndTori(runtime)
  testNarrowPeriodicFace(runtime)
  testTouchingHoleDisplay(runtime)
  assert.equal(typeof runtime.nodecCreateBrep, 'function')
  // Two distant thin faces cannot share a Float32 origin. Recover only failed
  // faces into distinct chunks; preserve world geometry and object budgets.
  const thin = { vertices: [], edges: [], faces: [], closed: false, tolerance: 1e-10 }
  for (const [x, y, z] of [[600, 60, 630], [-600, -60, -630]]) {
    const b = builder(), sample = b.model(b.entity(`PLANE('',${b.frame([x, y, z])})`), [b.bound(b.poly([[x, y, z], [x + .05, y, z], [x + .05, y + 1e-7, z], [x, y + 1e-7, z]]))])
    const spec = new StepBrep(decodeStepEntities(sample.bytes), { topologyTolerance: 1e-10 }).body(sample.body)
    const vertexOffset = thin.vertices.length, edgeOffset = thin.edges.length
    for (const edge of spec.edges) edge.vertices = edge.vertices.map(i => i + vertexOffset)
    for (const face of spec.faces) for (const loop of face.loops) for (const trim of loop.trims) trim.edge += edgeOffset
    thin.vertices.push(...spec.vertices); thin.edges.push(...spec.edges); thin.faces.push(...spec.faces)
  }
  const thinBrep = runtime.nodecCreateBrep(thin)
  try {
    const { meshBrepForDisplay } = require('../public/nodec/BrepDisplayMeshing')
    // BoundingBox lazily populates a serialized bounds cache; prime it before
    // comparing source archives so the check measures geometry mutations.
    const bounds = thinBrep.getBoundingBox(); bounds.delete()
    const before = JSON.stringify(thinBrep.encode()), settings = { tolerance: .05, angleTolerance: Math.PI / 16, minimumEdgeLength: 0 }
    const mesh = meshBrepForDisplay(runtime, thinBrep, settings, 2)
    assert.equal(mesh.status, 'success', mesh.message)
    assert.equal(mesh.faceCount, 2); assert.deepEqual(mesh.failedFaces, [])
    assert.equal(mesh.meshParts.length, 1, 'Distant tiny faces need different Float32 origins')
    const chunks = [mesh, ...mesh.meshParts]
    assert.deepEqual(chunks.flatMap(c => c.faceRanges.map(f => f.faceIndex)).sort(), [0, 1])
    for (const chunk of chunks) {
      const faceIndex = chunk.faceRanges[0].faceIndex, expected = thin.vertices.slice(faceIndex * 4, faceIndex * 4 + 4)
      const world = Array.from({ length: chunk.positions.length / 3 }, (_, i) => chunk.origin.map((o, j) => o + chunk.positions[i * 3 + j]))
      for (const p of expected) assert(world.some(q => Math.hypot(...p.map((x, i) => x - q[i])) < 1e-9), 'Local display coordinates must restore the original corners')
      for (let i = 0; i < chunk.indices.length; i += 3) {
        const [a, b, c] = Array.from(chunk.indices.slice(i, i + 3), j => world[j])
        assert((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0, 'Display triangles must remain nondegenerate and correctly oriented')
      }
    }
    const limited = meshBrepForDisplay(runtime, thinBrep, { ...settings, maxVertices: 0, maxTriangles: 2 }, 2)
    assert.equal(limited.status, 'partial', 'Recovery must not multiply a per-object budget')
    assert.equal(limited.faceCount, 1)
    assert.equal(JSON.stringify(thinBrep.encode()), before, 'Display recovery cannot mutate source geometry')
    console.log('PASS owned distant thin-face display recovery: origins, world corners, triangle orientation, budgets and source immutability')
  } finally { thinBrep.delete() }
  const periodic = periodicNurbsCylinder()
  const periodicBefore = structuredClone(periodic.spec)
  const periodicBrep = runtime.nodecCreateBrep(periodic.spec)
  try {
    const info = checkPeriodicNurbsCylinder(periodicBrep, periodic)
    const copy = runtime.CommonObject.decode(periodicBrep.encode())
    try { assert.deepEqual(checkPeriodicNurbsCylinder(copy, periodic), info) } finally { copy.delete() }
    assert.deepEqual(periodic.spec, periodicBefore, 'Conversion must not mutate source geometry')
    console.log('PASS owned capped periodic NURBS chart subdivision:', JSON.stringify(info))
  } finally { periodicBrep.delete() }
  for (const cone of [false, true, -1]) {
    for (const options of [{}, { separateRings: true }, { start: 5.5, span: 1.6 }, { rotated: true, start: -0.7 }, { rotated: true, start: 5.5, span: 1.6 }]) {
      const sample = analyticStrip({ cone, ...options })
      const descriptor = new StepBrep(decodeStepEntities(sample.bytes)).body(sample.body)
      const brep = runtime.nodecCreateBrep(descriptor)
      try {
        assert(brep instanceof runtime.Brep && brep.isValid && !brep.isSolid)
        const faces = brep.faces(), face = faces.get(0), loops = face.loops, edges = brep.edges(), surfaces = brep.surfaces(), surface = surfaces.get(0)
        assert.equal(faces.count, 1); assert.equal(loops.count, 1); assert.equal(edges.count, sample.full ? 3 : 4)
        const loop = loops.get(0), trims = loop.trims, uses = new Map()
        assert.equal(trims.count, 4)
        for (let i = 0; i < trims.count; i++) {
          const trim = trims.get(i), list = uses.get(trim.edgeIndex) || []
          list.push(trim.isReversed); uses.set(trim.edgeIndex, list); trim.delete()
        }
        const repeated = [...uses.values()].filter(list => list.length > 1)
        assert.equal(repeated.length, sample.full ? 1 : 0)
        if (sample.full) assert.notEqual(repeated[0][0], repeated[0][1], 'One shared seam has opposite trim uses')
        trims.delete(); loop.delete()
        const domain = descriptor.faces[0].surface.domain
        for (const fu of [0, 0.17, 0.5, 0.83, 1]) for (const fv of [0, 0.3, 1]) {
          const u = domain[0][0] + fu * (domain[0][1] - domain[0][0]), v = fv * sample.height / Math.cos(Math.atan(sample.slope))
          const expected = sample.at(u, fv * sample.height), actual = surface.pointAt(u, v)
          actual.forEach((value, i) => near(value, expected[i], 1e-7))
        }
        surface.delete(); surfaces.delete(); edges.delete(); loops.delete(); face.delete(); faces.delete()
        const decoded = runtime.CommonObject.decode(brep.encode())
        assert(decoded.isValid); decoded.delete()
      } finally { brep.delete() }
      const parsed = parseNativeStep(sample.bytes, {}, runtime), records = [...parsed.records]
      assert(records.length && records.every(r => r.exactSource), JSON.stringify(options) + ': ' + records.map(r => r.exactError).join(';'))
    }
  }
  // A source seam may be slightly oblique within the admitted tolerance.
  // Its two UV uses must become real parameter-domain boundaries, with both
  // neighbors still connected. Merely labelling the trims as seams is invalid.
  const seamSample = analyticStrip()
  const seamSpec = new StepBrep(decodeStepEntities(seamSample.bytes)).body(seamSample.body)
  seamSpec.tolerance = 0.001; seamSpec.repairTolerance = 0.05
  const seamEdge = seamSpec.edges.find(e => e.curve.type === 'line')
  seamEdge.curve.end[1] += 0.0002
  // Line descriptor endpoints may share the vertex array in memory.
  seamSpec.vertices[seamEdge.vertices[1]] = [...seamEdge.curve.end]
  for (const loop of seamSpec.faces[0].loops) for (const trim of loop.trims) trim.curve = { type: 'pullback' }
  const seamBrep = runtime.nodecCreateBrep(seamSpec)
  try {
    assert(seamBrep.isValid)
    const info = JSON.parse(seamBrep.getUserString('nodec.step.pullback'))
    assert(info.maxFitError <= seamSpec.tolerance)
    assert(info.maxSewingError <= seamSpec.repairTolerance)
    const copy = runtime.CommonObject.decode(seamBrep.encode())
    try { assert(copy.isValid) } finally { copy.delete() }
  } finally { seamBrep.delete() }
  // Unsafe analytic recovery must remain explicit instead of silently fitting a
  // sampled boundary or inventing a seam between incompatible angular origins.
  const strip = analyticStrip({ cone: true })
  const descriptor = new StepBrep(decodeStepEntities(strip.bytes)).body(strip.body)
  const recover = spec => buildRevolvedTrims(spec.faces[0].surface, spec.faces[0].loops, spec.edges, spec.vertices, spec.tolerance)
  const wrongCircle = structuredClone(descriptor)
  wrongCircle.edges[0].curve.radii[0] += 0.1
  assert.throws(() => recover(wrongCircle), /coaxial circle/)
  const unsupportedTrim = structuredClone(descriptor)
  unsupportedTrim.edges[0].curve.type = 'nurbs'
  assert.throws(() => recover(unsupportedTrim), /general pcurve recovery/)
  const apex = structuredClone(descriptor)
  apex.faces[0].surface.domain[1][0] = -100
  assert.throws(() => runtime.nodecCreateBrep(apex), /apex/)
  const shifted = structuredClone(descriptor)
  shifted.faces[0].loops[0].trims[0].curve.start[1] += 1
  assert.throws(() => runtime.nodecCreateBrep(shifted), /pcurve/i)
  for (const sample of [hole(), circleHole(), spline()]) {
    const descriptor = new StepBrep(decodeStepEntities(sample.bytes)).body(sample.body)
    const brep = runtime.nodecCreateBrep(descriptor)
    try {
      assert(brep instanceof runtime.Brep); assert(brep.isValid); assert(!brep.isSolid)
      const faces = brep.faces(), face = faces.get(0), loops = face.loops
      assert.equal(faces.count, 1); assert.equal(loops.count, descriptor.faces[0].loops.length)
      loops.delete(); face.delete(); faces.delete()
      if (descriptor.faces[0].surface.type === 'nurbs') {
        const surfaces = brep.surfaces(), surface = surfaces.get(0), nurbs = surface.toNurbsSurface(), points = nurbs.points()
        near(surface.pointAt(0.5, 0.5)[2], 2, 1e-10)
        assert.equal(nurbs.degree(0), 2); assert.equal(nurbs.degree(1), 2)
        const p = points.get(1, 1); near(p[3], 2)
        points.delete(); nurbs.delete(); surface.delete(); surfaces.delete()
      }
      const decoded = runtime.CommonObject.decode(brep.encode())
      assert(decoded instanceof runtime.Brep && decoded.isValid); decoded.delete()
    } finally { brep.delete() }
    const parsed = parseNativeStep(sample.bytes, {}, runtime), records = [...parsed.records]
    assert(records.every(r => r.exactSource), JSON.stringify(parsed.exactFailures) + records.map(r => r.exactError).join(';'))
    assert(records[0].displayObject.children.some(p => p.edgeLines && p.positions.length))
  }
  // Invalid/mismatched pcurves must never be reported as a valid exact Brep.
  const sample = spline(), bad = new StepBrep(decodeStepEntities(sample.bytes)).body(sample.body)
  bad.faces[0].loops[0].trims[0].curve.end[1] = 0.2
  assert.throws(() => runtime.nodecCreateBrep(bad), /pcurve/i)
  // Missing PCURVEs must recover from the true 3D edges, keeping the rational
  // surface rather than wrapping display triangles as a Brep.
  const pullback = new StepBrep(decodeStepEntities(sample.bytes)).body(sample.body)
  pullback.tolerance = 0.001
  for (const loop of pullback.faces[0].loops) for (const trim of loop.trims) trim.curve = { type: 'pullback' }
  const recovered = runtime.nodecCreateBrep(pullback)
  try {
    assert(recovered.isValid)
    const info = JSON.parse(recovered.getUserString('nodec.step.pullback'))
    assert.equal(info.recoveredTrims, 4)
    assert(info.maxFitError <= pullback.tolerance)
    assert.equal(info.repairedTrims, 0)
  } finally { recovered.delete() }
  // A nonuniform planar NURBS parametrization requires curved UV pullbacks
  // even for straight 3D edges. Source-gap admission must not disable adaptive
  // fitting. The native final validator uses independent interior witnesses.
  // Test both exact and displaced source boundaries.
  for (const [sourceZ, middle] of [[0, 1], [0.02, 1], [0, 0]]) {
    const curvedUV = structuredClone(pullback)
    // middle=0 has a stationary corner: the previous anchor is a poor local
    // seed that falls inside the repair envelope but is not the closest point.
    curvedUV.repairTolerance = middle === 0 ? 2.6 : 0.05
    curvedUV.faces[0].surface.points = [0, middle, 10].map(x => [0, middle, 10].map(y => [x, y, 0]))
    curvedUV.faces[0].surface.weights = Array.from({ length: 3 }, () => [1, 1, 1])
    curvedUV.vertices.forEach(p => { p[2] = sourceZ })
    curvedUV.edges.forEach(e => { e.curve.start[2] = sourceZ; e.curve.end[2] = sourceZ })
    const b = runtime.nodecCreateBrep(curvedUV)
    try {
      assert(b.isValid)
      const info = JSON.parse(b.getUserString('nodec.step.pullback'))
      assert(info.maxFitError <= curvedUV.tolerance, JSON.stringify(info))
      near(info.sourceGap, sourceZ, 1e-7)
      assert(info.uvPoints > 4 * 17, 'Nonlinear UV pullback needs more than the initial uniform samples')
      const surfaces = b.surfaces(), surface = surfaces.get(0), edges = b.edges(), edge = edges.get(0)
      try {
        near(surface.pointAt(0.5, 0.5)[0], 2.5 + middle * 0.5)
        near(surface.pointAt(0.5, 0.5)[2], 0)
        near(edge.pointAtStart[2], sourceZ)
      } finally { edge.delete(); edges.delete(); surface.delete(); surfaces.delete() }
    } finally { b.delete() }
  }
  // Coordinate conditioning must not alter archived source geometry, and a
  // narrow parameter direction must not be suppressed by uniform damping.
  for (const [label, sx, sy, origin, tolerance, sourceGap] of [
    ['translated', 1, 1, [1e6, -1e6, 2e5], 0.0001, 0.02],
    ['tiny', 0.001, 0.001, [0, 0, 0], 0.000001, 0],
    ['anisotropic', 0.001, 1, [0, 0, 0], 0.00001, 0]
  ]) {
    const spec = structuredClone(pullback)
    spec.tolerance = tolerance; spec.repairTolerance = Math.max(tolerance, sourceGap * 2)
    spec.faces[0].surface.points = [0, 1, 10].map(x => [0, 1, 10].map(y => [origin[0] + x * sx, origin[1] + y * sy, origin[2]]))
    spec.faces[0].surface.weights = Array.from({ length: 3 }, () => [1, 1, 1])
    const move = p => [origin[0] + p[0] * sx, origin[1] + p[1] * sy, origin[2] + sourceGap]
    spec.vertices = spec.vertices.map(move)
    spec.edges.forEach(edge => { edge.curve.start = move(edge.curve.start); edge.curve.end = move(edge.curve.end) })
    const brep = runtime.nodecCreateBrep(spec)
    try {
      assert(brep.isValid, label)
      const info = JSON.parse(brep.getUserString('nodec.step.pullback'))
      assert(info.maxFitError <= tolerance, label)
      near(info.sourceGap, sourceGap, Math.max(1e-8, tolerance * .01))
      const decoded = runtime.CommonObject.decode(brep.encode()), surfaces = decoded.surfaces(), surface = surfaces.get(0)
      try {
        assert(decoded.isValid)
        for (const u of [0, .13, .5, .91, 1]) for (const v of [0, .37, 1]) {
          const x = 2 * u * (1 - u) + 10 * u * u, y = 2 * v * (1 - v) + 10 * v * v
          const point = surface.pointAt(u, v)
          near(point[0], origin[0] + x * sx, 1e-8)
          near(point[1], origin[1] + y * sy, 1e-8)
          near(point[2], origin[2], 1e-8)
        }
      } finally { surface.delete(); surfaces.delete(); decoded.delete() }
    } finally { brep.delete() }
  }
  // A planar source body has boundary curves displaced by 0.02 mm. Strict
  // conversion rejects it. Explicit bounded repair preserves those curves and
  // the plane, records measured tolerances, and never weakens the fit target.
  const gap = new StepBrep(decodeStepEntities(hole().bytes)).body(hole().body)
  gap.tolerance = 0.001
  for (const point of gap.vertices) point[2] = 0.02
  for (const edge of gap.edges) { edge.curve.start[2] = 0.02; edge.curve.end[2] = 0.02 }
  assert.throws(() => runtime.nodecCreateBrep(gap), /envelope|pcurve|Pcurve/)
  gap.repairTolerance = 0.05
  const repaired = runtime.nodecCreateBrep(gap)
  try {
    assert(repaired.isValid)
    const info = JSON.parse(repaired.getUserString('nodec.step.pullback'))
    assert.equal(info.tolerance, 0.001)
    near(info.sourceGap, 0.02, 1e-9)
    assert(info.repairedEdges > 0 && info.repairedTrims > 0)
    const surfaces = repaired.surfaces(), surface = surfaces.get(0), edges = repaired.edges(), edge = edges.get(0)
    try { near(surface.pointAt(0, 0)[2], 0); near(edge.pointAtStart[2], 0.02) } finally { edge.delete(); edges.delete(); surface.delete(); surfaces.delete() }
  } finally { repaired.delete() }
  gap.repairTolerance = 0.01
  assert.throws(() => runtime.nodecCreateBrep(gap), /envelope|pcurve|Pcurve/)
  const boxes = []
  for (const name of ['simple-basic-cube/cube.stp', 'cube-units/cube-mm.step', 'cube-units/cube-m.step', 'cube-units/cube-in.step']) {
    const bytes = fs.readFileSync(path.join(fixtures, name)), parsed = parseNativeStep(bytes, {}, runtime), records = [...parsed.records]
    assert.equal(records.length, 1); assert(records[0].exactSource, records[0].exactError)
    const brep = runtime.CommonObject.decode(records[0].exactSource.geometry), faces = brep.faces(), edges = brep.edges(), vertices = brep.vertices(), bbox = brep.getBoundingBox()
    assert(brep.isValid && brep.isSolid); assert.equal(faces.count, 6); assert.equal(edges.count, 12); assert.equal(vertices.count, 8)
    if (name.startsWith('cube-units')) boxes.push([bbox.min, bbox.max])
    bbox.delete(); vertices.delete(); edges.delete(); faces.delete(); brep.delete()
  }
  boxes.forEach(b => b.flat().forEach((v, i) => near(v, boxes[0].flat()[i])))
  let loads = 0
  const bytes = fs.readFileSync(path.join(fixtures, 'simple-basic-cube/cube.stp'))
  const stream = new ProgressiveStepImport(new File([bytes], 'cube.stp'), async () => { loads++; throw new Error('OCCT disabled') }, {}, async () => runtime)
  await stream.open(() => {})
  let batch, count = 0
  do { batch = await stream.pull(); count += batch.records.filter(r => r.exactSource).length } while (!batch.done)
  assert.equal(count, 1); assert.equal(loads, 0); assert.equal(batch.stepExactObjects, 1); assert.equal(batch.stepDisplayOnlyObjects, 0)
  const THREE = require('three'), Publisher = require('../src/collaboration/FrontendGeometryPublisher').default
  const record = [...parseNativeStep(bytes, {}, runtime).records][0], source = record.exactSource
  const scene = new THREE.Group(), root = new THREE.Group()
  root.userData = { importedModelObject: true, sourceGeometryId: source.id, pandauiObjectId: 'owned-step' }
  root.position.set(5, 8, 12); root.add(new THREE.Mesh()); scene.add(root)
  const doc = { sourceFile: { name: 'cube.step' }, importedGeometrySources: new Map([[source.id, source]]) }
  const uploads = [], publisher = new Publisher({ createWorker: () => assert.fail('Exact archives must not be rebuilt from display meshes'), upload: async (entry, body) => { uploads.push(body); return { archiveId: 'exact' } } })
  await publisher.publish([{ objectId: 'owned-step', revision: 1, assetId: 'view', doc, root }])
  assert.equal(uploads.length, 1, 'Publish once per Brep, not once per display child')
  const part = uploads[0].geometryParts[0], published = runtime.CommonObject.decode(part.geometry)
  assert(published instanceof runtime.Brep && published.isValid && published.isSolid)
  near(part.matrix[12], 0); near(part.matrix[13], 0); near(part.matrix[14], 0)
  published.delete()
  const conicalBytes = fs.readFileSync(path.join(fixtures, 'conical-surface/conical-surface.step'))
  const conicalRecords = [...parseNativeStep(conicalBytes, {}, runtime).records]
  assert.equal(conicalRecords.length, 1); assert(conicalRecords[0].exactSource, conicalRecords[0].exactError)
  const conicalBrep = runtime.CommonObject.decode(conicalRecords[0].exactSource.geometry), conicalFaces = conicalBrep.faces()
  assert(conicalBrep.isValid && conicalBrep.isSolid); assert.equal(conicalFaces.count, 5)
  conicalFaces.delete(); conicalBrep.delete()
  const unsupported = Buffer.from(Buffer.from(spline().bytes).toString().replace(/SURFACE_CURVE\('',(#\d+),\(#\d+\),\.PCURVE_S1\.\)/g, "SURFACE_CURVE('',$1,(),.CURVE_3D.)"))
  const fallback = [...parseNativeStep(unsupported, {}, runtime).records]
  assert(fallback.some(r => !r.exactSource && r.exactError), 'Unsupported exact geometry is explicitly display-only')
  console.log('PASS exact STEP Breps: solid topology, holes, rational NURBS, cylinder/cone seams and ring recovery, angular wrap, rotated frames, pcurves, rejection, archive roundtrip, unit scaling, progressive records, native publication and explicit display-only fallback.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
