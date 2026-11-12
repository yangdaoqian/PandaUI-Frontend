/* global importScripts, createNodeC, self */
let rhino = null
let activeJob = null

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function multiply (a, b) {
  const result = new Array(16).fill(0)
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      for (let index = 0; index < 4; index++) result[column * 4 + row] += a[index * 4 + row] * b[column * 4 + index]
    }
  }
  return result
}

function transformPoint (matrix, x, y, z) {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ]
}

function isType (geometry, name) {
  return geometry != null && (geometry.objectType === rhino.ObjectType[name] || String(geometry.objectType).toLowerCase() === name.toLowerCase())
}

function appearance (attributes, document) {
  try {
    const drawColor = attributes?.drawColor(document)
    const edgeColor = drawColor ? [drawColor.r / 255, drawColor.g / 255, drawColor.b / 255] : [0.72, 0.72, 0.72]
    let sourceMaterialKey = 'default'
    const material = document?.materials?.()?.findFromAttributes?.(attributes)
    if (material != null) {
      sourceMaterialKey = String(material.id || material.name || sourceMaterialKey)
      material.delete?.()
    }
    return { color: edgeColor, edgeColor, materialKey: sourceMaterialKey + '|color:' + edgeColor.join(',') }
  } catch (error) {
    return { color: [0.72, 0.72, 0.72], edgeColor: [0.72, 0.72, 0.72], materialKey: 'default' }
  }
}
function edgeGroup (edgeGroups, material) {
  if (edgeGroups[material.materialKey] == null) edgeGroups[material.materialKey] = { materialKey: material.materialKey, color: material.edgeColor, values: [] }
  return edgeGroups[material.materialKey].values
}

function curvePoints (curve) {
  try {
    if (curve instanceof rhino.LineCurve) return [curve.pointAtStart, curve.pointAtEnd]
    if (curve instanceof rhino.PolylineCurve) {
      const points = []
      for (let index = 0; index < curve.pointCount; index++) points.push(curve.point(index))
      return points
    }
    const domain = curve.domain
    const points = []
    const divisions = 24
    for (let index = 0; index <= divisions; index++) points.push(curve.pointAt(domain[0] + index * (domain[1] - domain[0]) / divisions))
    return points
  } catch (error) {
    return []
  }
}

function meshData (source, matrix, material) {
  if (source?.position == null) return null
  const position = new Float32Array(source.position.length)
  for (let index = 0; index < position.length; index += 3) {
    const transformed = transformPoint(matrix, source.position[index], source.position[index + 1], source.position[index + 2])
    position[index] = transformed[0]
    position[index + 1] = transformed[1]
    position[index + 2] = transformed[2]
  }
  return {
    position,
    normal: source.normal ? new Float32Array(source.normal) : null,
    index: source.index ? new source.index.constructor(source.index) : null,
    color: material.color,
    materialKey: material.materialKey
  }
}

function appendBrep (geometry, attributes, document, matrix, meshes, edgeGroups) {
  const material = appearance(attributes, document)
  const faces = geometry.faces()
  for (let faceIndex = 0; faceIndex < faces.count; faceIndex++) {
    const face = faces.get(faceIndex)
    try {
      const mesh = face?.getMesh(rhino.MeshType.Any)
      const data = meshData(mesh?.toThreejsBuffers?.(false), matrix, material)
      if (data != null) meshes.push(data)
      mesh?.delete?.()
    } catch (error) {
    } finally {
      face?.delete?.()
    }
  }
  faces.delete?.()

  const values = edgeGroup(edgeGroups, material)
  const edges = geometry.edges()
  for (let edgeIndex = 0; edgeIndex < edges.count; edgeIndex++) {
    const edge = edges.get(edgeIndex)
    try {
      const points = curvePoints(edge)
      for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
        const from = transformPoint(matrix, points[pointIndex - 1][0], points[pointIndex - 1][1], points[pointIndex - 1][2])
        const to = transformPoint(matrix, points[pointIndex][0], points[pointIndex][1], points[pointIndex][2])
        values.push(...from, ...to)
      }
    } catch (error) {
    } finally {
      edge?.delete?.()
    }
  }
  edges.delete?.()
}

