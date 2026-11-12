(function (PandaUI, window) {
  function isMarker (value) {
    return value != null && value.__pandauiSceneObject === true && typeof value.id === 'string'
  }

  function geometryReference (marker) {
    if (!isMarker(marker)) return null
    var reference = marker.geometryRef
    return reference != null && reference.kind === 'geometryRef' && typeof reference.geometryId === 'string' ? reference : null
  }

  var geometryOutputTypes = 'geometry,brep,mesh,curve,surface,subd,point,line,arc,circle'

  function send (message) {
    if (window.parent === window) return
    window.parent.postMessage(message, window.location.origin)
  }

  function vector3 (value, fallback) {
    if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return fallback.slice()
    var result = [Number(value[0]), Number(value[1]), Number(value[2])]
    return result.every(Number.isFinite) ? result : fallback.slice()
  }

  function displayBufferMarker (value) {
    var display = value && value._isDualData === true ? value.display : null
    var buffer = display && display.buffer
    if (!buffer || buffer.version !== 1 || !Array.isArray(buffer.items)) return null
    var ids = buffer.items.map(function (item) { return item && item.id != null ? String(item.id) : '' }).filter(Boolean)
    if (ids.length === 0) return null
    return {
      __pandauiDisplayBufferMarker: true,
      ids: ids,
      nodeId: display.nodeId,
      nodeType: display.nodeType,
      portIndex: display.portIndex,
      portName: display.portName,
      itemCount: ids.length
    }
  }

  function firstTreeValue (value) {
    if (value && value._isDualData === true) {
      if (value.display && value.display.treeData) value = value.display.treeData
      else value = value.raw
    }
    if (value && Array.isArray(value.datas)) return value.datas.length ? value.datas[0] : null
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Array.isArray(value[1])) return value[1].length ? value[1][0] : null
    return value
  }

  function threeTransform (value) {
    value = firstTreeValue(value)
    var data = value && typeof value === 'object' && Array.isArray(value.data) ? value.data : value
    if (!Array.isArray(data) && !ArrayBuffer.isView(data)) return null
    var elements = Array.prototype.slice.call(data, 0, 16).map(Number)
    if (elements.length !== 16 || !elements.every(Number.isFinite)) return null
    return {
      __pandauiThreeTransform: true,
      sourceType: value && value.__geo ? String(value.__geo).replace(/^rhino\./, 'panda.') : 'matrix',
      elements: elements
    }
  }

  function PickSceneObject () {
    this.addOutput('object', 'scene_object')
    this.addOutput('geometry', geometryOutputTypes)
    this.properties = { marker: null }
    this.size = [190, 66]
    this.addWidget('button', 'Pick in Viewport', null, this.requestPick.bind(this))
  }

  PickSceneObject.title = 'Pick Scene Object'
  PickSceneObject.desc = 'Picks a Three.js mesh, line, or point and outputs only a lightweight scene-object marker.'

  PickSceneObject.prototype.requestPick = function () {
    send({ type: 'pandaui-pick-object', nodeId: this.id })
  }

  PickSceneObject.prototype.onSelected = function () {
    if (!isMarker(this.properties.marker)) this.requestPick()
  }

  PickSceneObject.prototype.onExecute = function () {
    this.setOutputData(0, this.properties.marker)
    this.setOutputData(1, geometryReference(this.properties.marker))
  }

  PickSceneObject.prototype.setMarker = function (marker) {
    if (!isMarker(marker)) return
    this.properties.marker = marker
    this.title = 'Pick: ' + (marker.name || marker.objectType || marker.id)
    this.setDirtyCanvas(true, true)
  }

  PandaUI.registerNode('transform/pick_scene_object', PickSceneObject)

  function registerTransformNode (type, title, operation, markerProperty, defaults) {
    function SceneObjectTransform () {
      this.addInput('object', 'scene_object')
      this.addInput(operation, 'vec3')
      this.addOutput('object', 'scene_object')
      this.addOutput('geometry', geometryOutputTypes)
      this.properties = { x: defaults[0], y: defaults[1], z: defaults[2] }
      this._marker = null
      this._markerId = ''
      this._lastTransformKey = ''
      this._error = ''
      this.size = [200, 126]
      this.addWidget('number', 'X', defaults[0], 'x')
      this.addWidget('number', 'Y', defaults[1], 'y')
      this.addWidget('number', 'Z', defaults[2], 'z')
      this.properties.mode = 'model'
      this.addWidget('combo', 'Mode', 'model', 'mode', { values: ['model', 'view'] })
    }

    SceneObjectTransform.title = title
    SceneObjectTransform.desc = 'Transforms the Three.js scene object referenced by a lightweight marker; no geometry data is copied into the graph.'

    SceneObjectTransform.prototype.onExecute = function () {
      var inputMarker = this.getInputData(0)
      if (!isMarker(inputMarker)) {
        this.setOutputData(0, null)
        this.setOutputData(1, null)
        return
      }

      if (inputMarker.id !== this._markerId) {
        this._marker = inputMarker
        this._markerId = inputMarker.id
        var initial = vector3(inputMarker[markerProperty], defaults)
        this.properties.x = initial[0]
        this.properties.y = initial[1]
        this.properties.z = initial[2]
        if (this.widgets) {
          this.widgets[0].value = initial[0]
          this.widgets[1].value = initial[1]
          this.widgets[2].value = initial[2]
        }
        this._lastTransformKey = this.transformKey(initial)
      }

      var linkedVector = this.inputs[1].link != null ? this.getInputData(1) : null
      var values = vector3(linkedVector, [this.properties.x, this.properties.y, this.properties.z])
      var key = this.transformKey(values)
      if (key !== this._lastTransformKey) {
        this._lastTransformKey = key
        send({
          type: 'pandaui-transform-object',
          nodeId: this.id,
          marker: inputMarker,
          operation: operation,
          values: values,
          relative: false,
          mode: this.properties.mode || 'model'
        })
      }
      this.setOutputData(0, this._marker || inputMarker)
      this.setOutputData(1, geometryReference(this._marker || inputMarker))
    }

    SceneObjectTransform.prototype.transformKey = function (values) {
      return this._markerId + ':' + values.join(',')
    }

    SceneObjectTransform.prototype.setTransformResult = function (marker, error) {
      this._error = String(error || '')
      if (isMarker(marker)) this._marker = marker
      this.boxcolor = this._error ? '#b33' : '#6a6'
      this.setDirtyCanvas(true, true)
    }

    SceneObjectTransform.prototype.onDrawForeground = function (context) {
      if (this.flags.collapsed || !this._error) return
      context.fillStyle = '#ff8a80'
      context.font = '11px Arial'
      context.fillText(this._error, 8, this.size[1] - 8)
    }

    PandaUI.registerNode(type, SceneObjectTransform)
  }

  registerTransformNode('transform/move_scene_object', 'Move Scene Object', 'move', 'position', [0, 0, 0])
  registerTransformNode('transform/rotate_scene_object', 'Rotate Scene Object', 'rotate', 'rotation', [0, 0, 0])
  registerTransformNode('transform/scale_scene_object', 'Scale Scene Object', 'scale', 'scale', [1, 1, 1])

  function DisplayBufferTransform () {
    this.addInput('geometry', geometryOutputTypes)
    this.addInput('translation', 'vec3')
    this.addInput('rotation', 'vec3')
    this.addInput('scale', 'vec3')
    this.addInput('transform', 'transform,matrix')
    this.addOutput('geometry', geometryOutputTypes)
    this.addOutput('marker', 'display_buffer_marker')
    this.addOutput('three transform', 'three_transform')
    this.addOutput('success', 'boolean')
    this.properties = {
      translationX: 0,
      translationY: 0,
      translationZ: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      scaleX: 1,
      scaleY: 1,

      scaleZ: 1,
      relative: false
    }
    this._displayBuffer = null
    this._marker = null
    this._lastTransformKey = ''
    this._success = false
    this._error = ''
    this.size = [230, 306]
    this.addWidget('number', 'Move X', 0, 'translationX')
    this.addWidget('number', 'Move Y', 0, 'translationY')
    this.addWidget('number', 'Move Z', 0, 'translationZ')
    this.addWidget('number', 'Rotate X', 0, 'rotationX')
    this.addWidget('number', 'Rotate Y', 0, 'rotationY')
    this.addWidget('number', 'Rotate Z', 0, 'rotationZ')
    this.addWidget('number', 'Scale X', 1, 'scaleX')
    this.addWidget('number', 'Scale Y', 1, 'scaleY')
    this.addWidget('number', 'Scale Z', 1, 'scaleZ')
    this.addWidget('toggle', 'Relative', false, 'relative')
  }

  DisplayBufferTransform.title = 'Display Buffer Transform'
  DisplayBufferTransform.desc = 'Reads display.buffer item markers and transforms only their Three.js display objects. Business geometry and display buffers remain unchanged.'

  DisplayBufferTransform.prototype.onExecute = function () {
    var geometry = this.getInputData(0)
    var marker = displayBufferMarker(geometry)
    var transform = this.inputs[4].link != null ? threeTransform(this.getInputData(4)) : null
    this.setOutputData(0, geometry)
    this.setOutputData(1, marker)
    this.setOutputData(2, transform)

    if (marker == null) {
      this._displayBuffer = null
      this._marker = null
      this._lastTransformKey = ''
      this._success = false
      this._error = geometry == null ? '' : 'Input has no display.buffer marker.'
      this.boxcolor = this._error ? '#b33' : null
      this.setOutputData(3, false)
      return
    }

    var buffer = geometry.display.buffer
    if (buffer !== this._displayBuffer) {
      this._displayBuffer = buffer
      this._lastTransformKey = ''
    }
    this._marker = marker

    var relative = this.properties.relative === true
    var translation = vector3(this.inputs[1].link != null ? this.getInputData(1) : null, [this.properties.translationX, this.properties.translationY, this.properties.translationZ])
    var rotation = vector3(this.inputs[2].link != null ? this.getInputData(2) : null, [this.properties.rotationX, this.properties.rotationY, this.properties.rotationZ])
    var scale = vector3(this.inputs[3].link != null ? this.getInputData(3) : null, [this.properties.scaleX, this.properties.scaleY, this.properties.scaleZ])
    var transformKey = transform ? transform.elements.join(',') : translation.join(',') + ':' + rotation.join(',') + ':' + scale.join(',')
    var key = marker.ids.join('|') + ':' + transformKey + ':' + relative
    if (key !== this._lastTransformKey) {
      this._lastTransformKey = key
      this._success = false
      if (this.inputs[4].link != null && transform == null) {
        this._error = 'Transform input does not contain a valid 4x4 matrix.'
        this.boxcolor = '#b33'
      } else if (transform != null) {
        send({
          type: 'pandaui-transform-display-buffer-matrix',
          nodeId: this.id,
          marker: marker,
          transform: transform,
          relative: relative
        })
      } else {
        send({
          type: 'pandaui-transform-display-buffer',
          nodeId: this.id,
          marker: marker,
          translation: translation,
          rotation: rotation,
          scale: scale,
          relative: relative
        })
      }
    }
    this.setOutputData(3, this._success)
  }

  DisplayBufferTransform.prototype.setTransformResult = function (marker, transformedCount, error) {
    this._marker = marker || this._marker
    this._error = String(error || '')
    this._success = !this._error && Number(transformedCount) > 0
    this.boxcolor = this._error ? '#b33' : (this._success ? '#6a6' : '#d99b24')
    this.setDirtyCanvas(true, true)
  }

  DisplayBufferTransform.prototype.onDrawForeground = function (context) {
    if (this.flags.collapsed || !this._error) return
    context.fillStyle = '#ff8a80'
    context.font = '11px Arial'
    context.fillText(this._error, 8, this.size[1] - 8)
  }

  PandaUI.registerNode('transform/display_buffer_transform', DisplayBufferTransform)

  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || !event.data || !window.graph) return
    var message = event.data
    var node = window.graph.getNodeById(message.nodeId)
    if (node == null) return
    if (message.type === 'pandaui-object-picked' && node.type === 'transform/pick_scene_object') {
      node.setMarker(message.marker)
    } else if (message.type === 'pandaui-display-buffer-transformed' && node.type === 'transform/display_buffer_transform') {
      node.setTransformResult(message.marker, message.transformedCount, message.error)
    } else if (message.type === 'pandaui-object-transformed' && node.type.indexOf('transform/') === 0) {
      node.setTransformResult(message.marker, message.error)
    }
  })

  window.PandaUINodePlugin = {
    id: 'pandaui-transform',
    name: 'Scene Transform',
    version: '1.2.0',
    icon: 'open_with',
    description: 'Native nodes that transform backend geometry and expose both a scene marker and a standard GeometryRef output.',
    types: [
      'transform/pick_scene_object',
      'transform/move_scene_object',
      'transform/rotate_scene_object',
      'transform/scale_scene_object',
      'transform/display_buffer_transform'
    ]
  }
})(PandaUI, window)
