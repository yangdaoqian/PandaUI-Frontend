// Original STEP geometry evaluators and topology-to-display tessellation.
// Three.js supplies its existing polygon-with-holes triangulator; STEP geometry,
// edge sampling, UV mapping and adaptive surface refinement are implemented here.
import { ShapeUtils, Vector2 } from 'three'
import { args, isType, resolveEntity, StepUnsupported } from './StepEntityModel'

const TAU = Math.PI * 2
const add = (a, b) => a.map((v, i) => v + b[i])
const sub = (a, b) => a.map((v, i) => v - b[i])
const mul = (a, k) => a.map(v => v * k)
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0)
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const length = a => Math.hypot(...a)
const distance = (a, b) => length(sub(a, b))
const unit = a => { const n = length(a); if (!(n > 1e-14)) throw new StepUnsupported('Degenerate geometry direction'); return mul(a, 1 / n) }
const mid = (a, b) => mul(add(a, b), 0.5)
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b)))))
const fail = message => { throw new StepUnsupported(message) }
const bool = v => { if (v !== '.T.' && v !== '.F.') fail('Unknown STEP orientation'); return v === '.T.' }
// B_SPLINE_CURVE.self_intersect is an optional declaration in files emitted by
// several CAD exporters. `$` means that the exporter made no assertion; it is
// not evidence that the curve is self-intersecting. Topology orientations stay
// strict and continue to use bool().
const optionalBool = v => {
  if (v == null) return false
  if (v === '.T.') return true
  if (v === '.F.') return false
  if (v === '.U.' || v === '.UNKNOWN.' || v === '.UNDEFINED.') return false
  fail(`Unknown optional STEP boolean ${String(v)}`)
}
const numeric = v => { if (!Number.isFinite(v)) fail('Missing/invalid geometry scalar'); return v }
const positive = v => { if (!(numeric(v) > 0)) fail('Non-positive geometry dimension'); return v }
const range = values => values.reduce(([lo, hi], value) => [Math.min(lo, value), Math.max(hi, value)], [Infinity, -Infinity])

export function knots (degree, controls, mults, values) {
  if (!Number.isInteger(degree) || degree < 1 || degree >= controls || !Array.isArray(mults) || values?.length !== mults.length) fail('Invalid B-spline degree/knots')
  const out = []
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i]) || (i && values[i] <= values[i - 1]) || !Number.isInteger(mults[i]) || mults[i] < 1 || mults[i] > degree + 1) fail('Invalid B-spline knot multiplicity')
    for (let n = 0; n < mults[i]; n++) out.push(values[i])
  }
  if (out.length !== controls + degree + 1 || !(out[degree] < out[controls])) fail('Inconsistent B-spline knot count/domain')
  return out
}

// Homogeneous de Boor: the same evaluator handles polynomial/rational curves and
// each tensor direction of a rational surface. Division happens only at the end.
function deBoor (points, degree, k, t) {
  t = Math.max(k[degree], Math.min(k[points.length], t))
  let lo = degree, hi = points.length
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t < k[m]) hi = m; else lo = m }
  const span = Math.min(points.length - 1, lo), d = []
  for (let i = 0; i <= degree; i++) d.push([...points[span - degree + i]])
  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const index = span - degree + j, denom = k[index + degree - r + 1] - k[index]
      const alpha = denom ? (t - k[index]) / denom : 0
      d[j] = add(mul(d[j - 1], 1 - alpha), mul(d[j], alpha))
    }
  }
  return d[degree]
}
const cartesian = h => { if (!(h[3] > 0)) fail('Invalid rational weight'); return h.slice(0, 3).map(v => v / h[3]) }

export default class StepGeometry {
  constructor (entities, options = {}, lengthScale = 1, angleScale = 1) {
    this.entities = entities
    this.scale = positive(lengthScale)
    this.angleScale = positive(angleScale)
    this.tolerance = positive(options.tolerance ?? 0.05) / lengthScale
    this.angleTolerance = positive(options.angleTolerance ?? Math.PI / 16)
    this.maxDepth = Math.min(24, Math.max(4, options.maxDepth || 16))
    this.joinTolerance = Math.max(1e-8, this.tolerance * 0.02)
    this.edges = new Map()
    this.curves = new Map()
    this.surfaces = new Map()
    this.evaluating = new Set()
  }

  get (reference) { return resolveEntity(this.entities, reference) }
  point (reference) {
    const values = args(this.get(reference), 'CARTESIAN_POINT')?.[1]
    if (values?.length !== 3 || !values.every(Number.isFinite)) fail('Expected a 3D Cartesian point')
    return values
  }

