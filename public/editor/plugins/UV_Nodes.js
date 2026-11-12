/* global PandaUI */
(function (PandaUI, global) {
  'use strict'
  var nodes = new Set(), sequence = 0, refs = global.PandaUISceneReferences
  var mappings = ['existing', 'xy', 'xz', 'yz', 'box', 'cylindrical', 'spherical']
  var fields = [['Mapping', 'mapping', 'string'], ['U scale', 'scaleU', 'number'], ['V scale', 'scaleV', 'number'], ['U offset', 'offsetU', 'number'], ['V offset', 'offsetV', 'number'], ['Rotation (degrees)', 'rotation', 'number']]
  function status (node, text) { node._status.value = text; node.setDirtyCanvas(true, true) }
  function ports (node) {
    var inputs = [['Target', 'target', 'geometry,scene.object']].concat(node._match ? [['Source', 'source', 'geometry,scene.object'], ['Match', 'matchMode', 'string']] : fields).concat([['Auto apply', 'autoApply', 'boolean']])
    inputs.forEach(function (field) { if (node.findInputSlot(field[0]) < 0) node.addInput(field[0], field[2]) })
  }
  function single (node, label, key) {
    var values = refs.references(refs.value(node, label, node.properties[key]))
    if (values.length !== 1) throw new Error('Connect exactly one ' + key + ' from a Parameter Geometry node')
    return values[0]
  }
  function resolved (node, action) {
    var result = { target: single(node, 'Target', 'target') }
    if (action === 'reset') return result
    if (node._match) {
      result.source = single(node, 'Source', 'source')
      if (result.source.documentId === result.target.documentId && result.source.objectId === result.target.objectId) throw new Error('Source and target must be different objects')
      result.matchMode = refs.scalar(refs.value(node, 'Match', node.properties.matchMode))
      if (['mapping', 'coordinates'].indexOf(result.matchMode) < 0) throw new Error('Choose a valid UV match mode')
    } else {
      result.settings = {}
      fields.forEach(function (field) {
        var value = refs.scalar(refs.value(node, field[0], node.properties[field[1]]))
        if (field[1] === 'mapping') {
          if (mappings.indexOf(value) < 0) throw new Error('Choose a valid UV mapping')
        } else {
          if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) throw new Error(field[0] + ' must be a finite number')
          value = Number(value)
          if (!Number.isFinite(value)) throw new Error(field[0] + ' must be a finite number')
        }
        result.settings[field[1]] = value
      })
    }
    return result
  }
  // Names are labels, not operation inputs. Renaming must not create an undo entry.
  function operationKey (payload) { return JSON.stringify(payload, function (key, value) { return key === 'name' ? undefined : value }) }
  function autoApply (node) { return refs.scalar(refs.value(node, 'Auto apply', node.properties.autoApply)) === true }
  function request (node, action, automatic) {
    if (!node.graph || node.graph._restoring) return
    try {
      var payload = resolved(node, action), key = operationKey(payload)
      if (automatic && key === node._lastApplied) return
      if (action !== 'reset') node._lastApplied = key
      else {
        try { node._lastApplied = operationKey(resolved(node)) } catch (_) { node._lastApplied = null }
      }
      node._request = String(node.id) + ':' + (++sequence)
      status(node, 'Working...')
      try {
        global.parent.postMessage(Object.assign({ type: 'pandaui-object-uv', nodeId: String(node.id), requestId: node._request, action: action }, payload), global.location.origin)
      } catch (error) {
        node._request = null; node._lastApplied = null
        throw error
      }
    } catch (error) { status(node, error.message) }
  }
  function shared (node) {
    ports(node)
    node.addOutput('Object', 'scene.object')
    node._target = node.addWidget('label', 'Target', 'None')
  }
  function controls (node, label, action) {
    node.addWidget('toggle', 'Auto apply', true, 'autoApply')
    node.addWidget('button', label, '', function () { global.clearTimeout(node._timer); request(node, action) })
    node.addWidget('button', 'Reset UV', '', function () { global.clearTimeout(node._timer); request(node, 'reset') })
    node._status = node.addWidget('label', 'Status', 'Connect a Parameter Geometry node')
    node.size[0] = 350; node.computeSize()
  }
  function UVEdit () {
    this.properties = { target: null, mapping: 'existing', scaleU: 1, scaleV: 1, offsetU: 0, offsetV: 0, rotation: 0, autoApply: true }
    shared(this)
    this.addWidget('combo', 'Mapping', 'existing', 'mapping', { values: mappings })
    fields.slice(1).forEach(function (pair) { this.addWidget('number', pair[0], this.properties[pair[1]], pair[1], { step: 0.01 }) }, this)
    controls(this, 'Apply UV', 'apply')
  }
  UVEdit.title = 'UV Edit'
  UVEdit.desc = 'Connect Parameter Geometry to edit one object UV projection, scale, offset and rotation. Connected values override controls.'
  function UVMatch () {
    this._match = true
    this.properties = { source: null, target: null, matchMode: 'mapping', autoApply: true }
    shared(this)
    this._source = this.addWidget('label', 'Source', 'None')
    this.addWidget('combo', 'Match', 'mapping', 'matchMode', { values: ['mapping', 'coordinates'] })
    controls(this, 'Match UV', 'match')
  }
  UVMatch.title = 'UV Match'
  UVMatch.desc = 'Connect one source and one different target from Parameter Geometry nodes. Match projection or copy coordinates between meshes with identical topology.'
  ;[UVEdit, UVMatch].forEach(function (type) {
    type.prototype.queue = function () {
      if (!this.graph || this.graph._restoring || !autoApply(this)) { global.clearTimeout(this._timer); this._timer = null; return }
      try {
        var key = operationKey(resolved(this))
        if (key === this._lastApplied) { global.clearTimeout(this._timer); this._timer = null; return }
        if (this._timer && key === this._pendingKey) return
        global.clearTimeout(this._timer); this._pendingKey = key
      } catch (error) { global.clearTimeout(this._timer); this._timer = null; status(this, error.message); return }
      this._timer = global.setTimeout(function () {
        this._timer = null
        if (autoApply(this)) request(this, this._match ? 'match' : 'apply', true)
      }.bind(this), 80)
    }
    type.prototype.onPropertyChanged = function () { this.queue() }
    type.prototype.sync = function () {
      var target = refs.references(refs.value(this, 'Target', this.properties.target))
      this._target.value = target.length === 1 ? target[0].name || target[0].objectId : 'None'
      if (this._source) {
        var source = refs.references(refs.value(this, 'Source', this.properties.source))
        this._source.value = source.length === 1 ? source[0].name || source[0].objectId : 'None'
      }
      this.widgets.forEach(function (widget) { if (widget.property) widget.value = this.properties[widget.property] }, this)
      this.setOutputData(0, target.length === 1 ? target[0] : null)
      this.setDirtyCanvas(true, true)
    }
    type.prototype.onExecute = function () { this.sync(); this.queue() }
    type.prototype.onAdded = function () { nodes.add(this); this.sync() }
    type.prototype.onConfigure = function (data) { if (data && data.properties) Object.assign(this.properties, data.properties); ports(this); this.sync(); this.computeSize() }
    type.prototype.onSerialize = function (data) {
      data.widgets = data.widgets.filter(function (w) { return !!w.property }).map(function (w) { w.value = data.properties[w.property]; return w })
    }
    type.prototype.onRemoved = function () { nodes.delete(this); global.clearTimeout(this._timer); this._request = null }
  })
  PandaUI.registerNode('render/uv_edit', UVEdit)
  PandaUI.registerNode('render/uv_match', UVMatch)
  global.addEventListener('message', function (event) {
    if (event.source !== global.parent || event.origin !== global.location.origin || event.data?.type !== 'pandaui-object-uv-result') return
    var message = event.data
    nodes.forEach(function (node) {
      if (String(node.id) !== message.nodeId || node._request !== message.requestId) return
      node._request = null
      if (message.error) node._lastApplied = null
      status(node, message.error || message.count + ' mesh part(s) updated')
    })
  })
})(PandaUI, window)
