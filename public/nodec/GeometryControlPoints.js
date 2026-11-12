(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PandaUIControlPoints = api
})(typeof self !== 'undefined' ? self : globalThis, function () {
  function fail (code, message) { throw Object.assign(new Error(message), { code }) }
  const finite = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e300
  const numbers = value => Array.isArray(value) || value instanceof Float64Array || value instanceof Float32Array

  // ToNurbs returns a separately owned native object, including for NURBS input.
  // Only an IsSurface Brep can be reconstructed without losing trim topology.
  function withNurbs (module, geometry, action, container = null) {
    if (geometry instanceof module.Brep) {
      const faces = geometry.faces()
      let face, surface
      try {
        if (faces.count !== 1) fail('MULTIFACE_BREP_UNSUPPORTED', 'Control point editing requires a single-face Brep; multiple faces cannot be safely reconstructed.')
        if (!geometry.isSurface) fail('TRIMMED_BREP_UNSUPPORTED', 'Trimmed Breps are unsupported: editing the underlying surface would discard trim topology.')
        face = faces.get(0)
        surface = face.duplicateSurface()
        if (!surface) fail('NURBS_CONVERSION_FAILED', 'Could not duplicate the untrimmed Brep surface.')
        return withNurbs(module, surface, action, { type: 'brep', orientationIsReversed: face.orientationIsReversed })
      } finally { surface?.delete(); face?.delete(); faces.delete() }
    }
    let native, kind
    if (geometry instanceof module.Curve) { kind = 'curve'; native = geometry.toNurbsCurve() }
    else if (geometry instanceof module.Surface && !(module.BrepFace && geometry instanceof module.BrepFace)) { kind = 'surface'; native = geometry.toNurbsSurface() }
    else fail('INVALID_GEOMETRY_TYPE', 'Control points require a curve or an untrimmed surface, not a Brep, mesh or reference.')
    if (!native) fail('NURBS_CONVERSION_FAILED', 'Geometry has no NURBS representation.')
    try {
      if (!native.isValid) fail('INVALID_GEOMETRY', 'The NURBS representation is invalid.')
      return action(native, kind, container)
    } finally { native.delete() }
  }
  function knotValues (list) {
    try { return Float64Array.from({ length: list.count }, (_, i) => list.get(i)) } finally { list.delete() }
  }
  function snapshot (native, kind, container = null) {
    const surface = kind === 'surface'
    const points = native.points()
    try {
      const countU = surface ? points.countU : points.count
      const countV = surface ? points.countV : 1
      const count = countU * countV
      const degreeU = surface ? native.degree(0) : native.degree
      const degreeV = surface ? native.degree(1) : 0
      const knotsU = knotValues(surface ? native.knotsU() : native.knots())
      const knotsV = surface ? knotValues(native.knotsV()) : new Float64Array()
      const positions = new Float64Array(count * 3)
      const weights = new Float64Array(count)
      const greville = new Float64Array(count * 3)
      const average = (knots, index, degree) => {
        let value = 0
        for (let i = 0; i < degree; i++) value += knots[index + i] / degree
        return value
      }
      for (let u = 0; u < countU; u++) for (let v = 0; v < countV; v++) {
        const index = u * countV + v
        const cv = surface ? points.get(u, v) : points.get(u)
        const weight = cv[3]
        if (!finite(weight) || weight === 0) fail('INVALID_CONTROL_POINT', 'A control point has a zero or non-finite homogeneous weight.')
        weights[index] = weight
        for (let axis = 0; axis < 3; axis++) {
          const coordinate = cv[axis] / weight
          if (!finite(coordinate)) fail('INVALID_CONTROL_POINT', 'A control point has an invalid Cartesian coordinate.')
          positions[index * 3 + axis] = coordinate
        }
        greville[index * 3] = surface ? average(knotsU, u, degreeU) : native.grevilleParameter(u)
        if (surface) greville[index * 3 + 1] = average(knotsV, v, degreeV)
      }
      return {
        kind, positions, weights, count, countU, countV, degreeU, degreeV, knotsU, knotsV, greville,
        points: Array.from({ length: count }, (_, i) => Array.from(positions.subarray(i * 3, i * 3 + 3))),
        knots: surface ? { u: Array.from(knotsU), v: Array.from(knotsV) } : Array.from(knotsU),
        container: container?.type || kind,
        orientationIsReversed: container?.orientationIsReversed || false,
        rational: native.isRational,
        domainU: surface ? native.domain(0) : native.domain,
        domainV: surface ? native.domain(1) : null,
        closedU: surface ? native.isClosed(0) : native.isClosed,
        closedV: surface ? native.isClosed(1) : false,
        periodicU: surface ? native.isPeriodic(0) : native.isPeriodic,
        periodicV: surface ? native.isPeriodic(1) : false
      }
    } finally { points.delete() }
  }
  function isSubD (module, geometry) { return module.SubD && geometry instanceof module.SubD }
  function subdSnapshot (module, geometry) {
    const data = module.nodecSubDControlPoints(geometry)
    return { ...data, kind: 'subd', container: 'subd', count: data.points.length, countU: data.points.length, countV: 1,
      positions: Float64Array.from(data.points.flat()), weights: new Float64Array(data.points.length).fill(1) }
  }
  function read (module, geometry) { return isSubD(module, geometry) ? subdSnapshot(module, geometry) : withNurbs(module, geometry, snapshot) }
  function setSubD (module, geometry, payload) {
    const before = subdSnapshot(module, geometry)
    if (payload.updates !== undefined) {
      if (['positions', 'indices', 'weights'].some(key => payload[key] !== undefined) || !Array.isArray(payload.updates) || payload.updates.some(u => !u || !Array.isArray(u.point) || u.point.length !== 3)) fail('INVALID_ARGUMENT', 'Use updates with index and XYZ point.')
      payload = { indices: payload.updates.map(u => u.index), positions: payload.updates.flatMap(u => u.point), weights: payload.updates.map(u => u.weight === undefined ? 1 : u.weight) }
    }
    const indices = payload.indices === undefined ? before.points.map((_, i) => i) : payload.indices
    if ((!Array.isArray(indices) && !(indices instanceof Uint32Array)) || !indices.length || new Set(indices).size !== indices.length || Array.from(indices).some(i => !Number.isSafeInteger(i) || i < 0 || i >= before.count)) fail('INVALID_ARGUMENT', 'Invalid SubD control point indices.')
    if (!numbers(payload.positions) || payload.positions.length !== indices.length * 3 || !Array.from(payload.positions).every(finite)) fail('INVALID_ARGUMENT', 'Invalid SubD control point positions.')
    if (payload.weights !== undefined && (!numbers(payload.weights) || payload.weights.length !== indices.length || Array.from(payload.weights).some(w => w !== 1))) fail('INVALID_ARGUMENT', 'SubD control points do not support rational weights.')
    const edited = module.nodecSubDSetControlPoints(geometry, Array.from(indices, i => before.vertexIds[i]), Array.from(payload.positions))
    try { return { geometry: edited.encode(), controlPoints: subdSnapshot(module, edited) } } finally { edited.delete() }
  }
  function set (module, geometry, payload) {
    if (isSubD(module, geometry)) return setSubD(module, geometry, payload)
    return withNurbs(module, geometry, (native, kind, container) => {
      const before = snapshot(native, kind, container)
      let explicitWeights
      if (payload.updates !== undefined) {
        if (['positions', 'indices', 'weights'].some(key => payload[key] !== undefined)) fail('INVALID_ARGUMENT', 'Use updates or positions/indices/weights, not both.')
        if (!Array.isArray(payload.updates) || !payload.updates.length || payload.updates.some(update => !update || !Array.isArray(update.point) || update.point.length !== 3)) fail('INVALID_ARGUMENT', 'updates must contain {index, point:[x,y,z], weight?} entries.')
        explicitWeights = payload.updates.map(update => update.weight !== undefined)
        payload = {
          indices: payload.updates.map(update => update.index),
          positions: payload.updates.flatMap(update => update.point),
          weights: payload.updates.map(update => update.weight === undefined ? before.weights[update.index] : update.weight)
        }
      }
      const { positions, weights } = payload
      const indices = payload.indices === undefined ? Array.from({ length: before.count }, (_, i) => i) : payload.indices
      if ((!Array.isArray(indices) && !(indices instanceof Uint32Array)) || !indices.length ||
          indices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= before.count) || new Set(indices).size !== indices.length) {
        fail('INVALID_ARGUMENT', 'indices must contain unique in-range control point indices.')
      }
      if (!numbers(positions) || positions.length !== indices.length * 3 || !Array.from(positions).every(finite)) {
        fail('INVALID_ARGUMENT', 'positions must contain one finite Cartesian XYZ triple per selected control point.')
      }
      if (weights !== undefined && (!numbers(weights) || weights.length !== indices.length || !Array.from(weights).every((w, i) => finite(w) && (explicitWeights?.[i] === false ? w !== 0 : w > 0)))) {
        fail('INVALID_ARGUMENT', 'weights must contain one positive finite weight per selected control point.')
      }
      // Validate all products before touching the private copy. Unselected CVs
      // are never rewritten, avoiding dehomogenize/rehomogenize roundoff there.
      const cvs = Array.from(indices, (index, i) => {
        const weight = weights === undefined ? before.weights[index] : weights[i]
        const cv = [positions[i * 3] * weight, positions[i * 3 + 1] * weight, positions[i * 3 + 2] * weight, weight]
        if (!cv.every(finite)) fail('INVALID_ARGUMENT', 'Weighted control point coordinates overflow the supported range.')
        return cv
      })
      const points = native.points()
      try {
        const uniqueU = before.countU - (before.periodicU ? before.degreeU : 0)
        const uniqueV = before.countV - (before.periodicV ? before.degreeV : 0)
        const periodicKey = index => (Math.floor(index / before.countV) % uniqueU) * uniqueV + (index % before.countV) % uniqueV
        const get = index => kind === 'surface' ? points.get(Math.floor(index / before.countV), index % before.countV) : points.get(index)
        const parent = Array.from({ length: uniqueU * uniqueV }, (_, i) => i)
        const root = key => { while (parent[key] !== key) { parent[key] = parent[parent[key]]; key = parent[key] } return key }
        const key = index => root(periodicKey(index))
        function linkClosedBoundary (a, b) {
          const first = get(a), last = get(b)
          if (!last.every((value, axis) => value === first[axis])) fail('CLOSED_EDIT_UNSUPPORTED', 'The closed geometry does not have identical homogeneous boundary CVs; geometry was not changed.')
          parent[key(b)] = key(a)
        }
        // Only native closed boundaries are linked. Equal interior CVs and
        // coincident points on otherwise open curves remain independent.
        if (before.closedU && !before.periodicU) for (let v = 0; v < before.countV; v++) linkClosedBoundary(v, (before.countU - 1) * before.countV + v)
        if (before.closedV && !before.periodicV) for (let u = 0; u < before.countU; u++) linkClosedBoundary(u * before.countV, u * before.countV + before.countV - 1)
        const groups = new Map()
        for (let index = 0; index < before.count; index++) {
          const groupKey = key(index)
          if (!groups.has(groupKey)) groups.set(groupKey, [])
          const group = groups.get(groupKey)
          if (group.length) {
            const first = get(group[0]), current = get(index)
            if (!current.every((value, axis) => value === first[axis])) fail('PERIODIC_EDIT_UNSUPPORTED', 'The periodic surface/curve has an unsupported seam CV pattern; geometry was not changed.')
          }
          group.push(index)
        }
        const edits = new Map()
        indices.forEach((index, i) => {
          const groupKey = key(index), previous = edits.get(groupKey)
          if (previous && !previous.every((value, axis) => value === cvs[i][axis])) fail('INVALID_ARGUMENT', 'Conflicting edits target equivalent closed or periodic seam control points.')
          edits.set(groupKey, cvs[i])
        })
        if (!native.isRational && cvs.some(cv => cv[3] !== 1) && !points.makeRational()) fail('CONTROL_POINT_EDIT_FAILED', 'Could not make the NURBS representation rational.')
        edits.forEach((cv, groupKey) => groups.get(groupKey).forEach(index => {
          // Embind setters return void; validity and readback check success.
          if (kind === 'surface') points.set(Math.floor(index / before.countV), index % before.countV, cv)
          else points.set(index, cv)
        }))
      } finally { points.delete() }
      if (!native.isValid) fail('CONTROL_POINT_EDIT_FAILED', 'The edit would create invalid NURBS geometry.')
      const controlPoints = snapshot(native, kind, container)
      if ((before.periodicU && !controlPoints.periodicU) || (before.periodicV && !controlPoints.periodicV)) fail('CONTROL_POINT_EDIT_FAILED', 'The edit would break a periodic seam; geometry was not changed.')
      if ((before.closedU && !controlPoints.closedU) || (before.closedV && !controlPoints.closedV)) fail('CONTROL_POINT_EDIT_FAILED', 'The edit would open a closed seam; geometry was not changed.')
      if (container?.type === 'brep') {
        const brep = module.Brep.createFromSurface(native)
        if (!brep) fail('CONTROL_POINT_EDIT_FAILED', 'Could not reconstruct the untrimmed Brep.')
        try {
          if (container.orientationIsReversed) brep.flip()
          if (!brep.isValid) fail('CONTROL_POINT_EDIT_FAILED', 'The reconstructed Brep is invalid.')
          return { geometry: brep.encode(), controlPoints }
        } finally { brep.delete() }
      }
      return { geometry: native.encode(), controlPoints }
    })
  }
  function execute (module, operation, payload = {}) {
    if (!['geometry.controlPoints', 'geometry.setControlPoints'].includes(operation)) fail('UNSUPPORTED_OPERATION', 'Unknown control point operation: ' + operation)
    if (!payload.geometry || typeof payload.geometry.data !== 'string' || !payload.geometry.data.length) fail('INVALID_GEOMETRY', 'An encoded NodeC geometry archive is required.')
    let geometry
    try { geometry = module.CommonObject.decode(payload.geometry) } catch (_) { fail('INVALID_GEOMETRY', 'The geometry archive could not be decoded.') }
    if (!geometry) fail('INVALID_GEOMETRY', 'The geometry archive could not be decoded.')
    try { return operation === 'geometry.controlPoints' ? read(module, geometry) : set(module, geometry, payload) } finally { geometry.delete() }
  }
  return { read, set, controlPoints: read, setControlPoints: set, execute }
})
