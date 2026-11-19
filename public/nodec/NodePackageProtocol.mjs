// ABI v1 registers definitions and reports pending execution only.
export const MAX_PACKAGE_BYTES = 16 * 1024 * 1024
const idPattern = /^[a-z][a-z0-9._-]{0,79}$/
const guidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
function requireValue (condition, message) { if (!condition) throw new Error('WASM package: ' + message) }
export function validateManifest (manifest) {
  requireValue(manifest && manifest.schemaVersion === 1 && manifest.abiVersion === 1, 'unsupported schema or ABI version.')
  requireValue(idPattern.test(manifest.id) && typeof manifest.name === 'string' && manifest.name.length > 0 && manifest.name.length < 128, 'invalid identity.')
  requireValue(typeof manifest.version === 'string' && manifest.version.length < 80, 'invalid version.')
  requireValue(manifest.stage === 'registration-only', 'ABI v1 only supports registration-only packages.')
  requireValue(typeof manifest.module === 'string' && /^[a-zA-Z0-9_-]+\.wasm$/.test(manifest.module), 'module must be a sibling .wasm file.')
  requireValue(Array.isArray(manifest.nodes) && manifest.nodes.length > 0 && manifest.nodes.length <= 10000, 'invalid node list.')
  const ids = new Set()
  for (const node of manifest.nodes) {
    requireValue(node && guidPattern.test(node.id) && !ids.has(node.id), 'invalid or duplicate node GUID.')
    ids.add(node.id)
    for (const field of ['name', 'nickname', 'category', 'description']) requireValue(typeof node[field] === 'string' && node[field].length < 8192, 'invalid node ' + field)
    requireValue(node.name.length > 0 && node.status === 'pending', 'ABI v1 nodes must explicitly be pending.')
    for (const direction of ['inputs', 'outputs']) {
      requireValue(Array.isArray(node[direction]) && node[direction].length <= 256, 'invalid ports.')
      for (const port of node[direction]) {
        requireValue(port && ['name', 'nickname', 'description', 'type'].every(k => typeof port[k] === 'string' && port[k].length < 8192), 'invalid port metadata.')
        requireValue(['item', 'list', 'tree'].includes(port.access), 'invalid port access.')
      }
    }
  }
  return manifest
}
export function packageURL (value, base) {
  const url = new URL(value, base)
  const origin = new URL(base).origin
  requireValue(['http:', 'https:'].includes(url.protocol) && url.origin === origin && !url.username && !url.password, 'only same-origin HTTP(S) package files are supported.')
  return url.href
}
export async function fetchPackageFile (url, json = false) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache', redirect: 'error' })
    if (!response.ok) throw new Error('WASM package request failed: HTTP ' + response.status + ' (' + url + ')')
    if (Number(response.headers.get('content-length')) > MAX_PACKAGE_BYTES) throw new Error('WASM package exceeds the loading limit.')
    const reader = response.body.getReader()
    const chunks = []
    let length = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        length += value.byteLength
        if (length > MAX_PACKAGE_BYTES) { await reader.cancel(); throw new Error('WASM package exceeds the loading limit.') }
        chunks.push(value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return json ? JSON.parse(new TextDecoder().decode(bytes)) : bytes
  } finally { clearTimeout(timer) }
}
export async function instantiatePackage (bytes, manifest) {
  validateManifest(manifest)
  requireValue(bytes.byteLength <= MAX_PACKAGE_BYTES, 'binary is too large.')
  const module = await WebAssembly.compile(bytes)
  requireValue(WebAssembly.Module.imports(module).length === 0, 'ABI v1 does not accept host imports.')
  const instance = await WebAssembly.instantiate(module, {})
  const api = instance.exports
  for (const name of ['panda_abi_version', 'panda_manifest_ptr', 'panda_manifest_size', 'panda_node_count', 'panda_solve']) requireValue(typeof api[name] === 'function', 'missing export ' + name)
  requireValue(api.memory instanceof WebAssembly.Memory && api.panda_abi_version() === manifest.abiVersion, 'binary ABI mismatch.')
  const ptr = api.panda_manifest_ptr() >>> 0
  const size = api.panda_manifest_size() >>> 0
  requireValue(size > 0 && size <= MAX_PACKAGE_BYTES && ptr + size <= api.memory.buffer.byteLength, 'invalid embedded manifest range.')
  const embedded = JSON.parse(new TextDecoder().decode(new Uint8Array(api.memory.buffer, ptr, size)))
  // Compare semantic JSON, independent of property ordering/pretty printing.
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
  requireValue(JSON.stringify(canonical(embedded)) === JSON.stringify(canonical(manifest)), 'manifest does not match its compiled WASM.')
  requireValue(api.panda_node_count() === manifest.nodes.length, 'node count mismatch.')
  return api
}
