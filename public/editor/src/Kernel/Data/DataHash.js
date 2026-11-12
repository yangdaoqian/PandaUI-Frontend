(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.DataHash = api.DataHash
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function normalize (value, seen) {
    if (value == null || typeof value !== 'object') return value
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value))
    if (ArrayBuffer.isView(value)) return Array.from(value)
    if (Array.isArray(value)) return value.map(function (item) { return normalize(item, seen) })
    var result = {}
    Object.keys(value).sort().forEach(function (key) {
      if (key === 'preview' || key === 'previews' || key === 'buffer') return
      result[key] = normalize(value[key], seen)
    })
    return result
  }

  function stableStringify (value) {
    return JSON.stringify(normalize(value, new Set()))
  }

  function hashString (text) {
    var hash = 2166136261
    for (var index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index)
      hash = Math.imul(hash, 16777619)
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8)
  }

  var DataHash = {
    stringify: stableStringify,
    compute: function (value) { return hashString(stableStringify(value)) }
  }

  return { DataHash: DataHash }
})
