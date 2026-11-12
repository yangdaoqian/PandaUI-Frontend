const TARGET_BYTES = 10 * 1024 * 1024
const MAX_ITEMS = 1024
const MAGIC = 0x314b4450
const align = n => Math.ceil(n / 8) * 8

function encodeDisplayPack (items) {
  let offset = 0
  const parts = [], entries = []
  for (const item of items) {
    const { data, ...metadata } = item
    const length = data?.size ?? data?.byteLength ?? 0
    entries.push({ ...metadata, offset, length })
    if (length) { parts.push(data, new Uint8Array(align(length) - length)); offset += align(length) }
  }
  const json = new TextEncoder().encode(JSON.stringify({ version: 1, entries }))
  return new Blob([new Uint32Array([MAGIC, json.length]), json, new Uint8Array(align(json.length) - json.length), ...parts], { type: 'application/octet-stream' })
}

function decodeDisplayPack (buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes.byteLength < 8) throw new Error('Incomplete display pack.')
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = header.getUint32(4, true), start = 8 + align(length)
  if (header.getUint32(0, true) !== MAGIC || length > 512 * 1024 || start > bytes.byteLength) throw new Error('Invalid display pack header.')
  const metadata = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length)))
  if (metadata.version !== 1 || !Array.isArray(metadata.entries) || metadata.entries.length > MAX_ITEMS) throw new Error('Invalid display pack index.')
  const ids = new Set()
  return metadata.entries.map(entry => {
    if (typeof entry.assetId !== 'string' || ids.has(entry.assetId) || !Number.isSafeInteger(entry.offset) || !Number.isSafeInteger(entry.length) || entry.offset < 0 || entry.length < 0 || entry.offset % 8 || start + entry.offset + entry.length > bytes.byteLength) throw new Error('Invalid display pack entry.')
    ids.add(entry.assetId)
    return { ...entry, absoluteOffset: start + entry.offset, data: bytes.subarray(start + entry.offset, start + entry.offset + entry.length) }
  })
}

module.exports = { TARGET_BYTES, MAX_ITEMS, encodeDisplayPack, decodeDisplayPack }
