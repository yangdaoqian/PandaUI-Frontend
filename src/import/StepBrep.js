// STEP topology descriptors, independent of the display tessellator. Source
// degrees, control nets, weights and knots survive conversion without fitting.
import StepGeometry, { knots } from './StepGeometry'
import { args, isType, refId, resolveEntity, StepUnsupported } from './StepEntityModel'
import buildRevolvedTrims from './StepRevolvedTrim'

const fail = message => { throw new StepUnsupported(message) }
const bool = v => v === '.T.' ? true : v === '.F.' ? false : fail('Unknown STEP orientation')
const sub = (a, b) => a.map((x, i) => x - b[i])
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0)
const unit = a => { const n = Math.hypot(...a); if (!(n > 1e-14)) fail('Degenerate STEP frame'); return a.map(x => x / n) }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const placement = f => ({ origin: f.origin, x: f.x, y: f.y })
const distance = (a, b) => Math.hypot(...sub(a, b))
const TAU = Math.PI * 2
const range = values => values.reduce(([lo, hi], v) => [Math.min(lo, v), Math.max(hi, v)], [Infinity, -Infinity])
const modelContexts = new WeakMap()
const representationTypes = ['REPRESENTATION', 'SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION', 'FACETED_BREP_SHAPE_REPRESENTATION', 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION', 'GEOMETRICALLY_BOUNDED_SURFACE_SHAPE_REPRESENTATION']

export default class StepBrep {
  constructor (entities, options = {}, lengthScale = 1, angleScale = 1) {
    this.entities = entities
    this.recoverTrims = options.recoverTrims === true
    this.curveEvaluators = new WeakMap()
    // Topology accuracy must not change when the display quality changes.
    this.tolerance = (options.topologyTolerance ?? 1e-5) / lengthScale
    if (!(this.tolerance > 0 && Number.isFinite(this.tolerance))) fail('Invalid topology tolerance')
    this.defaultTolerance = this.tolerance
    this.useModelUncertainty = this.recoverTrims && options.topologyTolerance == null
    this.geometry = new StepGeometry(entities, options, lengthScale, angleScale)
    this.geometry.joinTolerance = this.tolerance
    if (this.recoverTrims) {
      // Native bounded source-gap repair budget, independent of the declared
      // topology tolerance and native pullback fitting accuracy. The option is
      // in millimeters; descriptor repairTolerance is in source length units.
      // This is an admission ceiling, not a measured source gap or a fitting
      // target. Native recovery reports source, sewing and fitting separately.
      const repair = options.stepRepairTolerance ?? 2.6
      if (!(Number.isFinite(repair) && repair >= 0)) fail('Invalid STEP repair tolerance')
      this.repairTolerance = repair / this.geometry.scale
      if (!Number.isFinite(this.repairTolerance)) fail('Invalid STEP repair tolerance conversion')
      // Some exporters leave a B-spline vertex a little outside its evaluated
      // curve. Native recovery is explicitly allowed to retain such source
      // geometry within the repair envelope, so endpoint projection must use
      // the same envelope instead of rejecting the body at the strict topology
      // tolerance before OpenNURBS can record the measured gap.
      this.geometry.joinTolerance = Math.max(this.geometry.joinTolerance, this.repairTolerance)
    }
    this.uvGeometry = new StepGeometry(entities, { tolerance: 5e-6 })
    this.uvGeometry.point = reference => {
      const p = args(this.get(reference), 'CARTESIAN_POINT')?.[1]
      if (p?.length !== 2 || !p.every(Number.isFinite)) fail('Expected a 2D pcurve point')
      return [...p, 0]
    }
    this.uvGeometry.frame = reference => {
      const a = args(this.get(reference), 'AXIS2_PLACEMENT_2D')
      if (!a) fail('Unsupported pcurve placement')
      const origin = this.uvGeometry.point(a[1]), raw = a[2] ? args(this.get(a[2]), 'DIRECTION')?.[1] : [1, 0]
      if (raw?.length !== 2) fail('Invalid pcurve direction')
      const x = unit([...raw, 0]), y = [-x[1], x[0], 0]
      return { origin, x, y, world: p => origin.map((v, i) => v + x[i] * p[0] + y[i] * p[1]), local: p => [dot(sub(p, origin), x), dot(sub(p, origin), y), 0], vector: p => x.map((v, i) => v * p[0] + y[i] * p[1]) }
    }
  }

  get (r) { return resolveEntity(this.entities, r) }

  lengthUnit (reference, active = new Set()) {
    const e = this.get(reference)
    if (active.has(e.id)) fail('Cyclic uncertainty length unit')
    if (!isType(e, 'LENGTH_UNIT')) fail('Uncertainty requires a length unit')
    active.add(e.id)
    try {
      const si = args(e, 'SI_UNIT')
      if (si) {
        const prefixes = { '.EXA.': 1e18, '.PETA.': 1e15, '.TERA.': 1e12, '.GIGA.': 1e9, '.MEGA.': 1e6, '.KILO.': 1e3, '.HECTO.': 1e2, '.DECA.': 10, '.DECI.': 0.1, '.CENTI.': 0.01, '.MILLI.': 0.001, '.MICRO.': 1e-6, '.NANO.': 1e-9, '.PICO.': 1e-12, '.FEMTO.': 1e-15, '.ATTO.': 1e-18 }
        const scale = si[0] == null ? 1 : prefixes[si[0]]
        if (si[1] !== '.METRE.' || !scale) fail('Unsupported uncertainty length unit')
        return scale
      }
      const conversion = args(e, 'CONVERSION_BASED_UNIT'), measure = conversion && this.get(conversion[1])
      const data = args(measure, 'LENGTH_MEASURE_WITH_UNIT') || args(measure, 'MEASURE_WITH_UNIT')
      const value = typeof data?.[0] === 'number' ? data[0] : data?.[0]?.values?.[0]
      if (!(value > 0 && Number.isFinite(value))) fail('Invalid uncertainty length unit conversion')
      return value * this.lengthUnit(data[1], active)
    } finally { active.delete(e.id) }
  }

  modelTolerance (reference) {
    // Index once per decoded model, not once per body. Keep declarations scoped
    // to representation items; another assembly context must not loosen this one.
    const metadataEntities = this.entities.metadataEntities || this.entities
    let index = modelContexts.get(metadataEntities)
    if (!index) {
      index = new Map()
      for (const e of metadataEntities.values()) {
        const type = representationTypes.find(type => isType(e, type))
        if (!type) continue
        const a = args(e, type)
        if (!Array.isArray(a[1]) || !refId(a[2])) continue
        for (const item of a[1]) {
          const id = refId(item)
          if (!id) continue
          if (!index.has(id)) index.set(id, new Set())
          index.get(id).add(refId(a[2]))
        }
      }
      modelContexts.set(metadataEntities, index)
    }
    const tolerances = []
    for (const id of index.get(this.get(reference).id) || []) {
      const context = this.get(id), declarations = args(context, 'GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT')?.[0] || []
      const units = args(context, 'GLOBAL_UNIT_ASSIGNED_CONTEXT')?.[0] || []
      for (const r of declarations) {
        const a = args(this.get(r), 'UNCERTAINTY_MEASURE_WITH_UNIT')
        if (a?.[0]?.type !== 'LENGTH_MEASURE') continue
        const value = a[0].values?.[0], lengthUnits = units.filter(r => isType(this.get(r), 'LENGTH_UNIT'))
        if (!(value > 0 && Number.isFinite(value)) || lengthUnits.length !== 1) fail('Invalid model distance uncertainty/context')
        const tolerance = value * this.lengthUnit(a[1]) / this.lengthUnit(lengthUnits[0])
        if (!(tolerance > 0 && Number.isFinite(tolerance))) fail('Invalid model distance uncertainty conversion')
        tolerances.push(tolerance)
      }
    }
    // Multiple assertions on the same item must all hold: take the tightest.
    return tolerances.length ? Math.min(...tolerances) : this.defaultTolerance
  }

  curve (reference, start, end, sense = true, uv = false) {
    let e = this.get(reference), active = new Set()
    while (isType(e, 'SURFACE_CURVE') || isType(e, 'SEAM_CURVE') || isType(e, 'TRIMMED_CURVE')) {
      if (active.has(e.id)) fail('Cyclic surface curve')
      active.add(e.id)
      const wrapper = args(e, 'SURFACE_CURVE') || args(e, 'SEAM_CURVE') || args(e, 'TRIMMED_CURVE')
      e = this.get(wrapper[1])
    }
    const g = uv ? this.uvGeometry : this.geometry
    if (isType(e, 'LINE')) {
      const a = args(e, 'LINE'), p = g.point(a[1]), v = args(this.get(a[2]), 'VECTOR'), direction = args(this.get(v?.[1]), 'DIRECTION')?.[1]
      if (!direction || !(v[2] > 0)) fail('Invalid STEP line')
      const d = unit(direction.length === 2 ? [...direction, 0] : direction)
      const lineTolerance = uv ? 1e-6 : Math.max(this.tolerance, this.repairTolerance || 0)
      for (const q of [start, end]) if (Math.hypot(...cross(sub(q, p), d)) > lineTolerance) fail('STEP vertex is not on line')
      return { type: 'line', start, end }
    }
    const evaluated = g.curve(e.id)
    // Most STEP NURBS edges use the full source domain. Test its evaluated
    // endpoints before paying for a search over every knot span. Prefer the
    // sense-selected endpoint so closed curves retain the entire interval.
    const parameter = (point, first) => {
      if (evaluated.domain) {
        const order = first === sense ? evaluated.domain : [...evaluated.domain].reverse()
        for (const t of order) if (distance(evaluated.at(t), point) <= (uv ? this.uvGeometry.joinTolerance : this.tolerance)) return t
      }
      return evaluated.parameter(point)
    }
    let a = parameter(start, true), b = parameter(end, false)
    if (evaluated.period) {
      if (sense) { while (b <= a + 1e-12) b += evaluated.period } else { while (b >= a - 1e-12) b -= evaluated.period }
    } else if ((sense && b < a) || (!sense && b > a)) fail('STEP edge sense disagrees with curve parameters')
    if (isType(e, 'CIRCLE') || isType(e, 'ELLIPSE')) {
      const p = args(e, 'CIRCLE') || args(e, 'ELLIPSE')
      const curve = { type: 'conic', frame: placement(g.frame(p[1])), radii: [p[2], isType(e, 'CIRCLE') ? p[2] : p[3]], interval: [Math.min(a, b), Math.max(a, b)], reverse: !sense }
      this.curveEvaluators.set(curve, evaluated)
      return curve
    }
    const raw = args(e, 'B_SPLINE_CURVE_WITH_KNOTS')
    if (!raw) fail(`Unsupported exact curve #${e.id}`)
    const base = e.complex ? args(e, 'B_SPLINE_CURVE') : raw.slice(1, 6), spec = e.complex ? raw : raw.slice(6)
    const points = base[1].map(r => g.point(r)), weights = args(e, 'RATIONAL_B_SPLINE_CURVE')?.[0] || points.map(() => 1)
    const curve = { type: 'nurbs', degree: base[0], points, weights, knots: knots(base[0], points.length, spec[0], spec[1]), interval: [Math.min(a, b), Math.max(a, b)], reverse: !sense }
    this.curveEvaluators.set(curve, evaluated)
    return curve
  }

  // Positive rational weights keep the curve inside its source control hull.
  // Bounds do not require display tessellation, even for a trimmed interval.
  curveHull (curve) {
    if (curve.type === 'nurbs') return curve.points
    if (curve.type === 'line') return [curve.start, curve.end]
    const { frame: f, radii: r } = curve
    return [-1, 1].flatMap(x => [-1, 1].map(y => f.origin.map((v, i) => v + x * r[0] * f.x[i] + y * r[1] * f.y[i])))
  }

  // Fixed per-knot-span reference samples choose a periodic chart; they never
  // replace a source edge or determine its geometric acceptance tolerance.
  curveSamples (curve) {
    if (curve.type === 'line') return [curve.start, curve.end]
    const evaluated = this.curveEvaluators.get(curve), [lo, hi] = curve.interval
    const breaks = [lo, ...(evaluated.breaks || []).filter(t => t > lo && t < hi), hi], samples = [evaluated.at(lo)]
    for (let i = 1; i < breaks.length; i++) {
      for (let j = 1; j <= 8; j++) samples.push(evaluated.at(breaks[i - 1] + (breaks[i] - breaks[i - 1]) * j / 8))
    }
    return curve.reverse ? samples.reverse() : samples
  }

  revolvedChart (surface, loops, edges, vertices) {
    const f = surface.frame, z = cross(f.x, f.y), cosine = Math.cos(surface.coneAngle)
    const samples = [], hull = [], seen = new Set()
    for (const loop of loops) {
      for (const trim of loop.trims) {
        if (seen.has(trim.edge)) continue
        seen.add(trim.edge)
        const edge = edges[trim.edge], endpoints = edge.vertices.map(i => vertices[i])
        samples.push(...endpoints, ...this.curveSamples(edge.curve))
        hull.push(...endpoints, ...this.curveHull(edge.curve))
      }
    }
    const angles = samples.map(p => {
      const d = sub(p, f.origin)
      return (Math.atan2(dot(d, f.y), dot(d, f.x)) + TAU) % TAU
    }).sort((a, b) => a - b)
    if (!angles.length) fail('Missing revolved chart samples')
    // Put the seam in the largest unsampled angular gap. The native pullback
    // still checks the entire edge, including any periodic seam crossings.
    let gap = -1, seam = 0
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + TAU
      if (next - angles[i] > gap) { gap = next - angles[i]; seam = (angles[i] + next) / 2 }
    }
    seam = (seam + Math.PI) % TAU - Math.PI
    const [lo, hi] = range(hull.map(p => dot(sub(p, f.origin), z) / cosine))
    const pad = Math.max(this.tolerance * 2, (hi - lo) * 0.01)
    surface.domain = [[seam, seam + TAU], [lo - pad, hi + pad]]
  }

  surface (reference, samplePoints) {
    const e = reference && this.get(reference), plane = e && args(e, 'PLANE')
    if (!e || plane) {
      let f
      if (plane) f = this.geometry.frame(plane[1])
      else {
        const origin = samplePoints[0], x = unit(sub(samplePoints[1], origin))
        const z0 = samplePoints.slice(2).map(p => cross(x, sub(p, origin))).find(n => Math.hypot(...n) > this.tolerance)
        if (!z0) fail('Degenerate faceted surface')
        const y = cross(unit(z0), x)
        f = { origin, x, y }
      }
      const uv = samplePoints.map(p => [dot(sub(p, f.origin), f.x), dot(sub(p, f.origin), f.y)])
      const domain = [0, 1].map(axis => {
        const [lo, hi] = range(uv.map(p => p[axis])), pad = Math.max(this.tolerance * 2, (hi - lo) * 0.01)
        return [lo - pad, hi + pad]
      })
      return { type: 'plane', frame: placement(f), domain }
    }
    const sphere = args(e, 'SPHERICAL_SURFACE')
    if (sphere) {
      const radius = sphere[2], sourceFrame = this.geometry.frame(sphere[1])
      // Place the rational seam between the usual source meridians. This is a
      // parameterization change only; the spherical locus is unchanged.
      const f = { origin: sourceFrame.origin,
        x: sourceFrame.x.map((v, i) => (v + sourceFrame.y[i]) * Math.SQRT1_2),
        y: sourceFrame.y.map((v, i) => (v - sourceFrame.x[i]) * Math.SQRT1_2) }
      if (!(radius > 0 && Number.isFinite(radius))) fail('Invalid spherical radius')
      // Exact rational tensor-product sphere. Its parameters are rational arc
      // parameters, NOT STEP angles; always recover trims against this surface.
      const circle = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]]
      const profile = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1]], w = Math.SQRT1_2
      const weights = circle.map((_, i) => profile.map((_, j) => (i % 2 ? w : 1) * (j % 2 ? w : 1)))
      const z = cross(f.x, f.y)
      return { type: 'nurbs',
        sourceSphere: { ...f, radius },
        degrees: [2, 2],
        points: circle.map(([x, y]) => profile.map(([r, h]) => f.origin.map((o, k) => o + radius * (r * x * f.x[k] + r * y * f.y[k] + h * z[k])))),
        weights,
        knots: [[0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], [-1, -1, -1, 0, 0, 1, 1, 1]] }
    }
    const torus = args(e, 'TOROIDAL_SURFACE') || args(e, 'DEGENERATE_TOROIDAL_SURFACE')
    if (torus) {
      const major = torus[2], minor = torus[3], sourceFrame = this.geometry.frame(torus[1])
      if (!(major > 0 && minor > 0 && Number.isFinite(major) && Number.isFinite(minor))) fail('Invalid toroidal surface radii')
      // A torus is the tensor product of two exact rational quadratic
      // circles. Its NURBS parameters are rational-circle chart parameters,
      // not STEP angular parameters, so source pcurves must be pulled back
      // after the exact surface is created. The same representation also
      // covers the spindle/degenerate variant when its trimmed patch is
      // valid.
      const z = cross(sourceFrame.x, sourceFrame.y), quarter = Math.SQRT1_2
      const angles = [0, Math.PI / 4, Math.PI / 2, 3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, 3 * Math.PI / 2, 7 * Math.PI / 4, TAU]
      const circleWeights = [1, quarter, 1, quarter, 1, quarter, 1, quarter, 1]
      const knots2d = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4].map(value => value * Math.PI / 2)
      const points = angles.map((u, i) => angles.map((v, j) => {
        const uWeight = circleWeights[i], vWeight = circleWeights[j]
        const radius = (major + minor * Math.cos(v) / vWeight) / uWeight, height = minor * Math.sin(v) / vWeight
        return sourceFrame.origin.map((origin, axis) => origin + radius * (Math.cos(u) * sourceFrame.x[axis] + Math.sin(u) * sourceFrame.y[axis]) + height * z[axis])
      }))
      const weights = angles.map((_, i) => circleWeights.map(weight => circleWeights[i] * weight))
      return { type: 'nurbs', sourceTorus: { frame: placement(sourceFrame), major, minor }, degrees: [2, 2], points, weights, knots: [knots2d, knots2d] }
    }
    const raw = args(e, 'B_SPLINE_SURFACE_WITH_KNOTS')
    const cylinder = args(e, 'CYLINDRICAL_SURFACE'), cone = args(e, 'CONICAL_SURFACE')
    if (cylinder || cone) {
      const data = cylinder || cone, angle = cone ? data[3] * this.geometry.angleScale : 0
      if (!(data[2] > 0) || !Number.isFinite(angle) || Math.abs(angle) >= Math.PI / 2) fail('Invalid revolved surface dimensions')
      return { type: 'revolution', frame: placement(this.geometry.frame(data[1])), radius: data[2], coneAngle: angle }
    }
    const extrusion = args(e, 'SURFACE_OF_LINEAR_EXTRUSION')
    if (extrusion) {
      const source = this.get(extrusion[1]), rawCurve = args(source, 'B_SPLINE_CURVE_WITH_KNOTS'), circle = args(source, 'CIRCLE'), ellipse = args(source, 'ELLIPSE')
      const vector = args(this.get(extrusion[2]), 'VECTOR'), direction = args(this.get(vector?.[1]), 'DIRECTION')?.[1]
      if ((!rawCurve && !circle && !ellipse) || !direction || !(vector[2] > 0) || !Number.isFinite(vector[2])) fail(`Unsupported linear extrusion source or direction (source=${Object.keys(source.parts).join('/')}, vector=${Object.keys(this.get(extrusion[2]).parts).join('/')})`)
      const axis = unit(direction).map(v => v * vector[2])
      if (circle || ellipse) {
        const data = circle || ellipse, frame = this.geometry.frame(data[1]), radii = [data[2], circle ? data[2] : data[3]]
        if (!radii.every(r => r > 0 && Number.isFinite(r))) fail('Invalid linear extrusion conic source')
        const ring = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]], weight = Math.SQRT1_2
        const weights = ring.map((_, i) => i % 2 ? weight : 1)
        const base = ring.map(([x, y]) => frame.origin.map((o, i) => o + radii[0] * x * frame.x[i] + radii[1] * y * frame.y[i]))
        return { type: 'nurbs', degrees: [2, 1], points: base.map(point => [point, point.map((v, i) => v + axis[i])]), weights: base.map((_, i) => [weights[i], weights[i]]), knots: [[0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], [0, 0, 1, 1]] }
      }
      const base = source.complex ? args(source, 'B_SPLINE_CURVE') : rawCurve.slice(1, 6)
      const spec = source.complex ? rawCurve : rawCurve.slice(6)
      const degree = base[0], controls = base[1].map(r => this.geometry.point(r))
      const weights = args(source, 'RATIONAL_B_SPLINE_CURVE')?.[0] || controls.map(() => 1)
      if (!Number.isInteger(degree) || degree < 1 || weights.length !== controls.length || !weights.every(w => w > 0 && Number.isFinite(w))) fail('Invalid linear extrusion B-spline source')
      const curveKnots = knots(degree, controls.length, spec[0], spec[1])
      return { type: 'nurbs',
        degrees: [degree, 1],
        points: controls.map(point => [point, point.map((v, i) => v + axis[i])]),
        weights: controls.map((_, i) => [weights[i], weights[i]]),
        knots: [curveKnots, [0, 0, 1, 1]] }
    }
    if (!raw) fail(`Exact surface ${Object.keys(e.parts)[0]} requires a parameter-compatible trim converter`)
    const base = e.complex ? args(e, 'B_SPLINE_SURFACE') : raw.slice(1, 8), spec = e.complex ? raw : raw.slice(8)
    const points = base[2].map(row => row.map(r => this.geometry.point(r)))
    return { type: 'nurbs',
      degrees: base.slice(0, 2),
      points,
      weights: args(e, 'RATIONAL_B_SPLINE_SURFACE')?.[0] || points.map(row => row.map(() => 1)),
      knots: [knots(base[0], points.length, spec[0], spec[2]), knots(base[1], points[0].length, spec[1], spec[3])] }
  }

  pcurve (edgeReference, surfaceReference, start, end, sense) {
    const e = this.get(edgeReference), data = args(e, 'SURFACE_CURVE') || args(e, 'SEAM_CURVE')
    const candidates = (data?.[2] || []).map(r => this.get(r)).map(e => args(e, 'PCURVE')).filter(p => p && refId(p[1]) === refId(surfaceReference))
    if (!candidates.length && this.recoverTrims) return { type: 'pullback' }
    if (candidates.length !== 1) fail('Missing or ambiguous surface pcurve; exact trim recovery is required')
    const rep = this.get(candidates[0][2]), repArgs = args(rep, 'DEFINITIONAL_REPRESENTATION')
    if (repArgs?.[1]?.length !== 1) fail('Unsupported pcurve representation')
    const surface = this.geometry.surface(surfaceReference), a = surface.inverse(start), b = surface.inverse(end)
    return this.curve(repArgs[1][0], [...a, 0], [...b, 0], sense, true)
  }

  body (reference) {
    if (this.useModelUncertainty) {
      this.tolerance = this.modelTolerance(reference)
      this.geometry.joinTolerance = Math.max(this.tolerance, this.repairTolerance || 0)
    }
    const vertices = [], edges = [], faces = [], skippedFaces = [], vmap = new Map(), emap = new Map(), visited = new Set(), faceIds = []
    let closed = false
    const vertex = (key, point) => { if (!vmap.has(key)) { vmap.set(key, vertices.length); vertices.push(point) } return vmap.get(key) }
    // BREP_WITH_VOIDS stores one outer closed shell followed by oriented
    // closed shells describing voids.  The shell wrapper reverses the face
    // orientation when its orientation flag is false; retain that semantic
    // while sharing the same vertex/edge graph so OpenNURBS can represent the
    // result as one Brep with multiple closed shells.
    const visit = (reference, shellReverse = false) => {
      const e = this.get(reference)
      if (visited.has(e.id)) fail('Duplicate/cyclic shell membership')
      visited.add(e.id)
      if (['ADVANCED_FACE', 'FACE_SURFACE', 'FACE'].some(t => isType(e, t))) { faceIds.push({ entity: e, shellReverse }); return }
      const withVoids = args(e, 'BREP_WITH_VOIDS')
      if (withVoids) {
        if (withVoids.length !== 3 || !withVoids[1] || !Array.isArray(withVoids[2])) fail('Invalid BREP_WITH_VOIDS shell list')
        visit(withVoids[1], shellReverse)
        for (const voidShell of withVoids[2]) visit(voidShell, shellReverse)
        return
      }
      const orientedShell = args(e, 'ORIENTED_CLOSED_SHELL')
      if (orientedShell) {
        if (!orientedShell[2] || (orientedShell[3] !== '.T.' && orientedShell[3] !== '.F.')) fail('Invalid ORIENTED_CLOSED_SHELL orientation')
        // .T. keeps the referenced shell orientation; .F. reverses it.
        visit(orientedShell[2], shellReverse !== !bool(orientedShell[3]))
        return
      }
      const shell = args(e, 'CLOSED_SHELL') || args(e, 'OPEN_SHELL') || args(e, 'CONNECTED_FACE_SET')
      if (shell) { if (isType(e, 'CLOSED_SHELL')) closed = true; shell[1].forEach(child => visit(child, shellReverse)); return }
      const solid = args(e, 'MANIFOLD_SOLID_BREP') || args(e, 'FACETED_BREP')
      if (solid) { visit(solid[1]); return }
      const model = args(e, 'SHELL_BASED_SURFACE_MODEL') || args(e, 'FACE_BASED_SURFACE_MODEL')
      if (model?.[1]?.length === 1) { visit(model[1][0]); return }
      fail('Unsupported exact shell structure')
    }
    visit(reference)
    for (const faceEntry of faceIds) {
      try {
        const face = faceEntry.entity, shellReverse = faceEntry.shellReverse
        const a = args(face, 'ADVANCED_FACE') || args(face, 'FACE_SURFACE') || args(face, 'FACE'), samples = []
        const planar = !a[2] || isType(this.get(a[2]), 'PLANE')
        const bounds = a[1].map(r => this.get(r)), outerCount = bounds.filter(b => isType(b, 'FACE_OUTER_BOUND')).length
        if (!bounds.length || outerCount > 1 || (!outerCount && bounds.length !== 1)) fail('Ambiguous exact outer loop')
        let loops = bounds.map(bound => {
          const b = args(bound, 'FACE_OUTER_BOUND') || args(bound, 'FACE_BOUND'), loop = this.get(b[1]), poly = args(loop, 'POLY_LOOP')
          const trims = []
          if (poly) {
            const points = poly[1].map(r => this.geometry.point(r)), ids = points.map(p => vertex(`point:${p.join(',')}`, p))
            samples.push(...points)
            for (let i = 0; i < ids.length; i++) {
              const j = (i + 1) % ids.length, key = [ids[i], ids[j]].sort((a, b) => a - b).join(':')
              if (!emap.has(key)) { emap.set(key, edges.length); edges.push({ vertices: [ids[i], ids[j]], curve: { type: 'line', start: points[i], end: points[j] } }) }
              const ei = emap.get(key)
              trims.push({ edge: ei, reverse: edges[ei].vertices[0] !== ids[i] })
            }
          } else {
            const list = args(loop, 'EDGE_LOOP')?.[1]
            if (!list) fail('Unsupported exact boundary loop')
            for (const r of list) {
              const oe = this.get(r), oriented = args(oe, 'ORIENTED_EDGE'), e = oriented ? this.get(oriented[3]) : oe, data = args(e, 'EDGE_CURVE')
              if (!data) fail('Unsupported exact edge')
              const ids = [data[1], data[2]].map(ref => vertex(`vertex:${refId(ref)}`, this.geometry.point(args(this.get(ref), 'VERTEX_POINT')?.[1])))
              if (!emap.has(e.id)) { emap.set(e.id, edges.length); edges.push({ vertices: ids, curve: this.curve(data[3], vertices[ids[0]], vertices[ids[1]], bool(data[4])) }) }
              if (planar) samples.push(...this.curveHull(edges[emap.get(e.id)].curve))
              trims.push({ edge: emap.get(e.id), reverse: oriented ? !bool(oriented[4]) : false, source: data })
            }
          }
          if (!bool(b[2])) { trims.reverse(); trims.forEach(t => { t.reverse = !t.reverse }) }
          return { outer: isType(bound, 'FACE_OUTER_BOUND') || !outerCount, trims }
        })
        const surface = this.surface(a[2], samples)
        const recoverRevolution = this.recoverTrims && surface.type === 'revolution' && loops.some(loop => loop.trims.some(trim => edges[trim.edge].curve.type === 'nurbs'))
        if (recoverRevolution) this.revolvedChart(surface, loops, edges, vertices)
        else if (surface.type === 'revolution') loops = buildRevolvedTrims(surface, loops, edges, vertices, Math.max(this.tolerance, this.repairTolerance || 0))
        for (const loop of loops) {
          for (const trim of loop.trims) {
            if (recoverRevolution || (surface.type !== 'plane' && surface.type !== 'revolution')) {
              if (!trim.source) fail('Nonplanar POLY_LOOP needs exact pcurves')
              const e = edges[trim.edge], data = trim.source
              if (surface.sourceSphere || surface.sourceTorus) {
                if (!this.recoverTrims) fail('Analytic NURBS trims require parameter-compatible recovery')
                trim.curve = { type: 'pullback' }
              } else trim.curve = this.pcurve(data[3], a[2], vertices[e.vertices[0]], vertices[e.vertices[1]], bool(data[4]))
            }
            delete trim.source
          }
        }
        faces.push({ sourceEntityId: face.id, surface, loops, reverse: (a[2] ? !bool(a[3]) : false) !== shellReverse })
      } catch (error) {
        // A malformed face must not discard an otherwise usable solid. Keep
        // the source edge graph (it is still useful for the retained faces)
        // and let the native builder validate the remaining partial shell.
        if (faceIds.length <= 1) throw error
        skippedFaces.push({ sourceEntityId: faceEntry.entity.id, message: error?.message || String(error) })
      }
    }
    if (!faces.length) fail('Empty exact body')
    // A larger source uncertainty is already an allowed geometric gap. Keep it
    // unchanged in tolerance; strict descriptors never authorize extra repair.
    const descriptor = { vertices, edges, faces, closed, tolerance: this.tolerance, ...(skippedFaces.length ? { skippedFaces } : {}) }
    if (this.recoverTrims) descriptor.repairTolerance = Math.max(this.tolerance, this.repairTolerance)
    return descriptor
  }
}
