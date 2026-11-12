(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.NodeAttributes = api.NodeAttributes
  root.PandaUIKernel.NodeStateTheme = api.NodeStateTheme
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var NodeStateTheme = Object.freeze({
    blank: { color: '#ffffff', label: 'Ready to Compute' },
    ready: { color: '#ffffff', label: 'Ready to Compute' },
    expired: { color: '#ff8f3d', label: 'Expired' },
    collecting: { color: '#4c9aff', label: 'Collecting' },
    computing: { color: '#ffc247', label: 'Computing' },
    computed: { color: '#42c98b', label: 'Computed' },
    completed: { color: '#42c98b', label: 'Computed' },
    warning: { color: '#e6a23c', label: 'Warning' },
    error: { color: '#ff5252', label: 'Error' },
    aborting: { color: '#ffc247', label: 'Aborting' },
    aborted: { color: '#ffffff', label: 'Ready to Compute' }
  })

  function NodeAttributes (node) {
    this.owner = node || null
    this.component = null
    this.solutionState = 'blank'
    this.executionError = null
    this.selected = false
    this.hovered = false
    this.visible = true
    this.previewVisible = true
    this.previewMeshVisible = true
    this.previewWireVisible = true
    this.position = [0, 0]
    this.size = [0, 0]
    this.inputPositions = new Map()
    this.outputPositions = new Map()
    this._stateHandler = null
    this._disposedHandler = null
    this.syncFromNode()
    this.bindComponent(node && node.getComponentKernel ? node.getComponentKernel() : null)
  }

  NodeAttributes.prototype.bindComponent = function (component) {
    if (!component || this.component === component) return this
    this.unbindComponent()
    this.component = component
    this.solutionState = component.solutionState || this.solutionState
    this._stateHandler = function (payload) {
      this.solutionState = payload && payload.current ? payload.current : component.solutionState
      this.requestDraw()
    }.bind(this)
    this._disposedHandler = function () { this.dispose() }.bind(this)
    component.on('solution-state-changed', this._stateHandler)
    component.on('disposed', this._disposedHandler)
    return this
  }

  NodeAttributes.prototype.unbindComponent = function () {
    if (this.component) {
      this.component.off('solution-state-changed', this._stateHandler)
      this.component.off('disposed', this._disposedHandler)
    }
    this.component = null
    return this
  }

  NodeAttributes.prototype.syncFromNode = function () {
    var node = this.owner
    if (!node) return this
    this.position = node.pos ? [Number(node.pos[0]) || 0, Number(node.pos[1]) || 0] : [0, 0]
    this.size = node.size ? [Number(node.size[0]) || 0, Number(node.size[1]) || 0] : [0, 0]
    this.selected = node.is_selected === true
    this.hovered = node.mouseOver === true
    this.visible = !(node.flags && node.flags.hidden)
    var executionState = node._executionState
    var mappedState = executionState === 'running' ? 'computing' : (executionState === 'success' ? 'computed' : (executionState === 'aborted' || executionState === 'idle' ? 'ready' : executionState))
    if (NodeStateTheme[mappedState]) this.solutionState = mappedState
    this.executionError = node._executionError || null
    if (node.flags && node.flags.previewVisible != null) this.previewVisible = node.flags.previewVisible !== false
    if (node.flags && node.flags.previewMeshVisible != null) this.previewMeshVisible = node.flags.previewMeshVisible !== false
    if (node.flags && node.flags.previewWireVisible != null) this.previewWireVisible = node.flags.previewWireVisible !== false
    if (node.getComponentKernel) this.bindComponent(node.getComponentKernel())
    return this
  }

  NodeAttributes.prototype.updateLayout = function (size) {
    if (size) this.size = [Number(size[0]) || 0, Number(size[1]) || 0]
    return this
  }

  NodeAttributes.prototype.recordPortPosition = function (isInput, index, position) {
    if (!position) return this
    var node = this.owner
    var local = [position[0] - (node && node.pos ? node.pos[0] : 0), position[1] - (node && node.pos ? node.pos[1] : 0)]
    ;(isInput ? this.inputPositions : this.outputPositions).set(Number(index), local)
    return this
  }

  NodeAttributes.prototype.setInteractionState = function (selected, hovered) {
    this.selected = selected === true
    this.hovered = hovered === true
    return this
  }

  NodeAttributes.prototype.previewSettings = function () {
    return {
      visible: this.previewVisible,
      meshVisible: this.previewMeshVisible,
      wireVisible: this.previewWireVisible
    }
  }

  NodeAttributes.prototype.applyPreviewVisibility = function () {
    var node = this.owner
    var server = node && node.getParamServer ? node.getParamServer() : null
    var settings = this.previewSettings()
    if (server) {
      server.outputs.forEach(function (param) {
        param.setPreviewAttributes(settings)
        param.setPreviewMeshVisible(settings.meshVisible)
        param.setPreviewWireVisible(settings.wireVisible)
        param.setPreviewVisibility(settings.visible)
        if (settings.visible && settings.meshVisible) param.drawPreviewMesh()
        if (settings.visible && settings.wireVisible) param.drawPreviewWire()
      })
    } else if (node && Array.isArray(node.outputs)) {
      ;(node.inputs || []).concat(node.outputs).forEach(function (output) {
        if (typeof output.refreshPreviewVisibility === 'function') { output.refreshPreviewVisibility(); return }
        if (typeof output.setPreviewAttributes === 'function') output.setPreviewAttributes(settings)
        if (typeof output.setPreviewMeshVisible === 'function') output.setPreviewMeshVisible(settings.meshVisible)
        if (typeof output.setPreviewWireVisible === 'function') output.setPreviewWireVisible(settings.wireVisible)
        if (typeof output.setPreviewVisibility === 'function') output.setPreviewVisibility(settings.visible)
        if (settings.visible && settings.meshVisible && typeof output.drawPreviewMesh === 'function') output.drawPreviewMesh()
        if (settings.visible && settings.wireVisible && typeof output.drawPreviewWire === 'function') output.drawPreviewWire()
      })
    }
    this.requestDraw()
    return this
  }

  NodeAttributes.prototype.setPreviewVisibility = function (visible) {
    this.previewVisible = visible !== false
    return this.applyPreviewVisibility()
  }

  NodeAttributes.prototype.setPreviewMeshVisible = function (visible) {
    this.previewMeshVisible = visible !== false
    return this.applyPreviewVisibility()
  }

  NodeAttributes.prototype.setPreviewWireVisible = function (visible) {
    this.previewWireVisible = visible !== false
    return this.applyPreviewVisibility()
  }

  NodeAttributes.prototype.setExecutionState = function (state, error) {
    var mapped = state === 'running' ? 'computing' : (state === 'success' ? 'computed' : (state === 'aborted' || state === 'idle' ? 'ready' : state))
    if (NodeStateTheme[mapped]) this.solutionState = mapped
    this.executionError = error ? (error.message || String(error)) : null
    if (this.owner) {
      this.owner._executionState = state
      this.owner._executionError = this.executionError
    }
    this.requestDraw()
    return this
  }

  NodeAttributes.prototype.getStyle = function () {
    return NodeStateTheme[this.solutionState] || NodeStateTheme.blank
  }

  NodeAttributes.prototype.runtimeMessageCount = function () {
    var messages = this.component && this.component.runtimeMessages
    if (!messages) return 0
    return ['errors', 'warnings', 'remarks'].reduce(function (count, key) {
      return count + (Array.isArray(messages[key]) ? messages[key].length : 0)
    }, 0)
  }

  NodeAttributes.prototype.requestDraw = function () {
    if (this.owner && typeof this.owner.setDirtyCanvas === 'function') this.owner.setDirtyCanvas(true, false)
    return this
  }

  NodeAttributes.prototype.dispose = function () {
    this.unbindComponent()
    this.inputPositions.clear()
    this.outputPositions.clear()
    this.owner = null
  }

  return { NodeAttributes: NodeAttributes, NodeStateTheme: NodeStateTheme }
})
