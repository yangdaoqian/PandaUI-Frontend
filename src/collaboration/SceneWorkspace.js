import * as THREE from 'three'
import browserCrypto from '../../public/editor/src/BrowserCrypto'
import { encodeSceneDisplay, decodeSceneDisplay, sceneDisplayReady, disposeSceneDisplay, displaySignature, applyDisplayMaterials } from './SceneDisplayPacket'
import { applySharedDocumentVisibility, sharedObjectSourceVisible, setDocumentItemVisible } from '../GeometryDocumentViewState'
import { ownsWorkspaceDocument, workspaceObjectLoaded } from '../DocumentHierarchy'
import FrontendGeometryPublisher from './FrontendGeometryPublisher'
import { sceneRequest, downloadSceneAsset, retryableSceneError } from './SceneRequest'
import { runDisplayTasks } from './DisplayTaskPool'
import { groupDisplayDownloads, readDisplayGroup, TARGET_BYTES, MAX_ITEMS, encodeDisplayPack } from './DisplayPackTransfer'
import { localDocumentSummary } from '../storage/LocalDocumentArchive'

export default class SceneWorkspace {
  constructor (app, changed) {
    this.app = app
    this.changed = changed
    this.state = { documents: [], openedPrivateDocumentIds: [], publicDocumentId: '', privateDocumentId: '', ownerId: '', connected: false, busy: false, error: '' }
    this.local = new Map()
    this.remote = new Map()
    this.objects = new Map()
    this.group = new THREE.Group()
    this.group.userData.sharedScene = true
    this.group.name = 'Shared document'
    this.disposed = false
    this.generation = 0
    this.sequence = -1
    this.requests = new Set()
    this.nativeRegistrations = new Map()
    this.deletedDocuments = new Set()
    this.deletedSourceRoots = new WeakSet()
    this.displayRetries = new Map()
    this.uploadFailures = 0
    this.localSummaries = new WeakMap()
    this.onSceneChanged = () => {
      this.schedule()
      if (!this.localNotifyTimer) {
        this.localNotifyTimer = setTimeout(() => {
          this.localNotifyTimer = null
          if (!this.disposed) { this.localSummaries = new WeakMap(); this.notify() }
        }, 250)
      }
    }
    this.onDocumentViewChanged = () => this.notify()
    this.onBackendMode = () => {
      if (window.PandaUIBackendMode === 'local') {
        this.publicationAbort?.abort()
        this.displayReconcileAbort?.abort()
        this.pendingSnapshot = null
        clearTimeout(this.timer); clearTimeout(this.reconnectTimer); clearTimeout(this.displayRetryTimer)
        this.timer = null
        const socket = this.socket
        this.socket = null
        socket?.close()
        this.requests.forEach(controller => controller.abort())
        this.state.connected = false
        this.state.localMode = true
        this.state.error = ''
        this.notify()
      } else {
        this.state.localMode = false
        this.initialize().then(() => { if (this.state.publicDocumentId) this.connect() })
      }
    }
    window.addEventListener('pandaui-scene-content-changed', this.onSceneChanged)
    window.addEventListener('pandaui-document-view-changed', this.onDocumentViewChanged)
    window.addEventListener('pandaui-backend-mode', this.onBackendMode)
    window.PandaUISceneWorkspace = this
  }

  notify (refreshLocal = false) {
    if (refreshLocal) this.localSummaries = new WeakMap()
    const objectCounts = {}
    this.objects.forEach(object => { objectCounts[object.privateDocumentId] = (objectCounts[object.privateDocumentId] || 0) + 1 })
    const sceneObjects = [...this.objects.values()].filter(object => workspaceObjectLoaded(object, this.state))
    const localIds = new Set([...this.local.values()].filter(entry => entry.root?.parent).map(entry => entry.objectId))
    const shared = sceneObjects.filter(object => !localIds.has(object.objectId))
    const loaded = shared.filter(object => this.remote.get(object.objectId)?.assetId === object.assetId)
    const shown = loaded.filter(object => {
      for (let root = this.remote.get(object.objectId).root; root; root = root.parent) if (!root.visible) return false
      return true
    }).length
    const displayLoading = { total: shared.length, loaded: loaded.length, shown, hidden: loaded.length - shown, sourceHidden: shared.filter(object => object.visible === false).length, failed: this.displayRetries.size }
    const localDocuments = this.app.modelDocuments().filter(doc => doc.localFileLoaded && !doc.disposed).map(doc => {
      let summary = this.localSummaries.get(doc)
      if (!summary || summary.workspaceDocumentId !== doc.workspaceDocumentId || summary.savedAt !== doc.localSavedAt) { summary = localDocumentSummary(doc); this.localSummaries.set(doc, summary) }
      return summary
    })
    if (!localDocuments.some(doc => doc.documentId === this.state.localPrivateDocumentId)) this.state.localPrivateDocumentId = localDocuments.at(-1)?.documentId || ''
    this.changed({ ...this.state, objectCounts, sceneObjects, displayLoading, localDocuments, localFolderBusy: !!this.app.localFolderBusy })
  }
  sceneRoot (objectId) { return [...this.local.values()].find(entry => entry.objectId === objectId)?.root || this.remote.get(objectId)?.root }
  renderDocuments () {
    return [...this.remote.values()].map(entry => {
      if (!entry.renderDocument) {
        const resources = new Set()
        resources.push = (...items) => items.forEach(item => resources.add(item))
        resources.releaseGeometry = geometry => { resources.delete(geometry); geometry.dispose() }
        entry.renderDocument = { documentId: this.state.publicDocumentId, name: entry.root.name || 'Shared object', three: { middleground: entry.root }, disposableResources: resources }
      }
      return entry.renderDocument
    })
  }
  async request (url, options = {}) {
    // Fetch cannot report upload progress. Do not impose a total duration on
    // large display/archive uploads; response-body idle detection still applies.
    const uploading = options.method === 'POST' && /^\/api\/collaboration\/(assets|display-packs|geometry-archives)\?/.test(url)
    return sceneRequest(url, options, { requests: this.requests, ...(uploading ? { headerTimeoutMs: 0 } : {}) })
  }

