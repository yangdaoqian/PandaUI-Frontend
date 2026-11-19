import { StepUnsupported } from './StepEntityModel'

const TAU = Math.PI * 2
const fail = message => { throw new StepUnsupported(message) }
const sub = (a, b) => a.map((v, i) => v - b[i])
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0)
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const distance = (a, b) => Math.hypot(...sub(a, b))

// A line generator and a coaxial circular arc have exact, linear pullbacks on a
// cylinder/cone. No sampled polyline is promoted to an exact trimming curve.
export default function buildRevolvedTrims (surface, sourceLoops, edges, vertices, tolerance) {
  const f = surface.frame, z = cross(f.x, f.y), c = Math.cos(surface.coneAngle), s = Math.sin(surface.coneAngle)
  // STEP exporters commonly calculate the same rotational vertex through
  // different 3D edges. Keep the geometric tolerance check below, but allow
  // a small angular round-off budget before declaring the UV loop disconnected.
  // The resulting endpoint is canonicalized to the preceding trim so the
  // OpenNURBS loop validator sees exactly one shared UV coordinate.
  const joinTolerance = Math.max(1e-8, tolerance * 1e-3)
  const local = p => { const d = sub(p, f.origin); return [dot(d, f.x), dot(d, f.y), dot(d, z)] }
  const inverse = p => {
    const q = local(p), v = q[2] / c, radius = surface.radius + v * s
    const radialGap = Math.abs(Math.hypot(q[0], q[1]) - radius)
    const apexTolerance = Math.max(1e-8, Math.min(tolerance, 1e-5))
    if (!(radius > apexTolerance) || radialGap > tolerance) fail(`Revolved trim reaches the apex or leaves its surface (radius=${radius}, radialGap=${radialGap}, tolerance=${tolerance})`)
    return [Math.atan2(q[1], q[0]), v, 0]
  }
  const uvEdge = trim => {
    const edge = edges[trim.edge], curve = edge.curve, start = inverse(vertices[edge.vertices[0]]), end = inverse(vertices[edge.vertices[1]])
    if (curve.type === 'line') {
      end[0] += Math.round((start[0] - end[0]) / TAU) * TAU
      if (Math.abs(end[0] - start[0]) * Math.max(surface.radius + start[1] * s, surface.radius + end[1] * s) > tolerance) fail('Revolved line is not a generator')
      end[0] = start[0]
      // The repair envelope is a spatial gap budget, not a UV interval
      // threshold. A short but valid generator must not become degenerate just
      // because the source model needed a larger endpoint repair tolerance.
      if (Math.abs(end[1] - start[1]) <= Math.max(1e-8, Math.min(tolerance, 1e-5))) fail('Degenerate revolved generator')
    } else if (curve.type === 'conic') {
      const center = local(curve.frame.origin), axis = cross(curve.frame.x, curve.frame.y), alignment = dot(axis, z)
      if (Math.hypot(center[0], center[1]) > tolerance || Math.hypot(...cross(axis, z)) > 1e-10 || Math.abs(curve.radii[0] - curve.radii[1]) > tolerance || Math.abs(start[1] - end[1]) > tolerance) fail('Revolved conic is not a coaxial circle')
      const radius = surface.radius + center[2] / c * s
      if (Math.abs(curve.radii[0] - radius) > tolerance) fail('Revolved circle radius disagrees with surface')
      end[0] = start[0] + (curve.interval[1] - curve.interval[0]) * (curve.reverse ? -1 : 1) * Math.sign(alignment)
      end[1] = start[1]
    } else fail('Revolved trim needs a general pcurve recovery algorithm')
    return trim.reverse ? { start: end, end: start } : { start, end }
  }
  let loops = sourceLoops.map(loop => ({ ...loop, trims: loop.trims.map(trim => ({ ...trim })) }))
  // Some STEP writers omit the seam and supply just two closed circular bounds.
  // Add one shared 3D seam with two UV uses. Existing ring vertices/edges stay
  // shared with caps and neighboring faces.
  if (loops.length === 2 && loops.every(loop => loop.trims.length === 1)) {
    const a = loops[0].trims[0], b = loops[1].trims[0], ea = edges[a.edge], eb = edges[b.edge], ua = uvEdge(a), ub = uvEdge(b)
    if (ea.vertices[0] !== ea.vertices[1] || eb.vertices[0] !== eb.vertices[1] || Math.abs(Math.abs(ua.end[0] - ua.start[0]) - TAU) > 1e-10 || Math.abs(Math.abs(ub.end[0] - ub.start[0]) - TAU) > 1e-10) fail('Two revolved bounds are not full rings')
    if ((ua.end[0] - ua.start[0]) * (ub.end[0] - ub.start[0]) >= 0) fail('Revolved rings have incompatible boundary directions')
    const aligned = ub.start[0] + Math.round((ua.start[0] - ub.start[0]) / TAU) * TAU
    if (Math.abs(aligned - ua.start[0]) > 1e-10) fail('Ring seams have different angular origins')
    const ei = edges.length
    edges.push({ vertices: [ea.vertices[0], eb.vertices[0]], curve: { type: 'line', start: vertices[ea.vertices[0]], end: vertices[eb.vertices[0]] } })
    loops = [{ outer: true, trims: [a, { edge: ei, reverse: false }, b, { edge: ei, reverse: true }] }]
  }
  const ordered = [...loops].sort((a, b) => Number(b.outer) - Number(a.outer))
  let outerCenter = null, outerDomain = null
  for (const loop of ordered) {
    let first, previous
    const pairs = loop.trims.map(trim => {
      const uv = uvEdge(trim)
      if (previous) {
        const shift = Math.round((previous[0] - uv.start[0]) / TAU) * TAU
        uv.start[0] += shift; uv.end[0] += shift
        if (Math.abs(previous[0] - uv.start[0]) > joinTolerance || Math.abs(previous[1] - uv.start[1]) > tolerance) fail('Revolved UV loop is disconnected')
        uv.start[0] = previous[0]
        uv.start[1] = previous[1]
      } else first = uv.start
      previous = uv.end
      return uv
    })
    if (!first || distance(first, previous) > Math.max(joinTolerance, tolerance)) fail('Revolved loop winds without a closing seam')
    // Canonicalize the final closure as well. This removes sub-nanometer
    // endpoint drift before the line trims are handed to OpenNURBS.
    pairs[pairs.length - 1].end[0] = first[0]
    pairs[pairs.length - 1].end[1] = first[1]
    const us = pairs.flatMap(pair => [pair.start[0], pair.end[0]]), vs = pairs.flatMap(pair => [pair.start[1], pair.end[1]])
    const u = [Math.min(...us), Math.max(...us)], v = [Math.min(...vs), Math.max(...vs)]
    if (!(u[1] > u[0]) || !(v[1] > v[0]) || u[1] - u[0] > TAU + 1e-9) fail('Invalid revolved chart extent')
    let shift = 0
    if (loop.outer) {
      if (outerDomain) fail('Multiple outer revolved charts')
      outerCenter = (u[0] + u[1]) / 2; outerDomain = [u, v]
    } else {
      if (!outerDomain) fail('Missing outer revolved chart')
      shift = Math.round((outerCenter - (u[0] + u[1]) / 2) / TAU) * TAU
      if (u[0] + shift < outerDomain[0][0] - 1e-9 || u[1] + shift > outerDomain[0][1] + 1e-9 || v[0] < outerDomain[1][0] - tolerance || v[1] > outerDomain[1][1] + tolerance) fail('Revolved hole leaves the outer chart')
    }
    loop.trims.forEach((trim, i) => {
      const { start, end } = pairs[i]
      start[0] += shift; end[0] += shift
      trim.curve = { type: 'line', start: trim.reverse ? end : start, end: trim.reverse ? start : end }
      delete trim.source
    })
  }
  if (!outerDomain) fail('Missing revolved outer boundary')
  // Normalize a near-full revolution to the exact period so OpenNURBS can
  // recognize closure. No angular-to-NURBS parameter substitution is involved.
  if (Math.abs(outerDomain[0][1] - outerDomain[0][0] - TAU) < 1e-10) outerDomain[0][1] = outerDomain[0][0] + TAU
  surface.domain = outerDomain
  return ordered
}
