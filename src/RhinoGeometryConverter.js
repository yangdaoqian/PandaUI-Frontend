import * as THREE from 'three'
import { createPointMaterial } from './PointDisplaySettings'
import { renderPreviewSurfaceDepth } from './PreviewSurfaceRendering'

// RhinoGeometryConverter.js
// 将后端 Rhino 几何体数据转换为 Three.js 可显示的对象。
// 支持: Mesh, Brep, SubD, Curve, Point, Vector, Plane, Line, Box, Circle, Arc, Rectangle, Transform, Matrix, Surface

const GEOMETRY_TYPES = {
  MESH: 'panda.mesh',
  BREP: 'panda.brep',
  SUBD: 'panda.subd',
  CURVE: 'panda.curve',
  POLYLINE: 'panda.polyline',
  SURFACE: 'panda.surface',
  LINE: 'panda.line',
  CIRCLE: 'panda.circle',
  ARC: 'panda.arc',
  RECTANGLE: 'panda.rectangle',
  MESHFACE: 'panda.meshface',
  POINT: 'panda.point',
  VECTOR: 'panda.vector',
  PLANE: 'panda.plane',
  BOX: 'panda.box',
  TRANSFORM: 'panda.transform',
  MATRIX: 'panda.matrix',
  OTHER: 'panda.geometry'
}

export function normalizeGeometryType (type) {
  return typeof type === 'string' ? type.replace(/^rhino\./, 'panda.') : type
}

function isObject (value) {
  return value != null && typeof value === 'object'
}

function isGeometryPacket (value) {
  return isObject(value) && typeof value.__geo === 'string' && Object.prototype.hasOwnProperty.call(value, 'data')
}

function isLegacyTreeData (value) {
  return isObject(value) && Array.isArray(value.path) && Array.isArray(value.datas)
}

function isWireTreeData (value) {
  return isObject(value) && Object.keys(value).some(key => /^path\d+$/.test(key))
}

function treeValues (value) {
  if (isLegacyTreeData(value)) return value.datas.slice()
  if (!isWireTreeData(value)) return []
  return Object.keys(value)
    .filter(key => /^path\d+$/.test(key))
    .sort((left, right) => Number(left.slice(4)) - Number(right.slice(4)))
    .reduce((result, key) => {
      const tuple = Array.isArray(value[key]) ? value[key] : []
      const values = Array.isArray(tuple[1]) ? tuple[1] : []
      return result.concat(values)
    }, [])
}

function unwrapDualData (value) {
  if (isObject(value) && value._isDualData === true && value.display && value.display.treeData != null) {
    return value.display.treeData
  }
  return value
}

function unpackValue (value) {
  value = unwrapDualData(value)
  if (isGeometryPacket(value)) return value.data
  if (isLegacyTreeData(value) || isWireTreeData(value)) return treeValues(value).map(item => unpackValue(item))
  if (Array.isArray(value)) return value.map(item => unpackValue(item))
  return value
}

export default class RhinoGeometryConverter {
  static isGeometryPacket (value) {
    return isGeometryPacket(value)
  }

  static wrap (geoType, data, metadata = {}) {
    geoType = normalizeGeometryType(geoType)
    if (isGeometryPacket(data) && (geoType == null || normalizeGeometryType(data.__geo) === geoType)) {
      if (data.__geo === normalizeGeometryType(data.__geo) && Object.keys(metadata).length === 0) return data
      return { ...data, ...metadata, __geo: normalizeGeometryType(data.__geo) }
    }
    return { data, ...metadata, __geo: geoType || GEOMETRY_TYPES.OTHER }
  }

  static unpack (value) {
    return unpackValue(value)
  }

  static packMany (geoType, values, metadata = {}) {
    const items = Array.isArray(values) ? values : (values == null ? [] : [values])
    return items.map(value => this.wrap(geoType, value, metadata))
  }

  static unpackMany (value) {
    const unpacked = unpackValue(value)
    if (unpacked == null) return []
    return Array.isArray(unpacked) ? unpacked : [unpacked]
  }

  static packetData (value) {
    if (!isGeometryPacket(value)) return null
    return value.data
  }

