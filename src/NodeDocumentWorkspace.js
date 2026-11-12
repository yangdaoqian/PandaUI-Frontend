import browserCrypto from '../public/editor/src/BrowserCrypto'

function clone (value) { return JSON.parse(JSON.stringify(value)) }

export function parseNodeDocument (text) {
  const data = JSON.parse(text)
  if (!data || !Array.isArray(data.nodes) || !data.nodes.every(node => node && typeof node.type === 'string')) {
    throw new Error('The file is not a PandaUI node document.')
  }
  return data
}

export default class NodeDocumentWorkspace {
  constructor ({ getBridge, files, onChange, onClosed = () => {}, createId = () => browserCrypto.randomUUID() }) {
    this.getBridge = getBridge
    this.files = files
    this.onChange = onChange
    this.onClosed = onClosed
    this.createId = createId
    this.documents = []
    this.recent = []
    this.activeId = null
    this.busy = false
    this.message = ''
    this.error = false
    this.untitled = 0
  }

  get active () { return this.documents.find(document => document.id === this.activeId) }

  publish () {
    this.onChange({
      activeId: this.activeId,
      busy: this.busy,
      message: this.message,
      error: this.error,
      documents: this.documents.map(document => ({ id: document.id, name: document.name, path: document.location?.path || document.location?.name || '', dirty: document.dirty })),
      recent: this.recent.map(entry => ({ id: entry.id, name: entry.name, path: entry.path || entry.name }))
    })
  }

  async initialize () {
    if (this.active) return
    const bridge = this.getBridge()
    if (!bridge) return
    const snapshot = clone(bridge.capture())
    const document = this.makeDocument(snapshot, `Untitled ${++this.untitled}`)
    document.id = bridge.id
    document.savedText = JSON.stringify(snapshot.graph)
    this.documents.push(document)
    this.activeId = document.id
    this.publish()
    try { this.recent = await this.files.loadRecent() } catch (error) { this.message = `Recent documents unavailable: ${error.message}` }
    this.publish()
  }

  makeDocument (snapshot, name, location = null, savedText = null) {
    return { id: this.createId(), snapshot, name, location, savedText, savedEditToken: snapshot.editToken, dirty: false }
  }

  markChanged (editToken) {
    if (!this.active || this.busy) return
    this.active.dirty = !editToken || editToken !== this.active.savedEditToken
    this.publish()
  }

  capture () {
    if (!this.active || this.busy) return
    this.active.snapshot = clone(this.getBridge().capture())
    this.active.dirty = JSON.stringify(this.active.snapshot.graph) !== this.active.savedText
    if (!this.active.dirty) this.active.savedEditToken = this.active.snapshot.editToken
    this.publish()
  }

  async run (operation) {
    if (this.busy) return false
    this.capture()
    this.busy = true
    this.message = ''
    this.error = false
    this.publish()
    try {
      await operation()
      return true
    } catch (error) {
      this.error = error.name !== 'AbortError'
      this.message = this.error ? error.message : 'Cancelled'
      return false
    } finally {
      this.busy = false
      this.capture()
      this.publish()
    }
  }

  async activate (document) {
    await this.getBridge().activate(document.id, clone(document.snapshot))
    this.activeId = document.id
    document.snapshot = clone(this.getBridge().capture())
  }

  switchTo (id) {
    if (id === this.activeId) return Promise.resolve(true)
    return this.run(async () => {
      const document = this.documents.find(candidate => candidate.id === id)
      if (!document) throw new Error('The node document is no longer open.')
      await this.activate(document)
    })
  }

  newDocument () {
    return this.run(async () => {
      const snapshot = { graph: { format: 'PandaUI.NodeDocument', version: 1, nodes: [], links: [] }, stepMode: true }
      const document = this.makeDocument(snapshot, `Untitled ${++this.untitled}`)
      await this.activate(document)
      this.documents.push(document)
      document.savedText = JSON.stringify(document.snapshot.graph)
    })
  }

