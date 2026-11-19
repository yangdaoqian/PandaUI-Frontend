const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
async function run () {
  const root = path.resolve(__dirname, '..')
  const { validateManifest, packageURL, instantiatePackage } = await import(pathToFileURL(path.join(root, 'public/nodec/NodePackageProtocol.mjs')))
  const { NodePackageLoader } = await import(pathToFileURL(path.join(root, 'public/nodec/NodePackageLoader.mjs')))
  const dir = path.join(root, 'public/nodec/packages')
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json')))
  let total = 0
  for (const file of index.packages) {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, file)))
    const bytes = fs.readFileSync(path.join(dir, path.dirname(file), manifest.module))
    const api = await instantiatePackage(bytes, manifest)
    for (let i = 0; i < manifest.nodes.length; i++) assert.equal(api.panda_solve(i), 1, 'Every registered node is explicitly pending')
    assert.equal(api.panda_solve(manifest.nodes.length), -1)
    assert.equal(api.panda_solve(-1), -1)
    total += manifest.nodes.length
    const modified = structuredClone(manifest)
    modified.nodes[0].name += ' changed'
    await assert.rejects(instantiatePackage(bytes, modified), /does not match/)
    assert.throws(() => validateManifest({ ...manifest, abiVersion: 99 }), /ABI/)
    assert.throws(() => validateManifest({ ...manifest, nodes: [manifest.nodes[0], manifest.nodes[0]] }), /duplicate/)
    assert.throws(() => validateManifest({ ...manifest, module: '../wrong.wasm' }), /sibling/)
    await assert.rejects(instantiatePackage(new Uint8Array([1, 2, 3]), manifest))
  }
  assert.throws(() => packageURL('https://other.example/test.wasm', 'http://localhost/'), /same-origin/)
  assert.throws(() => packageURL('data:text/javascript,bad', 'http://localhost/'), /same-origin/)
  let terminated = 0
  const loader = new NodePackageLoader({ workerFactory: () => ({ postMessage () {}, terminate () { terminated++ } }), timeout: 20 })
  const cancel = new AbortController()
  const pending = loader.request('load', {}, '/unused', null, cancel.signal)
  cancel.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  assert.equal(loader.pending.size, 0)
  await assert.rejects(loader.request('load', {}, '/unused'), /timed out/)
  assert.equal(terminated, 1)
  assert.equal(loader.pending.size, 0)
  loader.dispose()
  await assert.rejects(loader.request('load', {}, '/unused'), /disposed/)
  console.log(`PASS: ${index.packages.length} real WASM packages, ${total} pending nodes; binary/manifest consistency, ABI, duplicates, URLs, cancellation and timeout cleanup.`)
}
run().catch(error => { console.error(error); process.exitCode = 1 })
