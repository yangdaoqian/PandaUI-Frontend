(function (global) {
  'use strict'
  var PandaUI = global.PandaUI
  var NodeAppearance = global.PandaUINodeAppearance
  if (!PandaUI || !PandaUI.GraphDocument) throw new Error('PandaUI Runtime must be loaded before GraphCanvas.')
  var GraphDocument = PandaUI.GraphDocument
  var GraphGroup = PandaUI.GraphGroup
  function ensureGroups (graph) { return graph._groups || (graph._groups = []) }
  var portTypeAliases = Object.assign(Object.create(null), { float: 'number', double: 'number', decimal: 'number', int: 'integer', int32: 'integer', bool: 'boolean', text: 'string', vec2: 'vector', vec3: 'vector', vec4: 'vector', vector3d: 'vector', point3d: 'point', nurbscurve: 'curve', polycurve: 'curve', polyline: 'curve', linecurve: 'line', nurbssurface: 'surface', polysurface: 'brep', matrix: 'transform', matrix4: 'transform', xform: 'transform', colour: 'color', object: 'generic', any: 'generic', action: 'event' })
  var portTypeColors = Object.assign(Object.create(null), { generic: '#657080', number: '#936519', integer: '#987b25', boolean: '#a34255', string: '#7d5297', vector: '#347642', point: '#b15139', plane: '#237a83', line: '#277d9e', circle: '#42699d', curve: '#245e9d', surface: '#90557f', brep: '#53498e', mesh: '#347e70', geometry: '#566477', transform: '#7c5185', color: '#a84678', event: '#a4622d' })

  function executionStatus (node) {
    var state = node && node._executionState || 'ready'
    if (state === 'running') return { label: 'Computing ' + formatElapsed(node), color: '#ffc247' }
    if (state === 'success') return { label: 'Computed', color: '#42c98b' }
    if (state === 'error') return { label: 'Error', color: '#ff5252' }
    if (state === 'aborting') return { label: 'Aborting', color: '#ffc247' }
    if (state === 'warning') return { label: 'Warning', color: '#e6a23c' }
    return { label: 'Ready to Compute', color: '#ffffff' }
  }

  function formatElapsed (node) {
    var elapsed = Number(node && node._executionElapsedMs)
    if ((!isFinite(elapsed) || elapsed < 0) && node && node._executionStartedAt) elapsed = Math.max(0, Date.now() - node._executionStartedAt)
    if (!isFinite(elapsed) || elapsed < 0) elapsed = 0
    return elapsed >= 1000 ? (elapsed / 1000).toFixed(elapsed >= 10000 ? 0 : 1) + ' s' : Math.round(elapsed) + ' ms'
  }

  function GraphCanvas (container, graph) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'pandaui-node-canvas'
    this.canvas.tabIndex = 0
    this.container.appendChild(this.canvas)
    this.context = this.canvas.getContext('2d')
    this.graph = graph
    this.graph.attachCanvas(this)
    this.selected_nodes = {}
    this.selected_group = null
    this.selectionRect = null
    this.hoveredNodeId = null
    this.hoveredLinkId = null
    this.clipboardOffset = 0
    this.snapToGrid = false
    this.gridSize = 10
    this.renderGroups = true
    this.offset = [0, 0]
    this.scale = 1
    this.ds = { scale: 1, offset: this.offset }
    this.graph_mouse = [0, 0]
    this.pointer = null
    this.connecting = null
    this._edgePanHandle = null
    this._edgePanUsesAnimationFrame = false
    this._edgePanPointer = null
    this.lastRightDragMoved = false
    this.dirty = true
    this.clear_background_color = 'transparent'
    this.background_image = null
    this.render_canvas_border = false
    this.onDrawBackground = null
    this.onDrawForeground = null
    this.onDropItem = null
    this.visible_area = [0, 0, 0, 0]
    this.low_quality = false
    this.editorModeActive = true
    this._modeLayoutNodes = new WeakSet()
    this.appearance = NodeAppearance.normalize()
    var kernel = global.PandaUIKernel || {}
    var ensureAttributes = function (node) { return node && typeof node.getNodeAttributes === 'function' ? node.getNodeAttributes() : node && node._attributes }
    this.renderer = typeof kernel.CanvasRenderer === 'function' ? new kernel.CanvasRenderer(this, ensureAttributes) : null
    this.interactionController = typeof kernel.CanvasInteractionController === 'function' ? new kernel.CanvasInteractionController(this, ensureAttributes) : null
    this.bindEvents()
    this.tooltip = typeof PandaUI.NodeTooltip === 'function' ? new PandaUI.NodeTooltip(this) : null
    this.resize()
    this.animate()
  }
  GraphCanvas.prototype.setDirty = function () { this.dirty = true }
  GraphCanvas.prototype.appearance = NodeAppearance.defaults
  GraphCanvas.prototype.setAppearance = function (settings) {
    this.appearance = NodeAppearance.normalize(settings)
    var style = this.canvas.ownerDocument.documentElement.style
    var variables = NodeAppearance.cssVariables(this.appearance)
    Object.keys(variables).forEach(function (key) { style.setProperty(key, variables[key]) })
    if (this.renderer) this.renderer.showStateBadge = this.appearance.showStatusBadge
    this.setDirty()
  }
  GraphCanvas.prototype.setDirtyCanvas = GraphCanvas.prototype.setDirty
  GraphCanvas.prototype.resize = function () {
    if (this.tooltip) this.tooltip.hide()
    var rect = this.container.getBoundingClientRect()
    var ratio = global.devicePixelRatio || 1
    this.canvas.width = Math.max(1, Math.floor(rect.width * ratio))
    this.canvas.height = Math.max(1, Math.floor(rect.height * ratio))
    this.canvas.style.width = rect.width + 'px'
    this.canvas.style.height = rect.height + 'px'
    this.ratio = ratio
    if (this.menu) this.fitMenuToCanvas(this.menu)
    this.setDirty()
  }
  GraphCanvas.prototype.animate = function () {
    try { if (this.dirty) this.draw() } finally { global.requestAnimationFrame(this.animate.bind(this)) }
  }
  GraphCanvas.prototype.toGraph = function (clientX, clientY) {
    var rect = this.canvas.getBoundingClientRect()
    return [(clientX - rect.left) / this.scale - this.offset[0], (clientY - rect.top) / this.scale - this.offset[1]]
  }
  GraphCanvas.prototype.slotPosition = function (node, input, index) {
    var count = input ? node.inputs.length : node.outputs.length
    if (node.flags && node.flags.collapsed) return [node.pos[0] + (input ? 0 : this.nodeDisplayWidth(node)), node.pos[1] - PandaUI.NODE_TITLE_HEIGHT * 0.5, count]
    var y = node.pos[1] + 34 + index * 22
    return [node.pos[0] + (input ? 0 : node.size[0]), y, count]
  }
  GraphCanvas.prototype.nodeAt = function (point) {
    for (var i = this.graph._nodes.length - 1; i >= 0; i--) {
      var node = this.graph._nodes[i]
      if (point[0] >= node.pos[0] && point[0] <= node.pos[0] + this.nodeDisplayWidth(node) && point[1] >= node.pos[1] - PandaUI.NODE_TITLE_HEIGHT && point[1] <= node.pos[1] + this.nodeBodyHeight(node)) return node
    }
    return null
  }
  GraphCanvas.prototype.slotAt = function (point) {
    var radius = Math.max(9 / this.scale, this.appearance.portRadius + 3)
    for (var n = this.graph._nodes.length - 1; n >= 0; n--) {
      var node = this.graph._nodes[n]
      if (node.flags && node.flags.collapsed) {
        var collapsedInput = this.slotPosition(node, true, 0)
        var collapsedOutput = this.slotPosition(node, false, 0)
        if (node.inputs.length && Math.hypot(point[0] - collapsedInput[0], point[1] - collapsedInput[1]) <= radius) return { node: node, input: true, index: 0, pos: collapsedInput }
        if (node.outputs.length && Math.hypot(point[0] - collapsedOutput[0], point[1] - collapsedOutput[1]) <= radius) return { node: node, input: false, index: 0, pos: collapsedOutput }
        continue
      }
      for (var i = 0; i < node.inputs.length; i++) {
        var inputPos = this.slotPosition(node, true, i)
        if (Math.hypot(point[0] - inputPos[0], point[1] - inputPos[1]) <= radius) return { node: node, input: true, index: i, pos: inputPos }
      }
      for (var o = 0; o < node.outputs.length; o++) {
        var outputPos = this.slotPosition(node, false, o)
        if (Math.hypot(point[0] - outputPos[0], point[1] - outputPos[1]) <= radius) return { node: node, input: false, index: o, pos: outputPos }
      }
    }
    return null
  }
  GraphCanvas.prototype.widgetAt = function (point) {
    var node = this.nodeAt(point)
    if (node && node.widgetUI) return null
    if (!node || !node.widgets.length || node.flags && node.flags.collapsed) return null
    var startY = node.pos[1] + this.widgetStartOffset(node)
    for (var index = 0; index < node.widgets.length; index++) {
      var top = startY + index * 24 - 10
      if (point[0] >= node.pos[0] + 8 && point[0] <= node.pos[0] + node.size[0] - 8 && point[1] >= top && point[1] <= top + 20) {
        return { node: node, widget: node.widgets[index], index: index, left: node.pos[0] + 8, width: node.size[0] - 16 }
      }
    }
    return null
  }
  GraphCanvas.prototype.widgetStartOffset = function (node) {
    return node && node.widgets_up ? 14 : 34 + Math.max(node.inputs.length, node.outputs.length) * PandaUI.NODE_SLOT_HEIGHT
  }
  GraphCanvas.prototype.minimumNodeSize = function (node) {
    var contentHeight = Math.max(node.inputs.length, node.outputs.length) * PandaUI.NODE_SLOT_HEIGHT + node.widgets.length * 24 + 34
    var contentWidth = typeof node.getPortLabelMinimumWidth === 'function' ? node.getPortLabelMinimumWidth(this.appearance) : 180
    var custom = typeof node.getMinimumSize === 'function' ? node.getMinimumSize() : [0, 0]
    return [Math.max(contentWidth, Number(custom[0]) || 0), Math.max(60, contentHeight, Number(custom[1]) || 0)]
  }
  GraphCanvas.prototype.nodeResizeHandleAt = function (point, node) {
    if (!node || node.resizable === false || node.flags && node.flags.collapsed) return false
    var handleSize = 14 / this.scale
    return point[0] >= node.pos[0] + node.size[0] - handleSize && point[0] <= node.pos[0] + node.size[0] + handleSize * 0.25 &&
      point[1] >= node.pos[1] + node.size[1] - handleSize && point[1] <= node.pos[1] + node.size[1] + handleSize * 0.25
  }
  GraphCanvas.prototype.resizeNodeTo = function (node, width, height) {
    var minimum = this.minimumNodeSize(node)
    node.size[0] = Math.max(minimum[0], width)
    node.size[1] = Math.max(minimum[1], height)
    if (typeof node.onResize === 'function') node.onResize(node.size.slice())
    node.setDirtyCanvas(true, true)
    return node.size
  }
  GraphCanvas.prototype.nodeBodyHeight = function (node) {
    return node && node.flags && node.flags.collapsed ? 0 : node.size[1]
  }
  GraphCanvas.prototype.nodeDisplayWidth = function (node) {
    return node && node.flags && node.flags.collapsed ? Math.max(90, Number(node._collapsed_width) || 120) : node.size[0]
  }
  GraphCanvas.prototype.selectNode = function (node, add) {
    if (!node) return null
    if (!add) this.clearSelection()
    this.selected_nodes[node.id] = node
    node.is_selected = true
    if (typeof node.onSelected === 'function') node.onSelected()
    this.syncPreviewSelection()
    this.setDirty()
    return node
  }
  GraphCanvas.prototype.deselectNode = function (node) {
    if (!node || !this.selected_nodes[node.id]) return false
    delete this.selected_nodes[node.id]
    node.is_selected = false
    if (typeof node.onDeselected === 'function') node.onDeselected()
    this.syncPreviewSelection()
    this.setDirty()
    return true
  }
  GraphCanvas.prototype.selectAll = function () {
    this.clearSelection()
    this.graph._nodes.forEach(function (node) { this.selectNode(node, true) }, this)
    return this.selected_nodes
  }
  GraphCanvas.prototype.nodesInRectangle = function (rectangle) {
    var left = Math.min(rectangle[0], rectangle[2])
    var top = Math.min(rectangle[1], rectangle[3])
    var right = Math.max(rectangle[0], rectangle[2])
    var bottom = Math.max(rectangle[1], rectangle[3])
    return this.graph._nodes.filter(function (node) {
      var width = this.nodeDisplayWidth(node)
      var height = this.nodeBodyHeight(node) + PandaUI.NODE_TITLE_HEIGHT
      return node.pos[0] + width >= left && node.pos[0] <= right && node.pos[1] + this.nodeBodyHeight(node) >= top && node.pos[1] - PandaUI.NODE_TITLE_HEIGHT <= bottom && height > 0
    }, this)
  }
  GraphCanvas.prototype.groupAt = function (point) {
    var groups = ensureGroups(this.graph)
    for (var index = groups.length - 1; index >= 0; index--) {
      var group = groups[index]
      if (point[0] >= group.pos[0] && point[0] <= group.pos[0] + group.size[0] && point[1] >= group.pos[1] && point[1] <= group.pos[1] + group.size[1]) return group
    }
    return null
  }
  GraphCanvas.prototype.groupResizeHandleAt = function (point, group) {
    if (!group || group.flags && group.flags.locked) return false
    var handle = 16 / this.scale
    return point[0] >= group.pos[0] + group.size[0] - handle && point[1] >= group.pos[1] + group.size[1] - handle
  }
  GraphCanvas.prototype.updateGroupNodes = function (group) {
    if (!group) return []
    group._nodes = this.graph._nodes.filter(function (node) {
      var centerX = node.pos[0] + this.nodeDisplayWidth(node) * 0.5
      var centerY = node.pos[1] + this.nodeBodyHeight(node) * 0.5
      return centerX >= group.pos[0] && centerX <= group.pos[0] + group.size[0] && centerY >= group.pos[1] && centerY <= group.pos[1] + group.size[1]
    }, this)
    return group._nodes
  }
  GraphCanvas.prototype.addGroupAt = function (point) {
    var group = this.graph.addGroup(new GraphGroup({ pos: [point[0], point[1]], size: [320, 220] }))
    this.selected_group = group
    return group
  }
  GraphCanvas.prototype.groupSelection = function () {
    var nodes = Object.values(this.selected_nodes).filter(function (node) { return this.graph.getNodeById(node.id) === node }, this)
    if (nodes.length < 2) return null
    var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    nodes.forEach(function (node) {
      left = Math.min(left, node.pos[0])
      top = Math.min(top, node.pos[1] - PandaUI.NODE_TITLE_HEIGHT)
      right = Math.max(right, node.pos[0] + this.nodeDisplayWidth(node))
      bottom = Math.max(bottom, node.pos[1] + this.nodeBodyHeight(node))
    }, this)
    var group = this.graph.addGroup(new GraphGroup({ pos: [left - 24, top - 24], size: [Math.max(140, right - left + 48), Math.max(80, bottom - top + 48)] }))
    this.selected_group = group
    this.setDirty()
    return group
  }
  GraphCanvas.prototype.linkCurve = function (link) {
    var source = this.graph.getNodeById(link.origin_id)
    var target = this.graph.getNodeById(link.target_id)
    if (!source || !target) return null
    var start = this.slotPosition(source, false, link.origin_slot)
    var end = this.slotPosition(target, true, link.target_slot)
    if (this.appearance.linkShape === 'straight') return { start: start, end: end, control1: start, control2: end }
    var distance = Math.max(40, Math.abs(end[0] - start[0]) * 0.45)
    return { start: start, end: end, control1: [start[0] + distance, start[1]], control2: [end[0] - distance, end[1]] }
  }
  GraphCanvas.prototype.linkAt = function (point) {
    var radius = 8 / this.scale
    var found = null
    this.graph.links.forEach(function (link) {
      if (found) return
      var curve = this.linkCurve(link)
      if (!curve) return
      var previous = curve.start
      for (var step = 1; step <= 24; step++) {
        var t = step / 24
        var inverse = 1 - t
        var current = [
          inverse * inverse * inverse * curve.start[0] + 3 * inverse * inverse * t * curve.control1[0] + 3 * inverse * t * t * curve.control2[0] + t * t * t * curve.end[0],
          inverse * inverse * inverse * curve.start[1] + 3 * inverse * inverse * t * curve.control1[1] + 3 * inverse * t * t * curve.control2[1] + t * t * t * curve.end[1]
        ]
        var segmentX = current[0] - previous[0]
        var segmentY = current[1] - previous[1]
        var lengthSquared = segmentX * segmentX + segmentY * segmentY || 1
        var projection = Math.max(0, Math.min(1, ((point[0] - previous[0]) * segmentX + (point[1] - previous[1]) * segmentY) / lengthSquared))
        var closestX = previous[0] + segmentX * projection
        var closestY = previous[1] + segmentY * projection
        if (Math.hypot(point[0] - closestX, point[1] - closestY) <= radius) { found = link; return }
        previous = current
      }
    }, this)
    return found
  }
  GraphCanvas.prototype.copySelection = function () {
    var nodes = Object.keys(this.selected_nodes).map(function (id) { return this.selected_nodes[id] }, this)
    if (!nodes.length) return null
    var selectedIds = new Set(nodes.map(function (node) { return String(node.id) }))
    var minimumX = Math.min.apply(Math, nodes.map(function (node) { return node.pos[0] }))
    var minimumY = Math.min.apply(Math, nodes.map(function (node) { return node.pos[1] }))
    GraphCanvas.clipboard = {
      nodes: nodes.map(function (node) {
        var data = node.serialize()
        data.pos = [node.pos[0] - minimumX, node.pos[1] - minimumY]
        return data
      }),
      links: Array.from(this.graph.links.values()).filter(function (link) { return selectedIds.has(String(link.origin_id)) && selectedIds.has(String(link.target_id)) }).map(function (link) { return Object.assign({}, link) })
    }
    this.clipboardOffset = 0
    return GraphCanvas.clipboard
  }
  GraphCanvas.prototype.pasteSelection = function (point) {
    var clipboard = GraphCanvas.clipboard
    if (!clipboard || !clipboard.nodes || !clipboard.nodes.length) return []
    point = point || this.graph_mouse || [80, 80]
    this.clipboardOffset += 18
    var idMap = new Map()
    var pasted = []
    this.clearSelection()
    clipboard.nodes.forEach(function (saved) {
      var node = PandaUI.createNode(saved.type, saved.title)
      if (!node) return
      var oldId = saved.id
      var data = PandaUI.cloneObject(saved)
      data.id = null
      data.pos = [point[0] + saved.pos[0] + this.clipboardOffset, point[1] + saved.pos[1] + this.clipboardOffset]
      node.configure(data)
      node.id = null
      this.graph.add(node, { silent: true })
      idMap.set(String(oldId), node)
      pasted.push(node)
      this.selectNode(node, true)
    }, this)
    clipboard.links.forEach(function (link) {
      var source = idMap.get(String(link.origin_id))
      var target = idMap.get(String(link.target_id))
      if (source && target) this.graph.connect(source, link.origin_slot, target, link.target_slot, { silent: true, append: true })
    }, this)
    if (pasted.length) this.graph.commitHistory('paste-nodes')
    this.graph.setDirtyCanvas()
    return pasted
  }
  GraphCanvas.prototype.deleteSelection = function () {
    var nodes = Object.keys(this.selected_nodes).map(function (id) { return this.selected_nodes[id] }, this)
    nodes.forEach(function (node) { this.graph.remove(node, { silent: true }) }, this)
    if (nodes.length) this.graph.commitHistory('delete-nodes')
    this.clearSelection()
    return nodes.length
  }
  GraphCanvas.prototype.duplicateSelection = function () {
    if (!this.copySelection()) return []
    return this.pasteSelection(this.graph_mouse)
  }
  GraphCanvas.prototype.fitView = function (nodes) {
    nodes = nodes && nodes.length ? nodes : this.graph._nodes
    var groups = this.renderGroups ? ensureGroups(this.graph) : []
    if (!nodes.length && !groups.length) { this.scale = 1; this.offset = [0, 0]; this.ds.scale = 1; this.ds.offset = this.offset; this.setDirty(); return }
    var left = Infinity; var top = Infinity; var right = -Infinity; var bottom = -Infinity
    nodes.forEach(function (node) {
      left = Math.min(left, node.pos[0]); top = Math.min(top, node.pos[1] - PandaUI.NODE_TITLE_HEIGHT)
      right = Math.max(right, node.pos[0] + this.nodeDisplayWidth(node)); bottom = Math.max(bottom, node.pos[1] + this.nodeBodyHeight(node))
    }, this)
    groups.forEach(function (group) { left = Math.min(left, group.pos[0]); top = Math.min(top, group.pos[1]); right = Math.max(right, group.pos[0] + group.size[0]); bottom = Math.max(bottom, group.pos[1] + group.size[1]) })
    var rect = this.canvas.getBoundingClientRect()
    var width = Math.max(1, right - left); var height = Math.max(1, bottom - top); var margin = 50
    this.scale = Math.max(0.2, Math.min(3, Math.min((rect.width - margin * 2) / width, (rect.height - margin * 2) / height)))
    this.offset = [(rect.width / this.scale - width) * 0.5 - left, (rect.height / this.scale - height) * 0.5 - top]
    this.ds.scale = this.scale; this.ds.offset = this.offset
    this.setDirty()
  }
  GraphCanvas.prototype.resetView = function () {
    this.scale = 1
    this.offset = [0, 0]
    this.ds.scale = 1
    this.ds.offset = this.offset
    this.setDirty()
  }
  GraphCanvas.prototype.setEditorMode = function (active) {
    if (this.tooltip) this.tooltip.hide()
    this.editorModeActive = active !== false
    if (!this.editorModeActive) this.cancelPointerInteraction()
    this.syncNodeModeLayout(true)
    if (typeof global.PandaUISyncPanelNodes === 'function') global.PandaUISyncPanelNodes(this, true)
    if (typeof global.PandaUISyncWidgetControls === 'function') global.PandaUISyncWidgetControls(this)
    this.setDirty()
    return this.editorModeActive
  }
  GraphCanvas.prototype.syncNodeModeLayout = function (force) {
    // Apply the active workspace to new/restored nodes too, without a graph edit
    // or solution request. Manual collapse remains available until the next switch.
    if (!this._modeLayoutNodes) this._modeLayoutNodes = new WeakSet()
    this.graph._nodes.forEach(function (node) {
      if (!force && this._modeLayoutNodes.has(node)) return
      node.flags = node.flags || {}
      node.flags.collapsed = !this.editorModeActive
      this._modeLayoutNodes.add(node)
    }, this)
  }
  GraphCanvas.prototype.stopEdgePan = function () {
    if (this._edgePanHandle != null) {
      if (this._edgePanUsesAnimationFrame && typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(this._edgePanHandle)
      else if (typeof global.clearTimeout === 'function') global.clearTimeout(this._edgePanHandle)
    }
    this._edgePanHandle = null
    this._edgePanPointer = null
    this._edgePanUsesAnimationFrame = false
  }
  GraphCanvas.prototype.edgePanStep = function () {
    if (!this.pointer || this.pointer.mode !== 'node' || !this._edgePanPointer) {
      this.stopEdgePan()
      return
    }
    var rect = this.canvas.getBoundingClientRect()
    var margin = Math.min(64, Math.max(24, Math.min(rect.width, rect.height) * 0.12))
    var x = this._edgePanPointer[0] - rect.left
    var y = this._edgePanPointer[1] - rect.top
    var maxSpeed = 12
    var panX = 0
    var panY = 0
    if (x < margin) panX = Math.max(1, maxSpeed * (1 - Math.max(0, x) / margin))
    else if (x > rect.width - margin) panX = -Math.max(1, maxSpeed * (1 - Math.max(0, rect.width - x) / margin))
    if (y < margin) panY = Math.max(1, maxSpeed * (1 - Math.max(0, y) / margin))
    else if (y > rect.height - margin) panY = -Math.max(1, maxSpeed * (1 - Math.max(0, rect.height - y) / margin))
    if (!panX && !panY) {
      this.stopEdgePan()
      return
    }
    this.offset[0] += panX / this.scale
    this.offset[1] += panY / this.scale
    this.ds.offset = this.offset
    var point = this.toGraph(this._edgePanPointer[0], this._edgePanPointer[1])
    this.graph_mouse = point
    this.applyNodeDrag(point)
    this.setDirty()
    this.scheduleEdgePan()
  }
  GraphCanvas.prototype.scheduleEdgePan = function () {
    if (this._edgePanHandle != null || !this._edgePanPointer) return
    var callback = function () {
      this._edgePanHandle = null
      this.edgePanStep()
    }.bind(this)
    if (typeof global.requestAnimationFrame === 'function') {
      this._edgePanUsesAnimationFrame = true
      this._edgePanHandle = global.requestAnimationFrame(callback)
    } else if (typeof global.setTimeout === 'function') {
      this._edgePanUsesAnimationFrame = false
      this._edgePanHandle = global.setTimeout(callback, 16)
    }
  }
  GraphCanvas.prototype.updateEdgePan = function (clientX, clientY) {
    if (!this.pointer || this.pointer.mode !== 'node') {
      this.stopEdgePan()
      return
    }
    var rect = this.canvas.getBoundingClientRect()
    var margin = Math.min(64, Math.max(24, Math.min(rect.width, rect.height) * 0.12))
    var x = clientX - rect.left
    var y = clientY - rect.top
    var nearEdge = x < margin || x > rect.width - margin || y < margin || y > rect.height - margin
    if (!nearEdge) {
      this.stopEdgePan()
      return
    }
    this._edgePanPointer = [clientX, clientY]
    this.scheduleEdgePan()
  }
  GraphCanvas.prototype.applyNodeDrag = function (point) {
    if (!this.pointer || this.pointer.mode !== 'node') return
    var nodeDeltaX = point[0] - this.pointer.start[0]
    var nodeDeltaY = point[1] - this.pointer.start[1]
    this.pointer.nodes.forEach(function (selected, index) {
      var x = this.pointer.origins[index][0] + nodeDeltaX
      var y = this.pointer.origins[index][1] + nodeDeltaY
      selected.pos[0] = this.snapToGrid ? Math.round(x / this.gridSize) * this.gridSize : x
      selected.pos[1] = this.snapToGrid ? Math.round(y / this.gridSize) * this.gridSize : y
    }, this)
  }
  GraphCanvas.prototype.centerSelection = function () {
    var nodes = Object.keys(this.selected_nodes).map(function (id) { return this.selected_nodes[id] }, this)
    if (nodes.length) this.fitView(nodes)
    return nodes.length
  }
  GraphCanvas.prototype.updateVisibleArea = function () {
    var rect = this.canvas.getBoundingClientRect()
    this.visible_area[0] = -this.offset[0]
    this.visible_area[1] = -this.offset[1]
    this.visible_area[2] = rect.width / this.scale
    this.visible_area[3] = rect.height / this.scale
    return this.visible_area
  }
  GraphCanvas.prototype.isNodeVisible = function (node) {
    var area = this.visible_area
    var width = this.nodeDisplayWidth(node)
    var top = node.pos[1] - PandaUI.NODE_TITLE_HEIGHT
    var height = this.nodeBodyHeight(node) + PandaUI.NODE_TITLE_HEIGHT
    return node.pos[0] + width >= area[0] && node.pos[0] <= area[0] + area[2] && top + height >= area[1] && top <= area[1] + area[3]
  }
  GraphCanvas.prototype.setWidgetValue = function (hit, value, reason) {
    var widget = hit.widget
    var node = hit.node
    var oldValue = widget.property ? node.properties[widget.property] : widget.value
    widget.value = value
    if (widget.property) node.properties[widget.property] = value
    if (typeof widget.callback === 'function') widget.callback(value, widget, node)
    if (typeof this.graph.onWidgetChanged === 'function') this.graph.onWidgetChanged(node, widget.name, value, oldValue, widget)
    node.setDirtyCanvas(true, true)
    this.graph.invalidateNode(node, { source: true, propagate: true, reason: reason || 'widget' })
    if (oldValue !== value) this.graph.events.emit('widget-changed', { node: node, widget: widget, value: value, oldValue: oldValue })
  }
  GraphCanvas.prototype.activateWidget = function (hit, point) {
    var widget = hit.widget
    if (widget.type === 'button') {
      if (typeof widget.callback === 'function') widget.callback(widget, hit.node)
      return false
    }
    if (widget.type === 'color') {
      var canvas = this
      global.PandaUIWidgetPickers.color(widget.property ? hit.node.properties[widget.property] : widget.value,
        function (value) { if (hit.node.graph === canvas.graph) canvas.setWidgetValue(hit, value, 'widget-color') },
        function () { if (hit.node.graph === canvas.graph) canvas.graph.commitHistory('widget-color', hit.node) })
    } else if (widget.type === 'toggle') this.setWidgetValue(hit, !(widget.property ? hit.node.properties[widget.property] : widget.value), 'widget-toggle')
    else if (widget.type === 'combo') {
      var values = widget.options && widget.options.values || []
      var current = widget.property ? hit.node.properties[widget.property] : widget.value
      this.setWidgetValue(hit, values.length ? values[(Math.max(0, values.indexOf(current)) + 1) % values.length] : current, 'widget-combo')
    } else if (widget.type === 'number') {
      var currentValue = widget.property ? hit.node.properties[widget.property] : widget.value
      var entered = global.prompt(widget.name, String(currentValue == null ? 0 : currentValue))
      if (entered != null && Number.isFinite(Number(entered))) this.setWidgetValue(hit, Number(entered), 'widget-number')
    } else if (widget.type === 'text') {
      var currentText = widget.property ? hit.node.properties[widget.property] : widget.value
      var text = global.prompt(widget.name, String(currentText == null ? '' : currentText))
      if (text != null) this.setWidgetValue(hit, text, 'widget-text')
    } else if (widget.type === 'slider') this.updateSliderWidget(hit, point)
    return widget.type === 'slider'
  }
  GraphCanvas.prototype.updateSliderWidget = function (hit, point) {
    var options = hit.widget.options || {}
    var min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0
    var max = Number.isFinite(Number(options.max)) ? Number(options.max) : 1
    var step = Number(options.step) || 0
    var ratio = Math.max(0, Math.min(1, (point[0] - hit.left) / Math.max(1, hit.width)))
    var value = min + (max - min) * ratio
    if (step > 0) value = Math.round(value / step) * step
    this.setWidgetValue(hit, value, 'widget-slider')
  }
  GraphCanvas.prototype.bindEvents = function () {
    this.canvas.addEventListener('contextmenu', function (event) {
      event.preventDefault()
      if (this.lastRightDragMoved) { this.lastRightDragMoved = false; return }
      var point = this.toGraph(event.clientX, event.clientY)
      this.showContextMenu(event, this.nodeAt(point), this.groupAt(point), this.linkAt(point))
    }.bind(this))
    this.canvas.addEventListener('pointerdown', function (event) {
      this.closeMenu()
      this.canvas.focus()
      var point = this.toGraph(event.clientX, event.clientY)
      this.graph_mouse = point
      if (event.button === 1) {
        event.preventDefault()
        event.stopPropagation()
        if (!event.shiftKey) this.clearSelection()
        this.selected_group = null
        this.selectionRect = [point[0], point[1], point[0], point[1]]
        this.pointer = { mode: 'select', start: point, moved: false, add: event.shiftKey, button: event.button }
        if (!event.pandauiForwardedGesture) this.canvas.setPointerCapture(event.pointerId)
        if (this.interactionController) this.interactionController.handlePointer('down', event)
        this.setDirty()
        return
      }
      var slot = this.slotAt(point)
      var node = this.nodeAt(point)
      var group = node ? null : this.groupAt(point)
      var widget = event.button === 0 ? this.widgetAt(point) : null
      var resizing = event.button === 0 && node && this.nodeResizeHandleAt(point, node)
      var panning = event.button === 2 || event.button === 0 && (event.altKey || !event.shiftKey && !node && !slot && !group)
      if (panning) {
        this.pointer = { mode: 'pan', start: point, startClient: [event.clientX, event.clientY], lastClient: [event.clientX, event.clientY], moved: false, button: event.button }
        this.canvas.style.cursor = 'grabbing'
      } else if (resizing) {
        this.selectNode(node, event.shiftKey)
        this.pointer = { mode: 'resize', node: node, start: point, originSize: node.size.slice(), moved: false, button: event.button }
        this.canvas.style.cursor = 'nwse-resize'
      } else if (widget) {
        var dragging = this.activateWidget(widget, point)
        this.pointer = { mode: dragging ? 'widget' : 'widget-click', widget: widget, start: point, moved: false, button: event.button }
      } else if (event.button === 0 && slot) {
        var connectionSlot = slot.input ? slot.node.inputs[slot.index] : slot.node.outputs[slot.index]
        this.connecting = {
          node: slot.node,
          index: slot.index,
          direction: slot.input ? 'input' : 'output',
          type: connectionSlot && connectionSlot.type,
          start: slot.pos,
          current: point
        }
        this.pointer = { mode: 'connect', start: point, last: point, moved: false, button: event.button }
      } else if (event.button === 0 && node) {
        var local = [point[0] - node.pos[0], point[1] - node.pos[1]]
        event.canvasX = point[0]
        event.canvasY = point[1]
        if (local[1] >= 0 && typeof node.onMouseDown === 'function' && node.onMouseDown(event, local, this)) {
          this.pointer = { mode: 'node-interaction', node: node, start: point, moved: false, button: event.button }
          if (!event.pandauiForwardedGesture) this.canvas.setPointerCapture(event.pointerId)
          this.setDirty()
          return
        }
        if ((event.ctrlKey || event.metaKey) && this.selected_nodes[node.id]) this.deselectNode(node)
        else {
          if (!this.selected_nodes[node.id]) this.selectNode(node, event.shiftKey)
          var dragNodes = Object.keys(this.selected_nodes).map(function (id) { return this.selected_nodes[id] }, this).filter(function (selected) { return !(selected.flags && selected.flags.pinned) })
          this.pointer = {
            mode: node.flags && node.flags.pinned ? 'node-click' : 'node',
            node: node,
            nodes: dragNodes,
            origins: dragNodes.map(function (selected) { return selected.pos.slice() }),
            start: point,
            moved: false,
            button: event.button
          }
        }
      } else if (event.button === 0 && group) {
        this.selected_group = group
        var groupNodes = this.updateGroupNodes(group).filter(function (selected) { return !(selected.flags && selected.flags.pinned) })
        this.pointer = {
          mode: this.groupResizeHandleAt(point, group) ? 'group-resize' : 'group',
          group: group,
          nodes: groupNodes,
          nodeOrigins: groupNodes.map(function (selected) { return selected.pos.slice() }),
          origin: group.pos.slice(),
          originSize: group.size.slice(),
          start: point,
          moved: false,
          button: event.button
        }
      } else if (event.button === 0) {
        if (!event.shiftKey) this.clearSelection()
        this.selected_group = null
        this.selectionRect = [point[0], point[1], point[0], point[1]]
        this.pointer = { mode: 'select', start: point, moved: false, add: event.shiftKey, button: event.button }
      }
      if (this.pointer && !event.pandauiForwardedGesture) this.canvas.setPointerCapture(event.pointerId)
      if (this.interactionController) this.interactionController.handlePointer('down', event)
      this.setDirty()
    }.bind(this))
    this.canvas.addEventListener('pointermove', function (event) {
      var point = this.toGraph(event.clientX, event.clientY)
      this.graph_mouse = point
      if (!this.pointer) {
        var hoverNode = this.nodeAt(point)
        this.hoveredNodeId = hoverNode ? String(hoverNode.id) : null
        var hoverGroup = hoverNode ? null : this.groupAt(point)
        var hoveredLink = hoverNode || hoverGroup ? null : this.linkAt(point)
        var nextHoveredLinkId = hoveredLink ? String(hoveredLink.id) : null
        if (nextHoveredLinkId !== this.hoveredLinkId) { this.hoveredLinkId = nextHoveredLinkId; this.setDirty() }
        this.canvas.style.cursor = this.nodeResizeHandleAt(point, hoverNode) || this.groupResizeHandleAt(point, hoverGroup) ? 'nwse-resize' : (hoveredLink ? 'pointer' : 'default')
        if (this.interactionController) this.interactionController.handlePointer('move', event)
        return
      }
      var moved = this.pointer.startClient
        ? Math.hypot(event.clientX - this.pointer.startClient[0], event.clientY - this.pointer.startClient[1]) > 2
        : Math.hypot(point[0] - this.pointer.start[0], point[1] - this.pointer.start[1]) > 2 / this.scale
      if (moved) this.pointer.moved = true
      if (this.pointer.mode === 'node') {
        this.updateEdgePan(event.clientX, event.clientY)
        this.applyNodeDrag(point)
      } else if (this.pointer.mode === 'resize') {
        this.resizeNodeTo(
          this.pointer.node,
          this.pointer.originSize[0] + point[0] - this.pointer.start[0],
          this.pointer.originSize[1] + point[1] - this.pointer.start[1]
        )
      } else if (this.pointer.mode === 'pan') {
        var dx = (event.clientX - this.pointer.lastClient[0]) / this.scale
        var dy = (event.clientY - this.pointer.lastClient[1]) / this.scale
        this.offset[0] += dx; this.offset[1] += dy
        this.pointer.lastClient = [event.clientX, event.clientY]
      } else if (this.pointer.mode === 'select') {
        this.selectionRect[2] = point[0]; this.selectionRect[3] = point[1]
      } else if (this.pointer.mode === 'group') {
        var groupDeltaX = point[0] - this.pointer.start[0]
        var groupDeltaY = point[1] - this.pointer.start[1]
        this.pointer.group.pos[0] = this.pointer.origin[0] + groupDeltaX
        this.pointer.group.pos[1] = this.pointer.origin[1] + groupDeltaY
        this.pointer.nodes.forEach(function (selected, index) {
          selected.pos[0] = this.pointer.nodeOrigins[index][0] + groupDeltaX
          selected.pos[1] = this.pointer.nodeOrigins[index][1] + groupDeltaY
        }, this)
      } else if (this.pointer.mode === 'group-resize') {
        this.pointer.group.size[0] = Math.max(140, this.pointer.originSize[0] + point[0] - this.pointer.start[0])
        this.pointer.group.size[1] = Math.max(80, this.pointer.originSize[1] + point[1] - this.pointer.start[1])
      } else if (this.pointer.mode === 'connect') this.connecting.current = point
      else if (this.pointer.mode === 'widget') this.updateSliderWidget(this.pointer.widget, point)
      else if (this.pointer.mode === 'node-interaction' && typeof this.pointer.node.onMouseMove === 'function') {
        event.canvasX = point[0]
        event.canvasY = point[1]
        this.pointer.node.onMouseMove(event, [point[0] - this.pointer.node.pos[0], point[1] - this.pointer.node.pos[1]], this)
      }
      if (this.interactionController) this.interactionController.handlePointer('move', event)
      this.setDirty()
    }.bind(this))
    this.canvas.addEventListener('pointerup', function (event) {
      var point = this.toGraph(event.clientX, event.clientY)
      if (this.connecting) {
        var pendingConnection = this.connecting
        var target = this.slotAt(point)
        var connected = false
        if (pendingConnection.direction === 'input' && target && !target.input) {
          connected = !!this.graph.connect(target.node, target.index, pendingConnection.node, pendingConnection.index, { append: true })
        } else if (pendingConnection.direction === 'output' && target && target.input) {
          connected = !!this.graph.connect(pendingConnection.node, pendingConnection.index, target.node, target.index)
        }
        if (!connected && this.pointer && this.pointer.moved) {
          this.showAddNodeMenu(event.clientX, event.clientY, point, [], {
            node: pendingConnection.node,
            index: pendingConnection.index,
            direction: pendingConnection.direction,
            type: pendingConnection.type
          })
        }
      } else if (this.pointer && this.pointer.mode === 'select') {
        if (this.pointer.moved && this.selectionRect) this.nodesInRectangle(this.selectionRect).forEach(function (node) { this.selectNode(node, true) }, this)
        this.selectionRect = null
      } else if (this.pointer && this.pointer.mode === 'pan' && this.pointer.button === 0 && !this.pointer.moved) {
        this.clearSelection()
        this.selected_group = null
      } else if (this.pointer && this.pointer.mode === 'node' && this.pointer.moved) this.graph.commitHistory('move-node', Object.values(this.selected_nodes))
      else if (this.pointer && this.pointer.mode === 'resize' && this.pointer.moved) this.graph.commitHistory('resize-node', this.pointer.node)
      else if (this.pointer && (this.pointer.mode === 'group' || this.pointer.mode === 'group-resize') && this.pointer.moved) this.graph.commitHistory('edit-group', [this.pointer.group].concat((this.pointer.nodes || []).map(function (entry) { return entry.node || entry })))
      else if (this.pointer && this.pointer.mode.indexOf('widget') === 0) this.graph.commitHistory('widget', this.pointer.widget && this.pointer.widget.node)
      else if (this.pointer && this.pointer.mode === 'node-interaction' && typeof this.pointer.node.onMouseUp === 'function') {
        event.canvasX = point[0]
        event.canvasY = point[1]
        this.pointer.node.onMouseUp(event, [point[0] - this.pointer.node.pos[0], point[1] - this.pointer.node.pos[1]], this)
      }
      if (this.interactionController) this.interactionController.handlePointer('up', event)
      if (this.pointer && this.pointer.button === 2) this.lastRightDragMoved = this.pointer.moved
      this.connecting = null
      this.stopEdgePan()
      this.pointer = null
      this.canvas.style.cursor = 'default'
      this.setDirty()
    }.bind(this))
    this.canvas.addEventListener('pointercancel', function () { this.cancelPointerInteraction() }.bind(this))
    this.canvas.addEventListener('lostpointercapture', function () {
      if (this.pointer) this.cancelPointerInteraction()
    }.bind(this))
    this.canvas.addEventListener('dblclick', function (event) {
      if (event.button !== 0 || !this.editorModeActive) return
      var point = this.toGraph(event.clientX, event.clientY)
      var node = this.nodeAt(point)
      if (node && typeof node.onDblClick === 'function') node.onDblClick(event, point, this)
      else if (!node && !this.groupAt(point)) {
        event.preventDefault()
        event.stopPropagation()
        this.showNodeChooser(event.clientX, event.clientY, point)
      }
    }.bind(this))
    this.canvas.addEventListener('wheel', function (event) {
      event.preventDefault()
      var before = this.toGraph(event.clientX, event.clientY)
      var node = this.nodeAt(before)
      if (node && typeof node.onMouseWheel === 'function' && node.onMouseWheel(event, [before[0] - node.pos[0], before[1] - node.pos[1]], this)) {
        this.setDirty()
        return
      }
      this.scale = Math.max(0.2, Math.min(3, this.scale * Math.exp(-event.deltaY * 0.001)))
      this.ds.scale = this.scale
      var after = this.toGraph(event.clientX, event.clientY)
      this.offset[0] += after[0] - before[0]; this.offset[1] += after[1] - before[1]
      this.setDirty()
    }.bind(this), { passive: false })
    this.canvas.addEventListener('dragover', function (event) { event.preventDefault() })
    this.canvas.addEventListener('drop', function (event) {
      event.preventDefault()
      var point = this.toGraph(event.clientX, event.clientY)
      var node = this.nodeAt(point)
      if (node && typeof node.onDropFile === 'function' && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        Array.prototype.forEach.call(event.dataTransfer.files, function (file) { node.onDropFile(file) })
      } else if (typeof this.onDropItem === 'function') this.onDropItem(event, point, node)
      this.setDirty()
    }.bind(this))
    this.canvas.addEventListener('keydown', function (event) {
      var key = event.key.toLowerCase()
      var command = event.ctrlKey || event.metaKey
      if (event.key === 'Delete' || event.key === 'Backspace') { if (this.deleteSelection()) event.preventDefault() }
      else if (command && key === 'a') { this.selectAll(); event.preventDefault() }
      else if (command && key === 'c') { this.copySelection(); event.preventDefault() }
      else if (command && key === 'x') { if (this.copySelection()) this.deleteSelection(); event.preventDefault() }
      else if (command && key === 'v') { this.pasteSelection(this.graph_mouse); event.preventDefault() }
      else if (command && key === 'd') { this.duplicateSelection(); event.preventDefault() }
      else if (command && key === 'g') { this.groupSelection(); event.preventDefault() }
      else if (command && key === 'z') { event.shiftKey ? this.graph.redo() : this.graph.undo(); event.preventDefault() }
      else if (command && key === 'y') { this.graph.redo(); event.preventDefault() }
      else if (key === 'f' || event.key === 'Home') { this.fitView(Object.keys(this.selected_nodes).map(function (id) { return this.selected_nodes[id] }, this)); event.preventDefault() }
      else if (event.key === 'Escape') { this.cancelPointerInteraction(); this.clearSelection(); event.preventDefault() }
      if (this.interactionController) this.interactionController.handleKey(event)
    }.bind(this))
    global.addEventListener('resize', this.resize.bind(this))
  }
  GraphCanvas.prototype.clearSelection = function () {
    Object.keys(this.selected_nodes).forEach(function (id) {
      var node = this.selected_nodes[id]; node.is_selected = false
      if (typeof node.onDeselected === 'function') node.onDeselected()
    }, this)
    this.selected_nodes = {}
    this.selected_group = null
    this.syncPreviewSelection()
    this.setDirty()
  }
  GraphCanvas.prototype.syncPreviewSelection = function () {
    if (global.parent && global.parent !== global) {
      global.parent.postMessage({ type: 'pandaui-node-preview-selection', nodeIds: Object.keys(this.selected_nodes) }, global.location.origin)
    }
  }
  GraphCanvas.prototype.cancelPointerInteraction = function () {
    if (this.pointer && this.pointer.node && typeof this.pointer.node.onMouseCancel === 'function') this.pointer.node.onMouseCancel()
    this.stopEdgePan()
    this.canvas.style.cursor = 'default'
    this.pointer = null; this.connecting = null; this.selectionRect = null; this.closeMenu(); this.setDirty()
  }
  GraphCanvas.prototype.draw = function () {
    this.dirty = false
    this.syncNodeModeLayout()
    var context = this.context
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    context.clearRect(0, 0, this.canvas.width / this.ratio, this.canvas.height / this.ratio)
    context.save()
    context.scale(this.scale, this.scale)
    context.translate(this.offset[0], this.offset[1])
    this.updateVisibleArea()
    this.drawGrid(context)
    if (this.background_image && this.background_image.complete) context.drawImage(this.background_image, this.visible_area[0], this.visible_area[1])
    if (typeof this.onDrawBackground === 'function') this.onDrawBackground(context)
    if (this.renderGroups) ensureGroups(this.graph).forEach(function (group) { this.drawGroup(context, group) }, this)
    this.graph.links.forEach(function (link) { this.drawLink(context, link) }, this)
    this.graph._nodes.forEach(function (node) { if (this.isNodeVisible(node)) this.drawNode(context, node) }, this)
    if (this.connecting) this.drawTemporaryLink(context)
    if (this.selectionRect) this.drawSelectionRectangle(context, this.selectionRect)
    if (typeof this.onDrawForeground === 'function') this.onDrawForeground(context)
    context.restore()
    if (typeof global.PandaUISyncPanelNodes === 'function') global.PandaUISyncPanelNodes(this)
    if (typeof global.PandaUISyncWidgetControls === 'function') global.PandaUISyncWidgetControls(this)
  }
  GraphCanvas.prototype.drawGrid = function (context) {
    context.strokeStyle = 'rgba(255,255,255,0.55)'; context.lineWidth = 1.2 / this.scale
    context.beginPath(); context.moveTo(-8, 0); context.lineTo(8, 0); context.moveTo(0, -8); context.lineTo(0, 8); context.stroke()
  }
  GraphCanvas.prototype.drawLink = function (context, link) {
    var curve = this.linkCurve(link)
    if (!curve) return
    var hovered = String(link.id) === this.hoveredLinkId
    context.save()
    context.globalAlpha = this.appearance.linkOpacity
    context.strokeStyle = this.linkColor(link); context.lineWidth = (this.appearance.linkWidth + (hovered ? 1 : 0)) / this.scale
    context.beginPath(); context.moveTo(curve.start[0], curve.start[1]); context.bezierCurveTo(curve.control1[0], curve.control1[1], curve.control2[0], curve.control2[1], curve.end[0], curve.end[1]); context.stroke()
    context.restore()
  }
  GraphCanvas.prototype.portTypeKey = function (type) {
    if (type === -1) return 'event'
    if (type == null || type === 0 || type === '*' || type === '') return 'generic'
    var key = String(type).toLowerCase().trim().replace(/\[\]$/, '').split('.').pop().replace(/^(gh_|param_)/, '')
    return portTypeAliases[key] || key
  }
  GraphCanvas.prototype.portTypeColor = function (type) {
    var key = this.portTypeKey(type)
    if (portTypeColors[key]) return portTypeColors[key]
    var hash = 0
    for (var index = 0; index < key.length; index++) hash = (hash * 31 + key.charCodeAt(index)) >>> 0
    return 'hsl(' + (hash % 360) + ', 38%, 38%)'
  }
  GraphCanvas.prototype.linkColor = function (link) {
    if (this.appearance.linkColorMode === 'custom') return this.appearance.linkColor
    var source = this.graph.getNodeById(link.origin_id)
    var target = this.graph.getNodeById(link.target_id)
    var type = source && source.outputs[link.origin_slot] && source.outputs[link.origin_slot].type
    if (this.portTypeKey(type) === 'generic') type = target && target.inputs[link.target_slot] && target.inputs[link.target_slot].type
    return this.portTypeColor(type)
  }
  GraphCanvas.prototype.drawGroup = function (context, group) {
    var selected = this.selected_group === group
    context.save()
    context.fillStyle = group.color
    context.globalAlpha = 0.25
    context.fillRect(group.pos[0], group.pos[1], group.size[0], group.size[1])
    context.globalAlpha = selected ? 0.95 : 0.62
    context.strokeStyle = group.color
    context.lineWidth = (selected ? 2 : 1) / this.scale
    context.strokeRect(group.pos[0], group.pos[1], group.size[0], group.size[1])
    context.globalAlpha = 0.9
    context.fillStyle = group.color
    context.font = Math.max(12, group.font_size) + 'px Arial'
    context.textBaseline = 'bottom'
    context.fillText(group.title, group.pos[0] + 8, group.pos[1] - 4)
    context.strokeStyle = group.color
    context.beginPath()
    context.moveTo(group.pos[0] + group.size[0] - 14, group.pos[1] + group.size[1])
    context.lineTo(group.pos[0] + group.size[0], group.pos[1] + group.size[1] - 14)
    context.stroke()
    context.restore()
  }
  GraphCanvas.prototype.drawSelectionRectangle = function (context, rectangle) {
    var left = Math.min(rectangle[0], rectangle[2]); var top = Math.min(rectangle[1], rectangle[3])
    var width = Math.abs(rectangle[2] - rectangle[0]); var height = Math.abs(rectangle[3] - rectangle[1])
    context.save()
    context.fillStyle = 'rgba(79, 172, 254, 0.25)'; context.strokeStyle = 'rgba(79, 172, 254, 0.9)'; context.lineWidth = 1 / this.scale
    context.fillRect(left, top, width, height); context.strokeRect(left, top, width, height)
    context.restore()
  }
  GraphCanvas.prototype.drawTemporaryLink = function (context) {
    var fromInput = this.connecting.direction === 'input'
    var a = fromInput ? this.connecting.current : this.connecting.start
    var b = fromInput ? this.connecting.start : this.connecting.current
    var distance = this.appearance.linkShape === 'straight' ? 0 : Math.max(50, Math.abs(b[0] - a[0]) * 0.45)
    context.save()
    context.globalAlpha = this.appearance.linkOpacity
    context.strokeStyle = this.appearance.linkColorMode === 'custom' ? this.appearance.linkColor : this.portTypeColor(this.connecting.type)
    context.lineWidth = this.appearance.linkWidth / this.scale
    context.beginPath(); context.moveTo(a[0], a[1]); context.bezierCurveTo(a[0] + distance, a[1], b[0] - distance, b[1], b[0], b[1]); context.stroke()
    context.restore()
  }
  GraphCanvas.prototype.roundedRect = function (context, x, y, width, height, radius) {
    if (typeof context.roundRect === 'function') { context.roundRect(x, y, width, height, radius); return }
    var value = Array.isArray(radius) ? Number(radius[0]) || 0 : Number(radius) || 0
    value = Math.min(value, Math.abs(width) / 2, Math.abs(height) / 2)
    context.moveTo(x + value, y)
    context.arcTo(x + width, y, x + width, y + height, value)
    context.arcTo(x + width, y + height, x, y + height, value)
    context.arcTo(x, y + height, x, y, value)
    context.arcTo(x, y, x + width, y, value)
  }
  GraphCanvas.prototype.drawNode = function (context, node) {
    var settings = this.appearance
    var selected = !!this.selected_nodes[node.id]
    var bodyHeight = this.nodeBodyHeight(node)
    var width = this.nodeDisplayWidth(node)
    var stateColors = { idle: '#ffffff', ready: '#ffffff', running: '#f4be4f', success: '#49b675', warning: '#d99b24', error: '#d94f4f', aborting: '#f4be4f', aborted: '#ffffff' }
    var color = stateColors[node._executionState] || stateColors.idle
    context.save(); context.filter = 'none'; context.globalAlpha = 1; context.translate(node.pos[0], node.pos[1])
    context.shadowColor = 'transparent'
    var execution = executionStatus(node)
    context.fillStyle = execution.color
    context.font = '12px ' + settings.fontFamily
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillText(execution.label, 0, -40)
    context.save()
    context.beginPath(); this.roundedRect(context, 0, -28, width, bodyHeight + 28, settings.cornerRadius); context.clip()
    if (bodyHeight && settings.backgroundOpacity > 0) {
      context.fillStyle = NodeAppearance.rgba(settings.backgroundColor, settings.backgroundOpacity); context.fillRect(0, 0, width, bodyHeight)
    }
    context.fillStyle = NodeAppearance.rgba(settings.titleBackgroundColor, settings.titleOpacity); context.fillRect(0, -28, width, 28)
    context.restore()
    context.strokeStyle = selected ? settings.selectedBorderColor : settings.borderColor
    var borderWidth = selected ? settings.selectedBorderWidth : settings.borderWidth
    if (borderWidth > 0) {
      context.lineWidth = borderWidth / this.scale
      context.beginPath(); this.roundedRect(context, 0, -28, width, bodyHeight + 28, settings.cornerRadius); context.stroke()
    }
    if (settings.showStatusLine) {
      context.strokeStyle = color; context.lineWidth = 1 / this.scale
      context.beginPath(); context.moveTo(1, 0); context.lineTo(width - 1, 0); context.stroke()
    }
    context.fillStyle = settings.titleColor; context.font = '600 ' + settings.titleFontSize + 'px ' + settings.fontFamily
    context.textBaseline = 'middle'; context.textAlign = 'left'
    context.fillText(typeof node.getTitle === 'function' ? node.getTitle() : (node.title || node.type), 10, -14, Math.max(1, width - (settings.showStatusBadge ? 42 : 20)))
    if (!(node.flags && node.flags.collapsed) && typeof node.onDrawBackground === 'function') {
      context.save(); node.onDrawBackground(this.nodeContentContext(context), this); context.restore()
    }
    context.font = settings.fontSize + 'px ' + settings.fontFamily
    var portTextColor = settings.textColor
    var labelWidth = function (ports) { return ports.reduce(function (maximum, port) { var metrics = context.measureText(port.name); return Math.max(maximum, metrics && metrics.width || String(port.name).length * settings.fontSize * 0.6) }, 0) }
    var inputWidth = labelWidth(node.inputs); var outputWidth = labelWidth(node.outputs)
    var labelScale = Math.min(1, Math.max(1, width - 32) / Math.max(1, inputWidth + outputWidth))
    if (!(node.flags && node.flags.collapsed)) node.inputs.forEach(function (slot, index) {
      var y = 34 + index * 22; context.fillStyle = settings.portColorMode === 'custom' ? settings.portColor : this.portTypeColor(slot.type)
      context.beginPath(); context.arc(0, y, settings.portRadius, 0, Math.PI * 2); context.fill()
      context.fillStyle = portTextColor; context.textAlign = 'left'; context.fillText(slot.name, 10, y, Math.max(1, inputWidth * labelScale))
    }, this)
    if (!(node.flags && node.flags.collapsed)) node.outputs.forEach(function (slot, index) {
      var y = 34 + index * 22; context.fillStyle = settings.portColorMode === 'custom' ? settings.portColor : this.portTypeColor(slot.type)
      context.beginPath(); context.arc(node.size[0], y, settings.portRadius, 0, Math.PI * 2); context.fill()
      context.fillStyle = portTextColor; context.textAlign = 'right'; context.fillText(slot.name, node.size[0] - 10, y, Math.max(1, outputWidth * labelScale))
    }, this)
    var widgetY = this.widgetStartOffset(node)
    if (!node.widgetUI && !(node.flags && node.flags.collapsed)) node.widgets.forEach(function (widget, index) {
      var y = widgetY + index * 24
      context.fillStyle = NodeAppearance.rgba(settings.controlBackgroundColor, settings.controlOpacity); context.fillRect(8, y - 10, node.size[0] - 16, 20)
      var widgetValue = widget.property ? node.properties[widget.property] : widget.value
      if (widget.type === 'color') { context.fillStyle = /^#[\da-f]{6}$/i.test(widgetValue) ? widgetValue : '#ffffff'; context.fillRect(node.size[0] - 40, y - 7, 24, 14) }
      context.fillStyle = portTextColor; context.textAlign = 'left'; context.fillText(widget.name + ': ' + String(widgetValue), 13, y, Math.max(1, node.size[0] - (widget.type === 'color' ? 58 : 26)))
    }, this)
    var drawError = node._widgetRenderError ? 'Widget: ' + node._widgetRenderError : node._executionError
    if (!(node.flags && node.flags.collapsed) && drawError) { context.fillStyle = '#ff8a80'; context.textAlign = 'left'; context.font = '11px Arial'; context.fillText(String(drawError).slice(0, 60), 8, node.size[1] - 8, Math.max(1, width - 16)) }
    if (!(node.flags && node.flags.collapsed) && typeof node.onDrawForeground === 'function') {
      context.save(); node.onDrawForeground(this.nodeContentContext(context), this); context.restore()
    }
    if (settings.showResizeHandle && node.resizable !== false && !(node.flags && node.flags.collapsed)) {
      context.strokeStyle = settings.borderColor
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(node.size[0] - 11, node.size[1] - 3); context.lineTo(node.size[0] - 3, node.size[1] - 11)
      context.moveTo(node.size[0] - 7, node.size[1] - 3); context.lineTo(node.size[0] - 3, node.size[1] - 7)
      context.stroke()
    }
    if (this.renderer && node._attributes) this.renderer.drawNodeState(node, node._attributes.syncFromNode(), context)
    context.restore()
  }
  GraphCanvas.prototype.nodeContentContext = function (context) {
    var canvas = this
    if (!this._nodeContentContexts) this._nodeContentContexts = new WeakMap()
    if (this._nodeContentContexts.has(context)) return this._nodeContentContexts.get(context)
    var contentContext = new Proxy(context, {
      get: function (target, key) {
        if (key === 'fill' || key === 'fillRect') return function () {
          target.save(); target.globalAlpha = canvas.appearance.controlOpacity
          target.fillStyle = canvas.nodeBackgroundColor(target.fillStyle)
          target[key].apply(target, arguments); target.restore()
        }
        if (key === 'fillText' || key === 'strokeText') return function () {
          target.save(); target.globalAlpha = 1; target.filter = 'none'; target.shadowColor = 'transparent'
          target.fillStyle = canvas.appearance.textColor; target.strokeStyle = canvas.appearance.textColor
          target.font = target.font.replace(/[\d.]+px\s+.+$/, canvas.appearance.fontSize + 'px ' + canvas.appearance.fontFamily)
          target[key].apply(target, arguments); target.restore()
        }
        var value = target[key]
        return typeof value === 'function' ? value.bind(target) : value
      },
      set: function (target, key, value) { target[key] = value; return true }
    })
    this._nodeContentContexts.set(context, contentContext)
    return contentContext
  }
  GraphCanvas.prototype.nodeBackgroundColor = function (style) {
    if (typeof style !== 'string') return style
    if (!this._backgroundColors) {
      this._backgroundColors = new Map()
      var canvas = document.createElement('canvas')
      canvas.width = 1; canvas.height = 1
      this._backgroundColorContext = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (this._backgroundColors.has(style)) return this._backgroundColors.get(style)
    var context = this._backgroundColorContext
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = style; context.fillRect(0, 0, 1, 1)
    var color = context.getImageData(0, 0, 1, 1).data
    var opaque = color[3] ? 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')' : 'transparent'
    if (this._backgroundColors.size >= 256) this._backgroundColors.clear()
    this._backgroundColors.set(style, opaque)
    return opaque
  }
  GraphCanvas.prototype.closeMenu = function () {
    if (this.menu && this.menu._pandauiFitFrame && typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(this.menu._pandauiFitFrame)
    if (this.menu && this.menu.parentNode) this.menu.parentNode.removeChild(this.menu)
    this.menu = null
  }
  GraphCanvas.prototype.showContextMenu = function (event, node, group, link) {
    var slot = this.portMenuAt(this.toGraph(event.clientX, event.clientY))
    if (slot) this.showPortMenu(event.clientX, event.clientY, slot)
    else if (node) this.showNodeMenu(event.clientX, event.clientY, node)
    else if (group) this.showGroupMenu(event.clientX, event.clientY, group)
    else if (link) this.showLinkMenu(event.clientX, event.clientY, link)
    else this.showAddNodeMenu(event.clientX, event.clientY, this.toGraph(event.clientX, event.clientY))
  }
  GraphCanvas.prototype.portMenuAt = function (point) {
    var hit = this.slotAt(point)
    var node = this.nodeAt(point)
    if (hit && (!node || node === hit.node)) return hit
    if (!node || node.flags && node.flags.collapsed) return null
    this.context.save()
    this.context.font = '12px Arial'
    for (var direction = 0; direction < 2; direction++) {
      var input = direction === 0
      var ports = input ? node.inputs : node.outputs
      for (var index = 0; index < ports.length; index++) {
        var pos = this.slotPosition(node, input, index)
        var width = Math.min(node.size[0] / 2, this.context.measureText(ports[index].name).width + 16)
        if (Math.abs(point[1] - pos[1]) <= 10 && (input ? point[0] >= pos[0] && point[0] <= pos[0] + width : point[0] <= pos[0] && point[0] >= pos[0] - width)) {
          this.context.restore()
          return { node: node, input: input, index: index, pos: pos }
        }
      }
    }
    this.context.restore()
    return null
  }
  GraphCanvas.prototype.createMenu = function (x, y) {
    if (this.tooltip) this.tooltip.hide()
    this.closeMenu()
    var menu = document.createElement('div')
    menu.className = 'pandaui-node-menu'
    menu._pandauiAnchorX = Number(x) || 0
    menu._pandauiAnchorY = Number(y) || 0
    document.body.appendChild(menu)
    this.menu = menu
    this.scheduleMenuFit(menu)
    return menu
  }
  GraphCanvas.prototype.fitMenuToCanvas = function (menu) {
    if (!menu || !menu.parentNode || !this.canvas) return menu
    var canvasRect = this.canvas.getBoundingClientRect()
    var margin = 6
    var availableWidth = Math.max(1, canvasRect.width - margin * 2)
    var availableHeight = Math.max(1, canvasRect.height - margin * 2)
    var preferredMinimumWidth = menu.classList.contains('pandaui-node-menu--add') ? 180 : (menu.classList.contains('pandaui-node-menu--search') ? 300 : 220)
    menu.style.minWidth = Math.min(preferredMinimumWidth, availableWidth) + 'px'
    menu.style.maxWidth = availableWidth + 'px'
    menu.style.maxHeight = availableHeight + 'px'
    var width = Math.min(menu.offsetWidth, availableWidth)
    var height = Math.min(menu.offsetHeight, availableHeight)
    var minimumLeft = canvasRect.left + margin
    var minimumTop = canvasRect.top + margin
    var maximumLeft = Math.max(minimumLeft, canvasRect.right - width - margin)
    var maximumTop = Math.max(minimumTop, canvasRect.bottom - height - margin)
    menu.style.left = Math.max(minimumLeft, Math.min(menu._pandauiAnchorX, maximumLeft)) + 'px'
    menu.style.top = Math.max(minimumTop, Math.min(menu._pandauiAnchorY, maximumTop)) + 'px'
    return menu
  }
  GraphCanvas.prototype.scheduleMenuFit = function (menu) {
    if (!menu || !menu.parentNode) return
    if (menu._pandauiFitFrame && typeof global.cancelAnimationFrame === 'function') global.cancelAnimationFrame(menu._pandauiFitFrame)
    var fit = function () {
      menu._pandauiFitFrame = null
      this.fitMenuToCanvas(menu)
    }.bind(this)
    if (typeof global.requestAnimationFrame === 'function') menu._pandauiFitFrame = global.requestAnimationFrame(fit)
    else setTimeout(fit, 0)
  }
  GraphCanvas.prototype.addMenuItem = function (menu, label, callback) {
    var item = document.createElement('button'); item.type = 'button'; item.textContent = label; item.addEventListener('click', function () { this.closeMenu(); callback() }.bind(this)); menu.appendChild(item)
    this.scheduleMenuFit(this.menu || menu)
    return item
  }
  GraphCanvas.prototype.nodeMenuColor = function (value) {
    var palette = ['#83c5be', '#8ecae6', '#a8dadc', '#b8a1e5', '#f4a261', '#e9c46a', '#e5989b', '#90be6d', '#f28482', '#cdb4db', '#72b7b2', '#f6bd60']
    var key = String(value || 'node')
    var hash = 0
    for (var index = 0; index < key.length; index++) hash = (hash * 31 + key.charCodeAt(index)) >>> 0
    return palette[hash % palette.length]
  }
  GraphCanvas.prototype.styleNodeMenuItem = function (item, key) {
    if (!item) return item
    item.style.color = this.nodeMenuColor(key)
    item.style.borderLeft = '3px solid ' + this.nodeMenuColor(key)
    item.style.paddingLeft = '5px'
    item.dataset.nodeColor = 'true'
    return item
  }
  GraphCanvas.prototype.disconnectNodeInputs = function (node) {
    var changed = false
    node.inputs.forEach(function (input, index) {
      if (input.link == null) return
      node.disconnectInput(index, { silent: true })
      changed = true
    })
    if (changed) this.graph.commitHistory('disconnect-node-inputs')
    return changed
  }
  GraphCanvas.prototype.disconnectNodeOutputs = function (node) {
    var changed = false
    node.outputs.forEach(function (output, index) {
      if (!output.links || !output.links.length) return
      node.disconnectOutput(index, { silent: true })
      changed = true
    })
    if (changed) this.graph.commitHistory('disconnect-node-outputs')
    return changed
  }
  GraphCanvas.prototype.moveNodeInRenderOrder = function (node, front) {
    var index = this.graph._nodes.indexOf(node)
    if (index < 0) return false
    var ordered = this.graph._nodes.filter(function (item) { return item !== node })
    if (front) ordered.push(node)
    else ordered.unshift(node)
    this.graph.applyOperation({ type: 'reorder_nodes', payload: { ids: ordered.map(function (item) { return item.id }) } }, { label: front ? 'bring-node-front' : 'send-node-back' })
    this.setDirty()
    return true
  }
  GraphCanvas.prototype.showNodeMenu = function (x, y, node) {
    if (!this.selected_nodes[node.id]) this.selectNode(node)
    var menu = this.createMenu(x, y)
    this.addMenuItem(menu, Object.keys(this.selected_nodes).length > 1 ? 'Delete Selected Nodes' : 'Delete', function () { this.deleteSelection() }.bind(this))
    var groupItem = this.addMenuItem(menu, 'Group Selected Nodes', function () { this.groupSelection() }.bind(this))
    groupItem.disabled = Object.keys(this.selected_nodes).length < 2
    var previewItem = this.addMenuItem(menu, 'Show Preview', function () {
      node.setPreviewVisible(node.flags.previewVisible === false)
      this.graph.commitHistory('node-preview-visibility', node)
      this.setDirty()
    }.bind(this))
    previewItem.setAttribute('role', 'menuitemcheckbox')
    previewItem.setAttribute('aria-checked', String(node.flags.previewVisible !== false))
    var checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = node.flags.previewVisible !== false
    checkbox.tabIndex = -1
    checkbox.style.pointerEvents = 'none'
    checkbox.style.marginRight = '8px'
    previewItem.prepend(checkbox)
    this.addMenuItem(menu, 'Run Node', function () { this.graph.invalidateNode(node, { source: true, propagate: true, reason: 'manual' }) }.bind(this))
    var activeExecution = node._activeExecutionContext || node._executionAbort || node._executionState === 'running' || node._executionState === 'aborting'
    if (activeExecution) this.addMenuItem(menu, 'Abort', function () {
      if (typeof node.abortExecution === 'function') node.abortExecution()
      else if (this.graph && typeof this.graph.abortSolution === 'function') this.graph.abortSolution()
      this.setDirty()
    }.bind(this))
    this.addMenuItem(menu, node.flags && node.flags.collapsed ? 'Expand' : 'Collapse', function () {
      node.flags = node.flags || {}
      node.flags.collapsed = !node.flags.collapsed
      this.graph.commitHistory('collapse-node', node)
      this.setDirty()
    }.bind(this))
    this.addMenuItem(menu, node.flags && node.flags.pinned ? 'Unpin' : 'Pin', function () {
      node.flags = node.flags || {}
      node.flags.pinned = !node.flags.pinned
      this.graph.commitHistory('pin-node', node)
      this.setDirty()
    }.bind(this))
    this.addMenuItem(menu, 'Copy', function () { this.selectNode(node); this.copySelection() }.bind(this))
    this.addMenuItem(menu, 'Duplicate', function () { this.selectNode(node); this.duplicateSelection() }.bind(this))
    if (node.inputs.length) this.addMenuItem(menu, 'Disconnect Inputs >', function () { this.showDisconnectMenu(x, y, node, true) }.bind(this))
    if (node.outputs.length) this.addMenuItem(menu, 'Disconnect Outputs >', function () { this.showDisconnectMenu(x, y, node, false) }.bind(this))
    this.addMenuItem(menu, 'Bring to Front', function () { this.moveNodeInRenderOrder(node, true) }.bind(this))
    this.addMenuItem(menu, 'Send to Back', function () { this.moveNodeInRenderOrder(node, false) }.bind(this))
    this.addMenuItem(menu, 'Runtime Information >', function () { this.showRuntimeMenu(x, y, node) }.bind(this))
    ;(typeof node.getExtraMenuOptions === 'function' ? node.getExtraMenuOptions(this) || [] : []).forEach(function (option) { this.addMenuItem(menu, option.content || option.label || 'Action', function () { if (option.callback) option.callback(node, option, null, menu, this) }) }, this)
  }
  GraphCanvas.prototype.showPortMenu = function (x, y, hit) {
    var node = hit.node
    var port = (hit.input ? node.inputs : node.outputs)[hit.index]
    if (!port) return
    var menu = this.createMenu(x, y)
    menu.dataset.portDirection = hit.input ? 'input' : 'output'
    menu.dataset.portIndex = String(hit.index)
    var heading = document.createElement('div')
    heading.style.cssText = 'padding:8px 12px;font-weight:600;overflow-wrap:anywhere;'
    heading.textContent = (hit.input ? 'Input: ' : 'Output: ') + port.name + ' (' + this.portTypeKey(port.type) + ')'
    menu.appendChild(heading)
    var addToggle = function (label, key) {
      var item = this.addMenuItem(menu, label, function () {
        port.previewAttributes[key] = port.previewAttributes[key] === false
        port.refreshPreviewVisibility()
        this.graph.commitHistory('port-preview-visibility', node)
        this.setDirty()
      }.bind(this))
      item.setAttribute('role', 'menuitemcheckbox')
      item.setAttribute('aria-checked', String(port.previewAttributes[key] !== false))
      var checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.checked = port.previewAttributes[key] !== false
      checkbox.tabIndex = -1
      checkbox.style.cssText = 'pointer-events:none;margin-right:8px;'
      item.prepend(checkbox)
    }.bind(this)
    addToggle('Show Preview', 'visible')
    addToggle('Preview Mesh', 'meshVisible')
    addToggle('Preview Edges / Points', 'wireVisible')
    this.addMenuItem(menu, 'Zoom', function () { port.zoomPreview() })
    if (!hit.input) this.addMenuItem(menu, 'Bake', function () { port.bakePreview() })
    var disconnect = this.addMenuItem(menu, 'Disconnect', function () {
      if (hit.input) node.disconnectInput(hit.index)
      else node.disconnectOutput(hit.index)
    })
    disconnect.disabled = hit.input ? !node.getInputLinks(hit.index).length : !(port.links && port.links.length)
    this.addMenuItem(menu, 'Node Menu >', function () { this.showNodeMenu(x, y, node) }.bind(this))
  }
  GraphCanvas.prototype.showDisconnectMenu = function (x, y, node, isInput) {
    var menu = this.createMenu(x, y)
    this.addMenuItem(menu, '< Back', function () { this.showNodeMenu(x, y, node) }.bind(this))
    var ports = isInput ? node.inputs : node.outputs
    var disconnect = function (index) { if (isInput) node.disconnectInput(index); else node.disconnectOutput(index) }
    var all = this.addMenuItem(menu, isInput ? 'All Inputs' : 'All Outputs', function () {
      if (isInput) this.disconnectNodeInputs(node); else this.disconnectNodeOutputs(node)
    }.bind(this))
    all.disabled = !ports.some(function (port, index) { return isInput ? node.isInputConnected(index) : node.isOutputConnected(index) })
    ports.forEach(function (port, index) {
      var count = isInput ? node.getInputLinks(index).length : (port.links || []).length
      var item = this.addMenuItem(menu, (index + 1) + '. ' + (port.label || port.name) + ' (' + count + ')', function () { disconnect(index) })
      item.disabled = count === 0
    }, this)
  }
  GraphCanvas.prototype.showRuntimeMenu = function (x, y, node) {
    var menu = this.createMenu(x, y)
    this.addMenuItem(menu, '< Back', function () { this.showNodeMenu(x, y, node) }.bind(this))
    var messages = node._runtimeMessages || {}
    var sections = [
      { title: 'Request Error', values: node._executionError ? [node._executionError] : [] },
      { title: 'Errors', values: messages.errors || [] },
      { title: 'Warnings', values: messages.warnings || [] },
      { title: 'Remarks', values: messages.remarks || [] }
    ]
    var content = document.createElement('div')
    content.style.cssText = 'padding:8px 12px;max-width:420px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;'
    content.setAttribute('role', 'status')
    var state = 'State: ' + (node._executionState || 'idle')
    content.textContent = state + '\n\n' + (sections.filter(function (section) { return section.values.length }).map(function (section) {
      return section.title + '\n' + section.values.map(String).join('\n')
    }).join('\n\n') || 'No runtime messages.')
    menu.appendChild(content)
    this.scheduleMenuFit(menu)
  }
  GraphCanvas.prototype.showGroupMenu = function (x, y, group) {
    var menu = this.createMenu(x, y)
    this.addMenuItem(menu, 'Rename', function () {
      var title = global.prompt('Group name', group.title)
      if (title == null) return
      group.title = String(title) || 'Group'
      this.graph.commitHistory('rename-group', group)
      this.setDirty()
    }.bind(this))
    this.addMenuItem(menu, 'Select Nodes', function () {
      this.clearSelection()
      this.updateGroupNodes(group).forEach(function (node) { this.selectNode(node, true) }, this)
    }.bind(this))
    this.addMenuItem(menu, 'Fit View', function () { this.fitView(this.updateGroupNodes(group)) }.bind(this))
    this.addMenuItem(menu, 'Delete Group', function () { this.graph.removeGroup(group); if (this.selected_group === group) this.selected_group = null }.bind(this))
  }
  GraphCanvas.prototype.showLinkMenu = function (x, y, link) {
    var menu = this.createMenu(x, y)
    this.addMenuItem(menu, 'Delete Connection', function () { this.graph.removeLink(link.id) }.bind(this))
  }
  GraphCanvas.prototype.availableNodeTypes = function (includeHidden) {
    return Object.keys(PandaUI.nodeTypes).sort().filter(function (type) {
      var constructor = PandaUI.nodeTypes[type]
      if (!constructor || constructor.pandauiPluginEnabled === false) return false
      if (includeHidden === true) return true
      var definition = constructor.pandauiDefinition || {}
      var exposure = String(definition.exposure || constructor.exposure || '').toLowerCase()
      return exposure !== 'hidden' && exposure.indexOf('hidden') === -1
    })
  }
  // Presentation paths only. Registered type strings remain serialization keys.
  var nodeMenuRoots = ['Panels', 'Parameters', 'Data', 'Math', 'Geometry', 'Transform', 'Display', 'Render', 'Robotics', 'Scripting', 'AI', 'Extensions']
  var nodeMenuAliases = {
    panels: ['Panels'], params: ['Parameters'], parameters: ['Parameters'],
    input: ['Parameters', 'Input'], widget: ['Parameters', 'Input'],
    basic: ['Data', 'Basic'], convert: ['Data', 'Conversion'], list: ['Data', 'Lists'],
    sets: ['Data', 'Sets'], string: ['Data', 'Text'], pandaui: ['Data', 'Trees'], data: ['Data'],
    math: ['Math'], maths: ['Math'], math3d: ['Math', '3D'], logic: ['Math', 'Logic'],
    geometry: ['Geometry', 'Utilities'], curve: ['Geometry', 'Curves'], surface: ['Geometry', 'Surfaces'],
    mesh: ['Geometry', 'Meshes'], vector: ['Geometry', 'Vectors'], intersect: ['Geometry', 'Intersection'],
    mnurbs: ['Geometry', 'SubD'], transform: ['Transform'], display: ['Display'], render: ['Render'],
    robot: ['Robotics'], robotics: ['Robotics'], 'kuka|prc': ['Robotics', 'KUKA prc'],
    wb: ['Geometry', 'Meshes', 'WeaverBird'], graph: ['Scripting', 'Graph'], events: ['Scripting', 'Events'],
    mantis: ['Scripting', 'Mantis'], scripting: ['Scripting'], ai: ['AI'], extensions: ['Extensions']
  }
  var wasmMenuAliases = {
    nodecurvec: ['Geometry', 'Curves'], nodepointc: ['Geometry', 'Points'],
    nodemeshc: ['Geometry', 'Meshes'], nodesurfacec: ['Geometry', 'Surfaces'],
    nodemathc: ['Math'], nodexformc: ['Transform'], nodetrianglec: ['Geometry', 'Triangulation']
  }
  var nodeMenuAcronyms = Object.assign(Object.create(null), { ai: 'AI', ui: 'UI', uv: 'UV', rgb: 'RGB', rgba: 'RGBA', xyz: 'XYZ', xy: 'XY', xz: 'XZ', yz: 'YZ', '3d': '3D', '2d': '2D', subd: 'SubD', nurbs: 'NURBS', wasm: 'WASM' })
  function nodeCategoryLabel (value) {
    if (nodeMenuAcronyms[String(value).toLowerCase()]) return nodeMenuAcronyms[String(value).toLowerCase()]
    return String(value).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().split(/\s+/).map(function (word) {
      return nodeMenuAcronyms[word.toLowerCase()] || word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    }).join(' ')
  }
  GraphCanvas.prototype.nodeMenuPath = function (type) {
    var parts = String(type).split('/')
    parts.pop() // Node name/GUID is not a category.
    var sourceCategory = String(parts.shift() || '')
    var first = sourceCategory.toLowerCase()
    var prefix
    if (first === 'wasm') {
      var packageName = parts.shift() || 'Other'
      prefix = Object.prototype.hasOwnProperty.call(wasmMenuAliases, packageName.toLowerCase()) ? wasmMenuAliases[packageName.toLowerCase()] : null
      prefix = prefix ? prefix.concat('WASM') : ['Extensions', 'WASM', nodeCategoryLabel(packageName)]
    } else if (first === 'nodec') {
      // Current NodeC/Edit nodes are control-point tools; keep future modules visible.
      if (String(parts[0]).toLowerCase() === 'edit') { parts.shift(); prefix = ['Geometry', 'Control Points'] }
      else prefix = ['Geometry', 'NodeC']
    } else {
      prefix = Object.prototype.hasOwnProperty.call(nodeMenuAliases, first) ? nodeMenuAliases[first] : ['Extensions', nodeCategoryLabel(sourceCategory || 'Other')]
    }
    return prefix.concat(parts.filter(Boolean).map(nodeCategoryLabel))
  }
  GraphCanvas.prototype.nodeMenuLabel = function (type) {
    var ctor = PandaUI.nodeTypes[type]
    var definition = ctor && ctor.pandauiDefinition || {}
    var label = ctor && ctor.title || type.split('/').pop()
    if (definition.execution === 'wasm-package' && definition.metadata && definition.metadata.frontendImplementation && definition.metadata.frontendImplementation.status === 'placeholder') label += ' · Pending'
    return label
  }
  GraphCanvas.prototype.addNodeAt = function (type, graphPoint, connection) {
    var node = PandaUI.createNode(type)
    if (!node) return null
    node.pos = graphPoint.slice()
    this.graph.add(node)
    if (connection && connection.node) {
      if (connection.direction === 'input') {
        var outputIndex = node.outputs.findIndex(function (output) {
          return PandaUI.isValidConnection(output && output.type, connection.type)
        })
        if (outputIndex >= 0) this.graph.connect(node, outputIndex, connection.node, connection.index, { append: true })
      } else {
        var inputIndex = node.inputs.findIndex(function (input) {
          return PandaUI.isValidConnection(connection.type, input && input.type)
        })
        if (inputIndex >= 0) this.graph.connect(connection.node, connection.index, node, inputIndex)
      }
    }
    return node
  }
  GraphCanvas.prototype.showAddNodeMenu = function (x, y, graphPoint, categoryPath, connection) {
    categoryPath = categoryPath || []
    var menu = this.createMenu(x, y)
    menu.classList.add('pandaui-node-menu--add')
    this.scheduleMenuFit(menu)
    var title = document.createElement('div')
    title.className = 'pandaui-node-menu__title'
    title.textContent = categoryPath.length ? 'Add Node / ' + categoryPath.join(' / ') : (connection ? 'Add Node to Connection' : 'Add Node')
    menu.appendChild(title)

    var list = document.createElement('div')
    list.className = 'pandaui-node-menu__list'
    menu.appendChild(list)

    if (categoryPath.length) {
      this.addMenuItem(list, '← Back', function () {
        this.showAddNodeMenu(x, y, graphPoint, categoryPath.slice(0, -1), connection)
      }.bind(this))
    } else if (!connection) {
      if (Object.keys(this.selected_nodes).length > 1) this.addMenuItem(list, 'Group Selected Nodes', function () { this.groupSelection() }.bind(this))
      this.addMenuItem(list, '＋ Group', function () { this.addGroupAt(graphPoint) }.bind(this))
      if (GraphCanvas.clipboard && GraphCanvas.clipboard.nodes && GraphCanvas.clipboard.nodes.length) this.addMenuItem(list, 'Paste', function () { this.pasteSelection(graphPoint) }.bind(this))
    }

    var categories = new Set()
    var directTypes = []
    this.availableNodeTypes().forEach(function (type) {
      var parts = this.nodeMenuPath(type)
      var matches = categoryPath.every(function (part, index) { return parts[index] === part })
      if (!matches) return
      if (parts.length > categoryPath.length) categories.add(parts[categoryPath.length])
      else directTypes.push(type)
    }, this)

    Array.from(categories).sort(function (left, right) {
      if (!categoryPath.length) return nodeMenuRoots.indexOf(left) - nodeMenuRoots.indexOf(right)
      return left.localeCompare(right)
    }).forEach(function (category) {
      var categoryItem = this.addMenuItem(list, category + ' ›', function () {
        this.showAddNodeMenu(x, y, graphPoint, categoryPath.concat(category), connection)
      }.bind(this))
      this.styleNodeMenuItem(categoryItem, categoryPath.concat(category)[0])
    }, this)

    directTypes.sort(function (left, right) {
      return this.nodeMenuLabel(left).localeCompare(this.nodeMenuLabel(right)) || left.localeCompare(right)
    }.bind(this)).forEach(function (type) {
      var nodeItem = this.addMenuItem(list, this.nodeMenuLabel(type), function () {
        this.addNodeAt(type, graphPoint, connection)
      }.bind(this))
      nodeItem.title = (PandaUI.nodeTypes[type].desc || '') + '\n' + type
      this.styleNodeMenuItem(nodeItem, this.nodeMenuPath(type)[0])
    }, this)
  }
  GraphCanvas.prototype.showNodeChooser = function (x, y, graphPoint) {
    var menu = this.createMenu(x, y)
    menu.classList.add('pandaui-node-menu--search')
    var search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Search nodes'; menu.appendChild(search)
    var list = document.createElement('div'); list.className = 'pandaui-node-menu__list'; menu.appendChild(list)
    var render = function () {
      list.innerHTML = ''
      var query = search.value.trim().toLowerCase()
      this.availableNodeTypes(true).filter(function (type) {
        var ctor = PandaUI.nodeTypes[type]
        return !query || type.toLowerCase().indexOf(query) >= 0 || String(ctor.title || '').toLowerCase().indexOf(query) >= 0 || this.nodeMenuPath(type).join(' / ').toLowerCase().indexOf(query) >= 0
      }, this).slice(0, 120).forEach(function (type) {
        var item = this.addMenuItem(list, this.nodeMenuLabel(type) + '  ·  ' + this.nodeMenuPath(type).join(' / '), function () { this.addNodeAt(type, graphPoint) }.bind(this))
        item.title = type
        this.styleNodeMenuItem(item, this.nodeMenuPath(type)[0])
      }, this)
    }.bind(this)
    search.addEventListener('input', render); render(); this.scheduleMenuFit(menu); setTimeout(function () { search.focus() }, 0)
  }

  function Editor (container) {
    this.container = typeof container === 'string' ? document.querySelector(container) : container
    this.graph = new GraphDocument()
    this.graphcanvas = new GraphCanvas(this.container, this.graph)
    this.graph.commitHistory('initial')
  }

  PandaUI.GraphCanvas = GraphCanvas
  PandaUI.Editor = Editor
  global.PandaUIGraphCanvas = GraphCanvas
})(typeof window !== 'undefined' ? window : globalThis)