  frame (reference) {
    const a = args(this.get(reference), 'AXIS2_PLACEMENT_3D')
    if (!a) fail('Unsupported geometry placement')
    const direction = (r, fallback) => r ? unit(args(this.get(r), 'DIRECTION')?.[1] || fail('Expected DIRECTION')) : fallback
    const origin = this.point(a[1]), z = direction(a[2], [0, 0, 1]), rawX = direction(a[3], Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])
    const x = unit(sub(rawX, mul(z, dot(rawX, z)))), y = unit(cross(z, x))
    return {
      origin,
      x,
      y,
      z,
      world: p => add(origin, add(mul(x, p[0]), add(mul(y, p[1]), mul(z, p[2])))),
      local: p => { const q = sub(p, origin); return [dot(q, x), dot(q, y), dot(q, z)] },
      vector: p => add(mul(x, p[0]), add(mul(y, p[1]), mul(z, p[2])))
    }
  }

  cached (cache, entity, create) {
    if (cache.has(entity.id)) return cache.get(entity.id)
    if (this.evaluating.has(entity.id)) fail(`Cyclic geometry #${entity.id}`)
    this.evaluating.add(entity.id)
    try { const result = create(); cache.set(entity.id, result); return result } finally { this.evaluating.delete(entity.id) }
  }

  curve (reference) {
    const e = this.get(reference)
    return this.cached(this.curves, e, () => {
      const a = type => args(e, type)
      if (a('SURFACE_CURVE') || a('SEAM_CURVE')) return this.curve((a('SURFACE_CURVE') || a('SEAM_CURVE'))[1])
      if (a('LINE')) {
        const p = this.point(a('LINE')[1]), v = args(this.get(a('LINE')[2]), 'VECTOR')
        if (!v) fail('Invalid LINE vector')
        const d = mul(unit(args(this.get(v[1]), 'DIRECTION')[1]), positive(v[2]))
        return { kind: 'line', at: t => add(p, mul(d, t)), tangent: () => d, parameter: q => dot(sub(q, p), d) / dot(d, d) }
      }
      if (a('CIRCLE') || a('ELLIPSE')) {
        const data = a('CIRCLE') || a('ELLIPSE'), f = this.frame(data[1]), rx = positive(data[2]), ry = a('CIRCLE') ? rx : positive(data[3])
        return { kind: 'conic', period: TAU, at: t => f.world([rx * Math.cos(t), ry * Math.sin(t), 0]), tangent: t => f.vector([-rx * Math.sin(t), ry * Math.cos(t), 0]), parameter: p => { const q = f.local(p); return Math.atan2(q[1] / ry, q[0] / rx) } }
      }
      if (a('TRIMMED_CURVE')) {
        // STEP exporters commonly wrap a circle or B-spline in a
        // TRIMMED_CURVE and express the trim ends as CARTESIAN_POINT
        // selections.  The underlying evaluator already knows how to
        // project a point to its native parameter domain; keep that domain
        // here and expose the wrapper as a normal curve to EDGE_CURVE and
        // the exact Brep converter.
        const raw = a('TRIMMED_CURVE'), basis = this.curve(raw[1])
        if (!raw[2]?.length || !raw[3]?.length) fail(`Invalid trimmed curve #${e.id}`)
        const trimValue = value => {
          const item = value.length === 1 ? value[0] : value
          if (typeof item === 'number') return { parameter: numeric(item) }
          if (item?.ref) return { point: this.point(item) }
          fail(`Unsupported trimmed curve selector #${e.id}`)
        }
        const first = trimValue(raw[2]), second = trimValue(raw[3])
        const parameter = trim => trim.parameter ?? basis.parameter(trim.point)
        const start = numeric(parameter(first)), end = numeric(parameter(second))
        const breaks = (basis.breaks || []).filter(t => t > Math.min(start, end) && t < Math.max(start, end))
        return {
          ...basis,
          kind: 'trimmed',
          domain: [start, end],
          breaks: [...new Set([start, ...breaks, end])],
          at: t => basis.at(t),
          tangent: t => basis.tangent(t),
          parameter: point => basis.parameter(point)
        }
      }
      if (a('B_SPLINE_CURVE_WITH_KNOTS')) {
        const raw = a('B_SPLINE_CURVE_WITH_KNOTS'), base = e.complex ? a('B_SPLINE_CURVE') : raw.slice(1, 6), spec = e.complex ? raw : raw.slice(6)
        if (!base || optionalBool(base[4])) fail('Unsupported self-intersecting B-spline curve')
        const degree = base[0], controls = base[1].map(r => this.point(r)), weights = a('RATIONAL_B_SPLINE_CURVE')?.[0] || controls.map(() => 1)
        if (weights.length !== controls.length || !weights.every(w => w > 0 && Number.isFinite(w))) fail('Invalid curve weights')
        const k = knots(degree, controls.length, spec[0], spec[1]), h = controls.map((p, i) => [...mul(p, weights[i]), weights[i]])
        const curve = { kind: 'spline', domain: [k[degree], k[controls.length]], breaks: [...new Set(k.slice(degree, controls.length + 1))], at: t => cartesian(deBoor(h, degree, k, t)) }
        curve.tangent = t => {
          const [lo, hi] = curve.domain, delta = (hi - lo) * 1e-7
          return sub(curve.at(Math.min(hi, t + delta)), curve.at(Math.max(lo, t - delta)))
        }
        curve.parameter = p => this.curveParameter(curve, p)
        return curve
      }
      fail(`Unsupported curve #${e.id}: ${Object.keys(e.parts).join('/')}`)
    })
  }

  curveParameter (curve, point) {
    // Bracket on every nonzero knot span, then bounded minimization. Verify the
    // residual before using a parameter; an ambiguous/nonmatching edge falls back.
    let best = { t: curve.domain[0], d: Infinity }
    for (let span = 1; span < curve.breaks.length; span++) {
      for (let j = 0; j < 8; j++) {
        let l = curve.breaks[span - 1] + (curve.breaks[span] - curve.breaks[span - 1]) * j / 8
        let r = curve.breaks[span - 1] + (curve.breaks[span] - curve.breaks[span - 1]) * (j + 1) / 8
        for (const t of [l, r]) { const d = distance(curve.at(t), point); if (d < best.d) best = { t, d } }
        for (let n = 0; n < 42; n++) {
          const x = l + (r - l) / 3, y = r - (r - l) / 3
          if (distance(curve.at(x), point) < distance(curve.at(y), point)) r = y; else l = x
        }
        const t = (l + r) / 2, d = distance(curve.at(t), point)
        if (d < best.d) best = { t, d }
      }
    }
    if (best.d > this.joinTolerance) fail('B-spline endpoint projection exceeds topology tolerance')
    return best.t
  }

  edge (reference) {
    const e = this.get(reference)
    if (isType(e, 'ORIENTED_EDGE')) {
      const a = args(e, 'ORIENTED_EDGE'), points = this.edge(a[3])
      return bool(a[4]) ? points : [...points].reverse()
    }
    return this.cached(this.edges, e, () => {
      const a = args(e, 'EDGE_CURVE')
      if (!a) fail(`Unsupported edge #${e.id}`)
      const vertex = r => this.point(args(this.get(r), 'VERTEX_POINT')?.[1])
      const p = vertex(a[1]), q = vertex(a[2]), c = this.curve(a[3]), forward = bool(a[4])
      let start = c.parameter(p), end = c.parameter(q)
      if (c.period) {
        if (forward) { while (end <= start + 1e-12) end += c.period } else { while (end >= start - 1e-12) end -= c.period }
      } else if (!forward && start < end - 1e-12) fail('Inconsistent reversed curve edge')
      else if (forward && start > end + 1e-12) fail('Inconsistent curve edge sense')
      if (distance(c.at(start), p) > this.joinTolerance || distance(c.at(end), q) > this.joinTolerance) fail('Edge vertices do not lie on curve')
      const out = [p]
      const sample = (u, v, x, y, depth) => {
        const ts = [0.25, 0.5, 0.75], ps = ts.map(t => c.at(u + (v - u) * t))
        const chordErrors = ps.map((r, i) => distance(r, add(mul(x, 1 - ts[i]), mul(y, ts[i]))))
        const segments = [0, ...ts, 1].map(t => c.tangent(u + (v - u) * t))
        let bend = 0
        for (let i = 1; i < segments.length; i++) if (length(segments[i - 1]) > 1e-14 && length(segments[i]) > 1e-14) bend += angle(segments[i - 1], segments[i])
        if (Math.max(...chordErrors) <= this.tolerance && bend <= this.angleTolerance && (!c.period || Math.abs(v - u) <= Math.PI / 2)) { out.push(y); return }
        if (depth >= this.maxDepth) fail(`Curve #${e.id} exceeds refinement depth at requested tolerance`)
        const m = (u + v) / 2
        sample(u, m, x, ps[1], depth + 1); sample(m, v, ps[1], y, depth + 1)
      }
      const splits = [start, ...(c.breaks || []).filter(t => t > Math.min(start, end) && t < Math.max(start, end)).sort((a, b) => forward ? a - b : b - a), end]
      for (let i = 1; i < splits.length; i++) sample(splits[i - 1], splits[i], i === 1 ? p : c.at(splits[i - 1]), i === splits.length - 1 ? q : c.at(splits[i]), 0)
      return out
    })
  }

  surface (reference) {
    const e = this.get(reference)
    return this.cached(this.surfaces, e, () => {
      const types = ['PLANE', 'CYLINDRICAL_SURFACE', 'CONICAL_SURFACE', 'SPHERICAL_SURFACE', 'TOROIDAL_SURFACE', 'DEGENERATE_TOROIDAL_SURFACE']
      const type = types.find(t => isType(e, t))
      if (!type) return this.splineSurface(e)
      const a = args(e, type), f = this.frame(a[1]), r = type === 'PLANE' ? 0 : positive(a[2])
      const cone = type === 'CONICAL_SURFACE' ? numeric(a[3]) * this.angleScale : 0, minor = (type === 'TOROIDAL_SURFACE' || type === 'DEGENERATE_TOROIDAL_SURFACE') ? positive(a[3]) : 0
      if (type === 'CONICAL_SURFACE' && (Math.abs(cone) >= Math.PI / 2 || Math.abs(cone) < 1e-12)) fail('Unsupported cone angle')
      // A DEGENERATE_TOROIDAL_SURFACE may be a spindle torus. Keep its
      // analytic parameterization so exact trim recovery can inspect the
      // source surface; native Brep validation decides whether a trimmed
      // patch is usable.
      const at = (u, v) => {
        if (type === 'PLANE') return f.world([u, v, 0])
        let radius = r, z = v
        if (type === 'CONICAL_SURFACE') { radius = r + v * Math.sin(cone); z = v * Math.cos(cone); if (radius < -this.joinTolerance) fail('Cone crosses its apex') }
        if (type === 'SPHERICAL_SURFACE') { radius = r * Math.cos(v); z = r * Math.sin(v) }
        if (type === 'TOROIDAL_SURFACE' || type === 'DEGENERATE_TOROIDAL_SURFACE') { radius = r + minor * Math.cos(v); z = minor * Math.sin(v) }
        return f.world([radius * Math.cos(u), radius * Math.sin(u), z])
      }
      const normal = (u, v) => {
        if (type === 'PLANE') return f.z
        if (type === 'SPHERICAL_SURFACE') return f.vector([Math.cos(u) * Math.cos(v), Math.sin(u) * Math.cos(v), Math.sin(v)])
        if (type === 'TOROIDAL_SURFACE' || type === 'DEGENERATE_TOROIDAL_SURFACE') return f.vector([Math.cos(u) * Math.cos(v), Math.sin(u) * Math.cos(v), Math.sin(v)])
        return f.vector([Math.cos(u) * Math.cos(cone), Math.sin(u) * Math.cos(cone), -Math.sin(cone)])
      }
      return { type,
        at,
        normal,
        periods: [type === 'PLANE' ? 0 : TAU, (type === 'TOROIDAL_SURFACE' || type === 'DEGENERATE_TOROIDAL_SURFACE') ? TAU : 0],
        inverse: p => {
          const q = f.local(p), u = Math.atan2(q[1], q[0])
          if (type === 'PLANE') return q.slice(0, 2)
          if (type === 'SPHERICAL_SURFACE') { if (Math.hypot(q[0], q[1]) < this.joinTolerance) fail('Spherical pole trim needs a singular chart'); return [u, Math.asin(Math.max(-1, Math.min(1, q[2] / r)))] }
          if (type === 'TOROIDAL_SURFACE' || type === 'DEGENERATE_TOROIDAL_SURFACE') return [u, Math.atan2(q[2], Math.hypot(q[0], q[1]) - r)]
          return [u, q[2] / Math.cos(cone)]
        } }
    })
  }

  splineSurface (e) {
    const raw = args(e, 'B_SPLINE_SURFACE_WITH_KNOTS')
    if (!raw) fail(`Unsupported surface #${e.id}: ${Object.keys(e.parts).join('/')}`)
    const b = e.complex ? args(e, 'B_SPLINE_SURFACE') : raw.slice(1, 8), k = e.complex ? raw : raw.slice(8)
    if (!b || bool(b[4]) || bool(b[5]) || bool(b[6])) fail('Closed/self-intersecting spline surface requires periodic chart support')
    const [du, dv, refs] = b, points = refs.map(row => row.map(r => this.point(r)))
    if (!points.length || !points[0].length || points.some(row => row.length !== points[0].length)) fail('Invalid surface control net')
    const ku = knots(du, points.length, k[0], k[2]), kv = knots(dv, points[0].length, k[1], k[3])
    const w = args(e, 'RATIONAL_B_SPLINE_SURFACE')?.[0] || points.map(row => row.map(() => 1))
    if (w.length !== points.length || w.some((row, i) => row.length !== points[i].length || row.some(v => !(v > 0 && Number.isFinite(v))))) fail('Invalid surface weights')
    const h = points.map((row, i) => row.map((p, j) => [...mul(p, w[i][j]), w[i][j]]))
    const domain = [[ku[du], ku[points.length]], [kv[dv], kv[points[0].length]]]
    const at = (u, v) => cartesian(deBoor(h.map(row => deBoor(row, dv, kv, v)), du, ku, u))
    const derivatives = (u, v) => domain.map(([lo, hi], axis) => {
      const t = axis ? v : u, eps = (hi - lo) * 1e-5, a = Math.max(lo, t - eps), b = Math.min(hi, t + eps)
      return mul(sub(axis ? at(u, b) : at(b, v), axis ? at(u, a) : at(a, v)), 1 / (b - a))
    })
    return { type: 'B_SPLINE_SURFACE_WITH_KNOTS',
      domain,
      at,
      periods: [0, 0],
      normal: (u, v) => { const [a, b] = derivatives(u, v); return unit(cross(a, b)) },
      inverse: p => {
        let best = { d: Infinity, uv: null }
        // Multi-start bounded Gauss-Newton. Each projected boundary is checked in
        // 3D; failure to find a trustworthy chart triggers the compatibility path.
        for (let i = 0; i <= 4; i++) {
          for (let j = 0; j <= 4; j++) {
            let uv = domain.map(([l, r], axis) => l + (r - l) * (axis ? j : i) / 4)
            for (let n = 0; n < 28; n++) {
              const q = at(...uv), residual = sub(p, q), d = length(residual)
              if (d < best.d) best = { d, uv: [...uv] }
              if (d < this.joinTolerance * 0.1) return [...uv]
              const [a, b] = derivatives(...uv), aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), det = aa * bb - ab * ab
              if (Math.abs(det) < 1e-24) break
              const ar = dot(a, residual), br = dot(b, residual), delta = [(ar * bb - br * ab) / det, (br * aa - ar * ab) / det]
              let accepted = false
              for (let step = 1; step >= 1 / 128; step /= 2) {
                const next = uv.map((v, axis) => Math.max(domain[axis][0], Math.min(domain[axis][1], v + delta[axis] * step)))
                if (distance(at(...next), p) < d) { uv = next; accepted = true; break }
              }
              if (!accepted) break
            }
          }
        }
        if (best.d > this.joinTolerance) fail('NURBS trim projection did not converge')
        return best.uv
      } }
  }

  loop (reference) {
    const e = this.get(reference)
    if (isType(e, 'POLY_LOOP')) return args(e, 'POLY_LOOP')[1].map(r => this.point(r))
    const a = args(e, 'EDGE_LOOP')
    if (!a || !a[1]?.length) fail(`Unsupported/empty boundary loop #${e.id}`)
    const points = []
    for (const r of a[1]) {
      const edge = this.edge(r)
      if (points.length && distance(points[points.length - 1], edge[0]) > this.joinTolerance) fail('Disconnected edge loop')
      for (let i = points.length ? 1 : 0; i < edge.length; i++) points.push(edge[i])
    }
    if (distance(points[0], points[points.length - 1]) > this.joinTolerance) fail('Open face boundary')
    points.pop()
    return points
  }

  face (reference) {
    const e = this.get(reference), a = args(e, 'ADVANCED_FACE') || args(e, 'FACE_SURFACE') || args(e, 'FACE')
    if (!a) fail(`Unsupported face #${e.id}`)
    let s, sense = 1
    if (a[2]) { s = this.surface(a[2]); sense = bool(a[3]) ? 1 : -1 } else {
      const bounds = a[1].map(r => this.get(r)), outer = bounds.find(b => isType(b, 'FACE_OUTER_BOUND')) || (bounds.length === 1 ? bounds[0] : null)
      if (!outer) fail('Faceted face has no unambiguous outer boundary')
      const b = args(outer, 'FACE_OUTER_BOUND') || args(outer, 'FACE_BOUND'), loop = this.loop(b[1])
      if (!bool(b[2])) loop.reverse()
      if (loop.length < 3) fail('Degenerate faceted face')
      let normal = [0, 0, 0]
      for (let i = 0; i < loop.length; i++) normal = add(normal, cross(sub(loop[i], loop[0]), sub(loop[(i + 1) % loop.length], loop[0])))
      normal = unit(normal)
      const origin = loop[0], x = unit(sub(loop[1], origin)), y = unit(cross(normal, x))
      s = { type: 'PLANE',
        periods: [0, 0],
        normal: () => normal,
        at: (u, v) => add(origin, add(mul(x, u), mul(y, v))),
        inverse: p => { const q = sub(p, origin); return [dot(q, x), dot(q, y)] } }
    }
    let rings = a[1].map(r => {
      const bound = this.get(r), b = args(bound, 'FACE_OUTER_BOUND') || args(bound, 'FACE_BOUND')
      if (!b) fail('Invalid face bound')
      let points = this.loop(b[1])
      if (!bool(b[2])) points = [...points].reverse()
      const uv = points.map(p => {
        const v = s.inverse(p)
        if (!v.every(Number.isFinite) || distance(s.at(...v), p) > this.joinTolerance) fail(`Boundary does not lie on surface #${e.id}`)
        return v
      })
      for (let i = 1; i < uv.length; i++) for (let axis = 0; axis < 2; axis++) if (s.periods[axis]) uv[i][axis] += Math.round((uv[i - 1][axis] - uv[i][axis]) / s.periods[axis]) * s.periods[axis]
      return { outer: isType(bound, 'FACE_OUTER_BOUND'), uv, points }
    })
    if (!rings.length) fail('Unbounded surface requires a closed-surface mesher')
    // A periodic cylindrical/conical strip is often encoded as two full circles
    // without a seam edge. Construct one chart, rather than fill the hole/disc.
    let stripTriangles = null
    if (rings.length === 1 && ['CYLINDRICAL_SURFACE', 'CONICAL_SURFACE'].includes(s.type)) {
      const ring = rings[0].uv, us = ring.map(p => p[0]), vs = ring.map(p => p[1])
      const [umin, umax] = range(us), [vmin, vmax] = range(vs)
      const rectangular = ring.every((a, i) => {
        const b = ring[(i + 1) % ring.length]
        return (Math.abs(a[1] - b[1]) < this.joinTolerance && (Math.abs(a[1] - vmin) < this.joinTolerance || Math.abs(a[1] - vmax) < this.joinTolerance)) ||
          (Math.abs(a[0] - b[0]) < 1e-8 && (Math.abs(a[0] - umin) < 1e-8 || Math.abs(a[0] - umax) < 1e-8))
      })
      const area = Math.abs(ring.reduce((sum, a, i) => { const b = ring[(i + 1) % ring.length]; return sum + a[0] * b[1] - a[1] * b[0] }, 0)) / 2
      if (rectangular && umax - umin <= TAU + 1e-8 && area > 0 && Math.abs(area - (umax - umin) * (vmax - vmin)) < this.joinTolerance * Math.max(1, umax - umin)) {
        const candidates = us.sort((a, b) => a - b), columns = candidates.filter((u, i) => !i || u - candidates[i - 1] > 1e-10)
        const uv = [...columns.map(u => [u, vmin]), ...[...columns].reverse().map(u => [u, vmax])]
        stripTriangles = []
        for (let i = 0; i < columns.length - 1; i++) { const top = uv.length - 1 - i; stripTriangles.push([i, i + 1, top - 1], [i, top - 1, top]) }
        rings = [{ outer: true, uv, points: uv.map(p => s.at(...p)) }]
      }
    }
    const winds = ring => {
      if (!s.periods[0]) return false
      const values = ring.uv.map(p => p[0])
      const [lo, hi] = range(values)
      return hi - lo > Math.PI * 1.5
    }
    if (!stripTriangles && rings.some(winds)) {
      if (!['CYLINDRICAL_SURFACE', 'CONICAL_SURFACE'].includes(s.type) || !rings.every(winds)) fail('Periodic winding trim needs a different chart')
      const [lo, hi] = range(rings.flatMap(r => r.uv.map(p => p[1])))
      if (!(hi > lo + this.joinTolerance)) fail('Non-circular periodic boundary')
      if (rings.length === 2) {
        for (const ring of rings) {
          if (ring.uv.some(p => Math.abs(p[1] - ring.uv[0][1]) > this.joinTolerance)) fail('Non-circular periodic boundary')
          const last = ring.uv.at(-1)[0], first = ring.uv[0][0]
          const closure = first + Math.round((last - first) / TAU) * TAU
          if (Math.abs(Math.abs(closure - first) - TAU) > 1e-8) fail('Incomplete periodic ring')
        }
      } else if (rings.length === 1) {
        const ring = rings[0].uv, [umin, umax] = range(ring.map(p => p[0]))
        if (Math.abs(umax - umin - TAU) > 1e-8) fail('Partial periodic trim requires its own chart')
        let area = 0
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length]
          const onRing = Math.abs(a[1] - b[1]) < this.joinTolerance && (Math.abs(a[1] - lo) < this.joinTolerance || Math.abs(a[1] - hi) < this.joinTolerance)
          const onSeam = Math.abs(a[0] - b[0]) < 1e-8 && (Math.abs(a[0] - umin) < 1e-8 || Math.abs(a[0] - umax) < 1e-8)
          if (!onRing && !onSeam) fail('Non-rectangular periodic trim')
          area += a[0] * b[1] - a[1] * b[0]
        }
        if (Math.abs(Math.abs(area) / 2 - TAU * (hi - lo)) > this.joinTolerance * TAU) fail('Invalid periodic trim area')
      } else fail('Periodic strip with extra boundaries requires compatibility conversion')
      const candidates = [0, ...rings.flatMap(r => r.uv.map(p => ((p[0] % TAU) + TAU) % TAU)), TAU].sort((a, b) => a - b)
      const angles = candidates.filter((v, i) => !i || v - candidates[i - 1] > 1e-10)
      const uv = [...angles.map(u => [u, lo]), ...[...angles].reverse().map(u => [u, hi])]
      stripTriangles = []
      for (let i = 0; i < angles.length - 1; i++) {
        const top = uv.length - 1 - i
        stripTriangles.push([i, i + 1, top - 1], [i, top - 1, top])
      }
      rings = [{ outer: true, uv, points: uv.map(p => s.at(...p)) }]
    }
    let outer = rings.findIndex(r => r.outer)
    if (outer < 0 && rings.length === 1) outer = 0
    if (outer < 0 || rings.filter(r => r.outer).length > 1) fail('Ambiguous outer face boundary')
    if (outer !== 0) [rings[0], rings[outer]] = [rings[outer], rings[0]]
    for (const ring of rings.slice(1)) {
      for (let axis = 0; axis < 2; axis++) {
        if (s.periods[axis]) {
          const shift = Math.round((rings[0].uv[0][axis] - ring.uv[0][axis]) / s.periods[axis]) * s.periods[axis]
          ring.uv.forEach(p => { p[axis] += shift })
        }
      }
    }
    const contours = rings.map(r => r.uv.map(p => new Vector2(...p)))
    const uv = rings.flatMap(r => r.uv), positions = rings.flatMap(r => r.points)
    let triangles = stripTriangles || ShapeUtils.triangulateShape(contours[0], contours.slice(1))
    // Earcut legitimately drops collinear UV vertices. On a cylinder those
    // vertices are NOT collinear in 3D: retain every shared trim sample before
    // lifting/refining the triangulation, or a long chord folds across the face.
    const referenced = new Set(triangles.flat())
    for (let vertex = 0; vertex < uv.length; vertex++) {
      if (referenced.has(vertex)) continue
      const p = uv[vertex], next = []
      for (const t of triangles) {
        let split = false
        if (!t.includes(vertex)) {
          for (let edge = 0; edge < 3; edge++) {
            const i = t[edge], j = t[(edge + 1) % 3], k = t[(edge + 2) % 3]
            const a = uv[i], b = uv[j], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
            const along = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
            const off = (p[0] - a[0]) * dy - (p[1] - a[1]) * dx
            if (along > 1e-10 && along < 1 - 1e-10 && off * off <= l2 * 1e-22) {
              next.push([i, vertex, k], [vertex, j, k]); split = true; break
            }
          }
        }
        if (!split) next.push(t)
      }
      triangles = next
    }
    const area = ring => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1] }, 0) / 2)
    const targetArea = area(rings[0].uv) - rings.slice(1).reduce((sum, r) => sum + area(r.uv), 0)
    const actualArea = triangles.reduce((sum, t) => sum + area(t.map(i => uv[i])), 0)
    if (!(targetArea > 0) || Math.abs(actualArea - targetArea) > Math.max(1e-10, targetArea * 1e-7)) fail('Trim triangulation failed area validation')
    // Curved trim edges keep their shared 3D samples. A straight boundary may
    // acquire collinear vertices for a varying normal without opening a crack.
    const boundary = new Set(), key = (i, j) => i < j ? `${i}:${j}` : `${j}:${i}`
    let offset = 0
    for (const ring of rings) {
      for (let i = 0; i < ring.uv.length; i++) boundary.add(key(offset + i, offset + (i + 1) % ring.uv.length))
      offset += ring.uv.length
    }
    const normals = uv.map(p => mul(unit(s.normal(...p)), sense))
    for (let pass = 0; s.type !== 'PLANE'; pass++) {
      const splits = new Map()
      const mark = (i, j) => {
        const k = key(i, j)
        if (splits.has(k)) return
        const p = mid(uv[i], uv[j]), xyz = s.at(...p), n = mul(unit(s.normal(...p)), sense)
        if (boundary.has(k) && distance(xyz, mid(positions[i], positions[j])) > this.joinTolerance * 0.01) return
        splits.set(k, { p, xyz, n, boundary: boundary.has(k) ? [i, j] : null })
      }
      for (const t of triangles) {
        let poor = false
        for (let j = 0; j < 3; j++) {
          const i = t[j], k = t[(j + 1) % 3]
          const p = mid(uv[i], uv[k])
          if (boundary.has(key(i, k)) && distance(s.at(...p), mid(positions[i], positions[k])) > this.joinTolerance * 0.01) continue
          const middleNormal = mul(unit(s.normal(...p)), sense)
          if (distance(s.at(...p), mid(positions[i], positions[k])) > this.tolerance || Math.max(angle(normals[i], normals[k]), angle(normals[i], middleNormal), angle(middleNormal, normals[k])) > this.angleTolerance) { mark(i, k); poor = true }
        }
        const center = mul(add(add(uv[t[0]], uv[t[1]]), uv[t[2]]), 1 / 3), xyz = mul(add(add(positions[t[0]], positions[t[1]]), positions[t[2]]), 1 / 3)
        if (!poor && distance(s.at(...center), xyz) > this.tolerance) {
          for (let j = 0; j < 3; j++) mark(t[j], t[(j + 1) % 3])
          if (t.every((v, j) => !splits.has(key(v, t[(j + 1) % 3])))) fail('Curved triangle requires trim-aware interior refinement')
        }
      }
      if (!splits.size) break
      if (pass >= this.maxDepth) fail(`Surface #${e.id} exceeds refinement depth at requested tolerance`)
      for (const value of splits.values()) {
        value.index = uv.length; uv.push(value.p); positions.push(value.xyz); normals.push(value.n)
        if (value.boundary) {
          const [i, j] = value.boundary
          boundary.delete(key(i, j)); boundary.add(key(i, value.index)); boundary.add(key(value.index, j))
        }
      }
      const next = []
      for (const [a, b, c] of triangles) {
        const ab = splits.get(key(a, b))?.index, bc = splits.get(key(b, c))?.index, ca = splits.get(key(c, a))?.index
        if (ab != null && bc != null && ca != null) next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca])
        else if (ab != null && bc != null) next.push([a, ab, c], [ab, bc, c], [ab, b, bc])
        else if (bc != null && ca != null) next.push([b, bc, a], [bc, ca, a], [bc, c, ca])
        else if (ca != null && ab != null) next.push([c, ca, b], [ca, ab, b], [ca, a, ab])
        else if (ab != null) next.push([a, ab, c], [ab, b, c])
        else if (bc != null) next.push([b, bc, a], [bc, c, a])
        else if (ca != null) next.push([c, ca, b], [ca, a, b])
        else next.push([a, b, c])
      }
      triangles = next
    }
    const indices = []
    for (const t of triangles) {
      const n = cross(sub(positions[t[1]], positions[t[0]]), sub(positions[t[2]], positions[t[0]]))
      if (length(n) < 1e-20) continue
      if (dot(n, normals[t[0]]) < 0) [t[1], t[2]] = [t[2], t[1]]
      indices.push(...t)
    }
    if (!indices.length) fail(`Empty mesh for face #${e.id}`)
    return { id: e.id, positions, normals, indices }
  }

  body (reference) {
    const e = this.get(reference), faces = [], faceIds = [], visited = new Set()
    const visit = r => {
      const item = this.get(r)
      if (visited.has(item.id)) fail('Duplicate or cyclic shell membership')
      visited.add(item.id)
      if (isType(item, 'ADVANCED_FACE') || isType(item, 'FACE_SURFACE') || isType(item, 'FACE')) { faceIds.push(item.id); return }
      const shell = args(item, 'CLOSED_SHELL') || args(item, 'OPEN_SHELL') || args(item, 'CONNECTED_FACE_SET')
      if (shell) { for (const f of shell[1]) visit(f); return }
      const solid = args(item, 'MANIFOLD_SOLID_BREP') || args(item, 'FACETED_BREP')
      if (solid) { visit(solid[1]); return }
      const model = args(item, 'SHELL_BASED_SURFACE_MODEL') || args(item, 'FACE_BASED_SURFACE_MODEL')
      if (model) { for (const f of model[1]) visit(f); return }
      fail(`Unsupported body topology #${item.id}: ${Object.keys(item.parts).join('/')}`)
    }
    visit(reference)
    // Reject a known unsupported face before paying to tessellate earlier faces
    // in the same atomic job. Preflight resolves types/topology, not meshes.
    for (const id of faceIds) {
      const face = this.get(id), a = args(face, 'ADVANCED_FACE') || args(face, 'FACE_SURFACE') || args(face, 'FACE')
      const bounds = a[1].map(r => this.get(r)), explicitOuter = bounds.filter(b => isType(b, 'FACE_OUTER_BOUND')).length
      if (!bounds.length || explicitOuter > 1 || (!explicitOuter && bounds.length > 1)) fail(`Ambiguous outer face boundary #${id}`)
      if (a[2]) this.surface(a[2])
      for (const bound of bounds) {
        const b = args(bound, 'FACE_OUTER_BOUND') || args(bound, 'FACE_BOUND')
        if (!b) fail('Unsupported face bound')
        const loop = this.get(b[1]), edges = args(loop, 'EDGE_LOOP')
        if (!edges && !isType(loop, 'POLY_LOOP')) fail('Unsupported face loop')
        if (edges) {
          for (const r of edges[1]) {
            const oriented = this.get(r), edge = args(oriented, 'ORIENTED_EDGE')
            const data = args(edge ? this.get(edge[3]) : oriented, 'EDGE_CURVE')
            if (!data) fail('Unsupported topological edge')
            this.curve(data[3])
          }
        }
      }
    }
    for (const id of faceIds) faces.push(this.face(id))
    if (!faces.length) fail('Body has no faces')
    return { id: e.id, name: Object.values(e.parts)[0]?.[0] || '', faces }
  }
}
