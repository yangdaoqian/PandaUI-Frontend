(function (PandaUI, global) {
  'use strict'

  var definitionNames = [
    'PIX_A0', 'PIX_A1', 'PIX_A2', 'PIX_A3', 'PIX_A4',
    'PIX_A5', 'PIX_A6', 'PIX_A1G', 'PIX_A2G', 'PIX_A12G'
  ]
  var defaultRobotName = 'KR_120_210_R2700-2'
  var transformCount = definitionNames.length + 1

  function send (message) {
    if (global.parent !== global) global.parent.postMessage(message, global.location.origin)
  }

  function unwrap (value) {
    if (value == null) return value
    if (value._isDualData === true) {
      if (value.display && value.display.treeData != null) return unwrap(value.display.treeData)
      return unwrap(value.raw)
    }
    if (Array.isArray(value.datas)) return value.datas
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string' && Array.isArray(value[1])) return value[1]
    return value
  }

  function matrixElements (value) {
    value = unwrap(value)
    var isRhinoTransform = value && typeof value === 'object' &&
      /^(?:panda|rhino)\.(?:transform|matrix)$/.test(value.__geo)
    if (isRhinoTransform && (Array.isArray(value.data) || ArrayBuffer.isView(value.data))) {
      var rowMajor = Array.prototype.slice.call(value.data, 0, 16).map(Number)
      if (rowMajor.length !== 16 || !rowMajor.every(Number.isFinite)) return null
      return [
        rowMajor[0], rowMajor[4], rowMajor[8], rowMajor[12],
        rowMajor[1], rowMajor[5], rowMajor[9], rowMajor[13],
        rowMajor[2], rowMajor[6], rowMajor[10], rowMajor[14],
        rowMajor[3], rowMajor[7], rowMajor[11], rowMajor[15]
      ]
    }
    if (value && typeof value === 'object' && Array.isArray(value.elements)) value = value.elements
    if (value && typeof value === 'object' && Array.isArray(value.matrix)) value = value.matrix
    if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return null
    var elements = Array.prototype.slice.call(value, 0, 16).map(Number)
    return elements.length === 16 && elements.every(Number.isFinite) ? elements : null
  }

  function identity () {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  }

  function collectTransforms (value, output) {
    value = unwrap(value)
    if (value == null || output.length >= transformCount) return output
    if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length > 16 && value.length % 16 === 0 && Array.prototype.every.call(value, function (item) { return Number.isFinite(Number(item)) })) {
      for (var offset = 0; offset < value.length && output.length < transformCount; offset += 16) {
        var packedElements = matrixElements(value.slice(offset, offset + 16))
        if (packedElements != null) output.push(packedElements)
      }
      return output
    }
    var directElements = matrixElements(value)
    if (directElements != null) {
      output.push(directElements)
      return output
    }
    if (Array.isArray(value)) {
      value.forEach(function (item) { collectTransforms(item, output) })
      return output
    }
    if (value && typeof value === 'object') {
      Object.keys(value).filter(function (key) { return /^path\d+$/.test(key) }).sort(function (left, right) {
        return Number(left.slice(4)) - Number(right.slice(4))
      }).forEach(function (key) {
        var branch = value[key]
        if (Array.isArray(branch) && branch.length > 1) collectTransforms(branch[1], output)
      })
    }
    return output
  }

  function transformList (value) {
    var transforms = collectTransforms(value, []).slice(0, transformCount)
    while (transforms.length < definitionNames.length) transforms.push(identity())
    return transforms
  }

  function colorValue (value) {
    value = unwrap(value)
    if (value == null || value === '') return null
    if (value && typeof value === 'object' && value.data != null) return colorValue(value.data)
    if (typeof value === 'string') {
      var text = value.trim()
      var channels = text.match(/R\s*=\s*(\d+).*G\s*=\s*(\d+).*B\s*=\s*(\d+)/i)
      if (channels) return [Number(channels[1]) / 255, Number(channels[2]) / 255, Number(channels[3]) / 255]
      var numericChannels = text.match(/-?\d+(?:\.\d+)?/g)
      if (numericChannels && numericChannels.length === 3) {
        return colorValue(numericChannels.map(Number))
      }
      return text || null
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      var packed = Math.max(0, Math.min(0xffffff, Math.round(value)))
      return [(packed >> 16 & 255) / 255, (packed >> 8 & 255) / 255, (packed & 255) / 255]
    }
    var components = null
    if ((Array.isArray(value) || ArrayBuffer.isView(value)) && value.length >= 3 && Array.prototype.slice.call(value, 0, 3).every(function (item) { return Number.isFinite(Number(item)) })) {
      components = Array.prototype.slice.call(value, 0, 3).map(Number)
    } else if (value && typeof value === 'object') {
      var red = value.r != null ? value.r : (value.R != null ? value.R : value.red)
      var green = value.g != null ? value.g : (value.G != null ? value.G : value.green)
      var blue = value.b != null ? value.b : (value.B != null ? value.B : value.blue)
      if ([red, green, blue].every(function (item) { return Number.isFinite(Number(item)) })) components = [Number(red), Number(green), Number(blue)]
    }
    if (components == null) return null
    var scale = components.some(function (item) { return Math.abs(item) > 1 }) ? 255 : 1
    return components.map(function (item) { return Math.max(0, Math.min(1, item / scale)) })
  }

  function kukaOverrideColor (value) {
    if (!Array.isArray(value) || value.length < 3) return null
    var red = Math.round(Number(value[0]) * 255)
    var green = Math.round(Number(value[1]) * 255)
    var blue = Math.round(Number(value[2]) * 255)
    return Math.abs(red - 255) <= 2 && Math.abs(green - 57) <= 2 && Math.abs(blue) <= 2
      ? [1, 57 / 255, 0]
      : null
  }

  function collectColors (value, output) {
    value = unwrap(value)
    if (value == null || output.length >= definitionNames.length) return output
    var direct = colorValue(value)
    if (direct != null) {
      output.push(kukaOverrideColor(direct))
      return output
    }
    if (Array.isArray(value)) {
      value.forEach(function (item) {
        var itemColor = colorValue(item)
        if (item == null || itemColor != null) output.push(kukaOverrideColor(itemColor))
        else collectColors(item, output)
      })
      return output
    }
    if (value && typeof value === 'object') {
      Object.keys(value).filter(function (key) { return /^path\d+$/.test(key) }).sort(function (left, right) {
        return Number(left.slice(4)) - Number(right.slice(4))
      }).forEach(function (key) {
        var branch = value[key]
        if (Array.isArray(branch) && branch.length > 1) collectColors(branch[1], output)
      })
    }
    return output
  }

  function colorList (value) {
    var colors = collectColors(value, []).slice(0, definitionNames.length)
    while (colors.length < definitionNames.length) colors.push(null)
    return colors
  }

  function robotNameValue (value) {
    value = unwrap(value)
    if (value && typeof value === 'object' && value.data != null) return robotNameValue(value.data)
    if (value && typeof value === 'object') {
      var pathKey = Object.keys(value).filter(function (key) { return /^path\d+$/.test(key) }).sort()[0]
      if (pathKey != null) {
        var branch = value[pathKey]
        return robotNameValue(Array.isArray(branch) && branch.length > 1 ? branch[1] : branch)
      }
    }
    if (Array.isArray(value)) return value.length > 0 ? robotNameValue(value[0]) : defaultRobotName
    var name = String(value == null ? '' : value).trim().replace(/\.3dm$/i, '')
    name = name.replace(/[\\/]/g, '').replace(/[^a-zA-Z0-9_. -]/g, '')
    return name || defaultRobotName
  }

  function robotAssetUrl (robotName) {
    return '/editor/plugins/data/' + encodeURIComponent(robotNameValue(robotName) + '.3dm')
  }

  function transformKey (transforms) {
    return transforms.map(function (elements) { return elements.join(',') }).join('|')
  }

  function toolList (value, output) {
    output = output || []
    value = unwrap(value)
    if (!value) return output
    if (value.__pandauiSceneObject === true || value.kind === 'geometryRef') output.push(value)
    else if (Array.isArray(value)) value.forEach(function (item) { toolList(item, output) })
    else if (typeof value === 'object') Object.keys(value).filter(function (key) { return /^path\d+$/.test(key) }).forEach(function (key) { toolList(value[key], output) })
    return output
  }

  function transformSummary (transforms) {
    var changed = transforms.map(function (elements, index) {
      var x = Number(elements[12]) || 0
      var y = Number(elements[13]) || 0
      var z = Number(elements[14]) || 0
      return Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-9
        ? (definitionNames[index] || 'Tool') + ' (' + x.toFixed(2) + ', ' + y.toFixed(2) + ', ' + z.toFixed(2) + ')'
        : null
    }).filter(Boolean)
    return changed.length > 0 ? changed[0] + (changed.length > 1 ? ' +' + (changed.length - 1) : '') : 'Identity'
  }

  function KukaRobot () {
    this.size = [270, 150]
    this.properties = { toolObjects: [] }
    this._lastKey = ''
    this._status = 'Waiting for transforms'
    this._loaded = false
    this._revision = 0
    this.addOutput('status', 'string')
    this.addInput('Transforms', 'list,transform,matrix,array')
    this.addInput('Colors', 'list,colour,color,string,array')
    this.addInput('Robot Name', 'string')
    this.addInput('Tool', 'scene_object,geometry,brep,surface,mesh,curve,subd,list')
  }

  KukaRobot.title = 'Kuka 2700'
  KukaRobot.desc = 'Displays ten robot parts and picked Tool objects. Transform 11 controls the Tool preview.'

  KukaRobot.prototype.sendPreview = function (transforms, colors, robotName, tools) {
    var values = transforms || definitionNames.map(function () { return identity() })
    var resolvedName = robotNameValue(robotName)
    send({
      type: 'pandaui-kuka-robot',
      nodeId: String(this.id),
      revision: ++this._revision,
      robotName: resolvedName,
      assetUrl: robotAssetUrl(resolvedName),
      definitionNames: definitionNames.slice(),
      transforms: values,
      colors: colors || definitionNames.map(function () { return null }),
      tools: tools || toolList(this.properties.toolObjects),
      transformSummary: transformSummary(values)
    })
  }

  KukaRobot.prototype.onAdded = function () {
    this._lastKey = ''
    this.sendPreview()
  }

  KukaRobot.prototype.onConfigure = function () {
    while (this.inputs.length > 4) this.removeInput(this.inputs.length - 1)
    if (this.inputs.length === 0) this.addInput('Transforms', 'list,transform,matrix,array')
    if (this.inputs.length < 2) this.addInput('Colors', 'list,colour,color,string,array')
    if (this.inputs.length < 3) this.addInput('Robot Name', 'string')
    if (this.inputs.length < 4) this.addInput('Tool', 'scene_object,geometry,brep,surface,mesh,curve,subd,list')
    this.inputs[0].name = 'Transforms'
    this.inputs[0].label = 'Transforms'
    this.inputs[0].type = 'list,transform,matrix,array'
    this.inputs[1].name = 'Colors'
    this.inputs[1].label = 'Colors'
    this.inputs[1].type = 'list,colour,color,string,array'
    this.inputs[2].name = 'Robot Name'
    this.inputs[2].label = 'Robot Name'
    this.inputs[2].type = 'string'
    this.inputs[3].name = this.inputs[3].label = 'Tool'
    this.inputs[3].type = 'scene_object,geometry,brep,surface,mesh,curve,subd,list'
    this.properties.toolObjects = toolList(this.properties.toolObjects)
    this.size = [Math.max(270, this.size[0]), Math.max(150, this.size[1])]
    this._lastKey = ''
  }

  KukaRobot.prototype.onExecute = function () {
    var transforms = transformList(this.getInputData(0))
    var colors = colorList(this.getInputData(1))
    var robotName = robotNameValue(this.getInputData(2))
    var toolInput = this.getInputData(3)
    var tools = toolList(this.isInputConnected(3) || toolInput != null ? toolInput : this.properties.toolObjects)
    var key = robotName + '|' + transformKey(transforms) + '|' + JSON.stringify(colors) + '|' + JSON.stringify(tools)
    if (key !== this._lastKey) {
      this._lastKey = key
      this.sendPreview(transforms, colors, robotName, tools)
    }
    this.setOutputData(0, this._status)
  }

  KukaRobot.prototype.setStatus = function (status, loaded) {
    this._status = String(status || '')
    if (loaded === false) this._lastKey = ''
    if (loaded != null) this._loaded = loaded === true
    this.boxcolor = this._status.indexOf('failed') >= 0 ? '#b33' : (this._loaded ? '#6a6' : null)
    this.setDirtyCanvas(true, true)
  }

  KukaRobot.prototype.onDrawForeground = function (context) {
    if (this.flags.collapsed || !this._status) return
    context.save()
    context.beginPath()
    context.rect(8, 0, Math.max(0, this.size[0] - 16), this.size[1])
    context.clip()
    context.fillStyle = this._status.indexOf('failed') >= 0 ? '#ff8a80' : '#b8c7d9'
    context.font = '11px Arial'
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    context.fillText(this._status, 8, this.size[1] - 10)
    context.restore()
  }

  KukaRobot.prototype.onRemoved = function () {
    if (this._toolPickToken) send({ type: 'pandaui-parameter-pick-cancel', token: this._toolPickToken })
    send({ type: 'pandaui-kuka-robot-clear', nodeId: String(this.id) })
  }

  KukaRobot.prototype.getExtraMenuOptions = function () {
    var node = this
    return [
      { content: 'Pick Tool from Scene', callback: function () {
        node._toolPickToken = String(node.id) + ':kuka-tool:' + Date.now() + ':' + Math.random()
        send({ type: 'pandaui-parameter-pick', nodeId: String(node.id), token: node._toolPickToken, pickType: 'scene-object', mode: 'pick' })
      } },
      { content: 'Clear Tool', callback: function () { node.setProperty('toolObjects', []) } }
    ]
  }

  PandaUI.registerNode('robot/kuka2700', KukaRobot)

  global.addEventListener('message', function (event) {
    if (event.origin !== global.location.origin || event.source !== global.parent || !event.data || !global.graph) return
    var message = event.data
    var node = global.graph.getNodeById(message.nodeId)
    if (!node || node.type !== 'robot/kuka2700') return
    if (message.type === 'pandaui-parameter-picked' && message.token === node._toolPickToken) {
      node._toolPickToken = null
      if (!message.cancelled && Array.isArray(message.values) && message.values.length) node.setProperty('toolObjects', toolList(message.values))
    } else if (message.type === 'pandaui-kuka-robot-status' && (!message.revision || message.revision === node._revision)) node.setStatus(message.status, message.loaded)
  })

  global.PandaUINodePlugin = {
    id: 'pandaui-kuka-robot',
    name: 'Kuka Robot',
    version: '1.0.0',
    icon: 'precision_manufacturing',
    description: 'Ten robot transforms plus an optional eleventh transform for picked Tool objects.',
    types: ['robot/kuka2700']
  }
})(PandaUI, window)
