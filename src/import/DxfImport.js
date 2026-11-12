import DxfParser from 'dxf-parser'
import acadColors from 'dxf-parser/dist/AutoCadColorIndex'
import { Matrix4, Vector3 } from 'three'
import { meshQualityOptions } from './MeshQuality'

const TAU = Math.PI * 2
const structural = new Set(['SECTION', 'ENDSEC', 'TABLE', 'ENDTAB', 'BLOCK', 'ENDBLK', 'EOF'])
const rgb = color => [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255]
const value = (entity, code, fallback) => entity.tags.find(tag => tag.code === code)?.value ?? fallback
const values = (entity, code) => entity.tags.filter(tag => tag.code === code).map(tag => tag.value)
const number = (entity, code, fallback = 0) => {
  const n = Number(value(entity, code, fallback))
  if (!Number.isFinite(n)) throw new Error(`Invalid group ${code}`)
  return n
}
function point (entity, code = 10, required = true) {
  if (required && (value(entity, code) == null || value(entity, code + 10) == null)) throw new Error(`Missing point ${code}`)
  return new Vector3(number(entity, code), number(entity, code + 10), number(entity, code + 20))
}

// Validate section boundaries before entering the dependency's scanner. In
// particular, its stock POLYLINE parser can loop forever on a missing SEQEND.
// Keep tags ourselves via its public handler API: stock handlers discard OCS,
// rational spline weights, polyline elevation and several visibility flags.
function scan (text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('DXF input is empty')
  if (text.startsWith('AutoCAD Binary DXF') || text.includes('\0')) throw new Error('Binary DXF is not supported; export an ASCII DXF')
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  if (lines.length % 2) throw new Error('Malformed DXF: incomplete group pair')
  const types = new Set(), layers = [], source = []
  let section = null, table = false, block = false, eof = false, record
  for (let i = 0; i < lines.length; i += 2) {
    if (!/^\s*\d+\s*$/.test(lines[i])) throw new Error(`Malformed DXF group code at line ${i + 1}`)
    const code = Number(lines[i]), v = lines[i + 1].trim()
    if (eof) throw new Error('Malformed DXF: data after EOF')
    if (code === 0) {
      record = { type: v, tags: [] }
      if (v === 'SECTION') {
        if (section || Number(lines[i + 2]) !== 2) throw new Error('Malformed DXF section')
        section = lines[i + 3]?.trim()
      } else if (v === 'ENDSEC') {
        if (!section || table || block) throw new Error('Malformed DXF section ending')
      } else if (v === 'TABLE') {
        if (section !== 'TABLES' || table) throw new Error('Malformed DXF table')
        table = true
      } else if (v === 'ENDTAB') {
        if (!table) throw new Error('Malformed DXF table ending')
        table = false
      } else if (v === 'BLOCK') {
        if (section !== 'BLOCKS' || block) throw new Error('Malformed DXF block')
        block = true
      } else if (v === 'ENDBLK') {
        if (!block) throw new Error('Malformed DXF block ending')
        block = false
      } else if (v === 'EOF') {
        if (section) throw new Error('Malformed DXF: unclosed section')
        eof = true
      } else if (!section) throw new Error('Malformed DXF: entity outside a section')
      if (!structural.has(v)) types.add(v)
      if (section === 'TABLES' && v === 'LAYER') layers.push(record)
    } else if (record) record.tags.push({ code, value: v })
    // We parse layers directly, avoiding the dependency's lossy layer handling
    // and non-advancing loops on unexpected table records.
    if (section === 'HEADER' || section === 'BLOCKS' || section === 'ENTITIES' || eof) source.push(lines[i], lines[i + 1])
    if (code === 0 && v === 'ENDSEC') section = null
  }
  if (!eof) throw new Error('Malformed DXF: missing EOF')
  return { types, layers, source: source.join('\n') }
}

function rawEntity (scanner, first) {
  const entity = { type: first.value, tags: [] }
  let current = scanner.next()
  while (current.code !== 0) {
    entity.tags.push(current)
    current = scanner.next()
  }
  if (entity.type === 'POLYLINE') {
    entity.vertices = []
    while (current.value === 'VERTEX') {
      entity.vertices.push(rawEntity(scanner, current))
      current = scanner.lastReadGroup
    }
    if (current.value !== 'SEQEND') throw new Error('Malformed DXF: POLYLINE is missing SEQEND')
    rawEntity(scanner, current)
  }
  return entity
}

