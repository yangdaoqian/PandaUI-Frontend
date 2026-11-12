(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.Goo = api.Goo
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function Goo (value, type) {
    this.value = value
    this.type = String(type || inferType(value))
  }

  function inferType (value) {
    if (value == null) return 'null'
    if (value && typeof value === 'object' && value.kind === 'geometryRef') return String(value.geometryType || 'geometry').toLowerCase()
    if (value && typeof value === 'object' && value.__geo) return String(value.__geo).replace(/^(?:panda|rhino)\./, '')
    if (Array.isArray(value)) return 'list'
    return typeof value
  }

  Goo.wrap = function (value, type) {
    return value instanceof Goo ? value : new Goo(value, type)
  }

  Goo.prototype.unwrap = function () {
    return this.value
  }

  Goo.prototype.duplicate = function () {
    if (typeof structuredClone === 'function') return new Goo(structuredClone(this.value), this.type)
    return new Goo(this.value, this.type)
  }

  Goo.prototype.toJSON = function () {
    return this.value
  }

  return { Goo: Goo }
})
