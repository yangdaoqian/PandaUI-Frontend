(function (root, factory) {
  var dependency = root.PandaUIKernel && root.PandaUIKernel.Path
  if (typeof module === 'object' && module.exports) dependency = require('./Path').Path
  var api = factory(dependency)
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.DataTree = api.DataTree
})(typeof window !== 'undefined' ? window : globalThis, function (Path) {
  if (typeof Path !== 'function') throw new Error('PandaUIKernel.Path must be loaded before DataTree.')

  function isObject (value) {
    return value != null && typeof value === 'object' && !Array.isArray(value)
  }

  function isLegacyTree (value) {
    return isObject(value) && Array.isArray(value.path) && Array.isArray(value.datas)
  }

  function isWireTree (value) {
    return isObject(value) && Object.keys(value).some(function (key) { return /^path\d+$/.test(key) })
  }

  function unwrapDualData (value) {
    return value && value._isDualData === true && value.display && value.display.treeData
      ? value.display.treeData
      : value
  }

  function DataTree () {
    this._branches = new Map()
  }

  DataTree.isTreeData = function (value) {
    return value instanceof DataTree || isLegacyTree(value) || isWireTree(value)
  }

  DataTree.unwrap = unwrapDualData

  DataTree.from = function (value) {
    value = unwrapDualData(value)
    if (value instanceof DataTree) return value.clone()
    if (isWireTree(value)) return DataTree.fromWire(value)
    if (isLegacyTree(value)) return DataTree.fromLegacy(value)
    return DataTree.fromWidget(value)
  }

  DataTree.fromLegacy = function (value) {
    var tree = new DataTree()
    var paths = Array.isArray(value && value.path) ? value.path : []
    var datas = Array.isArray(value && value.datas) ? value.datas : []
    var previews = Array.isArray(value && value.previews) ? value.previews : []
    for (var index = 0; index < datas.length; index++) {
      tree.add(paths[index] == null ? '{0}' : paths[index], datas[index], previews[index])
    }
    return tree
  }

  DataTree.fromWire = function (value) {
    var tree = new DataTree()
    Object.keys(value || {}).filter(function (key) { return /^path\d+$/.test(key) }).sort(function (left, right) {
      return Number(left.slice(4)) - Number(right.slice(4))
    }).forEach(function (key) {
      var tuple = Array.isArray(value[key]) ? value[key] : []
      var path = tuple[0] == null ? '{0}' : tuple[0]
      var values = Array.isArray(tuple[1]) ? tuple[1] : []
      var previews = Array.isArray(tuple[2]) ? tuple[2] : []
      values.forEach(function (item, index) { tree.add(path, item, previews[index]) })
    })
    return tree
  }

  DataTree.fromWidget = function (value) {
    var tree = new DataTree()
    if (value == null) return tree.ensurePath('{0}')
    if (!Array.isArray(value)) return tree.add('{0}', value)
    if (value.every(function (item) { return !Array.isArray(item) })) {
      value.forEach(function (item, index) { tree.add(new Path([0, index]), item) })
      return tree
    }
    function flatten (items, indices) {
      items.forEach(function (item, index) {
        var path = indices.concat(index)
        if (Array.isArray(item)) flatten(item, path)
        else tree.add(new Path(path), item)
      })
    }
    flatten(value, [0])
    return tree
  }

  DataTree.prototype.ensurePath = function (path) {
    var key = Path.parse(path).toString()
    if (!this._branches.has(key)) this._branches.set(key, { path: new Path(key), values: [], previews: [] })
    return this
  }

  DataTree.prototype.add = function (path, value, preview) {
    var key = Path.parse(path).toString()
    this.ensurePath(key)
    var branch = this._branches.get(key)
    branch.values.push(value)
    branch.previews.push(preview)
    return this
  }

  DataTree.prototype.getBranch = function (path) {
    var branch = this._branches.get(Path.parse(path).toString())
    return branch == null ? [] : branch.values.slice()
  }

  DataTree.prototype.paths = function () {
    return Array.from(this._branches.values()).map(function (branch) { return branch.path }).sort(Path.compare)
  }

  DataTree.prototype.values = function () {
    var result = []
    this.paths().forEach(function (path) { result.push.apply(result, this.getBranch(path)) }, this)
    return result
  }

  DataTree.prototype.first = function () {
    var values = this.values()
    return values.length ? values[0] : undefined
  }

  DataTree.prototype.clone = function () {
    var result = new DataTree()
    this.paths().forEach(function (path) {
      var branch = this._branches.get(path.toString())
      result.ensurePath(path)
      branch.values.forEach(function (value, index) { result.add(path, value, branch.previews[index]) })
    }, this)
    return result
  }

  DataTree.prototype.toLegacy = function () {
    var result = { path: [], datas: [], previews: [] }
    this.paths().forEach(function (path) {
      var branch = this._branches.get(path.toString())
      branch.values.forEach(function (value, index) {
        result.path.push(path.toString())
        result.datas.push(value)
        result.previews.push(branch.previews[index])
      })
    }, this)
    return result
  }

  DataTree.prototype.toWire = function () {
    var result = {}
    this.paths().forEach(function (path, index) {
      var branch = this._branches.get(path.toString())
      result['path' + index] = [path.toString(), branch.values.slice()]
      if (branch.previews.some(function (preview) { return preview !== undefined })) result['path' + index].push(branch.previews.slice())
    }, this)
    if (Object.keys(result).length === 0) result.path0 = ['{0}', []]
    return result
  }

  return { DataTree: DataTree }
})
