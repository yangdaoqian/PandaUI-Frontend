import StepGeometry from './StepGeometry'
import StepBrep from './StepBrep'
import { decodeStepEntities, args, isType, refId } from './StepEntityModel'
import { metadata, styles } from './StepNativeImport'
import releaseTable from './releaseTable'

const colorByte = value => Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055))
const nativeColor = values => ({ r: colorByte(values[0]), g: colorByte(values[1]), b: colorByte(values[2]), a: 255 })
const safeName = value => String(value || 'Default').replace(/[\r\n]/g, ' ').trim() || 'Default'

// One metadata namespace for every dependency job. Native geometry is extracted
// immediately after serialization; the document retains only layers/materials.
export class StepOpenNurbsContext {
  constructor (module) {
    this.module = module
    this.document = new module.File3dm()
    const settings = this.document.settings()
    try { settings.modelUnitSystem = module.UnitSystem.Millimeters } finally { settings.delete() }
    this.layers = new Map()
    this.headerRevision = 0
    this.headerSentRevision = -1
    this.cachedHeader = null
    this.layer('Default')
  }

  layer (path) {
    const table = this.document.layers()
    let full = '', parentId = null, index = 0
    try {
      for (const component of safeName(path).split('::').filter(Boolean)) {
        full = full ? `${full}::${component}` : component
        let entry = this.layers.get(full)
        if (!entry) {
          const layer = new this.module.Layer()
          try {
            layer.name = component
            if (parentId) layer.parentLayerId = parentId
            index = table.add(layer)
            const stored = table.get(index)
            try { entry = { index, id: stored.id }; this.layers.set(full, entry); this.headerRevision++; this.cachedHeader = null } finally { stored.delete() }
          } finally { layer.delete() }
        }
        parentId = entry.id; index = entry.index
      }
      return index
    } finally { releaseTable(table) }
  }

  // Geometry is removed by nodecTakeObject before each snapshot. Serialize the
  // remaining model directly: nodecDocumentHeader's component copy can omit
  // layers, leaving otherwise valid Breps pointing at missing layer indices.
  header () {
    if (!this.cachedHeader) this.cachedHeader = this.document.toByteArray()
    // A caller may transfer the returned ArrayBuffer to another worker. Keep
    // the cached revision owned by this context and give callers a copy.
    return this.cachedHeader.slice()
  }

  markHeaderSent () { this.headerSentRevision = this.headerRevision }

  nextHeader () {
    if (this.headerSentRevision === this.headerRevision) return null
    this.headerSentRevision = this.headerRevision
    return this.header()
  }

  dispose () { this.document?.delete(); this.document = null; this.layers.clear(); this.cachedHeader = null }
}

export class StepSharedMetadata {
  constructor (bytes, options = {}) {
    this.entities = decodeStepEntities(bytes)
    this.occurrences = metadata(this.entities, new StepGeometry(this.entities, options), { allowAppearanceFallback: true })
    this.appearance = styles(this.entities, { allowAppearanceFallback: true })
    this.byRoot = new Map()
    this.byAuxiliaryRoot = new Map()
    for (const occurrence of this.occurrences) {
      if (!this.byRoot.has(occurrence.id)) this.byRoot.set(occurrence.id, [])
      this.byRoot.get(occurrence.id).push(occurrence)
    }
    for (const occurrence of this.occurrences.auxiliary || []) {
      if (!this.byAuxiliaryRoot.has(occurrence.id)) this.byAuxiliaryRoot.set(occurrence.id, [])
      this.byAuxiliaryRoot.get(occurrence.id).push(occurrence)
    }
  }

  dispose () { this.entities.clear(); this.byRoot.clear(); this.byAuxiliaryRoot.clear(); this.occurrences.length = 0; this.occurrences.auxiliary = [] }
}

// Only the bridge's source-descriptor face index is safe for partial recovery.
// Native m_F/m_L indices can change during chart splitting and topology repair.
// A generic validator error must never delete an unrelated source face.
function subsetDescriptor (descriptor, indices) {
  const vertices = [], edges = [], vertexMap = new Map(), edgeMap = new Map()
  const mapVertex = index => {
    if (!vertexMap.has(index)) {
      const value = descriptor.vertices[index]
      if (!value) throw new Error(`Missing STEP vertex ${index}`)
      vertexMap.set(index, vertices.length)
      vertices.push(value)
    }
    return vertexMap.get(index)
  }
  const mapEdge = index => {
    if (!edgeMap.has(index)) {
      const edge = descriptor.edges[index]
      if (!edge) throw new Error(`Missing STEP edge ${index}`)
      edgeMap.set(index, edges.length)
      edges.push({ ...edge, vertices: edge.vertices.map(mapVertex) })
    }
    return edgeMap.get(index)
  }
  const faces = indices.map(index => {
    const face = descriptor.faces[index]
    if (!face) throw new Error(`Missing STEP face ${index}`)
    return {
      ...face,
      loops: face.loops.map(loop => ({
        ...loop,
        trims: loop.trims.map(trim => ({ ...trim, edge: mapEdge(trim.edge) }))
      }))
    }
  })
  return { ...descriptor, closed: false, vertices, edges, faces }
}

