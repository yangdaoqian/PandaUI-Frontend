(function (global) {
  function RuntimeNodeAttributes (node) {
    this.node = node
    this.previewVisible = true
    this.previewMeshVisible = true
    this.previewWireVisible = true
  }
  RuntimeNodeAttributes.prototype.setExecutionState = function (state, error) {
    this.node._executionState = state
    this.node._executionError = error ? (error.message || String(error)) : null
    return this
  }
  RuntimeNodeAttributes.prototype.syncFromNode = function () {
    var flags = this.node.flags || {}
    if (flags.previewVisible != null) this.previewVisible = flags.previewVisible !== false
    if (flags.previewMeshVisible != null) this.previewMeshVisible = flags.previewMeshVisible !== false
    if (flags.previewWireVisible != null) this.previewWireVisible = flags.previewWireVisible !== false
    return this
  }
  RuntimeNodeAttributes.prototype.previewSettings = function () {
    return { visible: this.previewVisible, meshVisible: this.previewMeshVisible, wireVisible: this.previewWireVisible }
  }
  RuntimeNodeAttributes.prototype.applyPreviewVisibility = function () {
    var settings = this.previewSettings()
    this.node.inputs.concat(this.node.outputs).forEach(function (output) {
      if (typeof output.refreshPreviewVisibility === 'function') { output.refreshPreviewVisibility(); return }
      output.setPreviewAttributes(settings)
      output.setPreviewVisibility(settings.visible)
      output.setPreviewMeshVisible(settings.meshVisible)
      output.setPreviewWireVisible(settings.wireVisible)
      if (settings.visible && settings.meshVisible) output.drawPreviewMesh()
      if (settings.visible && settings.wireVisible) output.drawPreviewWire()
    })
    return this
  }
  RuntimeNodeAttributes.prototype.setPreviewVisibility = function (visible) { this.previewVisible = visible !== false; return this.applyPreviewVisibility() }
  RuntimeNodeAttributes.prototype.setPreviewMeshVisible = function (visible) { this.previewMeshVisible = visible !== false; return this.applyPreviewVisibility() }
  RuntimeNodeAttributes.prototype.setPreviewWireVisible = function (visible) { this.previewWireVisible = visible !== false; return this.applyPreviewVisibility() }

  var NodeAttributes = global.PandaUIKernel && global.PandaUIKernel.NodeAttributes
    ? global.PandaUIKernel.NodeAttributes
    : RuntimeNodeAttributes

  var portLabelMeasureContext = null
  function measureNodeText (value, font) {
    var text = String(value == null ? '' : value)
    if (portLabelMeasureContext == null && global.document && typeof global.document.createElement === 'function') {
      var canvas = global.document.createElement('canvas')
      portLabelMeasureContext = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null
    }
    if (portLabelMeasureContext != null) {
      portLabelMeasureContext.font = font
      return portLabelMeasureContext.measureText(text).width
    }
    return Array.from(text).reduce(function (width, character) {
      if (character === ' ') return width + 4
      return width + (character.charCodeAt(0) > 255 ? 12 : 7)
    }, 0)
  }

  function createPort (node, direction, index, name, type, options) {
    return new global.PandaUIKernel.Param({ owner: node, direction: direction, index: index, name: name, type: type, attributes: options })
  }

  function BaseNode (title) {
    this.id = null
    this.type = ''
    this.title = title || this.constructor.title || 'Node'
    this.pos = [80, 80]
    this.size = [180, 80]
    this.inputs = []
    this.outputs = []
    this.widgets = []
    this.properties = {}
    this.flags = {}
    this.resizable = true
    this.graph = null
    this.mode = 0
    this._executionState = 'ready'
    this._executionError = null
    this._runtimeMessages = null
    this._executionStartedAt = 0
    this._executionElapsedMs = 0
    this._executionTimer = null
    this._executionCancellationRequested = false
    this._attributes = new NodeAttributes(this)
    this._activeExecutionContext = null
  }

  function clearExecutionTimer (node) {
    if (node && node._executionTimer != null && typeof global.clearInterval === 'function') global.clearInterval(node._executionTimer)
    if (node) node._executionTimer = null
  }

  function updateExecutionElapsed (node) {
    if (!node || node._executionState !== 'running' || !node._executionStartedAt) return
    node._executionElapsedMs = Math.max(0, Date.now() - node._executionStartedAt)
    node.setDirtyCanvas()
  }

  BaseNode.prototype.setExecutionState = function (state, error) {
    var next = state || 'ready'
    if (next === 'idle') next = 'ready'
    if (next === 'success') next = 'success'
    if (next === 'aborted') next = 'ready'
    if (next === 'running') {
      clearExecutionTimer(this)
      this._executionStartedAt = Date.now()
      this._executionElapsedMs = 0
      if (typeof global.setInterval === 'function') {
        this._executionTimer = global.setInterval(function () { updateExecutionElapsed(this) }.bind(this), 100)
      }
    } else if (this._executionState === 'running' || next !== 'aborting') {
      if (this._executionState === 'running') updateExecutionElapsed(this)
      clearExecutionTimer(this)
    }
    this._executionState = next
    this._executionError = error ? (error.message || String(error)) : null
    if (this._attributes && typeof this._attributes.setExecutionState === 'function') this._attributes.setExecutionState(next, error)
    this.setDirtyCanvas()
    return this
  }

  BaseNode.prototype.clearExecutionTimer = function () {
    clearExecutionTimer(this)
    return this
  }

  BaseNode.prototype.addInput = function (name, type, options) {
    var input = createPort(this, 'input', this.inputs.length, name, type, options)
    this.inputs.push(input)
    return input
  }
  BaseNode.prototype.addInputs = function (items) {
    ;(items || []).forEach(function (item) { this.addInput(item[0], item[1], item[2]) }, this)
  }
  BaseNode.prototype.addOutput = function (name, type, options) {
    var output = createPort(this, 'output', this.outputs.length, name, type, options)
    this.outputs.push(output)
    return output
  }
  BaseNode.prototype.addOutputs = function (items) {
    ;(items || []).forEach(function (item) { this.addOutput(item[0], item[1], item[2]) }, this)
  }
  BaseNode.prototype.addProperty = function (name, value) { this.properties[name] = value; return value }
  BaseNode.prototype.setProperty = function (name, value, options) {
    var previous = this.properties[name]
    if (typeof this.onPropertyChanged === 'function' && this.onPropertyChanged(name, value, previous) === false) return false
    this.properties[name] = value
    var widget = this.widgets.find(function (item) { return item.property === name })
    if (widget) widget.value = value
    if (this.graph) {
      if (!options || !options.silent) this.graph.commitHistory('property')
      this.graph.invalidateNode(this, { source: true, propagate: true, reason: 'property' })
    }
    return true
  }
  BaseNode.prototype.removeInput = function (index) {
    if (!this.inputs[index]) return
    this.disconnectInput(index)
    this.inputs.splice(index, 1)
    this.inputs.forEach(function (input, inputIndex) { input.index = inputIndex })
  }
  BaseNode.prototype.removeOutput = function (index) {
    var output = this.outputs[index]
    if (!output) return
    if (this.graph) (output.links || []).slice().forEach(this.graph.removeLink.bind(this.graph))
    this.outputs.splice(index, 1)
    this.outputs.forEach(function (item, outputIndex) { item.index = outputIndex })
  }
  BaseNode.prototype.addWidget = function (type, name, value, callbackOrProperty, options) {
    var widget = { type: type, name: name, value: value, options: options || {} }
    if (typeof callbackOrProperty === 'function') widget.callback = callbackOrProperty
    else if (typeof callbackOrProperty === 'string') widget.property = callbackOrProperty
    if (widget.property && this.properties[widget.property] === undefined) this.properties[widget.property] = value
    this.widgets.push(widget)
    this.computeSize()
    return widget
  }
  BaseNode.prototype.computeSize = function () {
    this.size[1] = Math.max(60, Math.max(this.inputs.length, this.outputs.length) * 22 + this.widgets.length * 24 + 34)
    this.ensurePortLabelWidth()
    return this.size
  }
  BaseNode.prototype.getPortLabelMinimumWidth = function (appearance) {
    var font = appearance ? appearance.fontSize + 'px ' + appearance.fontFamily : '12px Arial'
    var titleFont = appearance ? '600 ' + appearance.titleFontSize + 'px ' + appearance.fontFamily : '600 13px Arial'
    var inputWidth = this.inputs.reduce(function (width, port) { return Math.max(width, measureNodeText(port.name, font)) }, 0)
    var outputWidth = this.outputs.reduce(function (width, port) { return Math.max(width, measureNodeText(port.name, font)) }, 0)
    var titleWidth = measureNodeText(typeof this.getTitle === 'function' ? this.getTitle() : (this.title || this.type), titleFont)
    return Math.ceil(Math.max(180, titleWidth + 54, inputWidth + outputWidth + 56))
  }
  BaseNode.prototype.ensurePortLabelWidth = function () {
    var requiredWidth = this.getPortLabelMinimumWidth()
    this.size[0] = Math.max(Number(this.size[0]) || 0, requiredWidth)
    return this.size[0]
  }
  BaseNode.prototype.getInputLinks = function (index) {
    var input = this.inputs[index]
    if (!input) return []
    return input.links && input.links.length ? input.links.slice() : (input.link == null ? [] : [input.link])
  }
  BaseNode.prototype.getInputData = function (index) {
    var input = this.inputs[index]
    if (!input) return undefined
    if (input.link == null || !this.graph) return input.data
    var values = this.getInputLinks(index).map(function (id) {
      var link = this.graph.links.get(String(id))
      var source = link && this.graph.getNodeById(link.origin_id)
      return source && source.outputs[link.origin_slot] ? source.outputs[link.origin_slot]._data : undefined
    }, this)
    if (values.length === 1) return values[0]
    var DataTree = global.PandaUIKernel && global.PandaUIKernel.DataTree
    var hasTree = DataTree && values.some(function (value) { return DataTree.isTreeData(DataTree.unwrap(value)) || (value && value.kind === 'paramRef') })
    if (!hasTree) return values.reduce(function (items, value) { return value === undefined ? items : items.concat(Array.isArray(value) ? value : [value]) }, [])
    var result = new DataTree()
    values.forEach(function (value) {
      if (value === undefined) return
      value = DataTree.unwrap(value)
      if (value && value.kind === 'paramRef' && value.dataTreeSummary) value = value.dataTreeSummary
      if (DataTree.isTreeData(value)) {
        var tree = DataTree.from(value)
        tree.paths().forEach(function (path) { result.ensurePath(path) })
        var legacy = tree.toLegacy()
        legacy.datas.forEach(function (item, itemIndex) { result.add(legacy.path[itemIndex], item, legacy.previews[itemIndex]) })
      } else {
        ;(Array.isArray(value) ? value : [value]).forEach(function (item) { result.add('{0}', item) })
      }
    })
    return result.toLegacy()
  }
  BaseNode.prototype.getInputDataByName = function (name) { return this.getInputData(this.findInputSlot(name)) }
  BaseNode.prototype.getInputOrProperty = function (name) {
    var index = this.findInputSlot(name)
    var value = index >= 0 ? this.getInputData(index) : undefined
    return value === undefined ? this.properties[name] : value
  }
  BaseNode.prototype.setOutputData = function (index, value) {
    var output = this.outputs[index]
    if (!output) return
    output._dataRevision = (output._dataRevision || 0) + 1
    output._data = value
    output.rawValue = value
    var refresh = this._outputRefreshTransaction
    if (refresh) {
      refresh.updated.add(index)
      return
    }
    if (typeof global.PandaUIGeometryOutputDispatcher === 'function' && value && value._isDualData) {
      global.PandaUIGeometryOutputDispatcher(this, index, output, value)
    }
  }
  BaseNode.prototype.getOutputData = function (index) { return this.outputs[index] && this.outputs[index]._data }
  BaseNode.prototype.setPreviewVisible = function (visible) {
    this.flags.previewVisible = visible !== false
    this.getNodeAttributes().setPreviewVisibility(this.flags.previewVisible)
    if (global.parent && global.parent !== global) global.parent.postMessage({
      type: 'pandaui-set-node-preview-visibility', nodeId: this.id, visible: this.flags.previewVisible
    }, global.location.origin)
  }
  BaseNode.prototype.getInputInfo = function (index) { return this.inputs[index] || null }
  BaseNode.prototype.getOutputInfo = function (index) { return this.outputs[index] || null }
  BaseNode.prototype.findInputSlot = function (name) { return this.inputs.findIndex(function (slot) { return slot.name === name }) }
  BaseNode.prototype.findOutputSlot = function (name) { return this.outputs.findIndex(function (slot) { return slot.name === name }) }
  BaseNode.prototype.isInputConnected = function (index) { return !!(this.inputs[index] && this.inputs[index].link != null) }
  BaseNode.prototype.isOutputConnected = function (index) { return !!(this.outputs[index] && this.outputs[index].links && this.outputs[index].links.length) }
  BaseNode.prototype.connect = function (outputIndex, targetNode, inputIndex) {
    return this.graph ? this.graph.connect(this, outputIndex, targetNode, inputIndex) : null
  }
  BaseNode.prototype.disconnectInput = function (index, options) {
    if (!this.graph) return
    var links = this.getInputLinks(index)
    links.forEach(function (id) { this.graph.removeLink(id, { silent: true }) }, this)
    if (links.length && !(options && options.silent)) this.graph.commitHistory('disconnect-input')
  }
  BaseNode.prototype.disconnectOutput = function (index, options) {
    if (!this.graph || !this.outputs[index]) return
    var links = (this.outputs[index].links || []).slice()
    links.forEach(function (id) { this.graph.removeLink(id, { silent: true }) }, this)
    if (links.length && !(options && options.silent)) this.graph.commitHistory('disconnect-output')
  }
  BaseNode.prototype.getOutputNodes = function (index) {
    if (!this.graph || !this.outputs[index]) return []
    return (this.outputs[index].links || []).map(function (id) {
      var link = this.graph.links.get(String(id))
      return link ? this.graph.getNodeById(link.target_id) : null
    }, this).filter(Boolean)
  }
  BaseNode.prototype.setDirtyCanvas = function () {
    if (this.graph) this.graph.canvases.forEach(function (canvas) { canvas.setDirty() })
  }
  BaseNode.prototype.setSize = function (size) { if (Array.isArray(size)) this.size = size.slice(0, 2); this.setDirtyCanvas(); return this.size }
  BaseNode.prototype.captureInput = function () {}
  BaseNode.prototype.trigger = function (action, param) {
    var slot = this.findOutputSlot(action)
    if (slot >= 0) this.triggerSlot(slot, param)
  }
  BaseNode.prototype.triggerSlot = function (slot, param) {
    var output = this.outputs[slot]
    if (!output || !this.graph) return
    ;(output.links || []).forEach(function (id) {
      var link = this.graph.links.get(String(id))
      var target = link && this.graph.getNodeById(link.target_id)
      if (!target) return
      var input = target.inputs[link.target_slot]
      if (typeof target.onAction === 'function') target.onAction(input && input.name, param, { link: link })
      else if (typeof target.onExecute === 'function') this.graph.invalidateNode(target, { propagate: true, reason: 'trigger' })
    }, this)
  }
  BaseNode.prototype.getNodeAttributes = function () { return this._attributes }
  BaseNode.prototype.getComponentDefinition = function () { return PandaUI.resolveNodeType(this.type) }
  BaseNode.prototype.createExecutionContext = function (options) {
    var controller = new AbortController()
    var context = {
      node: this,
      graph: this.graph,
      definition: this.getComponentDefinition(),
      solutionToken: options && options.solutionToken || 0,
      abortController: controller,
      signal: controller.signal,
      isCurrent: function () { return !controller.signal.aborted },
      complete: function () {}
    }
    this._activeExecutionContext = context
    return context
  }
  BaseNode.prototype.getActiveExecutionContext = function () { return this._activeExecutionContext }
  BaseNode.prototype.clearExecutionContext = function (context) { if (this._activeExecutionContext === context) this._activeExecutionContext = null }
  BaseNode.prototype.abortExecution = function () {
    var active = this._activeExecutionContext || this._executionAbort || this._executionState === 'running'
    if (!active) return false
    this._executionCancellationRequested = true
    if (typeof this.setExecutionState === 'function') this.setExecutionState('aborting')
    if (this._activeExecutionContext && this._activeExecutionContext.abortController) this._activeExecutionContext.abortController.abort()
    if (this._executionAbort && this._executionAbort !== (this._activeExecutionContext && this._activeExecutionContext.abortController)) this._executionAbort.abort()
    if (typeof this.onExecutionCancelled === 'function') this.onExecutionCancelled()
    if (this.graph && this.graph._isSolving) {
      this.graph._solutionToken++
      this.graph._solutionRequested = false
    }
    return true
  }
  BaseNode.prototype.serialize = function () {
    var data = {
      id: this.id,
      type: this.type,
      title: this.title,
      pos: this.pos.slice(),
      size: this.size.slice(),
      properties: JSON.parse(JSON.stringify(this.properties || {})),
      inputs: this.inputs.map(function (input) { return { name: input.name, type: input.type, label: input.label, previewAttributes: Object.assign({}, input.previewAttributes) } }),
      outputs: this.outputs.map(function (output) { return { name: output.name, type: output.type, label: output.label, previewAttributes: Object.assign({}, output.previewAttributes) } }),
      widgets: this.widgets.map(function (widget) { return { name: widget.name, value: widget.value, property: widget.property } }),
      flags: Object.assign({}, this.flags)
    }
    if (typeof this.onSerialize === 'function') this.onSerialize(data)
    return data
  }
  BaseNode.prototype.configure = function (data) {
    if (!data) return this
    if (data.title != null) this.title = data.title
    if (Array.isArray(data.pos)) this.pos = data.pos.slice(0, 2)
    if (Array.isArray(data.size)) this.size = data.size.slice(0, 2)
    if (data.properties) this.properties = Object.assign({}, this.properties, data.properties)
    if (data.flags) this.flags = Object.assign({}, data.flags)
    if (Array.isArray(data.inputs)) {
      while (this.inputs.length > data.inputs.length) this.removeInput(this.inputs.length - 1)
      data.inputs.forEach(function (saved, index) {
        if (!this.inputs[index]) this.addInput(saved.name, saved.type, saved)
        else Object.assign(this.inputs[index], saved, { owner: this, direction: 'input', index: index, link: null, links: [] })
        this.inputs[index].previewAttributes = Object.assign({ visible: false, meshVisible: true, wireVisible: true }, saved.previewAttributes)
      }, this)
    }
    if (Array.isArray(data.outputs)) {
      while (this.outputs.length > data.outputs.length) this.removeOutput(this.outputs.length - 1)
      data.outputs.forEach(function (saved, index) {
        if (!this.outputs[index]) this.addOutput(saved.name, saved.type, saved)
        else Object.assign(this.outputs[index], saved, { owner: this, direction: 'output', index: index, links: [] })
        this.outputs[index].previewAttributes = Object.assign({ visible: true, meshVisible: true, wireVisible: true }, saved.previewAttributes)
      }, this)
    }
    ;(data.widgets || []).forEach(function (saved) {
      var widget = this.widgets.find(function (item) { return item.name === saved.name })
      if (widget) {
        widget.value = saved.value
        if (widget.property) this.properties[widget.property] = saved.value
      }
    }, this)
    if (typeof this.onConfigure === 'function') this.onConfigure(data)
    this.ensurePortLabelWidth()
    return this
  }

  function NativeNode (title) { BaseNode.call(this, title); this.nodeKind = 'native' }
  NativeNode.prototype = Object.create(BaseNode.prototype)
  NativeNode.prototype.constructor = NativeNode
  function BackendNode (title) { BaseNode.call(this, title); this.nodeKind = 'backend' }
  BackendNode.prototype = Object.create(BaseNode.prototype)
  BackendNode.prototype.constructor = BackendNode

  var PandaUI = global.PandaUI = {
    INPUT: 1,
    OUTPUT: 2,
    EVENT: -1,
    ACTION: -1,
    ALWAYS: 0,
    ON_EVENT: 1,
    NEVER: 2,
    ON_TRIGGER: 3,
    NODE_TITLE_HEIGHT: 28,
    NODE_SLOT_HEIGHT: 22,
    NODE_TITLE_COLOR: '#999',
    NODE_SELECTED_TITLE_COLOR: '#fff',
    NODE_TEXT_COLOR: '#aaa',
    NODE_DEFAULT_COLOR: '#333',
    NODE_DEFAULT_BGCOLOR: '#353535',
    NODE_DEFAULT_BOXCOLOR: '#666',
    NODE_BOX_OUTLINE_COLOR: '#fff',
    DEFAULT_SHADOW_COLOR: 'rgba(0,0,0,0.5)',
    BOX_SHAPE: 1,
    Globals: {},
    allow_scripts: false,
    use_uuids: false,
    slot_types_default_in: {},
    slot_types_default_out: {},
    GraphDocumentRender: {},
    onRequestCameraMatrices: null,
    NativeNode: NativeNode,
    BackendNode: BackendNode,
    BaseNode: BaseNode,
    nodeTypes: {},
    searchbox_extras: {},
    node_images_path: '',
    registerNode: function (type, constructor, metadata) {
      if (!type || typeof constructor !== 'function') throw new Error('Node type and constructor are required.')
      if (!(constructor.prototype instanceof NativeNode)) Object.setPrototypeOf(constructor.prototype, NativeNode.prototype)
      constructor.type = type
      constructor.category = constructor.category || type.split('/').slice(0, -1).join('/')
      constructor.pandauiDefinition = Object.assign({}, constructor.pandauiDefinition || {}, metadata || {}, { type: type, constructor: constructor })
      this.nodeTypes[type] = constructor
      return constructor
    },
    unregisterNode: function (type) { delete this.nodeTypes[type] },
    resolveNodeType: function (type) {
      var constructor = this.nodeTypes[type]
      if (!constructor) return null
      return Object.assign({ type: type, constructor: constructor, title: constructor.title || type, description: constructor.desc || '' }, constructor.pandauiDefinition || {})
    },
    registerSearchboxExtra: function (type, description, data) { this.searchbox_extras[type] = { description: description, data: data } },
    cloneObject: function (value, target) {
      var clone = value == null ? value : JSON.parse(JSON.stringify(value))
      return target && clone && typeof clone === 'object' ? Object.assign(target, clone) : clone
    },
    isValidConnection: function (left, right) {
      if (left == null || right == null || left === 0 || right === 0 || left === '' || right === '') return true
      var leftTypes = String(left).split(',')
      var rightTypes = String(right).split(',')
      return leftTypes.some(function (type) { return rightTypes.indexOf(type) >= 0 })
    },
    getParameterNames: function (fn) {
      var match = String(fn).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').match(/^[^(]*\(([^)]*)\)/)
      return match && match[1] ? match[1].split(',').map(function (name) { return name.trim() }).filter(Boolean) : []
    },
    wrapFunctionAsNode: function (type, fn, paramTypes, returnType, properties) {
      function FunctionNode () {
        var names = PandaUI.getParameterNames(fn)
        names.forEach(function (name, index) { this.addInput(name, paramTypes && paramTypes[index] || 0) }, this)
        this.addOutput('out', returnType || 0)
        this.properties = Object.assign({}, properties || {})
      }
      FunctionNode.title = type.split('/').pop()
      FunctionNode.prototype.onExecute = function () {
        var args = this.inputs.map(function (_, index) { return this.getInputData(index) }, this)
        this.setOutputData(0, fn.apply(this, args))
      }
      return PandaUI.registerNode(type, FunctionNode)
    },
    fetchFile: function (url, type, onComplete, onError) {
      return global.fetch(url).then(function (response) {
        if (!response.ok) throw new Error('Request failed: ' + response.status)
        return type === 'arraybuffer' ? response.arrayBuffer() : (type === 'json' ? response.json() : response.text())
      }).then(function (value) { if (onComplete) onComplete(value); return value }).catch(function (error) { if (onError) onError(error); else throw error })
    },
    createNode: function (type, title) {
      var constructor = this.nodeTypes[type]
      if (!constructor || constructor.pandauiPluginEnabled === false) return null
      var node = Object.create(constructor.prototype)
      BaseNode.call(node, title || constructor.title)
      constructor.call(node, title)
      node.type = type
      node.title = title || constructor.title || node.title || type
      node.nodeKind = constructor.pandauiDefinition && constructor.pandauiDefinition.executor === 'backend' ? 'backend' : (node.nodeKind || 'native')
      if (typeof node.onNodeCreated === 'function') node.onNodeCreated()
      node.computeSize()
      return node
    },
    createMissingNode: function (type, title) {
      var node = this.createNode('__pandaui_missing__', title || 'Missing Node')
      if (!node) return null
      node.type = String(type || '')
      node.missingType = node.type
      node._isMissingNode = true
      node.title = title || 'Missing Node'
      node.boxcolor = '#b65c45'
      return node
    },
    getNodeTypesCategories: function () {
      return Array.from(new Set(Object.keys(this.nodeTypes).map(function (type) { return type.split('/').slice(0, -1).join('/') }))).sort()
    },
    getNodeTypesInCategory: function (category) {
      return Object.keys(this.nodeTypes).filter(function (type) { return type.split('/').slice(0, -1).join('/') === category })
    }
  }

  function MissingNode () {
    this.properties = {}
    this.size = [260, 100]
    this.boxcolor = '#b65c45'
  }
  MissingNode.title = 'Missing Node'
  MissingNode.desc = 'Placeholder for an unavailable node type'
  MissingNode.prototype.onExecute = function () {}
  MissingNode.prototype.onDrawForeground = function (context) {
    context.save()
    context.fillStyle = '#ffb4a2'
    context.font = '12px Arial'
    context.textAlign = 'left'
    context.fillText('Plugin unavailable', 8, this.size[1] - 28)
    context.fillStyle = '#d9a398'
    context.font = '10px Arial'
    context.fillText(String(this.missingType || this.type || '').slice(0, 38), 8, this.size[1] - 12)
    context.restore()
  }
  PandaUI.registerNode('__pandaui_missing__', MissingNode, { exposure: 'hidden' })

  var kernel = global.PandaUIKernel
  if (!kernel || !kernel.installGraphDocument) throw new Error('Load the Kernel document modules before Runtime.')
  kernel.installGraphDocument(PandaUI)
  kernel.installGraphGroups(PandaUI)
  kernel.installGraphOperations(PandaUI)

  global.PandaUIGraphDocument = PandaUI.GraphDocument
  global.PandaUINativeNode = NativeNode
  global.PandaUIBackendNode = BackendNode
})(typeof window !== 'undefined' ? window : globalThis)