function normal (entity) {
  const n = value(entity, 210) == null ? new Vector3(0, 0, 1) : point(entity, 210)
  if (!n.lengthSq()) throw new Error('Zero extrusion normal')
  return n.normalize()
}
function ocs (entity) {
  const z = normal(entity)
  const x = new Vector3().crossVectors(Math.abs(z.x) < 1 / 64 && Math.abs(z.y) < 1 / 64 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1), z).normalize()
  return new Matrix4().makeBasis(x, new Vector3().crossVectors(z, x), z)
}
function span (start, end) {
  const delta = end - start
  return Math.abs(delta) >= TAU - 1e-12 ? TAU : ((delta % TAU) + TAU) % TAU
}
function lineSegments (points, closed = false) {
  const result = []
  for (let i = 1; i < points.length; i++) result.push(points[i - 1], points[i])
  if (closed && points.length > 1 && !points[0].equals(points[points.length - 1])) result.push(points[points.length - 1], points[0])
  return result
}
function repeatedPoints (entity, code) {
  const points = []
  let current
  for (const tag of entity.tags) {
    if (tag.code === code) {
      current = { type: 'VERTEX', tags: [tag] }
      points.push(current)
    } else if (current && (tag.code === code + 10 || tag.code === code + 20 || (code === 10 && [40, 41, 42].includes(tag.code)))) current.tags.push(tag)
  }
  return points
}

function splineEvaluator (entity) {
  const points = repeatedPoints(entity, 10).map(p => point(p)), knots = values(entity, 40).map(Number)
  const weights = values(entity, 41).map(Number), degree = number(entity, 71)
  if (!Number.isInteger(degree) || degree < 1 || degree > 25 || points.length <= degree || knots.length !== points.length + degree + 1) throw new Error('Unsupported or invalid SPLINE control points/knots (fit-only splines are unsupported)')
  if (knots.some((k, i) => !Number.isFinite(k) || (i > 0 && k < knots[i - 1])) || (weights.length && (weights.length !== points.length || weights.some(w => !Number.isFinite(w) || w <= 0)))) throw new Error('Invalid SPLINE knots or weights')
  const start = knots[degree], end = knots[points.length]
  if (!(end > start)) throw new Error('Empty SPLINE parameter domain')
  const evaluate = (t, fromLeft = false) => {
    let k = degree
    while (k < points.length - 1 && (fromLeft ? t > knots[k + 1] : t >= knots[k + 1])) k++
    const d = []
    for (let j = 0; j <= degree; j++) {
      const i = k - degree + j, w = weights[i] ?? 1, p = points[i]
      d.push([p.x * w, p.y * w, p.z * w, w])
    }
    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const i = k - degree + j, denominator = knots[i + degree - r + 1] - knots[i]
        const a = denominator ? (t - knots[i]) / denominator : 0
        for (let axis = 0; axis < 4; axis++) d[j][axis] = (1 - a) * d[j - 1][axis] + a * d[j][axis]
      }
    }
    return new Vector3(d[degree][0], d[degree][1], d[degree][2]).multiplyScalar(1 / d[degree][3])
  }
  return { evaluate, breaks: [...new Set(knots.slice(degree, points.length + 1))] }
}

/**
 * Parse ASCII DXF into transfer-friendly display packets. `records` and the
 * returned object are iterable. Lines are independent segment pairs; meshes
 * are indexed triangles. Coordinates include OCS and nested INSERT transforms;
 * colors are normalized RGB (0..1). Hidden entities retain visible:false.
 * metadata.units is the original $INSUNITS integer (0 = unspecified), without
 * unit conversion. Warnings/skipped report omissions and approximations.
 */
