(function (global) {
  'use strict'
  var PandaUI = global.PandaUI

  function scalar (value) {
    var DataTree = global.PandaUIKernel && global.PandaUIKernel.DataTree
    if (DataTree && value != null) value = DataTree.from(value).first()
    return value && value.kind === 'structRef' ? value.data : value
  }

  function textValue (value) {
    if (value == null) return ''
    if (typeof value === 'string') return value
    if (typeof value !== 'object') return String(value)
    try { return JSON.stringify(value, null, 2) } catch (error) { return String(value) }
  }

  function normalizeRange (node) {
    var properties = node.properties
    properties.min = Number.isFinite(Number(properties.min)) ? Number(properties.min) : 0
    properties.max = Number.isFinite(Number(properties.max)) ? Math.max(properties.min, Number(properties.max)) : properties.min + 1
    properties.step = Number.isFinite(Number(properties.step)) && Number(properties.step) > 0 ? Number(properties.step) : 0.01
    var value = Number(properties.value)
    properties.value = Math.max(properties.min, Math.min(properties.max, Number.isFinite(value) ? value : properties.min))
    properties.value = Number(properties.value.toFixed(10))
  }

  function layout (constructor, kind, height, width) {
    var prototype = constructor.prototype
    prototype.widgetUI = kind
    prototype.widgetContentHeight = height
    prototype.widgetContentTop = function () { return 12 + Math.max(this.inputs.length, this.outputs.length) * 22 + (this.inputs.length || this.outputs.length ? 22 : 0) }
    prototype.getMinimumSize = function () { return [Math.max(width || 250, this.getPortLabelMinimumWidth()), this.widgetContentTop() + height + 12] }
    prototype.computeSize = function () {
      var minimum = this.getMinimumSize()
      this.size = [Math.max(minimum[0], this.size[0]), Math.max(minimum[1], this.size[1])]
      return this.size
    }
  }

  function Button () {
    this.addOutput('Event', PandaUI.EVENT)
    this.addOutput('Pressed', 'boolean')
    this.properties = { text: 'Run', message: '' }
    this.clicked = false
  }
  Button.title = 'Button'
  Button.prototype.press = function () {
    if (this.clicked) return
    this.clicked = true
    this.setOutputData(1, true)
    this.triggerSlot(0, this.properties.message)
    if (this.graph) this.graph.invalidateNode(this, { propagate: true, reason: 'button-press' })
    this.setDirtyCanvas()
  }
  Button.prototype.release = function () {
    this.clicked = false
    this.setOutputData(1, false)
    if (this.graph) this.graph.invalidateNode(this, { propagate: true, reason: 'button-release' })
    this.setDirtyCanvas()
  }
  Button.prototype.onExecute = function () { this.setOutputData(1, this.clicked) }
  layout(Button, 'button', 134)
  PandaUI.registerNode('widget/button', Button)

  function Toggle () {
    this.addInput('Value', 'boolean')
    this.addInput('Toggle', PandaUI.ACTION)
    this.addOutput('Value', 'boolean')
    this.addOutput('Changed', PandaUI.EVENT)
    this.properties = { value: false }
  }
  Toggle.title = 'Toggle'
  Toggle.prototype.onAction = function () {
    this.properties.value = !this.properties.value
    this.setOutputData(0, this.properties.value)
    this.triggerSlot(1, this.properties.value)
    if (this.graph) this.graph.invalidateNode(this, { propagate: true, reason: 'toggle-action' })
    this.setDirtyCanvas()
  }
  Toggle.prototype.onExecute = function () {
    var input = scalar(this.getInputData(0))
    if (input != null && this.isInputConnected(0)) this.properties.value = !!input
    this.setOutputData(0, !!this.properties.value)
  }
  layout(Toggle, 'toggle', 44)
  PandaUI.registerNode('widget/toggle', Toggle)

  function registerNumber (type, title, kind, height, defaults) {
    function NumberControl () {
      this.addOutput('Value', 'number')
      this.properties = Object.assign({ min: 0, max: 1, value: 0.5, step: 0.01, precision: 2 }, defaults)
    }
    NumberControl.title = title
    NumberControl.prototype.normalizeWidget = function () { normalizeRange(this) }
    NumberControl.prototype.onConfigure = function () { this.normalizeWidget(); this.computeSize() }
    NumberControl.prototype.onExecute = function () { this.normalizeWidget(); this.setOutputData(0, this.properties.value) }
    layout(NumberControl, kind, height)
    PandaUI.registerNode(type, NumberControl)
  }
  registerNumber('widget/number', 'Number', 'number', 122, { min: -1000, max: 1000, value: 1, step: 1, precision: 0 })
  registerNumber('widget/knob', 'Knob', 'knob', 230)
  registerNumber('widget/internal_slider', 'Inner Slider', 'slider', 174)
  registerNumber('widget/hslider', 'H.Slider', 'slider', 174)

  function Combo () {
    this.addOutput('Value', 'string')
    this.addOutput('Changed', PandaUI.EVENT)
    this.properties = { value: 'A', values: 'A;B;C' }
  }
  Combo.title = 'Combo'
  Combo.prototype.normalizeWidget = function () {
    this._values = String(this.properties.values || '').split(';').map(function (value) { return value.trim() }).filter(Boolean)
    if (this._values.indexOf(String(this.properties.value)) === -1) this.properties.value = this._values[0] || ''
  }
  Combo.prototype.onConfigure = function () { this.normalizeWidget(); this.computeSize() }
  Combo.prototype.onExecute = function () { this.normalizeWidget(); this.setOutputData(0, this.properties.value) }
  layout(Combo, 'combo', 118)
  PandaUI.registerNode('widget/combo', Combo)

  function Progress () {
    this.addInput('Value', 'number')
    this.properties = { min: 0, max: 1, value: 0, step: 0.01 }
  }
  Progress.title = 'Progress'
  Progress.prototype.normalizeWidget = function () { normalizeRange(this) }
  Progress.prototype.onExecute = function () {
    var value = scalar(this.getInputData(0))
    if (value != null && Number.isFinite(Number(value))) this.properties.value = Number(value)
    normalizeRange(this)
    this.setDirtyCanvas()
  }
  layout(Progress, 'progress', 116)
  PandaUI.registerNode('widget/progress', Progress)

  function Text () {
    this.addInput('Value', 0)
    this.addOutput('Text', 'string')
    this.properties = { value: '' }
  }
  Text.title = 'Text'
  Text.prototype.onConfigure = function () {
    if (!this.inputs.length) this.addInput('Value', 0)
    if (!this.outputs.length) this.addOutput('Text', 'string')
    this.properties.value = textValue(this.properties.value)
    this.computeSize()
  }
  Text.prototype.onExecute = function () {
    this._displayValue = this.isInputConnected(0) ? textValue(scalar(this.getInputData(0))) : textValue(this.properties.value)
    this.setOutputData(0, this._displayValue)
    this.setDirtyCanvas()
  }
  layout(Text, 'text', 152, 280)
  PandaUI.registerNode('widget/text', Text)

  function Panel () { this.properties = { value: '' } }
  Panel.title = 'Panel'
  Panel.prototype.onExecute = function () {}
  layout(Panel, 'panel', 152, 280)
  PandaUI.registerNode('widget/panel', Panel)
  global.PandaUIWidgetLayout = layout
})(typeof window !== 'undefined' ? window : globalThis)
