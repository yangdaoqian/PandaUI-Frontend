(function (PandaUI, global) {
  'use strict'
  var tools = [
    ['freehand', 'gesture', 'Freehand'], ['line', 'show_chart', 'Line'],
    ['rectangle', 'crop_square', 'Rectangle'], ['ellipse', 'radio_button_unchecked', 'Ellipse'],
    ['undo', 'undo', 'Undo stroke'], ['redo', 'redo', 'Redo stroke'],
    ['clear', 'delete_outline', 'Clear sketch'], ['settings', 'settings', 'Sketch settings']
  ]
  var maxStrokes = 64
  var maxPoints = 1024

  function send (message) {
    if (global.parent !== global) global.parent.postMessage(message, global.location.origin)
  }
  function clamp (value, low, high) { return Math.max(low, Math.min(high, value)) }
  function pointValid (point) { return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) }

  function SketchWidget () {
    this.addOutput('Curves', 'curve')
    this.properties = { tool: 'freehand', strokes: [], redo: [], plane: 'XY', extent: 100, offset: 0, snap: false, grid: 5, closed: false, color: '#ff69b4' }
    this.size = [330, 364]
    this._draft = null
    this._frame = null
    this._displayCount = 0
    this._notice = ''
  }
  SketchWidget.title = 'Sketch Widget'
  SketchWidget.desc = 'Draw planar curves locally and preview them in the viewport.'
  SketchWidget.prototype.getMinimumSize = function () { return [280, 290] }
  SketchWidget.prototype.computeSize = function () { this.ensurePortLabelWidth(); this.onResize(); return this.size }
  SketchWidget.prototype.pad = function () {
    var side = Math.max(120, Math.min(this.size[0] - 24, this.size[1] - 104))
    return { left: (this.size[0] - side) / 2, top: 78, side: side }
  }
  SketchWidget.prototype.toolbarAt = function (position) {
    if (position[1] < 4 || position[1] > 31) return -1
    var index = Math.floor((position[0] - 10) / 31)
    return index >= 0 && index < tools.length ? index : -1
  }
  SketchWidget.prototype.getTooltip = function (position) {
    var index = this.toolbarAt(position)
    return index >= 0 ? tools[index][2] : ''
  }
  SketchWidget.prototype.onConfigure = function () {
    var settings = this.properties
    settings.extent = Number.isFinite(settings.extent) ? clamp(settings.extent, 0.001, 1000000) : 100
    settings.offset = Number.isFinite(settings.offset) ? clamp(settings.offset, -1000000, 1000000) : 0
    settings.grid = Number.isFinite(settings.grid) ? clamp(settings.grid, 0.001, 1000000) : 5
    settings.plane = ['XY', 'XZ', 'YZ'].includes(settings.plane) ? settings.plane : 'XY'
    settings.tool = tools.slice(0, 4).some(function (tool) { return tool[0] === settings.tool }) ? settings.tool : 'freehand'
    settings.color = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : '#ff69b4'
    ;['strokes', 'redo'].forEach(function (key) {
      settings[key] = (Array.isArray(settings[key]) ? settings[key] : []).slice(0, maxStrokes).filter(function (stroke) {
        return stroke && tools.slice(0, 4).some(function (tool) { return tool[0] === stroke.tool }) && Array.isArray(stroke.points) && stroke.points.length >= 2
      }).map(function (stroke) {
        return { tool: stroke.tool, closed: !!stroke.closed, points: stroke.points.slice(0, maxPoints).filter(pointValid).map(function (point) { return point.map(function (value) { return clamp(value, -0.5, 0.5) }) }) }
      }).filter(function (stroke) { return stroke.points.length >= 2 })
    })
    this.onResize()
  }
  SketchWidget.prototype.onResize = function () {
    var minimum = this.getMinimumSize()
    this.size[0] = Math.max(minimum[0], this.size[0]); this.size[1] = Math.max(minimum[1], this.size[1])
  }
  SketchWidget.prototype.toSketch = function (local, snap) {
    var pad = this.pad()
    var point = [(local[0] - pad.left) / pad.side - 0.5, 0.5 - (local[1] - pad.top) / pad.side]
    if (snap && this.properties.snap) {
      var interval = this.properties.grid / this.properties.extent
      point = point.map(function (value) { return Math.round(value / interval) * interval })
    }
    return point.map(function (value) { return clamp(value, -0.5, 0.5) })
  }
  SketchWidget.prototype.strokePoints = function (stroke) {
    var first = stroke.points[0]
    var last = stroke.points[stroke.points.length - 1]
    var points
    if (stroke.tool === 'rectangle') points = [first, [last[0], first[1]], last, [first[0], last[1]], first]
    else if (stroke.tool === 'ellipse') {
      points = []
      for (var index = 0; index < 96; index++) {
        var angle = index * Math.PI / 48
        points.push([(first[0] + last[0]) / 2 + (last[0] - first[0]) / 2 * Math.cos(angle), (first[1] + last[1]) / 2 + (last[1] - first[1]) / 2 * Math.sin(angle)])
      }
      points.push(points[0])
    } else points = stroke.points.slice()
    if (stroke.tool === 'freehand' && stroke.closed && points.length > 2) points.push(points[0])
    return points
  }
  SketchWidget.prototype.worldPoint = function (point) {
    var horizontal = point[0] * this.properties.extent
    var vertical = point[1] * this.properties.extent
    var offset = this.properties.offset
    if (this.properties.plane === 'XZ') return [horizontal, offset, vertical]
    if (this.properties.plane === 'YZ') return [offset, horizontal, vertical]
    return [horizontal, vertical, offset]
  }
  SketchWidget.prototype.payload = function (includeDraft) {
    var strokes = this.properties.strokes.slice()
    if (includeDraft && this._draft && this._draft.points.length > 1) strokes.push(this._draft)
    var curves = strokes.map(function (stroke) {
      return { __geo: 'panda.polyline', data: this.strokePoints(stroke).map(this.worldPoint.bind(this)) }
    }, this)
    var tree = { path: curves.map(function () { return '{0}' }), datas: curves }
    var previews = curves.map(function (curve) { return { type: 'polyline', positions: curve.data.flat() } })
    var buffer = typeof global.PandaUIBuildPortDisplayBuffer === 'function'
      ? global.PandaUIBuildPortDisplayBuffer(tree, previews, [], this, 0) : null
    return { _isDualData: true, raw: curves[0] || null, display: {
      type: 'panda.polyline', nodeId: this.id, portIndex: 0, portName: 'Curves',
      color: parseInt(this.properties.color.slice(1), 16), opacity: 1, treeData: tree, buffer: buffer
    } }
  }
  SketchWidget.prototype.clearPreview = function () {
    send({ type: 'pandaui-clear-param-preview', marker: { nodeId: String(this.id) } })
    this._displayCount = 0
  }
  SketchWidget.prototype.preview = function (includeDraft) {
    var output = this.payload(includeDraft)
    var count = output.display.treeData.datas.length
    if (count < this._displayCount) this.clearPreview()
    this._displayCount = count
    if (count && typeof global.PandaUIGeometryOutputDispatcher === 'function') global.PandaUIGeometryOutputDispatcher(this, 0, this.outputs[0], output)
    return output
  }
  SketchWidget.prototype.schedulePreview = function () {
    this.setDirtyCanvas()
    if (this._frame != null) return
    this._frame = global.requestAnimationFrame(function () {
      this._frame = null
      if (this.graph) this.preview(true)
    }.bind(this))
  }
  SketchWidget.prototype.onExecute = function () {
    var output = this.payload(false)
    var count = output.display.treeData.datas.length
    if (count < this._displayCount) this.clearPreview()
    this._displayCount = count
    this.setOutputData(0, output)
  }
  SketchWidget.prototype.commit = function (reason) {
    this._notice = ''
    this.onExecute()
    if (this.graph) {
      this.graph.invalidateNode(this, { propagate: true, reason: reason })
      this.graph.commitHistory(reason, this)
    }
    this.setDirtyCanvas()
  }
  SketchWidget.prototype.onMouseDown = function (event, local, canvas) {
    if (canvas.editorModeActive === false || event.button !== 0) return false
    var index = this.toolbarAt(local)
    if (index >= 0) {
      var action = tools[index][0]
      if (index < 4) { this.properties.tool = action; this.setDirtyCanvas() }
      else if (action === 'settings') this.showSettings(event, canvas)
      else if (action === 'undo' && this.properties.strokes.length) { this.properties.redo.push(this.properties.strokes.pop()); this.commit('sketch-undo') }
      else if (action === 'redo' && this.properties.redo.length) { this.properties.strokes.push(this.properties.redo.pop()); this.commit('sketch-redo') }
      else if (action === 'clear' && this.properties.strokes.length) { this.properties.strokes = []; this.properties.redo = []; this.commit('sketch-clear') }
      return true
    }
    var pad = this.pad()
    if (local[0] < pad.left || local[0] > pad.left + pad.side || local[1] < pad.top || local[1] > pad.top + pad.side) return false
    if (this.properties.strokes.length >= maxStrokes) { this._notice = '64-stroke limit'; this.setDirtyCanvas(); return true }
    this._draft = { tool: this.properties.tool, closed: this.properties.closed, points: [this.toSketch(local, true)] }
    return true
  }
  SketchWidget.prototype.onMouseMove = function (event, local) {
    if (!this._draft) return
    var point = this.toSketch(local, true)
    var points = this._draft.points
    if (this._draft.tool !== 'freehand') points[1] = point
    else if (Math.hypot(point[0] - points[points.length - 1][0], point[1] - points[points.length - 1][1]) * this.pad().side >= 2 && points.length < maxPoints) points.push(point)
    this.schedulePreview()
  }
  SketchWidget.prototype.onMouseUp = function (event, local) {
    if (!this._draft) return
    this.onMouseMove(event, local)
    var stroke = this._draft
    this._draft = null
    if (this._frame != null) { global.cancelAnimationFrame(this._frame); this._frame = null }
    var first = stroke.points[0]
    var last = stroke.points[stroke.points.length - 1]
    var span = Math.hypot(first[0] - last[0], first[1] - last[1])
    var valid = stroke.points.length >= 2 && (span > 1e-6 || stroke.tool === 'freehand' && stroke.points.length > 2)
    if ((stroke.tool === 'rectangle' || stroke.tool === 'ellipse') && (Math.abs(first[0] - last[0]) < 1e-6 || Math.abs(first[1] - last[1]) < 1e-6)) valid = false
    if (valid) { this.properties.strokes.push(stroke); this.properties.redo = []; this.commit('sketch-stroke') }
    else this.preview(false)
    this.setDirtyCanvas()
  }
  SketchWidget.prototype.onMouseCancel = function () {
    this._draft = null
    if (this._frame != null) { global.cancelAnimationFrame(this._frame); this._frame = null }
    this.preview(false); this.setDirtyCanvas()
  }
  SketchWidget.prototype.onRemoved = function () {
    if (this._frame != null) global.cancelAnimationFrame(this._frame)
    this._frame = null; this._draft = null; this.clearPreview()
    if (this._settingsCanvas) this._settingsCanvas.closeMenu()
  }
  SketchWidget.prototype.showSettings = function (event, canvas) {
    var menu = canvas.createMenu(event.clientX, event.clientY)
    menu.classList.add('sketch-settings')
    this._settingsCanvas = canvas
    var error = document.createElement('p'); error.className = 'sketch-error'; error.hidden = true
    var fields = [
      ['Plane', 'plane', 'select', ['XY', 'XZ', 'YZ']], ['Width', 'extent', 'number', [0.001, 1000000]],
      ['Offset', 'offset', 'number', [-1000000, 1000000]], ['Grid size', 'grid', 'number', [0.001, 1000000]],
      ['Snap', 'snap', 'checkbox'], ['Close freehand', 'closed', 'checkbox'], ['Color', 'color', 'color']
    ]
    fields.forEach(function (field) {
      var label = document.createElement('label'); label.appendChild(document.createTextNode(field[0]))
      var input = document.createElement(field[2] === 'select' ? 'select' : 'input')
      input.setAttribute('aria-label', field[0]); input.dataset.setting = field[1]
      if (field[2] === 'select') field[3].forEach(function (value) { var option = document.createElement('option'); option.value = value; option.textContent = value; input.appendChild(option) })
      else input.type = field[2]
      if (field[2] === 'number') { input.min = field[3][0]; input.max = field[3][1]; input.step = 'any' }
      if (field[2] === 'checkbox') input.checked = !!this.properties[field[1]]
      else input.value = this.properties[field[1]]
      input.addEventListener('change', function () {
        var value = field[2] === 'checkbox' ? input.checked : field[2] === 'number' ? input.valueAsNumber : input.value
        if (!input.checkValidity() || field[2] === 'number' && !Number.isFinite(value)) { error.textContent = 'Enter a value within the allowed range.'; error.hidden = false; return }
        error.hidden = true; this.properties[field[1]] = value; this.commit('sketch-settings')
      }.bind(this))
      label.appendChild(input); menu.appendChild(label)
    }, this)
    menu.appendChild(error); canvas.scheduleMenuFit(menu)
  }
  SketchWidget.prototype.onDrawForeground = function (context) {
    context.save()
    context.textAlign = 'center'; context.textBaseline = 'middle'
    tools.forEach(function (tool, index) {
      var left = 10 + index * 31
      if (tool[0] === this.properties.tool) { context.fillStyle = '#175b65'; context.fillRect(left, 4, 28, 27) }
      context.fillStyle = tool[0] === this.properties.tool ? '#fff' : '#cbd1d5'
      if (tool[0] === 'undo' && !this.properties.strokes.length || tool[0] === 'redo' && !this.properties.redo.length) context.fillStyle = '#656a70'
      context.font = '20px "Sketch Material Icons"'; context.fillText(tool[1], left + 14, 18)
    }, this)
    var pad = this.pad()
    context.fillStyle = '#24282b'; context.fillRect(pad.left, pad.top, pad.side, pad.side)
    context.save(); context.beginPath(); context.rect(pad.left, pad.top, pad.side, pad.side); context.clip()
    context.strokeStyle = '#394044'; context.lineWidth = 0.5
    var step = this.properties.grid / this.properties.extent
    if (step * pad.side >= 6) {
      var count = Math.floor(0.5 / step)
      context.beginPath()
      for (var index = -count; index <= count; index++) {
        var position = pad.side * (0.5 + index * step)
        context.moveTo(pad.left + position, pad.top); context.lineTo(pad.left + position, pad.top + pad.side)
        context.moveTo(pad.left, pad.top + position); context.lineTo(pad.left + pad.side, pad.top + position)
      }
      context.stroke()
    }
    context.strokeStyle = '#687477'; context.lineWidth = 1
    context.beginPath(); context.moveTo(pad.left + pad.side / 2, pad.top); context.lineTo(pad.left + pad.side / 2, pad.top + pad.side)
    context.moveTo(pad.left, pad.top + pad.side / 2); context.lineTo(pad.left + pad.side, pad.top + pad.side / 2); context.stroke()
    var strokes = this.properties.strokes.concat(this._draft ? [this._draft] : [])
    context.lineWidth = 1.5; context.lineJoin = 'round'; context.lineCap = 'round'
    strokes.forEach(function (stroke) {
      context.strokeStyle = stroke === this._draft ? '#fff' : this.properties.color
      context.beginPath()
      this.strokePoints(stroke).forEach(function (point, index) {
        var horizontal = pad.left + (point[0] + 0.5) * pad.side
        var vertical = pad.top + (0.5 - point[1]) * pad.side
        if (index) context.lineTo(horizontal, vertical); else context.moveTo(horizontal, vertical)
      }); context.stroke()
    }, this)
    context.restore()
    context.font = '11px Arial'; context.fillStyle = '#d3dde0'; context.textAlign = 'left'
    context.fillText(this.properties.plane + '  ' + this.properties.extent + ' units', pad.left, pad.top - 12)
    context.fillStyle = this._notice ? '#ffbf66' : '#d3dde0'
    context.fillText(this._notice || this.properties.strokes.length + ' curves', pad.left, pad.top + pad.side + 16)
    context.restore()
  }
  PandaUI.registerNode('Input/Sketch Widget', SketchWidget)
  if (document.fonts) document.fonts.load('20px "Sketch Material Icons"').then(function () { if (global.graphcanvas) global.graphcanvas.setDirty() })
})(window.PandaUI, window)
