// OpenSKP decodes the file; this adapter owns PandaUI's display contract.
// Keep SketchUp Z-up coordinates, in metres, like SketchUpImporter.cs.
const SCALE = 0.0254
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const normalized = v => { const n = Math.hypot(...v); return n > 1e-15 ? v.map(x => x / n) : [0, 0, 1] }
const safeName = name => String(name).replace(/::|\//g, '_')

export function sketchUpMatrix (source) {
  if (!source?.length) return identity()
  let m
  if (source.length === 16) m = [...source]
  else if (source.length === 13 || source.length === 12) {
    const s = source.length === 13 ? source[12] : 1
    m = [source[0] * s, source[3] * s, source[6] * s, 0, source[1] * s, source[4] * s, source[7] * s, 0, source[2] * s, source[5] * s, source[8] * s, 0, source[9] * s, source[10] * s, source[11] * s, 1]
  } else throw new Error('Invalid SKP instance transform.')
  if (!m.every(Number.isFinite) || m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) throw new Error('Invalid SKP affine transform.')
  m[12] *= SCALE; m[13] *= SCALE; m[14] *= SCALE
  return m
}

function multiply (a, b) {
  const result = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) result[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return result
}

function triangulateFace (face, vertices, edges, runtime) {
  const points = [], ids = [], projected = [], holes = []
  const normal = normalized(face.normal)
  const drop = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)))
  const axes = [0, 1, 2].filter(axis => axis !== drop)
  for (const loop of face.loops) {
    if (loop.length < 3) throw new Error('Incomplete face boundary')
    if (points.length) holes.push(points.length)
    for (let i = 0; i < loop.length; i++) {
      const use = loop[i], edge = edges.get(use.edgeId), next = loop[(i + 1) % loop.length]
      const nextEdge = edges.get(next.edgeId)
      if (!edge || !nextEdge) throw new Error('Missing boundary edge')
      const id = use.orientation === 1 ? edge.v1Id : edge.v2Id
      const end = use.orientation === 1 ? edge.v2Id : edge.v1Id
      if (end !== (next.orientation === 1 ? nextEdge.v1Id : nextEdge.v2Id)) throw new Error('Open face boundary')
      const p = vertices.get(id)
      if (!p || !p.every(Number.isFinite)) throw new Error('Missing or invalid boundary vertex')
      points.push(p); ids.push(id); projected.push(p[axes[0]], p[axes[1]])
    }
  }
  const indices = runtime.triangulate(projected, holes, 2)
  if (!indices.length || runtime.deviation(projected, holes, 2, indices) > 1e-5) throw new Error('Face triangulation could not preserve boundary area')
  // Earcut winds in its projection plane; restore the source face orientation.
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3).map(j => points[j])
    const u = b.map((v, j) => v - a[j]), v = c.map((v, j) => v - a[j])
    if ((u[1] * v[2] - u[2] * v[1]) * normal[0] + (u[2] * v[0] - u[0] * v[2]) * normal[1] + (u[0] * v[1] - u[1] * v[0]) * normal[2] < 0) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
  }
  return { points, ids, indices, normal }
}

function definitionIndex (definition, vertices, edges) {
  if (!definition.edges.some(e => e.smooth)) return { vertices, edges, normals: new Map() }
  // Smooth corners only connect across edges explicitly marked smooth. Merely
  // sharing a position (or a soft-but-not-smooth edge) must not round a crease.
  const adjacency = new Map(), edgeFaces = new Map(), cornerWeights = new Map()
  for (const face of definition.faces) {
    const weights = new Map()
    for (const loop of face.loops) {
      for (let i = 0; i < loop.length; i++) {
        const use = loop[i], edge = edges.get(use.edgeId)
        const previous = loop[(i + loop.length - 1) % loop.length], previousEdge = edges.get(previous.edgeId)
        if (edge && previousEdge && (edge.smooth || previousEdge.smooth)) {
          const vertex = use.orientation === 1 ? edge.v1Id : edge.v2Id
          const p = vertices.get(vertex), a = vertices.get(previous.orientation === 1 ? previousEdge.v1Id : previousEdge.v2Id), b = vertices.get(use.orientation === 1 ? edge.v2Id : edge.v1Id)
          if (p && a && b) {
            const u = a.map((n, j) => n - p[j]), v = b.map((n, j) => n - p[j]), length = Math.hypot(...u) * Math.hypot(...v)
            if (length > 1e-20) {
              let angle = Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, n, j) => sum + n * v[j], 0) / length)))
              const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
              if (cross.reduce((sum, n, j) => sum + n * face.normal[j], 0) > 0) angle = 2 * Math.PI - angle
              weights.set(vertex, angle)
            }
          }
        }
        if (!edges.get(use.edgeId)?.smooth) continue
        if (!edgeFaces.has(use.edgeId)) edgeFaces.set(use.edgeId, [])
        edgeFaces.get(use.edgeId).push(face)
      }
    }
    if (weights.size) cornerWeights.set(face, weights)
  }
  for (const [id, faces] of edgeFaces) {
    const edge = edges.get(id)
    for (const vertex of [edge.v1Id, edge.v2Id]) {
      if (!adjacency.has(vertex)) adjacency.set(vertex, new Map())
      const graph = adjacency.get(vertex)
      for (const face of faces) {
        if (!graph.has(face)) graph.set(face, new Set())
        for (const other of faces) graph.get(face).add(other)
      }
    }
  }
  const normals = new Map()
  for (const [vertex, graph] of adjacency) {
    const visited = new Set(), result = new Map()
    for (const face of graph.keys()) {
      if (visited.has(face)) continue
      const component = [], pending = [face], sum = [0, 0, 0]
      while (pending.length) {
        const current = pending.pop()
        if (visited.has(current)) continue
        visited.add(current); component.push(current)
        const weight = cornerWeights.get(current)?.get(vertex) ?? 1
        normalized(current.normal).forEach((n, i) => { sum[i] += n * weight })
        for (const neighbor of graph.get(current) || []) if (!visited.has(neighbor)) pending.push(neighbor)
      }
      const n = normalized(sum)
      component.forEach(item => result.set(item, n))
    }
    normals.set(vertex, result)
  }
  return { vertices, edges, normals }
}

