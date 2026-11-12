(function (global) {
  'use strict'
  var PandaUI = global.PandaUI
  var own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key) }
  var reserved = new Set(['__proto__', 'prototype', 'constructor'])
  var toolArguments = {
    search_nodes: ['query', 'options'],
    add_node: ['type', 'pos', 'properties'],
    connect: ['src', 'outPort', 'dst', 'inPort', 'mode'],
    set_property: ['nodeId', 'name', 'value'],
    remove_node: ['nodeId'],
    get_graph: ['options'],
    read_output: ['nodeId', 'slot'],
    solve: []
  }

  function fail (code, message, details) {
    var error = new Error(message)
    error.code = code
    error.details = details
    throw error
  }
  function failure (error) {
    return { is_error: true, error: { code: error.code || 'OPERATION_FAILED', message: String(error.message || error).slice(0, 1000), details: error.details || null } }
  }
  function conflictDetails (event, graph) {
    var detail = event.detail || {}
    var operation = detail.operation
    var payload = operation && operation.payload || {}
    var node = detail.node || graph.getNodeById(payload.nodeId)
    var label = node ? ' on "' + String(node.title || node.type).slice(0, 100) + '" (#' + node.id + ')' : ''
    var reason = operation ? operation.type : detail.reason || event.type
    var fields = operation && operation.type === 'set_property' ? [payload.name]
      : operation && operation.type === 'patch_node' ? (payload.patch.properties || []).concat(payload.patch.fields || []).map(function (change) { return change.name }) : []
    return { event: event.type, reason: reason, nodeId: node ? node.id : null,
      description: String(reason + (fields.length ? ' [' + fields.join(', ') + ']' : '') + label).slice(0, 300) }
  }
  function text (value) { return typeof value === 'string' ? value.slice(0, 240) : value }
  function messageText (value) {
    return text(typeof value === 'string' ? value : value && typeof value.message === 'string' ? value.message : 'Runtime message')
  }
  function boundedInteger (value, fallback, maximum) {
    return Number.isInteger(value) ? Math.max(0, Math.min(maximum, value)) : fallback
  }
  function sample (value, depth) {
    depth = depth || 0
    if (value == null) return null
    if (typeof value === 'string') return text(value)
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value)
    if (typeof value === 'boolean') return value
    if (typeof value !== 'object') return { type: typeof value, omitted: true }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return { type: 'binary', byteLength: value.byteLength, omitted: true }
    if (depth >= 3) return { type: Array.isArray(value) ? 'array' : 'object', omitted: true }
    if (Array.isArray(value)) return { type: 'array', count: value.length, samples: value.slice(0, 3).map(function (item) { return sample(item, depth + 1) }) }
    var result = {}
    ;['kind', 'type', '__geo', 'geometryType', 'geometryId', 'previewId', 'backendGeneration', 'documentId', 'componentInstanceId', 'paramInstanceId', 'paramIndex', 'direction', 'solutionGeneration', 'dataRevision'].forEach(function (key) {
      if (own(value, key) && ['string', 'number', 'boolean'].indexOf(typeof value[key]) >= 0) result[key] = text(value[key])
    })
    if (value.kind === 'structRef') {
      if (/^(number|integer|double|float|boolean|string|text|null|point|vector|color|transform|array)$/i.test(value.type || '')) result.data = sample(value.data, depth + 1)
    } else if (!value.geometryId && !value.__geo && !value.kind) {
      ;['x', 'y', 'z', 'r', 'g', 'b', 'a'].forEach(function (key) { if (typeof value[key] === 'number') result[key] = sample(value[key]) })
    }
    if (!Object.keys(result).length) return { type: 'object', omitted: true }
    return result
  }
  function summarize (value) {
    var result = { type: value == null ? 'empty' : typeof value, count: value == null ? 0 : 1, samples: [] }
    var data = value
    if (value && value._isDualData) {
      result.type = 'geometry'
      result.geometryType = text(value.display && value.display.type || 'geometry')
      data = value.display && value.display.treeData || value.raw
    } else if (value && value.kind === 'paramRef') {
      result.type = 'paramRef'
      result.reference = sample(value)
      data = value.dataTreeSummary
      if (!data) { result.count = null; return result }
    }
    var append = function (values) {
      result.count += values.length
      for (var index = 0; index < values.length && result.samples.length < 5; index++) result.samples.push(sample(values[index]))
    }
    var DataTree = global.PandaUIKernel && global.PandaUIKernel.DataTree
    if (DataTree && data instanceof DataTree) {
      result.type = result.type === 'object' ? 'dataTree' : result.type
      result.count = 0
      result.branchCount = data._branches.size
      data._branches.forEach(function (branch) { append(branch.values) })
    } else if (data && Array.isArray(data.path) && Array.isArray(data.datas)) {
      result.type = result.type === 'object' ? 'dataTree' : result.type
      result.count = data.datas.length
      result.samples = data.datas.slice(0, 5).map(function (item) { return sample(item) })
      result.samplePaths = data.path.slice(0, 5).map(text)
    } else if (data && typeof data === 'object' && !ArrayBuffer.isView(data) && !(data instanceof ArrayBuffer) && !Array.isArray(data)) {
      var branchCount = 0
      for (var key in data) {
        if (!own(data, key) || !/^path\d+$/.test(key) || !Array.isArray(data[key])) continue
        if (!branchCount++) result.count = 0
        append(Array.isArray(data[key][1]) ? data[key][1] : [])
      }
      if (branchCount) {
        result.branchCount = branchCount
        if (result.type === 'object') result.type = 'dataTree'
      } else result.samples = [sample(data)]
    } else if (Array.isArray(data)) {
      result.type = 'array'
      result.count = data.length
      result.samples = data.slice(0, 5).map(function (item) { return sample(item) })
    } else if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
      result.type = 'binary'
      result.count = typeof data.length === 'number' ? data.length : null
      result.byteLength = data.byteLength
      result.omitted = true
    } else if (data != null) result.samples = [sample(data)]
    return result
  }
  function cloneProperty (value, depth, budget) {
    depth = depth || 0
    budget = budget || { entries: 512 }
    if (--budget.entries < 0 || depth > 8) fail('INVALID_PROPERTY_VALUE', 'Property value is too large or deeply nested.')
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'string' && value.length <= 4096) return value
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (Array.isArray(value)) {
      if (value.length > budget.entries) fail('INVALID_PROPERTY_VALUE', 'Property array is too large.')
      return value.map(function (item) { return cloneProperty(item, depth + 1, budget) })
    }
    if (value && Object.prototype.toString.call(value) === '[object Object]') {
      var result = {}
      Object.keys(value).forEach(function (key) {
        if (reserved.has(key)) fail('INVALID_PROPERTY_VALUE', 'Reserved property key: ' + key)
        result[key] = cloneProperty(value[key], depth + 1, budget)
      })
      return result
    }
    fail('INVALID_PROPERTY_VALUE', 'Property values must be finite JSON values; binary buffers are not accepted.')
  }
  function ports (values) {
    return (values || []).map(function (port) {
      return { name: text(port.name), type: text(port.type), access: port.access || 'item' }
    })
  }
  function properties (node) {
    var result = {}
    Object.keys(node.properties || {}).slice(0, 30).forEach(function (key) {
      if (!reserved.has(key) && !/^(preview|buffer|mesh|edges|positions|indices|normals|messages|conversations?)$/i.test(key)) result[key] = sample(node.properties[key])
    })
    return result
  }
  function describeNode (node) {
    var definition = PandaUI.resolveNodeType(node.type) || {}
    return { id: node.id, type: node.type, title: text(node.title), guid: definition.guid || definition.id || null, inputs: ports(node.inputs), outputs: ports(node.outputs), properties: properties(node) }
  }
  function waitFor (promise, signal) {
    if (!signal) return Promise.resolve(promise)
    return new Promise(function (resolve, reject) {
      var abort = function () { var error = new Error('AI operation cancelled.'); error.code = 'ABORTED'; reject(error) }
      if (signal.aborted) { abort(); return }
      signal.addEventListener('abort', abort, { once: true })
      Promise.resolve(promise).then(resolve, reject).finally(function () { signal.removeEventListener('abort', abort) })
    })
  }

  function GraphAgent (graph, options) {
    if (!graph || typeof graph.batchChanges !== 'function') throw new Error('GraphAgent requires a PandaUI GraphDocument with batchChanges support.')
    this.graph = graph
    this.options = options || {}
    this.turn = null
    this._editing = false
    this._solving = false
    this._starting = false
    this._disposed = false
  }
  GraphAgent.prototype._documentId = function () {
    return String(this.options.getDocumentId ? this.options.getDocumentId() : global.PandaUIGraphDocumentId || this.graph.documentId)
  }
  GraphAgent.prototype._read = function (operation) {
    try {
      if (this._disposed) fail('DISPOSED', 'This graph agent has been disposed.')
      return { is_error: false, result: operation.call(this) }
    } catch (error) { return failure(error) }
  }
  GraphAgent.prototype._checkTurn = function (allowAborted) {
    if (!this.turn) fail('TURN_REQUIRED', 'Call beginTurn() before editing the graph or solving.')
    if (this.turn.conflicted || this.turn.documentId !== this._documentId()) fail('GRAPH_CHANGED', 'The graph changed outside this AI turn. End the turn and read the current graph again.', {
      conflict: this.turn.conflict || { event: 'document-changed', description: 'The active document changed.' }
    })
    if (!allowAborted && this.turn.signal && this.turn.signal.aborted) fail('ABORTED', 'AI operation cancelled; roll back the turn.')
  }
  GraphAgent.prototype._node = function (id) {
    var node = this.graph.getNodeById(id)
    if (!node) fail('NODE_NOT_FOUND', 'Node not found: ' + String(id))
    return node
  }
  GraphAgent.prototype._port = function (node, name, direction) {
    var values = direction === 'input' ? node.inputs : node.outputs
    var names = values.map(function (port) { return port.name })
    if (typeof name !== 'string' || names.indexOf(name) < 0) fail('PORT_NOT_FOUND', 'Use an exact ' + direction + ' port name.', { nodeId: node.id, legalPorts: names })
    if (names.filter(function (candidate) { return candidate === name }).length !== 1) fail('AMBIGUOUS_PORT', 'Multiple ports have this name.', { nodeId: node.id, legalPorts: names })
    return direction === 'input' ? node.findInputSlot(name) : node.findOutputSlot(name)
  }
  GraphAgent.prototype._mutate = function (operation) {
    return this._read(function () {
      this._checkTurn()
      if (this._solving || this.graph._isSolving) fail('GRAPH_BUSY', 'Wait for solve() before editing the graph.')
      this._editing = true
      var previousSource = this.graph._operationSource
      this.graph._operationSource = 'ai'
      try { return this.graph.batchChanges(operation.bind(this), { history: false, solve: false }) } finally { this.graph._operationSource = previousSource; this._editing = false }
    })
  }
  GraphAgent.prototype.beginTurn = async function (options) {
    options = options || {}
    var acquired = false
    try {
      if (this._disposed) fail('DISPOSED', 'This graph agent has been disposed.')
      if (this.turn || this._starting || this.graph._graphAgent) fail('TURN_ACTIVE', 'A graph agent turn is already active.')
      this._starting = true
      this.graph._graphAgent = this
      acquired = true
      var documentId = this._documentId()
      await waitFor(this.graph._flushPromise, options.signal)
      await waitFor(this.graph._solutionPromise, options.signal)
      if (this._disposed || documentId !== this._documentId()) fail('GRAPH_CHANGED', 'The document changed while waiting for the current solution.')
      this.graph.beginTransaction(options.label || 'AI graph change')
      var controller = new AbortController()
      var turn = this.turn = { documentId: documentId, label: options.label || 'AI graph change', controller: controller, signal: controller.signal, subscriptions: [], conflicted: false, conflict: null }
      var changed = function (event) {
        if (this._editing || turn.conflicted) return
        if (event.type === 'history-changed' && ['undo', 'redo', 'rollback', 'restore', 'configure'].indexOf(event.detail.reason) < 0) return
        if (this.graph._operationDepth > 0 && ['node-added', 'node-removed', 'connection-changed', 'object-invalidated'].indexOf(event.type) >= 0) return
        turn.conflict = conflictDetails(event, this.graph)
        turn.conflicted = true
        controller.abort()
      }.bind(this)
      ;['history-changed', 'document-restored', 'document-cleared', 'node-added', 'node-removed', 'connection-changed', 'object-invalidated', 'operation-applied'].forEach(function (name) {
        turn.subscriptions.push(this.graph.events.on(name, changed))
      }, this)
      var abort = function () { if (this._solving) this.graph.abortSolution() }.bind(this)
      turn.signal.addEventListener('abort', abort, { once: true })
      turn.subscriptions.push(function () { turn.signal.removeEventListener('abort', abort) })
      if (options.signal) {
        var forwardAbort = function () { controller.abort() }
        options.signal.addEventListener('abort', forwardAbort, { once: true })
        turn.subscriptions.push(function () { options.signal.removeEventListener('abort', forwardAbort) })
        if (options.signal.aborted) controller.abort()
      }
      return { is_error: false, result: { documentId: documentId, label: turn.label } }
    } catch (error) {
      if (acquired && !this.turn && this.graph._graphAgent === this) this.graph._graphAgent = null
      return failure(error)
    } finally { if (acquired) this._starting = false }
  }
  GraphAgent.prototype._releaseTurn = function () {
    var turn = this.turn
    this.turn = null
    if (turn) { turn.subscriptions.forEach(function (unsubscribe) { unsubscribe() }); turn.controller.abort() }
    if (this.graph._graphAgent === this) this.graph._graphAgent = null
  }
  GraphAgent.prototype.commitTurn = function () {
    return this._read(function () {
      this._checkTurn()
      if (this._solving) fail('GRAPH_BUSY', 'Wait for solve() before committing.')
      this._releaseTurn()
      var changed = this.graph.commitTransaction()
      if (this.graph._dirty.size) this.graph.requestSolution()
      return { changed: changed }
    })
  }
  GraphAgent.prototype.rollbackTurn = function () {
    return this._read(function () {
      try { this._checkTurn(true) } catch (error) { this._releaseTurn(); this.graph.commitTransaction(); throw error }
      this.graph.abortSolution()
      this._releaseTurn()
      var changed = this.graph.batchChanges(function () { return this.graph.rollbackTransaction() }.bind(this), { history: false, solve: false })
      if (this.graph._dirty.size) this.graph.requestSolution()
      return { restored: changed }
    })
  }
  GraphAgent.prototype.dispose = function () {
    var result = this.turn ? this.rollbackTurn() : { is_error: false, result: null }
    this._disposed = true
    return result
  }
  GraphAgent.prototype.search_nodes = function (query, options) {
    return this._read(function () {
      options = options || {}
      var tokens = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
      var results = Object.keys(PandaUI.nodeTypes).filter(function (type) {
        return type !== '__pandaui_missing__' && PandaUI.nodeTypes[type].pandauiPluginEnabled !== false
      }).map(function (type) {
        var definition = PandaUI.resolveNodeType(type)
        var extra = PandaUI.searchbox_extras[type] || {}
        var tags = [].concat(definition.tags || [], definition.keywords || [], extra.description || [], extra.data && extra.data.tags || [])
        return { type: type, title: text(definition.title), guid: definition.guid || definition.id || null, description: text(definition.description), tags: tags.map(text), inputs: ports(definition.inputs), outputs: ports(definition.outputs), portsKnown: Array.isArray(definition.inputs) && Array.isArray(definition.outputs) }
      }).filter(function (entry) {
        var searchable = [entry.type, entry.title, entry.guid, entry.description].concat(entry.tags).join(' ').toLowerCase()
        return tokens.every(function (token) { return searchable.indexOf(token) >= 0 })
      }).sort(function (left, right) { return left.type.localeCompare(right.type) })
      var offset = boundedInteger(options.offset, 0, results.length)
      var limit = boundedInteger(options.limit, 20, 50)
      return { total: results.length, offset: offset, nodes: results.slice(offset, offset + limit) }
    })
  }
  GraphAgent.prototype.add_node = function (type, pos, values) {
    return this._mutate(function () {
      if (typeof type !== 'string' || !own(PandaUI.nodeTypes, type) || type === '__pandaui_missing__' || PandaUI.nodeTypes[type].pandauiPluginEnabled === false) fail('NODE_TYPE_UNAVAILABLE', 'Node type is unavailable. Use search_nodes to obtain a registered type.')
      if (pos !== undefined && (!Array.isArray(pos) || pos.length !== 2 || !pos.every(Number.isFinite))) fail('INVALID_POSITION', 'pos must contain two finite coordinates.')
      var copied = values === undefined ? {} : cloneProperty(values)
      if (!copied || Array.isArray(copied) || typeof copied !== 'object') fail('INVALID_PROPERTIES', 'properties must be a JSON object.')
      var node = PandaUI.createNode(type)
      if (!node) fail('NODE_TYPE_UNAVAILABLE', 'Could not create the requested node type.')
      Object.keys(copied).forEach(function (name) {
        if (!own(node.properties, name)) fail('PROPERTY_NOT_FOUND', 'Unknown property: ' + name, { legalProperties: Object.keys(node.properties) })
      })
      Object.keys(copied).forEach(function (name) {
        if (node.setProperty(name, copied[name], { silent: true }) === false) fail('PROPERTY_REJECTED', 'Node rejected property: ' + name)
      })
      if (pos) node.pos = pos.slice()
      this.graph.add(node, { silent: true })
      return describeNode(node)
    })
  }
  GraphAgent.prototype.set_property = function (nodeId, name, value) {
    return this._mutate(function () {
      var node = this._node(nodeId)
      if (reserved.has(name) || !own(node.properties, name)) fail('PROPERTY_NOT_FOUND', 'Unknown property: ' + String(name), { legalProperties: Object.keys(node.properties) })
      if (node.setProperty(name, cloneProperty(value), { silent: true }) === false) fail('PROPERTY_REJECTED', 'Node rejected property: ' + name)
      return { nodeId: node.id, name: name, value: sample(node.properties[name]) }
    })
  }
  GraphAgent.prototype.connect = function (src, outPort, dst, inPort, mode) {
    return this._mutate(function () {
      var source = this._node(src)
      var target = this._node(dst)
      var output = this._port(source, outPort, 'output')
      var input = this._port(target, inPort, 'input')
      if (mode !== undefined && mode !== 'append' && mode !== 'replace') fail('INVALID_MODE', 'Connection mode must be append or replace.')
      var link = this.graph.connect(source, output, target, input, { silent: true, append: mode === 'append' })
      if (!link) fail('CONNECTION_FAILED', 'The graph rejected this connection.')
      return { linkId: link.id, src: source.id, outPort: outPort, dst: target.id, inPort: inPort, mode: mode || 'replace' }
    })
  }
  GraphAgent.prototype.remove_node = function (nodeId) {
    return this._mutate(function () {
      var node = this._node(nodeId)
      if (node.type === 'AI/Assistant' || String(node.id) === String(this.options.assistantNodeId)) fail('PROTECTED_NODE', 'The AI assistant node cannot be deleted by a tool.')
      this.graph.remove(node, { silent: true })
      return { nodeId: node.id, removed: true }
    })
  }
  GraphAgent.prototype.get_graph = function (options) {
    return this._read(function () {
      options = options || {}
      var offset = boundedInteger(options.offset, 0, this.graph._nodes.length)
      var limit = boundedInteger(options.limit, 100, 200)
      var nodes = this.graph._nodes.slice(offset, offset + limit)
      var ids = new Set(nodes.map(function (node) { return String(node.id) }))
      var links = []
      this.graph.links.forEach(function (link) {
        if (!ids.has(String(link.target_id))) return
        var source = this.graph.getNodeById(link.origin_id)
        var target = this.graph.getNodeById(link.target_id)
        links.push({ id: link.id, src: link.origin_id, outPort: source && source.outputs[link.origin_slot] && source.outputs[link.origin_slot].name, dst: link.target_id, inPort: target && target.inputs[link.target_slot] && target.inputs[link.target_slot].name })
      }, this)
      return { documentId: this._documentId(), revision: this.graph.revision, totalNodes: this.graph._nodes.length, totalLinks: this.graph.links.size, offset: offset, nodes: nodes.map(describeNode), links: links }
    })
  }
  GraphAgent.prototype.read_output = function (nodeId, slot) {
    return this._read(function () {
      var node = this._node(nodeId)
      var index = this._port(node, slot, 'output')
      return { nodeId: node.id, port: slot, portType: node.outputs[index].type, stale: this.graph._isSolving || this.graph._dirty.has(String(node.id)) || node._executionState === 'error', summary: summarize(node.getOutputData(index)) }
    })
  }
  GraphAgent.prototype.solve = async function () {
    var started = false
    try {
      if (this._disposed) fail('DISPOSED', 'This graph agent has been disposed.')
      this._checkTurn()
      if (this._solving) fail('GRAPH_BUSY', 'A solve tool call is already running.')
      this._solving = true
      started = true
      var turn = this.turn
      var waitForBackend = this.options.waitForBackend || global.waitPandaUIGhNodeRequests
      if (waitForBackend) await waitFor(waitForBackend(), turn.signal)
      await waitFor(this.graph._flushPromise, turn.signal)
      await waitFor(this.graph._solutionPromise, turn.signal)
      this._checkTurn()
      var token = this.graph._solutionToken + 1
      await waitFor(this.graph.solveAll(), turn.signal)
      if (this.turn !== turn || token !== this.graph._solutionToken) fail('SOLUTION_CANCELLED', 'The solution was cancelled or superseded; its outputs are not current.')
      this._checkTurn()
      var nodes = this.graph._nodes.map(function (node) {
        var messages = node._runtimeMessages || {}
        return { nodeId: node.id, title: text(node.title), state: node._executionState || 'idle', error: node._executionError ? messageText(node._executionError) : null, messages: { errors: (messages.errors || []).slice(0, 5).map(messageText), warnings: (messages.warnings || []).slice(0, 5).map(messageText), remarks: (messages.remarks || []).slice(0, 5).map(messageText) } }
      })
      var failed = nodes.some(function (node) { return node.state === 'error' || node.error || node.messages.errors.length })
      return { is_error: failed, result: { generation: token, nodes: nodes } }
    } catch (error) {
      if (turn && turn.conflicted) return failure({ code: 'GRAPH_CHANGED', message: 'The graph changed while solving. Read its current state before continuing.', details: { conflict: turn.conflict } })
      return failure(error)
    } finally { if (started) this._solving = false }
  }
  GraphAgent.prototype.execute = async function (name, input) {
    if (!own(toolArguments, name)) return failure({ code: 'UNKNOWN_TOOL', message: 'Unknown graph tool: ' + String(name) })
    input = input || {}
    try {
      return await this[name].apply(this, toolArguments[name].map(function (key) { return input[key] }))
    } catch (error) { return failure(error) }
  }
  PandaUI.GraphAgent = GraphAgent
})(typeof window !== 'undefined' ? window : globalThis)
