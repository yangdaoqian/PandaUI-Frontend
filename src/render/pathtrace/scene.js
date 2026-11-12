// Pure data / CPU code. Deliberately independent of THREE and browser globals.
export const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
export const NODE_WORDS = 12
export const TRIANGLE_WORDS = 24
export const INSTANCE_WORDS = 32
export const LIGHT_WORDS = 8
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const sub = (a, b) => a.map((x, i) => x - b[i])
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export function unit (a) {
  const n = Math.hypot(...a)
  if (!(n > 0)) throw new Error('Zero length direction/normal')
  return a.map(x => x / n)
}
export function finiteArray (value, size, name) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || (size !== undefined && value.length !== size)) throw new Error(`${name}: expected ${size === undefined ? 'numeric' : size} array`)
  const out = Array.from(value)
  if (out.some(x => typeof x !== 'number' || !Number.isFinite(Math.fround(x)))) throw new Error(`${name}: nonfinite or outside float32 range`)
  return out
}
export function scalar (value, fallback, min, max, name) {
  const n = value === undefined ? fallback : value
  if (typeof n !== 'number' || !Number.isFinite(Math.fround(n)) || n < min || n > max) throw new Error(`${name}: expected number in [${min}, ${max}]`)
  return n
}
export function color (value, fallback, name) {
  const a = finiteArray(value === undefined ? fallback : value, 3, name)
  if (a.some(x => x < 0)) throw new Error(`${name}: negative color`)
  return a
}
export function transformPoint (m, p, w = 1) {
  return [0, 1, 2].map(i => m[i] * p[0] + m[i + 4] * p[1] + m[i + 8] * p[2] + m[i + 12] * w)
}
export function invertAffine (input = IDENTITY) {
  const m = finiteArray(input, 16, 'matrix')
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) throw new Error('matrix must be affine')
  const a = m.slice(0, 3); const b = m.slice(4, 7); const c = m.slice(8, 11)
  const det = dot(a, cross(b, c))
  if (!Number.isFinite(det) || det === 0) throw new Error('matrix must be invertible')
  const rows = [cross(b, c), cross(c, a), cross(a, b)].map(r => r.map(x => x / det))
  const inv = [rows[0][0], rows[1][0], rows[2][0], 0, rows[0][1], rows[1][1], rows[2][1], 0, rows[0][2], rows[1][2], rows[2][2], 0, ...rows.map(r => -dot(r, m.slice(12, 15))), 1]
  finiteArray(inv, 16, 'inverse matrix')
  return inv
}
function bounds (points) {
  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity]
  for (const p of points) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]) }
  return { min, max }
}
function expanded (box) {
  // Outward padding protects slab traversal after GPU float32 conversion.
  return { min: box.min.map((v, k) => v - Math.max(1e-7, Math.abs(v) * 2e-7, (box.max[k] - v) * 2e-7)), max: box.max.map((v, k) => v + Math.max(1e-7, Math.abs(v) * 2e-7, (v - box.min[k]) * 2e-7)) }
}
export function transformedBounds (box, matrix) {
  const corners = []
  for (let i = 0; i < 8; i++) corners.push(transformPoint(matrix, [0, 1, 2].map(k => (i & (1 << k)) ? box.max[k] : box.min[k])))
  return expanded(bounds(corners))
}

