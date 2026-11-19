import { Matrix4, Vector3, Matrix3 } from 'three'
import { decodeStepEntities, args, isType, refId, resolveEntity, StepUnsupported } from './StepEntityModel'
import StepGeometry from './StepGeometry'
import StepBrep from './StepBrep'
import releaseTable from './releaseTable'

const ROOTS = new Set(['MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'FACETED_BREP', 'SHELL_BASED_SURFACE_MODEL', 'FACE_BASED_SURFACE_MODEL'])
const AUXILIARY_ROOTS = new Set(['GEOMETRIC_SET', 'GEOMETRIC_CURVE_SET'])
const REPS = new Set(['SHAPE_REPRESENTATION', 'ADVANCED_BREP_SHAPE_REPRESENTATION', 'FACETED_BREP_SHAPE_REPRESENTATION', 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION', 'GEOMETRICALLY_BOUNDED_SURFACE_SHAPE_REPRESENTATION', 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION'])
const fail = message => { throw new StepUnsupported(message) }
const pathName = name => String(name).replace(/::/g, ':').replace(/\//g, '_')
const srgbToLinear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
const linearColor = color => color.map(srgbToLinear)

function unitScale (entities, reference, kind, active = new Set()) {
  const e = resolveEntity(entities, reference)
  if (active.has(e.id)) fail('Cyclic unit definition')
  active.add(e.id)
  try {
    if (!isType(e, kind)) fail(`Expected ${kind}`)
    const si = args(e, 'SI_UNIT')
    if (si) {
      const prefix = { '.EXA.': 1e18, '.PETA.': 1e15, '.TERA.': 1e12, '.GIGA.': 1e9, '.MEGA.': 1e6, '.KILO.': 1e3, '.HECTO.': 1e2, '.DECA.': 10, '.DECI.': 0.1, '.CENTI.': 0.01, '.MILLI.': 0.001, '.MICRO.': 1e-6, '.NANO.': 1e-9, '.PICO.': 1e-12, '.FEMTO.': 1e-15, '.ATTO.': 1e-18 }
      if (si[1] !== (kind === 'LENGTH_UNIT' ? '.METRE.' : '.RADIAN.')) fail('Unsupported SI geometry unit')
      const scale = si[0] == null ? 1 : prefix[si[0]]
      if (!scale) fail('Unknown SI prefix')
      return scale * (kind === 'LENGTH_UNIT' ? 1000 : 1)
    }
    const conversion = args(e, 'CONVERSION_BASED_UNIT')
    if (conversion) {
      const measure = resolveEntity(entities, conversion[1]), value = args(measure, kind === 'LENGTH_UNIT' ? 'LENGTH_MEASURE_WITH_UNIT' : 'PLANE_ANGLE_MEASURE_WITH_UNIT') || args(measure, 'MEASURE_WITH_UNIT')
      const factor = typeof value?.[0] === 'number' ? value[0] : value?.[0]?.values?.[0]
      if (!(factor > 0 && Number.isFinite(factor))) fail('Invalid conversion-based unit')
      const scale = factor * unitScale(entities, value[1], kind, active)
      if (!(scale > 0 && Number.isFinite(scale))) fail('Geometry unit conversion is out of range')
      return scale
    }
    fail('Unsupported geometry unit')
  } finally { active.delete(e.id) }
}

function contextUnits (entities, reference) {
  const context = resolveEntity(entities, reference), units = args(context, 'GLOBAL_UNIT_ASSIGNED_CONTEXT')?.[0]
  if (!units) fail('Geometry context has no explicit unit assignment')
  let length, angle
  for (const r of units) {
    const e = resolveEntity(entities, r)
    if (isType(e, 'LENGTH_UNIT')) {
      const scale = unitScale(entities, r, 'LENGTH_UNIT')
      if (length != null && length !== scale) fail('Conflicting geometry length units')
      length = scale
    }
    if (isType(e, 'PLANE_ANGLE_UNIT')) {
      const scale = unitScale(entities, r, 'PLANE_ANGLE_UNIT')
      if (angle != null && angle !== scale) fail('Conflicting geometry angle units')
      angle = scale
    }
  }
  if (!(length > 0)) fail('Missing geometry length unit')
  return { length, angle: angle ?? 1 }
}

// Mapping operators act between representation coordinate frames. Geometry
// and both frame origins are normalized to mm once; scale stays dimensionless.
function mappingMatrix (entities, geometry, reference, lengthScale) {
  const e = resolveEntity(entities, reference)
  const nonuniform = args(e, 'CARTESIAN_TRANSFORMATION_OPERATOR_3DNON_UNIFORM')
  const spatial = args(e, 'CARTESIAN_TRANSFORMATION_OPERATOR_3D')
  const base = e.complex ? args(e, 'CARTESIAN_TRANSFORMATION_OPERATOR') : (nonuniform || spatial)?.slice(1, 5)
  if (!base || (!spatial && !nonuniform)) fail(`Unsupported mapping operator #${e.id}`)
  const direction = r => {
    if (r == null) return null
    const values = args(resolveEntity(entities, r), 'DIRECTION')?.[1]
    if (values?.length !== 3 || !values.every(Number.isFinite) || !(Math.hypot(...values) > 0)) fail(`Invalid mapping direction #${e.id}`)
    return new Vector3(...values).normalize()
  }
  let x = direction(base[0]), y = direction(base[1])
  let z = direction(e.complex ? spatial?.[0] : (nonuniform || spatial)[5])
  // Preserve explicit handedness (mirrors), and derive only omitted axes.
  if (!z) z = x && y ? new Vector3().crossVectors(x, y).normalize() : new Vector3(0, 0, 1)
  if (!x) {
    x = y ? new Vector3().crossVectors(y, z).normalize() : new Vector3(Math.abs(z.x) < 0.9 ? 1 : 0, Math.abs(z.x) < 0.9 ? 0 : 1, 0)
    x.addScaledVector(z, -x.dot(z)).normalize()
  }
  if (!y) y = new Vector3().crossVectors(z, x).normalize()
  if ([x, y, z].some(v => v.lengthSq() < 0.99) || Math.max(Math.abs(x.dot(y)), Math.abs(x.dot(z)), Math.abs(y.dot(z))) > 1e-8) fail(`Non-orthogonal mapping axes #${e.id}`)
  const scale = base[3] ?? 1
  const extra = e.complex ? nonuniform : nonuniform?.slice(6)
  const scales = [scale, extra?.[0] ?? scale, extra?.[1] ?? scale]
  if (!scales.every(v => Number.isFinite(v) && v > 0)) fail(`Invalid mapping scale #${e.id}`)
  const matrix = new Matrix4().makeBasis(x.multiplyScalar(scales[0]), y.multiplyScalar(scales[1]), z.multiplyScalar(scales[2]))
  matrix.setPosition(new Vector3(...geometry.point(base[2])).multiplyScalar(lengthScale))
  return matrix
}

export function metadata (entities, geometry, { hierarchyOnly = false, allowAppearanceFallback = false } = {}) {
  const reps = new Map(), parent = new Map(), groups = new Map(), rootSet = new Set(), auxiliarySet = new Set()
  const warnings = new Set((entities.diagnostics || []).map(diagnostic => diagnostic.message))
  const find = id => { if (!parent.has(id)) fail(`Unknown shape representation #${id}`); while (parent.get(id) !== id) id = parent.get(id); return id }
  const union = (a, b) => { parent.set(find(b), find(a)) }
  const relationArgs = e => args(e, 'REPRESENTATION_RELATIONSHIP') || args(e, 'SHAPE_REPRESENTATION_RELATIONSHIP')
  const relationContexts = new Map(), mappedItems = [], hiddenItems = new Set()
  for (const e of entities.values()) {
    const type = Object.keys(e.parts).find(t => REPS.has(t))
    if (type) { const a = args(e, type); reps.set(e.id, { id: e.id, items: a[1], name: a[0], context: a[2] }); parent.set(e.id, e.id) }
    if (Object.keys(e.parts).some(t => ROOTS.has(t))) rootSet.add(e.id)
    if (Object.keys(e.parts).some(t => AUXILIARY_ROOTS.has(t))) auxiliarySet.add(e.id)
    if (isType(e, 'CSG_SOLID') || isType(e, 'TESSELLATED_SHAPE_REPRESENTATION')) fail(`Unsupported native STEP structure #${e.id}: ${Object.keys(e.parts)[0]}`)
    for (const r of args(e, 'INVISIBILITY')?.[0] || []) {
      const item = resolveEntity(entities, r), styled = args(item, 'STYLED_ITEM') || args(item, 'OVER_RIDING_STYLED_ITEM')
      hiddenItems.add(styled ? refId(styled[2]) : item.id)
    }
    if (!allowAppearanceFallback && (isType(e, 'CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM') || isType(e, 'OVER_RIDING_STYLED_ITEM'))) fail('Scoped/overriding styles require compatibility conversion')
    const cd = args(e, 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION')
    if (cd) relationContexts.set(refId(cd[0]), cd[1])
  }
  for (const e of entities.values()) {
    if (!isType(e, 'SHAPE_REPRESENTATION_RELATIONSHIP') || isType(e, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION')) continue
    const a = relationArgs(e)
    if (a?.length !== 4) fail('Unsupported representation relationship')
    const first = refId(a[2]), second = refId(a[3])
    // STEP exporters may relate a supported solid representation to an
    // auxiliary wireframe representation. The wireframe is presentation
    // data, not a topology identity, so it must not enter the BREP union-find
    // graph and make the solid graph fail with "Unknown shape representation".
    // Keep ordinary supported-to-supported relationships unchanged.
    if (!parent.has(first) || !parent.has(second)) {
      const missing = !parent.has(first) ? first : second
      if (isType(resolveEntity(entities, missing), 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION')) {
        warnings.add('STEP wireframe presentation is ignored; native BREP geometry is retained.')
        continue
      }
      fail(`Unknown shape representation #${missing}`)
    }
    union(first, second)
  }
  for (const rep of reps.values()) {
    const id = find(rep.id)
    if (!groups.has(id)) groups.set(id, { id, roots: new Set(), auxiliary: new Set(), children: [], name: rep.name || null, product: null, units: null })
    const group = groups.get(id), units = contextUnits(entities, rep.context)
    if (group.units && (group.units.length !== units.length || Math.abs(group.units.angle - units.angle) > 1e-10)) fail('Mixed-unit identity representations')
    group.units = units
    for (const item of rep.items) {
      const e = resolveEntity(entities, item)
      if (rootSet.has(e.id)) group.roots.add(e.id)
      else if (auxiliarySet.has(e.id)) group.auxiliary.add(e.id)
      else if (isType(e, 'MAPPED_ITEM')) mappedItems.push({ parentId: id, item: e })
      else if (!isType(e, 'AXIS2_PLACEMENT_3D')) fail(`Unconverted shape item #${e.id}: ${Object.keys(e.parts)[0]}`)
    }
  }
  const productGroups = new Map()
  for (const e of entities.values()) {
    const definition = args(e, 'SHAPE_DEFINITION_REPRESENTATION')
    if (!definition || !reps.has(refId(definition[1]))) continue
    const shape = args(resolveEntity(entities, definition[0]), 'PRODUCT_DEFINITION_SHAPE')
    if (!shape) continue // validation property representations are not instances
    const pd = resolveEntity(entities, shape[2]), pdArgs = args(pd, 'PRODUCT_DEFINITION')
    if (!pdArgs) continue
    const formation = resolveEntity(entities, pdArgs[2]), f = args(formation, 'PRODUCT_DEFINITION_FORMATION') || args(formation, 'PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE')
    if (!f) fail('Unsupported product formation')
    const p = args(resolveEntity(entities, f[2]), 'PRODUCT'), group = groups.get(find(refId(definition[1])))
    if (group.product && group.product !== pd.id) fail('Multiple products use one representation group')
    group.product = pd.id; group.name = p?.[1] || p?.[0] || group.name
    productGroups.set(pd.id, group.id)
  }
  const incoming = new Set()
  const frameMatrix = (r, scale) => {
    const f = geometry.frame(r), m = new Matrix4().makeBasis(new Vector3(...f.x), new Vector3(...f.y), new Vector3(...f.z))
    m.setPosition(new Vector3(...f.origin).multiplyScalar(scale)); return m
  }
  for (const { parentId, item } of mappedItems) {
    const data = args(item, 'MAPPED_ITEM'), map = args(resolveEntity(entities, data[1]), 'REPRESENTATION_MAP')
    if (!map) fail(`Invalid representation map for #${item.id}`)
    const child = groups.get(find(refId(map[1]))), owner = groups.get(parentId)
    const matrix = mappingMatrix(entities, geometry, data[2], owner.units.length)
      .multiply(new Matrix4().getInverse(frameMatrix(map[0], child.units.length)))
    if (!matrix.elements.every(Number.isFinite) || !Number.isFinite(matrix.determinant()) || matrix.determinant() === 0) fail(`Singular mapped item #${item.id}`)
    owner.children.push({ group: child, matrix, usageId: item.id, mapped: true, visible: !hiddenItems.has(item.id), name: data[0] || null })
    incoming.add(child.id)
  }
  for (const e of entities.values()) {
    const transformed = args(e, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION')
    if (!transformed) continue
    const rel = relationArgs(e), first = groups.get(find(refId(rel?.[2]))), second = groups.get(find(refId(rel?.[3])))
    if (!first || !second || first === second) fail('Invalid transformed representation graph')
    const pds = args(resolveEntity(entities, relationContexts.get(e.id)), 'PRODUCT_DEFINITION_SHAPE')
    const usage = pds && args(resolveEntity(entities, pds[2]), 'NEXT_ASSEMBLY_USAGE_OCCURRENCE')
    if (!usage) fail('Transform has no assembly usage direction')
    const parentId = productGroups.get(refId(usage[3])), childId = productGroups.get(refId(usage[4]))
    let parentGroup, childGroup, reverse = false
    if (parentId === second.id && childId === first.id) { parentGroup = second; childGroup = first } else if (parentId === first.id && childId === second.id) { parentGroup = first; childGroup = second; reverse = true } else fail('Assembly product and representation directions disagree')
    const tr = args(resolveEntity(entities, transformed[0]), 'ITEM_DEFINED_TRANSFORMATION')
    if (!tr) fail('Unsupported assembly transformation operator')
    let matrix = frameMatrix(tr[3], second.units.length).multiply(new Matrix4().getInverse(frameMatrix(tr[2], first.units.length)))
    if (reverse) matrix = new Matrix4().getInverse(matrix)
    parentGroup.children.push({ group: childGroup, matrix, usageId: refId(pds[2]) })
    incoming.add(childGroup.id)
  }
  // Property-only representations may refer to the same body. Do not emit these
  // alongside the actual product tree, nor silently lose unattached geometry.
  const roots = [...groups.values()].filter(g => !incoming.has(g.id) && g.product)
  if (!roots.length) roots.push(...[...groups.values()].filter(g => !incoming.has(g.id) && (g.roots.size || g.auxiliary.size || g.children.length)))
  // Validate disconnected cycles too, before root selection can hide them.
  const checked = new Set(), checking = new Set()
  const checkGraph = group => {
    if (checking.has(group.id)) fail('Cyclic STEP assembly')
    if (checked.has(group.id)) return
    checking.add(group.id)
    for (const child of group.children) checkGraph(child.group)
    checking.delete(group.id); checked.add(group.id)
  }
  for (const group of groups.values()) checkGraph(group)
  const occurrences = [], auxiliary = [], instances = [], seenBodies = new Set(), seenAuxiliary = new Set(), active = new Set()
  const visit = (group, matrix, path, name, instanceId, parentId = null, visible = true) => {
    if (active.has(group.id)) fail('Cyclic STEP assembly')
    active.add(group.id)
    const current = path ? `${path}::${name}` : name
    if (instanceId) instances.push({ id: instanceId, parentId, name, path: current, definitionId: group.product || group.id, transform: matrix.elements.slice(), visible })
    for (const id of group.roots) { occurrences.push({ id, matrix, path: current, units: group.units, instanceId, visible }); seenBodies.add(id) }
    for (const id of group.auxiliary) { auxiliary.push({ id, matrix, path: current, units: group.units, instanceId, visible }); seenAuxiliary.add(id) }
    const used = new Set()
    for (const child of group.children) {
      const base = pathName(child.name || child.group.name || `Assembly ${child.group.id}`)
      let name = base, n = 1
      while (used.has(name)) name = `${base} (${++n})`
      used.add(name)
      visit(child.group, matrix.clone().multiply(child.matrix), current, name, `${instanceId}/${child.mapped ? 'mapped' : 'usage'}:${child.usageId}`, instanceId, visible && child.visible !== false)
    }
    active.delete(group.id)
  }
  for (const root of roots) visit(root, new Matrix4(), '', pathName(root.name || `Assembly ${root.id}`), root.children.length ? `step:product:${root.product || root.id}` : null)
  if (rootSet.size !== seenBodies.size) fail('Unplaced/ambiguous STEP bodies')
  if (auxiliarySet.size !== seenAuxiliary.size) fail('Unplaced/ambiguous STEP auxiliary geometry')
  if (!occurrences.length && !hierarchyOnly) fail('No native STEP surface bodies')
  occurrences.instances = instances
  occurrences.auxiliary = auxiliary
  occurrences.warnings = [...warnings]
  return occurrences
}

export function styles (entities, { allowAppearanceFallback = false } = {}) {
  const colors = new Map(), hidden = new Set(), layerNames = new Map()
  const warnings = new Set()
  const refs = value => Array.isArray(value) ? value.flatMap(refs) : refId(value) ? [refId(value)] : value?.values ? refs(value.values) : []
  for (const e of entities.values()) {
    if (allowAppearanceFallback && isType(e, 'CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM')) {
      warnings.add('STEP occurrence-scoped appearance overrides are not supported; base appearance is used.')
      continue
    }
    const styled = args(e, 'STYLED_ITEM') || (allowAppearanceFallback && args(e, 'OVER_RIDING_STYLED_ITEM'))
    if (styled) {
      const target = resolveEntity(entities, styled[2])
      // Display meshes use surface styles. Datum/curve/point presentation does
      // not override a solid's material.
      if (!Object.keys(target.parts).some(t => ROOTS.has(t) || AUXILIARY_ROOTS.has(t) || t === 'ADVANCED_FACE' || t === 'FACE_SURFACE' || t === 'FACE')) continue
      const stack = refs(styled[1]), seen = new Set(), found = []
      while (stack.length) {
        const id = stack.pop()
        if (seen.has(id)) continue
        seen.add(id)
        const part = resolveEntity(entities, id), rgb = args(part, 'COLOUR_RGB')
        if (rgb) { if (!rgb.slice(1).every(n => Number.isFinite(n) && n >= 0 && n <= 1)) fail('Invalid RGB style'); found.push(linearColor(rgb.slice(1))); continue }
        const predefined = args(part, 'DRAUGHTING_PRE_DEFINED_COLOUR')
        if (predefined) {
          const color = { black: [0, 0, 0], white: [1, 1, 1], red: [1, 0, 0], green: [0, 1, 0], blue: [0, 0, 1], yellow: [1, 1, 0], magenta: [1, 0, 1], cyan: [0, 1, 1] }[predefined[0]?.toLowerCase()]
          if (!color) fail('Unknown predefined STEP color')
          found.push(linearColor(color)); continue
        }
        if (isType(part, 'CURVE_STYLE') || isType(part, 'POINT_STYLE')) continue
        if (isType(part, 'SURFACE_STYLE_TRANSPARENT')) {
          if (!allowAppearanceFallback) fail('Unsupported native STEP transparent style')
          warnings.add('STEP transparency is not imported by the Brep importer; source colors are retained with opaque display.')
          continue
        }
        stack.push(...refs(Object.values(part.parts)))
      }
      const unique = [...new Map(found.map(c => [c.join(','), c])).values()]
      if (unique.length > 1) {
        if (!allowAppearanceFallback) fail('Ambiguous surface/curve colors in one style')
        warnings.add('STEP ambiguous surface colors use the default display appearance.')
        continue
      }
      if (unique.length) colors.set(refId(styled[2]), unique[0])
    }
    const invis = args(e, 'INVISIBILITY')
    if (invis) {
      for (const r of invis[0]) {
        const target = resolveEntity(entities, r), styled = args(target, 'STYLED_ITEM') || (allowAppearanceFallback && args(target, 'OVER_RIDING_STYLED_ITEM'))
        hidden.add(styled ? refId(styled[2]) : target.id)
      }
    }
    const layer = args(e, 'PRESENTATION_LAYER_ASSIGNMENT')
    if (layer) for (const r of layer[2]) layerNames.set(refId(r), layer[0])
  }
  return { colors, hidden, layerNames, warnings: [...warnings] }
}

// Atomic conversion: no record escapes before every face and every occurrence
// in the dependency job passes. The caller can fall back once without duplicate
// objects or an apparently successful, incomplete Brep.
export function parseNativeStep (bytes, options = {}, runtime = null) {
  const entities = decodeStepEntities(bytes), probe = new StepGeometry(entities, options)
  const occurrences = metadata(entities, probe), appearance = styles(entities)
  const geometries = new Map(), bodies = new Map()
  for (const entry of occurrences) {
    const unitKey = `${entry.units.length}:${entry.units.angle}`
    if (!geometries.has(unitKey)) geometries.set(unitKey, new StepGeometry(entities, options, entry.units.length, entry.units.angle))
    entry.bodyKey = `${entry.id}:${unitKey}`
    if (!bodies.has(entry.bodyKey)) {
      const body = geometries.get(unitKey).body(entry.id)
      if (runtime) {
        let brep
        try {
          if (!runtime.nodecCreateBrep) fail('NodeC exact STEP bridge is unavailable; refresh the runtime')
          const descriptor = new StepBrep(entities, options, entry.units.length, entry.units.angle).body(entry.id)
          brep = runtime.nodecCreateBrep(descriptor)
          body.exact = brep.encode()
        } catch (error) { body.exactFailure = error?.message || String(error) } finally { brep?.delete() }
      }
      bodies.set(entry.bodyKey, body)
    }
  }
  for (const body of bodies.values()) for (const face of body.faces) if (appearance.hidden.has(face.id)) fail('Face-level invisibility is not supported by native display')
  const exactFailures = [...bodies.values()].filter(body => body.exactFailure).map(body => ({ entity: body.id, message: body.exactFailure }))
  // The STEP source graph is job-local; successful Breps are retained as native
  // archives, independent of the disposable display buffers and evaluator graph.
  geometries.clear(); entities.clear()
  const remaining = new Map()
  for (const entry of occurrences) remaining.set(entry.bodyKey, (remaining.get(entry.bodyKey) || 0) + 1)
  function * records () {
    try {
      for (let index = 0; index < occurrences.length; index++) {
        const entry = occurrences[index], body = bodies.get(entry.bodyKey), color = appearance.colors.get(body.id) || [0.7, 0.7, 0.7]
        const materials = [{ color }], groups = [], materialIds = new Map([[color.join(','), 0]])
        const vertexCount = body.faces.reduce((n, face) => n + face.positions.length, 0), indexCount = body.faces.reduce((n, face) => n + face.indices.length, 0)
        const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount)
        const normalMatrix = new Matrix3().getNormalMatrix(entry.matrix), point = new Vector3(), normal = new Vector3()
        let vertexOffset = 0, indexOffset = 0
        for (const face of body.faces) {
          const faceColor = appearance.colors.get(face.id) || color, key = faceColor.join(',')
          if (!materialIds.has(key)) { materialIds.set(key, materials.length); materials.push({ color: faceColor }) }
          for (let i = 0; i < face.positions.length; i++) {
            point.fromArray(face.positions[i]).multiplyScalar(entry.units.length).applyMatrix4(entry.matrix)
            normal.fromArray(face.normals[i]).applyMatrix3(normalMatrix).normalize()
            point.toArray(positions, (vertexOffset + i) * 3); normal.toArray(normals, (vertexOffset + i) * 3)
          }
          for (let i = 0; i < face.indices.length; i++) indices[indexOffset + i] = vertexOffset + face.indices[i]
          const materialIndex = materialIds.get(key), previous = groups[groups.length - 1]
          if (previous?.materialIndex === materialIndex) previous.count += face.indices.length
          else groups.push({ start: indexOffset, count: face.indices.length, materialIndex })
          vertexOffset += face.positions.length; indexOffset += face.indices.length
        }
        let exactSource, edgeDisplay, exactError = body.exactFailure
        if (body.exact) {
          let brep, transform, attributes, header, layers, layer, objects, object, storedAttributes
          try {
            brep = runtime.CommonObject.decode(body.exact)
            transform = runtime.Transform.identity()
            for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) transform[`m${row}${col}`] = entry.matrix.elements[col * 4 + row] * (col < 3 ? entry.units.length : 1)
            if (!brep.transform(transform) || !brep.isValid) fail('Exact STEP placement transform failed')
            attributes = new runtime.ObjectAttributes()
            attributes.name = body.name || entry.path.split('::').at(-1)
            attributes.visible = entry.visible !== false && !appearance.hidden.has(body.id)
            attributes.layerIndex = 0
            header = new runtime.File3dm(); layer = new runtime.Layer(); layers = header.layers()
            layer.name = 'Default'; layers.add(layer)
            objects = header.objects()
            const id = objects.addBrep(brep, attributes)
            object = objects.findId(id); storedAttributes = object.attributes()
            exactSource = { id, geometry: brep.encode(), attributes: runtime.nodecEncodeAttributes(storedAttributes) }
            objects.delete(id)
            exactSource.header = runtime.nodecDocumentHeader(header)
            const preview = runtime.nodecEdgePreview(brep, options.tolerance ?? 0.05, options.angleTolerance ?? Math.PI / 16)
            if (preview.positions?.length) {
              const positions = new Float32Array(preview.positions)
              if (preview.origin) for (let i = 0; i < positions.length; i++) positions[i] += preview.origin[i % 3]
              edgeDisplay = { kind: 'lines', name: 'Brep edges', positions, color: [0.12, 0.12, 0.12], edgeLines: true }
            }
          } catch (error) { exactSource = undefined; exactError = error?.message || String(error) } finally {
            storedAttributes?.delete(); object?.delete(); releaseTable(objects); layer?.delete(); releaseTable(layers); header?.delete(); attributes?.delete(); transform?.delete(); brep?.delete()
          }
        }
        const count = remaining.get(entry.bodyKey) - 1
        remaining.set(entry.bodyKey, count)
        if (!count) bodies.delete(entry.bodyKey)
        yield { exactSource,
          exactError,
          displayObject: { id: `native-step:${index}`,
            name: body.name || entry.path.split('::').at(-1),
            layerPath: entry.path,
            kind: 'mesh',
            color,
            materials,
            groups,
            positions,
            normals,
            indices,
            visible: entry.visible !== false && !appearance.hidden.has(body.id),
            stepConversion: 'native',
            stepGeometry: exactSource ? 'Brep' : 'display-mesh',
            ...(edgeDisplay ? { children: [edgeDisplay] } : {}),
            stepEntityId: body.id,
            sourceLayer: appearance.layerNames.get(body.id) || null } }
      }
    } finally { bodies.clear(); occurrences.length = 0 }
  }
  return { records: records(), totalObjects: occurrences.length, exactFailures, converter: 'native', units: 'millimeter' }
}