export function parseDxf (text, options = {}) {
  const scanned = scan(text), parser = new DxfParser()
  for (const type of scanned.types) {
    parser.registerEntityHandler(class {
      constructor () { this.ForEntityName = type }
      parseEntity (scanner, first) { return rawEntity(scanner, first) }
    })
  }
  let document
  try { document = parser.parseSync(scanned.source) } catch (error) { throw new Error(`Cannot parse DXF: ${error.message}`) }
  const settings = { ...meshQualityOptions(options.meshPrecision), ...options, ...options.meshingOptions }
  const tolerance = settings.tolerance, angle = settings.angleTolerance
  if (!(Number.isFinite(tolerance) && tolerance > 0 && Number.isFinite(angle) && angle > 0)) throw new Error('DXF sampling tolerances must be positive finite numbers')
  const maxDepth = Math.min(24, Math.max(1, Math.floor(settings.maxDepth || 16)))
  const metadata = { layers: [], units: document.header?.$INSUNITS ?? 0, warnings: [], skipped: {} }
  const warnings = new Set(), layers = new Map(), records = []
  const warn = message => { if (!warnings.has(message)) { warnings.add(message); metadata.warnings.push(message) } }
  const skip = (entity, reason) => {
    metadata.skipped[entity.type] = (metadata.skipped[entity.type] || 0) + 1
    warn(`${entity.type}: ${reason}`)
  }
  const getLayer = name => {
    if (!layers.has(name)) {
      const layer = { name, path: name, color: [1, 1, 1], visible: true }
      layers.set(name, layer); metadata.layers.push(layer)
    }
    return layers.get(name)
  }
  for (const entry of scanned.layers) {
    const layer = getLayer(String(value(entry, 2, '0'))), index = number(entry, 62, 7)
    layer.color = rgb(number(entry, 420, acadColors[Math.abs(index)] ?? 0xffffff))
    // Bit 2 is "frozen in new viewports", not frozen in model space.
    layer.visible = index >= 0 && !(number(entry, 70) & 1)
  }
  let sequence = 0

  function sampleArc (center, u, v, start, sweep, transform) {
    const origin = new Vector3().applyMatrix4(transform)
    const radius = Math.max(u.clone().applyMatrix4(transform).distanceTo(origin), v.clone().applyMatrix4(transform).distanceTo(origin))
    // Frobenius bound also covers shear introduced by nested INSERTs.
    const radiusBound = radius * Math.SQRT2
    const sagittaAngle = radiusBound ? 4 * Math.asin(Math.sqrt(Math.min(1, tolerance / (2 * radiusBound)))) : angle
    const count = Math.max(1, Math.ceil(Math.abs(sweep) / Math.min(angle, Math.PI / 2, sagittaAngle)))
    if (!Number.isFinite(count) || count > 1000000) throw new Error('Curve sampling would exceed 1,000,000 segments')
    const points = [], at = t => center.clone().addScaledVector(u, Math.cos(t)).addScaledVector(v, Math.sin(t))
    const tangent = t => u.clone().multiplyScalar(-Math.sin(t)).addScaledVector(v, Math.cos(t)).applyMatrix4(transform).sub(origin)
    const append = (a, b, depth) => {
      const ta = tangent(a), tb = tangent(b)
      if (ta.lengthSq() && tb.lengthSq() && ta.angleTo(tb) > angle) {
        if (depth < maxDepth) {
          const mid = (a + b) / 2
          append(a, mid, depth + 1); append(mid, b, depth + 1)
          return
        }
        warn('Curve sampling depth reached before requested angular tolerance')
      }
      if (points.length >= 1000000) throw new Error('Curve sampling would exceed 1,000,000 segments')
      points.push(at(b))
    }
    points.push(at(start))
    for (let i = 0; i < count; i++) append(start + sweep * i / count, start + sweep * (i + 1) / count, 0)
    return points
  }

  function sampleSpline (entity, transform) {
    const { evaluate, breaks } = splineEvaluator(entity), points = []
    const world = t => evaluate(t).applyMatrix4(transform)
    const recurse = (a, b, pa, pb, depth) => {
      const samples = [pa, world(a + (b - a) / 4), world((a + b) / 2), world(a + 3 * (b - a) / 4), pb]
      const chord = pb.clone().sub(pa), lengthSq = chord.lengthSq()
      let error = 0, turn = 0
      for (let i = 1; i < 4; i++) {
        const t = lengthSq ? Math.max(0, Math.min(1, samples[i].clone().sub(pa).dot(chord) / lengthSq)) : 0
        error = Math.max(error, samples[i].distanceTo(pa.clone().addScaledVector(chord, t)))
        const before = samples[i].clone().sub(samples[i - 1]), after = samples[i + 1].clone().sub(samples[i])
        if (before.lengthSq() && after.lengthSq()) turn = Math.max(turn, before.angleTo(after))
      }
      if (error > tolerance || turn > angle) {
        if (depth < maxDepth) {
          const mid = (a + b) / 2
          recurse(a, mid, pa, samples[2], depth + 1); recurse(mid, b, samples[2], pb, depth + 1)
          return
        }
        warn('SPLINE: sampling depth reached before requested tolerance')
      }
      if (points.length >= 1000000) throw new Error('SPLINE sampling would exceed 1,000,000 segments')
      points.push(pa, pb)
    }
    for (let i = 1; i < breaks.length; i++) {
      // Seed each knot span: midpoint-only tests miss symmetric S-curves.
      for (let j = 0; j < 4; j++) {
        const a = breaks[i - 1] + (breaks[i] - breaks[i - 1]) * j / 4
        const b = breaks[i - 1] + (breaks[i] - breaks[i - 1]) * (j + 1) / 4
        recurse(a, b, world(a), evaluate(b, j === 3).applyMatrix4(transform), 0)
      }
    }
    return points
  }

  function visit (entity, parent, inheritedLayer, inheritedColor, inheritedVisible, stack) {
    const type = entity.type
    if (type === 'SEQEND') return
    try {
      const layerName = String(value(entity, 8, '0'))
      const layer = getLayer(layerName === '0' && inheritedLayer ? inheritedLayer : layerName)
      const colorIndex = number(entity, 62, 256)
      const color = value(entity, 420) != null ? rgb(number(entity, 420)) : colorIndex === 0 ? (inheritedColor || layer.color) : Math.abs(colorIndex) === 256 ? layer.color : rgb(acadColors[Math.abs(colorIndex)] ?? 0xffffff)
      const visible = inheritedVisible && layer.visible && number(entity, 60) !== 1 && colorIndex >= 0
      if (number(entity, 67) === 1 && !options.includePaperSpace) { skip(entity, 'paper-space entity omitted'); return }
      if (type === 'INSERT') {
        const name = String(value(entity, 2, ''))
        const block = Object.prototype.hasOwnProperty.call(document.blocks || {}, name) ? document.blocks[name] : null
        if (!block) { skip(entity, `missing block ${name}`); return }
        if (stack.includes(name) || stack.length >= 64) { skip(entity, `cyclic or excessively nested block ${name}`); return }
        if (block.xrefPath) warn(`INSERT: external reference ${name} is not loaded; using embedded entities only`)
        const position = point(entity), rotation = number(entity, 50) * Math.PI / 180
        const scale = new Matrix4().makeScale(number(entity, 41, 1), number(entity, 42, 1), number(entity, 43, 1))
        const base = block.position || { x: 0, y: 0, z: 0 }
        scale.multiply(new Matrix4().makeTranslation(-base.x, -base.y, -(base.z || 0)))
        const basis = parent.clone().multiply(ocs(entity)).multiply(new Matrix4().makeTranslation(position.x, position.y, position.z)).multiply(new Matrix4().makeRotationZ(rotation))
        const columns = number(entity, 70, 1), rows = number(entity, 71, 1)
        if (!Number.isInteger(columns) || !Number.isInteger(rows) || rows < 1 || columns < 1 || rows * columns > 1000000) throw new Error('Invalid or excessive INSERT array size')
        for (let row = 0; row < rows; row++) {
          for (let column = 0; column < columns; column++) {
            const matrix = basis.clone().multiply(new Matrix4().makeTranslation(column * number(entity, 44), row * number(entity, 45), 0)).multiply(scale)
            for (const child of block.entities || []) visit(child, matrix, layer.path, color, visible, [...stack, name])
          }
        }
        if (!block.entities?.length) warn(`INSERT: block ${name} contains no entities`)
        return
      }
      let kind = 'lines', points = [], indices, transform = parent
      if (number(entity, 39) !== 0) warn(`${type}: extrusion thickness is displayed as a surface or centerline`)
      if (value(entity, 6) && !['BYLAYER', 'BYBLOCK', 'CONTINUOUS'].includes(String(value(entity, 6)).toUpperCase())) warn(`${type}: line pattern is displayed as continuous`)
      if (type === 'LINE') points = [point(entity, 10), point(entity, 11)]
      else if (type === 'POINT') { kind = 'points'; points = [point(entity)] } else if (type === 'CIRCLE' || type === 'ARC') {
        const radius = number(entity, 40)
        if (!(radius > 0)) throw new Error('Radius must be positive')
        transform = parent.clone().multiply(ocs(entity))
        const start = type === 'ARC' ? number(entity, 50) * Math.PI / 180 : 0
        const sweep = type === 'ARC' ? span(start, number(entity, 51) * Math.PI / 180) : TAU
        points = lineSegments(sampleArc(point(entity), new Vector3(radius, 0, 0), new Vector3(0, radius, 0), start, sweep, transform))
      } else if (type === 'ELLIPSE') {
        const u = point(entity, 11), ratio = number(entity, 40), n = normal(entity)
        if (!u.lengthSq() || !(ratio > 0)) throw new Error('Invalid ELLIPSE axes')
        const v = new Vector3().crossVectors(n, u).normalize().multiplyScalar(u.length() * ratio)
        if (!v.lengthSq()) throw new Error('ELLIPSE major axis is parallel to normal')
        const start = number(entity, 41), sweep = span(start, number(entity, 42, TAU))
        points = lineSegments(sampleArc(point(entity), u, v, start, sweep, transform))
      } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
        const flags = number(entity, 70), vertices = type === 'POLYLINE' ? entity.vertices : repeatedPoints(entity, 10)
        if (flags & (16 | 64)) { skip(entity, 'polygon/polyface mesh POLYLINE is unsupported'); return }
        if (flags & (2 | 4)) warn(`${type}: fitted polyline displayed through stored vertices`)
        if (number(entity, 43) || number(entity, 40) || number(entity, 41) || vertices.some(v => number(v, 40) || number(v, 41))) warn(`${type}: polyline width is displayed as a centerline`)
        if (vertices.length < 2) throw new Error('Polyline requires at least two vertices')
        if (type === 'LWPOLYLINE' && number(entity, 90, vertices.length) !== vertices.length) throw new Error('LWPOLYLINE vertex count does not match')
        const is3d = type === 'POLYLINE' && (flags & 8)
        if (!is3d) transform = parent.clone().multiply(ocs(entity))
        const coordinates = vertices.map(v => {
          const p = point(v)
          if (!is3d) p.z = number(entity, type === 'POLYLINE' ? 30 : 38)
          return p
        })
        const count = coordinates.length - ((flags & 1) ? 0 : 1)
        for (let i = 0; i < count; i++) {
          const a = coordinates[i], b = coordinates[(i + 1) % coordinates.length], bulge = number(vertices[i], 42)
          if (!bulge || is3d || a.equals(b)) {
            points.push(a, b)
            if (bulge && is3d) warn('POLYLINE: bulge on a 3D polyline is ignored')
          } else {
            const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
            const offset = (1 - bulge * bulge) / (4 * bulge)
            const center = new Vector3((a.x + b.x) / 2 - dy * offset, (a.y + b.y) / 2 + dx * offset, a.z)
            const radius = length * (1 + bulge * bulge) / (4 * Math.abs(bulge))
            const sampled = sampleArc(center, new Vector3(radius, 0, 0), new Vector3(0, radius, 0), Math.atan2(a.y - center.y, a.x - center.x), 4 * Math.atan(bulge), transform)
            sampled[0] = a; sampled[sampled.length - 1] = b
            for (const p of lineSegments(sampled)) points.push(p)
          }
        }
      } else if (type === '3DFACE' || type === 'SOLID' || type === 'TRACE') {
        kind = 'mesh'
        points = [point(entity, 10), point(entity, 11), point(entity, 12)]
        if (value(entity, 13) != null) points.push(point(entity, 13))
        if (points.length === 4 && points[2].equals(points[3])) points.pop()
        if (type !== '3DFACE') {
          transform = parent.clone().multiply(ocs(entity))
          if (points.length === 4) [points[2], points[3]] = [points[3], points[2]]
        }
        indices = points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]
      } else if (type === 'SPLINE') {
        points = sampleSpline(entity, parent)
        transform = new Matrix4()
      } else { skip(entity, 'unsupported entity'); return }
      if (!points.length) { skip(entity, 'empty geometry'); return }
      const positions = new Float32Array(points.length * 3)
      for (let i = 0; i < points.length; i++) points[i].clone().applyMatrix4(transform).toArray(positions, i * 3)
      if (!positions.every(Number.isFinite)) throw new Error('Coordinates exceed finite Float32 range')
      const displayObject = { id: `dxf-${++sequence}`, name: `${type} ${value(entity, 5, sequence)}`, layerPath: layer.path, color: [...color], visible, kind, positions }
      if (indices) {
        // Bake reflection while preserving the source face's front side.
        if (transform.determinant() < 0) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
        displayObject.indices = new Uint32Array(indices)
        // Accumulate in doubles: valid large Float32 coordinates can produce
        // cross products beyond Float32 range before normalizing.
        const normals = new Float64Array(positions.length)
        for (let i = 0; i < indices.length; i += 3) {
          const a = new Vector3().fromArray(positions, indices[i] * 3), b = new Vector3().fromArray(positions, indices[i + 1] * 3), c = new Vector3().fromArray(positions, indices[i + 2] * 3)
          const n = b.sub(a).cross(c.sub(a))
          for (const index of indices.slice(i, i + 3)) { normals[index * 3] += n.x; normals[index * 3 + 1] += n.y; normals[index * 3 + 2] += n.z }
        }
        for (let i = 0; i < normals.length; i += 3) new Vector3().fromArray(normals, i).normalize().toArray(normals, i)
        displayObject.normals = new Float32Array(normals)
      }
      records.push({ displayObject })
    } catch (error) { skip(entity, error.message) }
  }
  for (const entity of document.entities || []) visit(entity, new Matrix4(), null, null, true, [])
  return { records, metadata, [Symbol.iterator]: () => records[Symbol.iterator]() }
}

export default parseDxf
