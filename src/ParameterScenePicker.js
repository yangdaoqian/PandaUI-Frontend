import * as THREE from 'three'
import { rangeAtIntersection } from './BrepDisplayRanges'
import { normalizeGeometryType } from './RhinoGeometryConverter'

export function scenePickAccessError (object) {
  for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
    const data = ancestor.userData
    const shared = data?.sharedObject || data?.sharedDocument
    if (shared?.canReference === false) {
      return shared.publicationState === 'draft'
        ? (shared.ownerUsername ? 'Private geometry owned by ' + shared.ownerUsername + '. Sign in as this account or ask the owner to publish it.' : 'This is another account\u2019s unpublished draft. Its owner must publish it before you can use it as a node input.')
        : 'You do not have permission to read this source geometry.'
    }
    if (data?.readOnly && shared?.canReference !== true) return 'This object is read-only and is not available as a node input.'
  }
  return ''
}

function sourceGeometryError (message) {
  if (/stale_geometry_reference|geometry_document_not_found|geometry_object_not_found|geometry_reference_not_found/.test(message)) return 'Source geometry is no longer loaded in the backend. Reopen the original model; cached display meshes cannot be used as a Brep.'
  if (/stale_geometry_revision/.test(message)) return 'Source geometry changed. Refresh the document and pick it again.'
  return message
}

export function drawingValue (type, points, plane) {
  const last = points[points.length - 1]
  if (type === 'point' && last) return { __geo: 'panda.point', data: last }
  if (type === 'curve' && points.length >= 2) return { __geo: 'panda.polyline', data: points.slice() }
  if (points.length < 2 || new THREE.Vector3(...points[0]).distanceTo(new THREE.Vector3(...last)) < 1e-8) return null
  if (type === 'line') return { __geo: 'panda.line', data: points[0].concat(last) }
  if (type === 'circle') {
    const axes = plane === 'XZ' ? [1, 0, 0, 0, 0, 1] : plane === 'YZ' ? [0, 1, 0, 0, 0, 1] : [1, 0, 0, 0, 1, 0]
    return { __geo: 'panda.circle', data: points[0].concat(axes, new THREE.Vector3(...points[0]).distanceTo(new THREE.Vector3(...last))) }
  }
  return null
}

function pickInlineValue (source, packets, point, type) {
  let nearest = null
  let distance = Infinity
  const matrix = source.matrixWorld
  const closest = new THREE.Vector3()
  for (const packet of packets) {
    if (!packet || !Array.isArray(packet.data)) continue
    const geoType = normalizeGeometryType(packet.__geo)
    if (type !== 'geometry' && geoType !== 'panda.' + type && !(type === 'curve' && ['panda.line', 'panda.circle', 'panda.polyline'].includes(geoType))) continue
    let value = null
    let current = Infinity
    if (geoType === 'panda.line' || geoType === 'panda.polyline') {
      const points = (geoType === 'panda.line' ? [packet.data.slice(0, 3), packet.data.slice(3, 6)] : packet.data).map(coordinates => new THREE.Vector3(...coordinates).applyMatrix4(matrix))
      for (let index = 1; index < points.length; index++) {
        new THREE.Line3(points[index - 1], points[index]).closestPointToPoint(point, true, closest)
        current = Math.min(current, point.distanceToSquared(closest))
      }
      value = { __geo: geoType, data: geoType === 'panda.line' ? points.flatMap(point => point.toArray()) : points.map(point => point.toArray()) }
    } else if (geoType === 'panda.circle' && packet.data.length === 10) {
      const center = new THREE.Vector3(...packet.data.slice(0, 3)).applyMatrix4(matrix)
      const axes = new THREE.Matrix3().setFromMatrix4(matrix)
      const xaxis = new THREE.Vector3(...packet.data.slice(3, 6)).applyMatrix3(axes)
      const yaxis = new THREE.Vector3(...packet.data.slice(6, 9)).applyMatrix3(axes)
      const scale = xaxis.length()
      if (scale < 1e-12 || Math.abs(scale - yaxis.length()) > scale * 1e-8) continue
      xaxis.normalize(); yaxis.normalize()
      if (Math.abs(xaxis.dot(yaxis)) > 1e-8) continue
      const delta = point.clone().sub(center)
      const radius = packet.data[9] * scale
      current = (Math.hypot(delta.dot(xaxis), delta.dot(yaxis)) - radius) ** 2 + delta.dot(xaxis.clone().cross(yaxis)) ** 2
      value = { __geo: 'panda.circle', data: center.toArray().concat(xaxis.toArray(), yaxis.toArray(), radius) }
    }
    if (value && current < distance) { distance = current; nearest = value }
  }
  return nearest
}