export function parseSketchUp (runtime, buffer, name, notify = () => {}) {
  const started = performance.now()
  let model = runtime.parseSkp(buffer, { displayOnly: true, onProgress: state => notify({ phase: `Reading SKP: ${state.stage}`, processedEntities: state.current, totalEntities: state.total }) })
  buffer = null
  const warnings = new Set(), hiddenLayers = new Set(model.layers.filter(layer => layer.hidden).map(layer => layer.name))
  const visible = item => !item.hidden && !hiddenLayers.has(item.layer)
  const placements = [], paths = new Set(), stack = new Set()
  const walk = (definition, matrix, path, shown, id, inheritedMaterial = null) => {
    if (stack.has(definition)) { warnings.add('A recursive component reference was skipped.'); return }
    stack.add(definition)
    if (definition.hasGeometry || definition.faces.length || definition.edges.length) { placements.push({ definition, matrix, path, shown, id, inheritedMaterial }); paths.add(path.join('::')) }
    const names = new Set()
    for (let i = 0; i < definition.instances.length; i++) {
      const instance = definition.instances[i], child = model.definitions.get(instance.refIdx)
      if (!child) { warnings.add('A missing component definition was skipped.'); continue }
      const label = safeName(instance.name || child.name || `Component ${i + 1}`)
      let unique = label, count = 1
      while (names.has(unique)) unique = `${label} (${++count})`
      names.add(unique)
      try { walk(child, multiply(matrix, sketchUpMatrix(instance.matrix)), [...path, unique], shown && visible(instance), `${id}/${i}`, instance.materialId ?? inheritedMaterial) } catch (error) { warnings.add(error.message) }
    }
    stack.delete(definition)
  }
  walk(model.root, identity(), [safeName(name)], true, 'skp/root')
  if (!placements.length) throw new Error('No supported faces or edges were found in this SKP file.')
  // Keep material images only until their first packet; drop unused metadata.
  model.materials = []; model.pages = []; model.styles = []; model.definitions.clear(); model.root = null
  const metadata = { format: 'skp', units: 'meter', layers: [...paths].map(fullPath => ({ fullPath, label: fullPath.split('::').pop(), visible: true })), totalObjects: placements.length, warnings: [...warnings], parseMs: performance.now() - started }
  let emitted = 0, skippedFaces = 0
  const sentMaterials = new Set()
  const remaining = new Map()
  for (const { definition } of placements) remaining.set(definition, (remaining.get(definition) || 0) + 1)
  const progress = () => ({ importWarnings: [...warnings], skippedFaces, processedObjects: emitted, totalObjects: metadata.totalObjects })
  function * records () {
    let lastDefinition, lookup
    try {
      for (const placement of placements) {
        const { definition, matrix, path, shown, id, inheritedMaterial } = placement
        definition.loadGeometry?.()
        if (definition !== lastDefinition) {
          lookup = { vertices: new Map(definition.vertices.map(v => [v.id, [v.x, v.y, v.z]])), edges: new Map(definition.edges.map(e => [e.id, e])) }
          lastDefinition = definition
        }
        const base = { id, objectId: id, name: path[path.length - 1], hierarchyPath: path, layerPath: path.join('::'), matrix, sourceVisible: shown }
        // Publish source edges before calculating smooth normals or triangulating
        // the complete definition. All batches still join the same object root.
        const edgeBuckets = new Map()
        const edgePacket = (positions, shownPart) => ({ displayObject: { ...base, kind: 'lines', skpDisplay: true, edgeLines: true, sharpEdge: true, visible: shown && shownPart, positions: new Float32Array(positions) } })
        for (const edge of definition.edges) {
          if (edge.soft || edge.smooth) continue
          const a = lookup.vertices.get(edge.v1Id), b = lookup.vertices.get(edge.v2Id)
          if (!a || !b || !a.every(Number.isFinite) || !b.every(Number.isFinite)) { warnings.add('Some SKP edges have missing or invalid vertices.'); continue }
          const isVisible = visible(edge)
          if (!edgeBuckets.has(isVisible)) edgeBuckets.set(isVisible, [])
          const positions = edgeBuckets.get(isVisible)
          for (const point of [a, b]) for (const value of point) positions.push(value * SCALE)
          if (positions.length >= 36000) { yield edgePacket(positions, isVisible); edgeBuckets.set(isVisible, []) }
        }
        for (const [isVisible, positions] of edgeBuckets) if (positions.length) yield edgePacket(positions, isVisible)
        // Give the consumer an opportunity to display edges even for a small
        // instance followed by an expensive smooth-normal/triangulation pass.
        yield { importCheckpoint: true }
        if (!lookup.normals) lookup = definitionIndex(definition, lookup.vertices, lookup.edges)
        let buckets = new Map(), pendingVertices = 0
        let lastFlush = performance.now()
        const flush = function * () {
          for (const bucket of buckets.values()) {
            let sourceMaterial
            if (!sentMaterials.has(bucket.materialId)) {
              sentMaterials.add(bucket.materialId)
              const texture = bucket.material?.texture
              sourceMaterial = { id: bucket.materialId, name: bucket.material?.name || 'SketchUp Default', color: bucket.color, opacity: bucket.opacity }
              if (texture?.data?.length) { sourceMaterial.texture = { name: texture.filename, bytes: new Uint8Array(texture.data) }; texture.data = null }
            }
            yield { displayObject: { ...base, sourceMaterialId: bucket.materialId, sourceMaterial, kind: 'mesh', skpDisplay: true, visible: shown && bucket.visible, color: bucket.color, opacity: bucket.opacity, roughness: 0.72, metalness: 0, clearcoat: 0, positions: new Float32Array(bucket.positions), normals: new Float32Array(bucket.normals), uv: bucket.uv.length ? new Float32Array(bucket.uv) : undefined, indices: new Uint32Array(bucket.indices), children: [{ kind: 'lines', skpDisplay: true, meshGeometryEdges: true, positions: new Float32Array(bucket.lines) }] } }
          }
          buckets = new Map(); pendingVertices = 0; lastFlush = performance.now()
        }
        for (const face of definition.faces) {
          try {
            const mesh = triangulateFace(face, lookup.vertices, lookup.edges, runtime)
            const sourceId = face.materialId ?? inheritedMaterial
            const material = model.materialsById.get(sourceId)
            const materialId = material ? `skp/material/${sourceId}` : 'skp/material/default'
            const color = material ? [material.color.r, material.color.g, material.color.b].map(c => c / 255) : [154 / 255, 167 / 255, 181 / 255]
            const opacity = Math.max(0, Math.min(1, material?.transparency ?? 1)), isVisible = visible(face)
            const key = `${materialId}:${isVisible}`
            if (!buckets.has(key)) buckets.set(key, { materialId, material, color, opacity, visible: isVisible, positions: [], normals: [], indices: [], lines: [], uv: [] })
            const bucket = buckets.get(key), offset = bucket.positions.length / 3
            if (material?.texture) {
              const { xr, yr } = runtime.faceUvBasis(mesh.normal)
              const coordinates = mesh.points.flatMap(point => runtime.computeFaceUv(point, xr, yr, face.uvTransform, material.texture.width || 1, material.texture.height || 1))
              if (!coordinates.every(Number.isFinite)) throw new Error('Invalid texture coordinates')
              for (const value of coordinates) bucket.uv.push(value)
              if (face.uvProjected) warnings.add('Projected SketchUp textures use a planar UV approximation.')
            }
            mesh.points.forEach((point, i) => { for (const v of point) bucket.positions.push(v * SCALE); for (const v of lookup.normals.get(mesh.ids[i])?.get(face) || mesh.normal) bucket.normals.push(v) })
            for (const index of mesh.indices) bucket.indices.push(offset + index)
            const seen = new Set()
            for (let i = 0; i < mesh.indices.length; i += 3) {
              for (let j = 0; j < 3; j++) {
                const a = mesh.indices[i + j], b = mesh.indices[i + (j + 1) % 3], key = a < b ? `${a}:${b}` : `${b}:${a}`
                if (seen.has(key)) continue
                seen.add(key)
                for (const point of [mesh.points[a], mesh.points[b]]) for (const value of point) bucket.lines.push(value * SCALE)
              }
            }
            pendingVertices += mesh.points.length
          } catch (error) { skippedFaces++; warnings.add(`Some SKP faces could not be triangulated (${error.message}); their source edges are retained.`) }
          if (pendingVertices >= 12000 || performance.now() - lastFlush >= 40) yield * flush()
        }
        yield * flush()
        emitted++
        remaining.set(definition, remaining.get(definition) - 1)
        if (!remaining.get(definition)) {
          definition.vertices = []; definition.edges = []; definition.faces = []
          remaining.delete(definition)
          if (lastDefinition === definition) lookup = lastDefinition = null
        }
      }
    } finally { model = null; lookup = lastDefinition = null; placements.length = 0; remaining.clear() }
  }
  return { ...metadata, records: records(), progress }
}
