(function (PandaUI, global) {
  'use strict'
  var nodes = new Set(), sequence = 0
  function send (node, command) {
    node._requestId = String(node.id) + ':' + (++sequence)
    node._status.value = 'Working…'
    node.setDirtyCanvas(true, true)
    global.parent.postMessage({ type: 'pandaui-mnurbs-command', nodeId: String(node.id), requestId: node._requestId,
      command: command, mode: node.properties.mode === 'Mesh' ? 'mesh' : 'smooth', scope: node.properties.scope === 'All SubD' ? 'all' : 'selected' }, global.location.origin)
  }
  function SubDDisplay () {
    this.properties = { mode: 'Smooth', scope: 'Selected' }
    this.addWidget('combo', 'Display', 'Smooth', 'mode', { values: ['Smooth', 'Mesh'] })
    this.addWidget('combo', 'Scope', 'Selected', 'scope', { values: ['Selected', 'All SubD'] })
    this.addWidget('button', 'Apply display', '', function () { send(this, 'display') }.bind(this))
    this._status = this.addWidget('label', 'Status', 'Select a SubD, then apply')
    this.size = [300, 160]
  }
  SubDDisplay.title = 'SubD Display'
  SubDDisplay.desc = 'Smooth limit-surface display or original control mesh. Geometry remains SubD.'
  function ControlPoints () {
    this.properties = {}
    this.addWidget('button', 'Control points on', '', function () { send(this, 'points-on') }.bind(this))
    this.addWidget('button', 'Control points off', '', function () { send(this, 'points-off') }.bind(this))
    this._status = this.addWidget('label', 'Status', 'Select a curve, surface or SubD')
    this.size = [300, 140]
  }
  ControlPoints.title = 'Control Points'
  ControlPoints.desc = 'Edit the selected geometry using control points and Gumball. Ctrl+Z to undo.'
  ;[SubDDisplay, ControlPoints].forEach(function (type) {
    type.prototype.onAdded = function () { nodes.add(this) }
    type.prototype.onRemoved = function () { nodes.delete(this); this._requestId = null }
  })
  PandaUI.registerNode('MNurbs/SubD Display', SubDDisplay)
  PandaUI.registerNode('MNurbs/Control Points', ControlPoints)
  global.addEventListener('message', function (event) {
    if (event.source !== global.parent || event.origin !== global.location.origin || event.data?.type !== 'pandaui-mnurbs-status') return
    nodes.forEach(function (node) {
      if (String(node.id) !== event.data.nodeId || node._requestId !== event.data.requestId) return
      node._status.value = event.data.error || event.data.status
      node.setDirtyCanvas(true, true)
    })
  })
})(PandaUI, window)