export function scenePickValue (pipeline, hit, type) {
  const object = hit.object
  if (!pipeline.isSelectable(object) || object.userData?.parameterPickPreview) return null
  if (scenePickAccessError(object)) return null
  if (type === 'scene-object') return pipeline.createSceneObjectMarker(pipeline.getTransformTarget(object))
  for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
    if (ancestor.userData?.parameterPickAmbiguous) return null
  }
  const marker = pipeline.createSceneObjectMarker(object)
  const target = pipeline.getTransformTarget(object)
  const targetMarker = pipeline.createSceneObjectMarker(target)
  const sceneObject = targetMarker?.sceneObject
  const geometryType = String(object.userData?.definitionObjectType || object.userData?.originalType || marker?.geometryType || '').toLowerCase()
  const isBrep = /brep|surface|extrusion/.test(geometryType)
  const isCurve = /curve|line|circle|arc/.test(geometryType)
  const isEdge = isBrep && object.isLine && !object.userData?.meshGeometryEdges
  if (type === 'mesh' && geometryType !== 'mesh') return null
  if (['brep', 'surface'].includes(type) && !isBrep) return null
  if (type === 'surface' && !object.isMesh) return null
  if (['curve', 'line', 'circle'].includes(type) && !isCurve && !isEdge) return null
  if (type === 'point') {
    if (!object.isPoints || !Number.isInteger(hit.index)) return null
    const positions = object.geometry?.getAttribute('position')
    if (!positions || hit.index >= positions.count) return null
    return { __geo: 'panda.point', data: new THREE.Vector3().fromBufferAttribute(positions, hit.index).applyMatrix4(object.matrixWorld).toArray() }
  }
  if (marker?.geometryRef) {
    const reference = { ...marker.geometryRef, sceneObject, pickType: type, pickTransform: marker.geometryRef.geometrySpace === 'world' ? new THREE.Matrix4().toArray() : object.matrixWorld.toArray() }
    const subobject = rangeAtIntersection(hit)
    if (subobject) reference.subobject = { type: subobject.type, index: subobject.index }
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
      if (ancestor.userData?.geometryId !== reference.geometryId) continue
      reference.poolGeneration = reference.poolGeneration || ancestor.userData.poolGeneration
      reference.revision = reference.revision ?? ancestor.userData.revision
    }
    if (isEdge && ['curve', 'line', 'circle'].includes(type) && !reference.subobject) {
      if (object.matrixWorld.determinant() === 0) return null
      reference.subobject = { ...reference.subobject, type: 'brepEdge', point: hit.point.clone().applyMatrix4(new THREE.Matrix4().getInverse(object.matrixWorld)).toArray() }
    } else if (type === 'brep') delete reference.subobject
    return reference
  }
  let source = object
  while (source && !source.userData?.parameterPickValue && !source.userData?.parameterPickValues) source = source.parent
  if (!source) return type === 'geometry' && sceneObject ? { kind: 'sceneReference', sceneObject, geometryType, name: target.name } : null
  const value = pickInlineValue(source, source.userData.parameterPickValues || [source.userData.parameterPickValue], hit.point, type)
  return value && sceneObject ? { ...value, sceneObject } : value
}

