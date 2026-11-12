(function (global) {
  'use strict'
  var kernel = global.PandaUIKernel = global.PandaUIKernel || {}
  var PandaUI
  function GraphDocument () {
    this._nodes = []
    this.nodes = new Map()
    this.links = new Map()
    this.lastNodeId = 0
    this.lastLinkId = 0
    this.canvases = new Set()
    this.events = new kernel.DocumentEventBus(this)
    this.stepMode = true
    this._isSolving = false
    this._solutionToken = 0
    this._dirty = new Set()
    this._flushPromise = null
    this._solutionPromise = null
    this._solutionRequested = false
    this._batchDepth = 0
    this.history = new kernel.CommandHistory(this)
    this.revision = 0
    this.documentId = kernel.newOperationId()
    this.clientId = kernel.newOperationId()
    this._operationDepth = 0
    this.dependencyGraph = new kernel.DependencyGraph(this)
    this.scheduler = new kernel.SolutionScheduler(this)
    this._nodeStates = new Map()
    this._groupStates = new Map()
    this._processedOperations = new Map()
    this._operationHandlers = new Map()
    this._asyncOperationActive = false
    this._restoring = false
    this.onNodeAdded = null
    this.onNodeRemoved = null
    this.onNodeConnectionChange = null
    this.onBeforeNodeSolution = null
    this.onAfterNodeSolution = null
    this.onNodeSolutionError = null
    this.onWidgetChanged = null
    this.globaltime = 0
    this.elapsed_time = 0
    this.vars = {}
    this.inputs = {}
    this.outputs = {}
  }
  GraphDocument.prototype.getGraphDocument = function () { return this }
  GraphDocument.prototype.attachCanvas = function (canvas) { this.canvases.add(canvas); return this }
  GraphDocument.prototype.detachCanvas = function (canvas) { this.canvases.delete(canvas); return this }
  GraphDocument.prototype.setDirtyCanvas = function () { this.canvases.forEach(function (canvas) { canvas.setDirty() }) }
  GraphDocument.prototype.getNodeById = function (id) { return this.nodes.get(String(id)) || null }
  GraphDocument.prototype.findNodesByType = function (type) { return this._nodes.filter(function (node) { return node.type === type }) }
  GraphDocument.prototype.addInput = function (name, type, value) { this.inputs[name] = { name: name, type: type, value: value }; if (this.onInputAdded) this.onInputAdded(name, type); return this.inputs[name] }
  GraphDocument.prototype.renameInput = function (oldName, name) { if (!this.inputs[oldName]) return false; this.inputs[name] = this.inputs[oldName]; this.inputs[name].name = name; delete this.inputs[oldName]; if (this.onInputRenamed) this.onInputRenamed(oldName, name); return true }
  GraphDocument.prototype.changeInputType = function (name, type) { if (!this.inputs[name]) return false; this.inputs[name].type = type; if (this.onInputTypeChanged) this.onInputTypeChanged(name, type); return true }
  GraphDocument.prototype.removeInput = function (name) { if (!this.inputs[name]) return false; delete this.inputs[name]; if (this.onInputRemoved) this.onInputRemoved(name); return true }
  GraphDocument.prototype.addOutput = function (name, type, value) { this.outputs[name] = { name: name, type: type, value: value }; if (this.onOutputAdded) this.onOutputAdded(name, type); return this.outputs[name] }
  GraphDocument.prototype.renameOutput = function (oldName, name) { if (!this.outputs[oldName]) return false; this.outputs[name] = this.outputs[oldName]; this.outputs[name].name = name; delete this.outputs[oldName]; if (this.onOutputRenamed) this.onOutputRenamed(oldName, name); return true }
  GraphDocument.prototype.changeOutputType = function (name, type) { if (!this.outputs[name]) return false; this.outputs[name].type = type; if (this.onOutputTypeChanged) this.onOutputTypeChanged(name, type); return true }
  GraphDocument.prototype.removeOutput = function (name) { if (!this.outputs[name]) return false; delete this.outputs[name]; if (this.onOutputRemoved) this.onOutputRemoved(name); return true }
  GraphDocument.prototype.setOutputData = function (name, value) { if (this.outputs[name]) this.outputs[name].value = value }
  GraphDocument.prototype.trigger = function (name, param) { if (typeof this.onTrigger === 'function') this.onTrigger(name, param) }
  GraphDocument.prototype.sendEventToAllNodes = function (name, param) { this._nodes.forEach(function (node) { if (typeof node[name] === 'function') node[name](param) }) }
  GraphDocument.prototype.add = function (node, options) {
    if (!node || this._nodes.indexOf(node) !== -1) return node
    options = options || {}
    if (node.id == null) node.id = ++this.lastNodeId
    this.lastNodeId = Math.max(this.lastNodeId, Number(node.id) || 0)
    node.graph = this
    this._nodes.push(node)
    this.nodes.set(String(node.id), node)
    this.dependencyGraph.invalidate()
    node.setPreviewVisible(node.flags.previewVisible !== false)
    if (typeof node.onAdded === 'function') node.onAdded(this)
    if (typeof this.onNodeAdded === 'function') this.onNodeAdded(node)
    this.events.emit('node-added', { result: node, node: node })
    if (!options.silent) this.commitHistory('add-node')
    this.invalidateNode(node, { source: true, reason: 'node-added' })
    this.setDirtyCanvas()
    return node
  }
  GraphDocument.prototype.remove = function (node, options) {
    if (!node) return null
    options = options || {}
    this.links.forEach(function (link) {
      if (String(link.origin_id) === String(node.id) || String(link.target_id) === String(node.id)) this.removeLink(link.id, { silent: true })
    }, this)
    var index = this._nodes.indexOf(node)
    if (index >= 0) this._nodes.splice(index, 1)
    this.nodes.delete(String(node.id))
    this._dirty.delete(String(node.id))
    this.dependencyGraph.invalidate()
    if (typeof node.onRemoved === 'function') node.onRemoved()
    node.graph = null
    if (typeof this.onNodeRemoved === 'function') this.onNodeRemoved(node)
    this.events.emit('node-removed', { node: node })
    if (!options.silent) this.commitHistory('remove-node')
    this.setDirtyCanvas()
    return node
  }
  GraphDocument.prototype.connect = function (source, originSlot, target, targetSlot, options) {
    options = options || {}
    if (!source || !target || !source.outputs[originSlot] || !target.inputs[targetSlot]) return null
    var previous = target.getInputLinks(targetSlot)
    if (options.append) {
      var duplicate = previous.map(function (id) { return this.links.get(String(id)) }, this).find(function (link) {
        return link && String(link.origin_id) === String(source.id) && link.origin_slot === originSlot
      })
      if (duplicate) return duplicate
    } else previous.forEach(function (id) { this.removeLink(id, { silent: true }) }, this)
    var id = options.id != null ? options.id : ++this.lastLinkId
    this.lastLinkId = Math.max(this.lastLinkId, Number(id) || 0)
    var link = {
      id: id,
      type: source.outputs[originSlot].type,
      origin_id: source.id,
      origin_slot: originSlot,
      target_id: target.id,
      target_slot: targetSlot
    }
    this.links.set(String(id), link)
    this.dependencyGraph.invalidate()
    source.outputs[originSlot].links.push(id)
    target.inputs[targetSlot].links = target.getInputLinks(targetSlot).concat(id)
    target.inputs[targetSlot].link = id
    if (typeof source.onConnectionsChange === 'function') source.onConnectionsChange(PandaUI.OUTPUT, originSlot, true, link, source.outputs[originSlot])
    if (typeof target.onConnectionsChange === 'function') target.onConnectionsChange(PandaUI.INPUT, targetSlot, true, link, target.inputs[targetSlot])
    if (typeof this.onNodeConnectionChange === 'function') this.onNodeConnectionChange(PandaUI.INPUT, target, targetSlot, source, originSlot)
    this.events.emit('connection-changed', { link: link, connected: true })
    if (!options.silent) this.commitHistory('connect')
    this.invalidateNode(target, { propagate: true, reason: 'connection' })
    this.setDirtyCanvas()
    return link
  }
  GraphDocument.prototype.removeLink = function (id, options) {
    options = options || {}
    var link = this.links.get(String(id))
    if (!link) return false
    var source = this.getNodeById(link.origin_id)
    var target = this.getNodeById(link.target_id)
    if (source && source.outputs[link.origin_slot]) source.outputs[link.origin_slot].links = source.outputs[link.origin_slot].links.filter(function (value) { return String(value) !== String(id) })
    if (target && target.inputs[link.target_slot]) {
      var input = target.inputs[link.target_slot]
      input.links = target.getInputLinks(link.target_slot).filter(function (value) { return String(value) !== String(id) })
      input.link = input.links.length ? input.links[0] : null
    }
    this.links.delete(String(id))
    this.dependencyGraph.invalidate()
    if (source && typeof source.onConnectionsChange === 'function') source.onConnectionsChange(PandaUI.OUTPUT, link.origin_slot, false, link, source.outputs[link.origin_slot])
    if (target && typeof target.onConnectionsChange === 'function') target.onConnectionsChange(PandaUI.INPUT, link.target_slot, false, link, target.inputs[link.target_slot])
    this.events.emit('connection-changed', { link: link, connected: false })
    if (!options.silent) this.commitHistory('disconnect')
    if (target) this.invalidateNode(target, { propagate: true, reason: 'disconnect' })
    this.setDirtyCanvas()
    return true
  }
  GraphDocument.prototype.clear = function (options) {
    options = options || {}
    this.abortSolution()
    this._nodes.slice().forEach(function (node) { this.remove(node, { silent: true }) }, this)
    this.links.clear()
    this.nodes.clear()
    this._nodes = []
    this._dirty.clear()
    if (!options.silent) this.commitHistory('clear')
    this.events.emit('document-cleared', {})
    this.setDirtyCanvas()
  }
  GraphDocument.prototype.serialize = function () {
    return {
      format: 'PandaUI.NodeDocument',
      version: 1,
      lastNodeId: this.lastNodeId,
      lastLinkId: this.lastLinkId,
      nodes: this._nodes.map(function (node) { return node.serialize() }),
      links: Array.from(this.links.values()).map(function (link) { return Object.assign({}, link) })
    }
  }
  GraphDocument.prototype.configure = function (data, options) {
    data = data || {}
    options = options || {}
    this._restoring = true
    try {
      this.clear({ silent: true })
      this.lastNodeId = Number(data.lastNodeId || data.last_node_id || 0)
      this.lastLinkId = Number(data.lastLinkId || data.last_link_id || 0)
      ;(data.nodes || []).forEach(function (saved) {
        var node = PandaUI.nodeTypes[saved.type]
          ? PandaUI.createNode(saved.type, saved.title)
          : PandaUI.createMissingNode(saved.type, saved.title)
        if (!node) return
        node.id = saved.id
        node.configure(saved)
        if (!PandaUI.nodeTypes[saved.type]) {
          node.type = String(saved.type || '')
          node.missingType = node.type
          node._isMissingNode = true
          node.title = saved.title || 'Missing Node'
          node.boxcolor = '#b65c45'
        }
        this.add(node, { silent: true })
      }, this)
      var links = Array.isArray(data.links) ? data.links : Object.keys(data.links || {}).map(function (key) { return data.links[key] })
      links.forEach(function (saved) {
        if (Array.isArray(saved)) saved = { id: saved[0], origin_id: saved[1], origin_slot: saved[2], target_id: saved[3], target_slot: saved[4], type: saved[5] }
        this.connect(this.getNodeById(saved.origin_id), saved.origin_slot, this.getNodeById(saved.target_id), saved.target_slot, { id: saved.id, silent: true, append: true })
      }, this)
    } finally {
      this._restoring = false
    }
    if (!options.skipHistory) this.commitHistory('configure', options.replaceHistory !== false)
    this.events.emit('document-restored', {})
    this.setDirtyCanvas()
    return this
  }
  GraphDocument.prototype.batchChanges = function (callback, options) {
    options = options || {}
    this._batchDepth++
    try {
      var result = callback()
    } finally {
      this._batchDepth--
    }
    if (this._batchDepth === 0) {
      if (options.history !== false) this.commitHistory(options.label || 'batch-change')
      if (options.solve !== false && this._dirty.size) this.requestSolution()
    }
    return result
  }
  GraphDocument.prototype.setStepMode = function (enabled) { this.stepMode = enabled !== false; if (this.stepMode) this.requestSolution(); return this.stepMode }
  GraphDocument.prototype.invalidateNode = function (node, options) {
    if (!node) return this
    this._dirty.add(String(node.id))
    if (options && options.propagate) {
      var queue = [node]
      var visited = new Set()
      while (queue.length) {
        var current = queue.shift()
        if (!current || visited.has(String(current.id))) continue
        visited.add(String(current.id))
        current.outputs.forEach(function (output) {
          ;(output.links || []).forEach(function (id) {
            var link = this.links.get(String(id))
            var target = link && this.getNodeById(link.target_id)
            if (target) { this._dirty.add(String(target.id)); queue.push(target) }
          }, this)
        }, this)
      }
    }
    this.events.emit('object-invalidated', { node: node, reason: options && options.reason })
    if (!options || options.schedule !== false) this.requestSolution()
    return this
  }
  GraphDocument.prototype.topologicalNodes = function () { return this.dependencyGraph.topologicalOrder() }
  GraphDocument.prototype.executeNode = async function (node, token) {
    if (!node || node.graph !== this || token !== this._solutionToken || typeof node.onExecute !== 'function') return
    var refresh = {
      snapshots: node.outputs.map(function (output) { return { data: output._data, rawValue: output.rawValue } }),
      updated: new Set()
    }
    node._outputRefreshTransaction = refresh
    if (typeof node.setExecutionState === 'function') node.setExecutionState('running')
    else { node._executionState = 'running'; node._executionError = null }
    node._executionCancellationRequested = false
    if (typeof this.onBeforeNodeSolution === 'function') this.onBeforeNodeSolution(node)
    var context = node.createExecutionContext({ solutionToken: token })
    try {
      await node.onExecute()
      if (context.signal.aborted || token !== this._solutionToken) {
        node.outputs.forEach(function (output, index) {
          output._data = refresh.snapshots[index].data
          output.rawValue = refresh.snapshots[index].rawValue
        })
        if (typeof node.setExecutionState === 'function') node.setExecutionState('ready')
        else node._executionState = 'ready'
        return
      }
      node.outputs.forEach(function (output, index) {
        var previous = refresh.snapshots[index]
        if (!refresh.updated.has(index)) {
          output._data = undefined
          output.rawValue = undefined
          if (previous.rawValue && previous.rawValue._isDualData) output.clearPreview()
          return
        }
        if (output.rawValue && output.rawValue._isDualData) {
          if (previous.rawValue && previous.rawValue._isDualData) output.clearPreview()
          if (typeof global.PandaUIGeometryOutputDispatcher === 'function') {
            global.PandaUIGeometryOutputDispatcher(node, index, output, output.rawValue)
          }
        } else if (previous.rawValue && previous.rawValue._isDualData) {
          output.clearPreview()
        }
      })
      node.inputs.forEach(function (input) {
        if (input.getPreviewAttributes().visible && !input._directPreviewData) {
          input.clearPreview()
          input.drawPreviewMesh()
          input.drawPreviewWire()
        }
      })
      if (node._executionState === 'running') {
        var messages = node._runtimeMessages || {}
        var hasErrors = Array.isArray(messages.errors) && messages.errors.length > 0
        var hasWarnings = Array.isArray(messages.warnings) && messages.warnings.length > 0
        if (typeof node.setExecutionState === 'function') node.setExecutionState(hasErrors ? 'error' : (hasWarnings ? 'warning' : 'success'))
        else node._executionState = hasErrors ? 'error' : (hasWarnings ? 'warning' : 'success')
      }
      if (typeof this.onAfterNodeSolution === 'function') this.onAfterNodeSolution(node)
    } catch (error) {
      node.outputs.forEach(function (output, index) {
        output._data = refresh.snapshots[index].data
        output.rawValue = refresh.snapshots[index].rawValue
      })
      if (context.signal.aborted || token !== this._solutionToken || error && error.name === 'AbortError') {
        if (typeof node.setExecutionState === 'function') node.setExecutionState('ready')
        else { node._executionState = 'ready'; node._executionError = null }
      } else if (typeof node.setExecutionState === 'function') node.setExecutionState('error', error)
      else { node._executionState = 'error'; node._executionError = error.message || String(error) }
      if (typeof this.onNodeSolutionError === 'function') this.onNodeSolutionError(node, error)
    } finally {
      if (node._outputRefreshTransaction === refresh) node._outputRefreshTransaction = null
      node.clearExecutionContext(context)
      node.setDirtyCanvas()
    }
  }
  GraphDocument.prototype.start = function () { this.sendEventToAllNodes('onStart'); this.setStepMode(true) }
  GraphDocument.prototype.stop = function () { this.sendEventToAllNodes('onStop'); this.setStepMode(false); this.abortSolution() }
  GraphDocument.prototype.change = function () { this.commitHistory('change'); this.setDirtyCanvas() }

  kernel.GraphDocument = GraphDocument
  kernel.installGraphDocument = function (runtime) { PandaUI = runtime; runtime.GraphDocument = GraphDocument; kernel.installSolutionScheduler(GraphDocument) }
})(typeof window !== 'undefined' ? window : globalThis)