  static build (payload, displayInfo = {}) {
    if (payload == null) return null
    const geoType = normalizeGeometryType(payload.__geo)
    const data = payload.data
    if (geoType == null) return null

    const color = displayInfo.color != null ? displayInfo.color : 0xcccccc
    const edgesColor = displayInfo.edgesColor != null ? displayInfo.edgesColor : 0x888888

    const group = new THREE.Group()
    group.name = displayInfo.nodeId ? `node_${displayInfo.nodeId}_p${displayInfo.portIndex}` : 'geometry'
    group.userData.pandauiObjectId = group.name
    group.userData.isGraphGeometry = true

    const builtParts = buildRenderParts(group, payload.renderParts, color, edgesColor, displayInfo.previewRole)
    const partsContainMesh = Array.isArray(payload.renderParts) && payload.renderParts.some(part => part?.preview?.type === 'mesh')
    const builtPreview = (!builtParts || (payload.preview?.type === 'mesh' && !partsContainMesh)) &&
      buildPreview(group, payload.preview, color, builtParts ? null : edgesColor, displayInfo.previewRole)
    if (builtParts || builtPreview) return group
    if (data == null) return null

    switch (geoType) {
      case GEOMETRY_TYPES.MESH:
      case GEOMETRY_TYPES.BREP:
      case GEOMETRY_TYPES.SUBD:
        buildMeshLike(group, data, color, edgesColor, geoType)
        break
      case GEOMETRY_TYPES.CURVE:
      case GEOMETRY_TYPES.LINE:
        buildCurveLike(group, data, color, geoType)
        break
      case GEOMETRY_TYPES.POLYLINE:
        if (!Array.isArray(data) || data.length < 2 || data.length > 4096 || !data.every(point => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite))) return null
        buildPreview(group, { type: 'polyline', positions: data.flat() }, color, null, displayInfo.previewRole)
        break
      case GEOMETRY_TYPES.POINT:
        buildPoint(group, data, color)
        break
      case GEOMETRY_TYPES.VECTOR:
        buildVector(group, data, color)
        break
      case GEOMETRY_TYPES.PLANE:
        buildPlane(group, data, color)
        break
      case GEOMETRY_TYPES.BOX:
        buildBox(group, data, color)
        break
      case GEOMETRY_TYPES.CIRCLE:
        buildCircle(group, data, color)
        break
      case GEOMETRY_TYPES.ARC:
        buildArc(group, data, color)
        break
      case GEOMETRY_TYPES.RECTANGLE:
        buildRectangle(group, data, color)
        break
      case GEOMETRY_TYPES.TRANSFORM:
      case GEOMETRY_TYPES.MATRIX:
        buildAxes(group, data, color)
        break
      case GEOMETRY_TYPES.SURFACE:
        buildSurface(group, data, color)
        break
      case GEOMETRY_TYPES.MESHFACE:
        buildMeshFace(group, data, color, edgesColor)
        break
      case GEOMETRY_TYPES.OTHER:
        try { buildMeshLike(group, data, color, edgesColor, geoType) }
        catch (e) { console.warn('Generic geometry display failed:', e) }
        break
      default:
        console.warn('Unknown geometry type:', geoType)
        return null
    }

    return group
  }

  static get supportedTypes () {
    return Object.values(GEOMETRY_TYPES)
  }
}

// ========== 构建函数 ==========

function buildRenderParts (group, parts, color, edgesColor, previewRole) {
  if (!Array.isArray(parts) || parts.length === 0) return false
  let built = false
  parts.forEach(part => {
    if (part == null || part.preview == null) return
    const start = group.children.length
    const partColor = part.role === 'edge' ? edgesColor : color
    if (!buildPreview(group, part.preview, partColor, null, previewRole || (part.role === 'edge' ? 'wire' : 'mesh'))) return
    group.children.slice(start).forEach(object => { object.userData.selectionRole = part.role || 'surface' })
    built = true
  })
  return built
}

export function createPreviewMesh (geometry, color) {
  const shadingColor = new THREE.Color(color)
  const shadingMaterial = new THREE.MeshPhongMaterial({ color: shadingColor, emissive: shadingColor.clone().multiplyScalar(0.045), specular: new THREE.Color(0x8a949c), shininess: 42, toneMapped: false, side: THREE.DoubleSide })
  const renderMaterial = new THREE.MeshPhysicalMaterial({ color: shadingColor, metalness: 0.08, roughness: 0.48, clearcoat: 0.08, clearcoatRoughness: 0.28, reflectivity: 0.5, side: THREE.DoubleSide })
  const mesh = new THREE.Mesh(geometry, shadingMaterial)
  mesh.onBeforeRender = renderPreviewSurfaceDepth
  mesh.userData.displayMaterials = { shading: shadingMaterial, render: renderMaterial }
  return mesh
}

