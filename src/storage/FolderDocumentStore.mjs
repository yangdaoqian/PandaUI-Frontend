import { sha256 } from './sha256.mjs'

// Browser folder storage. Immutable packs + alternating commit pointers make
// interrupted writes recoverable without relying on directory rename support.
export const PACK_BYTES = 10 * 1024 * 1024
const FORMAT = 'pandaui-folder', VERSION = 1
const json = value => new Blob([JSON.stringify(value)], { type: 'application/json' })
const hashPattern = /^[a-f0-9]{64}$/
const checkAbort = signal => { if (signal?.aborted) throw new DOMException('Operation cancelled.', 'AbortError') }
export async function digest (blob) { return sha256(new Uint8Array(await blob.arrayBuffer())) }

async function fileHandle (directory, path, create = false) {
  const parts = path.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || /[\\:]/.test(part))) throw new Error('Invalid document path.')
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create })
  return directory.getFileHandle(parts.at(-1), { create })
}
async function readFile (directory, path) { return (await fileHandle(directory, path)).getFile() }
async function writeFile (directory, path, blob) {
  const writable = await (await fileHandle(directory, path, true)).createWritable()
  try { await writable.write(blob); await writable.close() } catch (error) { await writable.abort().catch(() => {}); throw error }
}
async function readJson (directory, path) { return JSON.parse(await (await readFile(directory, path)).text()) }

export default class FolderDocumentStore {
  constructor (directory, { packBytes = PACK_BYTES } = {}) { this.directory = directory; this.packBytes = packBytes }

  async candidates () {
    const results = []
    for (const slot of [0, 1]) {
      try {
        const pointer = await readJson(this.directory, `current-${slot}.json`)
        if (!hashPattern.test(pointer.hash) || !Number.isSafeInteger(pointer.sequence) || pointer.sequence < 1) continue
        const blob = await readFile(this.directory, `commits/${pointer.hash}.json`)
        if (await digest(blob) !== pointer.hash) continue
        const commit = JSON.parse(await blob.text())
        if (commit.format !== FORMAT || commit.version !== VERSION || commit.sequence !== pointer.sequence || typeof commit.documentId !== 'string' || !Array.isArray(commit.indexes)) continue
        results.push({ ...pointer, slot, commit })
      } catch (_) { /* An incomplete pointer never hides the other committed slot. */ }
    }
    return results.sort((a, b) => b.sequence - a.sequence)
  }

  async open () {
    for (const candidate of await this.candidates()) {
      try {
        const records = new Map(), packs = new Map()
        for (const hash of candidate.commit.indexes) {
          if (!hashPattern.test(hash)) throw new Error('Invalid document index.')
          const blob = await readFile(this.directory, `indexes/${hash}.json`)
          if (await digest(blob) !== hash) throw new Error('Document index checksum mismatch.')
          for (const [id, record] of JSON.parse(await blob.text())) {
            if (!hashPattern.test(id) || !/^packs\/(geometry|display|metadata)-[a-f0-9]{64}\.bin$/.test(record.path) ||
                !Number.isSafeInteger(record.offset) || record.offset < 0 || !Number.isSafeInteger(record.bytes) || record.bytes < 0 || records.has(id)) throw new Error('Invalid document record.')
            records.set(id, record)
            packs.set(record.path, Math.max(packs.get(record.path) || 0, record.offset + record.bytes))
          }
        }
        for (const [path, size] of packs) if ((await readFile(this.directory, path)).size < size) throw new Error('Incomplete document pack.')
        const fileCache = new Map(), packCache = new Map()
        let cachedBytes = 0
        const readBytes = async (id, { cachePack = false } = {}) => {
          const record = records.get(id)
          if (!record) throw new Error('Missing document record: ' + id)
          let file = fileCache.get(record.path)
          if (!file) {
            file = await readFile(this.directory, record.path)
            fileCache.set(record.path, file)
            if (fileCache.size > 8) fileCache.delete(fileCache.keys().next().value)
          }
          let packed = packCache.get(record.path)
          if (!packed && cachePack && file.size <= PACK_BYTES) {
            while (cachedBytes + file.size > 2 * PACK_BYTES && packCache.size) {
              const oldest = packCache.keys().next().value
              cachedBytes -= packCache.get(oldest).byteLength; packCache.delete(oldest)
            }
            packed = new Uint8Array(await file.arrayBuffer())
            packCache.set(record.path, packed); cachedBytes += packed.byteLength
          }
          // Own only this record: retaining a display buffer must not pin a
          // whole pack through a small typed-array view.
          const bytes = packed ? packed.slice(record.offset, record.offset + record.bytes) : new Uint8Array(await file.slice(record.offset, record.offset + record.bytes).arrayBuffer())
          if (await sha256(bytes) !== id) throw new Error('Document data checksum mismatch: ' + id)
          return bytes
        }
        const clearCache = () => { fileCache.clear(); packCache.clear(); cachedBytes = 0 }
        return { ...candidate, records, readBytes, clearCache, read: async id => new Blob([await readBytes(id)]), readJson: async id => JSON.parse(new TextDecoder().decode(await readBytes(id))) }
      } catch (_) { /* Fall back to the previous complete indexed snapshot. */ }
    }
    throw new Error('No complete Panda document was found in this folder.')
  }

