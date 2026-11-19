const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

class Directory {
  constructor (root, faults = {}) { this.root = root; this.kind = 'directory'; this.faults = faults }
  async getDirectoryHandle (name, { create = false } = {}) {
    const target = path.join(this.root, name)
    if (create) await fs.mkdir(target, { recursive: true })
    await fs.access(target)
    return new Directory(target, this.faults)
  }
  async getFileHandle (name, { create = false } = {}) {
    const target = path.join(this.root, name), faults = this.faults
    if (!create) await fs.access(target)
    return { kind: 'file', getFile: async () => new Blob([await fs.readFile(target)]), createWritable: async () => {
      let bytes
      return { write: async blob => { bytes = Buffer.from(await blob.arrayBuffer()) }, close: async () => {
        if (faults.fail === name) throw new Error('Simulated write failure')
        await fs.writeFile(target, bytes)
      }, abort: async () => {} }
    } }
  }
  async * entries () { for (const entry of await fs.readdir(this.root, { withFileTypes: true })) yield [entry.name, { kind: entry.isDirectory() ? 'directory' : 'file' }] }
  async removeEntry (name) { await fs.unlink(path.join(this.root, name)) }
}

async function main () {
  const { sha256 } = await import(pathToFileURL(path.resolve('src/storage/sha256.mjs')))
  const { createHash, randomBytes } = require('node:crypto')
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const data = [new Uint8Array(), new TextEncoder().encode('abc'), new TextEncoder().encode('a'.repeat(1000000)), ...[1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 262145].map(n => randomBytes(n + 11).subarray(7, n + 7))]
  try {
    for (const fallback of [false, true]) {
      Object.defineProperty(globalThis, 'crypto', fallback ? { configurable: true, value: {} } : descriptor)
      let yielded = false
      const timer = setTimeout(() => { yielded = true }, 0)
      for (const bytes of data) assert.equal(await sha256(bytes), createHash('sha256').update(bytes).digest('hex'))
      clearTimeout(timer)
      if (fallback) assert(yielded, 'Large fallback checksums must yield to the UI')
    }
  } finally { Object.defineProperty(globalThis, 'crypto', descriptor) }
  if (process.argv.includes('--http')) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} })
  console.log('PASS SHA-256: native and HTTP fallback, known vectors, padding boundaries, offset views and cooperative yielding')
  const { default: Store, PACK_BYTES } = await import(pathToFileURL(path.resolve('src/storage/FolderDocumentStore.mjs')))
  assert.equal(PACK_BYTES, 10 * 1024 * 1024)
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panda-folder-test-'))
  try {
    const faults = {}, directory = new Directory(root, faults), store = new Store(directory, { packBytes: 16 })
    let tx = await store.begin('document-a')
    const a = await tx.put('geometry', new Blob(['12345678'])), duplicate = await tx.put('geometry', new Blob(['12345678']))
    const b = await tx.put('geometry', new Blob(['abcdefgh']))
    const big = await tx.put('display', new Blob(['x'.repeat(50)]))
    assert.equal(a, duplicate)
    await tx.commit({ name: 'test', refs: [a, b, big] })
    let opened = await store.open()
    assert.equal(opened.records.size, 3)
    assert.equal(opened.records.get(a).path, opened.records.get(b).path)
    assert.equal(opened.records.get(b).offset, 8)
    assert.equal(opened.records.get(big).bytes, 50, 'Large records must remain whole')
    assert.equal(await (await opened.read(b)).text(), 'abcdefgh')
    const originalPack = opened.records.get(a).path
    const originalFiles = await fs.readdir(path.join(root, 'packs'))
    tx = await store.begin('document-a')
    assert.equal(await tx.put('geometry', new Blob(['12345678'])), a)
    tx.retain(b); tx.retain(big)
    await tx.commit({ name: 'second', refs: [a, b, big] })
    assert.deepEqual(await fs.readdir(path.join(root, 'packs')), originalFiles, 'Unchanged records must reuse packs')
    await assert.rejects(store.begin('different-document'), /different document/)
    // Interrupted pointer publication leaves the previous save readable.
    tx = await store.begin('document-a')
    const newer = await tx.put('display', new Blob(['new']))
    faults.fail = 'current-0.json'
    await assert.rejects(tx.commit({ name: 'interrupted', refs: [newer] }), /Simulated/)
    delete faults.fail
    assert.equal((await store.open()).commit.metadata.name, 'second')
    tx.abort()
    const controller = new AbortController()
    tx = await store.begin('document-a', { signal: controller.signal }); controller.abort()
    await assert.rejects(tx.put('geometry', new Blob(['bad'])), { name: 'AbortError' })
    // Stale writers may not overwrite a newer completed commit.
    const stale = await store.begin('document-a')
    tx = await store.begin('document-a'); tx.retain(a); await tx.commit({ name: 'third' })
    await assert.rejects(stale.commit({ name: 'stale' }), /changed in another window/)
    // Old unreferenced packs disappear after leaving both recovery snapshots.
    tx = await store.begin('document-a'); await tx.put('display', new Blob(['replacement'])); await tx.commit({ name: 'fourth' })
    tx = await store.begin('document-a'); await tx.put('display', new Blob(['replacement'])); await tx.commit({ name: 'fifth' })
    await fs.writeFile(path.join(root, 'packs', 'user-notes.txt'), 'keep')
    await store.collectGarbage()
    await assert.rejects(fs.access(path.join(root, originalPack)))
    assert.equal(await fs.readFile(path.join(root, 'packs/user-notes.txt'), 'utf8'), 'keep')
    opened = await store.open()
    const id = [...opened.records.keys()][0], location = opened.records.get(id)
    await fs.writeFile(path.join(root, location.path), 'X'.repeat(location.bytes))
    await assert.rejects(opened.read(id), /checksum mismatch/)
    // A damaged newest index falls back to the previous complete index.
    tx = await store.begin('document-a'); await tx.put('display', new Blob(['sixth data'])); await tx.commit({ name: 'sixth' })
    const latest = (await store.candidates())[0]
    await fs.writeFile(path.join(root, 'indexes', latest.commit.indexes[0] + '.json'), 'broken')
    assert.equal((await store.open()).commit.metadata.name, 'fifth')
    console.log('PASS folder packs: range reads, deduplication, incremental saves, whole large objects, interrupted commit recovery, cancellation, stale writer rejection, checksum verification and scoped garbage collection')
  } finally { await fs.rm(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