function buildPreview (group, preview, color, edgesColor, previewRole) {
  if (preview == null || typeof preview !== 'object') return false
  const positions = Array.isArray(preview.positions) || ArrayBuffer.isView(preview.positions) ? preview.positions : []
  if (preview.type === 'mesh' && positions.length >= 9) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    if ((Array.isArray(preview.indices) || ArrayBuffer.isView(preview.indices)) && preview.indices.length > 0) {
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(preview.indices), 1))
    }
    if ((Array.isArray(preview.normals) || ArrayBuffer.isView(preview.normals)) && preview.normals.length === positions.length) {
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(preview.normals), 3))
    } else geometry.computeVertexNormals()
    if (previewRole === 'wire') {
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color, toneMapped: false })))
      return true
    }
    const mesh = createPreviewMesh(geometry, color)
    group.add(mesh)
    if (previewRole == null && edgesColor != null) group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: edgesColor })))
    return true
  }
  if ((preview.type === 'polyline' || preview.type === 'lineSegments' || preview.type === 'points') && positions.length >= 3) {
    if (previewRole === 'mesh') return false
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    if (preview.type === 'points') group.add(new THREE.Points(geometry, createPointMaterial({ color })))
    else if (preview.type === 'lineSegments') group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, toneMapped: false })))
    else group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color })))
    return true
  }
  return false
}

function buildMeshLike (group, base64, color, edgesColor, geoType) {
  if (typeof Rhino3d !== 'undefined' && Rhino3d.fromBase64) {
    try {
      const rhinoMesh = Rhino3d.fromBase64(base64)
      if (rhinoMesh && rhinoMesh.toThreeJs) {
        const threeMesh = rhinoMesh.toThreeJs()
        group.add(threeMesh)
        return
      }
    } catch (e) {
      console.warn('[RhinoConverter] Rhino3d mesh conversion failed, using placeholder')
    }
  }

  // Placeholder
  const placeholder = createPlaceholderMesh(geoType, color)
  group.add(placeholder)

  const box = new THREE.Box3().setFromObject(placeholder)
  const size = new THREE.Vector3().subVectors(box.max, box.min)
  if (size.x > 0.001 && size.y > 0.001 && size.z > 0.001) {
    const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z))
    const edges = new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: edgesColor }))
    edges.position.copy(box.getCenter(new THREE.Vector3()))
    group.add(edges)
  }
}

function buildCurveLike (group, base64, color, geoType) {
  if (typeof Rhino3d !== 'undefined' && Rhino3d.fromBase64) {
    try {
      const rhinoCurve = Rhino3d.fromBase64(base64)
      if (rhinoCurve) {
        const points = rhinoCurve.toThreeJs ? rhinoCurve.toThreeJs() : sampleCurve(rhinoCurve)
        if (points && points.length > 1) {
          group.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color })
          ))
          return
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (geoType === GEOMETRY_TYPES.LINE) {
    group.add(new THREE.Line(

      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)]),
      new THREE.LineBasicMaterial({ color })
    ))
  } else {
    const pts = []
    for (let i = 0; i <= 64; i++) {
      const t = (i / 64) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0))
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
  }
}

function buildPoint (group, data, color) {
  const arr = Array.isArray(data) ? data : [0, 0, 0]
  const px = Number(arr[0]) || 0
  const py = Number(arr[1]) || 0
  const pz = Number(arr[2]) || 0
  console.log('[RhinoConverter] buildPoint at', px, py, pz, 'color=' + color.toString(16))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([px, py, pz], 3))
  // Use sizeAttenuation: false so the point is always visible regardless of distance
  const material = createPointMaterial({ color })
  const points = new THREE.Points(geometry, material)
  points.renderOrder = 100
  group.add(points)
  console.log('[RhinoConverter] buildPoint added to group, group children:', group.children.length)
}

function buildVector (group, data, color) {
  const arr = Array.isArray(data) ? data : [0, 0, 0]
  const direction = new THREE.Vector3(arr[0] || 0, arr[1] || 0, arr[2] || 0)
  const length = direction.length()
  if (length > 0.001) {
    const arrow = new THREE.ArrowHelper(direction.normalize(), new THREE.Vector3(0, 0, 0), length, color, length * 0.2, length * 0.1)
    group.add(arrow)
  } else {
    buildPoint(group, [0, 0, 0], color)
  }
}

