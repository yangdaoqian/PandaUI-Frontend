(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./GeometryControlPoints') : root.PandaUIControlPoints)
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PandaUIControlPointNodes = api
})(typeof self !== 'undefined' ? self : globalThis, function (controlPoints) {
  const port = (name, type, access = 'item') => ({ name, type, access })
  const definitions = [
    { id: '424eb433-2b3a-4859-beaf-804d8af0afd7', kind: 'controlPoints:curve', name: 'Control Points', libraryName: 'Curve', assemblyId: 'CurveComponents',
      inputs: [port('Curve', 'curve')], outputs: [port('Points', 'point', 'list'), port('Weights', 'number', 'list'), port('Knots', 'number', 'list')] },
    { id: '15128198-399d-4d6c-9586-1f65db3ce7bf', kind: 'controlPoints:surface', name: 'Surface Points', libraryName: 'Surface', assemblyId: 'SurfaceComponents',
      inputs: [port('Surface', 'surface')], outputs: [port('Points', 'point', 'list'), port('Weights', 'number', 'list'), port('Greville', 'point', 'list'), port('U Count', 'integer'), port('V Count', 'integer')] }
  ]
  function describe (entry) {
    if (!entry || entry.execution !== 'gh' || entry.source !== 'grasshopperComponentServer' || entry.reflection != null ||
        entry.isComponent !== true || entry.isParam !== false || entry.category !== 'Analysis' ||
        (entry.trustedSource != null && entry.trustedSource !== entry.source) ||
        ['sourcePath', 'assemblyPath', 'originPath'].some(key => entry[key] != null)) return null
    const ids = ['componentGuid', 'ComponentGuid', 'guid', 'id'].filter(key => entry[key] != null).map(key => String(entry[key]).replace(/^\{([^{}]+)\}$/, '$1').toLowerCase())
    if (!ids.length || ids.some(id => id !== ids[0])) return null
    const definition = definitions.find(d => d.id === ids[0])
    if (!definition || ['name', 'libraryName', 'assemblyId'].some(key => entry[key] !== definition[key])) return null
    const matches = side => Array.isArray(entry[side]) && entry[side].length === definition[side].length && entry[side].every((p, i) =>
      p.name === definition[side][i].name && p.type === definition[side][i].type && (p.access || 'item') === definition[side][i].access)
    return matches('inputs') && matches('outputs') ? { kind: definition.kind } : null
  }
  const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e30
  const xyz = p => Array.isArray(p) && p.length === 3 && p.every(finite)
  function supportedGeometry (value, kind) {
    if (!value || Object.keys(value).some(key => !['__geo', 'data'].includes(key))) return false
    if (kind === 'curve' && value.__geo === 'panda.line') return Array.isArray(value.data) && value.data.length === 6 && value.data.every(finite)
    if (kind === 'curve' && value.__geo === 'panda.polyline') return Array.isArray(value.data) && value.data.length >= 2 && value.data.length <= 4096 && value.data.every(xyz)
    const types = kind === 'curve' ? ['panda.curve'] : ['panda.surface', 'panda.brep']
    // A NodeC archive is an object. Never interpret legacy BinaryFormatter
    // strings, server geometry references or scene transforms as native input.
    return types.includes(value.__geo) && value.data && typeof value.data === 'object' && typeof value.data.data === 'string' && !!value.data.data.length &&
      Number.isInteger(value.data.archive3dm) && Number.isInteger(value.data.version)
  }
  function makeGeometry (module, value, kind) {
    if (!supportedGeometry(value, kind)) throw new Error('Expected an inline primitive or an encoded NodeC ' + kind + '.')
    if (value.__geo === 'panda.line') {
      const native = new module.LineCurve(value.data.slice(0, 3), value.data.slice(3))
      native.domain = [0, 1]
      return native
    }
    if (value.__geo === 'panda.polyline') return new module.PolylineCurve(value.data.filter((p, i, all) => !i || p.some((v, j) => v !== all[i - 1][j])))
    const native = module.CommonObject.decode(value.data)
    if (!native) throw new Error('The NodeC geometry archive could not be decoded.')
    if (kind === 'curve' ? !(native instanceof module.Curve) : !(native instanceof module.Surface) && !(native instanceof module.Brep)) {
      native.delete()
      throw new Error('The archive geometry type does not match the node input.')
    }
    return native
  }
  function pathNumbers (path) { return path.slice(1, -1).split(';').map(Number) }
  function comparePaths (left, right) {
    const a = pathNumbers(left), b = pathNumbers(right)
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
    return a.length - b.length
  }
  function plan (entry, request) {
    const definition = describe(entry)
    if (!definition || request.inputUpdate?.mode === 'patch') return null
    const inputName = entry.inputs[0].name
    if (Object.keys(request.inputs || {}).some(name => name !== inputName)) return null
    let input = request.inputs?.[inputName]
    if (input?.kind === 'paramRef') input = input.dataTreeSummary
    if (!input || typeof input !== 'object' || !Object.keys(input).length || Object.keys(input).some(key => !/^path\d+$/.test(key))) return null
    const kind = definition.kind.split(':')[1]
    const branches = []
    for (const tuple of Object.values(input)) {
      if (!Array.isArray(tuple) || !/^\{(?:0|[1-9]\d*)(?:;(?:0|[1-9]\d*))*\}$/.test(tuple[0]) || pathNumbers(tuple[0]).some(i => i > 2147483647) || !Array.isArray(tuple[1]) || !tuple[1].length) return null
      const values = tuple[1].map(v => v?.kind === 'structRef' ? v.data : v)
      if (!values.every(v => supportedGeometry(v, kind))) return null
      branches.push([tuple[0], values])
    }
    branches.sort((a, b) => comparePaths(a[0], b[0]))
    // Mixed ancestor paths require GH's general graft collision handling.
    if (branches.some((b, i) => branches.some((c, j) => j !== i && (b[0] === c[0] || c[0].startsWith(b[0].slice(0, -1) + ';'))))) return null
    return { ...definition, inputs: [branches], outputNames: entry.outputs.map(p => p.name), documentId: request.documentId }
  }
  const point = data => ({ __geo: 'panda.point', data: Array.from(data) })
  const pointPreview = value => ({ type: 'points', positions: value.data })
  function executePlan (module, job) {
    const kind = job.kind.split(':')[1]
    if (kind === 'setCurve' || kind === 'setSurface') return executeSetter(module, job, kind === 'setCurve' ? 'curve' : 'surface')
    if (!['curve', 'surface'].includes(kind)) throw new Error('Unknown control point node kind.')
    const outputs = Object.fromEntries(job.outputNames.map(name => [name, {}]))
    const inputEdges = []
    let outputBranch = 0
    job.inputs[0].forEach((branch, branchIndex) => {
      branch[1].forEach((value, item) => {
        const native = makeGeometry(module, value, kind)
        try {
          const state = controlPoints.read(module, native)
          if (state.kind !== kind) throw new Error('Unexpected control point geometry type.')
          const points = state.points.map(point)
          const lists = [points, Array.from(state.weights), kind === 'curve' ? Array.from(state.knotsU) : Array.from({ length: state.count }, (_, i) => point(state.greville.subarray(i * 3, i * 3 + 3)))]
          // GH SetDataList grafts the current item index even for one item.
          const outputPath = branch[0].slice(0, -1) + ';' + item + '}'
          lists.forEach((values, port) => {
            outputs[job.outputNames[port]]['path' + outputBranch] = [outputPath, values, values.map(v => port === 0 ? pointPreview(v) : null)]
          })
          if (kind === 'surface') {
            // Count outputs use item access and retain the principal input path.
            for (let i = 3; i < 5; i++) {
              const tree = outputs[job.outputNames[i]]
              const tuple = tree['path' + branchIndex] || (tree['path' + branchIndex] = [branch[0], [], []])
              tuple[1].push(i === 3 ? state.countU : state.countV); tuple[2].push(null)
            }
          } else {
            const positions = module.nodecCurvePreview(native, 0.01, Math.PI / 90, 12)
            for (let i = 3; i < positions.length; i += 3) for (let j = i - 3; j < i + 3; j++) inputEdges.push(positions[j])
          }
          outputBranch++
        } finally { native.delete() }
      })
    })
    return { ok: true, documentId: job.documentId, outputs, executor: 'nodec-wasm', runtimeMessages: { errors: [], warnings: [] },
      paramPreviews: { inputs: inputEdges.length ? { 0: { edges: { positions: new Float32Array(inputEdges) } } } : {}, outputs: {} } }
  }
  function executeSetter (module, job, kind) {
    const native = makeGeometry(module, job.geometry, kind)
    let edited, faces, face, surface
    try {
      const result = controlPoints.set(module, native, { positions: job.positions, indices: job.indices, weights: job.weights })
      edited = module.CommonObject.decode(result.geometry)
      let preview = null
      if (kind === 'curve') preview = { type: 'polyline', positions: module.nodecCurvePreview(edited, 0.01, Math.PI / 90, 12) }
      else {
        if (edited instanceof module.Brep) { faces = edited.faces(); face = faces.get(0); surface = face.duplicateSurface() }
        // This node only accepts untrimmed surfaces. A bounded UV grid sampled
        // by native pointAt/normalAt makes an interactive preview; it does not
        // pretend to be a tolerance-certified Brep mesh or replace scene meshing.
        preview = surfacePreview(surface || edited, result.controlPoints)
      }
      return { ...result, value: { __geo: 'panda.' + result.controlPoints.container, data: result.geometry }, preview }
    } finally { surface?.delete(); face?.delete(); faces?.delete(); edited?.delete(); native.delete() }
  }
  function surfacePreview (surface, state) {
    const steps = 24, side = steps + 1
    const positions = new Float32Array(side * side * 3), normals = new Float32Array(positions.length)
    const indices = new Uint32Array(steps * steps * 6)
    const reverse = state.orientationIsReversed
    for (let u = 0; u <= steps; u++) for (let v = 0; v <= steps; v++) {
      const a = state.domainU[0] + (state.domainU[1] - state.domainU[0]) * u / steps
      const b = state.domainV[0] + (state.domainV[1] - state.domainV[0]) * v / steps
      const offset = (u * side + v) * 3
      positions.set(surface.pointAt(a, b), offset)
      normals.set(surface.normalAt(a, b).map(n => reverse ? -n : n), offset)
      if (u < steps && v < steps) {
        const i = u * side + v, triangles = [i, i + side, i + side + 1, i, i + side + 1, i + 1]
        if (reverse) { [triangles[1], triangles[2]] = [triangles[2], triangles[1]]; [triangles[4], triangles[5]] = [triangles[5], triangles[4]] }
        indices.set(triangles, (u * steps + v) * 6)
      }
    }
    if (!positions.every(Number.isFinite) || !normals.every(Number.isFinite)) throw new Error('Surface preview exceeds finite display coordinates.')
    return { type: 'mesh', positions, normals, indices }
  }
  function configureNode (entry, node) {
    if (describe(entry)?.kind === 'controlPoints:surface') node.outputs[2]?.setPreviewAttributes?.({ visible: false })
  }
  return { describe, plan, executePlan, makeGeometry, supportedGeometry, configureNode }
})