// Preorder, escape-linked tree: each traversal is bounded by node count and needs no stack.
export function buildBVH (items, leafSize = 4, nodes = [], ordered = []) {
  if (!items.length) return { root: 0xffffffff, end: nodes.length, nodes, ordered }
  function visit (list) {
    const index = nodes.length
    const box = expanded(bounds(list.flatMap(item => [item.min, item.max])))
    const node = { ...box, first: 0, count: 0, escape: 0 }
    nodes.push(node)
    if (list.length <= leafSize) {
      node.first = ordered.length; node.count = list.length
      ordered.push(...list)
    } else {
      const extent = box.max.map((x, i) => x - box.min[i])
      const axis = extent.indexOf(Math.max(...extent))
      list.sort((a, b) => (a.min[axis] + a.max[axis]) - (b.min[axis] + b.max[axis]))
      const middle = Math.floor(list.length / 2)
      visit(list.slice(0, middle)); visit(list.slice(middle))
    }
    node.escape = nodes.length
    return index
  }
  const root = visit(items.slice())
  return { root, end: nodes.length, nodes, ordered }
}
function material (m = {}) {
  if (Array.isArray(m)) throw new Error('Split material groups before snapshotting')
  for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'aoMap', 'lightMap', 'envMap', 'specularMap', 'transmissionMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'wireframe']) if (m[key]) throw new Error(`Unsupported material effect: ${key}`)
  for (const key of ['alphaTest', 'clearcoat', 'sheen', 'anisotropy']) if (m[key]) throw new Error(`Unsupported material effect: ${key}`)
  if (m.transparent || (m.opacity !== undefined && m.opacity !== 1) || m.transmission > 0) throw new Error('Unsupported material transparency/transmission')
  const intensity = scalar(m.emissiveIntensity, 1, 0, 1e30, 'emissiveIntensity')
  return {
    color: color(m.color === undefined ? m.baseColor : m.color, [0.7, 0.7, 0.7], 'material.color'),
    emissive: color(m.emissive, [0, 0, 0], 'material.emissive').map(v => v * intensity),
    metallic: scalar(m.metallic === undefined ? m.metalness : m.metallic, 0, 0, 1, 'metallic'),
    roughness: scalar(m.roughness, 0.5, 0, 1, 'roughness')
  }
}
function geometry (g) {
  const p = finiteArray(g.positions, undefined, 'positions')
  if (p.length % 3) throw new Error('positions must contain xyz triples')
  const n = g.normals == null ? null : finiteArray(g.normals, p.length, 'normals')
  const ids = g.indices == null ? Array.from({ length: p.length / 3 }, (_, i) => i) : finiteArray(g.indices, undefined, 'indices')
  if (ids.length % 3) throw new Error('indices/triangle soup must contain complete triangles')
  if (ids.some(i => !Number.isInteger(i) || i < 0 || i >= p.length / 3)) throw new Error('index outside positions')
  const triangles = []
  for (let i = 0; i < ids.length; i += 3) {
    const vertices = ids.slice(i, i + 3).map(j => p.slice(j * 3, j * 3 + 3))
    const face = cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0]))
    const faceNormal = Math.hypot(...face) > 0 ? unit(face) : [0, 0, 1]
    const normals = ids.slice(i, i + 3).map(j => {
      const normal = n && n.slice(j * 3, j * 3 + 3)
      return normal && Math.hypot(...normal) > 0 ? unit(normal) : faceNormal
    })
    triangles.push({ ...bounds(vertices), vertices, normals, sourceTriangle: i / 3 })
  }
  return { positions: p, normals: n, indices: ids, triangles }
}
function sameArray (incoming, validated) {
  if ((!Array.isArray(incoming) && !ArrayBuffer.isView(incoming)) || incoming.length !== validated.length) return false
  for (let i = 0; i < validated.length; i++) if (incoming[i] !== validated[i]) return false
  return true
}
function sameGeometry (incoming, validated) {
  // Compare every value, even when the caller reuses an id/version or mutates an
  // array in place. Equal values inherit the cached input's completed validation.
  if (!sameArray(incoming.positions, validated.positions)) return false
  if (incoming.normals == null ? validated.normals !== null : validated.normals === null || !sameArray(incoming.normals, validated.normals)) return false
  if (incoming.indices != null) return sameArray(incoming.indices, validated.indices)
  if (validated.indices.length !== validated.positions.length / 3) return false
  for (let i = 0; i < validated.indices.length; i++) if (validated.indices[i] !== i) return false
  return true
}
function geometryTemplate (input) {
  const parsed = geometry(input)
  const tree = buildBVH(parsed.triangles)
  const triangleData = new Float32Array(tree.ordered.length * TRIANGLE_WORDS)
  tree.ordered.forEach((t, i) => {
    const o = i * TRIANGLE_WORDS
    t.vertices.forEach((v, k) => triangleData.set(v, o + k * 4))
    t.normals.forEach((v, k) => triangleData.set(v, o + 12 + k * 4))
  })
  return { ...parsed, version: input.version, triangles: tree.ordered, nodes: tree.nodes, triangleData, box: tree.ordered.length ? tree.nodes[tree.root] : null }
}

// One instance per Worker. Only a completely validated snapshot commits cache
// changes; missing ids are evicted so retired attribute-version ids do not leak.
export class SceneBuilder {
  constructor () { this.geometries = new Map() }
  build (snapshot) { return buildScene(snapshot, this) }
  clear () { this.geometries.clear() }
}