function buildPlane (group, data, color) {
  const arr = (Array.isArray(data) || ArrayBuffer.isView(data)) && data.length >= 9 ? data : [0, 0, 0, 1, 0, 0, 0, 1, 0]
  const origin = new THREE.Vector3(arr[0], arr[1], arr[2])
  const xAxis = new THREE.Vector3(arr[3], arr[4], arr[5])
  const yAxis = new THREE.Vector3(arr[6], arr[7], arr[8])
  const zAxis = arr.length >= 12 ? new THREE.Vector3(arr[9], arr[10], arr[11]) : new THREE.Vector3().crossVectors(xAxis, yAxis).normalize()

  const planeGeo = new THREE.PlaneBufferGeometry(10, 10)
  const planeMat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
  const plane = new THREE.Mesh(planeGeo, planeMat)
  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis).setPosition(origin)
  plane.applyMatrix4(matrix)
  group.add(plane)
  const axes = new THREE.AxesHelper(3)
  axes.applyMatrix4(matrix)
  group.add(axes)
}

function buildBox (group, data, color) {
  const arr = Array.isArray(data) && data.length >= 6 ? data : [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]
  const min = new THREE.Vector3(arr[0], arr[1], arr[2])
  const max = new THREE.Vector3(arr[3], arr[4], arr[5])
  const center = min.clone().add(max).multiplyScalar(0.5)
  const size = max.clone().sub(min)
  const geometry = new THREE.BoxBufferGeometry(Math.max(0.01, size.x), Math.max(0.01, size.y), Math.max(0.01, size.z))
  const material = new THREE.MeshBasicMaterial({ color, wireframe: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.copy(center)
  group.add(mesh)
}

function buildCircle (group, data, color) {
  if (typeof data === 'string' && typeof Rhino3d !== 'undefined' && Rhino3d.fromBase64) {
    try {
      const rhinoCircle = Rhino3d.fromBase64(data)
      if (rhinoCircle) {
        const pts = rhinoCircle.toThreeJs ? rhinoCircle.toThreeJs() : sampleCircle(rhinoCircle)
        if (pts && pts.length > 1) {
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
          return
        }
      }
    } catch (e) { /* ignore */ }
  }
  if ((Array.isArray(data) || ArrayBuffer.isView(data)) && data.length >= 10) {
    const origin = new THREE.Vector3(Number(data[0]), Number(data[1]), Number(data[2]))
    const xAxis = new THREE.Vector3(Number(data[3]), Number(data[4]), Number(data[5]))
    const yAxis = new THREE.Vector3(Number(data[6]), Number(data[7]), Number(data[8]))
    const radius = Math.abs(Number(data[9]))
    if ([origin.x, origin.y, origin.z, xAxis.x, xAxis.y, xAxis.z, yAxis.x, yAxis.y, yAxis.z, radius].every(Number.isFinite) && radius > 0) {
      const pts = []
      for (let i = 0; i <= 96; i++) {
        const angle = (i / 96) * Math.PI * 2
        pts.push(origin.clone().addScaledVector(xAxis, Math.cos(angle) * radius).addScaledVector(yAxis, Math.sin(angle) * radius))
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
      return
    }
  }
  const pts = []
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0))
  }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
}

