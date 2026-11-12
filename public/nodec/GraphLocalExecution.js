(function (root, factory) {
  const commonjs = typeof module === 'object' && module.exports
  const api = factory(commonjs ? require('./GraphPointExecution') : root.PandaUIPointNodeExecution,
    commonjs ? require('./GraphNodePlaceholders') : root.PandaUINodePlaceholders,
    commonjs ? require('./GraphControlPointExecution') : root.PandaUIControlPointNodes)
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PandaUILocalNodeExecution = api
})(typeof self !== 'undefined' ? self : globalThis, function (pointNodes, placeholders, controlPointNodes) {
  const lineId = '4c4e56eb-2f04-43f9-95a3-cc46a14f495a'
  const evaluateId = 'fc6979e4-7e91-4508-8e05-37c680779751'
  const constructPointId = '3581f42a-9592-4549-bd6b-1c0fc39d067b'
  const curveTypes = new Set(['Curve', 'LineCurve', 'PolylineCurve', 'NurbsCurve', 'ArcCurve', 'PolyCurve'])
  const endpointReaders = new Set(['PointAtStart', 'PointAtEnd', 'TangentAtStart', 'TangentAtEnd'])
  const ghCapabilities = new Map([
    [lineId, { assemblyId: 'CurveComponents', name: 'Line', libraryName: 'Curve', category: 'Primitive', inputs: [{ name: 'Start Point', type: 'point' }, { name: 'End Point', type: 'point' }], outputs: [{ name: 'Line', type: 'line' }] }],
    [evaluateId, { assemblyId: 'CurveComponents', name: 'Evaluate Curve', libraryName: 'Curve', category: 'Analysis', inputs: [{ name: 'Curve', type: 'curve' }, { name: 'Parameter', type: 'number' }], outputs: [{ name: 'Point', type: 'point' }, { name: 'Tangent', type: 'vector' }, { name: 'Angle', type: 'number' }] }],
    [constructPointId, { assemblyId: 'VectorComponents', name: 'Construct Point', libraryName: 'Vector', category: 'Point', inputs: [{ name: 'X coordinate', type: 'number' }, { name: 'Y coordinate', type: 'number' }, { name: 'Z coordinate', type: 'number' }], outputs: [{ name: 'Point', type: 'point' }] }],
    ['11bbd48b-bb0a-4f1b-8167-fa297590390d', { kind: 'endPoints', assemblyId: 'CurveComponents', name: 'End Points', libraryName: 'Curve', category: 'Analysis', inputs: [{ name: 'Curve', type: 'curve' }], outputs: [{ name: 'Start', type: 'point' }, { name: 'End', type: 'point' }] }],
    ['323f3245-af49-4489-8677-7a2c73664077', { kind: 'closed', assemblyId: 'CurveComponents', name: 'Closed', libraryName: 'Curve', category: 'Analysis', inputs: [{ name: 'Curve', type: 'curve' }], outputs: [{ name: 'Closed', type: 'boolean' }, { name: 'Periodic', type: 'boolean' }] }],
    ['c75b62fa-0a33-4da7-a5bd-03fd0068fd93', { kind: 'length', assemblyId: 'CurveComponents', name: 'Length', libraryName: 'Curve', category: 'Analysis', inputs: [{ name: 'Curve', type: 'curve' }], outputs: [{ name: 'Length', type: 'number' }] }]
  ])
  const readers = {
    PointAt: ['pointAt', 'point'], TangentAt: ['tangentAt', 'vector'], CurvatureAt: ['curvatureAt', 'vector'],
    PointAtStart: ['pointAtStart', 'point'], PointAtEnd: ['pointAtEnd', 'point'],
    TangentAtStart: ['tangentAtStart', 'vector'], TangentAtEnd: ['tangentAtEnd', 'vector'],
    Degree: ['degree', 'number'], SpanCount: ['spanCount', 'number'],
    IsClosed: ['isClosed', 'boolean'], IsPeriodic: ['isPeriodic', 'boolean']
  }
  function trustedSource (entry, expected) {
    if (entry.sourcePath != null || entry.assemblyPath != null || entry.originPath != null) return false
    const claimed = entry.trustedSource ?? entry.source
    return claimed == null || String(claimed) === expected
  }
  function matchesGhCapability (entry, capability) {
    return entry.name === capability.name && entry.libraryName === capability.libraryName && entry.category === capability.category &&
      trustedSource(entry, 'grasshopperComponentServer') && contracts(entry.inputs, capability.inputs) && contracts(entry.outputs, capability.outputs)
  }
  function describe (entry) {
    if (!entry) return null
    const controlPointDefinition = controlPointNodes?.describe(entry)
    if (controlPointDefinition) return controlPointDefinition
    const pointDefinition = pointNodes?.describe(entry)
    if (pointDefinition) return pointDefinition
    const id = String(entry.componentGuid || entry.ComponentGuid || entry.guid || entry.id || '').replace(/[{}]/g, '').toLowerCase()
    if ((entry.execution || 'gh') === 'gh') {
      const capability = ghCapabilities.get(id)
      if (capability && matchesGhCapability(entry, capability)) {
        if (capability.assemblyId && (entry.source !== 'grasshopperComponentServer' || entry.assemblyId !== capability.assemblyId)) return null
        return { kind: capability.kind || (id === lineId ? 'line' : id === constructPointId ? 'constructPoint' : 'evaluate') }
      }
    }
    const member = entry.reflection
    if (entry.execution !== 'mantisReflection' || !member || member.static !== false) return null
    if (member.assemblyId !== 'CicadaCommom' || !trustedSource(entry, 'mantisReflection')) return null
    const type = String(member.typeName).replace(/^CicadaCommom\.Geometry\./, '')
    if (type === member.typeName || !curveTypes.has(type) || !readers[member.memberName]) return null
    const method = ['PointAt', 'TangentAt', 'CurvatureAt'].includes(member.memberName)
    if (member.kind !== (method ? 'method' : 'getProperty')) return null
    const inputs = entry.inputs || []
    if (inputs.length !== (method ? 2 : 1) || inputs[0].parameterIndex !== -1 || inputs[0].clrType !== member.typeName) return null
    if (method && (inputs[1].parameterIndex !== 0 || inputs[1].clrType !== 'System.Double')) return null
    if (!names(entry.outputs, ['Result', 'Self'])) return null
    return { kind: 'reader', member: member.memberName, method, targetType: type }
  }
  function names (ports, expected) {
    return Array.isArray(ports) && ports.length === expected.length && ports.every((port, i) => port.name === expected[i] && (!port.access || port.access === 'item'))
  }
  function contracts (ports, expected) {
    return Array.isArray(ports) && ports.length === expected.length && ports.every((port, i) => port.name === expected[i].name && port.type === expected[i].type && (!port.access || port.access === 'item'))
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e300
  const coordinates = (value, count) => Array.isArray(value) && value.length === count && value.every(finite)
  const geoType = value => String(value?.__geo || '').replace(/^rhino\./, 'panda.')
  function point (value) { return geoType(value) === 'panda.point' && coordinates(value.data, 3) }
  function curve (value) {
    if (geoType(value) === 'panda.line') return coordinates(value.data, 6)
    // Match the backend polyline contract. References, BinaryFormatter archives,
    // transformed picks and other types must stay on their owning backend.
    if (geoType(value) !== 'panda.polyline' || !Array.isArray(value.data) || value.data.length < 2 || value.data.length > 4096) return false
    return value.data.every(p => coordinates(p, 3)) && value.data.some(p => p.some((v, i) => v !== value.data[0][i]))
  }
  const curveAnalysis = kind => ['endPoints', 'closed', 'length'].includes(kind)
  const coincidentLine = value => value.__geo === 'panda.line' && value.data.slice(0, 3).every((v, axis) => v === value.data[axis + 3])
  function analysisCurve (value) {
    // This slice accepts only inline primitives, never archives, picked objects
    // with transforms, or other curve subclasses. Native validity is checked in
    // the worker as well. Bound coordinates to finite Float32 preview positions.
    if (!value || Object.keys(value).some(key => !['__geo', 'data'].includes(key)) || !['panda.line', 'panda.polyline'].includes(value.__geo) || !curve(value)) return false
    const points = value.__geo === 'panda.line' ? [value.data.slice(0, 3), value.data.slice(3)] : value.data
    return points.every(p => p.every(v => Number.isFinite(Math.fround(v))))
  }
  function branches (input) {
    // A frontend paramRef carries actual values. A server paramRef is opaque.
    if (input?.kind === 'paramRef') input = input.dataTreeSummary
    if (!input || typeof input !== 'object') return null
    const keys = Object.keys(input)
    if (!keys.length || keys.some(key => !/^path\d+$/.test(key))) return null
    const result = keys.sort((a, b) => Number(a.slice(4)) - Number(b.slice(4))).map(key => input[key])
    if (result.some(tuple => !Array.isArray(tuple) || !/^\{\d+(;\d+)*\}$/.test(tuple[0]) || !Array.isArray(tuple[1]) || !tuple[1].length)) return null
    if (new Set(result.map(tuple => tuple[0])).size !== result.length) return null
    return result.map(tuple => [tuple[0], tuple[1].map(value => value?.kind === 'structRef' ? value.data : value)])
  }
  function plan (entry, request) {
    const definition = describe(entry)
    if (!definition || request.inputUpdate?.mode === 'patch') return null
    if (definition.kind.startsWith('controlPoints:')) return controlPointNodes.plan(entry, request)
    if (definition.kind.startsWith('point:')) return pointNodes.plan(entry, request)
    if (Object.keys(request.inputs || {}).some(name => !entry.inputs.some(port => port.name === name))) return null
    const inputs = entry.inputs.map(port => branches(request.inputs?.[port.name]))
    if (inputs.some(value => !value)) return null
    // Preserve GH branch semantics: unsupported branch matching falls back as
    // a whole node, never partially computes or guesses a tree structure.
    if (inputs.some(tree => tree.length !== inputs[0].length || tree.some((branch, i) => branch[0] !== inputs[0][i][0]))) return null
    const valid = definition.kind === 'line' ? [point, point] : definition.kind === 'constructPoint' ? [finite, finite, finite] : [curve, finite]
    if (inputs.some((tree, index) => tree.some(branch => branch[1].some(value => !valid[index](value))))) return null
    if (curveAnalysis(definition.kind)) {
      if (inputs[0].some(branch => !/^\{(?:0|[1-9]\d*)(?:;(?:0|[1-9]\d*))*\}$/.test(branch[0]) || branch[0].slice(1, -1).split(';').some(n => Number(n) > 2147483647) || branch[1].some(value => !analysisCurve(value)))) return null
      // GH_Component.PrincipalParameter selects the only input; GH_Structure
      // orders paths numerically, independently of the wire's pathN keys.
      inputs[0].sort((a, b) => {
        const left = a[0].slice(1, -1).split(';').map(Number)
        const right = b[0].slice(1, -1).split(';').map(Number)
        for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i]
        return left.length - right.length
      })
    }
    // Existing parameter readers keep their exact PolylineCurve conversion.
    // Endpoint readers are also safe for GH Line values because NodeC can
    // construct a native LineCurve without fabricating a server reference.
    if (definition.kind === 'reader') {
      const allowed = endpointReaders.has(definition.member) && definition.targetType === 'Curve' ? ['panda.line', 'panda.polyline'] : ['panda.polyline']
      if (!['Curve', 'PolylineCurve'].includes(definition.targetType) || inputs[0].some(branch => branch[1].some(value => !allowed.includes(geoType(value))))) return null
    }
    return { ...definition, inputs, outputNames: entry.outputs.map(port => port.name), documentId: request.documentId }
  }
  function makeCurve (module, value) {
    if (geoType(value) === 'panda.line') {
      const result = new module.LineCurve(value.data.slice(0, 3), value.data.slice(3, 6))
      // GH_Convert.ToCurve_Secondary normalizes a Line struct to [0, 1].
      result.domain = [0, 1]
      return result
    }
    const points = value.data.filter((p, i, all) => i === 0 || p.some((v, axis) => v !== all[i - 1][axis]))
    return new module.PolylineCurve(points)
  }
  const geometry = (type, data) => ({ __geo: 'panda.' + type, data: Array.from(data) })
  const pointPreview = value => ({ type: 'points', positions: value.data })
  function unit (vector) {
    const length = Math.hypot(...vector)
    return length > 0 ? vector.map(v => v / length) : vector
  }
  function executePlan (module, job) {
    if (job.kind.startsWith('controlPoints:')) return controlPointNodes.executePlan(module, job)
    if (job.kind.startsWith('point:')) return pointNodes.executePlan(module, job)
    const outputs = Object.fromEntries(job.outputNames.map(name => [name, {}]))
    const warnings = new Set()
    const inputEdges = []
    const previewed = new Set()
    function curvePreview (value, native) {
      const preview = { type: 'polyline', positions: module.nodecCurvePreview(native, 0.01, Math.PI / 90, 12) }
      if (!previewed.has(value)) {
        previewed.add(value)
        for (let i = 3; i < preview.positions.length; i += 3) {
          for (let j = i - 3; j < i + 3; j++) inputEdges.push(preview.positions[j])
        }
      }
      return preview
    }
    job.inputs[0].forEach((branch, branchIndex) => {
      const count = Math.max(...job.inputs.map(tree => tree[branchIndex][1].length))
      const tuples = job.outputNames.map(name => (outputs[name]['path' + branchIndex] = [branch[0], [], []]))
      for (let item = 0; item < count; item++) {
        const values = job.inputs.map(tree => { const list = tree[branchIndex][1]; return list[Math.min(item, list.length - 1)] })
        let result, previews
        if (job.kind === 'constructPoint') {
          const value = geometry('point', values)
          result = [value]
          previews = [pointPreview(value)]
        } else if (job.kind === 'line') {
          const line = new module.LineCurve(values[0].data, values[1].data)
          try {
            result = [geometry('line', [...values[0].data, ...values[1].data])]
            previews = [{ type: 'polyline', positions: module.nodecCurvePreview(line, 0.01, Math.PI / 90, 12) }]
          } finally { line.delete() }
        } else {
          const native = makeCurve(module, values[0])
          try {
            // GH accepts a coincident Line struct for these analysis components,
            // even though its native LineCurve reports IsValid=false.
            const zeroLine = coincidentLine(values[0])
            if (curveAnalysis(job.kind) && !native.isValid && !zeroLine) throw new Error('Invalid inline curve; use NodeAdapter diagnostics.')
            const preview = curvePreview(values[0], native)
            if (job.kind === 'endPoints') {
              result = [geometry('point', native.pointAtStart), geometry('point', native.pointAtEnd)]
              previews = result.map(pointPreview)
            } else if (job.kind === 'closed') {
              result = [native.isClosed, native.isPeriodic]
              previews = [null, null]
            } else if (job.kind === 'length') {
              // Curve.GetLength is not exposed in this WASM build. For the
              // validated line/polyline only, TryGetPolyline is exact (not a
              // tessellation), and ON_Polyline::Length sums segment lengths.
              const polyline = zeroLine ? null : native.tryGetPolyline()
              if (!polyline && !zeroLine) throw new Error('Exact polyline length is unavailable.')
              try {
                const length = zeroLine ? 0 : polyline.length
                if (!finite(length)) throw new Error('Invalid native polyline length.')
                result = [length]
                previews = [null]
              } finally { polyline?.delete() }
            } else if (job.kind === 'reader') {
              const [member, type] = readers[job.member]
              const value = job.method ? native[member](values[1]) : native[member]
              const wrapped = type === 'point' || type === 'vector' ? geometry(type, value) : value
              result = [wrapped, values[0]]
              previews = [type === 'point' ? pointPreview(wrapped) : null, preview]
            } else {
              const parameter = values[1]
              const [start, end] = native.domain
              if (parameter < start - 1e-12 || parameter > end + 1e-12) warnings.add('Parameter is outside the curve domain, results may be unpredictable.')
              const seam = native.isClosed && (Math.abs(parameter - start) < 1e-12 || Math.abs(parameter - end) < 1e-12)
              const before = unit(native.derivativeAtSide(seam ? end : parameter, 1, module.CurveEvaluationSide.Below)[1])
              const after = unit(native.derivativeAtSide(seam ? start : parameter, 1, module.CurveEvaluationSide.Above)[1])
              const angle = 2 * Math.asin(Math.min(1, Math.hypot(...before.map((v, i) => v - after[i])) * 0.5))
              const p = geometry('point', native.pointAt(parameter))
              result = [p, geometry('vector', native.tangentAt(parameter)), angle]
              previews = [pointPreview(p), null, null]
            }
          } finally { native.delete() }
        }
        tuples.forEach((tuple, i) => { tuple[1].push(result[i]); tuple[2].push(previews[i] || null) })
      }
    })
    return {
      ok: true, documentId: job.documentId, outputs, executor: 'nodec-wasm',
      runtimeMessages: { errors: [], warnings: [...warnings] },
      paramPreviews: { inputs: inputEdges.length ? { 0: { edges: { positions: new Float32Array(inputEdges) } } } : {}, outputs: {} }
    }
  }
  let clientPromise
  async function runLocal (job, options) {
    if (!clientPromise) {
      clientPromise = import('/nodec/NodeCClient.mjs').then(({ default: Client }) => {
        const client = new Client()
        globalThis.addEventListener('pagehide', () => { client.dispose(); clientPromise = null }, { once: true })
        return client
      }).catch(error => { clientPromise = null; throw error })
    }
    return (await clientPromise).run('node.execute', job, options)
  }
  function checkCancelled (signal) {
    if (signal?.aborted) throw new DOMException('Node computation cancelled.', 'AbortError')
  }
  function implementationStatus (entry) {
    if (describe(entry)) return { status: 'partial', label: 'Frontend · Partial', reason: 'Supported inputs execute locally; other inputs use the backend.' }
    const placeholder = placeholders?.lookup(entry)
    if (placeholder) return {
      status: 'placeholder', label: 'Backend · Frontend pending', reason: placeholder.reason,
      reasonCode: placeholder.reasonCode, file: placeholder.file, method: placeholder.method
    }
    return { status: 'backend', label: 'Backend', reason: 'No matching frontend implementation is registered.' }
  }
  async function execute (entry, request, options, backend, local = runLocal) {
    checkCancelled(options.signal)
    const job = plan(entry, request)
    if (job) {
      try {
        const result = await local(job, options)
        checkCancelled(options.signal)
        return result
      } catch (error) {
        if (error.name === 'AbortError') throw error
        checkCancelled(options.signal)
        // No outputs have been committed. Retry the original, unchanged request.
        const result = await backend()
        return { ...result, executor: 'backend', localFallbackReason: error.message }
      }
    }
    const status = implementationStatus(entry)
    const result = await backend()
    return status.status === 'placeholder'
      ? { ...result, executor: 'backend', localImplementationStatus: 'placeholder', localFallbackCode: 'FRONTEND_NOT_IMPLEMENTED', localFallbackReason: status.reason }
      : { ...result, executor: 'backend' }
  }
  return { supports: entry => !!describe(entry), implementationStatus, plan, executePlan, execute }
})
