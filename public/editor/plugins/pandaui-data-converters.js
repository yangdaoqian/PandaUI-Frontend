(function (PandaUI, window) {
  function isTreeData (value) {
    return value != null && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.path) && Array.isArray(value.datas)
  }

  function unwrapValue (value) {
    if (value && value._isDualData && value.display && isTreeData(value.display.treeData)) return value.display.treeData
    return value
  }

  function copyTreeWithValues (tree, values) {
    var result = {
      path: tree.path.slice(),
      datas: values
    }
    if (Array.isArray(tree.previews)) result.previews = tree.previews.slice()
    return result
  }

  function convertValue (value, converter) {
    value = unwrapValue(value)
    if (isTreeData(value)) {
      return copyTreeWithValues(value, value.datas.map(converter))
    }
    if (Array.isArray(value)) return value.map(converter)
    if (ArrayBuffer.isView(value)) return Array.from(value, converter)
    return converter(value)
  }

  function toFiniteNumber (value) {
    if (value == null || value === '') return 0
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0
    if (typeof value === 'boolean') return value ? 1 : 0
    var result = Number(value)
    return Number.isFinite(result) ? result : 0
  }

  function toInteger (value) {
    return Math.trunc(toFiniteNumber(value))
  }

  function toBoolean (value) {
    if (typeof value === 'string') {
      var normalized = value.trim().toLowerCase()
      if (normalized === 'false' || normalized === '0' || normalized === '') return false
      if (normalized === 'true' || normalized === '1') return true
    }
    return Boolean(value)
  }

  function toText (value) {
    return value == null ? '' : String(value)
  }

  function registerConverter (type, title, description, outputType, converter) {
    function DataConverter () {
      this.addInput('values', 0)
      this.addOutput('values', outputType)
      this.size = [150, 42]
    }

    DataConverter.title = title
    DataConverter.desc = description
    DataConverter.prototype.onExecute = function () {
      var value = this.getInputData(0)
      if (value === undefined) return
      this.setOutputData(0, convertValue(value, converter))
    }

    PandaUI.registerNode(type, DataConverter)
  }

  registerConverter(
    'convert/to_number',
    'To Number',
    'Converts scalar, array, or GH tree values to finite numbers while preserving GH paths.',
    'number',
    toFiniteNumber
  )

  registerConverter(
    'convert/to_integer',
    'To Integer',
    'Converts scalar, array, or GH tree values to integers while preserving GH paths.',
    'integer',
    toInteger
  )

  registerConverter(
    'convert/to_boolean',
    'To Boolean',
    'Converts scalar, array, or GH tree values to booleans while preserving GH paths.',
    'boolean',
    toBoolean
  )

  registerConverter(
    'convert/to_string',
    'To String',
    'Converts scalar, array, or GH tree values to strings while preserving GH paths.',
    'string',
    toText
  )

  function FirstValue () {
    this.addInput('values', 0)
    this.addOutput('value', 0)
    this.size = [150, 42]
  }

  FirstValue.title = 'First Value'
  FirstValue.desc = 'Extracts the first item from a scalar, array, or GH tree.'
  FirstValue.prototype.onExecute = function () {
    var value = unwrapValue(this.getInputData(0))
    if (value === undefined) return
    if (isTreeData(value)) value = value.datas.length ? value.datas[0] : undefined
    else if (Array.isArray(value) || ArrayBuffer.isView(value)) value = value.length ? value[0] : undefined
    this.setOutputData(0, value)
  }

  PandaUI.registerNode('convert/first_value', FirstValue)

  window.PandaUINodePlugin = {
    id: 'pandaui-data-converters',
    name: 'Data Converters',
    version: '1.0.0',
    icon: 'swap_horiz',
    description: 'Native frontend conversion nodes for scalar, array, and Grasshopper tree data.',
    types: [
      'convert/to_number',
      'convert/to_integer',
      'convert/to_boolean',
      'convert/to_string',
      'convert/first_value'
    ]
  }
})(PandaUI, window)
