/* global PandaUI */
(function (PandaUI, global) {
  'use strict'

  // Bridge contract: only render/output publishes render.config. All other
  // nodes produce JSON descriptors; no renderer objects or object names cross
  // this boundary. Light IDs and binding targets are stable string IDs.
  var outputs = new Set()
  var references = global.PandaUISceneReferences
  var materialSchema = global.PandaUIMaterialSchema
  var requestSequence = 0
  var roles = ['color', 'roughness', 'metalness', 'normal', 'opacity', 'emissive', 'ao', 'clearcoat']

  function send (message) {
    if (global.parent && global.parent !== global) global.parent.postMessage(message, global.location.origin)
  }
  function requestId (node) { return String(node.id) + ':' + Date.now() + ':' + (++requestSequence) }
  function clone (value) { return JSON.parse(JSON.stringify(value)) }
  function number (value, fallback, min, max, integer) {
    var n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN
    if (!Number.isFinite(n)) n = fallback
    n = Math.max(min, Math.min(max, n))
    return integer ? Math.round(n) : n
  }
  function string (value, fallback) { return typeof value === 'string' ? value : fallback }
  function color (value, fallback) { return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : fallback }
  function url (value) {
    value = string(value, '').trim()
    // Relative, HTTP(S), and embedded images survive graph save/load. Blob URLs
    // do not; the picker embeds files using FileReader instead.
    if (/^data:(?:image\/[\w.+-]+|application\/octet-stream)(?:;[^,]*)?,/i.test(value)) return value
    if (/^[a-z][\w+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return ''
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u001f]/.test(value) ? '' : value
  }
  function vector (value, fallback) {
    if (value && !Array.isArray(value) && typeof value === 'object') value = [value.x == null ? value.X : value.x, value.y == null ? value.Y : value.y, value.z == null ? value.Z : value.z]
    return Array.isArray(value) && value.length === 3
      ? value.map(function (n, i) { return number(n, fallback[i], -1e9, 1e9) }) : fallback.slice()
  }

  var collect = references.collect
  function scalar (value) { return collect(value, function (item) { return typeof item !== 'object' })[0] }
  function descriptors (value, kind) { return collect(value, function (item) { return item && item.kind === kind }) }
  function targets (value) {
    return Array.from(new Set(collect(value, function (item) { return (typeof item === 'string' && item.trim() !== '') || !!references.reference(item) }).map(function (item) {
      return typeof item === 'string' ? item : references.reference(item).objectId
    })))
  }
  function input (node, name) { return node.getInputData(node.findInputSlot(name)) }

  function numeric (key, label, value, min, max, integer) { return { key: key, label: label, value: value, type: 'number', min: min, max: max, integer: !!integer } }
  function field (key, label, value, type, values) { return { key: key, label: label, value: value, type: type, values: values } }
  var schemas = {
    environment: [field('preset', 'Preset', 'studio', 'combo', ['studio', 'sky', 'hdri']), field('url', 'URL', '', 'url'), numeric('intensity', 'Intensity', 1, 0, 100), field('background', 'Background', true, 'boolean'), field('topColor', 'Top color', '#87ceeb', 'color'), field('bottomColor', 'Bottom color', '#ffffff', 'color')],
    material: [field('color', 'Color', '#cccccc', 'color'), numeric('roughness', 'Roughness', 0.5, 0, 1), numeric('metalness', 'Metalness', 0, 0, 1), numeric('opacity', 'Opacity', 1, 0, 1), numeric('clearcoat', 'Clearcoat', 0, 0, 1), field('emissive', 'Emissive', '#000000', 'color'), numeric('emissiveIntensity', 'Emissive intensity', 0, 0, 100)],
    texture: [field('url', 'URL', '', 'url'), field('role', 'Role', 'color', 'combo', roles)],
    light: [field('color', 'Color', '#ffffff', 'color'), numeric('intensity', 'Intensity', 1, 0, 10000), field('position', 'Position', [10, 10, 10], 'vector'), field('target', 'Target', [0, 0, 0], 'vector'), field('castShadow', 'Cast shadow', true, 'boolean'), numeric('angle', 'Angle (radians)', Math.PI / 4, 0.001, Math.PI / 2), numeric('width', 'Width', 5, 0.001, 10000), numeric('height', 'Height', 5, 0.001, 10000), numeric('shadowResolution', 'Shadow resolution', 2048, 256, 4096, true), numeric('shadowBias', 'Shadow depth bias', -0.0002, -0.01, 0.01), numeric('shadowNormalBias', 'Normal bias (-1 = auto)', -1, -1, 1e9), numeric('shadowRadius', 'Shadow softness', 1.5, 0, 8), numeric('shadowExtent', 'Shadow extent (0 = auto)', 0, 0, 1e12), field('shadowAutoFocus', 'Auto shadow focus', true, 'boolean')],
    camera: [field('position', 'Position', [10, 10, 10], 'vector'), field('target', 'Target', [0, 0, 0], 'vector'), numeric('fov', 'Field of view (degrees)', 45, 1, 179), field('projection', 'Projection', 'perspective', 'combo', ['perspective', 'orthographic']), numeric('orthographicHeight', 'Orthographic height', 40, 0.00001, 1e12)],
    quality: [numeric('resolutionScale', 'Resolution scale', 1, 0.1, 2), numeric('interactionScale', 'Interaction scale', 0.6, 0.1, 1), numeric('samples', 'Samples', 128, 1, 65536, true), numeric('bounces', 'Bounces', 4, 1, 16, true)],
    effects: [numeric('exposure', 'Exposure', 1, 0, 20), numeric('ao', 'Ambient occlusion', 0, 0, 1), numeric('bloom', 'Bloom', 0, 0, 4), field('fxaa', 'FXAA', true, 'boolean'), field('showEdges', 'Show edges', false, 'boolean'), field('showCurves', 'Show curves', true, 'boolean'), field('shadows', 'Shadows', true, 'boolean')]
  }
  var materialExtra = Object.keys(materialSchema.defaults).filter(function (key) { return !schemas.material.some(function (spec) { return spec.key === key }) }).map(function (key) {
    var label = key === 'materialType' ? 'Material type' : key.replace(/([A-Z])/g, ' $1').replace(/^./, function (letter) { return letter.toUpperCase() })
    var range = materialSchema.ranges[key]
    return range ? numeric(key, label, materialSchema.defaults[key], range[0], range[1]) : field(key, label, materialSchema.defaults[key], key === 'materialType' ? 'combo' : 'color', Object.keys(materialSchema.types))
  })
  var outputFields = [field('enabled', 'Enabled', true, 'boolean'), field('mode', 'Mode', 'raster', 'combo', ['raster', 'pathtrace']), field('filename', 'Filename', 'render.png', 'string')]
  function normalize (value, spec) {
    if (spec.type === 'number') return number(value, spec.value, spec.min, spec.max, spec.integer)
    if (spec.type === 'vector') return vector(value, spec.value)
    if (spec.type === 'boolean') return typeof value === 'boolean' ? value : spec.value
    if (spec.type === 'combo') return spec.values.indexOf(value) >= 0 ? value : spec.value
    if (spec.type === 'color') return color(value, spec.value)
    if (spec.type === 'url') return url(value)
    return string(value, spec.value)
  }
  function normalizeDescriptor (kind, value) {
    if (!value || value.kind !== 'render.' + kind) return null
    var result = { kind: value.kind }
    schemas[kind].forEach(function (spec) { result[spec.key] = normalize(value[spec.key], spec) })
    if (kind === 'light') {
      if (typeof value.id !== 'string' || !value.id || ['sun', 'point', 'spot', 'area'].indexOf(value.type) < 0) return null
      result.id = value.id; result.type = value.type
    }
    if (kind === 'material') {
      materialExtra.forEach(function (spec) { result[spec.key] = normalize(value[spec.key], spec) })
      result.textures = {}
      roles.forEach(function (role) {
        var texture = normalizeDescriptor('texture', value.textures && value.textures[role])
        if (texture && texture.url) { texture.role = role; result.textures[role] = texture }
      })
      Object.keys(materialSchema.textures).forEach(function (key) {
        var slot = materialSchema.textures[key].slot
        var raw = Object.prototype.hasOwnProperty.call(value, key) ? value[key] : value.textures && value.textures[slot]
        if (raw === undefined || raw === '') return
        var normalized = raw === null ? null : url(typeof raw === 'string' ? raw : raw && raw.url)
        if (normalized === null || normalized) {
          result[key] = normalized
          result.textures[slot] = normalized
          if (typeof value[key + 'Name'] === 'string') result[key + 'Name'] = value[key + 'Name']
        }
      })
    }
    return result
  }
  function firstDescriptor (value, kind) {
    var items = descriptors(value, 'render.' + kind)
    for (var i = 0; i < items.length; i++) {
      var result = normalizeDescriptor(kind, items[i])
      if (result) return result
    }
    return null
  }
  function binding (value) {
    if (!value || value.kind !== 'render.binding') return null
    var material = firstDescriptor(value.material, 'material')
    var ids = targets(value.targets)
    return material && ids.length ? { kind: 'render.binding', targets: ids, material: material } : null
  }

  function fieldInputType (spec) { return spec.type === 'texture' ? 'render.texture,string' : spec.type === 'vector' ? 'point,vector' : spec.type === 'number' ? 'number' : spec.type === 'boolean' ? 'boolean' : 'string' }
  function addFields (node, schema) {
    schema.forEach(function (spec) {
      node.properties[spec.key] = clone(spec.value)
      node.addInput(spec.label, fieldInputType(spec))
      if (spec.type === 'url') return
      if (spec.type === 'vector') {
        ;['X', 'Y', 'Z'].forEach(function (axis, i) {
          var widget = node.addWidget('number', spec.label + ' ' + axis, spec.value[i], function (value) {
            var v = vector(node.properties[spec.key], spec.value)
            v[i] = number(value, v[i], -1e9, 1e9)
            node.setProperty(spec.key, v)
          })
          widget.renderVector = { key: spec.key, index: i }
        })
      } else {
        var type = spec.type === 'boolean' ? 'toggle' : spec.type === 'number' ? (spec.max <= 100 ? 'slider' : 'number') : spec.type === 'combo' ? 'combo' : spec.type === 'color' ? 'color' : 'text'
        node.addWidget(type, spec.label, spec.value, spec.key, { min: spec.min, max: spec.max, step: spec.integer ? 1 : spec.key === 'shadowBias' ? 0.0001 : 0.01, precision: spec.key === 'shadowBias' ? 5 : undefined, values: spec.values })
      }
    })
  }
  function readFields (node, kind) {
    var result = { kind: 'render.' + kind }
    schemas[kind].concat(kind === 'material' ? materialExtra : []).forEach(function (spec) {
      var value = references.value(node, spec.label, node.properties[spec.key])
      value = spec.type === 'vector'
        ? collect(value, function (v) { return (Array.isArray(v) && v.length === 3 && v.every(function (n) { return typeof n === 'number' })) || (v && typeof v === 'object' && ('x' in v || 'X' in v)) })[0]
        : scalar(value)
      result[spec.key] = normalize(value, spec)
    })
    return result
  }
  function syncWidgets (node) {
    node.widgets.forEach(function (widget) {
      if (widget.property) widget.value = node.properties[widget.property]
      if (widget.renderVector) widget.value = vector(node.properties[widget.renderVector.key], [0, 0, 0])[widget.renderVector.index]
    })
  }
  function common (Constructor, schema) {
    Constructor.prototype.onSerialize = function (data) {
      // Properties are authoritative (including programmatic edits). Runtime
      // otherwise restores stale widget values over those properties.
      data.widgets = data.widgets.filter(function (widget) { return !!widget.property }).map(function (widget) { widget.value = clone(data.properties[widget.property]); return widget })
    }
    Constructor.prototype.onConfigure = function (data) {
      if (data && data.properties) Object.assign(this.properties, clone(data.properties))
      // Older graphs omit newly appended schema ports. Keep existing link
      // indices intact and restore those controls when loading their nodes.
      ;(schema || []).forEach(function (spec) {
        if (this.findInputSlot(spec.label) < 0) this.addInput(spec.label, fieldInputType(spec))
      }, this)
      syncWidgets(this)
      if (this._fileWidget) this._fileWidget.value = this.properties.fileName || 'No file selected'
      this.computeSize()
    }
  }
  function registerDescriptor (type, title, kind, lightType) {
    function DescriptorNode () {
      this.properties = {}
      addFields(this, schemas[kind])
      this.addOutput(title, 'render.' + kind)
      if (kind === 'material') roles.forEach(function (role) { this.addInput(role.charAt(0).toUpperCase() + role.slice(1) + ' texture', 'render.texture') }, this)
      // Keep the original seven controls and eight texture slots at their saved indices.
      if (kind === 'material') {
        addFields(this, materialExtra)
        this.addInput('Bump texture', 'render.texture,string')
      }
      if (kind === 'texture' || kind === 'environment') {
        this.properties.fileName = ''
        this.addWidget('button', kind === 'environment' ? 'Choose HDR file' : 'Choose image (embed)', '', this.pickImage.bind(this))
        this._fileWidget = this.addWidget('label', 'File', 'No file selected')
        this._statusWidget = this.addWidget('label', 'Status', 'Ready')
      }
      this.size[0] = 290
      this.computeSize()
    }
    DescriptorNode.title = title
    DescriptorNode.desc = title + ' descriptor. Connect to Render Output to apply.'
    common(DescriptorNode, schemas[kind].concat(kind === 'material' ? roles.map(function (role) { return { label: role.charAt(0).toUpperCase() + role.slice(1) + ' texture', type: 'texture' } }).concat(materialExtra, [{ label: 'Bump texture', type: 'texture' }]) : []))
    DescriptorNode.prototype.onExecute = function () {
      var result = readFields(this, kind)
      if (lightType) { result.id = String(this.id); result.type = lightType }
      if (kind === 'material') {
        result.textures = {}
        roles.forEach(function (role) {
          var texture = firstDescriptor(input(this, role.charAt(0).toUpperCase() + role.slice(1) + ' texture'), 'texture')
          if (texture && texture.url) { texture.role = role; result.textures[role] = texture }
        }, this)
        var bump = input(this, 'Bump texture')
        var bumpTexture = firstDescriptor(bump, 'texture')
        var bumpUrl = url(bumpTexture ? bumpTexture.url : scalar(bump))
        if (bumpUrl) { result.bumpTexture = bumpUrl; result.textures.bumpMap = bumpUrl }
      }
      this.setOutputData(0, result)
      syncWidgets(this)
    }
    if (kind === 'texture' || kind === 'environment') {
      DescriptorNode.prototype.pickImage = function () {
        var node = this
        if (!global.document || !global.FileReader) return
        var token = node._pickerToken = {}
        var picker = global.document.createElement('input')
        picker.type = 'file'; picker.accept = kind === 'environment' ? '.hdr' : 'image/png,image/jpeg,image/webp,image/gif,image/bmp'
        picker.onchange = function () {
          if (node._pickerToken !== token) return
          var file = picker.files && picker.files[0]
          if (!file) return
          if (kind === 'environment' ? !/\.hdr$/i.test(file.name) : !/^image\//i.test(file.type)) { status(node, kind === 'environment' ? 'Choose a Radiance HDR (.hdr) file' : 'Choose an image file'); return }
          if (node._reader) node._reader.abort()
          var reader = node._reader = new global.FileReader()
          reader.onload = function () {
            if (node._reader !== reader) return
            node._reader = null
            node.setProperty('url', url(kind === 'environment' ? String(reader.result).replace(/^data:[^;,]*/, 'data:application/octet-stream') : reader.result))
            node.setProperty('fileName', file.name || 'Selected file')
            node._fileWidget.value = node.properties.fileName
            if (kind === 'environment') node.setProperty('preset', 'hdri')
            status(node, 'File embedded')
          }
          reader.onerror = function () { if (node._reader === reader) { node._reader = null; status(node, 'Could not read image') } }
          reader.readAsDataURL(file)
        }
        picker.click()
      }
      DescriptorNode.prototype.onRemoved = function () {
        this._pickerToken = null
        if (this._reader) { var reader = this._reader; this._reader = null; reader.abort() }
      }
    }
    PandaUI.registerNode('render/' + type, DescriptorNode)
  }
  registerDescriptor('environment', 'Environment', 'environment')
  registerDescriptor('pbr_material', 'PBR Material', 'material')
  registerDescriptor('texture', 'Texture', 'texture')
  ;['sun', 'point', 'spot', 'area'].forEach(function (type) { registerDescriptor(type + '_light', type.charAt(0).toUpperCase() + type.slice(1) + ' Light', 'light', type) })
  registerDescriptor('camera', 'Render Camera', 'camera')
  registerDescriptor('quality', 'Render Quality', 'quality')
  registerDescriptor('effects', 'Render Effects', 'effects')

  function status (node, text) { node._statusWidget.value = text; node.setDirtyCanvas(true, true) }
  function Assignment () {
    this.properties = { targets: [] }
    this.addInput('Material', 'render.material')
    this.addInput('Targets', 'string,geometry,scene.object')
    this.addOutput('Binding', 'render.binding')
    this._statusWidget = this.addWidget('label', 'Status', 'Connect a Parameter Geometry node')
    this.size[0] = 290
    this.computeSize()
  }
  Assignment.title = 'Material Assignment'
  Assignment.desc = 'Assign a material to objects from a Parameter Geometry node or stable object IDs.'
  common(Assignment)
  var configureAssignment = Assignment.prototype.onConfigure
  Assignment.prototype.onConfigure = function (data) {
    configureAssignment.call(this, data)
    this.inputs[1].type = 'string,geometry,scene.object'
  }
  Assignment.prototype.onExecute = function () {
    var ids = this.isInputConnected(1) || this.inputs[1].data != null ? input(this, 'Targets') : this.properties.targets
    var result = binding({ kind: 'render.binding', targets: ids, material: input(this, 'Material') })
    this.setOutputData(0, result)
    status(this, result ? result.targets.length + ' object(s)' : 'Connect geometry and a material')
  }
  PandaUI.registerNode('render/material_assignment', Assignment)

  function Output () {
    this.properties = { enabled: true, mode: 'raster', width: 1920, height: 1080, filename: 'render.png', samples: 128 }
    ;[['Environment', 'environment'], ['Lights', 'light'], ['Bindings', 'binding'], ['Camera', 'camera'], ['Quality', 'quality'], ['Effects', 'effects']].forEach(function (port) { this.addInput(port[0], 'render.' + port[1]) }, this)
    ;['Export width', 'Export height', 'Export samples'].forEach(function (label) { this.addInput(label, 'number') }, this)
    outputFields.forEach(function (spec) { this.addInput(spec.label, fieldInputType(spec)) }, this)
    this.addOutput('Config', 'render.config')
    this.addWidget('toggle', 'Enabled', true, 'enabled')
    this.addWidget('combo', 'Mode', 'raster', 'mode', { values: ['raster', 'pathtrace'] })
    this.addWidget('number', 'Export width', 1920, 'width')
    this.addWidget('number', 'Export height', 1080, 'height')
    this.addWidget('text', 'Filename', 'render.png', 'filename')
    this.addWidget('number', 'Export samples', 128, 'samples')
    this.addWidget('button', 'Export Image', '', this.exportImage.bind(this))
    this._statusWidget = this.addWidget('label', 'Status', 'Ready')
    this.size[0] = 320
    this.computeSize()
    this._lastKey = null
  }
  Output.title = 'Render Output'
  Output.desc = 'Publish one atomic render configuration. Drag from an input to additional outputs to append lights/bindings, or connect lists/trees. Export dimensions are pixels; export inputs override widgets.'
  common(Output, [numeric('width', 'Export width', 1920, 1, 16384, true), numeric('height', 'Export height', 1080, 1, 16384, true), numeric('samples', 'Export samples', 128, 1, 65536, true)].concat(outputFields))
  var configureOutput = Output.prototype.onConfigure
  Output.prototype.onConfigure = function (data) {
    configureOutput.call(this, data)
    // Property patches/undo also call onConfigure on live nodes. Preserve their
    // publication key so export-only edits cannot republish the render config.
    if (!this.graph) { this._lastKey = null; this.renderStatus = null; status(this, 'Ready') }
  }
  Output.prototype.onExecute = function () {
    var result = {
      kind: 'render.config',
      enabled: normalize(scalar(references.value(this, 'Enabled', this.properties.enabled)), outputFields[0]),
      mode: normalize(scalar(references.value(this, 'Mode', this.properties.mode)), outputFields[1]),
      environment: firstDescriptor(input(this, 'Environment'), 'environment'),
      lights: descriptors(input(this, 'Lights'), 'render.light').map(function (light) { return normalizeDescriptor('light', light) }).filter(Boolean),
      bindings: descriptors(input(this, 'Bindings'), 'render.binding').map(binding).filter(Boolean),
      camera: firstDescriptor(input(this, 'Camera'), 'camera'),
      quality: firstDescriptor(input(this, 'Quality'), 'quality') || normalizeDescriptor('quality', { kind: 'render.quality' }),
      effects: firstDescriptor(input(this, 'Effects'), 'effects') || normalizeDescriptor('effects', { kind: 'render.effects' })
    }
    // Repeated tree branches may contain the same light; its stable ID identifies
    // one engine light. The last connected descriptor for that ID wins.
    var lights = new Map()
    result.lights.forEach(function (light) { lights.set(light.id, light) })
    result.lights = Array.from(lights.values())
    this.setOutputData(0, result)
    var key = JSON.stringify(result)
    if (this.graph && !this.graph._restoring && key !== this._lastKey) {
      send({ type: 'pandaui-render-config', nodeId: String(this.id), descriptor: result })
      this._lastKey = key
      outputs.add(this)
    }
  }
  Output.prototype.exportImage = function () {
    if (!this.graph) return
    // Finish pending upstream edits before asking the parent to capture.
    var node = this
    var graph = this.graph
    var ready = typeof graph.solveAll === 'function' ? graph.solveAll() : Promise.resolve()
    return Promise.resolve(ready).then(function () {
      if (node.graph !== graph) return
      node.onExecute()
      var id = requestId(node)
      var exportValue = function (label, key, fallback, max) {
        return number(scalar(references.value(node, label, node.properties[key])), fallback, 1, max, true)
      }
      status(node, 'Export requested')
      send({ type: 'pandaui-render-export',
        nodeId: String(node.id),
        requestId: id,
        width: exportValue('Export width', 'width', 1920, 16384),
        height: exportValue('Export height', 'height', 1080, 16384),
        // eslint-disable-next-line no-control-regex
        filename: string(scalar(references.value(node, 'Filename', node.properties.filename)), 'render.png').trim().replace(/[\\/\u0000-\u001f]/g, '_') || 'render.png',
        samples: exportValue('Export samples', 'samples', 128, 65536) })
      return id
    }).catch(function (error) { status(node, 'Export failed: ' + error.message) })
  }
  Output.prototype.onAdded = function () { this._lastKey = null; outputs.add(this) }
  Output.prototype.onRemoved = function () {
    outputs.delete(this)
    send({ type: 'pandaui-render-config', nodeId: String(this.id), descriptor: null })
    this._lastKey = null
  }
  PandaUI.registerNode('render/output', Output)

  global.addEventListener('message', function (event) {
    if (event.source !== global.parent || event.origin !== global.location.origin) return
    var data = event.data
    if (!data || typeof data.nodeId !== 'string') return
    if (data.type === 'pandaui-render-status') {
      outputs.forEach(function (node) {
        if (String(node.id) !== data.nodeId) return
        node.renderStatus = { state: string(data.state, ''), error: string(data.error, ''), message: string(data.message, ''), samples: number(data.samples, 0, 0, 65536, true), backend: string(data.backend, '') }
        var s = node.renderStatus
        status(node, [s.state, s.error || s.message, s.backend, data.samples == null ? '' : s.samples + ' samples'].filter(Boolean).join(' | '))
      })
    }
  })
  function cleanup () {
    outputs.forEach(function (node) {
      if (node._lastKey !== null) send({ type: 'pandaui-render-config', nodeId: String(node.id), descriptor: null })
      node._lastKey = null
    })
  }
  global.addEventListener('pagehide', cleanup)
  global.addEventListener('beforeunload', cleanup)
  global.addEventListener('pageshow', function (event) {
    if (event.persisted) outputs.forEach(function (node) { if (node.graph) node.graph.invalidateNode(node, { source: true, propagate: true, reason: 'render-page-restore' }) })
  })
})(PandaUI, window)