  async downloadDisplay (assetId, signal, packed) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    let root
    const cancel = () => { if (root) disposeSceneDisplay(root) }
    controller.signal.addEventListener('abort', cancel, { once: true })
    this.requests.add(controller)
    try {
      if (packed?.error) throw Object.assign(new Error(packed.error), { status: packed.status, code: packed.code })
      const shared = packed?.data?.byteLength > 0
      const buffer = shared ? packed.data : await downloadSceneAsset('/api/collaboration/assets/' + assetId, { signal: controller.signal }, { requests: this.requests })
      root = decodeSceneDisplay(buffer, { shareBuffer: shared && !packed.consumed })
      if (shared) packed.consumed = true
      await sceneDisplayReady(root)
      if (controller.signal.aborted) throw Object.assign(new Error('Display download cancelled.'), { name: 'AbortError' })
      return root
    } catch (error) { if (root) disposeSceneDisplay(root); throw error } finally { signal?.removeEventListener('abort', abort); controller.signal.removeEventListener('abort', cancel); this.requests.delete(controller) }
  }

  async updateLocalDisplay (entry, object, generation, signal) {
    const root = await this.downloadDisplay(object.assetId, signal)
    if (this.disposed || generation !== this.generation || this.objects.get(object.objectId)?.assetId !== object.assetId || entry.sending || displaySignature(entry.root) !== entry.signature) { disposeSceneDisplay(root); return }
    // Keep the source placement and its original geometry identity. Replace only
    // its presentation; native/raw geometry remains owned by the source model.
    const model = this.app.modelDocuments().find(doc => doc.documentId === entry.root.userData.localDocumentId)
    const previousGeometry = new Set()
    entry.root.traverse(part => {
      model?.materializeRenderObject?.(part)
      model?.disposableResources?.untrack?.(part)
      if (part.geometry) previousGeometry.add(part.geometry)
    })
    for (const child of [...entry.root.children]) entry.root.remove(child)
    for (const child of [...root.children]) entry.root.add(child)
    if (root.geometry) entry.root.geometry = root.geometry
    if (root.material) entry.root.material = root.material
    if (root.userData.displayMaterials) entry.root.userData.displayMaterials = root.userData.displayMaterials
    if (entry.displayOverride) disposeSceneDisplay(entry.displayOverride)
    entry.displayOverride = root
    if (model?.disposableResources && !entry.overrideCleanup) {
      entry.overrideCleanup = { dispose: () => { if (entry.displayOverride) disposeSceneDisplay(entry.displayOverride); entry.displayOverride = null } }
      model.disposableResources.push(entry.overrideCleanup)
    }
    previousGeometry.forEach(geometry => model?.disposableResources?.releaseGeometry?.(geometry))
    entry.assetId = object.assetId
    entry.root.traverse(part => model?.invalidateRenderObject?.(part))
    entry.signature = displaySignature(entry.root)
  }

  async initialize () {
    if (window.PandaUIBackendMode === 'local') { this.onBackendMode(); return }
    try {
      this.state.error = ''
      const session = await this.request('/api/collaboration/session')
      this.state.ownerId = session.ownerId
      this.state.userId = session.userId
      this.state.displayPacks = session.displayPacks === 1
      await this.refresh()
      // A new client starts with an empty scene. Public documents are loaded
      // only after the user explicitly selects one in the document manager.
      this.notify()
    } catch (error) { this.state.error = error.message; this.notify() }
  }

  async refresh () {
    const result = await this.request('/api/collaboration/documents')
    this.state.documents = result.documents
    if (this.state.publicDocumentId && !result.documents.some(document => document.documentId === this.state.publicDocumentId)) await this.selectPublic('')
    this.updateActivePrivateDocument()
    const role = this.publicRole()
    if (role === 'viewer') { this.state.privateDocumentId = ''; window.PandaUIPrivateDocumentId = null }
    for (const [objectId, entry] of this.remote) {
      const object = this.objects.get(objectId)
      entry.root.userData.readOnly = !this.canEditObject(object)
      if (object) entry.root.userData.sharedObject = this.sharedReference(object)
    }
    for (const entry of this.local.values()) {
      if (!entry.root || entry.publicDocumentId !== this.state.publicDocumentId) continue
      entry.root.userData.readOnly = role === 'viewer' || !role
      const object = this.objects.get(entry.objectId)
      if (object) entry.root.userData[object.nativeDocumentId ? 'sharedDocument' : 'sharedObject'] = this.sharedReference(object)
    }
    this.notify()
  }

  publicRole () { return this.state.documents.find(document => document.documentId === this.state.publicDocumentId)?.role }

  updateActivePrivateDocument () {
    this.state.openedPrivateDocumentIds = this.state.openedPrivateDocumentIds.filter(id => this.state.documents.some(document => document.documentId === id && !document.publishedAt && ownsWorkspaceDocument(document, this.state)))
    const opened = this.state.documents.filter(document => document.publicDocumentId === this.state.publicDocumentId && this.state.openedPrivateDocumentIds.includes(document.documentId))
    if (!opened.some(document => document.documentId === this.state.privateDocumentId)) this.state.privateDocumentId = opened[0]?.documentId || ''
    if (this.publicRole() === 'viewer') this.state.privateDocumentId = ''
    window.PandaUIPrivateDocumentId = this.state.privateDocumentId || null
  }

  queueReconcile () {
    this.pendingSnapshot = { documentId: this.state.publicDocumentId, objects: [...this.objects.values()] }
    if (!this.reconciling) this.reconcile()
  }

  openNativeDocument (entry) {
    if (entry && entry.publicDocumentId === this.state.publicDocumentId && !entry.publishedAt && ownsWorkspaceDocument(entry, this.state) && !this.state.openedPrivateDocumentIds.includes(entry.documentId)) this.selectPrivate(entry.documentId)
    return entry
  }

  canReferenceObject (object) {
    if (!object || !this.publicRole()) return false
    const document = this.state.documents.find(entry => entry.documentId === object.privateDocumentId)
    return object.publicationState === 'published' || Boolean(document?.publishedAt) || (object.canReference ?? ownsWorkspaceDocument(document || object, this.state))
  }

  canEditObject (object) {
    return this.publicRole() !== 'viewer' && this.canReferenceObject(object)
  }

  async registerNative (id) {
    if (this.deletedDocuments.has(id)) return null
    const existing = this.state.documents.find(entry => entry.nativeDocumentId === id)
    if (existing) return this.openNativeDocument(existing)
    if (this.nativeRegistrations.has(id)) return this.nativeRegistrations.get(id)
    const request = this.request('/api/collaboration/native-documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicDocumentId: this.state.publicDocumentId, nativeDocumentId: id })
    }).then(entry => {
      if (this.deletedDocuments.has(id)) return null
      this.state.documents = [...this.state.documents.filter(document => document.documentId !== entry.documentId), entry]
      this.openNativeDocument(entry)
      this.notify()
      return entry
    }).finally(() => this.nativeRegistrations.delete(id))
    this.nativeRegistrations.set(id, request)
    return request
  }

  async syncNativeDocuments () {
    if (!this.state.connected || this.publicRole() === 'viewer') return
    for (const model of this.app.modelDocuments()) {
      if (model.localFileLoaded) await this.registerFrontendDocument(model)
      else if (model.documentId && model.initialChunkTransferComplete === true) await this.registerNative(model.documentId)
    }
  }

  async registerFrontendDocument (model) {
    if (model.workspaceDocumentId || !this.state.publicDocumentId || this.deletedDocuments.has(model.documentId)) return
    const key = 'frontend:' + model.documentId
    if (this.nativeRegistrations.has(key)) return this.nativeRegistrations.get(key)
    const publicDocumentId = this.state.publicDocumentId
    // Only ownership/display metadata is registered here. Geometry was parsed
    // locally; there is no native geometry pool ID to invent or upload.
    model.workspaceRegistrationId ||= browserCrypto.randomUUID()
    const registration = this.createPrivate(model.name, publicDocumentId, model.workspaceRegistrationId).then(document => {
      model.workspaceDocumentId = document.documentId
      model.workspacePublicDocumentId = publicDocumentId
    }).finally(() => this.nativeRegistrations.delete(key))
    this.nativeRegistrations.set(key, registration)
    return registration
  }

  async move (payload) {
    if (this.state.busy) throw new Error('Another document operation is in progress.')
    for (const model of this.app.modelDocuments()) {
      if (![payload.privateDocumentId, payload.targetDocumentId].includes(model.documentId)) continue
      if (model.initialChunkTransferComplete === false || model.instanceQueue?.tasks.length || model.deferredChunkQueue?.length) throw new Error('Wait for display geometry to finish loading before moving objects.')
    }
    this.state.busy = true
    clearTimeout(this.timer)
    this.timer = null
    this.notify()
    try {
      await this.flush()
      return await this.operation('document.move', payload)
    } finally { this.state.busy = false; this.notify(); this.schedule() }
  }

  async createPrivate (name, publicDocumentId = this.state.publicDocumentId, documentId = browserCrypto.randomUUID()) {
    if (!publicDocumentId) throw new Error('Select a public document first.')
    const document = await this.request('/api/collaboration/private-documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicDocumentId, name, documentId })
    })
    await this.refresh()
    if (this.state.publicDocumentId === publicDocumentId) this.selectPrivate(document.documentId)
    return document
  }

  async createPublic (name) {
    const document = await this.request('/api/collaboration/public-documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    })
    await this.refresh()
    await this.selectPublic(document.documentId)
    return document
  }

  async saveDocument (id = this.state.privateDocumentId) {
    if (this.state.localMode || !this.state.connected) throw new Error('Connect to the backend to save a shared document.')
    if (this.state.busy) throw new Error('Another document operation is in progress.')
    if (this.app.modelDocuments().some(doc => doc.workspaceDocumentId === id && (doc.localImportInProgress || doc.remeshStream || doc.initialChunkTransferComplete === false || doc.instanceQueue?.tasks.length || doc.deferredChunkQueue?.length))) throw new Error('Wait for import / remeshing to finish before saving.')
    this.state.busy = true
    clearTimeout(this.timer)
    this.timer = null
    this.notify()
    try {
      await this.flush()
      await this.request('/api/collaboration/documents/' + encodeURIComponent(id) + '/save', { method: 'POST' })
      await this.refresh()
    } finally { this.state.busy = false; this.notify(); this.schedule() }
  }

  async clearUnsavedBeforeOpen () {
    if (this.state.localMode || !this.state.publicDocumentId || !this.state.ownerId || this.publicRole() === 'viewer') return
    if (this.state.busy) throw new Error('Another document operation is in progress.')
    this.state.busy = true
    clearTimeout(this.timer)
    this.timer = null
    this.notify()
    try {
      if (this.inFlight) await this.inFlight
      if (this.operationChain) await this.operationChain
      const result = await this.request('/api/collaboration/clear-unsaved', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicDocumentId: this.state.publicDocumentId })
      })
      for (const deletion of result.deleted) await this.receiveDeletion(deletion)
      const failures = result.deleted.flatMap(deletion => deletion.cleanupErrors || [])
      if (failures.length) throw new Error('Temporary cache cleanup is incomplete: ' + failures.join('; '))
      // Closing a local model is not deleting its saved shared objects.
      for (const entry of this.local.values()) entry.overrideCleanup?.dispose()
      this.local.clear()
      this.state.openedPrivateDocumentIds = []
      this.state.privateDocumentId = ''
      window.PandaUIPrivateDocumentId = null
      await this.refresh()
      this.queueReconcile()
    } finally { this.state.busy = false; this.notify() }
  }

  async deleteDocument (id) {
    if (this.state.busy) throw new Error('Another document operation is in progress.')
    this.state.busy = true
    clearTimeout(this.timer)
    this.timer = null
    this.notify()
    try {
      if (this.inFlight) await this.inFlight
      const result = await this.request('/api/collaboration/documents/' + encodeURIComponent(id), { method: 'DELETE' })
      await this.receiveDeletion(result)
      if (result.cleanupErrors?.length) this.state.error = 'Document deleted. Resource cleanup will be retried: ' + result.cleanupErrors.join('; ')
    } finally { this.state.busy = false; this.notify(); this.schedule() }
  }

  async deleteObject (root) {
    if (!root?.parent || this.disposed) return false
    for (let object = root; object; object = object.parent) {
      if (object.userData?.readOnly || object.userData?.nodePreview || object.userData?.nonselectable) throw new Error('This object cannot be deleted by this workspace.')
    }
    if (this.state.busy) throw new Error('Another document operation is in progress.')
    const model = this.app.modelDocuments().find(document => document.documentId === root.userData.documentId)
    if (model && (model.initialChunkTransferComplete === false || model.instanceQueue?.tasks.length || model.deferredChunkQueue?.length)) throw new Error('Wait for display geometry to finish loading before deleting objects.')
    const pipeline = this.app.getDisplayPipeline()
    if (!this.state.publicDocumentId && !root.userData.sharedObject && ![...this.local.values()].some(entry => entry.root === root)) return pipeline.removeSharedSource(root)
    if (!this.state.connected) throw new Error('Reconnect to the shared document before deleting objects.')
    this.state.busy = true
    clearTimeout(this.timer)
    this.timer = null
    this.notify()
    try {
      await this.flush()
      const entry = [...this.local.values()].find(entry => entry.root === root)
      const objectId = entry?.objectId || root.userData.sharedObject?.objectId
      const object = this.objects.get(objectId)
      if (!object) throw new Error('The scene object has not finished synchronizing. Try again shortly.')
      await this.operation('object.remove', { objectId, privateDocumentId: object.privateDocumentId, expectedRevision: object.revision })
      return true
    } finally { this.state.busy = false; this.notify(); this.schedule() }
  }

  removeLocalObject (objectId) {
    const pipeline = this.app.getDisplayPipeline()
    for (const [key, entry] of this.local) {
      if (entry.objectId !== objectId) continue
      if (entry.root) {
        this.deletedSourceRoots.add(entry.root)
        pipeline.removeSharedSource(entry.root)
      }
      entry.overrideCleanup?.dispose()
      this.local.delete(key)
    }
  }

  receiveDeletion (message) {
    if (message.deletedDocumentIds.every(id => this.deletedDocuments.has(id))) return this.deletionTask || Promise.resolve()
    const ids = new Set(message.deletedDocumentIds)
    message.nativeDocumentIds.forEach(id => ids.add(id))
    ids.forEach(id => this.deletedDocuments.add(id))
    const removed = new Set(message.removedIds)
    const pipeline = this.app.getDisplayPipeline()
    for (const [key, entry] of this.local) {
      if (!ids.has(entry.privateDocumentId) && !removed.has(entry.objectId)) continue
      if (entry.root) {
        this.deletedSourceRoots.add(entry.root)
        if (pipeline.getSelectedObjectRoot() === entry.root) pipeline.setSelectedObject(null)
        pipeline.removeSharedSource(entry.root)
      }
      entry.overrideCleanup?.dispose()
      this.local.delete(key)
    }
    for (const objectId of removed) {
      this.objects.delete(objectId)
      const entry = this.remote.get(objectId)
      if (entry) this.releaseRemote(entry.root)
      this.remote.delete(objectId)
    }
    const frontendIds = this.app.modelDocuments().filter(model => ids.has(model.workspaceDocumentId)).map(model => model.documentId)
    this.app.removeSceneDocuments([...message.nativeDocumentIds, ...frontendIds])
    this.state.documents = this.state.documents.filter(document => !ids.has(document.documentId))
    if (ids.has(this.state.privateDocumentId)) { this.state.privateDocumentId = ''; window.PandaUIPrivateDocumentId = null }
    if (message.documentId === this.state.publicDocumentId) {
      this.generation++
      this.displayReconcileAbort?.abort()
      this.pendingSnapshot = null
      this.sequence = message.sequence
      if (!message.publicDeleted) this.receive({ type: 'scene-snapshot', documentId: message.documentId, sequence: message.sequence, objects: [...this.objects.values()] })
    }
    this.notify()
    window.dispatchEvent(new CustomEvent('pandaui-document-deleted', { detail: message }))
    this.deletionTask = (this.deletionTask || Promise.resolve()).catch(() => {}).then(async () => {
      if (this.inFlight) await this.inFlight.catch(() => {})
      if (message.publicDeleted && this.state.publicDocumentId === message.documentId) await this.selectPublic('')
      await this.refresh()
      pipeline.setDirtyFlag()
    })
    return this.deletionTask
  }

  selectPrivate (id) {
    const document = this.state.documents.find(entry => entry.documentId === id)
    if (!document || document.publishedAt || !ownsWorkspaceDocument(document, this.state) || document.publicDocumentId !== this.state.publicDocumentId) throw new Error('Select one of your private documents in this public document.')
    if (!this.state.openedPrivateDocumentIds.includes(id)) this.state.openedPrivateDocumentIds = [...this.state.openedPrivateDocumentIds, id]
    this.state.privateDocumentId = id
    window.PandaUIPrivateDocumentId = id
    this.queueReconcile()
    this.notify()
    this.schedule()
  }

  selectLocalPrivate (id) {
    const model = this.app.modelDocuments().find(doc => doc.documentId === id && doc.localFileLoaded)
    if (!model) throw new Error('Select an opened local document.')
    this.state.localPrivateDocumentId = id
    if (model.workspaceDocumentId && model.workspacePublicDocumentId === this.state.publicDocumentId) {
      this.state.privateDocumentId = model.workspaceDocumentId
      window.PandaUIPrivateDocumentId = model.workspaceDocumentId
    }
    this.notify()
  }

  async closeLocalPrivate (id) {
    if (this.state.busy || this.app.localFolderBusy) throw new Error('Wait for the current document operation to finish.')
    const model = this.app.modelDocuments().find(doc => doc.documentId === id && doc.localFileLoaded)
    if (!model) return
    this.state.busy = true
    clearTimeout(this.timer)
    try {
      if (this.inFlight) await this.inFlight
      // Leaving a local document is not deletion of its shared objects.
      for (const [key, entry] of this.local) {
        if (entry.root?.userData.localDocumentId === id) {
          entry.overrideCleanup?.dispose()
          if (entry.displayOverride) disposeSceneDisplay(entry.displayOverride)
          this.local.delete(key)
        }
      }
      this.state.openedPrivateDocumentIds = this.state.openedPrivateDocumentIds.filter(value => value !== model.workspaceDocumentId)
      if (this.state.privateDocumentId === model.workspaceDocumentId) { this.state.privateDocumentId = ''; window.PandaUIPrivateDocumentId = null }
      this.app.removeSceneDocuments([id])
      this.queueReconcile()
    } finally { this.state.busy = false; this.notify(true); this.schedule() }
  }

  async selectPublic (id) {
    this.publicationAbort?.abort()
    if (id && !this.state.documents.some(document => document.kind === 'public' && document.documentId === id)) throw new Error('Select an existing public document.')
    if (this.inFlight) await this.inFlight
    const previous = this.socket
    this.socket = null
    previous?.close()
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.timer)
    clearTimeout(this.displayRetryTimer)
    this.displayRetries.clear()
    this.timer = null
    this.generation++
    this.displayReconcileAbort?.abort()
    this.state.connected = false
    this.state.publicDocumentId = id
    this.state.privateDocumentId = ''
    this.state.error = ''
    window.PandaUIPrivateDocumentId = null
    this.sequence = -1
    this.pendingSnapshot = null
    this.objects.clear()
    this.remote.forEach(entry => this.releaseRemote(entry.root))
    this.remote.clear()
    this.local.forEach(entry => {
      if (entry.publicDocumentId === id && workspaceObjectLoaded(entry, this.state)) applySharedDocumentVisibility(entry.root, entry.visible)
      else entry.root.visible = false
    })
    sessionStorage.setItem('pandaui-public-document-v2', id)
    if (!id) {
      this.notify()
      this.app.getDisplayPipeline().setDirtyFlag()
      return
    }
    this.updateActivePrivateDocument()
    this.app.getDisplayPipeline().attachSharedScene(this.group)
    this.connect()
    this.notify()
    this.app.getDisplayPipeline().setDirtyFlag()
  }

  connect () {
    clearTimeout(this.reconnectTimer)
    const previous = this.socket
    this.socket = null
    previous?.close()
    if (this.disposed || window.PandaUIBackendMode === 'local' || !this.state.publicDocumentId) return
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(protocol + '//' + window.location.host + '/api/collaboration?clientId=' + encodeURIComponent(window.PandaUILoginClientId))
    this.socket = socket
    socket.onopen = () => socket.send(JSON.stringify({ type: 'open', version: 3, documentId: this.state.publicDocumentId, sessionToken: window.PandaUIWorkspaceToken, csrfToken: window.PandaUIAuth?.csrfToken, clientId: window.PandaUILoginClientId, clientOrigin: window.location.origin }))
    socket.onmessage = event => {
      if (this.socket !== socket) return
      const message = JSON.parse(event.data)
      if (message.type === 'scene-snapshot' || message.type === 'scene-update') {
        this.state.connected = true
        this.receive(message)
        this.schedule()
      } else if (message.type === 'scene-documents-deleted') this.receiveDeletion(message).catch(error => { this.state.error = error.message; this.notify() })
      else if (message.type === 'scene-documents-changed') this.refresh().catch(error => { this.state.error = error.message; this.notify() })
      else if (message.type === 'error') { this.state.error = message.message; this.notify() }
    }
    socket.onclose = event => {
      if (this.socket !== socket || this.disposed) return
      this.state.connected = false
      this.notify()
      if (event.code === 1008 && event.reason === 'Session replaced') {
        window.dispatchEvent(new CustomEvent('pandaui-login-conflict', { detail: 'This account was signed in from another window. This window has been signed out.' }))
        return
      }
      if (event.code === 1008 && /^(Session ended|Session expired)$/.test(event.reason || '')) {
        window.dispatchEvent(new CustomEvent('pandaui-auth-required'))
        return
      }
      if (event.code === 1008) {
        this.refresh().catch(error => { this.state.error = error.message; this.notify() })
        return
      }
      this.reconnectTimer = setTimeout(() => this.connect(), 1500)
    }
  }

  receive (snapshot) {
    if (snapshot.documentId !== this.state.publicDocumentId || snapshot.sequence < this.sequence) return
    if (snapshot.type === 'scene-update' && snapshot.sequence === this.sequence) return
    this.sequence = snapshot.sequence
    if (snapshot.move) {
      this.app.moveDocumentObjects(snapshot.move)
      const ids = new Set(snapshot.move.objects.map(item => item.geometryId))
      for (const entry of this.local.values()) if (ids.has(entry.root?.userData.geometryId) && entry.root?.userData.documentId === snapshot.move.targetDocumentId) entry.privateDocumentId = snapshot.move.targetDocumentId
      window.dispatchEvent(new CustomEvent('pandaui-document-moved', { detail: snapshot.move }))
    }
    if (snapshot.type === 'scene-snapshot') this.objects = new Map(snapshot.objects.map(object => [object.objectId, object]))
    else {
      for (const id of snapshot.removedIds || []) {
        this.objects.delete(id)
        this.removeLocalObject(id)
      }
      for (const object of snapshot.objects) this.objects.set(object.objectId, object)
    }
    if (snapshot.privateDocuments) this.state.documents = [...this.state.documents.filter(document => document.publicDocumentId !== snapshot.documentId), ...snapshot.privateDocuments]
    this.updateActivePrivateDocument()
    if (this.pendingSnapshot) this.pendingSnapshot = { ...snapshot, type: 'scene-snapshot', objects: [...this.objects.values()] }
    else this.pendingSnapshot = snapshot
    this.notify()
    if (!this.reconciling) this.reconcile()
  }

  async reconcile () {
    if (this.reconciling) return
    this.reconciling = true
    let sceneDirty = false, lastRefresh = performance.now()
    const refresh = (force = false) => {
      if (sceneDirty && (force || performance.now() - lastRefresh >= 100)) {
        sceneDirty = false; lastRefresh = performance.now()
        this.app.getDisplayPipeline().setDirtyFlag(true, false)
      }
    }
    try {
      while (this.pendingSnapshot && !this.disposed) {
        const snapshot = this.pendingSnapshot
        this.pendingSnapshot = null
        const generation = this.generation
        const controller = new AbortController()
        this.displayReconcileAbort = controller
        const localById = new Map([...this.local.values()].filter(entry => entry.root?.parent).map(entry => [entry.objectId, entry]))
        for (const [id, entry] of this.remote) if (!workspaceObjectLoaded(this.objects.get(id), this.state)) { this.releaseRemote(entry.root); this.remote.delete(id); sceneDirty = true }
        const objects = snapshot.objects.slice().sort((a, b) => Number(a.visible === false) - Number(b.visible === false))
        const concurrency = typeof navigator !== 'undefined' && navigator.deviceMemory && navigator.deviceMemory <= 4 ? 2 : 4
        const processObject = async (requested, packed) => {
          if (generation !== this.generation || this.disposed) return
          let object = this.objects.get(requested.objectId)
          if (!workspaceObjectLoaded(object, this.state)) return
          const retry = this.displayRetries.get(object.objectId)
          if (retry?.assetId === object.assetId && retry.revision === object.revision && retry.next > Date.now()) return
          try {
            const indexedLocal = localById.get(object.objectId)
            const local = indexedLocal?.root?.parent ? indexedLocal : null
            if (local) {
              local.privateDocumentId = object.privateDocumentId
              local.revision = object.revision
              local.root.userData[object.nativeDocumentId ? 'sharedDocument' : 'sharedObject'] = this.sharedReference(object, snapshot.documentId)
              local.root.userData.readOnly = !this.canEditObject(object)
              if (!local.sending && local.assetId !== object.assetId && displaySignature(local.root) === local.signature) await this.updateLocalDisplay(local, object, generation, controller.signal)
              if (generation !== this.generation || this.disposed || !this.objects.has(object.objectId)) return
              if (!local.sending && local.sentMatrix === this.matrixOf(local.root).join(',')) {
                this.applyMatrix(local.root, object.matrix)
                local.sentMatrix = object.matrix.join(',')
                if (displaySignature(local.root) === local.signature && sharedObjectSourceVisible(local.root) === local.visible) {
                  applyDisplayMaterials(local.root, object.materials)
                  applySharedDocumentVisibility(local.root, object.visible)
                  local.visible = object.visible
                  local.signature = displaySignature(local.root)
                }
              }
              sceneDirty = true
              this.resolveDisplayFailure(object.objectId)
              return
            }
            let entry = this.remote.get(object.objectId)
            if (entry?.assetId !== object.assetId) {
              const root = await this.downloadDisplay(object.assetId, controller.signal, object.assetId === requested.assetId ? packed : null)
              if (this.disposed || generation !== this.generation || this.objects.get(object.objectId)?.assetId !== object.assetId || !workspaceObjectLoaded(this.objects.get(object.objectId), this.state)) { disposeSceneDisplay(root); return }
              object = this.objects.get(object.objectId)
              if (entry) this.releaseRemote(entry.root)
              entry = { root, assetId: object.assetId }
              this.remote.set(object.objectId, entry)
              this.group.add(root)
            }
            entry.root.userData.sharedObject = this.sharedReference(object, snapshot.documentId)
            const wasReadOnly = entry.root.userData.readOnly
            entry.root.userData.readOnly = !this.canEditObject(object)
            const pipeline = this.app.getDisplayPipeline()
            if (wasReadOnly !== entry.root.userData.readOnly && pipeline.getSelectedObjectRoot() === entry.root) {
              pipeline.setSelectedObject(null)
              pipeline.setSelectedObject(entry.root)
            }
            const previousVisible = entry.root.visible
            applySharedDocumentVisibility(entry.root, object.visible)
            if (previousVisible !== entry.root.visible) sceneDirty = true
            this.resolveDisplayFailure(object.objectId)
            if (entry.appliedRevision === object.revision) return
            this.applyMatrix(entry.root, object.matrix)
            applyDisplayMaterials(entry.root, object.materials)
            entry.signature = displaySignature(entry.root)
            entry.sentMatrix = object.matrix.join(',')
            entry.visible = object.visible
            entry.appliedRevision = object.revision
            sceneDirty = true
            if (Date.now() - (this.displayProgressAt || 0) >= 250) { this.displayProgressAt = Date.now(); this.notify() }
          } catch (error) {
            if (error.name === 'AbortError') { controller.abort(); return }
            if (this.disposed || generation !== this.generation) return
            if (this.objects.get(object.objectId)?.assetId !== object.assetId || !workspaceObjectLoaded(this.objects.get(object.objectId), this.state)) return
            // One failed display must not block the rest of a shared document.
            const attempts = (retry?.assetId === object.assetId ? retry.attempts : 0) + 1
            this.displayRetries.set(object.objectId, { assetId: object.assetId, revision: object.revision, attempts, next: [401, 403, 404].includes(error.status) ? Infinity : Date.now() + Math.min(30000, 1000 * 2 ** Math.min(attempts - 1, 5)) })
            this.displayError = 'Shared display: ' + (object.name || object.objectId) + ': ' + error.message
            this.state.error = this.displayError
            this.notify()
          } finally { refresh() }
        }
        const groups = groupDisplayDownloads(objects, object => this.state.displayPacks && !localById.has(object.objectId) && this.remote.get(object.objectId)?.assetId !== object.assetId && workspaceObjectLoaded(object, this.state) && !(this.displayRetries.get(object.objectId)?.next > Date.now()))
        await runDisplayTasks(groups, async group => {
          let entries
          if (group.packed && !controller.signal.aborted) {
            try { entries = await readDisplayGroup(group, controller.signal, this.requests) } catch (error) {
              if (error.name === 'AbortError') return
              entries = new Map(group.map(object => [object.assetId, { error: error.message, status: error.status, code: error.code }]))
            }
          }
          await runDisplayTasks(group, object => processObject(object, entries?.get(object.assetId)), { concurrency: 1, signal: controller.signal })
        }, { concurrency, signal: controller.signal })
        refresh(true)
      }
    } catch (error) { if (!this.disposed && error.name !== 'AbortError') { this.state.error = error.message; this.notify() } } finally {
      this.displayReconcileAbort = null
      if (!this.disposed) refresh(true)
      this.reconciling = false
      this.scheduleDisplayRetry()
      if (!this.disposed) this.notify()
    }
  }

  resolveDisplayFailure (objectId) {
    this.displayRetries.delete(objectId)
    if (!this.displayRetries.size && this.displayError) {
      if (this.state.error === this.displayError) this.state.error = ''
      this.displayError = null
      this.notify()
    }
  }

  scheduleDisplayRetry () {
    clearTimeout(this.displayRetryTimer)
    for (const id of this.displayRetries.keys()) if (!workspaceObjectLoaded(this.objects.get(id), this.state)) this.displayRetries.delete(id)
    if (!this.displayRetries.size && this.displayError) {
      if (this.state.error === this.displayError) { this.state.error = ''; this.notify() }
      this.displayError = null
    }
    if (this.disposed || !this.state.connected) return
    let next = Infinity
    for (const retry of this.displayRetries.values()) next = Math.min(next, retry.next)
    if (!Number.isFinite(next)) return
    this.displayRetryTimer = setTimeout(() => {
      if (this.disposed || !this.state.connected) return
      const objects = [...this.displayRetries.keys()].map(id => this.objects.get(id)).filter(Boolean)
      this.pendingSnapshot = { documentId: this.state.publicDocumentId, objects: this.pendingSnapshot ? [...this.objects.values()] : objects }
      if (!this.reconciling) this.reconcile()
    }, Math.max(0, next - Date.now()))
  }

  retryDisplayDownloads () {
    this.displayRetries.clear()
    clearTimeout(this.displayRetryTimer)
    this.queueReconcile()
  }

  showAllSharedObjects () {
    // An explicit local view override. Preserve source visibility in the
    // sharedVisibility map, even for editable/published objects.
    const local = new Map([...this.local.values()].map(entry => [entry.objectId, entry.root]))
    const shown = new Set()
    for (const object of this.objects.values()) {
      if (!workspaceObjectLoaded(object, this.state)) continue
      setDocumentItemVisible({ objectId: object.objectId }, true)
      if (object.nativeDocumentId && object.geometryId) setDocumentItemVisible({ documentId: object.nativeDocumentId, geometryId: object.geometryId, poolGeneration: object.poolGeneration }, true)
      for (const documentId of [this.state.publicDocumentId, object.privateDocumentId, object.nativeDocumentId].filter(Boolean)) {
        for (const poolGeneration of new Set([null, object.poolGeneration])) {
          const reference = { documentId, poolGeneration }
          const paths = (object.layerPath || '').split('::').filter(Boolean)
          for (let depth = 0; depth <= paths.length; depth++) {
            const layerPath = paths.slice(0, depth).join('::')
            const key = JSON.stringify([documentId, poolGeneration, layerPath])
            if (shown.has(key)) continue
            shown.add(key)
            setDocumentItemVisible({ ...reference, layerPath }, true)
          }
        }
      }
      const root = local.get(object.objectId) || this.remote.get(object.objectId)?.root
      if (root) applySharedDocumentVisibility(root, object.visible)
    }
    this.app.getDisplayPipeline().setDirtyFlag(true, false)
    this.notify()
    window.dispatchEvent(new CustomEvent('pandaui-document-view-changed'))
  }

  matrixOf (root) { root.updateWorldMatrix(true, false); return root.matrixWorld.toArray() }
  sharedReference (object, publicDocumentId = this.state.publicDocumentId) {
    const canReference = this.canReferenceObject(object)
    return { objectId: object.objectId, privateDocumentId: object.privateDocumentId, publicDocumentId, nativeDocumentId: object.nativeDocumentId, geometryId: object.geometryId, poolGeneration: object.poolGeneration, geometryRevision: object.geometryRevision, geometryArchiveId: object.geometryArchiveId, layerPath: object.layerPath, publicationState: object.publicationState, ownerUsername: object.ownerUsername, canReference }
  }
  releaseRemote (root) {
    const pipeline = this.app.getDisplayPipeline()
    if (pipeline?.getSelectedObjectRoot() === root) pipeline.setSelectedObject(null)
    const entry = [...this.remote.values()].find(entry => entry.root === root)
    if (entry?.renderDocument) {
      entry.renderDocument.disposed = true
      entry.renderDocument.disposableResources.forEach(resource => resource?.dispose())
      entry.renderDocument.disposableResources.clear()
    }
    disposeSceneDisplay(root)
  }
  applyMatrix (root, matrix) {
    root.parent?.updateWorldMatrix(true, false)
    const local = new THREE.Matrix4().getInverse(root.parent?.matrixWorld || new THREE.Matrix4()).multiply(new THREE.Matrix4().fromArray(matrix))
    // Imported block instances keep matrixAutoUpdate=false (including affine
    // shear/reflection). Updating TRS alone leaves their drawing matrix stale.
    root.matrix.copy(local)
    local.decompose(root.position, root.quaternion, root.scale)
    if (root.matrixAutoUpdate) {
      const composed = new THREE.Matrix4().compose(root.position, root.quaternion, root.scale)
      if (local.elements.some((value, index) => Math.abs(value - composed.elements[index]) > 1e-10 * Math.max(1, Math.abs(value)))) root.matrixAutoUpdate = false
    }
    root.matrixWorldNeedsUpdate = true
    root.updateMatrixWorld(true)
  }

  schedule (delay = 350) {
    if (this.timer || this.disposed || this.state.busy || !this.state.connected || this.publicRole() === 'viewer') return
    if (this.inFlight) { this.syncPending = true; return }
    this.timer = setTimeout(async () => {
      this.timer = null
      if (this.inFlight) { this.syncPending = true; return }
      try {
        await this.flush()
        this.uploadFailures = 0
        if (this.uploadError && this.state.error === this.uploadError) { this.state.error = ''; this.notify() }
        this.uploadError = null
      } catch (error) {
        if (this.disposed || error.name === 'AbortError') return
        this.uploadError = 'Display synchronization: ' + error.message
        this.state.error = this.uploadError
        this.notify()
        if (retryableSceneError(error)) this.schedule(Math.min(30000, 1000 * 2 ** Math.min(this.uploadFailures++, 5)))
      }
    }, delay)
  }

  async operation (type, payload) {
    const documentId = this.state.publicDocumentId
    const task = (this.operationChain || Promise.resolve()).catch(() => {}).then(async () => {
      if (this.disposed) throw Object.assign(new Error('Scene workspace closed.'), { name: 'AbortError' })
      if (this.pendingOperation) await this.commitPendingOperation()
      this.pendingOperation = JSON.stringify({ documentId, operation: { operationId: browserCrypto.randomUUID(), type, payload } })
      return this.commitPendingOperation()
    })
    this.operationChain = task
    try { return await task } finally { if (this.operationChain === task) this.operationChain = null }
  }

  async commitPendingOperation () {
    const body = this.pendingOperation
    if (!body) return
    try {
      const snapshot = await this.request('/api/collaboration/operations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      if (this.pendingOperation === body) this.pendingOperation = null
      this.receive(snapshot)
      return snapshot
    } catch (error) {
      // A gateway can lose the reply after the server commits. Keep the exact
      // operation ID/body so its receipt resolves the outcome without reapplying.
      if (!retryableSceneError(error) && this.pendingOperation === body) this.pendingOperation = null
      throw error
    }
  }

  async commitDisplayJobs (jobs) {
    jobs = jobs.filter(job => !this.deletedDocuments.has(job.entry.privateDocumentId) && !this.deletedSourceRoots.has(job.source.root))
    if (!jobs.length) return
    jobs.forEach(job => { job.entry.sending = true })
    try {
      const uploads = jobs.filter(job => job.body)
      if (uploads.length && this.state.displayPacks && uploads.every(job => job.body.size <= TARGET_BYTES)) {
        const result = await this.request('/api/collaboration/display-packs?privateDocumentId=' + encodeURIComponent(jobs[0].entry.privateDocumentId), {
          method: 'POST', body: encodeDisplayPack(uploads.map(job => ({ assetId: job.entry.objectId, data: job.body })))
        })
        const assets = new Map(result.assets.map(asset => [asset.key, asset]))
        for (const job of uploads) {
          const asset = assets.get(job.entry.objectId)
          if (!asset) throw new Error('Incomplete display pack acknowledgement.')
          job.entry.assetId = asset.assetId
        }
      } else {
        for (const job of uploads) {
          const asset = await this.request('/api/collaboration/assets?privateDocumentId=' + encodeURIComponent(job.entry.privateDocumentId), { method: 'POST', body: job.body })
          job.entry.assetId = asset.assetId
        }
      }
      const payloads = jobs.map(({ entry, source, native, frontend, matrix, visible }) => ({ objectId: entry.objectId, privateDocumentId: entry.privateDocumentId, geometryArchiveRequired: !!frontend, nativeDocumentId: native?.nativeDocumentId, geometryId: source.geometryId, poolGeneration: source.root.userData.poolGeneration, layerPath: source.root.fullLayerPath, assetId: entry.assetId, name: source.root.name || 'Geometry', matrix, visible, expectedRevision: this.objects.get(entry.objectId)?.revision ?? entry.revision }))
      if (this.state.displayPacks && !jobs.some(job => this.objects.get(job.entry.objectId)?.geometryArchiveId)) await this.operation('objects.upsert', { items: payloads })
      else for (const payload of payloads) await this.operation('object.upsert', payload)
      for (const { entry, source, native, signature, matrix, visible } of jobs) {
        source.root.userData[native ? 'sharedDocument' : 'sharedObject'] = this.sharedReference(this.objects.get(entry.objectId) || { ...entry, ownerId: this.state.ownerId, nativeDocumentId: native?.nativeDocumentId || null, geometryId: source.geometryId || null, poolGeneration: source.root.userData.poolGeneration || null, layerPath: source.root.fullLayerPath || '' }, entry.publicDocumentId)
        applySharedDocumentVisibility(source.root, visible)
        entry.signature = signature; entry.sentMatrix = matrix.join(','); entry.visible = visible
      }
    } finally { jobs.forEach(job => { job.entry.sending = false }) }
  }

  async flush () {
    if (this.inFlight) { await this.inFlight; return this.flush() }
    if (!this.state.connected || this.disposed || this.publicRole() === 'viewer') return
    const synchronize = async () => {
      await this.commitPendingOperation()
      await this.syncNativeDocuments()
      const roots = this.app.getDisplayPipeline().sharedSceneSources()
      const live = new Set(roots.map(entry => entry.key))
      let jobs = [], batchBytes = 0, batchStarted = performance.now(), yieldedAt = performance.now()
      const commit = async () => {
        if (!jobs.length) return
        const batch = jobs; jobs = []; batchBytes = 0
        await this.commitDisplayJobs(batch)
        batchStarted = performance.now()
      }
      for (const source of roots) {
        if (this.disposed) return
        if (this.deletedSourceRoots.has(source.root) || this.deletedDocuments.has(source.nativeDocumentId)) continue
        const native = source.nativeDocumentId && source.geometryId ? await this.registerNative(source.nativeDocumentId) : null
        const frontend = source.localDocumentId && this.app.modelDocuments().find(model => model.documentId === source.localDocumentId)
        if (frontend && (frontend.disposed || frontend.workspacePublicDocumentId !== this.state.publicDocumentId)) continue
        let entry = this.local.get(source.key)
        if (!entry) {
          const objectId = 'display-' + await browserCrypto.sha256(source.key)
          const existing = this.objects.get(objectId)
          const privateDocumentId = native?.documentId || existing?.privateDocumentId || frontend?.workspaceDocumentId || this.state.privateDocumentId
          if (!privateDocumentId) continue
          entry = { objectId, privateDocumentId, publicDocumentId: native?.publicDocumentId || this.state.publicDocumentId, revision: existing?.revision || 0 }
          this.local.set(source.key, entry)
          const remote = this.remote.get(objectId)
          if (remote) { this.releaseRemote(remote.root); this.remote.delete(objectId) }
        }
        const rootChanged = entry.root !== source.root
        entry.root = source.root
        if (this.deletedDocuments.has(entry.privateDocumentId)) continue
        if (native && entry.privateDocumentId !== native.documentId) { entry.privateDocumentId = native.documentId; entry.signature = null }
        if (entry.publicDocumentId !== this.state.publicDocumentId) {
          if (rootChanged) entry.visible = source.root.visible
          source.root.visible = false
          continue
        }
        if (!workspaceObjectLoaded(this.objects.get(entry.objectId) || entry, this.state)) continue
        const signature = displaySignature(source.root)
        const matrix = this.matrixOf(source.root)
        const visible = sharedObjectSourceVisible(source.root)
        if (signature === entry.signature && matrix.join(',') === entry.sentMatrix && visible === entry.visible) continue
        const body = signature !== entry.signature || !entry.assetId ? encodeSceneDisplay(source.root) : null
        if (jobs.length && (jobs[0].entry.privateDocumentId !== entry.privateDocumentId || batchBytes + (body?.size || 0) > TARGET_BYTES || jobs.length >= MAX_ITEMS || performance.now() - batchStarted >= 100)) await commit()
        jobs.push({ entry, source, native, frontend, signature, matrix, visible, body }); batchBytes += body?.size || 0
        if (!this.state.displayPacks || batchBytes >= TARGET_BYTES) await commit()
        if (performance.now() - yieldedAt >= 8) { await new Promise(resolve => setTimeout(resolve, 0)); yieldedAt = performance.now() }
      }
      await commit()
      for (const [key, entry] of this.local) {
        if (entry.publicDocumentId !== this.state.publicDocumentId || live.has(key) || !workspaceObjectLoaded(this.objects.get(entry.objectId) || entry, this.state)) continue
        if (key.startsWith('graph:') || entry.root?.userData?.nodePreview === true) {
          this.local.delete(key)
          continue
        }
        await this.operation('object.remove', { objectId: entry.objectId, privateDocumentId: entry.privateDocumentId, expectedRevision: this.objects.get(entry.objectId)?.revision ?? entry.revision })
        this.local.delete(key)
      }
      for (const [objectId, entry] of this.remote) {
        const object = this.objects.get(objectId)
        if (!object || entry.root.userData.readOnly) continue
        const matrix = this.matrixOf(entry.root)
        const signature = displaySignature(entry.root)
        const visible = sharedObjectSourceVisible(entry.root)
        if (matrix.join(',') === entry.sentMatrix && entry.visible === visible && signature === entry.signature) continue
        let assetId = entry.assetId
        if (signature !== entry.signature) {
          const asset = await this.request('/api/collaboration/assets?privateDocumentId=' + encodeURIComponent(object.privateDocumentId), { method: 'POST', body: await encodeSceneDisplay(entry.root) })
          assetId = asset.assetId
        }
        const previousAssetId = entry.assetId
        entry.assetId = assetId
        try { await this.operation('object.edit', { objectId, matrix, assetId, visible, expectedRevision: object.revision }) } catch (error) { entry.assetId = previousAssetId; this.queueReconcile(); throw error }
        entry.signature = signature
        entry.sentMatrix = matrix.join(',')
        entry.visible = visible
      }
    }
    this.inFlight = synchronize()
    try { await this.inFlight } finally {
      this.inFlight = null
      // Streaming imports and WebSocket acknowledgements can generate many
      // invalidations. Keep one follow-up pass, not a queue of full rescans.
      if (this.syncPending) { this.syncPending = false; this.schedule() }
    }
  }

  async publish (privateDocumentId = this.state.privateDocumentId) {
    if (this.state.busy) throw new Error('Another document operation is in progress.')
    if (this.app.modelDocuments().some(doc => doc.workspaceDocumentId === privateDocumentId && (doc.localImportInProgress || doc.remeshStream))) throw new Error('Wait for import / remeshing to finish before publishing.')
    this.state.busy = true
    clearTimeout(this.timer)
    this.timer = null
    this.state.error = ''
    this.state.publicationProgress = 0
    this.notify()
    this.publicationAbort = new AbortController()
    try {
      await this.flush()
      const entries = [...this.local.values()].filter(entry => entry.privateDocumentId === privateDocumentId).map(entry => ({
        ...entry,
        revision: this.objects.get(entry.objectId)?.revision,
        doc: this.app.modelDocuments().find(doc => doc.localFileLoaded && doc.documentId === entry.root.userData.localDocumentId)
      })).filter(entry => entry.doc)
      const publisher = new FrontendGeometryPublisher({ upload: (entry, body, signal) => this.request('/api/collaboration/geometry-archives?' + new URLSearchParams({ privateDocumentId, objectId: entry.objectId, expectedRevision: entry.revision }), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
      }) })
      const geometryArchives = await publisher.publish(entries, { signal: this.publicationAbort.signal, progress: count => { this.state.publicationProgress = count; this.notify() } })
      // A user can keep editing during upload. Flush those changes and let the
      // server reject stale revisions rather than publish mismatched geometry.
      await this.flush()
      if (this.publicationAbort.signal.aborted) throw new Error('Geometry publication cancelled.')
      this.state.publicationCommitting = true
      this.notify()
      await this.operation('document.publish', { privateDocumentId, geometryArchives })
      await this.refresh()
    } catch (error) { this.state.error = error.message; throw error } finally { this.publicationAbort = null; this.state.publicationProgress = null; this.state.publicationCommitting = false; this.state.busy = false; this.notify(); this.schedule() }
  }

  cancelPublication () { this.publicationAbort?.abort() }

  async transform (root, matrix) {
    const objectId = root.userData.sharedObject.objectId
    const object = this.objects.get(objectId)
    if (!object) throw new Error('The shared object no longer exists.')
    try { await this.operation('object.transform', { objectId, matrix, expectedRevision: object.revision }) } catch (error) { this.applyMatrix(root, object.matrix); this.app.getDisplayPipeline().setDirtyFlag(true, false); throw error }
  }

  dispose () {
    clearTimeout(this.localNotifyTimer)
    this.disposed = true
    this.generation++
    this.displayReconcileAbort?.abort()
    this.publicationAbort?.abort()
    clearTimeout(this.timer)
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.displayRetryTimer)
    this.displayRetries.clear()
    this.socket?.close()
    this.requests.forEach(controller => controller.abort())
    this.remote.forEach(entry => this.releaseRemote(entry.root))
    this.remote.clear()
    this.local.forEach(entry => { if (entry.displayOverride) disposeSceneDisplay(entry.displayOverride) })
    this.local.clear()
    this.group.parent?.remove(this.group)
    window.removeEventListener('pandaui-scene-content-changed', this.onSceneChanged)
    window.removeEventListener('pandaui-document-view-changed', this.onDocumentViewChanged)
    window.removeEventListener('pandaui-backend-mode', this.onBackendMode)
    if (window.PandaUISceneWorkspace === this) { window.PandaUISceneWorkspace = null; window.PandaUIPrivateDocumentId = null }
  }
}
