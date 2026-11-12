(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  if (root.PandaUI) root.PandaUI.NodeTooltip = api.NodeTooltip
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict'
  var nextId = 0
  function text (value, limit) {
    if (value == null) return ''
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return ''
    var result = String(value)
    return result.length > (limit || 500) ? result.slice(0, limit || 500) + '…' : result
  }
  function sample (value) {
    if (value == null) return String(value)
    if (typeof value !== 'object') return text(value, 100)
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return 'Binary · ' + value.byteLength + ' bytes'
    if (Array.isArray(value)) return 'List · ' + value.length + ' items'
    var label = text(value.geometryType || value.__geo || value.type || value.kind, 80).replace(/^rhino\./, 'panda.')
    if (label) return label
    if (['x', 'y', 'z'].every(function (key) { return typeof value[key] === 'number' })) return '(' + [value.x, value.y, value.z].map(function (number) { return Number(number.toPrecision(6)) }).join(', ') + ')'
    return 'Object'
  }
  function summarizeValue (value, depth) {
    depth = depth || 0
    if (value === undefined) return ['No data']
    if (value === null) return ['Null']
    if (depth > 2) return [sample(value)]
    if (value._isDualData) {
      var display = value.display || {}
      var tree = display.treeData
      return [text(display.type || 'Geometry').replace(/^rhino\./, 'panda.')].concat(tree ? summarizeValue(tree, depth + 1) : ['Geometry · summary only'])
    }
    if (value.kind === 'paramRef') return value.dataTreeSummary ? summarizeValue(value.dataTreeSummary, depth + 1) : ['Backend parameter · data not downloaded']
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return [sample(value)]
    if (Array.isArray(value)) return [value.length + ' items'].concat(value.slice(0, 3).map(sample))
    if (Array.isArray(value.datas) && Array.isArray(value.path)) {
      return [value.datas.length + ' items · Data tree'].concat(value.datas.slice(0, 3).map(function (item, index) { return text(value.path[index], 60) + '  ' + sample(item) }))
    }
    if (value._branches instanceof Map) {
      var count = 0; var visited = 0; var samples = []
      for (var branch of value._branches.values()) {
        if (visited++ >= 32) break
        count += branch.values.length
        if (samples.length < 3) samples = samples.concat(branch.values.slice(0, 3 - samples.length).map(sample))
      }
      return [(value._branches.size > 32 ? '≥ ' : '') + count + ' items · ' + value._branches.size + ' branches'].concat(samples)
    }
    return [sample(value)]
  }
  function portData (node, input, index) {
    var port = (input ? node.inputs : node.outputs)[index]
    if (!input) return summarizeValue(port._data)
    var links = port.links && port.links.length ? port.links : port.link == null ? [] : [port.link]
    if (!links.length) return summarizeValue(port.data)
    var result = links.length > 1 ? [links.length + ' sources'] : []
    links.slice(0, 3).forEach(function (id) {
      var link = node.graph && node.graph.links.get(String(id))
      var source = link && node.graph.getNodeById(link.origin_id)
      result = result.concat(summarizeValue(source && source.outputs[link.origin_slot] && source.outputs[link.origin_slot]._data))
    })
    return result.slice(0, 8)
  }
  function nodeMessages (node) {
    var result = []
    if (node._executionError) result.push({ level: 'error', text: text(node._executionError, 1200) })
    if (node._widgetRenderError) result.push({ level: 'error', text: text(node._widgetRenderError, 1200) })
    var messages = node._runtimeMessages || {}
    ;['errors', 'warnings', 'remarks'].forEach(function (kind) {
      ;(Array.isArray(messages[kind]) ? messages[kind] : []).slice(0, 4).forEach(function (message) {
        var value = text(message && message.message || message, 1200)
        if (value && !result.some(function (entry) { return entry.text === value })) result.push({ level: kind === 'errors' ? 'error' : kind === 'warnings' ? 'warning' : 'info', text: value })
      })
    })
    return result.slice(0, 6)
  }
  function describeTarget (target) {
    if (target.kind === 'link') {
      var source = target.node
      var output = source.outputs[target.index]
      var destination = source.graph.getNodeById(target.link.target_id)
      var input = destination && destination.inputs[target.link.target_slot]
      return { title: 'Connection', subtitle: text(output.type || 'Any'), description: '', rows: [
        { label: 'From', value: text(source.title) + ' · ' + text(output.name) },
        { label: 'To', value: text(destination && destination.title) + ' · ' + text(input && input.name) }
      ], samples: summarizeValue(output._data), messages: [], color: target.color }
    }
    if (target.kind === 'group') return { title: text(target.group.title || 'Group'), subtitle: 'Group', description: '', rows: [{ label: 'Nodes', value: String((target.group._nodes || []).length) }], samples: [], messages: [] }
    var node = target.node
    var definition = node.constructor.pandauiDefinition || {}
    var entry = node._ghEntry || definition.metadata && definition.metadata.ghEntry || definition
    var state = node._executionState || 'ready'
    var labels = { ready: 'Ready to Compute', idle: 'Ready to Compute', running: 'Computing', success: 'Computed', error: 'Error', warning: 'Warning', aborting: 'Aborting', aborted: 'Ready to Compute' }
    var elapsed = state === 'running' && node._executionStartedAt ? Date.now() - node._executionStartedAt : Number(node._executionElapsedMs) || 0
    var info = { title: text(node.title || node.type), subtitle: [entry.libraryName, entry.category || definition.category].filter(Boolean).map(function (part) { return text(part, 100) }).join(' / '), description: text(entry.description || node.constructor.desc || ''),
      state: state, status: (labels[state] || labels.ready) + (elapsed > 0 ? ' · ' + (elapsed / 1000).toFixed(2) + ' s' : ''), rows: [], samples: [], messages: nodeMessages(node), color: target.color }
    if (target.kind === 'input' || target.kind === 'output') {
      var isInput = target.kind === 'input'
      var port = (isInput ? node.inputs : node.outputs)[target.index]
      var metadata = (entry[isInput ? 'inputs' : 'outputs'] || []).find(function (item) { return item.name === port.name }) || {}
      info.title = text(port.name)
      info.subtitle = (isInput ? 'Input' : 'Output') + ' · ' + text(node.title, 100)
      info.description = text(port.description || metadata.description)
      info.rows.push({ label: 'Type', value: text(port.clrType || metadata.clrType || port.type || 'Any', 250) })
      var access = port.access == null ? metadata.access : port.access
      if (access != null) info.rows.push({ label: 'Access', value: text(access) })
      if (isInput) info.rows.push({ label: 'Required', value: port.optional || metadata.optional ? 'Optional' : 'Required' })
      var links = port.links && port.links.length ? port.links.length : port.link == null ? 0 : 1
      info.rows.push({ label: 'Connections', value: String(links) })
      info.samples = portData(node, isInput, target.index)
      var defaultValue = port.defaultValue === undefined ? metadata.defaultValue : port.defaultValue
      if (isInput && !links && port.data === undefined && defaultValue != null) info.rows.push({ label: 'Default', value: summarizeValue(defaultValue).join(' · ') })
      if (node.graph && node.graph._dirty && node.graph._dirty.has(String(node.id))) info.rows.push({ label: 'Data', value: 'Awaiting recompute' })
    } else {
      info.rows.push({ label: 'Ports', value: node.inputs.length + ' inputs · ' + node.outputs.length + ' outputs' })
      var implementation = definition.metadata && definition.metadata.frontendImplementation
      if (implementation) {
        info.rows.push({ label: 'Execution', value: text(implementation.label) })
        if (implementation.status === 'placeholder') info.rows.push({ label: 'Frontend', value: 'Not implemented' })
      }
      if (target.widget) {
        info.title = text(target.widget.name || node.title)
        info.subtitle = 'Control · ' + text(node.title, 100)
        info.samples = summarizeValue(target.widget.property ? node.properties[target.widget.property] : target.widget.value)
      }
    }
    try {
      var custom = typeof node.getTooltipInfo === 'function' ? node.getTooltipInfo({ kind: target.kind, index: target.index, position: target.local })
        : target.local && typeof node.getTooltip === 'function' ? node.getTooltip(target.local) : null
      if (typeof custom === 'string' && custom) info.description = text(custom)
      else if (custom && typeof custom === 'object') {
        ;['title', 'description'].forEach(function (key) { if (custom[key]) info[key] = text(custom[key]) })
        if (Array.isArray(custom.rows)) info.rows = info.rows.concat(custom.rows.slice(0, 8).map(function (row) { return { label: text(row.label, 50), value: text(row.value) } }))
      }
    } catch (_) {}
    return info
  }
  function findTarget (canvas, event) {
    var point = canvas.toGraph(event.clientX, event.clientY)
    var widgetRoot = event.target && event.target.closest && event.target.closest('.pandaui-widget-controls')
    if (event.target !== canvas.canvas && !widgetRoot) return null
    if (widgetRoot) {
      var widgetNode = canvas.graph.getNodeById(widgetRoot.dataset.nodeId)
      return widgetNode ? { kind: 'node', node: widgetNode, key: 'node:' + widgetNode.id, local: [point[0] - widgetNode.pos[0], point[1] - widgetNode.pos[1]] } : null
    }
    var radius = Math.max(9 / canvas.scale, canvas.appearance.portRadius + 3)
    for (var nodeIndex = canvas.graph._nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
      var node = canvas.graph._nodes[nodeIndex]
      var local = [point[0] - node.pos[0], point[1] - node.pos[1]]
      var width = canvas.nodeDisplayWidth(node)
      if (local[0] < -radius || local[0] > width + radius || local[1] < -52 || local[1] > canvas.nodeBodyHeight(node) + radius) continue
      var target = { kind: 'node', node: node, key: 'node:' + node.id, local: local }
      var collapsed = node.flags && node.flags.collapsed
      var row = collapsed ? 0 : Math.round((local[1] - 34) / 22)
      var context = canvas.context
      context.save()
      context.font = canvas.appearance.fontSize + 'px ' + canvas.appearance.fontFamily
      var widths = [node.inputs, node.outputs].map(function (ports) { return ports.reduce(function (max, port) { return Math.max(max, context.measureText(port.name).width) }, 0) })
      context.restore()
      var labelScale = Math.min(1, Math.max(1, width - 32) / Math.max(1, widths[0] + widths[1]))
      for (var direction = 0; direction < 2; direction++) {
        var ports = direction === 0 ? node.inputs : node.outputs
        if (row < 0 || row >= ports.length) continue
        var position = canvas.slotPosition(node, direction === 0, row)
        var socket = Math.hypot(point[0] - position[0], point[1] - position[1]) <= radius
        var label = !collapsed && Math.abs(local[1] - (34 + row * 22)) <= 10 && (direction === 0 ? local[0] >= 0 && local[0] <= 10 + widths[0] * labelScale : local[0] <= width && local[0] >= width - 10 - widths[1] * labelScale)
        if (socket || label) return Object.assign(target, { kind: direction === 0 ? 'input' : 'output', index: row, key: node.id + ':' + direction + ':' + row, color: canvas.portTypeColor(ports[row].type) })
      }
      if (local[0] < 0 || local[0] > width || local[1] > canvas.nodeBodyHeight(node)) continue
      if (local[1] < -28) return local[1] >= -50 && local[1] <= -30 ? Object.assign(target, { kind: 'status', key: 'status:' + node.id }) : null
      var widget = !node.widgetUI && canvas.widgetAt(point)
      return widget ? Object.assign(target, { kind: 'widget', widget: widget.widget, index: widget.index, key: node.id + ':widget:' + widget.index }) : target
    }
    var link = canvas.linkAt(point)
    if (link) {
      var source = canvas.graph.getNodeById(link.origin_id)
      if (source && source.outputs[link.origin_slot]) return { kind: 'link', node: source, link: link, index: link.origin_slot, key: 'link:' + link.id, color: canvas.linkColor(link) }
    }
    var group = canvas.groupAt(point)
    return group ? { kind: 'group', group: group, key: 'group:' + group.id } : null
  }
  function NodeTooltip (canvas) {
    this.canvas = canvas
    this.document = canvas.canvas.ownerDocument
    this.window = this.document.defaultView
    this.hostDocument = this.document
    try {
      var hostWindow = this.window
      while (hostWindow.frameElement && hostWindow.parent.document.body) {
        hostWindow = hostWindow.parent
        this.hostDocument = hostWindow.document
      }
    } catch (_) {}
    this.disposers = []
    this.element = this.hostDocument.createElement('aside')
    this.element.className = 'pandaui-node-tooltip'
    this.element.id = 'pandaui-node-tooltip-' + (++nextId)
    this.element.setAttribute('role', 'tooltip')
    this.element.setAttribute('popover', 'manual')
    this.element.hidden = true
    this.hostDocument.body.appendChild(this.element)
    this.descriptionElement = this.element
    if (this.hostDocument !== this.document) {
      var stylesheet = this.document.querySelector('link[href*="node-tooltip.css"]')
      if (stylesheet && !this.hostDocument.querySelector('link[data-pandaui-tooltip-style]')) {
        var link = this.hostDocument.createElement('link')
        link.rel = 'stylesheet'
        link.href = stylesheet.href
        link.setAttribute('data-pandaui-tooltip-style', '')
        this.hostDocument.head.appendChild(link)
      }
      this.descriptionElement = this.document.createElement('span')
      this.descriptionElement.id = this.element.id + '-description'
      this.descriptionElement.hidden = true
      this.document.body.appendChild(this.descriptionElement)
      ;['pointermove', 'pointerdown', 'wheel', 'contextmenu', 'keydown', 'scroll'].forEach(function (name) {
        this.listen(this.hostDocument, name, this.hide.bind(this))
      }, this)
      this.listen(this.hostDocument.defaultView, 'blur', this.hide.bind(this))
      this.listen(this.hostDocument.defaultView, 'resize', this.hide.bind(this))
    }
    this.listen(this.document, 'pointermove', this.move.bind(this))
    ;['pointerdown', 'pointercancel', 'wheel', 'contextmenu', 'keydown', 'scroll'].forEach(function (name) { this.listen(this.document, name, this.hide.bind(this)) }, this)
    this.listen(this.document, 'pointerout', function (event) { if (!event.relatedTarget) this.hide() }.bind(this))
    this.listen(this.document, 'visibilitychange', this.hide.bind(this))
    this.listen(this.window, 'blur', this.hide.bind(this))
    this.listen(this.window, 'pagehide', function (event) { if (event.persisted) this.hide(); else this.dispose() }.bind(this))
    ;['node-removed', 'document-cleared', 'document-restored', 'connection-changed'].forEach(function (name) {
      if (canvas.graph.events) this.disposers.push(canvas.graph.events.on(name, this.hide.bind(this)))
    }, this)
  }
  NodeTooltip.prototype.listen = function (target, name, handler) {
    target.addEventListener(name, handler, true)
    this.disposers.push(function () { target.removeEventListener(name, handler, true) })
  }
  NodeTooltip.prototype.hide = function () {
    this.window.clearTimeout(this.timer)
    this.timer = null
    this.target = null
    this.event = null
    this.signature = null
    if (this.popoverOpen) {
      try { this.element.hidePopover() } catch (_) {}
      this.popoverOpen = false
    }
    this.element.hidden = true
    this.element.textContent = ''
    if (this.descriptionElement !== this.element) this.descriptionElement.textContent = ''
    if (this.described) {
      if (this.previousDescription) this.described.setAttribute('aria-describedby', this.previousDescription)
      else this.described.removeAttribute('aria-describedby')
      this.described = null
    }
  }
  NodeTooltip.prototype.move = function (event) {
    var canvas = this.canvas
    if (this.disposed || !canvas.editorModeActive || canvas.pointer || canvas.connecting || canvas.menu || event.buttons || event.pointerType === 'touch') { this.hide(); return }
    var target = findTarget(canvas, event)
    if (!target) { this.hide(); return }
    if (!this.target || this.target.key !== target.key) {
      this.hide()
      this.timer = this.window.setTimeout(this.show.bind(this), 350)
    }
    this.target = target
    this.event = { clientX: event.clientX, clientY: event.clientY, target: event.target }
  }
  NodeTooltip.prototype.show = function () {
    this.timer = null
    var canvas = this.canvas
    if (!this.target || !this.event || this.disposed || !canvas.canvas.isConnected || !canvas.editorModeActive || canvas.menu || canvas.pointer) { this.hide(); return }
    var current = findTarget(canvas, this.event)
    if (!current || current.key !== this.target.key) { this.hide(); return }
    this.target = current
    var info = describeTarget(current)
    var signature = JSON.stringify(info)
    if (signature !== this.signature) {
      this.signature = signature
      this.render(info)
      if (this.descriptionElement !== this.element) this.descriptionElement.textContent = this.element.textContent
    }
    this.element.hidden = false
    if (!this.popoverOpen && typeof this.element.showPopover === 'function') {
      try { this.element.showPopover(); this.popoverOpen = true } catch (_) {}
    }
    if (!this.described) {
      this.described = this.event.target
      this.previousDescription = this.described.getAttribute('aria-describedby')
      this.described.setAttribute('aria-describedby', [this.previousDescription, this.descriptionElement.id].filter(Boolean).join(' '))
    }
    this.position()
    this.timer = this.window.setTimeout(this.show.bind(this), 250)
  }
  NodeTooltip.prototype.render = function (info) {
    var panel = this.element
    panel.textContent = ''
    panel.dataset.state = info.state || 'ready'
    panel.style.setProperty('--tooltip-accent', info.color || '#5a8c94')
    var append = function (parent, tag, className, value) {
      var child = this.hostDocument.createElement(tag)
      child.className = className
      child.textContent = value
      parent.appendChild(child)
      return child
    }.bind(this)
    if (info.subtitle) append(panel, 'div', 'pandaui-node-tooltip__category', info.subtitle)
    append(panel, 'div', 'pandaui-node-tooltip__title', info.title)
    if (info.status) append(panel, 'div', 'pandaui-node-tooltip__status', info.status)
    if (info.description) append(panel, 'p', 'pandaui-node-tooltip__description', info.description)
    var details = append(panel, 'dl', 'pandaui-node-tooltip__details', '')
    info.rows.forEach(function (row) { append(details, 'dt', '', row.label); append(details, 'dd', '', row.value) })
    if (info.samples.length) {
      append(panel, 'div', 'pandaui-node-tooltip__heading', 'Data preview')
      append(panel, 'pre', 'pandaui-node-tooltip__data', info.samples.join('\n'))
    }
    info.messages.forEach(function (message) { append(panel, 'div', 'pandaui-node-tooltip__message is-' + message.level, message.text) })
  }
  NodeTooltip.prototype.position = function () {
    var panel = this.element
    var viewport = this.hostDocument.documentElement
    var point = { x: this.event.clientX, y: this.event.clientY }
    var view = this.window
    while (view !== this.hostDocument.defaultView) {
      var frame = view.frameElement
      var rect = frame.getBoundingClientRect()
      var scaleX = frame.offsetWidth ? rect.width / frame.offsetWidth : 1
      var scaleY = frame.offsetHeight ? rect.height / frame.offsetHeight : 1
      point.x = rect.left + (point.x + (frame.clientLeft || 0)) * scaleX
      point.y = rect.top + (point.y + (frame.clientTop || 0)) * scaleY
      view = view.parent
    }
    var width = panel.offsetWidth; var height = panel.offsetHeight
    var left = point.x + 18; var top = point.y + 22
    if (left + width > viewport.clientWidth - 10) left = point.x - width - 18
    if (top + height > viewport.clientHeight - 10) top = point.y - height - 16
    panel.style.left = Math.max(10, Math.min(left, viewport.clientWidth - width - 10)) + 'px'
    panel.style.top = Math.max(10, Math.min(top, viewport.clientHeight - height - 10)) + 'px'
  }
  NodeTooltip.prototype.dispose = function () {
    if (this.disposed) return
    this.disposed = true
    this.hide()
    this.disposers.splice(0).forEach(function (dispose) { if (typeof dispose === 'function') dispose() })
    this.element.remove()
    if (this.descriptionElement !== this.element) this.descriptionElement.remove()
  }
  return { NodeTooltip: NodeTooltip, findTarget: findTarget, describeTarget: describeTarget, summarizeValue: summarizeValue }
})