  async begin (documentId, { signal } = {}) {
    let previous
    try { previous = await this.open() } catch (_) {
      // Never turn a damaged/foreign folder into a new document silently.
      for await (const [name] of this.directory.entries()) {
        if (name === 'document.json' || name.startsWith('current-')) throw new Error('Existing document is damaged. Use Save as to a new folder.')
      }
    }
    if (previous && previous.commit.documentId !== documentId) throw new Error('This folder belongs to a different document.')
    const sequence = (previous?.sequence || 0) + 1
    const records = new Map(), pending = new Map(), store = this
    let finished = false
    const assertOpen = () => { checkAbort(signal); if (finished) throw new Error('Save transaction is closed.') }
    const flush = async kind => {
      const pack = pending.get(kind)
      if (!pack?.parts.length) return
      assertOpen()
      const blob = new Blob(pack.parts), hash = await digest(blob), path = `packs/${kind}-${hash}.bin`
      await writeFile(store.directory, path, blob)
      for (const [id, offset, bytes] of pack.entries) records.set(id, { path, offset, bytes })
      pending.delete(kind)
    }
    const contains = id => records.has(id) || [...pending.values()].some(pack => pack.ids.has(id))
    return {
      previous,
      retain (id) {
        assertOpen()
        if (!previous?.records.has(id)) throw new Error('Cannot reuse an unknown document record.')
        records.set(id, previous.records.get(id)); return id
      },
      async put (kind, blob) {
        assertOpen()
        if (!['geometry', 'display', 'metadata'].includes(kind) || !(blob instanceof Blob)) throw new Error('Invalid pack record.')
        const id = await digest(blob)
        if (contains(id)) return id
        if (previous?.records.has(id)) { records.set(id, previous.records.get(id)); return id }
        if ((pending.get(kind)?.size || 0) + blob.size > store.packBytes) await flush(kind)
        let pack = pending.get(kind)
        if (!pack) { pack = { parts: [], entries: [], ids: new Set(), size: 0 }; pending.set(kind, pack) }
        pack.entries.push([id, pack.size, blob.size]); pack.ids.add(id); pack.parts.push(blob); pack.size += blob.size
        if (pack.size >= store.packBytes) await flush(kind)
        return id
      },
      async putJson (kind, value) { return this.put(kind, json(value)) },
      async commit (metadata) {
        assertOpen()
        for (const kind of [...pending.keys()]) await flush(kind)
        const current = (await store.candidates())[0]
        if ((current?.hash || null) !== (previous?.hash || null)) throw new Error('The folder changed in another window. Save again after reopening it.')
        const indexes = [], rows = [...records].sort(([a], [b]) => a.localeCompare(b))
        for (let index = 0; index < rows.length; index += 2048) {
          const blob = json(rows.slice(index, index + 2048)), hash = await digest(blob)
          await writeFile(store.directory, `indexes/${hash}.json`, blob); indexes.push(hash)
        }
        assertOpen()
        const commit = { format: FORMAT, version: VERSION, documentId, sequence, savedAt: new Date().toISOString(), indexes, metadata }
        const blob = json(commit), hash = await digest(blob)
        await writeFile(store.directory, `commits/${hash}.json`, blob)
        // Pointer publication is last. Never overwrite the previous good slot.
        await writeFile(store.directory, `current-${previous ? 1 - previous.slot : 0}.json`, json({ sequence, hash }))
        finished = true
        await writeFile(store.directory, 'document.json', json({ format: FORMAT, version: VERSION, documentId, name: metadata.name })).catch(() => {})
        return { sequence, hash, records: records.size }
      },
      abort () { finished = true; pending.clear(); records.clear() }
    }
  }

  async collectGarbage () {
    // Keep exactly the two recovery commits, never touch files outside our
    // generated content-addressed namespaces. Only run after a successful save.
    const keep = new Set()
    for (const candidate of await this.candidates()) {
      keep.add(`commits/${candidate.hash}.json`)
      for (const hash of candidate.commit.indexes) {
        keep.add(`indexes/${hash}.json`)
        for (const [, record] of await readJson(this.directory, `indexes/${hash}.json`)) keep.add(record.path)
      }
    }
    if (!keep.size) return
    for (const name of ['packs', 'indexes', 'commits']) {
      let directory
      try { directory = await this.directory.getDirectoryHandle(name) } catch (_) { continue }
      for await (const [file, handle] of directory.entries()) {
        if (handle.kind !== 'file' || !/^(?:(?:geometry|display|metadata)-)?[a-f0-9]{64}\.(?:bin|json)$/.test(file)) continue
        if (!keep.has(name + '/' + file)) await directory.removeEntry(file)
      }
    }
  }
}
