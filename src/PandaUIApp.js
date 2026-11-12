import * as THREE from 'three'
import KukaPreview from './plugins/KukaPreview'
import WorkspaceOperations from './operations/WorkspaceOperations'
import ViewportOverlayState from './display/ViewportOverlayState'
import DisplayPipeline from './DisplayPipeline'
import PandaUIDoc from './PandaUIDoc'
import BackendPandaUIDoc from './BackendPandaUIDoc'
import { moveDocumentDisplay } from './DocumentObjectMoves'
import DisplayMode from './DisplayMode'
import { expandVisibleSceneBounds } from './SceneBounds'
import { setPointDisplaySettings } from './PointDisplaySettings'
import { createDefaultRenderSettings, createDefaultShadingSettings } from './DisplayMaterialSettings'
import NodeCClient from './compute/NodeCClient.mjs'
import createLocalImport from './import/createLocalImport'
import ImportPerformanceBudget from './import/ImportPerformanceBudget'
import ImportRefresh from './import/ImportRefresh'
import remeshLocalDocument from './import/remeshLocalDocument'
import ImportMeshTargets from './import/ImportMeshTargets'
import { DEFAULT_MESH_PRECISION, DEFAULT_MESH_WORKER_COUNT, meshQualityOptions, normalizeMeshPrecision } from './import/MeshQuality'

let _cachedDoc = null
let _modes = DisplayMode.defaultModes()

function mergeLayerTrees (target, source) {
  source.forEach(sourceLayer => {
    let layer = target.find(item => item.fullPath === sourceLayer.fullPath)
    if (layer == null) {
      layer = { label: sourceLayer.label, fullPath: sourceLayer.fullPath, visible: sourceLayer.visible !== false, children: [] }
      target.push(layer)
    }
    mergeLayerTrees(layer.children, sourceLayer.children || [])
  })
}

function flattenLayers (layers, parentVisible = true, output = []) {
  layers.forEach(layer => {
    const visible = parentVisible && layer.visible !== false
    output.push({ layer, visible })
    flattenLayers(layer.children || [], visible, output)
  })
  return output
}

