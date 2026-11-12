const storageKey = () => 'pandaui.nodeDocuments.recent.v1:' + (window.PandaUIAuth?.user.userId || 'signed-out')

async function handleStore (mode, operation) {
  if (!window.indexedDB) return null
  const database = await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(storageKey() + ':handles', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('handles')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('handles', mode)
      const request = operation(transaction.objectStore('handles'))
      transaction.oncomplete = () => resolve(request?.result)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error || new Error('Recent document storage was cancelled.'))
    })
  } finally { database.close() }
}

async function localRequest (operation, body) {
  const response = await fetch(`/api/node/documents/${operation}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  })
  const result = await response.json()
  if (!response.ok || result.ok !== true) throw new Error(result.error || 'Could not access the node document.')
  return result
}

async function permit (handle, mode) {
  if (!handle.queryPermission) return
  if (await handle.queryPermission({ mode }) === 'granted') return
  if (await handle.requestPermission({ mode }) !== 'granted') throw new Error('File access was not granted. Open the document again to choose its file.')
}

export default {
  async sameFile (left, right) {
    if (left.path && right.path) return left.path.replace(/\\/g, '/').toLowerCase() === right.path.replace(/\\/g, '/').toLowerCase()
    return Boolean(left.handle && right.handle && await left.handle.isSameEntry(right.handle))
  },

  async read (location) {
    if (location.handle) {
      await permit(location.handle, 'read')
      const file = await location.handle.getFile()
      if (file.size > 32 * 1024 * 1024) throw new Error('Node documents must be smaller than 32 MB.')
      return { text: await file.text(), location: { ...location, name: file.name, revision: `${file.lastModified}:${file.size}` } }
    }
    if (!location.path) throw new Error('File access is unavailable. Use Open to choose this document again.')
    const result = await localRequest('read', { path: location.path })
    return { text: result.text, location: { path: result.path, name: result.name, revision: result.revision } }
  },

  async write (location, text) {
    if (location.handle) {
      await permit(location.handle, 'readwrite')
      const file = await location.handle.getFile()
      if (location.revision && location.revision !== `${file.lastModified}:${file.size}`) {
        throw new Error('The file changed on disk. Use Save As to preserve both versions.')
      }
      const writable = await location.handle.createWritable()
      try { await writable.write(text); await writable.close() } catch (error) { await writable.abort().catch(() => {}); throw error }
      const saved = await location.handle.getFile()
      return { ...location, name: saved.name, revision: `${saved.lastModified}:${saved.size}` }
    }
    const result = await localRequest('write', { path: location.path, text, revision: location.revision })
    return { path: result.path, name: result.name, revision: result.revision }
  },

  async loadRecent () {
    const stored = JSON.parse(window.localStorage.getItem(storageKey()) || '[]')
    if (!Array.isArray(stored)) return []
    return Promise.all(stored.slice(0, 20).map(async entry => ({
      ...entry, handle: entry.hasHandle ? await handleStore('readonly', store => store.get(entry.id)).catch(() => null) : null
    })))
  },

  async saveRecent (entries) {
    await handleStore('readwrite', store => {
      store.clear()
      entries.forEach(entry => { if (entry.handle) store.put(entry.handle, entry.id) })
    })
    window.localStorage.setItem(storageKey(), JSON.stringify(entries.map(entry => ({
      id: entry.id, name: entry.name, path: entry.path || '', hasHandle: Boolean(entry.handle), openedAt: entry.openedAt
    }))))
  }
}