function probeFaceSubset (module, descriptor, indices) {
  let brep
  try {
    brep = module.nodecCreateBrep(subsetDescriptor(descriptor, indices))
    return { ok: true }
  } catch (error) {
    return { ok: false, message: error?.message || String(error) }
  } finally { brep?.delete?.() }
}

// A failed native build used to remove one face and rebuild the complete body.
// Large STEP bodies can therefore execute the expensive pullback/validation
// pass once for every bad face. Probe small face groups instead. A valid group
// is discarded immediately; only groups containing a bad face are subdivided.
// The final body is still created once from the retained source faces.
function locateBadFaces (module, descriptor, initialFailure, maxSkipped, options) {
  if (descriptor.faces.length < 64 || options.batchFaceRecovery === false) return null
  const maxCalls = Math.max(16, Math.min(512, Math.floor(options.maxRecoveryProbeCalls ?? 256)))
  const groupSize = Math.max(8, Math.min(128, Math.floor(options.recoveryProbeGroupSize ?? 64)))
  const failed = new Map()
  let calls = 0
  const initial = /\bSTEP face (\d+)\b/i.exec(initialFailure.message || '')
  if (initial) {
    const index = Number(initial[1])
    if (Number.isInteger(index) && index >= 0 && index < descriptor.faces.length) failed.set(index, initialFailure.message)
  }
  const inspect = indices => {
    if (!indices.length || failed.size >= maxSkipped) return
    const remaining = indices.filter(index => !failed.has(index))
    if (!remaining.length) return
    if (++calls > maxCalls) throw new Error(`STEP face recovery probe limit exceeded after ${maxCalls} checks`)
    const result = probeFaceSubset(module, descriptor, remaining)
    if (result.ok) return
    if (remaining.length === 1) {
      failed.set(remaining[0], result.message)
      return
    }
    const midpoint = Math.ceil(remaining.length / 2)
    inspect(remaining.slice(0, midpoint))
    inspect(remaining.slice(midpoint))
  }
  for (let start = 0; start < descriptor.faces.length && failed.size < maxSkipped; start += groupSize) {
    const group = []
    for (let index = start; index < Math.min(descriptor.faces.length, start + groupSize); index++) group.push(index)
    inspect(group)
  }
  return { calls, failed }
}

