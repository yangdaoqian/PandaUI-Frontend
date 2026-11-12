(function (global) {
  'use strict'
  var kernel = global.PandaUIKernel = global.PandaUIKernel || {}
  kernel.installGraphGroups = function (PandaUI) {
  var GraphDocument = PandaUI.GraphDocument
  var nextGroupId = 0
  function GraphGroup (options) {
    options = options || {}
    this.id = String(options.id || 'group-' + (++nextGroupId))
    this.title = String(options.title || 'Group')
    this.pos = Array.isArray(options.pos) ? options.pos.slice(0, 2) : [80, 80]
    this.size = Array.isArray(options.size) ? options.size.slice(0, 2) : [320, 220]
    this.color = String(options.color || '#7f8c9a')
    this.font_size = Number(options.font_size || options.fontSize || 22)
    this.flags = Object.assign({}, options.flags || {})
    this._nodes = []
  }

  GraphGroup.prototype.serialize = function () {
    return {
      id: this.id,
      title: this.title,
      pos: this.pos.slice(),
      size: this.size.slice(),
      color: this.color,
      font_size: this.font_size,
      flags: Object.assign({}, this.flags)
    }
  }

  GraphGroup.prototype.configure = function (data) {
    data = data || {}
    if (data.id != null) this.id = String(data.id)
    if (data.title != null) this.title = String(data.title)
    if (Array.isArray(data.pos)) this.pos = data.pos.slice(0, 2)
    else if (Array.isArray(data.bounding)) this.pos = data.bounding.slice(0, 2)
    if (Array.isArray(data.size)) this.size = data.size.slice(0, 2)
    else if (Array.isArray(data.bounding)) this.size = data.bounding.slice(2, 4)
    if (data.color != null) this.color = String(data.color)
    if (data.font_size != null) this.font_size = Number(data.font_size) || this.font_size
    this.flags = Object.assign({}, data.flags || {})
    return this
  }

  function ensureGroups (document) {
    if (!Array.isArray(document._groups)) document._groups = []
    return document._groups
  }

  var serializeDocument = GraphDocument.prototype.serialize
  GraphDocument.prototype.serialize = function () {
    var result = serializeDocument.call(this)
    result.groups = ensureGroups(this).map(function (group) { return group.serialize() })
    return result
  }

  var configureDocument = GraphDocument.prototype.configure
  GraphDocument.prototype.configure = function (data, options) {
    options = options || {}
    var result = configureDocument.call(this, data, Object.assign({}, options, { skipHistory: true }))
    this._groups = (data && data.groups || []).map(function (saved) { return new GraphGroup().configure(saved) })
    if (!options.skipHistory) this.commitHistory('configure', options.replaceHistory !== false)
    this.setDirtyCanvas()
    return result
  }

  var clearDocument = GraphDocument.prototype.clear
  GraphDocument.prototype.clear = function (options) {
    options = options || {}
    this._groups = []
    var result = clearDocument.call(this, Object.assign({}, options, { silent: true }))
    if (!options.silent) this.commitHistory('clear')
    return result
  }

  GraphDocument.prototype.addGroup = function (group, options) {
    group = group instanceof GraphGroup ? group : new GraphGroup(group)
    ensureGroups(this).push(group)
    if (!options || !options.silent) this.commitHistory('add-group')
    this.setDirtyCanvas()
    return group
  }

  GraphDocument.prototype.removeGroup = function (group, options) {
    var groups = ensureGroups(this)
    var index = groups.indexOf(group)
    if (index < 0) return false
    groups.splice(index, 1)
    if (!options || !options.silent) this.commitHistory('remove-group')
    this.setDirtyCanvas()
    return true
  }

  PandaUI.GraphGroup = GraphGroup

  kernel.GraphGroup = GraphGroup
  }
})(typeof window !== 'undefined' ? window : globalThis)