export default class ParameterScenePicker {
  constructor (pipeline, options, complete) {
    this.pipeline = pipeline
    this.options = options
    this.complete = complete
    this.values = []
    this.keys = new Set()
    this.points = []
    this.previewIds = []
    this.plane = 'XY'
    this.pending = Promise.resolve()
    this.abort = new AbortController()
    this.draftId = 'parameter-pick:draft'
    this.panel = document.createElement('div')
    Object.assign(this.panel.style, { position: 'fixed', top: '72px', left: '50%', transform: 'translateX(-50%)', zIndex: '10000', background: '#262b30', color: '#fff', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px', maxWidth: 'calc(100vw - 24px)', borderRadius: '4px', font: '13px Arial' })
    this.status = document.createElement('span')
    this.panel.appendChild(this.status)
    if (options.mode === 'draw') {
      const planes = document.createElement('select')
      planes.setAttribute('aria-label', 'Construction plane')
      for (const name of ['XY', 'XZ', 'YZ']) planes.add(new Option(name, name))
      planes.onchange = () => { this.plane = planes.value; this.points = []; this.pipeline.removeGraphGeometry(this.draftId) }
      this.panel.appendChild(planes)
    }
    for (const [label, cancelled] of [['Finish', false], ['Cancel', true]]) {
      const button = document.createElement('button')
      button.textContent = label
      button.onclick = () => this.finish(cancelled)
      this.panel.appendChild(button)
    }
    document.body.appendChild(this.panel)
    this.updateStatus()
  }

  updateStatus (message) {
    this.status.textContent = message || `${this.options.mode === 'draw' ? 'Draw' : 'Pick'} ${this.options.pickType}: ${this.values.length}${this.points.length ? ' (' + this.points.length + ' points)' : ''}`
  }

  point (event) {
    const point = this.pipeline.parameterPointAtPointer(event.clientX, event.clientY, this.plane)?.toArray()
    if (point && this.options.pickType === 'circle') point[this.plane === 'XY' ? 2 : this.plane === 'XZ' ? 1 : 0] = 0
    return point
  }

  showPreview (id, value) {
    const object = this.pipeline.setGraphGeometry(id, value, {})
    object?.traverse(child => { child.userData.parameterPickPreview = true; child.userData.nonselectable = true })
  }

  move (event) {
    if (this.options.mode !== 'draw' || !this.points.length) return
    this.pointer = { clientX: event.clientX, clientY: event.clientY }
    if (this.frame != null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      if (this.finished || !this.points.length) return
      const point = this.point(this.pointer)
      if (!point) return
      const value = drawingValue(this.options.pickType, this.points.concat([point]), this.plane)
      if (value) this.showPreview(this.draftId, value)
    })
  }

  click (event) {
    if (this.finished || this.committing) return
    if (this.options.mode === 'draw') {
      const point = this.point(event)
      if (!point) return
      if (this.points.length >= 4095) { this.updateStatus('Polyline point limit reached'); return }
      this.points.push(point)
      if (this.options.pickType !== 'curve') {
        const value = drawingValue(this.options.pickType, this.points, this.plane)
        if (value) { this.add(value); this.points = []; this.pipeline.removeGraphGeometry(this.draftId) }
      }
      this.updateStatus()
      return
    }
    const hits = this.pipeline.intersectionsAtPointer(event.clientX, event.clientY, 8)
    const candidates = hits.map(hit => ({ hit, value: scenePickValue(this.pipeline, hit, this.options.pickType) })).filter(item => item.value)
    this.pending = this.pending.then(async () => {
      if (this.finished) return
      let failure = ''
      for (const { hit, value: candidate } of candidates) {
        let value = candidate
        if (value.kind === 'geometryRef') {
          try {
            this.updateStatus('Checking source geometry...')
            const response = await fetch('/api/node/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference: value }, (key, item) => key === 'sceneObject' ? undefined : item), signal: this.abort.signal })
            const result = await response.json()
            if (this.finished) return
            if (!response.ok || !result.ok) { failure = sourceGeometryError(result.error || 'Invalid source geometry'); continue }
            value = { ...result.reference, sceneObject: candidate.sceneObject }
          } catch (error) { if (!this.finished) this.updateStatus(error.message); return }
        }
        const key = value.kind === 'geometryRef'
          ? JSON.stringify([value.documentId, value.geometryId, value.subobject, value.pickTransform])
          : JSON.stringify(value)
        if (!this.keys.has(key)) { this.keys.add(key); this.add(value) }
        this.pipeline.setSelectedObject(hit.object, event.clientX, event.clientY)
        return
      }
      const accessError = hits.map(hit => scenePickAccessError(hit.object)).find(Boolean)
      this.updateStatus(failure || accessError || 'No matching ' + this.options.pickType + ' source geometry')
    }).catch(error => { if (!this.finished) this.updateStatus(error.message) })
  }

  add (value) {
    if (this.values.length >= 10000) { this.updateStatus('Selection limit reached'); return }
    this.values.push(value)
    if (value.__geo) {
      const id = 'parameter-pick:' + this.values.length
      this.previewIds.push(id)
      this.showPreview(id, value)
    }
    this.updateStatus()
  }

  finish (cancelled, ready = false) {
    if (this.finished) return
    if (!cancelled && !ready) {
      if (this.committing) return
      this.committing = true
      this.pending.then(() => this.finish(false, true))
      return
    }
    this.finished = true
    if (this.frame != null) cancelAnimationFrame(this.frame)
    this.abort.abort()
    if (!cancelled && this.options.pickType === 'curve' && this.options.mode === 'draw') {
      const value = drawingValue('curve', this.points, this.plane)
      if (value) this.add(value)
    }
    this.panel.remove()
    this.previewIds.concat(this.draftId).forEach(id => this.pipeline.removeGraphGeometry(id))
    this.complete({ cancelled, values: this.values, token: this.options.token, nodeId: this.options.nodeId })
  }
}
