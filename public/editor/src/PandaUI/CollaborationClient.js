(function (global) {
  'use strict'

  function copy (value) { return JSON.parse(JSON.stringify(value)) }
  function statusEvent (value) {
    if (global.parent !== global) global.parent.postMessage({ type: 'pandaui-collaboration-status', status: value }, global.location.origin)
    global.dispatchEvent(new CustomEvent('pandaui-collaboration-status', { detail: value }))
  }

  function CollaborationClient (graph, graphcanvas) {
    this.graph = graph
    this.graphcanvas = graphcanvas
    this.socket = null
    this.documentId = null
    this.userId = null
    this.clientId = null
    this.lastSequence = 0
    this.pending = new Map()
    this.outbox = []
    this.inFlightOperationId = null
    this.leaseTokens = new Map()
    this.objectMetadata = new Map()
    this.seen = new Set()
    this.reconnectTimer = null
    this.reconnectDelay = 500
    this.closed = false
    this.openPromise = null
    graph.events.on('operation-applied', event => {
      const detail = event.detail || {}
      const operation = detail.operation
      if (!operation || global._pandauiGraphSyncing || detail.source === 'remote' || detail.source === 'collaboration') return
      this.sendOperation(operation)
    })
  }

  CollaborationClient.prototype.session = async function () {
    const response = await fetch('/api/collaboration/session', { credentials: 'include', cache: 'no-store' })
    const value = await response.json()
    if (!response.ok) throw new Error(value.error || 'Could not create a collaboration session.')
    this.userId = value.userId
    return value
  }

  CollaborationClient.prototype.url = function () {
    const protocol = global.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return protocol + '//' + global.location.host + '/api/collaboration'
  }

  CollaborationClient.prototype.start = async function (documentId, bootstrap) {
    this.closed = false
    const session = await this.session()
    const requested = String(documentId || session.defaultDocumentId || 'shared-workspace')
    if (this.documentId !== requested || this.socket == null || this.socket.readyState > 1) return this.openDocument(requested, bootstrap)
    return this.openPromise || Promise.resolve()
  }

  CollaborationClient.prototype.openDocument = function (documentId, bootstrap, preserveSequence) {
    const nextDocumentId = String(documentId)
    this.documentId = nextDocumentId
    global.PandaUIGraphDocumentId = nextDocumentId
    if (!preserveSequence) {
      this.lastSequence = 0
      this.seen.clear()
        this.pending.clear()
        this.outbox = []
      this.inFlightOperationId = null
      this.leaseTokens.clear()
      this.objectMetadata.clear()
    }
    if (this.socket && this.socket.readyState <= 1) this.socket.close()
    clearTimeout(this.reconnectTimer)
    this.openPromise = new Promise((resolve, reject) => {
      const socket = new global.WebSocket(this.url())
      this.socket = socket
      let settled = false
      const finish = error => {
        if (settled) return
        settled = true
        if (error) reject(error)
        else resolve()
      }
      socket.addEventListener('open', () => {
        this.reconnectDelay = 500
        socket.send(JSON.stringify({ type: 'open', version: 1, documentId: nextDocumentId, lastSequence: this.lastSequence, bootstrap: this.lastSequence === 0 ? bootstrap || null : null }))
        statusEvent({ state: 'connecting', documentId: nextDocumentId, userId: this.userId })
      })
      socket.addEventListener('message', event => {
        let message
        try { message = JSON.parse(event.data) } catch (_) { return }
        this.receive(message, finish)
      })
      socket.addEventListener('error', () => finish(new Error('Collaboration WebSocket connection failed.')))
      socket.addEventListener('close', () => {
        if (this.closed || this.socket !== socket) return
        const inFlight = this.inFlightOperationId && this.pending.get(this.inFlightOperationId)
        if (inFlight) this.outbox.unshift(inFlight)
        this.pending.clear()
        this.inFlightOperationId = null
        statusEvent({ state: 'disconnected', documentId: nextDocumentId })
        this.scheduleReconnect(nextDocumentId)
      })
    })
    this.openPromise.catch(() => {}).finally(() => { if (this.openPromise) this.openPromise = null })
    return this.openPromise
  }

  CollaborationClient.prototype.scheduleReconnect = function (documentId) {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.openDocument(documentId, null, true).catch(() => {})
      this.reconnectDelay = Math.min(10000, this.reconnectDelay * 2)
    }, this.reconnectDelay)
  }

  CollaborationClient.prototype.receive = function (message, finish) {
    if (message.type === 'session') {
      this.clientId = message.clientId
      if (!this.userId) this.userId = message.userId
      return
    }
    if (message.type === 'document-snapshot') {
      this.applySnapshot(message)
      statusEvent({ state: 'ready', documentId: message.documentId, sequence: this.lastSequence, userId: this.userId, clientId: this.clientId })
      finish()
      this.pump()
      return
    }
    if (message.type === 'operation-accepted') {
      this.lastSequence = Math.max(this.lastSequence, Number(message.sequence) || 0)
      this.updateObjectMetadata(message.objects)
      const operation = message.operation
      if (operation?.operationId) {
        const local = this.pending.get(operation.operationId)
        this.pending.delete(operation.operationId)
        if (this.inFlightOperationId === operation.operationId) this.inFlightOperationId = null
        if (!local && !this.seen.has(operation.operationId)) this.applyRemote(operation)
        if (message.leaseToken && operation.type === 'object.acquire_edit') this.leaseTokens.set(String(operation.payload.objectId), message.leaseToken)
        if (operation.type === 'object.release_edit') this.leaseTokens.delete(String(operation.payload.objectId))
        this.seen.add(operation.operationId)
      }
      global.dispatchEvent(new CustomEvent('pandaui-collaboration-operation', { detail: message }))
      this.pump()
      return
    }
    if (message.type === 'operation-rejected') {
      if (message.operationId) this.pending.delete(message.operationId)
      if (this.inFlightOperationId === message.operationId) this.inFlightOperationId = null
      this.outbox = []
      statusEvent({ state: 'conflict', documentId: this.documentId, code: message.code, message: message.message })
      this.requestSync()
      return
    }
    if (message.type === 'error') statusEvent({ state: 'error', documentId: this.documentId, code: message.code, message: message.message })
  }

  CollaborationClient.prototype.applySnapshot = function (message) {
    if (!message.graph || message.documentId !== this.documentId) return
    this.updateObjectMetadata(message.objects)
    global._pandauiGraphSyncing = true
    try {
      this.graph.documentId = message.documentId
      global.PandaUIGraphDocumentId = message.documentId
      this.graph.configure(copy(message.graph), { skipHistory: true })
      this.graph.revision = Number(message.sequence) || 0
      this.lastSequence = Number(message.sequence) || 0
      this.pending.clear()
      this.inFlightOperationId = null
      if (this.graphcanvas) this.graphcanvas.cancelPointerInteraction()
    } finally { global._pandauiGraphSyncing = false }
    if (typeof global.syncPandaUIGhNodeInstances === 'function') global.syncPandaUIGhNodeInstances()
    this.graph.setDirtyCanvas()
  }

  CollaborationClient.prototype.updateObjectMetadata = function (objects) {
    if (!Array.isArray(objects)) return
    this.objectMetadata = new Map(objects.map(function (object) { return [String(object.objectId), object] }))
    global.PandaUICollaborationObjects = objects
    global.dispatchEvent(new CustomEvent('pandaui-collaboration-objects', { detail: objects }))
  }

  CollaborationClient.prototype.applyRemote = function (operation) {
    if (operation.documentId !== this.documentId) return
    global._pandauiGraphSyncing = true
    try { this.graph.applyOperation(operation, { source: 'remote', record: false, silent: true }) }
    catch (error) { statusEvent({ state: 'sync-error', documentId: this.documentId, message: error.message }); this.requestSync() }
    finally { global._pandauiGraphSyncing = false }
    if (typeof global.syncPandaUIGhNodeInstances === 'function') global.syncPandaUIGhNodeInstances()
  }

  CollaborationClient.prototype.sendOperation = function (operation) {
    if (!this.documentId || operation.documentId !== this.graph.documentId) return
    const outgoing = copy(operation)
    delete outgoing.actorId
    outgoing.documentId = this.documentId
    outgoing.baseSequence = this.lastSequence
    outgoing.clientId = this.clientId
    this.outbox.push(outgoing)
    this.pump()
  }

  CollaborationClient.prototype.submitOperation = function (type, payload) {
    if (!this.documentId) throw new Error('Collaboration document is not open.')
    var operationId = global.PandaUIKernel && typeof global.PandaUIKernel.newOperationId === 'function'
      ? global.PandaUIKernel.newOperationId()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
    this.sendOperation({ version: 1, operationId: operationId, documentId: this.graph.documentId, type: type, payload: copy(payload || {}), source: 'ui' })
    return operationId
  }

  CollaborationClient.prototype.publishObject = function (objectId) {
    return this.submitOperation('object.publish', { objectId: String(objectId) })
  }

  CollaborationClient.prototype.acquireEdit = function (objectId, durationMs) {
    return this.submitOperation('object.acquire_edit', { objectId: String(objectId), clientId: this.clientId, durationMs: durationMs })
  }

  CollaborationClient.prototype.releaseEdit = function (objectId) {
    var key = String(objectId)
    return this.submitOperation('object.release_edit', { objectId: key, leaseToken: this.leaseTokens.get(key) || null })
  }

  CollaborationClient.prototype.pump = function () {
    if (!this.socket || this.socket.readyState !== 1 || this.inFlightOperationId || this.outbox.length === 0) return
    const outgoing = this.outbox.shift()
    this.pending.set(outgoing.operationId, outgoing)
    this.inFlightOperationId = outgoing.operationId
    this.seen.add(outgoing.operationId)
    try {
      this.socket.send(JSON.stringify({ type: 'operation', version: 1, operation: outgoing }))
    } catch (error) {
      this.pending.delete(outgoing.operationId)
      this.inFlightOperationId = null
      this.outbox.unshift(outgoing)
      this.socket.close()
    }
  }

  CollaborationClient.prototype.requestSync = function () {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ type: 'sync', version: 1, lastSequence: this.lastSequence }))
  }

  CollaborationClient.prototype.switchDocument = async function (documentId, bootstrap) {
    if (String(documentId) === this.documentId && this.socket?.readyState === 1) return
    await this.session()
    return this.openDocument(documentId, bootstrap)
  }

  CollaborationClient.prototype.stop = function () {
    this.closed = true
    clearTimeout(this.reconnectTimer)
    if (this.socket) this.socket.close()
    this.socket = null
    this.pending.clear()
    this.outbox = []
    this.inFlightOperationId = null
    this.leaseTokens.clear()
    this.objectMetadata.clear()
    global.PandaUICollaborationObjects = []
  }

  global.PandaUICollaborationClient = CollaborationClient
})(window)