function buildArc (group, data, color) {
  if (typeof data === 'string' && typeof Rhino3d !== 'undefined' && Rhino3d.fromBase64) {
    try {
      const rhinoArc = Rhino3d.fromBase64(data)
      if (rhinoArc) {
        const pts = rhinoArc.toThreeJs ? rhinoArc.toThreeJs() : sampleCurve(rhinoArc)
        if (pts && pts.length > 1) {
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
          return
        }
      }
    } catch (e) { /* ignore */ }
  }
  if ((Array.isArray(data) || ArrayBuffer.isView(data)) && data.length >= 12) {
    const origin = new THREE.Vector3(Number(data[0]), Number(data[1]), Number(data[2]))
    const xAxis = new THREE.Vector3(Number(data[3]), Number(data[4]), Number(data[5]))
    const yAxis = new THREE.Vector3(Number(data[6]), Number(data[7]), Number(data[8]))
    const radius = Math.abs(Number(data[9]))
    const startAngle = Number(data[10])
    const endAngle = Number(data[11])
    if ([origin.x, origin.y, origin.z, xAxis.x, xAxis.y, xAxis.z, yAxis.x, yAxis.y, yAxis.z, radius, startAngle, endAngle].every(Number.isFinite) && radius > 0) {
      const span = endAngle - startAngle
      const segmentCount = Math.max(8, Math.ceil(Math.abs(span) / (Math.PI * 2) * 96))
      const pts = []
      for (let i = 0; i <= segmentCount; i++) {
        const angle = startAngle + (i / segmentCount) * span
        pts.push(origin.clone().addScaledVector(xAxis, Math.cos(angle) * radius).addScaledVector(yAxis, Math.sin(angle) * radius))
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
      return
    }
  }
  const pts = []
  for (let i = 0; i <= 48; i++) {
    const t = Math.PI + (i / 48) * Math.PI
    pts.push(new THREE.Vector3(Math.cos(t), Math.sin(t), 0))
  }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
}

function buildRectangle (group, data, color) {
  if (typeof data === 'string' && typeof Rhino3d !== 'undefined' && Rhino3d.fromBase64) {
    try {
      const rhinoRect = Rhino3d.fromBase64(data)
      if (rhinoRect && rhinoRect.toThreeJs) {
        const pts = rhinoRect.toThreeJs()
        if (pts && pts.length > 1) {
          group.add(new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]),
            new THREE.LineBasicMaterial({ color })
          ))
          return
        }
      }
    } catch (e) { /* ignore */ }
  }
  const s = 1
  const pts = [new THREE.Vector3(-s, -s, 0), new THREE.Vector3(s, -s, 0), new THREE.Vector3(s, s, 0), new THREE.Vector3(-s, s, 0), new THREE.Vector3(-s, -s, 0)]
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })))
}

function buildAxes (group, data, color) {
  const length = typeof data === 'object' && data !== null ? 3 : 1
  group.add(new THREE.AxesHelper(length))
}

function buildSurface (group, data, color) {

  if (typeof data === 'string' && typeof Rhino3d !== 'undefined' && Rhino3d.fromBase64) {
    try {
      const rhinoSurface = Rhino3d.fromBase64(data)
      if (rhinoSurface && rhinoSurface.toThreeJs) {
        group.add(rhinoSurface.toThreeJs())
        return
      }
    } catch (e) { /* ignore */ }
  }
  const geo = new THREE.PlaneBufferGeometry(4, 4)
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
  group.add(new THREE.Mesh(geo, mat))
}

function buildMeshFace (group, base64, color, edgesColor) {
  // MeshFace is a single face of a mesh — display as a small mesh with edges
  if (typeof Rhino3d !== 'undefined' && Rhino3d.fromBase64) {
    try {
      const rhinoMf = Rhino3d.fromBase64(base64)
      if (rhinoMf && rhinoMf.toThreeJs) {
        const threeObj = rhinoMf.toThreeJs()
        group.add(threeObj)
        return
      }
    } catch (e) { /* ignore */ }
  }
  // Placeholder: a small triangle
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0
  ], 3))
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide })
  group.add(new THREE.Mesh(geo, mat))
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: edgesColor || 0x888888 })
  )
  group.add(edges)
}

function createPlaceholderMesh (geoType, color) {
  let geo
  if (geoType === GEOMETRY_TYPES.BREP) geo = new THREE.BoxBufferGeometry(1, 1, 1)
  else if (geoType === GEOMETRY_TYPES.SUBD) geo = new THREE.IcosahedronBufferGeometry(0.5)
  else geo = new THREE.BoxBufferGeometry(1, 1, 1)
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.8 })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData.isPlaceholder = true
  return mesh
}

function sampleCurve (rhinoCurve) {
  if (!rhinoCurve) return null
  const points = []
  try {
    const domain = rhinoCurve.Domain || { min: 0, max: 1 }
    const steps = 64
    for (let i = 0; i <= steps; i++) {
      const t = domain.min + (i / steps) * (domain.max - domain.min)
      const pt = rhinoCurve.PointAt ? rhinoCurve.PointAt(t) : null
      if (pt) points.push(new THREE.Vector3(pt.x || pt.X || 0, pt.y || pt.Y || 0, pt.z || pt.Z || 0))
    }
  } catch (e) { /* ignore */ }
  return points.length > 0 ? points : null
}

function sampleCircle (rhinoCircle) {
  if (!rhinoCircle || !rhinoCircle.Center) return null
  const c = rhinoCircle.Center
  const r = rhinoCircle.Radius || 1
  const points = []
  const steps = 96
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2
    points.push(new THREE.Vector3(
      (c.x || c.X || 0) + Math.cos(t) * r,
      (c.y || c.Y || 0) + Math.sin(t) * r,
      (c.z || c.Z || 0)
    ))
  }
  return points
}
