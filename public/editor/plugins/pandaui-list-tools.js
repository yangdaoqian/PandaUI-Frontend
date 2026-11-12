(function (PandaUI, window) {
  function listValue (value) {
    return Array.isArray(value) ? value : []
  }

  function integerValue (value, fallback) {
    var number = Math.floor(Number(value))
    return Number.isFinite(number) ? number : fallback
  }

  function register (type, title, description, constructor) {
    constructor.title = title
    constructor.desc = description
    PandaUI.registerNode(type, constructor)
  }

  function ListCreate () {
    this.addInput('a', 0)
    this.addInput('b', 0)
    this.addInput('c', 0)
    this.addInput('d', 0)
    this.addOutput('list', 'array')
  }
  ListCreate.prototype.onExecute = function () {
    var result = []
    for (var index = 0; index < 4; index++) {
      var value = this.getInputData(index)
      if (value != null) result.push(value)
    }
    this.setOutputData(0, result)
  }
  register('list/create', 'List Create', 'Creates a list from up to four input values.', ListCreate)

  function ListLength () { this.addInput('list', 'array'); this.addOutput('length', 'number') }
  ListLength.prototype.onExecute = function () { this.setOutputData(0, listValue(this.getInputData(0)).length) }
  register('list/length', 'List Length', 'Outputs the number of items in a list.', ListLength)

  function ListGet () { this.addInput('list', 'array'); this.addInput('index', 'number'); this.addOutput('item', 0); this.addOutput('valid', 'boolean') }
  ListGet.prototype.onExecute = function () {
    var list = listValue(this.getInputData(0))
    var index = integerValue(this.getInputData(1), 0)
    if (index < 0) index += list.length
    var valid = index >= 0 && index < list.length
    this.setOutputData(0, valid ? list[index] : null)
    this.setOutputData(1, valid)
  }
  register('list/get', 'List Get', 'Gets an item by index. Negative indices count from the end.', ListGet)

  function ListSet () { this.addInput('list', 'array'); this.addInput('index', 'number'); this.addInput('value', 0); this.addOutput('list', 'array') }
  ListSet.prototype.onExecute = function () {
    var result = listValue(this.getInputData(0)).slice()
    var index = integerValue(this.getInputData(1), 0)
    if (index < 0) index += result.length
    if (index >= 0) result[index] = this.getInputData(2)
    this.setOutputData(0, result)
  }
  register('list/set', 'List Set', 'Returns a copy of a list with an item set at an index.', ListSet)

  function ListAppend () { this.addInput('list', 'array'); this.addInput('item', 0); this.addOutput('list', 'array') }
  ListAppend.prototype.onExecute = function () {
    var result = listValue(this.getInputData(0)).slice()
    result.push(this.getInputData(1))
    this.setOutputData(0, result)
  }
  register('list/append', 'List Append', 'Returns a copy of a list with one item appended.', ListAppend)

  function ListConcat () { this.addInput('a', 'array'); this.addInput('b', 'array'); this.addOutput('list', 'array') }
  ListConcat.prototype.onExecute = function () { this.setOutputData(0, listValue(this.getInputData(0)).concat(listValue(this.getInputData(1)))) }
  register('list/concat', 'List Concat', 'Joins two lists into a new list.', ListConcat)

  function ListSlice () { this.addInput('list', 'array'); this.addInput('start', 'number'); this.addInput('end', 'number'); this.addOutput('list', 'array') }
  ListSlice.prototype.onExecute = function () {
    var list = listValue(this.getInputData(0))
    var start = integerValue(this.getInputData(1), 0)
    var endInput = this.getInputData(2)
    var end = endInput == null ? list.length : integerValue(endInput, list.length)
    this.setOutputData(0, list.slice(start, end))
  }
  register('list/slice', 'List Slice', 'Extracts items between start and end indices.', ListSlice)

  function ListReverse () { this.addInput('list', 'array'); this.addOutput('list', 'array') }
  ListReverse.prototype.onExecute = function () { this.setOutputData(0, listValue(this.getInputData(0)).slice().reverse()) }
  register('list/reverse', 'List Reverse', 'Returns a reversed copy of a list.', ListReverse)

  function ListSort () { this.addInput('list', 'array'); this.addOutput('list', 'array') }
  ListSort.prototype.onExecute = function () {
    this.setOutputData(0, listValue(this.getInputData(0)).slice().sort(function (left, right) {
      return String(left).localeCompare(String(right), undefined, { numeric: true })
    }))
  }
  register('list/sort', 'List Sort', 'Sorts values using natural text and number order.', ListSort)

  function ListUnique () { this.addInput('list', 'array'); this.addOutput('list', 'array') }
  ListUnique.prototype.onExecute = function () {
    var seen = new Set()
    var result = []
    listValue(this.getInputData(0)).forEach(function (item) {
      var key = item != null && typeof item === 'object' ? JSON.stringify(item) : typeof item + ':' + String(item)
      if (!seen.has(key)) { seen.add(key); result.push(item) }
    })
    this.setOutputData(0, result)
  }
  register('list/unique', 'List Unique', 'Removes duplicate primitive or JSON-compatible values.', ListUnique)

  function ListFlatten () { this.addInput('list', 'array'); this.addInput('depth', 'number'); this.addOutput('list', 'array') }
  ListFlatten.prototype.onExecute = function () {
    var depth = Math.max(0, integerValue(this.getInputData(1), 1))
    this.setOutputData(0, listValue(this.getInputData(0)).flat(depth))
  }
  register('list/flatten', 'List Flatten', 'Flattens nested lists to a selected depth.', ListFlatten)

  function ListChunk () { this.addInput('list', 'array'); this.addInput('size', 'number'); this.addOutput('chunks', 'array') }
  ListChunk.prototype.onExecute = function () {
    var list = listValue(this.getInputData(0))
    var size = Math.max(1, integerValue(this.getInputData(1), 1))
    var result = []
    for (var index = 0; index < list.length; index += size) result.push(list.slice(index, index + size))
    this.setOutputData(0, result)
  }
  register('list/chunk', 'List Chunk', 'Splits a list into fixed-size lists.', ListChunk)

  function ListZip () { this.addInput('a', 'array'); this.addInput('b', 'array'); this.addOutput('pairs', 'array') }
  ListZip.prototype.onExecute = function () {
    var a = listValue(this.getInputData(0)); var b = listValue(this.getInputData(1)); var result = []
    for (var index = 0; index < Math.min(a.length, b.length); index++) result.push([a[index], b[index]])
    this.setOutputData(0, result)
  }
  register('list/zip', 'List Zip', 'Pairs items from two lists up to the shorter length.', ListZip)

  function ListRepeat () { this.addInput('list', 'array'); this.addInput('count', 'number'); this.addOutput('list', 'array') }
  ListRepeat.prototype.onExecute = function () {
    var list = listValue(this.getInputData(0)); var count = Math.max(0, integerValue(this.getInputData(1), 1)); var result = []
    for (var index = 0; index < count; index++) result = result.concat(list)
    this.setOutputData(0, result)
  }
  register('list/repeat', 'List Repeat', 'Repeats a list a specified number of times.', ListRepeat)

  window.PandaUINodePlugin = {
    id: 'pandaui-list-tools',
    name: 'List Tools',
    version: '1.0.0',
    icon: 'format_list_bulleted',
    description: 'Example list-processing nodes for building and transforming arrays.',
    types: ['list/create', 'list/length', 'list/get', 'list/set', 'list/append', 'list/concat', 'list/slice', 'list/reverse', 'list/sort', 'list/unique', 'list/flatten', 'list/chunk', 'list/zip', 'list/repeat']
  }
})(PandaUI, window)
