import * as THREE from 'three'
import browserCrypto from '../../public/editor/src/BrowserCrypto'

const copy = value => JSON.parse(JSON.stringify(value, (key, item) => {
  if (['__proto__', 'prototype', 'constructor'].includes(key) || typeof item === 'function' || ArrayBuffer.isView(item) || item instanceof ArrayBuffer || (typeof item === 'number' && !Number.isFinite(item))) throw new Error('Operations require plain, finite editing data.')
  return item
}))
const operation = (type, payload) => ({ type, payload })

export default class WorkspaceOperations {
  #graph = null
  #services
  #listeners = new Set()
  #subscriptions = []
  #closedDocuments = new Set()
  #textureLeases = new Map()
  #requests = new Set()
  #bindingGeneration = 0

  constructor (services) { this.#services = services }

  bind (graph) {
    if (this.#graph === graph) return
    this.#bindingGeneration++
    this.#requests.forEach(controller => controller.abort())
    this.#requests.clear()
    this.#subscriptions.forEach(unsubscribe => unsubscribe())
    this.#subscriptions = []
    this.#graph = graph
    if (!graph) { this.notify(); return }
    const register = (name, execute, async = false) => this.#subscriptions.push(graph.registerOperationHandler(name, { execute: payload => {
      if (payload?.type && payload.type !== name) throw new Error('Scene operation type mismatch.')
      return execute(payload)
    },
    async }))
    register('scene.materials', payload => this.applyState(payload, state => this.#services.getPipeline().restoreSelectedMaterialSnapshot(state)))
    register('scene.uv', payload => this.applyState(payload, state => this.#services.getPipeline().applyObjectUVState(state)))
    register('scene.visibility', payload => this.applyState(payload, state => this.#services.getPipeline().applyObjectVisibilityState(state)))
    register('scene.document_visibility', payload => this.applyState(payload, state => this.#services.getPipeline().setDocumentTreeVisibility(state.reference, state.visible, false)))
    register('scene.material_definition', payload => this.applyState(payload, state => this.#services.getPipeline().restoreRenderMaterialDefinition(state)))
    register('scene.transform', payload => this.applyState(payload, state => this.#services.getPipeline().applyObjectTransformState(state)))
    register('scene.control_points', payload => this.applyControlPoints(payload), true)
    register('modeling.command', payload => this.applyModeling(payload), true)
    this.#subscriptions.push(graph.events.on('history-changed', event => {
      if (event.detail?.reason === 'restore') this.pruneClosedDocuments()
      this.notify()
    }))
    this.notify()
  }

  applyState (payload, apply) {
    if (!payload || !payload.type || !payload.before || !payload.after) throw new Error('Incomplete scene operation.')
    const result = apply(payload.after)
    if (result === false) throw new Error('The scene operation target is no longer available.')
    return { changed: true, value: result, inverse: operation(payload.type, { type: payload.type, before: payload.after, after: payload.before }) }
  }

  apply (command, options) {
    if (!this.#graph) throw new Error('The editor operation document is not ready.')
    if (this.#graph._graphAgent) throw new Error('Wait for the active AI editing transaction to finish.')
    return this.#graph.applyOperation(command, { source: 'viewport', ...options })
  }

  recordState (type, before, after, label) {
    const payload = { type, before: copy(before), after: copy(after) }
    if (JSON.stringify(payload.before) === JSON.stringify(payload.after)) return false
    try {
      return this.apply(operation(type, payload), { label })
    } catch (error) {
      this.#graph?._operationHandlers.get(type)?.execute({ type, before: payload.after, after: payload.before })
      throw error
    }
  }

  recordClippingPlaneTransform (before, after) {
    const node = this.#graph?.getNodeById(before?.clippingPlaneId)
    if (node?.type !== 'display/clipping_plane' || before.clippingPlaneId !== after?.clippingPlaneId) throw new Error('The clipping plane node is no longer available.')
    const frame = state => {
      if (!Array.isArray(state.plane) || state.plane.length !== 9 || !state.plane.every(Number.isFinite)) throw new Error('Invalid clipping plane transform.')
      const xAxis = new THREE.Vector3().fromArray(state.plane, 3)
      const yAxis = new THREE.Vector3().fromArray(state.plane, 6)
      const normal = new THREE.Vector3().crossVectors(xAxis, yAxis)
      return new THREE.Matrix4().makeBasis(xAxis, yAxis, normal).setPosition(new THREE.Vector3().fromArray(state.plane))
    }
    const start = frame(before)
    if (Math.abs(start.determinant()) < 1e-12) throw new Error('Invalid clipping plane axes.')
    const transform = frame(after).multiply(new THREE.Matrix4().getInverse(start))
    if (Array.isArray(node.properties.planeTransform)) transform.multiply(new THREE.Matrix4().fromArray(node.properties.planeTransform))
    try {
      return this.apply(operation('set_property', { nodeId: node.id, name: 'planeTransform', value: transform.toArray() }), { label: 'Transform clipping plane' })
    } catch (error) {
      this.#services.getPipeline().applyClippingPlaneState(before)
      throw error
    }
  }

  executeModeling (request, display = null) {
    const forward = { ...copy(request), recordHistory: false }
    let inverse
    if (forward.command === 'modeling.create_line') {
      forward.commandId = forward.commandId || browserCrypto.randomUUID()
      inverse = { documentId: forward.documentId, command: 'modeling.release_line', commandId: forward.commandId, recordHistory: false }
    } else if (forward.command === 'modeling.transform_geometry') {
      if (!Array.isArray(forward.matrix) || forward.matrix.length !== 16 || !forward.matrix.every(Number.isFinite)) throw new Error('Invalid transform matrix.')
      const matrix = new THREE.Matrix4().fromArray(forward.matrix).transpose()
      if (Math.abs(matrix.determinant()) < 1e-12) throw new Error('Transform matrix is not invertible.')
      inverse = { ...copy(forward), matrix: new THREE.Matrix4().getInverse(matrix).transpose().toArray() }
    } else throw new Error('Unsupported modeling operation: ' + forward.command)
    return this.apply(operation('modeling.command', { request: forward, inverseRequest: inverse, display }), { label: forward.command === 'modeling.create_line' ? 'Create line' : 'Transform geometry' })
  }

  executeControlPoints (before, after) {
    return this.apply(operation('scene.control_points', { type: 'scene.control_points', before: copy(before), after: copy(after) }), { label: 'Edit control point' })
  }

  async applyControlPoints (payload) {
    if (!payload?.before?.geometry || !payload?.after?.geometry ||
      payload.before.documentId !== payload.after.documentId || payload.before.objectId !== payload.after.objectId) throw new Error('Invalid control point operation.')
    const controller = new AbortController()
    this.#requests.add(controller)
    try {
      await this.#services.getPipeline().applyControlPointState(payload.after, { signal: controller.signal })
      return { changed: true, inverse: operation('scene.control_points', { type: 'scene.control_points', before: payload.after, after: payload.before }) }
    } finally { this.#requests.delete(controller) }
  }

  discardModelDocuments (documentIds) {
    if (this.#graph?._asyncOperationActive || this.#graph?.history.transaction) throw new Error('Finish the active document operation before closing model documents.')
    documentIds.filter(Boolean).forEach(id => this.#closedDocuments.add(String(id)))
    this.pruneClosedDocuments()
  }

  pruneClosedDocuments () {
    const referencesClosed = value => {
      if (!value || typeof value !== 'object') return false
      if (value.documentId && this.#closedDocuments.has(String(value.documentId))) return true
      return Object.values(value).some(referencesClosed)
    }
    this.#graph?.history.discard(command => referencesClosed(command.payload))
  }

  async applyModeling (payload) {
    const generation = this.#bindingGeneration
    const result = await this.requestModeling(payload.request)
    if (generation !== this.#bindingGeneration) throw new Error('The operation document was detached before the result arrived.')
    const pipeline = this.#services.getPipeline()
    try {
      if (payload.display) {
        if (pipeline.applyObjectTransformState(payload.display.after) === false) throw new Error('Transform target disappeared while the backend was running.')
        const states = payload.display.after.objects || [payload.display.after]
        states.forEach(state => pipeline.updateObjectGeometryReference(state.marker, result.geometryRef))
      } else pipeline.applyModelingResult(result)
    } catch (error) {
      let restored
      try { restored = await this.requestModeling(payload.inverseRequest) } catch (rollbackError) { throw new Error(error.message + ' Backend rollback failed: ' + rollbackError.message) }
      if (payload.display) pipeline.applyObjectTransformState(payload.display.before)
      else pipeline.applyModelingResult(restored)
      throw error
    }
    return {
      changed: true,
      value: result,
      inverse: operation('modeling.command', {
        request: payload.inverseRequest,
        inverseRequest: payload.request,
        display: payload.display ? { before: payload.display.after, after: payload.display.before } : null
      })
    }
  }

  async requestModeling (request) {
    const controller = new AbortController()
    this.#requests.add(controller)
    try {
      const response = await (this.#services.request || fetch)('/api/modeling/commands', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal
      })
      const result = await response.json()
      if (!response.ok || result.ok !== true) throw new Error(result.error || 'Modeling command failed.')
      return result
    } finally { this.#requests.delete(controller) }
  }

  getState () {
    const history = this.#graph?.history
    return {
      entries: (history?.entries || []).map(entry => ({ id: entry.commands[0]?.operation.operationId, label: entry.label, createdAt: new Date(entry.timestamp).toISOString() })),
      index: (history?.cursor || 0) - 1,
      limit: history?.maxEntries || 20,
      busy: this.#graph?._asyncOperationActive === true
    }
  }

  subscribe (listener) { this.#listeners.add(listener); listener(this.getState()); return () => this.#listeners.delete(listener) }
  textureResourceIds () {
    if (this.#graph) {
      const ids = new Set()
      const collect = value => {
        if (!value || typeof value !== 'object') return
        if (typeof value.textureAssetId === 'string') ids.add(value.textureAssetId)
        Object.values(value).forEach(collect)
      }
      collect(this.#graph.history.entries)
      collect(this.#graph.history.pending)
      collect(this.#graph.history.transaction)
      this.#textureLeases.set(this.#graph.documentId, ids)
    }
    return new Set([...this.#textureLeases.values()].flatMap(ids => [...ids]))
  }
  releaseGraphResources (documentId) { this.#textureLeases.delete(documentId); this.notify() }
  notify () { this.textureResourceIds(); const state = this.getState(); this.#listeners.forEach(listener => listener(state)) }
  undo () { return this.#graph?.undo() || false }
  redo () { return this.#graph?.redo() || false }
  async restore (index) {
    if (!this.#graph || !Number.isInteger(index) || index < -1 || index >= this.#graph.history.entries.length) return false
    while (this.#graph.history.cursor > index + 1) if (!await this.undo()) return false
    while (this.#graph.history.cursor < index + 1) if (!await this.redo()) return false
    return true
  }
  setLimit (limit) {
    const history = this.#graph?.history
    if (!history) return
    history.maxEntries = Math.max(1, Math.min(200, Math.floor(Number(limit) || 20)))
    while (history.entries.length > history.maxEntries && history.cursor > 0) {
      const removed = history.entries.shift()
      history.baseToken = removed.commands[removed.commands.length - 1].operation.operationId
      history.cursor--
    }
    history.entries.splice(history.maxEntries)
    this.notify()
  }
  dispose () { this.bind(null); this.#listeners.clear(); this.#closedDocuments.clear(); this.#textureLeases.clear() }
}