export function createNativeBrepWithFaceRecovery (module, descriptor, options = {}) {
  let faces = descriptor.faces.map((face, index) => ({ face, index }))
  const skippedFaces = []
  const skippedFaceDetails = []
  let openedDeclaredClosedShell = false
  const maxSkipped = Math.max(1, Math.min(64, Math.floor(descriptor.faces.length * 0.25)))
  let batchRecoveryAttempted = false
  while (true) {
    try {
      // A few STEP writers mark a shell CLOSED even though one or more edge
      // uses leave a legitimate open boundary. Preserve every converted face
      // first and relax only this declarative solid requirement. The geometry
      // is still required to pass the native validity/manifold checks.
      const brep = module.nodecCreateBrep({
        ...descriptor,
        closed: openedDeclaredClosedShell ? false : descriptor.closed,
        faces: faces.map(item => item.face),
        // New NodeC runtimes recover face-local and global topology failures in
        // one native pass.  Small parts need this too: several STEP exporters
        // emit a valid OpenNURBS topology whose shared uses are not reported as
        // an oriented manifold.  Rejecting those parts made a whole assembly
        // disappear even though every emitted face was valid and displayable.
        // Older runtimes ignore the extra fields and use the JS fallback below.
        skipInvalidFaces: options.allowPartialRecovery !== false && options.batchNativeRecovery !== false && descriptor.faces.length > 1,
        maxSkippedFaces: maxSkipped
      })
      const nativeRecoveryText = brep.getUserString?.('nodec.step.recovery')
      const pullbackText = brep.getUserString?.('nodec.step.pullback')
      let nonManifoldRecovery = false
      try { nonManifoldRecovery = !!JSON.parse(pullbackText || '{}').nonManifoldRecovery } catch { /* Optional diagnostic only. */ }
      if (nativeRecoveryText) {
        try {
          const nativeRecovery = JSON.parse(nativeRecoveryText)
          for (const item of nativeRecovery.skippedFaces || []) {
            const localIndex = Number(item.index)
            const source = faces[localIndex]
            if (!source || skippedFaces.includes(source.index)) continue
            skippedFaces.push(source.index)
            skippedFaceDetails.push({ index: source.index, entity: source.face.sourceEntityId ?? null, message: item.message || 'Native STEP face recovery skipped this face.' })
          }
        } catch { /* A malformed optional diagnostic must not reject valid geometry. */ }
      }
      if (skippedFaceDetails.length || openedDeclaredClosedShell || nonManifoldRecovery) {
        brep.setUserString('PandaUI.STEP.Recovery', JSON.stringify({ skippedFaces: skippedFaceDetails, openedDeclaredClosedShell, nonManifoldRecovery }))
      }
      return { brep, skippedFaces, skippedFaceDetails, openedDeclaredClosedShell }
    } catch (error) {
      const message = error?.message || String(error)
      if (options.allowPartialRecovery === false) throw error
      if (!batchRecoveryAttempted) {
        batchRecoveryAttempted = true
        // A face subset is a useful isolation test only when the native
        // builder identified a face-local failure.  A subset of a valid solid
        // is normally an open shell, so probing subsets after a final
        // manifold/orientation failure makes every probe fail and can spend
        // minutes rebuilding the same large body without identifying a bad
        // face.  The native builder already has the complete topology needed
        // to recover those global failures in one pass.
        if (/\bSTEP face \d+\b/i.test(message)) {
          const located = locateBadFaces(module, descriptor, { message }, maxSkipped, options)
          if (located?.failed.size) {
            for (const [index, failure] of located.failed) {
              if (skippedFaces.length >= maxSkipped) break
              skippedFaces.push(index)
              skippedFaceDetails.push({ index, entity: descriptor.faces[index].sourceEntityId ?? null, message: failure })
            }
            faces = descriptor.faces
              .map((face, index) => ({ face, index }))
              .filter(item => !located.failed.has(item.index))
            continue
          }
        }
      }
      if (!openedDeclaredClosedShell && descriptor.closed && /Closed STEP shell is not a solid Brep/i.test(message)) {
        openedDeclaredClosedShell = true
        continue
      }
      const match = /\bSTEP face (\d+)\b/i.exec(message)
      const failedIndex = match ? Number(match[1]) : -1
      if (!Number.isInteger(failedIndex) || failedIndex < 0 || failedIndex >= faces.length || skippedFaces.length >= maxSkipped || faces.length <= 1) throw error
      skippedFaces.push(faces[failedIndex].index)
      skippedFaceDetails.push({ index: faces[failedIndex].index, entity: faces[failedIndex].face.sourceEntityId ?? null, message })
      faces.splice(failedIndex, 1)
    }
  }
}

export function readStepInstances (bytes, options = {}) {
  const entities = decodeStepEntities(bytes)
  try { return metadata(entities, new StepGeometry(entities, options), { hierarchyOnly: true, allowAppearanceFallback: true }).instances } finally { entities.clear() }
}