  open (chooseFile) {
    return this.run(async () => {
      const file = await chooseFile()
      if (!file) return
      const data = parseNodeDocument(file.text)
      for (const document of this.documents) {
        if (document.location && await this.files.sameFile(document.location, file.location)) {
          if (document.id !== this.activeId) await this.activate(document)
          await this.remember(document)
          return
        }
      }
      const document = this.makeDocument({ graph: data, stepMode: true }, file.location.name, file.location, JSON.stringify(data))
      await this.activate(document)
      this.documents.push(document)
      await this.remember(document)
      this.message = `Opened ${document.name}`
    })
  }

  openRecent (id) {
    const entry = this.recent.find(candidate => candidate.id === id)
    return this.open(async () => {
      if (!entry) throw new Error('Recent document is unavailable.')
      return this.files.read(entry)
    })
  }

  openRemote (documentId, snapshot, name = documentId) {
    return this.run(async () => {
      const id = String(documentId)
      if (!snapshot || !snapshot.graph) throw new Error('The backend document snapshot is invalid.')
      let document = this.documents.find(candidate => candidate.id === id)
      if (document && document.dirty) throw new Error('Save or discard the current backend document before reopening it.')
      if (!document) {
        document = this.makeDocument({ graph: clone(snapshot.graph), stepMode: true }, name)
        document.id = id
        this.documents.push(document)
      } else {
        document.snapshot = { graph: clone(snapshot.graph), stepMode: true }
        document.name = name || document.name
      }
      document.savedText = JSON.stringify(document.snapshot.graph)
      document.dirty = false
      await this.activate(document)
      document.savedText = JSON.stringify(document.snapshot.graph)
      document.dirty = false
    })
  }

  forgetRecent (id) {
    return this.run(async () => {
      const recent = this.recent.filter(entry => entry.id !== id)
      await this.files.saveRecent(recent)
      this.recent = recent
    })
  }

  save (chooseLocation, saveAs = false) {
    return this.run(async () => {
      const document = this.active
      if (!document) throw new Error('No node document is active.')
      const location = !saveAs && document.location ? document.location : await chooseLocation(document)
      if (!location) return
      for (const other of this.documents) {
        if (other !== document && other.location && await this.files.sameFile(other.location, location)) {
          throw new Error('This file is open in another node document. Switch to that document or choose another file.')
        }
      }
      const text = JSON.stringify(document.snapshot.graph)
      document.location = await this.files.write(location, text)
      document.name = document.location.name
      document.savedText = text
      document.dirty = false
      await this.remember(document)
      this.message = `Saved ${document.name}`
    })
  }

  async remember (document) {
    let previous = null
    for (const entry of this.recent) {
      if (await this.files.sameFile(entry, document.location)) { previous = entry; break }
    }
    const entry = { ...document.location, id: previous?.id || this.createId(), name: document.name, openedAt: Date.now() }
    this.recent = [entry, ...this.recent.filter(candidate => candidate.id !== entry.id)].slice(0, 20)
    try { await this.files.saveRecent(this.recent) } catch (error) { this.message = `File is ready; recent list could not be stored: ${error.message}` }
  }

  close (id, discard = false) {
    return this.run(async () => {
      const document = this.documents.find(candidate => candidate.id === id)
      if (!document) return
      if (document.dirty && !discard) throw new Error('Save this document or choose Discard before closing.')
      if (id === this.activeId) {
        let next = this.documents.find(candidate => candidate.id !== id)
        if (!next) {
          next = this.makeDocument({ graph: { nodes: [], links: [] }, stepMode: true }, `Untitled ${++this.untitled}`)
          await this.activate(next)
          next.savedText = JSON.stringify(next.snapshot.graph)
          this.documents.push(next)
        } else await this.activate(next)
      }
      this.documents = this.documents.filter(candidate => candidate.id !== id)
      this.onClosed(id)
    })
  }
}