export function buildScene (snapshot = {}, cache = null) {
  const nodes = []; const triangles = []; const instances = []; const geometries = new Map()
  const templates = new Map()
  let blasBuilds = 0; let blasReuses = 0
  const definitions = snapshot.geometries || []; const refs = [...(snapshot.instances || [])]
  function define (id, g) {
    if (id === undefined || id === null) throw new Error('geometryId is required')
    if (geometries.has(id)) {
      if (!sameGeometry(g, geometries.get(id))) throw new Error(`Conflicting geometryId: ${id}`)
      return
    }
    let template = cache && cache.geometries.get(id)
    if (template && template.version === g.version && sameGeometry(g, template)) {
      blasReuses++
    } else {
      template = geometryTemplate(g); blasBuilds++
    }
    templates.set(id, template)
    // Cached BLAS nodes use local offsets. Relocate the immutable template when
    // assembling this scene; geometry reorder/removal cannot corrupt later hits.
    const nodeBase = nodes.length; const triangleBase = triangles.length
    for (const n of template.nodes) nodes.push({ ...n, first: n.count ? n.first + triangleBase : 0, escape: n.escape + nodeBase })
    for (const triangle of template.triangles) triangles.push(triangle)
    geometries.set(id, { ...template, triangleBase, root: template.box ? nodeBase : 0xffffffff, end: nodes.length })
  }
  for (const g of definitions) define(g.geometryId === undefined ? g.id : g.geometryId, g)
  for (const [i, mesh] of (snapshot.meshes || []).entries()) {
    const id = mesh.geometryId === undefined ? `__inline_mesh_${i}` : mesh.geometryId
    if (mesh.positions !== undefined) define(id, mesh)
    refs.push({ ...mesh, geometryId: id })
  }
  for (const ref of refs) {
    const g = geometries.get(ref.geometryId)
    if (!g) throw new Error(`Unknown geometryId: ${ref.geometryId}`)
    const matrix = finiteArray(ref.matrix === undefined ? IDENTITY : ref.matrix, 16, 'matrix')
    const inverse = invertAffine(matrix); const mat = material(ref.material)
    if (g.box) instances.push({ ...transformedBounds(g.box, matrix), matrix, inverse, material: mat, root: g.root, end: g.end, geometryId: ref.geometryId })
  }
  const orderedInstances = []
  const tlas = buildBVH(instances, 1, nodes, orderedInstances)
  const lights = (snapshot.lights || []).map(l => {
    if (l.type !== 'sun' && l.type !== 'point') throw new Error(`Unsupported light type: ${l.type}`)
    const intensity = scalar(l.intensity, 1, 0, 1e30, 'light intensity')
    return { type: l.type, vector: l.type === 'sun' ? unit(finiteArray(l.direction, 3, 'sun direction')) : finiteArray(l.position, 3, 'point position'), color: color(l.color, [1, 1, 1], 'light color').map(x => x * intensity) }
  })
  const skyInput = snapshot.sky || snapshot.environment || {}
  const sky = { top: color(skyInput.top === undefined ? skyInput.topColor : skyInput.top, [0.4, 0.6, 1], 'sky.top'), bottom: color(skyInput.bottom === undefined ? skyInput.bottomColor : skyInput.bottom, [0.08, 0.08, 0.08], 'sky.bottom'), intensity: scalar(skyInput.intensity, 1, 0, 1e30, 'sky intensity'), up: unit(finiteArray(skyInput.up === undefined ? [0, 1, 0] : skyInput.up, 3, 'sky.up')) }
  finiteArray(sky.top.map(x => x * sky.intensity), 3, 'sky top radiance')
  finiteArray(sky.bottom.map(x => x * sky.intensity), 3, 'sky bottom radiance')
  const nodeOffset = 16; const triOffset = nodeOffset + nodes.length * NODE_WORDS
  const instanceOffset = triOffset + triangles.length * TRIANGLE_WORDS
  const lightOffset = instanceOffset + orderedInstances.length * INSTANCE_WORDS
  const words = lightOffset + lights.length * LIGHT_WORDS
  if (!Number.isSafeInteger(words) || words > 0xffffffff) throw new Error('Scene exceeds WGSL u32 addressing')
  const data = new ArrayBuffer(words * 4); const f = new Float32Array(data); const u = new Uint32Array(data)
  u.set([nodeOffset, nodes.length, triOffset, triangles.length, instanceOffset, orderedInstances.length, lightOffset, lights.length, tlas.root, tlas.end])
  nodes.forEach((n, i) => {
    const o = nodeOffset + i * NODE_WORDS
    f.set(n.min, o); u[o + 3] = n.first; f.set(n.max, o + 4); u[o + 7] = n.count; u[o + 8] = n.escape
  })
  // Reuse prepacked triangle/normal payload; transform/material updates perform
  // no triangle construction, normal calculation, BLAS sorting or triangulation.
  for (const g of geometries.values()) f.set(g.triangleData, triOffset + g.triangleBase * TRIANGLE_WORDS)
  orderedInstances.forEach((inst, i) => {
    const o = instanceOffset + i * INSTANCE_WORDS
    f.set(inst.inverse, o); f.set(inst.material.color, o + 16); f[o + 19] = inst.material.metallic
    f.set(inst.material.emissive, o + 20); f[o + 23] = inst.material.roughness
    u[o + 24] = inst.root; u[o + 25] = inst.end
  })
  lights.forEach((l, i) => { const o = lightOffset + i * LIGHT_WORDS; f.set(l.vector, o); u[o + 3] = l.type === 'sun' ? 0 : 1; f.set(l.color, o + 4) })
  // Float slots only: integer slots may legally encode NaN bit patterns (empty root sentinel).
  for (const n of nodes) { finiteArray(n.min, 3, 'BVH bounds'); finiteArray(n.max, 3, 'BVH bounds') }
  for (const inst of orderedInstances) finiteArray(inst.material.emissive, 3, 'emissive radiance')
  for (const l of lights) finiteArray(l.color, 3, 'light radiance')
  if (cache) cache.geometries = templates
  return { data, nodes, triangles, instances: orderedInstances, geometries, lights, sky, root: tlas.root, end: tlas.end, stats: { geometries: geometries.size, triangles: triangles.length, instances: orderedInstances.length, nodes: nodes.length, bytes: data.byteLength, blasBuilds, blasReuses } }
}

