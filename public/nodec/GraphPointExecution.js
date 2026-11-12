(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PandaUIPointNodeExecution = api
})(typeof self !== 'undefined' ? self : globalThis, function () {
  // Exact GH contracts from the catalog and VectorComponents source. The
  // plane-based, hidden Deconstruct Point (670fcdba-...) is intentionally absent.
  const capabilities = [
    { id: '9abae6b7-fa1d-448c-9209-4a8155345841', kind: 'point:deconstruct', name: 'Deconstruct', category: 'Point',
      inputs: [['Point', 'point']], outputs: [['X component', 'number'], ['Y component', 'number'], ['Z component', 'number']] },
    { id: '93b8e93d-f932-402c-b435-84be04d87666', kind: 'point:distance', name: 'Distance', category: 'Point',
      inputs: [['Point A', 'point'], ['Point B', 'point']], outputs: [['Distance', 'number']] },
    { id: '56b92eab-d121-43f7-94d3-6cd8f0ddead8', kind: 'point:vectorXYZ', name: 'Vector XYZ', category: 'Vector',
      inputs: [['X component', 'number'], ['Y component', 'number'], ['Z component', 'number']], outputs: [['Vector', 'vector'], ['Length', 'number']] },
    { id: 'a50fcd4a-cf42-4c3f-8616-022761e6cc93', kind: 'point:deconstructVector', name: 'Deconstruct Vector', category: 'Vector',
      inputs: [['Vector', 'vector']], outputs: [['X component', 'number'], ['Y component', 'number'], ['Z component', 'number']] },
    { id: '675e31bf-1775-48d7-bb8d-76b77786dd53', kind: 'point:vectorLength', name: 'Vector Length', category: 'Vector',
      inputs: [['Vector', 'vector']], outputs: [['Length', 'number']] },
    { id: 'd5788074-d75d-4021-b1a3-0bf992928584', kind: 'point:reverseVector', name: 'Reverse', category: 'Vector',
      inputs: [['Vector', 'vector']], outputs: [['Vector', 'vector']] },
    { id: '79f9fbb3-8f1d-4d9a-88a9-f7961b1012cd', kind: 'point:unitX', axis: 0, name: 'Unit X', category: 'Vector',
      inputs: [['Factor', 'number']], outputs: [['Unit vector', 'vector']] },
    { id: 'd3d195ea-2d59-4ffa-90b1-8b7ff3369f69', kind: 'point:unitY', axis: 1, name: 'Unit Y', category: 'Vector',
      inputs: [['Factor', 'number']], outputs: [['Unit vector', 'vector']] },
    { id: '9103c240-a6a9-4223-9b42-dbd19bf38e2b', kind: 'point:unitZ', axis: 2, name: 'Unit Z', category: 'Vector',
      inputs: [['Factor', 'number']], outputs: [['Unit vector', 'vector']] },
    { id: '63fff845-7c61-4dfb-ba12-44d481b4bf0f', kind: 'point:multiply', operation: 'multiply', name: 'Multiply', category: 'Vector',
      inputs: [['Vector', 'vector'], ['Factor', 'number']], outputs: [['Vector', 'vector'], ['Length', 'number']] },
    { id: '310e1065-d03a-4858-bcd1-809d39c042af', kind: 'point:divide', operation: 'divide', name: 'Divide', category: 'Vector',
      inputs: [['Vector', 'vector'], ['Factor', 'number']], outputs: [['Vector', 'vector'], ['Length', 'number']] },
    { id: '934ede4a-924a-4973-bb05-0dc4b36fae75', kind: 'point:vector2Pt', operation: 'vector2Pt', name: 'Vector 2Pt', category: 'Vector',
      inputs: [['Point A', 'point'], ['Point B', 'point'], ['Unitize', 'boolean']], outputs: [['Vector', 'vector'], ['Length', 'number']] },
    { id: 'fb012ef9-4734-4049-84a0-b92b85bb09da', kind: 'point:addition', operation: 'addition', name: 'Addition', category: 'Vector',
      inputs: [['Vector A', 'vector'], ['Vector B', 'vector'], ['Unitize', 'boolean']], outputs: [['Vector', 'vector'], ['Length', 'number']] },
    { id: '43b9ea8f-f772-40f2-9880-011a9c3cbbb0', kind: 'point:dotProduct', operation: 'dotProduct', name: 'Dot Product', category: 'Vector',
      inputs: [['Vector A', 'vector'], ['Vector B', 'vector'], ['Unitize', 'boolean']], outputs: [['Dot product', 'number']] },
    { id: '2a5cfb31-028a-4b34-b4e1-9b20ae15312e', kind: 'point:crossProduct', operation: 'crossProduct', name: 'Cross Product', category: 'Vector',
      inputs: [['Vector A', 'vector'], ['Vector B', 'vector'], ['Unitize', 'boolean']], outputs: [['Vector', 'vector'], ['Length', 'number']] },
    { id: 'd2da1306-259a-4994-85a4-672d8a4c7805', kind: 'point:unitVector', operation: 'unitVector', name: 'Unit Vector', category: 'Vector',
      inputs: [['Vector', 'vector']], outputs: [['Vector', 'vector']] },
    { id: '6ec39468-dae7-4ffa-a766-f2ab22a2c62e', kind: 'point:amplitude', operation: 'amplitude', name: 'Amplitude', category: 'Vector',
      inputs: [['Vector', 'vector'], ['Amplitude', 'number']], outputs: [['Vector', 'vector']] }
  ]
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const dense = value => Array.isArray(value) && Array.from({ length: value.length }, (_, i) => Object.hasOwn(value, i)).every(Boolean)
  function contracts (ports, expected) {
    return dense(ports) && ports.length === expected.length && ports.every((port, i) => object(port) &&
      port.name === expected[i][0] && port.type === expected[i][1] && (port.access == null || port.access === 'item'))
  }
  function describe (entry) {
    if (!object(entry) || entry.execution !== 'gh' || entry.source !== 'grasshopperComponentServer' ||
      entry.assemblyId !== 'VectorComponents' || entry.isComponent !== true || entry.isParam !== false ||
      entry.libraryName !== 'Vector' || entry.reflection != null ||
      (entry.trustedSource != null && entry.trustedSource !== entry.source) ||
      ['sourcePath', 'assemblyPath', 'originPath'].some(key => entry[key] != null)) return null
    const ids = ['componentGuid', 'ComponentGuid', 'guid', 'id'].filter(key => entry[key] != null)
      .map(key => String(entry[key]).replace(/^\{([^{}]+)\}$/, '$1').toLowerCase())
    if (!ids.length || ids.some(id => id !== ids[0])) return null
    const capability = capabilities.find(candidate => candidate.id === ids[0])
    if (!capability || entry.name !== capability.name || entry.category !== capability.category ||
      !contracts(entry.inputs, capability.inputs) || !contracts(entry.outputs, capability.outputs)) return null
    return { kind: capability.kind }
  }
  // Conservative finite domain excludes Rhino Unset and keeps subtraction and
  // length finite. No string/boolean coercion or implicit GH geometry casts.
  const number = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e300
  const boolean = value => typeof value === 'boolean'
  const point = value => object(value) && Object.keys(value).length === 2 && value.__geo === 'panda.point' &&
    dense(value.data) && value.data.length === 3 && value.data.every(number)
  const vector = value => object(value) && Object.keys(value).length === 2 && value.__geo === 'panda.vector' &&
    dense(value.data) && value.data.length === 3 && value.data.every(number)
  const validPath = value => typeof value === 'string' && /^\{(?:0|[1-9]\d*)(?:;(?:0|[1-9]\d*))*\}$/.test(value) &&
    value.slice(1, -1).split(';').every(index => Number(index) <= 2147483647)
  function comparePaths (left, right) {
    const a = left[0].slice(1, -1).split(';').map(Number)
    const b = right[0].slice(1, -1).split(';').map(Number)
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]
    return a.length - b.length
  }
  function branches (input) {
    // Only frontend summaries are authoritative inline data. Server parameter
    // references, geometryRef and general structRef stay with their backend.
    let frontendSummary = false
    if (input?.kind === 'paramRef') {
      const fields = ['kind', 'backendGeneration', 'documentId', 'componentInstanceId', 'paramInstanceId',
        'paramIndex', 'direction', 'solutionGeneration', 'dataRevision', 'dataTreeSummary']
      if (typeof input.paramInstanceId !== 'string' || !input.paramInstanceId.startsWith('frontend:') ||
        Object.keys(input).some(key => !fields.includes(key))) return null
      frontendSummary = true
      input = input.dataTreeSummary
    }
    if (!object(input)) return null
    const keys = Object.keys(input)
    if (!keys.length || keys.some(key => !/^path(?:0|[1-9]\d*)$/.test(key))) return null
    const result = keys.map(key => input[key])
    if (result.some(tuple => !dense(tuple) || (tuple.length !== 2 && tuple.length !== 3) || !validPath(tuple[0]) ||
      !dense(tuple[1]) || !tuple[1].length)) return null
    if (new Set(result.map(tuple => tuple[0])).size !== result.length) return null
    return result.map(tuple => [tuple[0], tuple[1].map(value => {
      // pandaui-plugins.frontendValueReference wraps scalar widget values.
      // Unwrap only that exact frontend contract, never CLR/opaque structs,
      // top-level wire structs, or wrappers carrying extra reference metadata.
      if (frontendSummary && object(value) && value.kind === 'structRef' &&
        Object.keys(value).length === 3 && Object.keys(value).every(key => ['kind', 'type', 'data'].includes(key)) &&
        ((value.type === 'number' && number(value.data)) || (value.type === 'boolean' && boolean(value.data)))) return value.data
      return value
    })]).sort(comparePaths)
  }
  function validInputs (capability, inputs) {
    if (!dense(inputs) || inputs.length !== capability.inputs.length) return false
    for (let i = 0; i < inputs.length; i++) {
      const tree = inputs[i]
      const valid = { point, vector, number, boolean }[capability.inputs[i][1]]
      if (!dense(tree) || !tree.length || tree.some((branch, j) => !dense(branch) || branch.length !== 2 ||
        !validPath(branch[0]) || !dense(branch[1]) || !branch[1].length || !branch[1].every(valid) ||
        (j > 0 && comparePaths(tree[j - 1], branch) >= 0))) return false
      // Identical paths ensure GH's principal input has the same output paths.
      // General GH cross-tree matching is deliberately left to NodeAdapter.
      if (tree.length !== inputs[0].length || tree.some((branch, j) => branch[0] !== inputs[0][j][0])) return false
    }
    return true
  }
  function plan (entry, request) {
    const definition = describe(entry)
    if (!definition || !object(request) || !object(request.inputs)) return null
    if (request.inputUpdate != null && (!object(request.inputUpdate) || request.inputUpdate.version !== 1 ||
      request.inputUpdate.mode !== 'replace' || (request.inputUpdate.removed != null &&
        (!Array.isArray(request.inputUpdate.removed) || request.inputUpdate.removed.length)))) return null
    const capability = capabilities.find(candidate => candidate.kind === definition.kind)
    if (Object.keys(request.inputs).some(name => !capability.inputs.some(port => port[0] === name))) return null
    const inputs = capability.inputs.map(port => branches(request.inputs[port[0]]))
    if (!validInputs(capability, inputs)) return null
    // The NodeAdapter request uses JSON.stringify, which encodes -0 as 0.
    // Match that input boundary on our own snapshot only. Keep caller inputs
    // intact, and never normalize signs produced by the actual calculation.
    const wireNumber = value => value === 0 ? 0 : value
    const job = { kind: definition.kind, documentId: request.documentId,
      outputNames: capability.outputs.map(port => port[0]),
      inputs: inputs.map(tree => tree.map(([path, values]) => [path, values.map(value => typeof value === 'number'
        ? wireNumber(value) : typeof value === 'boolean' ? value : { __geo: value.__geo, data: value.data.map(wireNumber) })])) }
    if (capability.operation) {
      // Preflight every matched item before dispatch: an unsupported later
      // item falls back as a whole tree, with backend messages/output gaps.
      for (let branch = 0; branch < job.inputs[0].length; branch++) {
        const count = Math.max(...job.inputs.map(tree => tree[branch][1].length))
        for (let item = 0; item < count; item++) {
          if (!vectorOperation(capability.operation, itemValues(job.inputs, branch, item))) return null
        }
      }
    }
    return job
  }
  function length (dx, dy, dz) {
    // Port of CicadaCommom.Geometry.Vector3d.GetLengthHelper, also called by
    // Point3d.DistanceTo. Keep its swap order, reciprocal multiplication and
    // subnormal behavior; Math.hypot is not equivalent at that boundary.
    let x = Math.abs(dx), y = Math.abs(dy), z = Math.abs(dz)
    if (y >= x && y >= z) [x, y] = [y, x]
    else if (z >= x && z >= y) [x, z] = [z, x]
    if (x > 2.2250738585072014e-308) {
      const inverse = 1 / x
      y *= inverse
      z *= inverse
      return x * Math.sqrt(1 + y * y + z * z)
    }
    return x > 0 ? x : 0
  }
  const minNormal = 2.2250738585072014e-308
  const validResult = value => Number.isFinite(value) && value !== -1.23432101234321e308
  function nativeLength (data) {
    // ON_Length3d (opennurbs_point.cpp), unlike managed GetLengthHelper,
    // divides by the largest coordinate instead of multiplying its reciprocal.
    let [x, y, z] = data.map(Math.abs)
    if (y >= x && y >= z) [x, y] = [y, x]
    else if (z >= x && z >= y) [x, z] = [z, x]
    if (x > minNormal) { y /= x; z /= x; return x * Math.sqrt(1 + y * y + z * z) }
    return x > 0 ? x : 0
  }
  function unitize (data) {
    // ON_3dVector::Unitize, called by dotnet Vector3d.Unitize. The normal
    // path divides each coordinate; subnormals are rescaled by exactly 2^1023.
    let magnitude = nativeLength(data)
    if (!validResult(magnitude)) return null // unsupported overflow, never fabricate a zero success
    if (magnitude > minNormal) return data.map(value => value / magnitude)
    if (magnitude > 0) {
      const scaled = data.map(value => value * 8.98846567431158e307)
      magnitude = nativeLength(scaled)
      if (!validResult(magnitude)) return null
      if (magnitude > minNormal) return scaled.map(value => value / magnitude)
    }
    return [0, 0, 0] // native failure for a zero vector sets all coordinates to +0
  }
  function vectorOperation (operation, values) {
    let a = values[0].data, b, data
    if (operation === 'dotProduct') {
      b = values[1].data
      // Dot unitizes the INPUTS; the other binary operations unitize the result.
      if (values[2]) { a = unitize(a); b = unitize(b); if (!a || !b) return null }
      const products = a.map((value, axis) => value * b[axis])
      if (!products.every(validResult)) return null
      const sum = products[0] + products[1]
      const result = sum + products[2]
      return validResult(sum) && validResult(result) ? [result] : null
    }
    if (operation === 'multiply' || operation === 'divide') {
      // The GH error branch emits "Cannot divide by zero" and omits outputs.
      // Leave its tree gaps/message aggregation entirely to NodeAdapter.
      if (operation === 'divide' && Math.abs(values[1]) < 1e-12) return null
      const factor = operation === 'divide' ? 1 / values[1] : values[1]
      data = a.map(value => value * factor)
    } else if (operation === 'unitVector' || operation === 'amplitude') {
      data = unitize(a)
      if (!data) return null
      if (operation === 'amplitude') data = data.map(value => value * values[1])
    } else {
      b = values[1].data
      if (operation === 'vector2Pt') data = b.map((value, axis) => value - a[axis])
      else if (operation === 'addition') data = a.map((value, axis) => value + b[axis])
      else if (operation === 'crossProduct') {
        const products = [a[1] * b[2], b[1] * a[2], a[2] * b[0], b[2] * a[0], a[0] * b[1], b[0] * a[1]]
        if (!products.every(validResult)) return null
        data = [products[0] - products[1], products[2] - products[3], products[4] - products[5]]
      } else return null
      if (!data.every(validResult)) return null
      if (values[2]) data = unitize(data)
    }
    if (!data || !data.every(validResult)) return null
    const result = [{ __geo: 'panda.vector', data }]
    if (operation !== 'unitVector' && operation !== 'amplitude') {
      const magnitude = length(...data)
      if (!validResult(magnitude)) return null
      result.push(magnitude)
    }
    return result
  }
  function itemValues (inputs, branch, item) {
    return inputs.map(tree => { const list = tree[branch][1]; return list[Math.min(item, list.length - 1)] })
  }
  function executePlan (module, job) {
    // The shared Worker supplies module. Managed arithmetic and the native
    // unitization algorithm are ported here without native geometry allocations.
    // Cancellation/worker termination and fallback belong to the caller.
    const capability = capabilities.find(candidate => candidate.kind === job?.kind)
    if (!capability || !validInputs(capability, job.inputs) || !dense(job.outputNames) ||
      job.outputNames.length !== capability.outputs.length ||
      job.outputNames.some((name, i) => name !== capability.outputs[i][0])) throw new Error('Invalid point execution plan.')
    const outputs = Object.fromEntries(job.outputNames.map(name => [name, {}]))
    job.inputs[0].forEach((branch, branchIndex) => {
      const count = Math.max(...job.inputs.map(tree => tree[branchIndex][1].length))
      const tuples = job.outputNames.map(name => (outputs[name]['path' + branchIndex] = [branch[0], [], []]))
      for (let item = 0; item < count; item++) {
        // GH_Component.IncrementItemIndices_LongestList repeats the last item
        // of each shorter list; never flatten branches or form a cross product.
        const values = itemValues(job.inputs, branchIndex, item)
        let result
        if (capability.operation) {
          result = vectorOperation(capability.operation, values)
          if (!result) throw new Error('Unsupported vector operation arithmetic; use NodeAdapter.')
        } else if (job.kind === 'point:deconstruct' || job.kind === 'point:deconstructVector') result = values[0].data.slice()
        else if (job.kind === 'point:vectorLength') result = [length(...values[0].data)]
        else if (job.kind === 'point:reverseVector') {
          // The built dotnet/opennurbs/opennurbs_point.cs and parity DLL use
          // unary negation (three IL neg instructions): +0 must produce -0.
          result = [{ __geo: 'panda.vector', data: values[0].data.map(value => -value) }]
        } else if (capability.axis != null) {
          // Vector3d.X/Y/ZAxis * Factor multiplies even zero components, so a
          // negative factor produces -0 on the other axes. Defaults stay backend.
          result = [{ __geo: 'panda.vector', data: [0, 1, 2].map(axis => (axis === capability.axis ? 1 : 0) * values[0]) }]
        } else if (job.kind === 'point:distance') {
          const a = values[0].data, b = values[1].data
          result = [length(b[0] - a[0], b[1] - a[1], b[2] - a[2])]
        } else result = [{ __geo: 'panda.vector', data: values.slice() }, length(...values)]
        tuples.forEach((tuple, i) => { tuple[1].push(result[i]); tuple[2].push(null) })
      }
    })
    // GH_ParamPreviewBuilder.AppendValue has no Point3d or Vector3d case.
    return { ok: true, documentId: job.documentId, executor: 'nodec-wasm', outputs,
      runtimeMessages: { errors: [], warnings: [] }, paramPreviews: { inputs: {}, outputs: {} } }
  }
  return { describe, plan, executePlan }
})