// STEP -> true OpenNURBS topology -> ordinary 3DM import records. No display
// tessellation is involved in conversion, and no mesh substitutes a failed Brep.
export function parseOpenNurbsStep (bytes, options, context, shared = null, rootIds = []) {
  const module = context.module, local = decodeStepEntities(bytes, { validateReferences: !shared })
  const entities = shared ? {
    metadataEntities: shared.entities,
    get: id => local.get(id) || shared.entities.get(id),
    clear: () => local.clear()
  } : local
  const occurrences = shared ? rootIds.flatMap(id => shared.byRoot.get(id) || []) : metadata(entities, new StepGeometry(entities, options), { allowAppearanceFallback: true })
  const auxiliary = shared ? rootIds.flatMap(id => shared.byAuxiliaryRoot.get(id) || []) : occurrences.auxiliary || []
  if (shared) { occurrences.instances = shared.occurrences.instances; occurrences.warnings = shared.occurrences.warnings }
  const appearance = shared ? shared.appearance : styles(entities, { allowAppearanceFallback: true })
  const failures = [], totalObjects = occurrences.length + auxiliary.length
  // Process repeated placements together. At most one unplaced native body is
  // retained between pulls, instead of re-solving every instance or retaining
  // an unbounded geometry archive cache for the entire assembly.
  const bodies = new Map()
  for (const entry of occurrences) {
    const key = `${entry.id}:${entry.units.length}:${entry.units.angle}`
    if (!bodies.has(key)) bodies.set(key, [])
    bodies.get(key).push(entry)
  }
  const ordered = [...bodies.values()].flat()
  const remaining = new Map([...bodies].map(([key, entries]) => [key, entries.length]))
  bodies.clear()
  function * records () {
    let definition, definitionKey, definitionFailure, openedDeclaredClosedShell = false
    let skippedFaces = [], skippedFaceDetails = []
    try {
      for (const entry of auxiliary) {
        const root = entities.get(String(entry.id)), data = args(root, 'GEOMETRIC_SET') || args(root, 'GEOMETRIC_CURVE_SET')
        const points = []
        for (const reference of data?.[1] || []) {
          const point = entities.get(String(refId(reference)))
          if (!point || !isType(point, 'CARTESIAN_POINT')) continue
          const values = args(point, 'CARTESIAN_POINT')?.[1]
          if (values?.length === 3 && values.every(Number.isFinite)) points.push(values)
        }
        if (!points.length) continue
        const scale = entry.units.length
        const matrix = entry.matrix.elements
        const positions = new Float32Array(points.length * 3)
        for (let i = 0; i < points.length; i++) {
          const p = points[i], x = p[0], y = p[1], z = p[2]
          positions[i * 3] = matrix[0] * scale * x + matrix[4] * scale * y + matrix[8] * scale * z + matrix[12]
          positions[i * 3 + 1] = matrix[1] * scale * x + matrix[5] * scale * y + matrix[9] * scale * z + matrix[13]
          positions[i * 3 + 2] = matrix[2] * scale * x + matrix[6] * scale * y + matrix[10] * scale * z + matrix[14]
        }
        const color = appearance.colors.get(entry.id)
        const sourceLayer = appearance.layerNames.get(entry.id)
        const layerPath = sourceLayer ? `${entry.path}::${safeName(sourceLayer)}` : entry.path
        yield { displayObject: {
          id: `step-auxiliary:${entry.id}:${entry.instanceId || 'root'}`,
          name: `STEP auxiliary points #${entry.id}`,
          layerPath,
          hierarchyPath: entry.path ? entry.path.split('::') : [],
          kind: 'points',
          positions,
          color: color ? [...color, 1].slice(0, 3) : [0.8, 0.8, 0.8],
          visible: entry.visible !== false && !appearance.hidden.has(entry.id)
        },
        stepEntityId: entry.id,
        stepInstanceId: entry.instanceId,
        stepAuxiliary: true }
      }
      for (const entry of ordered) {
        let brep, transform, attributes, objects, object, stored, bounds, output, createdId
        let stage = 'descriptor'
        const started = performance.now()
        const conversionTimings = {}
        let phaseStarted = started
        const mark = phase => {
          const now = performance.now()
          conversionTimings[phase] = now - phaseStarted
          phaseStarted = now
        }
        try {
          const key = `${entry.id}:${entry.units.length}:${entry.units.angle}`
          const reused = key === definitionKey
          if (!reused) {
            definition?.delete(); definition = null; definitionKey = key; definitionFailure = null
            try {
              const descriptor = new StepBrep(entities, { ...options, recoverTrims: true }, entry.units.length, entry.units.angle).body(entry.id)
              mark('descriptorMs')
              stage = 'native-brep'
              const created = createNativeBrepWithFaceRecovery(module, descriptor, options)
              definition = created.brep
              const descriptorSkipped = descriptor.skippedFaces || []
              skippedFaces = [...descriptorSkipped.map(item => item.sourceEntityId), ...created.skippedFaces]
              skippedFaceDetails = [...descriptorSkipped.map(item => ({ index: null, entity: item.sourceEntityId, message: item.message })), ...created.skippedFaceDetails]
              openedDeclaredClosedShell = created.openedDeclaredClosedShell
              if (!(definition instanceof module.Brep) || !definition.isValid) throw new Error('STEP conversion did not produce a valid OpenNURBS Brep.')
            } catch (error) { definitionFailure = error; throw error }
          } else { mark('descriptorMs'); if (definitionFailure) throw definitionFailure }
          stage = 'native-brep'
          if (remaining.get(key) === 1) { brep = definition; definition = null } else brep = definition.duplicate()
          remaining.set(key, remaining.get(key) - 1)
          if (!(brep instanceof module.Brep) || !brep.isValid) throw new Error('STEP conversion did not produce a valid OpenNURBS Brep.')
          mark('nativeBrepMs')
          const diagnosticText = brep.getUserString('nodec.step.pullback')
          const conversionInfo = diagnosticText ? JSON.parse(diagnosticText) : null
          // A periodic source face can become several exact chart patches.
          // Display metadata must count the resulting native faces.
          const nativeFaces = brep.faces()
          let faceCount
          try { faceCount = nativeFaces.count } finally { nativeFaces.delete() }
          stage = 'placement'
          transform = module.Transform.identity()
          for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) transform[`m${row}${col}`] = entry.matrix.elements[col * 4 + row] * (col < 3 ? entry.units.length : 1)
          if (!brep.transform(transform) || !brep.isValid) throw new Error('OpenNURBS placement transform failed.')
          const entity = entities.get(String(entry.id)), data = args(entity, 'BREP_WITH_VOIDS') || args(entity, 'MANIFOLD_SOLID_BREP') || args(entity, 'FACETED_BREP') || args(entity, 'SHELL_BASED_SURFACE_MODEL') || args(entity, 'FACE_BASED_SURFACE_MODEL')
          const name = data?.[0] || `STEP #${entry.id}`, sourceLayer = appearance.layerNames.get(entry.id)
          const layerPath = sourceLayer ? `${entry.path}::${safeName(sourceLayer)}` : entry.path
          attributes = new module.ObjectAttributes()
          attributes.name = name
          attributes.visible = options.visible !== false && entry.visible !== false && !appearance.hidden.has(entry.id)
          attributes.layerIndex = context.layer(layerPath)
          const color = appearance.colors.get(entry.id)
          if (color) { attributes.objectColor = nativeColor(color); attributes.colorSource = module.ObjectColorSource.ColorFromObject }
          attributes.setUserString('PandaUI.STEP.Entity', String(entry.id))
          mark('placementAndAttributesMs')
          stage = 'archive'
          objects = context.document.objects()
          const id = objects.addBrep(brep, attributes)
          createdId = id
          object = objects.findId(id); stored = object.attributes(); bounds = brep.getBoundingBox()
          const encodedAttributes = module.nodecEncodeAttributes(stored)
          const exactSource = { id, geometry: brep.encode(), attributes: encodedAttributes }
          const objectRecord = module.nodecTakeObject(context.document)
          if (!objectRecord?.byteLength) throw new Error('Unable to serialize the converted OpenNURBS object.')
          mark('archiveMs')
          stage = 'edge-preview'
          const edgePreview = module.nodecEdgePreview(brep, options.tolerance ?? 0.05, options.angleTolerance ?? Math.PI / 16)
          mark('edgePreviewMs')
          stage = 'metadata-header'
          const sourceHeader = options.sparseHeaders ? context.nextHeader() : context.header()
          mark('headerMs')
          output = { objectRecord,
            edgesOnly: true,
            displayInfo: { type: 'Brep', attributes: encodedAttributes.slice(), min: bounds.min, max: bounds.max, faceCount },
            edgePreview,
            exactSource,
            ...(sourceHeader ? { sourceHeader, sourceHeaderRevision: context.headerRevision } : {}),
            stepEntityId: entry.id,
            stepInstanceId: entry.instanceId,
            stepDefinitionReused: reused,
            stepConversionTimings: conversionTimings,
            stepGeometryDiagnostics: conversionInfo || skippedFaces.length || openedDeclaredClosedShell ? {
              ...(conversionInfo || {}),
              lengthScale: entry.units.length,
              ...(skippedFaces.length ? { skippedFaces: skippedFaces.slice(), skippedFaceDetails: skippedFaceDetails.slice() } : {}),
              ...(openedDeclaredClosedShell ? { openedDeclaredClosedShell: true } : {})
            } : null,
            ...(skippedFaces.length ? { stepSkippedFaces: skippedFaces.slice() } : {}),
            stepConversionMs: performance.now() - started }
        } catch (error) {
          const failure = { entity: entry.id, instanceId: entry.instanceId, stage, code: error?.name === 'StepUnsupported' ? 'UNSUPPORTED_STEP_GEOMETRY' : 'STEP_CONVERSION_FAILED', message: error?.message || String(error), conversionMs: performance.now() - started }
          failures.push(failure)
          output = { conversionFailure: failure }
        } finally {
          bounds?.delete(); stored?.delete(); object?.delete(); if (createdId) objects?.delete(createdId); releaseTable(objects); attributes?.delete(); transform?.delete(); brep?.delete()
        }
        yield output
      }
    } finally { definition?.delete(); entities.clear(); occurrences.length = 0; auxiliary.length = 0; ordered.length = 0; remaining.clear() }
  }
  return { records: records(), totalObjects, failures, instances: occurrences.instances, warnings: [...occurrences.warnings, ...appearance.warnings] }
}
