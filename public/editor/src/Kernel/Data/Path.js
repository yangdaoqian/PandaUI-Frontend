(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.Path = api.Path
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function normalizeIndices (value) {
    if (value instanceof Path) return value.indices.slice()
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      return Array.prototype.slice.call(value).map(function (item) {
        var index = Number(item)
        if (!Number.isInteger(index)) throw new TypeError('Path indices must be integers.')
        return index
      })
    }
    if (typeof value === 'number') return normalizeIndices([value])
    if (typeof value !== 'string') return [0]
    var text = value.trim()
    if (text === '') return [0]
    if (text[0] === '{' && text[text.length - 1] === '}') text = text.slice(1, -1)
    if (text === '') return []
    return text.split(';').map(function (part) {
      var index = Number(part.trim())
      if (!Number.isInteger(index)) throw new TypeError('Invalid path: ' + value)
      return index
    })
  }

  function Path (value) {
    this.indices = normalizeIndices(value)
  }

  Path.parse = function (value) {
    return value instanceof Path ? value : new Path(value)
  }

  Path.compare = function (left, right) {
    var a = Path.parse(left).indices
    var b = Path.parse(right).indices
    var length = Math.min(a.length, b.length)
    for (var index = 0; index < length; index++) {
      if (a[index] !== b[index]) return a[index] - b[index]
    }
    return a.length - b.length
  }

  Path.prototype.append = function (index) {
    return new Path(this.indices.concat(normalizeIndices([index])))
  }

  Path.prototype.equals = function (other) {
    return Path.compare(this, other) === 0
  }

  Path.prototype.toArray = function () {
    return this.indices.slice()
  }

  Path.prototype.toString = function () {
    return '{' + this.indices.join(';') + '}'
  }

  return { Path: Path }
})