class PandaUIApp {
  #viewportUi = new ViewportOverlayState()
  #operations = new WorkspaceOperations({
    getPipeline: () => this.getDisplayPipeline()
  })
  #nodeC = null // combined NodeC runtime with rhino3dm-compatible bindings
  #nodeCReady = null
  #localCompute = null
  #remeshController = null
  #displayPipeline = null
  #glElementId = '' // parent DOM element id for WebGL control
  #document1 = null // main document we are viewing
  #importedDocuments = []
  #kukaPreview = new KukaPreview({
    getPipeline: () => this.getDisplayPipeline(),
    getSettings: () => this._viewmodel,
    requestRender: () => this.startRenderLoop(),
    isVisible: id => this.#nodePreviewVisibility.get(id) !== false
  })
  #nodePreviewVisibility = new Map()
  #graphPoints = new Map()
  #selectionChangedHandlers = new Set()
  #renderLoopRunning = false
  #renderFrame = null
  #disposed = false
  #displayChangeHandler = () => this.#displayPipeline?.setDirtyFlag()
  #pageLifecycleHandler = () => {
    const documents = [...this.#importedDocuments]
    if (this.#document1 != null) documents.push(this.#document1)
    const jobIds = new Set(documents.map(document => document?.jobId).filter(jobId => typeof jobId === 'string' && jobId.length > 0))
    jobIds.forEach(jobId => {
      fetch(`/api/models/${jobId}/close`, { method: 'POST', keepalive: true, cache: 'no-store' }).catch(() => {})
    })
  }

  constructor () {
    this.#nodeC = null // combined NodeC runtime with rhino3dm-compatible bindings
    this.#displayPipeline = null
    this.#glElementId = '' // parent DOM element id for WebGL control
    this.#document1 = null // main document we are viewing
    this.#importedDocuments = []
    this.#graphPoints = new Map()
    this.#selectionChangedHandlers = new Set()
    this.#renderLoopRunning = false
    this._viewmodel = {
      model1: { exists: false, name: '', displayMode: 'shading', edgesVisible: true, nonSharpEdgesVisible: true, meshEdgesVisible: false, meshFaceEdgesVisible: false },
      renderSettings: createDefaultRenderSettings(),
      shadingSettings: createDefaultShadingSettings(),
      sharpEdgeThreshold: 0.9,
      meshPrecision: DEFAULT_MESH_PRECISION,
      workerCount: DEFAULT_MESH_WORKER_COUNT,
      pointSize: 8,
      pointShape: 'square',
      edgeWidth: 1,
      viewportSettings: { adaptive: true },
      displayGeometryLoading: false,
      expanded: ['Layers'],
      layers: [],
      perspectiveCamera: true,
      showGrid: true
    }
  }

  /**
   * Initialize the combined NodeC module for legacy synchronous document APIs.
   * New asynchronous geometry jobs use computeLocal() in a dedicated Worker.
   * WebAssembly loads asynchronously while the loading indicator is visible.
   * @param {function} createNodeC NodeC module factory
   * @param {function} startwait function to call to show wait UI
   * @param {function} endwait function to end wait UI
   */
  init (createNodeC, startwait, endwait) {
    if (this.#nodeC == null) {
      let nodeCPromise = createNodeC({ locateFile: file => '/nodec/' + file })
      this.#nodeCReady = nodeCPromise
      console.log('start loading NodeC')
      startwait()
      nodeCPromise.then(r => {
        if (this.#disposed) return
        this.#nodeC = r
        endwait()
        console.log('NodeC loaded')
        if (_cachedDoc != null) {
          let name = _cachedDoc[0]
          let byteArray = _cachedDoc[1]
          let mode = _cachedDoc[2]
          _cachedDoc = null
          this.openFile(name, byteArray, mode)
        }
      }).catch(error => {
        endwait()
        console.error('NodeC initialization failed:', error)
      })
    }
  }

  applicationTitle () {
    return 'PandaUI WIP'
  }

  getOperations () { return this.#operations }
  getViewportUi () { return this.#viewportUi }

  getNodeCWorker () {
    if (this.#disposed) throw new Error('Application has been disposed.')
    if (!this.#localCompute) this.#localCompute = new NodeCClient()
    return this.#localCompute
  }

  computeLocal (operation, payload, options) { return this.getNodeCWorker().run(operation, payload, options) }

  /**
   * Set the DOM element that this app will draw WebGL content into
   * @param {str} elementId id of the parent element for drawing
   */
  registerWebGlElement (elementId) {
    this.#glElementId = elementId
  }

  initializeThreeScene () {
    if (this.#disposed || this.#glElementId === '' || document.getElementById(this.#glElementId) == null) return false
    window.addEventListener('pagehide', this.#pageLifecycleHandler)
    window.addEventListener('pandaui-display-changed', this.#displayChangeHandler)
    this.getDisplayPipeline().resetToTopView()
    this.startRenderLoop()
    return true
  }

  dispose () {
    if (this.#disposed) return
    this.cancelRenderMeshing()
    this.#disposed = true
    this.#localCompute?.dispose()
    this.#localCompute = null
    this.stopRenderLoop()
    window.removeEventListener('pagehide', this.#pageLifecycleHandler)
    window.removeEventListener('pandaui-display-changed', this.#displayChangeHandler)
    this.clearAllKukaRobotPreviews()
    this.#operations.dispose()
    this.#viewportUi.dispose()
    const closing = this.closeModel()
    this.#displayPipeline?.dispose()
    this.#displayPipeline = null
    this.#graphPoints.clear()
    this.#nodePreviewVisibility.clear()
    this.#selectionChangedHandlers.clear()
    return closing
  }

  closeModel () {
    this.#operations.discardModelDocuments(this.modelDocuments().map(document => document.documentId))
    const closing = []
    this.#kukaPreview.detach()
    this.#importedDocuments.forEach(doc => {
      if (this.#document1?.three?.middleground != null && doc.three?.middleground != null) this.#document1.three.middleground.remove(doc.three.middleground)
      if (this.#document1?.three?.foreground != null && doc.three?.foreground != null) this.#document1.three.foreground.remove(doc.three.foreground)
      closing.push(doc.dispose())
    })
    this.#importedDocuments = []
    if (this.#document1 != null) {
      closing.push(this.#document1.dispose())
      this.#document1 = null
      this._viewmodel.model1.exists = false
      this._viewmodel.model1.name = ''
    }

    if (this.#displayPipeline != null && this.#document1 == null) {
      this.#displayPipeline.clearModelResources()
      this.startRenderLoop()
    }
    const completion = Promise.all(closing)
    completion.catch(error => console.warn('Backend document cleanup failed:', error))
    return completion
  }

  async prepareForDocumentReplacement () {
    await window.PandaUISceneWorkspace?.clearUnsavedBeforeOpen?.()
    let status = { active: false }
    try {
      const activity = await fetch('/api/activity', { cache: 'no-store' })
      if (activity.ok) status = await activity.json()
    } catch (error) {
      console.warn('Could not inspect backend activity:', error)
    }
    if (status.active) {
      const cancellation = await fetch('/api/activity/cancel', { method: 'POST', cache: 'no-store' })
      if (!cancellation.ok) {
        const result = await cancellation.json().catch(() => ({}))
        throw new Error(result.error || 'Could not terminate the current backend activity.')
      }
    }
    await this.closeModel()
    if (this.#displayPipeline != null) this.#displayPipeline.clearModelResources()
  }

  /**
   * Open a single file and make it the active document. This closes the
   * existing active document
   * @param {str} name name of file being opening
   * @param {str|ArrayBuffer} contents content of file
   * @returns true if a document is successfully opened
   */
  async openFile (name, contents, mode = 'open') {
    if (!['open', 'import'].includes(mode)) throw new Error('Invalid file open mode.')
    if (!/\.(3dm|obj|ply|stl|drc)$/i.test(name)) return this.openLocalFile(new File([contents], name), mode)
    // if rhino3dm is not available yet, store file in a variable that will
    // be used to call back into this function once the module is loaded
    if (this.#nodeC == null) {
      _cachedDoc = [name, contents, mode]
      return false
    }

    // Release the previous document before parsing the next one. Keeping both
    // the old GPU buffers and the new Rhino/WASM document causes large files
    // to exceed the browser memory limit during import.
    try {
      if (mode === 'open') await this.prepareForDocumentReplacement()
    } catch (error) {
      // Releasing an old view must not prevent the incoming document from
      // being parsed. The new model replaces any remaining stale resources.
      console.warn('Previous model cleanup was incomplete:', error)
      this.#document1 = null
    }
    let doc = null
    try {
      const createDocument = PandaUIDoc.createIncrementally(name, contents, this.#nodeC)
      contents = null
      doc = await createDocument
    } catch (error) {
      console.error('Failed to create model scene:', error)
      // This is raised while Rhino3dm parses the complete 3DM byte stream,
      // before individual geometry can be skipped or converted incrementally.
      if (/memory access out of bounds/i.test(error.message || '')) {
        throw new Error('Rhino3dm exceeded its 2 GB WebAssembly parser memory limit while reading this file. The file was not converted; use a smaller/simplified 3DM, or a Rhino3dm build compiled with a larger WASM memory limit.')
      }
      throw error
    }
    if (doc == null) {
      alert('Invalid document')
      return false
    }

    let opened = true
    try {
      doc.localFileLoaded = true
      if (mode === 'import') this.#importDocument(doc)
      else this.#openDocument(doc)
    } catch (error) {
      // The file was parsed successfully. Do not reclassify it as invalid if
      // optional view initialization (layers, labels, camera) fails.
      console.warn('Model loaded with incomplete view initialization:', error)
    }
    if (doc.skippedObjectCount > 0) {
      alert(`Loaded ${name}. Skipped ${doc.skippedObjectCount} object(s) that could not be converted.`)
    }
    return opened
  }

  async openLocalFile (file, mode = 'open', { onProgress, signal, files = [] } = {}) {
    const checkCancelled = () => { if (signal?.aborted) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' }) }
    if (!['open', 'import'].includes(mode)) throw new Error('Invalid file open mode.')
    if (!this.#nodeC) this.#nodeC = await this.#nodeCReady
    checkCancelled()
    if (!this.#nodeC || this.#disposed) throw new Error('The frontend geometry runtime is not available.')
    if (mode === 'open') await this.prepareForDocumentReplacement()
    checkCancelled()
    const frameFirstObject = mode !== 'import' || this.activeDocumentBoundingBox() == null
    const doc = PandaUIDoc.createEmpty(file.name, this.#nodeC)
    doc.sourceFile = file
    // Display sharing starts with the first imported objects. Original geometry
    // stays in this file until the user explicitly publishes the document.
    doc.localFileLoaded = true
    doc.rhinoMaterials.files = Array.from(files || [])
    doc.rhinoMaterials.invalidate = () => { if (!doc.disposed) this.getDisplayPipeline().setDirtyFlag() }
    doc.meshPrecision = normalizeMeshPrecision(this._viewmodel.meshPrecision)
    doc.localImportInProgress = true
    // The edge and surface readers finish independently. Keep one outer
    // transaction open until both have settled, including cancellation.
    doc.beginRenderBatchUpdate()
    let batchUpdateOpen = true
    doc.initialChunkTransferComplete = false
    const edgesFirst = file.name.toLowerCase().endsWith('.3dm')
    const importQuality = doc.meshPrecision
    const importTargets = edgesFirst ? new ImportMeshTargets() : null
    let meshTask = null
    const meshScheduling = new ImportPerformanceBudget(() => doc.localImportInProgress, typeof navigator === 'undefined' ? {} : navigator,
      () => this.#displayPipeline?.getFrameDiagnostics(), () => this._viewmodel.workerCount)
    const refresh = new ImportRefresh(() => { if (!doc.disposed) this.getDisplayPipeline().setDirtyFlag() })
    doc.refreshImportDisplay = bytes => refresh.request(bytes)
    if (importTargets) doc.onImportedRoot = root => importTargets.add(root)
    let loaded = false
    const cancel = () => { if (loaded) doc.remeshStream?.dispose(); else this.removeSceneDocuments([doc.documentId]) }
    let framed = !frameFirstObject
    let readProgress = {}
    let displayedParts = 0, clippingPlanes = 0
    let lastProgressTime = -Infinity, lastPhase
    const progress = state => {
      if (doc.disposed) return
      if (!loaded && state.placementScanComplete) doc.completePlacementScan()
      readProgress = { ...readProgress, ...state }
      const now = performance.now()
      if (state.done || readProgress.phase !== lastPhase || now - lastProgressTime >= 100) {
        lastProgressTime = now
        lastPhase = readProgress.phase
        onProgress?.({ ...readProgress, ...doc.importDisplayProgress() })
      }
      if (doc.disposed) return
      if (displayedParts !== doc.displayedPartCount || clippingPlanes !== doc.clippingPlanes.length) {
        displayedParts = doc.displayedPartCount
        clippingPlanes = doc.clippingPlanes.length
      }
      if (!framed && doc.displayedPartCount > 0) {
        if (this.activeDocumentBoundingBox() != null) {
          framed = true
          this.getDisplayPipeline().zoomDocumentExtents(true)
        }
      }
    }
    doc.onImportDisplay = bytes => {
      progress({})
      refresh.request(bytes)
    }
    try {
      if (mode === 'import') this.#importDocument(doc)
      else this.#openDocument(doc)
      signal?.addEventListener('abort', cancel, { once: true })
      const stream = createLocalImport(file)
      doc.importStream = stream
      await stream.run(file, {
        files,
        edgesOnly: edgesFirst,
        meshingOptions: meshQualityOptions(doc.meshPrecision),
        workerCount: this._viewmodel.workerCount,
        onHeader: (header, metadata = {}) => {
          if (doc.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
          if (header) {
            const source = this.#nodeC.File3dm.fromByteArray(header)
            if (!source) throw new Error('Unable to read the file metadata.')
            doc.setSourceDocument(source)
          } else doc.setImportMetadata(metadata)
          mergeLayerTrees(this._viewmodel.layers, doc.layers)
          this.updateVisibility()
          if (importTargets) {
            doc.meshPrecision = null
            meshTask = this.remeshDocument(doc, importQuality, {
              signal,
              stream: createLocalImport(),
              scheduling: meshScheduling,
              importTargets,
              reuseCachedMeshes: true,
              onProgress: ({ readBytes, sourceBytes, processedObjects, totalObjects, placementScanComplete, locatedInstances, done, ...state }) => progress({
                ...state,
                done: false,
                meshReadBytes: readBytes,
                meshReadObjects: processedObjects,
                phase: loaded ? 'Meshing surfaces' : 'Importing edges and meshing surfaces',
                meshedObjects: state.updated
              })
            }).then(result => ({ result }), error => ({ error }))
          }
        },
        onRecord: async record => {
          const id = await doc.appendImportRecord(record, this.#nodeC)
          importTargets?.complete(id)
          if (edgesFirst && performance.now() - refresh.last >= meshScheduling.edgeRefreshInterval()) refresh.flush()
        },
        onMaterialHeader: async header => {
          checkCancelled()
          const metadata = this.#nodeC.File3dm.fromByteArray(header)
          if (!metadata) return
          try { await doc.rhinoMaterials.loadTextures(metadata, this.#nodeC) } finally { metadata.delete() }
        },
        onProgress: state => progress(edgesFirst
          ? { ...state, done: false, phase: 'Importing edges and meshing surfaces' }
          : state)
      })
      await doc.finishImport(progress)
      loaded = true
      doc.localImportInProgress = false
      doc.initialChunkTransferComplete = true
      doc.localFileLoaded = true
      importTargets?.finish()
      this.getDisplayPipeline().setDirtyFlag()
      if (edgesFirst) progress({ done: false, phase: 'Meshing surfaces' })
      if (edgesFirst) {
        try {
          let { result, error } = await meshTask
          checkCancelled()
          const quality = normalizeMeshPrecision(this._viewmodel.meshPrecision)
          // Quality changes during edge loading cancel the initial mesh reader.
          // Once placements are complete, rebuild using the latest setting.
          if (quality !== importQuality && doc.meshPrecision !== quality && !doc.disposed && !doc.remeshStream) {
            result = await this.remeshDocument(doc, quality, { signal, onProgress: state => progress({ ...state, phase: 'Meshing surfaces' }) })
            error = null
          }
          if (error) throw error
          if (result.failures.length) alert(`Loaded ${file.name}.\n\nDisplay meshes are incomplete for ${result.failures.length} Brep object(s). Successfully meshed faces and original edges are retained.\n${result.failures.slice(0, 3).map(item => item.message).join('\n')}`)
        } catch (error) {
          // Cancelling, changing quality or a worker failure must never remove
          // the already usable edge scene. Closing the document still disposes it.
          if (error.name !== 'AbortError') {
            console.warn('Surface meshing failed; imported edges retained:', error)
            alert(`Loaded ${file.name}. Surface meshing stopped: ${error.message}. Imported edges are retained.`)
          }
        }
      }
      checkCancelled()
      if (doc.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
      this.updateVisibility()
      progress({ done: false, phase: 'Finishing display' })
      doc.endRenderBatchUpdate()
      batchUpdateOpen = false
      this.getDisplayPipeline().setDirtyFlag()
      progress({ done: true, phase: 'Complete' })
      const warnings = [...(doc.importWarnings || [])]
      if (doc.rhinoMaterials.warnings.size) warnings.push(`${doc.rhinoMaterials.warnings.size} texture warning(s):\n${[...doc.rhinoMaterials.warnings].slice(0, 5).join('\n')}`)
      if (doc.skippedObjectCount) warnings.push(`Skipped ${doc.skippedObjectCount} unsupported or over-budget object(s).`)
      const { missingMeshObjects, missingMeshFaces, meshingFailures, meshingMessages } = doc.importDisplayProgress()
      if (meshingFailures) {
        const reasons = [...new Set(meshingMessages.map(item => item.message))].slice(0, 3)
        warnings.push(`Frontend meshing is incomplete for ${meshingFailures} Brep object(s).${reasons.length ? '\n' + reasons.join('\n') : ''}`)
      }
      if (missingMeshObjects) warnings.push(`${missingMeshObjects} surface object(s)${missingMeshFaces ? ` (${missingMeshFaces} Brep faces)` : ''} have incomplete display meshes. Successfully meshed faces, available cached faces and original edges are retained. Original Brep geometry is unchanged.`)
      if (warnings.length) alert(`Loaded ${file.name}.\n\n${warnings.join('\n\n')}`)
      return true
    } catch (error) {
      if (!loaded) {
        this.removeSceneDocuments([doc.documentId])
        doc.dispose()
      }
      throw error
    } finally {
      signal?.removeEventListener('abort', cancel)
      refresh.flush(); refresh.dispose(); doc.refreshImportDisplay = null
      doc.importStream?.dispose(); doc.importStream = null
      importTargets?.dispose(); doc.onImportedRoot = null
      // An edge-reader failure also terminates its independent mesh pipeline.
      if (!loaded) doc.remeshStream?.dispose()
      if (meshTask) await meshTask
      if (batchUpdateOpen) doc.endRenderBatchUpdate()
      doc.onImportDisplay = null
      if (!doc.disposed) this.getDisplayPipeline().setDirtyFlag()
    }
  }

  cancelLocalImport () {
    this.removeSceneDocuments(this.modelDocuments().filter(doc => doc.localImportInProgress).map(doc => doc.documentId))
  }

  cancelRenderMeshing () {
    this.#remeshController?.abort()
    this.#remeshController = null
    for (const doc of this.modelDocuments()) doc.remeshStream?.dispose()
  }

  setMeshWorkerCount (count) {
    for (const doc of this.modelDocuments()) {
      doc.importStream?.meshPool?.configure(count)
      doc.remeshStream?.meshPool?.configure(count)
    }
  }

  remeshDocument (doc, quality, options = {}) {
    let restoreSelection = null
    return remeshLocalDocument(doc, this.#nodeC, quality, {
      ...options,
      workerCount: this._viewmodel.workerCount,
      beforeReplace: roots => {
        const selected = this.#displayPipeline?.getSelectedObjectRoot()
        restoreSelection = selected && roots.some(root => {
          for (let ancestor = root; ancestor; ancestor = ancestor.parent) if (ancestor === selected) return true
          return false
        }) ? selected : null
        if (restoreSelection) this.#displayPipeline.setSelectedObject(null)
      },
      afterReplace: () => {
        if (restoreSelection?.parent) this.#displayPipeline?.setSelectedObject(restoreSelection)
        restoreSelection = null
        if (doc.refreshImportDisplay) doc.refreshImportDisplay()
        else this.#displayPipeline?.setDirtyFlag()
      }
    })
  }

  async regenerateRenderMeshes (precision, onProgress) {
    this.cancelRenderMeshing()
    const controller = new AbortController()
    this.#remeshController = controller
    const quality = normalizeMeshPrecision(precision)
    const result = { updated: 0, failures: [], documents: 0 }
    try {
      for (const doc of this.modelDocuments()) {
        if (!doc.sourceFile?.name?.toLowerCase().endsWith('.3dm') || doc.localImportInProgress || doc.disposed || doc.meshPrecision === quality) continue
        const changed = await this.remeshDocument(doc, quality, { signal: controller.signal, onProgress })
        result.documents++
        result.updated += changed.updated
        result.failures.push(...changed.failures)
      }
      this.updateVisibility()
      return result
    } finally { if (this.#remeshController === controller) this.#remeshController = null }
  }

  async createEmptyDocument () {
    if (this.#nodeC == null) return false
    await this.prepareForDocumentReplacement()
    const created = this.#openDocument(PandaUIDoc.createEmpty('Untitled.3dm', this.#nodeC))
    this.getDisplayPipeline().resetToTopView()
    return created
  }

  createBackendMeshDocument (name, jobId, mode = 'open') {
    const frameFirstObject = mode !== 'import' || this.activeDocumentBoundingBox() == null
    const doc = new BackendPandaUIDoc(name, { documentId: jobId, chunks: [] })
    doc.jobId = jobId
    let framed = !frameFirstObject
    doc.onDisplayMetadata = () => {
      mergeLayerTrees(this._viewmodel.layers, doc.layers)
      flattenLayers(this._viewmodel.layers).forEach(({ layer, visible }) => doc.layerVisibility.set(layer.fullPath, visible))
    }
    doc.onDisplayPart = () => {
      this.getDisplayPipeline().setDirtyFlag()
    }
    doc.onDisplayChunk = () => {
      if (!framed && doc.objects.length) {
        framed = true
        this.getDisplayPipeline().zoomDocumentExtents(true)
      }
    }
    if (mode === 'import') this.#importDocument(doc)
    else this.#openDocument(doc)
    return doc
  }

  startBackendMeshStreaming (doc, pendingMeshCount = null) {
    return doc.beginDeferredMeshing(doc.jobId, [], pendingMeshCount, this._viewmodel.sharpEdgeThreshold, this._viewmodel.meshPrecision, this._viewmodel.workerCount || 2)
      .catch(error => {
        if (!doc.disposed) console.warn('Deferred mesh loading stopped:', error)
      })
  }

  finalizeBackendMeshDocument (doc, manifest) {
    if (doc.disposed) throw new Error('Import cancelled.')
    doc.applyDisplayManifest(manifest)
    doc.appendDisplayChunks(manifest.chunks || [])
    doc.markInitialChunkTransferComplete()
    this.updateVisibility()
    this.startBackendMeshStreaming(doc, manifest.pendingMeshCount)
    return { loadedVertices: doc.sceneVertices, deferredChunks: doc.deferredChunks, deferredVertices: doc.deferredVertices }
  }

  setKukaRobotPreview (nodeId, payload) { return this.#kukaPreview.set(nodeId, payload) }
  clearKukaRobotPreview (nodeId) { return this.#kukaPreview.clear(nodeId) }
  clearAllKukaRobotPreviews () { this.#kukaPreview.clearAll() }

  #openDocument (doc) {
    this.#displayPipeline?.checkGraphicsPreference()
    if (this.#disposed) { doc.dispose(); return false }
    this.closeModel()

    this.#document1 = doc
    this._viewmodel.model1.exists = true
    this._viewmodel.model1.name = this.#document1.name

    // Rebuild the complete Rhino layer tree. Match by full path so identically
    // named child layers under different parents remain distinct.
    this._viewmodel.layers = []
    if (this.#document1 != null) mergeLayerTrees(this._viewmodel.layers, this.#document1.layers)

    let labelDiv = document.getElementById('labels')
    if (labelDiv != null) labelDiv.innerHTML = ''

    if (this.#document1 != null) {
      this.#kukaPreview.attach()
      this.updateVisibility()
      if (this.visibleObjectsBoundingBox() != null) {
        this.getDisplayPipeline().zoomDocumentExtents(true)
        // Ensure interactions (pointer events / controls) are enabled after
        // opening a document; some DOM layers can accidentally capture events.
        try { this.getDisplayPipeline().ensureInteraction() } catch (e) { console.warn('Unable to enforce pipeline interaction:', e) }
      }
      // The pipeline creates the studio environment; apply it after the
      // viewport is available for documents opened directly into Render mode.
      this.updateVisibility()
      this.startRenderLoop()
    }
    return true
  }

  #importDocument (doc) {
    this.#displayPipeline?.checkGraphicsPreference()
    if (this.#disposed) { doc.dispose(); return false }
    if (this.#document1 == null) return this.#openDocument(doc)

    const hadVisibleObjects = this.activeDocumentBoundingBox() != null
    doc.three.middleground.remove(doc.displayLighting.shading)
    doc.three.middleground.remove(doc.displayLighting.render)
    this.#document1.three.middleground.add(doc.three.middleground)
    this.#document1.three.foreground.add(doc.three.foreground)
    this.#importedDocuments.push(doc)
    mergeLayerTrees(this._viewmodel.layers, doc.layers || [])
    this.updateVisibility()
    // Import appends to the current model. Preserve the existing camera so a
    // distant or very large imported model cannot make the original objects
    // appear to have been cleared. Only frame the document when the current
    // scene did not contain visible model geometry before the import.
    if (!hadVisibleObjects && this.visibleObjectsBoundingBox() != null) this.getDisplayPipeline().zoomDocumentExtents(true)
    try { this.getDisplayPipeline().ensureInteraction() } catch (error) { console.warn('Unable to enforce pipeline interaction:', error) }
    this.startRenderLoop()
    return true
  }

  modelDocuments () {
    return [this.#document1, ...this.#importedDocuments].filter(Boolean)
  }

  removeSceneDocuments (documentIds) {
    const ids = new Set(documentIds)
    const closing = this.modelDocuments().filter(document => ids.has(document.documentId))
    if (!closing.length) return
    this.#operations.discardModelDocuments(documentIds)
    this.#displayPipeline?.setSelectedObject(null)
    this.#kukaPreview.detach()
    const remaining = this.modelDocuments().filter(document => !ids.has(document.documentId))
    this.#importedDocuments.forEach(document => {
      document.three.middleground.parent?.remove(document.three.middleground)
      document.three.foreground.parent?.remove(document.three.foreground)
    })
    closing.forEach(document => document.dispose({ closeBackend: false }))
    this.#document1 = remaining.shift() || null
    this.#importedDocuments = remaining
    remaining.forEach(document => {
      this.#document1.three.middleground.add(document.three.middleground)
      this.#document1.three.foreground.add(document.three.foreground)
    })
    if (this.#document1?.displayLighting) {
      this.#document1.three.middleground.add(this.#document1.displayLighting.shading, this.#document1.displayLighting.render)
    }
    if (this.#document1) this.#kukaPreview.attach()
    this._viewmodel.model1.exists = !!this.#document1
    this._viewmodel.model1.name = this.#document1?.name || ''
    this._viewmodel.layers = []
    this.modelDocuments().forEach(document => mergeLayerTrees(this._viewmodel.layers, document.layers || []))
    this.updateVisibility()
    this.#displayPipeline?.setDirtyFlag()
  }

  moveDocumentObjects (move) {
    const source = this.modelDocuments().find(model => model.documentId === move.sourceDocumentId)
    if (!source) return
    let target = this.modelDocuments().find(model => model.documentId === move.targetDocumentId)
    if (!target) {
      target = new BackendPandaUIDoc(move.target.name, { documentId: move.targetDocumentId, poolGeneration: move.poolGeneration, chunks: [] })
      this.#importDocument(target)
    }
    moveDocumentDisplay(source, target, move)
    this.getDisplayPipeline().setSelectedObject(null)
    this._viewmodel.layers = []
    this.modelDocuments().forEach(model => mergeLayerTrees(this._viewmodel.layers, model.layers))
    this.updateVisibility()
    this.getDisplayPipeline().setDirtyFlag()
    window.dispatchEvent(new CustomEvent('pandaui-document-view-changed'))
  }

  getDisplayPipeline () {
    if (this.#disposed) return null
    if (this.#displayPipeline == null) {
      if (this.#glElementId === '') throw new Error('no element defined for WebGL')
      this.#displayPipeline = new DisplayPipeline(document.getElementById(this.#glElementId))
      this.#nodePreviewVisibility.forEach((visible, nodeId) => this.#displayPipeline.setGraphNodePreviewVisibility(nodeId, visible))
      this.#graphPoints.forEach((point, id) => {
        if (point.type === 'cloud') this.#displayPipeline.setGraphPointCloud(id, point)
        else this.#displayPipeline.setGraphPoint(id, point)
      })
    }
    return this.#displayPipeline
  }

  startRenderLoop () {
    if (this.#disposed || this.#renderLoopRunning) return
    this.#renderLoopRunning = true
    this.#renderFrame = requestAnimationFrame(() => this.renderLoop())
  }

  stopRenderLoop () {
    this.#renderLoopRunning = false
    if (this.#renderFrame != null) cancelAnimationFrame(this.#renderFrame)
    this.#renderFrame = null
  }

  setGraphPoint (id, point) {
    this.#graphPoints.set(id, point)
    if (this.#displayPipeline != null) this.#displayPipeline.setGraphPoint(id, point)
  }

  setGraphPointCloud (id, pointCloud) {
    this.#graphPoints.set(id, { ...pointCloud, type: 'cloud' })
    if (this.#displayPipeline != null) this.#displayPipeline.setGraphPointCloud(id, pointCloud)
  }

  setGraphGeometry (id, raw, displayInfo) {
    if (this.#displayPipeline != null) {
      this.#displayPipeline.setGraphGeometry(id, raw, displayInfo)
    }
  }

  bakeGraphPreview (marker) {
    return this.#displayPipeline?.bakeGraphPreview(marker) || 0
  }

  removeGraphGeometry (id) {
    if (this.#displayPipeline != null) return this.#displayPipeline.removeGraphGeometry(id)
    return false
  }

  setGraphPointSize (size) {
    const nextSize = Number(size)
    if (!Number.isFinite(nextSize)) return
    this._viewmodel.pointSize = Math.min(64, Math.max(1, nextSize))
    setPointDisplaySettings({ size: this._viewmodel.pointSize })

    if (this.#displayPipeline != null) this.#displayPipeline.setGraphPointSize(this._viewmodel.pointSize)
  }

  setGraphPointShape (shape) {
    this._viewmodel.pointShape = setPointDisplaySettings({ shape }).shape
    this.#displayPipeline?.setDirtyFlag()
  }

  setGraphNodePreviewVisibility (nodeId, visible) {
    const key = String(nodeId)
    this.#nodePreviewVisibility.set(key, visible !== false)
    this.#kukaPreview.setVisibility(key, visible)
    this.#displayPipeline?.setGraphNodePreviewVisibility(key, visible)
  }

  pickCurve (onPicked) {
    this.getDisplayPipeline().pickCurve(onPicked)
  }

  pickObject (onPicked) {
    this.getDisplayPipeline().pickObject(onPicked)
  }

  transformSceneObject (marker, operation, values, relative) {
    return this.getDisplayPipeline().transformSceneObject(marker, operation, values, relative)
  }

  setGraphPreviewVisibility (marker, role, visible, attributes) {
    if (this.#displayPipeline != null) {
      return this.#displayPipeline.setGraphPreviewVisibility(marker, role, visible, attributes)
    }
    return 0
  }

  setGraphNodeSelection (nodeIds) {
    this.#displayPipeline?.setGraphNodeSelection(nodeIds)
  }

  clearGraphPreview (marker, role) {
    if (this.#displayPipeline != null) return this.#displayPipeline.clearGraphPreview(marker, role)
    return 0
  }

  zoomGraphPreview (marker, bounds, sources) {
    return this.getDisplayPipeline().zoomGraphPreview(marker, bounds, sources)
  }

  transformGraphDisplayBuffers (marker, translation, rotation, scale, relative) {
    return this.getDisplayPipeline().transformGraphDisplayBuffers(marker, translation, rotation, scale, relative)
  }

  transformGraphDisplayBufferMatrix (marker, transform, relative) {
    return this.getDisplayPipeline().transformGraphDisplayBufferMatrix(marker, transform, relative)
  }

  createModelTransformMatrix (marker, operation, values, relative) {
    return this.getDisplayPipeline().createModelTransformMatrix(marker, operation, values, relative)
  }

  replaceSceneGeometry (marker, geometryRef, preview, renderParts) {
    return this.getDisplayPipeline().replaceSceneGeometry(marker, geometryRef, preview, renderParts)
  }

  releaseGeometry (documentId, geometryId) {
    return this.getDisplayPipeline().releaseGeometry(documentId, geometryId)
  }

  highlightCurve (curveId) {
    return this.getDisplayPipeline().highlightCurve(curveId)
  }

  clearCurveHighlight () {
    if (this.#displayPipeline != null) this.#displayPipeline.clearCurveHighlight()
  }

  getNodeC () {
    return this.#nodeC
  }

  // Compatibility for document converters using the rhino3dm binding names.
  getRhino3dm () { return this.getNodeC() }

  viewModel () {
    return this._viewmodel
  }

  onSelectionChanged (handler) {
    this.#selectionChangedHandlers.add(handler)
    handler(this.#displayPipeline == null ? null : this.#displayPipeline.getSelectedMaterialSettings())
    return () => this.#selectionChangedHandlers.delete(handler)
  }

  notifySelectionChanged (selection) {
    this.#selectionChangedHandlers.forEach(handler => handler(selection))
  }

  getRenderMaterials () {
    return this.#document1?.getRenderMaterials?.() || []
  }

  createRenderMaterial (name) {
    return this.#displayPipeline?.createRenderMaterial(name) || null
  }

  getRenderMaterial (id, documentId = null) {
    const model = documentId ? this.modelDocuments().find(model => model.documentId === documentId) : this.#document1
    return model?.getRenderMaterial?.(id) || null
  }

  updateRenderMaterial (id, settings) {
    return this.#displayPipeline?.editRenderMaterial(id, 'updateRenderMaterial', settings, 'Edit Render material') || null
  }

  resetRenderMaterial (id) {
    return this.#displayPipeline?.editRenderMaterial(id, 'resetRenderMaterial', null, 'Reset Render material') || null
  }

  setRenderMaterialTexture (id, file) {
    return this.#displayPipeline?.setRenderMaterialTexture(id, file)
  }

  clearRenderMaterialTexture (id) {
    return this.#displayPipeline?.editRenderMaterial(id, 'clearRenderMaterialTexture', null, 'Clear Render texture') || null
  }

  assignSelectedRenderMaterial (id) {
    const entry = this.#document1?.getRenderMaterial?.(id)
    return entry == null ? false : this.#displayPipeline?.assignSelectedRenderMaterial(entry) === true
  }

  getSelectedRenderMaterialId () {
    return this.#displayPipeline?.getSelectedRenderMaterialId() || null
  }

  getSelectedShadingMaterialSettings () {
    return this.#displayPipeline?.getSelectedShadingMaterialSettings() || null
  }

  updateSelectedShadingMaterial (settings) {
    return this.#displayPipeline?.updateSelectedShadingMaterial(settings) === true
  }

  updateSelectedMaterial (settings) {
    if (this.#displayPipeline != null) this.#displayPipeline.updateSelectedMaterial(settings)
  }

  setSelectedMaterialTexture (file) {
    if (this.#displayPipeline != null) return this.#displayPipeline.setSelectedMaterialTexture(file)
  }

  clearSelectedMaterialTexture () {
    if (this.#displayPipeline != null) this.#displayPipeline.clearSelectedMaterialTexture()
  }

  resetSelectedMaterial () {
    if (this.#displayPipeline != null) this.#displayPipeline.resetSelectedMaterial()
  }

  updateVisibility () {
    const documents = this.modelDocuments()
    documents.forEach(doc => doc.beginRenderBatchUpdate?.())
    try {
      const renderEnvironment = this.#displayPipeline == null ? null : this.#displayPipeline.getRenderEnvironment()
      const shadingEnvironment = this.#displayPipeline == null ? null : this.#displayPipeline.getShadingEnvironment()
      const model1Mode = this.#displayPipeline?.renderNodesActive ? 'render' : this._viewmodel.model1.displayMode
      if (this.#displayPipeline != null) this.#displayPipeline.applyDisplaySettings(this._viewmodel.shadingSettings, this._viewmodel.renderSettings, model1Mode === 'render')
      this.modelDocuments().forEach(doc => {
        doc.surfaceMeshesVisible = model1Mode === 'shading' || model1Mode === 'render'
        doc.setRenderMode(model1Mode === 'render', renderEnvironment, this._viewmodel.renderSettings)
        doc.setShadingEnvironment(shadingEnvironment, this._viewmodel.shadingSettings)
        doc.setEdgeVisibility(this._viewmodel.model1.edgesVisible)
        doc.setNonSharpEdgeVisibility(this._viewmodel.model1.nonSharpEdgesVisible)
        doc.setMeshEdgeVisibility(this._viewmodel.model1.meshEdgesVisible)
        doc.setMeshFaceEdgeVisibility(this._viewmodel.model1.meshFaceEdgesVisible)
      })
      this.#kukaPreview.updateDisplaySettings()

      flattenLayers(this._viewmodel.layers).forEach(({ layer, visible }) => {
        this.modelDocuments().forEach(doc => doc.setLayerVisibility(layer.fullPath, visible))
        this.getSceneObjectsOnLayer(layer.fullPath).forEach((obj) => {
          obj.visible = visible && obj.userData.pandauiHidden !== true
          if (obj.visible && obj.userData['edgeLines']) {
            obj.visible = this._viewmodel.model1.edgesVisible && (obj.userData.sharpEdge === true || this._viewmodel.model1.nonSharpEdgesVisible)
          }
          if (obj.visible && obj.userData['meshGeometryEdges']) {
            obj.visible = this._viewmodel.model1.meshEdgesVisible
          }
          if (obj.visible && obj.type === 'Mesh') {
            obj.visible = model1Mode === 'shading' || model1Mode === 'render'
          }
          if (obj.visible && obj.userData['surfaceWires'] && !obj.userData['edgeLines']) {
            obj.visible = model1Mode === 'wires'
          }
        })
      })

      if (this.#displayPipeline != null) {
        this.#displayPipeline.refreshGroupEditIsolation()
        this.#displayPipeline.setDirtyFlag()
        this.notifySelectionChanged(this.#displayPipeline.getSelectedMaterialSettings())
      }
    } finally { documents.forEach(doc => doc.endRenderBatchUpdate?.()) }
  }

  getActiveModel () {
    return this.#document1
  }

  getSceneObjectsOnLayer (rootLayerName) {
    let objects = []
    this.modelDocuments().forEach(doc => {
      const documentObjects = doc.getSceneObjectsOnLayer(rootLayerName)
      if (documentObjects != null) objects = objects.concat(documentObjects)
    })
    return objects
  }

  visibleObjectsBoundingBox () {
    let bbox = this.activeDocumentBoundingBox()
    if (this.#displayPipeline != null) {
      const graphBounds = this.#displayPipeline.getGraphObjectsBoundingBox()
      if (graphBounds != null && !graphBounds.isEmpty()) {
        if (bbox == null) bbox = graphBounds
        else bbox.union(graphBounds)
      }
    }
    return bbox
  }

  activeDocumentBoundingBox () {
    const bounds = new THREE.Box3()
    expandVisibleSceneBounds(this.#document1?.three.middleground, bounds)
    expandVisibleSceneBounds(this.#document1?.three.foreground, bounds)
    return bounds.isEmpty() ? null : bounds
  }

  /**
   * Private method called by the browser's animation redraw system. This
   * method is used to constantly redraw the WebGL viewport
   */
  #frameStats = { updates: 0, callbacks: 0, skipped: 0, draws: [], last: performance.now() }

  renderLoop () {
    this.#renderFrame = null
    if (this.#disposed || !this.#renderLoopRunning || this.#displayPipeline == null) {
      this.#renderLoopRunning = false
      return
    }
    try {
      const started = performance.now()
      this.#displayPipeline.updateViewportQuality(this._viewmodel.viewportSettings, this._viewmodel.edgeWidth, this._viewmodel.displayGeometryLoading)
      const updated = performance.now()
      this.#frameStats.updates += updated - started
      this.#frameStats.callbacks++
      if (!this.#displayPipeline.isDirty()) {
        this.#frameStats.skipped++
      } else {
        if (this.#document1 == null) this.#displayPipeline.drawEmptyFrame(this._viewmodel.showGrid, _modes[0])
        else this.#displayPipeline.drawFrameBuffer(this._viewmodel.showGrid, _modes[0], this.#document1)
        this.#frameStats.draws.push(performance.now() - updated)
      }
      this.#printFrameStats()
    } finally {
      // A failed shader/material/frame must not permanently stop the viewport.
      // A later mode change marks it dirty and can render a healthy frame again.
      if (!this.#disposed && this.#renderLoopRunning) this.#renderFrame = requestAnimationFrame(() => this.renderLoop())
    }
  }

  #printFrameStats () {
    const now = performance.now()
    const elapsed = now - this.#frameStats.last
    if (elapsed < 1000) return
    const { draws, callbacks, skipped, updates } = this.#frameStats
    if (draws.length) {
      const timing = this.#displayPipeline.getFrameDiagnostics()
      const average = draws.reduce((sum, duration) => sum + duration, 0) / draws.length
      draws.sort((first, second) => first - second)
      const percentile = draws[Math.ceil(draws.length * 0.95) - 1]
      const stages = ['prepare', 'background', 'model', 'preview', 'labels'].map(name => `${name}=${(timing[name + 'Ms'] || 0).toFixed(2)}ms`).join(' ')
      console.log(`[PandaUI] fps=${(draws.length * 1000 / elapsed).toFixed(1)} drawn=${draws.length} callbacks=${callbacks} idleCallbacks=${skipped} | updateVP=${(updates / callbacks).toFixed(2)}ms draw=${average.toFixed(2)}ms p95=${percentile.toFixed(2)}ms | ${stages} | GPU=${timing.gpuMs == null ? 'unavailable' : timing.gpuMs.toFixed(2) + 'ms'} calls=${timing.drawCalls} res=${Math.round(timing.scale * 100)}%`)
    }
    this.#frameStats = { updates: 0, callbacks: 0, skipped: 0, draws: [], last: now }
  }
}

const app = new PandaUIApp()
if (module.hot) module.hot.dispose(() => app.dispose())
export default app