export function intersectBounds (origin, direction, box, minT, maxT) {
  for (let axis = 0; axis < 3; axis++) {
    if (direction[axis] === 0) {
      if (origin[axis] < box.min[axis] || origin[axis] > box.max[axis]) return false
    } else {
      const a = (box.min[axis] - origin[axis]) / direction[axis]; const b = (box.max[axis] - origin[axis]) / direction[axis]
      minT = Math.max(minT, Math.min(a, b)); maxT = Math.min(maxT, Math.max(a, b))
      if (maxT < minT) return false
    }
  }
  return true
}
export function intersectTriangle (origin, direction, vertices, minT = 0, maxT = Infinity) {
  const e1 = sub(vertices[1], vertices[0]); const e2 = sub(vertices[2], vertices[0]); const p = cross(direction, e2); const det = dot(e1, p)
  if (det === 0) return null
  const s = sub(origin, vertices[0]); const u = dot(s, p) / det
  if (u < 0 || u > 1) return null
  const q = cross(s, e1); const v = dot(direction, q) / det
  if (v < 0 || u + v > 1) return null
  const t = dot(e2, q) / det
  return t >= minT && t < maxT ? { t, u, v } : null
}
// CPU reference used for independent brute-force comparisons in tests and diagnostics.
export function traceScene (scene, origin, direction, minT = 0, maxT = Infinity) {
  let best = null
  function walk (root, end, ro, rd, visit) {
    let index = root
    for (let iteration = 0; iteration < scene.nodes.length && index < end; iteration++) {
      const n = scene.nodes[index]
      if (!intersectBounds(ro, rd, n, minT, best ? best.t : maxT)) { index = n.escape; continue }
      if (!n.count) { index++; continue }
      for (let k = 0; k < n.count; k++) visit(n.first + k)
      index = n.escape
    }
  }
  walk(scene.root, scene.end, origin, direction, instanceIndex => {
    const inst = scene.instances[instanceIndex]; const ro = transformPoint(inst.inverse, origin); const rd = transformPoint(inst.inverse, direction, 0)
    walk(inst.root, inst.end, ro, rd, triangleIndex => {
      const tri = scene.triangles[triangleIndex]; const hit = intersectTriangle(ro, rd, tri.vertices, minT, best ? best.t : maxT)
      if (hit) {
        const local = tri.normals[0].map((x, i) => x * (1 - hit.u - hit.v) + tri.normals[1][i] * hit.u + tri.normals[2][i] * hit.v)
        const normal = unit([0, 1, 2].map(k => dot(inst.inverse.slice(k * 4, k * 4 + 3), local)))
        best = { ...hit, normal, instanceIndex, triangleIndex }
      }
    })
  })
  return best
}
