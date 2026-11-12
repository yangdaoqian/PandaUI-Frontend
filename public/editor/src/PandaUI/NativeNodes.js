(function (global) {
  var PandaUI = global.PandaUI
  if (!PandaUI) throw new Error('PandaUI runtime is not loaded.')

  var precisionOptions = ['Integer', '1 decimal', '2 decimals', '3 decimals', '4 decimals', '5 decimals', '6 decimals']

  function Slider () {
    this.addOutput('number', 'number')
    this.properties = { value: 0, min: 0, max: 100, precision: 0 }
    this.size = [180, 116]
    this.valueWidget = this.addWidget('slider', 'value', this.properties.value, this.setValue.bind(this), { min: 0, max: 100, step: 0.01 })
    this.addWidget('number', 'min', this.properties.min, this.setMin.bind(this), { step: 1 })
    this.addWidget('number', 'max', this.properties.max, this.setMax.bind(this), { step: 1 })
    this.precisionWidget = this.addWidget('combo', 'precision', precisionOptions[0], this.setPrecision.bind(this), { values: precisionOptions })
  }
  Slider.title = 'Slider'
  Slider.desc = 'Outputs a number controlled by a slider.'
  Slider.prototype.updateRange = function () {
    this.properties.min = Number.isFinite(Number(this.properties.min)) ? Number(this.properties.min) : 0
    this.properties.max = Number.isFinite(Number(this.properties.max)) ? Number(this.properties.max) : 100
    if (this.properties.max < this.properties.min) this.properties.max = this.properties.min
    this.properties.value = Math.min(this.properties.max, Math.max(this.properties.min, Number(this.properties.value) || 0))
    this.valueWidget.options.min = this.properties.min
    this.valueWidget.options.max = this.properties.max
    this.valueWidget.options.step = Math.pow(10, -this.properties.precision)
    this.properties.value = Math.min(this.properties.max, Math.max(this.properties.min, Number(this.properties.value.toFixed(this.properties.precision))))
    this.valueWidget.value = this.properties.value
    this.setDirtyCanvas(true, true)
  }
  Slider.prototype.setValue = function (value) { this.properties.value = Number(value) || 0; this.updateRange() }
  Slider.prototype.setMin = function (value) { this.properties.min = Number(value) || 0; this.updateRange() }
  Slider.prototype.setMax = function (value) { this.properties.max = Number(value) || 0; this.updateRange() }
  Slider.prototype.setPrecision = function (value) {
    var precision = typeof value === 'number' ? value : precisionOptions.indexOf(value)
    this.properties.precision = Math.min(6, Math.max(0, precision))
    this.precisionWidget.value = precisionOptions[this.properties.precision]
    this.updateRange()
    this.setDirtyCanvas(true, true)
  }
  Slider.prototype.onConfigure = function () {
    this.properties.precision = Math.min(6, Math.max(0, Math.round(Number(this.properties.precision) || 0)))
    this.precisionWidget.value = precisionOptions[this.properties.precision]
    this.updateRange()
    this.computeSize()
  }
  Slider.prototype.onExecute = function () {
    this.updateRange()
    this.setOutputData(0, this.properties.value)
  }
  Slider.prototype.normalizeWidget = function () { this.onConfigure() }
  if (global.PandaUIWidgetLayout) global.PandaUIWidgetLayout(Slider, 'slider', 174)

  function GetCurve () {
    this.addOutput('curve', 'curve')
    this.properties = { curveId: '', sourceObject: null }
    this.points = []
    this.addWidget('button', 'pick curve', null, this.requestPick.bind(this))
  }
  GetCurve.title = 'Get Curve'
  GetCurve.desc = 'Picks a curve or edge curve from the Three.js viewport.'
  GetCurve.prototype.send = function (type, curveId) {
    if (global.parent === global) return
    var message = { type: type, nodeId: this.id }
    if (curveId != null) message.curveId = curveId
    global.parent.postMessage(message, global.location.origin)
  }
  GetCurve.prototype.requestPick = function () { this.send('pandaui-pick-curve') }
  GetCurve.prototype.onSelected = function () {
    if (this.properties.curveId) this.send('pandaui-highlight-curve', this.properties.curveId)
    else this.requestPick()
  }
  GetCurve.prototype.onDeselected = function () { this.send('pandaui-clear-curve-highlight') }
  GetCurve.prototype.onExecute = function () {
    this.setOutputData(0, this.properties.curveId && this.points.length > 1
      ? { id: this.properties.curveId, sourceObject: this.properties.sourceObject, points: this.points }
      : null)
  }
  GetCurve.prototype.setCurve = function (curveId, sourceObject, points) {
    this.properties.curveId = curveId || ''
    this.properties.sourceObject = Number.isInteger(sourceObject) ? sourceObject : null
    this.points = Array.isArray(points) ? points : []
    this.setDirtyCanvas(true, true)
    if (this.graph) this.graph.invalidateNode(this, { source: true, reason: 'curve-picked' })
  }

  function DivideCurve () {
    this.addInput('curve', 'curve')
    this.addInput('divisions', 'number')
    this.addOutput('points', '[vec3]')
    this.properties = { divisions: 10 }
    this.points = []
    this._lastCurveKey = ''
  }
  DivideCurve.title = 'Divide Curve'
  DivideCurve.desc = 'Divides a picked curve polyline by equal arc length.'
  DivideCurve.prototype.onConnectionsChange = function () { this._lastCurveKey = '' }
  DivideCurve.prototype.setPoints = function (points) {
    this.points = Array.isArray(points) ? points : []
    this.setDirtyCanvas(true, true)
    if (global.parent !== global) {
      global.parent.postMessage({ type: 'pandaui-draw-point-cloud', id: 'divide-curve-' + this.id, points: this.points, color: '#31ccec', size: 8, visible: true }, global.location.origin)
    }
  }
  DivideCurve.prototype.dividePolyline = function () {
    var curve = this.getInputData(0)
    if (!curve || !Array.isArray(curve.points) || curve.points.length < 2) return
    var inputDivisions = this.getInputData(1)
    var divisions = Math.max(1, Math.round(Number(inputDivisions == null ? this.properties.divisions : inputDivisions) || 1))
    var values = curve.points.filter(function (point) {
      return Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(function (item) { return Number.isFinite(Number(item)) })
    }).map(function (point) { return [Number(point[0]), Number(point[1]), Number(point[2])] })
    if (values.length < 2) return
    var curveKey = String(curve.id || '') + ':' + JSON.stringify(values) + ':' + divisions
    if (curveKey === this._lastCurveKey) return
    this._lastCurveKey = curveKey
    var lengths = [0]
    for (var index = 1; index < values.length; index++) {
      var dx = values[index][0] - values[index - 1][0]
      var dy = values[index][1] - values[index - 1][1]
      var dz = values[index][2] - values[index - 1][2]
      lengths.push(lengths[index - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz))
    }
    var total = lengths[lengths.length - 1]
    if (!(total > 0)) return
    var result = []
    var segment = 1
    for (var pointIndex = 0; pointIndex <= divisions; pointIndex++) {
      var target = total * pointIndex / divisions
      while (segment + 1 < lengths.length && lengths[segment] < target) segment++
      var startLength = lengths[segment - 1]
      var span = lengths[segment] - startLength
      var ratio = span > 0 ? (target - startLength) / span : 0
      result.push([
        values[segment - 1][0] + (values[segment][0] - values[segment - 1][0]) * ratio,
        values[segment - 1][1] + (values[segment][1] - values[segment - 1][1]) * ratio,
        values[segment - 1][2] + (values[segment][2] - values[segment - 1][2]) * ratio
      ])
    }
    this.setPoints(result)
  }
  DivideCurve.prototype.onExecute = function () { this.dividePolyline(); this.setOutputData(0, this.points) }

  function DrawPoint () {
    this.addInput('point', 'vec3')
    this.addOutput('point', 'vec3')
    this.properties = { x: 0, y: 0, z: 0, color: '#31ccec', size: 8, visible: true }
    this.addWidget('number', 'X', 0, 'x')
    this.addWidget('number', 'Y', 0, 'y')
    this.addWidget('number', 'Z', 0, 'z')
  }
  DrawPoint.title = 'Draw Point'
  DrawPoint.desc = 'Displays a point in the Three.js viewport.'
  DrawPoint.prototype.onExecute = function () {
    var input = this.getInputData(0)
    var point = Array.isArray(input) || ArrayBuffer.isView(input)
      ? [Number(input[0]) || 0, Number(input[1]) || 0, Number(input[2]) || 0]
      : [Number(this.properties.x) || 0, Number(this.properties.y) || 0, Number(this.properties.z) || 0]
    this.setOutputData(0, point)
    if (global.parent !== global) {
      global.parent.postMessage({
        type: 'pandaui-draw-point',
        id: 'draw-point-' + this.id,
        x: point[0], y: point[1], z: point[2],
        color: this.properties.color,
        size: this.properties.size,
        visible: this.properties.visible !== false,
        nodeId: this.id,
        portIndex: 0,
        portName: 'point'
      }, global.location.origin)
    }
  }

  PandaUI.registerNode('widget/slider', Slider)
  PandaUI.registerNode('geometry/get_curve', GetCurve)
  PandaUI.registerNode('geometry/divide_curve', DivideCurve)
  PandaUI.registerNode('geometry/draw_point', DrawPoint)

  global.addEventListener('message', function (event) {
    if (event.origin !== global.location.origin || !event.data || !global.graph) return
    var data = event.data
    if (data.type !== 'pandaui-curve-picked') return
    var node = global.graph.getNodeById(data.nodeId)
    if (node && node.type === 'geometry/get_curve') node.setCurve(data.curveId, data.sourceObject, data.points)
  })
})(window)
