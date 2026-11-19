/* global PandaUI */
(function (PandaUI, global) {
  'use strict'
  var nodes = new Set(), sequence = 0
  var schema = global.PandaUIMaterialSchema, defaults = schema.defaults
  var refs = global.PandaUISceneReferences
  var labels = { materialType: 'Material type', color: 'Color', roughness: 'Roughness', metalness: 'Metalness', opacity: 'Opacity', clearcoat: 'Clearcoat', emissive: 'Emissive', emissiveIntensity: 'Emissive intensity' }
  schema.groups.forEach(function (group) { group.fields.forEach(function (field) { if (!labels[field[1]]) labels[field[1]] = field[0] }) })
  function ports (node) {
    var fields = [['Geometry', 'geometry,scene.object'], ['Material key', 'string']]
    Object.keys(defaults).filter(function (key) { return key !== 'frostDistance' }).forEach(function (key) { fields.push([labels[key], typeof defaults[key] === 'number' ? 'number' : 'string']) })
    Object.keys(schema.textures).forEach(function (key) { fields.push([schema.textures[key].label + ' texture', 'string,render.texture']) })
    fields.push([labels.frostDistance, 'number']) // Append after existing ports to preserve saved links.
    fields.forEach(function (field) { if (node.findInputSlot(field[0]) < 0) node.addInput(field[0], field[1]) })
  }
  function setting (key, value) {
    if (schema.ranges[key]) {
      var n = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN
      return Number.isFinite(n) ? Math.max(schema.ranges[key][0], Math.min(schema.ranges[key][1], n)) : defaults[key]
    }
    if (key === 'materialType') return Object.prototype.hasOwnProperty.call(schema.types, value) ? value : defaults[key]
    return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : defaults[key]
  }
  function status (node, text) { node._status.value = text; node.setDirtyCanvas(true, true) }
  function send (node, type, values) {
    var request = String(node.id) + ':' + (++sequence)
    global.parent.postMessage(Object.assign({ type: type, nodeId: String(node.id), requestId: request }, values), global.location.origin)
    return request
  }
  function SceneMaterial () {
    this.widgetUI = 'scene-material'
    this.properties = Object.assign({ materialKey: '', materialName: '', typeSettings: {} }, defaults)
    Object.keys(schema.textures).forEach(function (key) { this.properties[key] = ''; this.properties[key + 'Name'] = '' }, this)
    this._catalog = []; this._last = null
    ports(this)
    this.addOutput('Material', 'render.material')
    this.addWidget('button', 'Refresh materials', '', this.refresh.bind(this))
    this.addWidget('button', 'Choose material', '', this.choose.bind(this))
    this._selected = this.addWidget('label', 'Material', 'None selected')
    Object.keys(defaults).filter(function (key) { return key !== 'materialType' }).forEach(function (key) {
      var widget = this.addWidget(typeof defaults[key] === 'string' ? 'color' : 'slider', labels[key] || key, defaults[key], key,
        { min: key === 'frostDistance' ? 0.0001 : 0, max: key === 'frostDistance' ? 1000000 : key === 'emissiveIntensity' ? 20 : 1, step: key === 'frostDistance' ? 1 : 0.01 })
      widget.callback = this.queue.bind(this)
    }, this)
    this.addWidget('button', 'Choose color texture', '', this.pickTexture.bind(this))
    this.addWidget('button', 'Remove color texture', '', function () { this.setProperty('texture', null); this.setProperty('textureName', ''); this.queue() }.bind(this))
    this._file = this.addWidget('label', 'Texture', 'Original texture')
    this._status = this.addWidget('label', 'Status', 'Choose an imported scene material')
    this.size = [410, 820]; this.computeSize()
  }
  SceneMaterial.title = 'Scene Material'
  SceneMaterial.desc = 'Edit an imported material on all editable objects using it in this document. Changes apply immediately.'
  SceneMaterial.prototype.getMinimumSize = function () { return [340, 34 + Math.max(this.inputs.length, this.outputs.length) * 22 + 650] }
  SceneMaterial.prototype.computeSize = function () { var minimum = this.getMinimumSize(); this.size[0] = Math.max(this.size[0], minimum[0]); this.size[1] = Math.max(this.size[1], minimum[1]); this.ensurePortLabelWidth(); return this.size }
  SceneMaterial.prototype.setMaterialType = function (type) {
    if (!schema.types[type] || type === this._activeType) return
    var saved = this.properties.typeSettings || {}, state = {}
    Object.keys(defaults).forEach(function (key) { state[key] = this.properties[key] }, this)
    if (this._activeType) saved[this._activeType] = state
    Object.assign(this.properties, defaults, saved[type] || schema.types[type].values, { materialType: type, typeSettings: saved })
    this._activeType = type; this.sync(); this.queue()
    this.graph?.commitHistory('material-type', this)
  }
  SceneMaterial.prototype.preview = function () {
    global.clearTimeout(this._previewTimer)
    if (!this.properties.materialKey) return
    var node = this
    this._previewTimer = global.setTimeout(function () {
      if (!node.graph) return
      node._previewRequest = send(node, 'pandaui-scene-material-preview', { key: node.properties.materialKey })
    }, 100)
  }
  SceneMaterial.prototype.refresh = function () { this._listRequest = send(this, 'pandaui-scene-materials-list'); status(this, 'Loading materials…') }
  SceneMaterial.prototype.choose = function () {
    if (!this._catalog.length) this.refresh()
    this._focusMaterialSearch?.()
  }
  SceneMaterial.prototype.selectMaterial = function (key) {
    this._pendingSceneMaterialKey = null
    if (refs.hasInput(this, 'Geometry') && key !== this._referenceMaterialKey) return
    if (!refs.hasInput(this, 'Geometry') && refs.hasInput(this, 'Material key') && key !== refs.scalar(refs.value(this, 'Material key'))) return
    if (key === this.properties.materialKey) return
    var entry = this._catalog.find(function (m) { return m.key === key })
    if (!entry) return
    // Flush an edit for the previous material before changing the selection.
    if (this._queued) {
      global.clearTimeout(this._queued); this._queued = null
      if (!refs.hasInput(this, 'Geometry') && !refs.hasInput(this, 'Material key')) this.publish()
    }
    this._loading = true
    this.properties.materialKey = key; this.properties.materialName = entry.name
    Object.assign(this.properties, defaults, entry.settings)
    this.properties.typeSettings = {}; this._activeType = this.properties.materialType
    Object.keys(schema.textures).forEach(function (key) { this.properties[key] = ''; this.properties[key + 'Name'] = entry[key + 'Name'] || '' }, this)
    this._previewImage = null; this._previewRequest = null; this._previewError = ''; this.preview()
    this._last = JSON.stringify(this.payload(false)); this._loading = false
    this.sync(); status(this, entry.count + ' object(s) use this material')
    if (this.graph) { this.graph.commitHistory('scene-material-selection', this); this.graph.invalidateNode(this, { source: true, propagate: true, reason: 'material-selection' }) }
  }
  SceneMaterial.prototype.sync = function () {
    this.widgets.forEach(function (widget) { if (widget.property) widget.value = this.properties[widget.property] }, this)
    this._selected.value = this.properties.materialName || 'None selected'
    this._file.value = this.properties.textureName || (this.properties.texture === null ? 'None' : 'Original texture')
    this.setDirtyCanvas(true, true)
  }
  SceneMaterial.prototype.payload = function (useInputs) {
    var settings = {}
    Object.keys(defaults).forEach(function (key) { settings[key] = setting(key, refs.scalar(useInputs === false ? this.properties[key] : refs.value(this, labels[key], this.properties[key]))) }, this)
    Object.keys(schema.textures).forEach(function (name) {
      var value = useInputs === false ? this.properties[name] : refs.value(this, schema.textures[name].label + ' texture', this.properties[name])
      if (value !== null) {
        var texture = refs.collect(value, function (item) { return item && item.kind === 'render.texture' })[0]
        value = texture ? texture.url : refs.scalar(value)
      }
      if (value !== '' && value !== undefined) { settings[name] = value; settings[name + 'Name'] = this.properties[name + 'Name'] }
    }, this)
    return { key: this.properties.materialKey, settings: settings }
  }
  SceneMaterial.prototype.resolveSelection = function () {
    if (refs.hasInput(this, 'Geometry')) {
      var values = refs.references(refs.value(this, 'Geometry'))
      var key = JSON.stringify(values.map(function (ref) { return [ref.documentId, ref.objectId] }))
      if (key !== this._referenceKey) {
        if (!this.graph || this.graph._restoring) return false
        this._referenceKey = key; this._referenceResolved = false; this._referenceRequest = null; this._referenceMaterialKey = null; this._pendingReferenceKeys = null
        if (values.length === 1 && this.graph && !this.graph._restoring) {
          this._referenceRequest = send(this, 'pandaui-scene-material-reference', { reference: values[0] })
          status(this, 'Loading object material...')
        }
      }
      if (values.length !== 1) status(this, 'Connect exactly one object from a Parameter Geometry node')
      return this._referenceResolved === true
    }
    this._referenceKey = null; this._referenceRequest = null; this._referenceResolved = false; this._pendingReferenceKeys = null
    if (refs.hasInput(this, 'Material key')) {
      var materialKey = refs.scalar(refs.value(this, 'Material key'))
      if (!this._catalog.some(function (entry) { return entry.key === materialKey })) { status(this, 'Connected material key was not found'); return false }
      this.selectMaterial(materialKey)
    }
    return true
  }
  SceneMaterial.prototype.selectReferenceMaterial = function (keys) {
    if (!keys.length) { status(this, 'No editable material found on this object'); return false }
    if (!this._catalog.some(function (item) { return item.key === keys[0] })) return false
    this._pendingReferenceKeys = null
    this._referenceMaterialKey = keys[0]; this._referenceResolved = true; this.selectMaterial(keys[0]); this._revealMaterial?.()
    this.graph?.invalidateNode(this, { source: true, propagate: true, reason: 'material-reference' })
    return true
  }
  SceneMaterial.prototype.queue = function () {
    if (this._loading || !this.graph || this._queued) return
    var node = this
    this._queued = global.setTimeout(function () { node._queued = null; if (node.graph) node.publish() }, 32)
  }
  SceneMaterial.prototype.publish = function () {
    this.sync()
    if (!this.resolveSelection()) return
    if (!this.properties.materialKey) return
    var payload = this.payload(), key = JSON.stringify(payload)
    if (key === this._last) return
    this._last = key
    const entry = this._catalog.find(function (item) { return item.key === payload.key })
    if (entry) {
      Object.assign(entry.settings, payload.settings)
      Object.keys(schema.textures).forEach(function (name) { if (Object.prototype.hasOwnProperty.call(payload.settings, name)) entry[name + 'Name'] = payload.settings[name + 'Name'] || '' })
    }
    this._editRequest = send(this, 'pandaui-scene-material-edit', payload)
    this._sentPayload = payload
    status(this, 'Updating…')
  }
  SceneMaterial.prototype.onPropertyChanged = function (name, value) { if (name === 'materialType') this.setMaterialType(value); this.queue() }
  SceneMaterial.prototype.onExecute = function () {
    if (!this.resolveSelection()) { this.setOutputData(0, null); return }
    var settings = this.payload().settings, textures = {}
    Object.keys(schema.textures).forEach(function (key) { if (Object.prototype.hasOwnProperty.call(settings, key)) textures[schema.textures[key].slot] = settings[key] })
    this.setOutputData(0, Object.assign({ kind: 'render.material', textures: textures }, settings)); this.publish()
  }
  SceneMaterial.prototype.onAdded = function () { nodes.add(this); this._referenceKey = null; this.refresh() }
  SceneMaterial.prototype.onConfigure = function (data) { if (data && data.properties) Object.assign(this.properties, data.properties); ports(this); this.computeSize(); this._activeType = this.properties.materialType; this.sync(); this.queue(); this.preview() }
  SceneMaterial.prototype.onSerialize = function (data) {
    data.widgets = data.widgets.filter(function (w) { return !!w.property }).map(function (w) { w.value = data.properties[w.property]; return w })
  }
  SceneMaterial.prototype.pickTexture = function (name) {
    name = typeof name === 'string' && schema.textures[name] ? name : 'texture'
    var node = this
    global.PandaUIWidgetPickers.file('image/png,image/jpeg,image/webp,image/gif,image/bmp', function (file) {
      if (!node.graph) return
      if (node._reader) node._reader.abort()
      var reader = node._reader = new global.FileReader()
      reader.onload = function () {
        if (node._reader !== reader || !node.graph) return
        node._reader = null
        var other = name === 'bumpTexture' ? 'normalTexture' : name === 'normalTexture' ? 'bumpTexture' : null
        if (other) { node.setProperty(other, null); node.setProperty(other + 'Name', '') }
        node.setProperty(name, reader.result); node.setProperty(name + 'Name', file.name); node.queue()
      }
      reader.onerror = function () { status(node, 'Could not read image') }
      reader.readAsDataURL(file)
    })
  }
  SceneMaterial.prototype.onRemoved = function () {
    nodes.delete(this); global.clearTimeout(this._queued); this._queued = null
    global.clearTimeout(this._previewTimer); this._previewImage = null
    this._reader?.abort(); this._reader = null
    this._referenceRequest = null
  }
  PandaUI.registerNode('render/scene_material', SceneMaterial)

  function ColorPicker () {
    this.widgetUI = 'color-picker'
    this.properties = { color: '#ffffff' }
    this.addInput('Color', 'string')
    this.addWidget('color', 'Color', '#ffffff', 'color')
    this.addOutput('Color', 'string'); this.size[0] = 250; this.computeSize()
  }
  ColorPicker.title = 'Color Picker'
  ColorPicker.desc = 'Pick a color and connect it to material, light or environment color inputs.'
  ColorPicker.prototype.computeSize = function () { this.size[0] = Math.max(this.size[0], 250); this.size[1] = Math.max(this.size[1], 140); return this.size }
  ColorPicker.prototype.onExecute = function () { this.setOutputData(0, setting('color', refs.scalar(refs.value(this, 'Color', this.properties.color)))) }
  ColorPicker.prototype.onConfigure = function (data) { if (data && data.properties) Object.assign(this.properties, data.properties); if (this.findInputSlot('Color') < 0) this.addInput('Color', 'string') }
  ColorPicker.prototype.onSerialize = SceneMaterial.prototype.onSerialize
  PandaUI.registerNode('render/color_picker', ColorPicker)

  global.addEventListener('message', function (event) {
    if (event.source !== global.parent || event.origin !== global.location.origin) return
    var message = event.data
    if (!message) return
    nodes.forEach(function (node) {
      if (message.type === 'pandaui-scene-material-selection') {
        if (refs.hasInput(node, 'Geometry') || refs.hasInput(node, 'Material key')) return
        var keys = message.keys || []
        node._sceneMaterialKeys = keys
        node._pendingSceneMaterialKey = null
        if (keys.length) {
          if (!node._catalog.some(function (item) { return item.key === keys[0] })) { node._pendingSceneMaterialKey = keys[0]; node.refresh(); return }
          node.selectMaterial(keys[0]); node._revealMaterial?.()
          if (keys.length > 1) status(node, keys.length + ' materials on selected object; showing the first')
        }
        return
      }
      if (String(node.id) !== message.nodeId) return
      if (message.type === 'pandaui-scene-material-reference-result' && node._referenceRequest && message.requestId === node._referenceRequest) {
        node._referenceRequest = null
        // Check the currently resolved input too: upstream may change before its next solve.
        var current = refs.references(refs.value(node, 'Geometry'))
        if (!refs.hasInput(node, 'Geometry') || JSON.stringify(current.map(function (ref) { return [ref.documentId, ref.objectId] })) !== node._referenceKey) return
        if (message.error) { status(node, message.error); return }
        ;(message.materials || []).forEach(function (entry) {
          var index = node._catalog.findIndex(function (item) { return item.key === entry.key })
          if (index < 0) node._catalog.push(entry); else node._catalog[index] = entry
        })
        var referenceKeys = message.keys || message.selectedKeys || (message.materials || []).map(function (item) { return item.key })
        if (!node.selectReferenceMaterial(referenceKeys) && referenceKeys.length) { node._pendingReferenceKeys = referenceKeys; node.refresh() }
        return
      }
      if (message.type === 'pandaui-scene-materials-result' && message.requestId === node._listRequest) {
        if (message.error) { status(node, message.error); return }
        node._catalog = message.materials || []
        if (node._pendingReferenceKeys) {
          var refsNow = refs.references(refs.value(node, 'Geometry'))
          if (refs.hasInput(node, 'Geometry') && JSON.stringify(refsNow.map(function (ref) { return [ref.documentId, ref.objectId] })) === node._referenceKey) {
            if (!node.selectReferenceMaterial(node._pendingReferenceKeys)) { node._pendingReferenceKeys = null; status(node, 'No editable material found on this object'); return }
          } else node._pendingReferenceKeys = null
        }
        var followKey = node._pendingSceneMaterialKey || (!node.properties.materialKey ? message.selectedKeys?.[0] : null)
        node._pendingSceneMaterialKey = null
        if (followKey && !refs.hasInput(node, 'Geometry') && !refs.hasInput(node, 'Material key')) { node.selectMaterial(followKey); node._revealMaterial?.() }
        status(node, node._catalog.length + ' editable material(s)')
        if (node.properties.materialKey) node.preview()
      }
      if (message.type === 'pandaui-scene-material-status' && message.requestId === node._editRequest) {
        status(node, message.error || message.status)
        if (message.error) node._last = null
        else if (node._sentPayload) {
          var entry = node._catalog.find(function (item) { return item.key === node._sentPayload.key })
          if (entry) {
            Object.assign(entry.settings, node._sentPayload.settings)
            Object.keys(schema.textures).forEach(function (key) { if (Object.prototype.hasOwnProperty.call(node._sentPayload.settings, key)) entry[key + 'Name'] = node._sentPayload.settings[key + 'Name'] || '' })
          }
          node.preview()
        }
      }
      if (message.type === 'pandaui-scene-material-preview-result' && message.requestId === node._previewRequest) {
        node._previewImage = message.image || null; node._previewError = message.error || ''; node.setDirtyCanvas(true, true)
      }
    })
  })
})(PandaUI, window)