function appendMeshEdges (geometry, matrix, material, edgeGroups) {
  const topology = geometry.topologyEdges?.()
  if (topology == null) return
  try {
    const source = topology.edgesToArray?.()
    const values = edgeGroup(edgeGroups, material)
    for (let index = 0; source != null && index + 2 < source.length; index += 3) {
      const transformed = transformPoint(matrix, source[index], source[index + 1], source[index + 2])
      values.push(...transformed)
    }
  } finally {
    topology.delete?.()
  }
}

function appendObject (modelObject, document, matrix, objectTable, definitionTable, meshes, edgeGroups, visited) {
  if (modelObject == null) return
  const geometry = modelObject.geometry()
  const attributes = modelObject.attributes()
  try {
    if (isType(geometry, 'Brep')) {
      appendBrep(geometry, attributes, document, matrix, meshes, edgeGroups)
    } else if (isType(geometry, 'Mesh')) {
      const material = appearance(attributes, document)
      const data = meshData(geometry.toThreejsBuffers?.(false), matrix, material)
      if (data != null) meshes.push(data)
      appendMeshEdges(geometry, matrix, material, edgeGroups)
    } else if (isType(geometry, 'InstanceReference')) {
      const definition = definitionTable.findId(geometry.parentIdefId)
      const key = `${geometry.parentIdefId}:${modelObject.id || ''}`
      if (definition != null && !visited.has(key)) {
        visited.add(key)
        const childMatrix = multiply(matrix, Array.from(geometry.xform.toFloatArray(true)))
        definition.getObjectIds().forEach(id => appendObject(objectTable.findId(id), document, childMatrix, objectTable, definitionTable, meshes, edgeGroups, visited))
        visited.delete(key)
      }
    }
  } catch (error) {
  } finally {
    attributes?.delete?.()
    geometry?.delete?.()
  }
}

async function load (message) {
  activeJob = message.jobId
  if (rhino == null) {
    importScripts('/nodec/NodeC.js')
    rhino = await createNodeC({ locateFile: file => `/nodec/${file}` })
  }
  const document = rhino.File3dm.fromByteArray(new Uint8Array(message.buffer))
  const definitions = document.instanceDefinitions()
  const objects = document.objects()
  const names = message.definitionNames || []
  for (let definitionIndex = 0; definitionIndex < names.length; definitionIndex++) {
    if (activeJob !== message.jobId) return
    const name = String(names[definitionIndex])
    let definition = null
    for (let index = 0; index < definitions.count; index++) {
      const candidate = definitions.get(index)
      if (candidate != null && String(candidate.name || '') === name) {
        definition = candidate
        break
      }
    }
    const meshes = []
    const edgeGroups = {}
    if (definition != null) definition.getObjectIds().forEach(id => appendObject(objects.findId(id), document, identity(), objects, definitions, meshes, edgeGroups, new Set()))
    const serializedEdges = Object.values(edgeGroups).map(item => ({ materialKey: item.materialKey, color: item.color, position: new Float32Array(item.values) }))
    const transfer = []
    meshes.forEach(item => {
      transfer.push(item.position.buffer)
      if (item.normal) transfer.push(item.normal.buffer)
      if (item.index) transfer.push(item.index.buffer)
    })
    serializedEdges.forEach(item => transfer.push(item.position.buffer))
    self.postMessage({ type: 'definition', jobId: message.jobId, index: definitionIndex, name, meshes, edgeGroups: serializedEdges }, transfer)
  }
  document.delete?.()
  self.postMessage({ type: 'done', jobId: message.jobId })
  activeJob = null
}

self.onmessage = event => {
  const message = event.data || {}
  if (message.type === 'cancel') activeJob = null
  else if (message.type === 'load') load(message).catch(error => self.postMessage({ type: 'error', jobId: message.jobId, error: String(error?.message || error) }))
}



