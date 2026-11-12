(function (PandaUI, global) {
  'use strict'

  function send (message) {
    if (global.parent !== global) global.parent.postMessage(message, global.location.origin)
  }

  function planeValue (value, depth) {
    if (value == null || (depth || 0) > 20) return null
    var next = function (item) { return planeValue(item, (depth || 0) + 1) }
    if (value._isDualData) return next(value.display && value.display.treeData) || next(value.raw)
    if (value.dataTreeSummary) return next(value.dataTreeSummary)
    if (value.dataTree) return next(value.dataTree)
    if (Array.isArray(value.datas)) return next(value.datas)
    if (/^(?:panda|rhino)\.plane$/.test(value.__geo) || value.kind === 'structRef') return next(value.data)
    if (value.kind === 'clippingPlane') return next(value.plane)
    if (Array.isArray(value)) {
      if ((value.length === 9 || value.length === 12) && value.every(function (item) { return typeof item === 'number' && Number.isFinite(item) })) return value.slice(0, 9)
      if (value.length === 2 && typeof value[0] === 'string') return next(value[1])
      for (var index = 0; index < value.length; index++) { var result = next(value[index]); if (result) return result }
      return null
    }
    if (value.origin || value.Origin) return value
    var paths = Object.keys(value).filter(function (key) { return /^path\d+$/.test(key) }).sort(function (first, second) { return Number(first.slice(4)) - Number(second.slice(4)) })
    for (var pathIndex = 0; pathIndex < paths.length; pathIndex++) { var plane = next(value[paths[pathIndex]]); if (plane) return plane }
    return null
  }

  function ClippingPlane () {
    this.addInput('Plane', 'plane')
    this.addOutput('Clipping Plane', 'clippingplane')
    this.properties = { enabled: true, flipped: false, showHelper: true, showSection: true, fillSection: false, planeTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }
    this.addWidget('toggle', 'Enabled', true, 'enabled')
    this.addWidget('toggle', 'Flip direction', false, 'flipped')
    this.addWidget('toggle', 'Show plane', true, 'showHelper')
    this.addWidget('toggle', 'Show section lines', true, 'showSection')
    this.addWidget('toggle', 'Fill section', false, 'fillSection')
    this.size = [260, 200]
    this._lastKey = null
  }

  ClippingPlane.title = 'Clipping Plane'
  ClippingPlane.desc = 'Clip viewport geometry with a plane. The arrow points to the retained side. Defaults to World XY when disconnected.'
  ClippingPlane.prototype.onExecute = function () {
    var connected = this.inputs[0].link != null || (this.inputs[0].links && this.inputs[0].links.length > 0)
    var plane = connected ? planeValue(this.getInputData(0)) : [0, 0, 0, 1, 0, 0, 0, 1, 0]
    var matrix = this.properties.planeTransform
    if (plane && Array.isArray(matrix) && matrix.length === 16 && matrix.every(Number.isFinite)) {
      var components = function (value) { return Array.isArray(value) ? value : value ? [value.x == null ? value.X : value.x, value.y == null ? value.Y : value.y, value.z == null ? value.Z : value.z] : [NaN, NaN, NaN] }
      var origin = Array.isArray(plane) ? plane.slice(0, 3) : components(plane.origin || plane.Origin)
      var xAxis = Array.isArray(plane) ? plane.slice(3, 6) : components(plane.xAxis || plane.XAxis)
      var yAxis = Array.isArray(plane) ? plane.slice(6, 9) : components(plane.yAxis || plane.YAxis)
      var transform = function (point, translation) {
        return [0, 1, 2].map(function (row) { return matrix[row] * point[0] + matrix[row + 4] * point[1] + matrix[row + 8] * point[2] + (translation ? matrix[row + 12] : 0) })
      }
      plane = transform(origin, true).concat(transform(xAxis, false), transform(yAxis, false))
    }
    var descriptor = plane ? { kind: 'clippingPlane', plane: plane, enabled: this.properties.enabled !== false, flipped: this.properties.flipped === true, showHelper: this.properties.showHelper !== false, showSection: this.properties.showSection !== false, fillSection: this.properties.fillSection === true } : null
    this.setOutputData(0, descriptor)
    var key = JSON.stringify(descriptor)
    if (key !== this._lastKey) {
      this._lastKey = key
      send({ type: 'pandaui-clipping-plane', nodeId: String(this.id), descriptor: descriptor })
    }
  }
  ClippingPlane.prototype.onAdded = function () { this._lastKey = null; this.onExecute() }
  ClippingPlane.prototype.onPropertyChanged = function (name) {
    if (name === 'planeTransform') {
      var node = this
      Promise.resolve().then(function () { if (node.graph) node.onExecute() })
    }
  }
  ClippingPlane.prototype.onConfigure = function () { this._lastKey = null }
  ClippingPlane.prototype.onRemoved = function () { send({ type: 'pandaui-clipping-plane-clear', nodeId: String(this.id) }) }

  PandaUI.registerNode('display/clipping_plane', ClippingPlane)
})(PandaUI, window)
