import * as THREE from 'three'
import { viewportControlWorldSize } from './modeling/ViewportControlSize'

const SECTION_EPSILON = 1e-7
const SECTION_KEY_SCALE = 1e6

function pointKey (point) {
  return `${Math.round(point.x * SECTION_KEY_SCALE)},${Math.round(point.y * SECTION_KEY_SCALE)},${Math.round(point.z * SECTION_KEY_SCALE)}`
}

function addUniquePoint (points, point) {
  const key = pointKey(point)
  if (!points.some(candidate => candidate.key === key)) points.push({ key, point: point.clone() })
}

function triangleSection (points, plane) {
  const distances = points.map(point => plane.distanceToPoint(point))
  const intersections = []
  for (let index = 0; index < 3; index++) {
    const next = (index + 1) % 3
    const firstDistance = distances[index]
    const secondDistance = distances[next]
    const first = points[index]
    const second = points[next]
    if (Math.abs(firstDistance) <= SECTION_EPSILON) addUniquePoint(intersections, first)
    if (firstDistance * secondDistance < -SECTION_EPSILON * SECTION_EPSILON) {
      const amount = firstDistance / (firstDistance - secondDistance)
      addUniquePoint(intersections, first.clone().lerp(second, amount))
    }
  }
  if (intersections.length < 2) return null
  if (intersections.length === 2) return intersections
  let longest = null
  let longestDistance = -1
  for (let first = 0; first < intersections.length - 1; first++) {
    for (let second = first + 1; second < intersections.length; second++) {
      const distance = intersections[first].point.distanceToSquared(intersections[second].point)
      if (distance > longestDistance) {
        longestDistance = distance
        longest = [intersections[first], intersections[second]]
      }
    }
  }
  return longest
}

function signedArea (points) {
  let area = 0
  for (let index = 0; index < points.length; index++) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    area += current.x * next.y - next.x * current.y
  }
  return area * 0.5
}

function pointInPolygon (point, polygon) {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const current = polygon[index]
    const last = polygon[previous]
    const crosses = (current.y > point.y) !== (last.y > point.y) && point.x < (last.x - current.x) * (point.y - current.y) / (last.y - current.y) + current.x
    if (crosses) inside = !inside
  }
  return inside
}

function sectionLoops (segments, planeData) {
  const adjacency = new Map()
  const pointsByKey = new Map()
  const addEdge = (key, edgeIndex) => {
    let edges = adjacency.get(key)
    if (!edges) { edges = []; adjacency.set(key, edges) }
    edges.push(edgeIndex)
  }
  segments.forEach((segment, index) => {
    pointsByKey.set(segment.first.key, segment.first.point)
    pointsByKey.set(segment.second.key, segment.second.point)
    addEdge(segment.first.key, index)
    addEdge(segment.second.key, index)
  })
  const used = new Set()
  const loops = []
  for (let startEdge = 0; startEdge < segments.length; startEdge++) {
    if (used.has(startEdge)) continue
    const start = segments[startEdge]
    const keys = [start.first.key, start.second.key]
    used.add(startEdge)
    let current = start.second.key
    while (current !== keys[0]) {
      const nextEdge = (adjacency.get(current) || []).find(index => !used.has(index))
      if (nextEdge == null) break
      used.add(nextEdge)
      const edge = segments[nextEdge]
      current = edge.first.key === current ? edge.second.key : edge.first.key
      keys.push(current)
      if (keys.length > segments.length + 2) break
    }
    if (current !== keys[0] || keys.length <= 3) continue
    const points = keys.slice(0, -1).map(key => pointsByKey.get(key))
    const projected = points.map(point => {
      const relative = point.clone().sub(planeData.origin)
      return new THREE.Vector2(relative.dot(planeData.xAxis), relative.dot(planeData.yAxis))
    })
    const area = signedArea(projected)
    if (Math.abs(area) > SECTION_EPSILON) loops.push({ points, projected, area })
  }
  return loops
}

function objectIsVisible (object) {
  for (let current = object; current; current = current.parent) if (!current.visible) return false
  return true
}

function vector (value) {
  const components = Array.isArray(value) ? value : [value?.x ?? value?.X, value?.y ?? value?.Y, value?.z ?? value?.Z]
  return components.length >= 3 && components.slice(0, 3).every(component => typeof component === 'number' && Number.isFinite(component)) ? new THREE.Vector3(...components.slice(0, 3)) : null
}

