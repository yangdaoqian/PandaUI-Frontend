(function (root, factory) {
  var api = factory(root)
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.PandaUICrypto = api
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  function randomUUID () {
    if (typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID()
    var bytes = root.crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 15) | 64
    bytes[8] = (bytes[8] & 63) | 128
    var hex = Array.from(bytes, function (value) { return value.toString(16).padStart(2, '0') }).join('')
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20)
  }

  var constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ])

  function rotate (value, bits) { return (value >>> bits) | (value << (32 - bits)) }

  function digestFallback (bytes) {
    var padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64)
    padded.set(bytes)
    padded[bytes.length] = 128
    var view = new DataView(padded.buffer)
    view.setUint32(padded.length - 8, Math.floor(bytes.length / 0x20000000))
    view.setUint32(padded.length - 4, (bytes.length * 8) >>> 0)
    var state = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
    var words = new Uint32Array(64)
    for (var offset = 0; offset < padded.length; offset += 64) {
      for (var index = 0; index < 64; index++) {
        if (index < 16) words[index] = view.getUint32(offset + index * 4)
        else {
          var previous = words[index - 15]
          var recent = words[index - 2]
          var sigma0 = rotate(previous, 7) ^ rotate(previous, 18) ^ (previous >>> 3)
          var sigma1 = rotate(recent, 17) ^ rotate(recent, 19) ^ (recent >>> 10)
          words[index] = words[index - 16] + sigma0 + words[index - 7] + sigma1
        }
      }
      var working = new Uint32Array(state)
      for (var round = 0; round < 64; round++) {
        var upper = rotate(working[4], 6) ^ rotate(working[4], 11) ^ rotate(working[4], 25)
        var choice = (working[4] & working[5]) ^ (~working[4] & working[6])
        var first = (working[7] + upper + choice + constants[round] + words[round]) >>> 0
        var lower = rotate(working[0], 2) ^ rotate(working[0], 13) ^ rotate(working[0], 22)
        var majority = (working[0] & working[1]) ^ (working[0] & working[2]) ^ (working[1] & working[2])
        working.copyWithin(1, 0, 7)
        working[4] += first
        working[0] = first + lower + majority
      }
      for (var slot = 0; slot < 8; slot++) state[slot] += working[slot]
    }
    return Array.from(state, function (word) { return word.toString(16).padStart(8, '0') }).join('')
  }

  async function sha256 (text) {
    var bytes = new TextEncoder().encode(text)
    if (root.crypto.subtle && typeof root.crypto.subtle.digest === 'function') {
      var digest = await root.crypto.subtle.digest('SHA-256', bytes)
      return Array.from(new Uint8Array(digest), function (value) { return value.toString(16).padStart(2, '0') }).join('')
    }
    return digestFallback(bytes)
  }

  return { randomUUID: randomUUID, sha256: sha256 }
})