export function readClippingPlane (value) {
  const data = value?.data ?? value
  const origin = vector(Array.isArray(data) ? data.slice(0, 3) : data?.origin ?? data?.Origin)
  const xAxis = vector(Array.isArray(data) ? data.slice(3, 6) : data?.xAxis ?? data?.XAxis)
  const yAxis = vector(Array.isArray(data) ? data.slice(6, 9) : data?.yAxis ?? data?.YAxis)
  if (!origin || !xAxis || !yAxis || xAxis.lengthSq() < 1e-20 || yAxis.lengthSq() < 1e-20) return null
  xAxis.normalize()
  yAxis.normalize()
  const normal = new THREE.Vector3().crossVectors(xAxis, yAxis)
  if (normal.lengthSq() < 1e-16) return null
  normal.normalize()
  yAxis.crossVectors(normal, xAxis).normalize()
  return { origin, xAxis, yAxis, normal }
}

export default class ClippingPlaneDisplay {
  constructor () {
    this.scene = new THREE.Scene()
    this.entries = new Map()
    this.planes = []
    this.outlineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, -0.5, 0), new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0), new THREE.Vector3(-0.5, 0.5, 0)
    ])
    this.fillGeometry = new THREE.PlaneBufferGeometry(1, 1)
    this.arrowGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(), new THREE.Vector3(0, 0, 0.8),
      new THREE.Vector3(0, 0, 0.8), new THREE.Vector3(0.09, 0, 0.63),
      new THREE.Vector3(0, 0, 0.8), new THREE.Vector3(-0.09, 0, 0.63),
      new THREE.Vector3(0, 0, 0.8), new THREE.Vector3(0, 0.09, 0.63),
      new THREE.Vector3(0, 0, 0.8), new THREE.Vector3(0, -0.09, 0.63)
    ])
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x31d5ee, depthTest: false, depthWrite: false, toneMapped: false })
    this.fillMaterial = new THREE.MeshBasicMaterial({ color: 0x31d5ee, opacity: 0.12, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false })
    this.sectionLineMaterial = new THREE.LineBasicMaterial({ color: 0xff9f43, depthTest: false, depthWrite: false, toneMapped: false })
    this.sectionFillMaterial = new THREE.MeshBasicMaterial({ color: 0xff9f43, opacity: 0.38, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false })
  }

  getTransformTarget (object) {
    for (let current = object; current; current = current.parent) {
      if (current.userData?.clippingPlane === true && this.entries.get(String(current.userData.clippingPlaneId))?.helper === current) return current
    }
    return null
  }

  createSceneObjectMarker (object) {
    const target = this.getTransformTarget(object)
    if (!target) return null
    const clippingPlaneId = String(target.userData.clippingPlaneId)
    return {
      __pandauiSceneObject: true,
      source: 'clipping-plane',
      id: clippingPlaneId,
      clippingPlaneId,
      name: 'Clipping Plane',
      objectType: 'ClippingPlane',
      clippingPlaneState: this.captureTransformState(clippingPlaneId)
    }
  }

  captureTransformState (id) {
    const entry = this.entries.get(String(id))
    if (!entry) return null
    const data = entry.planeData
    return {
      clippingPlaneId: String(id),
      plane: [
        data.origin.x, data.origin.y, data.origin.z,
        data.xAxis.x, data.xAxis.y, data.xAxis.z,
        data.yAxis.x, data.yAxis.y, data.yAxis.z
      ]
    }
  }

  applyTransformState (state) {
    const entry = this.entries.get(String(state?.clippingPlaneId))
    const data = readClippingPlane(state?.plane)
    if (!entry || !data) return false
    entry.planeData = { origin: data.origin.clone(), xAxis: data.xAxis.clone(), yAxis: data.yAxis.clone(), normal: data.normal.clone() }
    entry.plane.setFromNormalAndCoplanarPoint(data.normal, data.origin)
    entry.helper.position.copy(data.origin)
    entry.helper.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(data.xAxis, data.yAxis, data.normal))
    entry.sectionDirty = true
    this.refresh()
    return true
  }

  syncObjectTransform (object) {
    const helper = this.getTransformTarget(object)
    if (!helper) return false
    const entry = this.entries.get(String(helper.userData.clippingPlaneId))
    if (!entry) return false
    helper.updateWorldMatrix(true, false)
    const origin = new THREE.Vector3().setFromMatrixPosition(helper.matrixWorld)
    const xAxis = new THREE.Vector3().setFromMatrixColumn(helper.matrixWorld, 0).normalize()
    const yAxis = new THREE.Vector3().setFromMatrixColumn(helper.matrixWorld, 1).normalize()
    const normal = new THREE.Vector3().crossVectors(xAxis, yAxis)
    if (normal.lengthSq() < 1e-16) return false
    normal.normalize()
    yAxis.crossVectors(normal, xAxis).normalize()
    entry.planeData = { origin, xAxis, yAxis, normal }
    entry.plane.setFromNormalAndCoplanarPoint(normal, origin)
    entry.sectionDirty = true
    this.refresh()
    return true
  }

  disposeSectionGeometry (entry) {
    entry.sectionLines?.geometry?.dispose()
    entry.sectionFill?.geometry?.dispose()
    entry.sectionLines = null
    entry.sectionFill = null
    while (entry.sectionGroup.children.length) entry.sectionGroup.remove(entry.sectionGroup.children[0])
  }

  rebuildSection (entry, scenes) {
    this.disposeSectionGeometry(entry)
    if (!entry.enabled || !entry.previewVisible || (!entry.showSection && !entry.fillSection)) return
    const segments = []
    const segmentKeys = new Set()
    const addSegment = (first, second) => {
      if (!first || !second || first.key === second.key) return
      const key = first.key < second.key ? `${first.key}|${second.key}` : `${second.key}|${first.key}`
      if (segmentKeys.has(key)) return
      segmentKeys.add(key)
      segments.push({ first, second })
    }
    for (const scene of scenes || []) {
      if (!scene) continue
      scene.updateMatrixWorld(true)
      scene.traverse(object => {
        if (!objectIsVisible(object) || !object.isMesh || object.userData?.clippingHelper || object.userData?.clippingSection) return
        const position = object.geometry?.getAttribute?.('position')
        if (!position || position.count < 3) return
        const index = object.geometry.getIndex?.()
        const matrix = object.matrixWorld
        const readPoint = vertexIndex => new THREE.Vector3().fromBufferAttribute(position, vertexIndex).applyMatrix4(matrix)
        const triangleCount = index ? Math.floor(index.count / 3) : Math.floor(position.count / 3)
        for (let triangle = 0; triangle < triangleCount; triangle++) {
          const offset = triangle * 3
          const points = [readPoint(index ? index.getX(offset) : offset), readPoint(index ? index.getX(offset + 1) : offset + 1), readPoint(index ? index.getX(offset + 2) : offset + 2)]
          const section = triangleSection(points, entry.plane)
          if (section) addSegment(section[0], section[1])
        }
      })
    }
    if (!segments.length) return
    const linePositions = []
    segments.forEach(segment => linePositions.push(segment.first.point, segment.second.point))
    if (entry.showSection) {
      const geometry = new THREE.BufferGeometry().setFromPoints(linePositions)
      entry.sectionLines = new THREE.LineSegments(geometry, this.sectionLineMaterial)
      entry.sectionLines.name = 'Clipping section lines'
      entry.sectionLines.userData.clippingSection = true
      entry.sectionLines.userData.nonselectable = true
      entry.sectionLines.raycast = () => {}
      entry.sectionLines.renderOrder = 2492
      entry.sectionGroup.add(entry.sectionLines)
    }
    if (!entry.fillSection) return
    const loops = sectionLoops(segments, entry.planeData)
    if (!loops.length) return
    const projectedLoops = loops.map(loop => ({ ...loop, parent: null, depth: 0 }))
    projectedLoops.forEach((loop, index) => {
      let parent = null
      for (let candidate = 0; candidate < projectedLoops.length; candidate++) {
        if (candidate === index || Math.abs(projectedLoops[candidate].area) <= Math.abs(loop.area) || !pointInPolygon(loop.projected[0], projectedLoops[candidate].projected)) continue
        if (parent == null || Math.abs(projectedLoops[candidate].area) < Math.abs(projectedLoops[parent].area)) parent = candidate
      }
      loop.parent = parent
      loop.depth = parent == null ? 0 : projectedLoops[parent].depth + 1
    })
    const fillPositions = []
    projectedLoops.forEach((outer, outerIndex) => {
      if (outer.depth % 2 !== 0) return
      const holes = projectedLoops.filter(loop => loop.depth === outer.depth + 1 && loop.parent === outerIndex).map(loop => loop.projected)
      THREE.ShapeUtils.triangulateShape(outer.projected, holes).forEach(triangle => {
        triangle.forEach(point => {
          const position = entry.planeData.origin.clone().addScaledVector(entry.planeData.xAxis, point.x).addScaledVector(entry.planeData.yAxis, point.y)
          fillPositions.push(position.x, position.y, position.z)
        })
      })
    })
    if (!fillPositions.length) return
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3))
    const normals = new Float32Array(fillPositions.length)
    for (let offset = 0; offset < normals.length; offset += 3) normals.set([entry.planeData.normal.x, entry.planeData.normal.y, entry.planeData.normal.z], offset)
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    entry.sectionFill = new THREE.Mesh(geometry, this.sectionFillMaterial)
    entry.sectionFill.name = 'Filled clipping section'
    entry.sectionFill.userData.clippingSection = true
    entry.sectionFill.userData.nonselectable = true
    entry.sectionFill.raycast = () => {}
    entry.sectionFill.renderOrder = 2491
    entry.sectionGroup.add(entry.sectionFill)
  }

  set (id, descriptor) {
    const key = String(id)
    const data = readClippingPlane(descriptor?.plane)
    if (!data) { this.remove(key); return false }
    let entry = this.entries.get(key)
    if (!entry) {
      const helper = new THREE.Group()
      helper.name = 'Clipping Plane'
      helper.userData.clippingPlaneId = key
      helper.userData.clippingPlane = true
      helper.add(new THREE.Mesh(this.fillGeometry, this.fillMaterial), new THREE.LineLoop(this.outlineGeometry, this.lineMaterial), new THREE.LineSegments(this.arrowGeometry, this.lineMaterial))
      helper.traverse(object => {
        object.userData.clippingHelper = true
        object.userData.clippingPlaneId = key
        object.renderOrder = object.isMesh ? 2490 : 2491
      })
      helper.children[0].userData.clippingPlaneSurface = true
      const sectionGroup = new THREE.Group()
      sectionGroup.name = 'Clipping sections'
      sectionGroup.userData.clippingSection = true
      sectionGroup.userData.nonselectable = true
      sectionGroup.raycast = () => {}
      entry = { helper, sectionGroup, plane: new THREE.Plane(), planeData: data, previewVisible: true, sectionRevision: -1, sectionDirty: true, sectionLines: null, sectionFill: null }
      this.entries.set(key, entry)
      this.scene.add(helper)
      this.scene.add(sectionGroup)
    }
    entry.enabled = descriptor.enabled !== false
    entry.showHelper = descriptor.showHelper !== false
    entry.showSection = descriptor.showSection !== false
    entry.fillSection = descriptor.fillSection === true
    entry.planeData = { ...data, origin: data.origin.clone(), xAxis: data.xAxis.clone(), yAxis: data.yAxis.clone(), normal: data.normal.clone() }
    const normal = data.normal.clone().multiplyScalar(descriptor.flipped ? -1 : 1)
    entry.plane.setFromNormalAndCoplanarPoint(normal, data.origin)
    entry.helper.position.copy(data.origin)
    entry.helper.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(data.xAxis, data.yAxis.clone().multiplyScalar(descriptor.flipped ? -1 : 1), normal))
    entry.planeData.yAxis.multiplyScalar(descriptor.flipped ? -1 : 1)
    entry.planeData.normal = normal
    entry.sectionDirty = true
    this.refresh()
    return true
  }

  setPreviewVisible (id, visible) {
    const entry = this.entries.get(String(id))
    if (entry) { entry.previewVisible = visible !== false; this.refresh() }
  }

  refresh () {
    this.planes = []
    this.entries.forEach(entry => {
      if (entry.enabled) this.planes.push(entry.plane)
      entry.helper.visible = entry.enabled && entry.showHelper && entry.previewVisible
      entry.sectionGroup.visible = entry.enabled && entry.previewVisible && (entry.showSection || entry.fillSection)
      if (entry.sectionLines) entry.sectionLines.visible = entry.showSection
      if (entry.sectionFill) entry.sectionFill.visible = entry.fillSection
    })
  }

  remove (id) {
    const entry = this.entries.get(String(id))
    if (!entry) return false
    this.scene.remove(entry.helper)
    this.scene.remove(entry.sectionGroup)
    this.disposeSectionGeometry(entry)
    this.entries.delete(String(id))
    this.refresh()
    return true
  }

  update (camera, width, height, scenes = [], sceneRevision = 0) {
    this.entries.forEach(entry => {
      if (entry.helper.visible) entry.helper.scale.setScalar(viewportControlWorldSize(camera, entry.helper.position, width, height))
      if (entry.sectionDirty || entry.sectionRevision !== sceneRevision) {
        this.rebuildSection(entry, scenes)
        entry.sectionRevision = sceneRevision
        entry.sectionDirty = false
        this.refresh()
      }
    })
  }

  dispose () {
    Array.from(this.entries.keys()).forEach(id => this.remove(id))
    this.outlineGeometry.dispose()
    this.fillGeometry.dispose()
    this.arrowGeometry.dispose()
    this.lineMaterial.dispose()
    this.fillMaterial.dispose()
    this.sectionLineMaterial.dispose()
    this.sectionFillMaterial.dispose()
  }
}
