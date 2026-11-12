import PandaUIApp from '../PandaUIApp'
import ImportChunkStream from '../ImportChunkStream'
import ModelFileDrop from '../ModelFileDrop'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { recentFileName } from './useRecentFiles'
import { MODEL_FILE_TYPES, FRONTEND_EXTENSIONS, BACKEND_EXTENSIONS, SIDECAR_ACCEPT, selectModelFiles } from '../import/ModelFileFormats'

export default function useModelImport ({ fileDrawerVisible, recentFiles, rememberRecentEntry, rememberRecentFile, refreshRenderMaterials }) {
  // Per-window choice. New workspaces always start with local file processing.
  const fileProcessing = ref('frontend')
  const frontendExtensions = FRONTEND_EXTENSIONS
  const backendExtensions = BACKEND_EXTENSIONS
  const modelFileDragActive = ref(false)

  const modelFileDropMessage = ref('')

  let modelFileDrop = null

  let fileDropMessageTimer = null

  const openingLocalFile = ref(false)
  let localImportController = null
  let pendingRecentEntry = null

  const openFileMenuVisible = ref(false)

  const importFileMenuVisible = ref(false)

  const recentFileDialogVisible = ref(false)

  const pendingRecentFilePath = ref('')

  const allExtensions = [...new Set([...frontendExtensions, ...backendExtensions])]
  const openFileTypes = [...MODEL_FILE_TYPES, { id: 'all', label: 'All supported files', extensions: allExtensions, accept: allExtensions.join(','), icon: 'folder_open' }]

  const importFileTypes = openFileTypes.map(type => type.id === 'all' ? { ...type, id: 'importable', label: 'All importable files', icon: 'input' } : type)

  const loadingModel = ref(false)
  const modelImportBusy = computed(() => loadingModel.value || openingLocalFile.value)

  const loadingDetail = ref('')

  function closeModel () {
    PandaUIApp.closeModel()
  }

  function hasInsufficientMemory () {
    const memory = performance.memory
    if (memory == null || memory.jsHeapSizeLimit == null) return false

    // File size alone is not a reliable measure of 3DM geometry complexity.
    // Allow large files to enter the incremental converter unless the active
    // browser heap is already close to its own limit.
    return memory.usedJSHeapSize >= memory.jsHeapSizeLimit * 0.98
  }

  function showMemoryFullMessage (name) {
    window.alert(`Memory is full. ${name} was not opened. Close the current model or other browser tabs, then try again.`)
  }

  function formatProgressBytes (bytes) {
    const value = Number(bytes)
    if (!Number.isFinite(value) || value < 0) return ''
    if (value >= 1024 * 1024 * 1024) return (value / 1024 / 1024 / 1024).toFixed(2) + ' GB'
    if (value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB'
    if (value >= 1024) return (value / 1024).toFixed(1) + ' KB'
    return Math.round(value) + ' B'
  }

  function formatLoadingProgressDetails (progress = {}, initial = []) {
    const details = initial.filter(Boolean)
    const addCount = (value, label) => {
      const number = Number(value)
      if (Number.isFinite(number)) details.push(number.toLocaleString() + ' ' + label)
    }
    const objectCount = progress.processedObjects ?? progress.objects
    if (progress.discovering) details.push('discovering objects')
    else if (progress.totalObjects != null) details.push(`${Number(objectCount || 0).toLocaleString()}/${Number(progress.totalObjects).toLocaleString()} objects`)
    else if (objectCount != null) addCount(objectCount, 'objects')
    if (progress.displayParts != null) addCount(progress.displayParts, 'display parts added')
    if (progress.locatedInstances) addCount(progress.locatedInstances, 'block references')
    if (progress.pendingBlockObjects) addCount(progress.pendingBlockObjects, 'block geometries pending')
    if (progress.meshWorkerLimit) details.push(`${progress.meshWorkers || 0}/${progress.meshWorkerLimit} mesh workers · ${progress.meshQueue || 0} queued`)
    if (progress.meshMemoryLimited) details.push('Memory-limited concurrency')
    else if (progress.meshWaitingForTasks && progress.meshBufferLimited) details.push('Waiting for display buffer space')
    else if (progress.meshWaitingForTasks && progress.meshReaderDone) details.push('Finishing remaining objects')
    else if (progress.meshWaitingForTasks) details.push('Waiting for file data')
    if (progress.meshReadyRecords) details.push(`${progress.meshReadyRecords} mesh results ready`)
    if (progress.meshedObjects) addCount(progress.meshedObjects, 'surface placements updated')
    if (progress.failedMeshObjects) addCount(progress.failedMeshObjects, 'Brep meshes failed')
    if (progress.partialMeshObjects) addCount(progress.partialMeshObjects, 'Breps with skipped faces')
    if (progress.meshEstimatedActiveBytes) details.push(`${formatProgressBytes(progress.meshEstimatedActiveBytes)} estimated active memory`)
    if (progress.meshBufferedSourceBytes) details.push(`${formatProgressBytes(progress.meshBufferedSourceBytes)} mesh input in flight`)
    if (progress.skippedObjects) addCount(progress.skippedObjects, 'objects skipped')
    if (progress.missingMeshObjects) addCount(progress.missingMeshObjects, 'surface objects with incomplete display meshes')
    if (progress.entities != null) addCount(progress.entities, 'STEP entities parsed')
    if (progress.geometries != null) addCount(progress.geometries, 'business geometries')
    if (progress.documentObjects != null) addCount(progress.documentObjects, 'document objects')
    if (progress.geometryIds != null) addCount(progress.geometryIds, 'geometry IDs')
    if (progress.instances != null) addCount(progress.instances, 'instances')

    if (progress.totalChunks != null) {
      const loaded = Number(progress.loadedChunks || 0)
      const total = Number(progress.totalChunks || 0)
      details.push((loaded > 0 ? loaded.toLocaleString() + '/' : '') + total.toLocaleString() + ' chunks')
    } else if (!progress.discovering && progress.chunks != null) addCount(progress.chunks, 'display chunks ready')
    if (progress.prefetchedChunks) details.push(`${progress.prefetchedChunks.toLocaleString()} downloaded (${formatProgressBytes(progress.prefetchedBytes)})`)
    if (progress.immediateChunks != null) addCount(progress.immediateChunks, 'immediate chunks')
    if (progress.cachedChunks != null) addCount(progress.cachedChunks, 'cached mesh chunks')
    if (progress.deferredChunks) addCount(progress.deferredChunks, 'deferred chunks')

    if (progress.totalVertices != null) addCount(progress.totalVertices, 'total vertices')
    if (progress.acceptedVertices != null) addCount(progress.acceptedVertices, 'accepted vertices')
    if (progress.deferredVertices) addCount(progress.deferredVertices, 'deferred vertices')
    if (progress.loadedVertices) addCount(progress.loadedVertices, 'loaded vertices')
    if (progress.totalIndices != null) addCount(progress.totalIndices, 'total indices')
    if (progress.loadedIndices) addCount(progress.loadedIndices, 'loaded indices')

    if (progress.totalBatches != null) addCount(progress.totalBatches, 'batches')
    if (progress.batchChunks != null) addCount(progress.batchChunks, 'chunks in current batch')
    if (progress.batchBytes != null) details.push(formatProgressBytes(progress.batchBytes) + ' current batch')
    if (progress.totalBytes != null) details.push(formatProgressBytes(progress.totalBytes) + ' display data')
    if (progress.maximumBatchBytes != null) details.push(formatProgressBytes(progress.maximumBatchBytes) + ' batch limit')
    if (progress.maxSceneVertices != null) addCount(progress.maxSceneVertices, 'GPU vertex limit')

    if (progress.materials != null) addCount(progress.materials, 'materials')
    if (progress.layers != null) addCount(progress.layers, 'layers')
    if (progress.manifestChars != null) addCount(progress.manifestChars, 'manifest characters')
    if (progress.poolMs != null) details.push(Number(progress.poolMs).toLocaleString() + ' ms document pool')
    if (progress.elapsedMs != null) details.push(Number(progress.elapsedMs).toLocaleString() + ' ms')
    return details.join(' | ')
  }

  async function fetchImportJson (url, label, attempts = 3) {
    let lastError = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await fetch(url, { cache: 'no-store' })
        const result = await response.json().catch(() => null)
        if (!response.ok) throw new Error(result?.error || `${label} returned HTTP ${response.status}.`)
        return result
      } catch (error) {
        lastError = error
        if (attempt < attempts) await new Promise(resolve => window.setTimeout(resolve, attempt * 400))
      }
    }
    throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message || 'network error'}`)
  }

  async function completeBackendImport (accepted, name, recentEntry, mode = 'open') {
    let job = accepted
    const doc = PandaUIApp.createBackendMeshDocument(name, job.id, mode)
    const stream = new ImportChunkStream(job.id, doc, progress => {
      loadingDetail.value = progress.phase + ': ' + formatLoadingProgressDetails(progress)
    })
    doc.importStream = stream
    PandaUIApp.startBackendMeshStreaming(doc)
    let streamError = null
    const displayTask = stream.run().catch(error => { streamError = error })
    try {
      while (!['complete', 'failed'].includes(job.state)) {
        await new Promise(resolve => window.setTimeout(resolve, 100))
        if (doc.disposed) throw new Error('Import cancelled.')
        if (streamError) throw streamError
        job = await fetchImportJson(`/api/models/${job.id}?summary=1`, 'Import status request')
        if (job == null) throw new Error('The backend returned an empty import status.')
        if (job.progress?.stage === 'finalizing-display-manifest' || /^Finalizing display geometry manifes/i.test(job.progress?.phase || '')) continue
        const progress = { ...job.progress, loadedChunks: stream.loadedChunks, loadedVertices: doc.sceneVertices }
        const transferred = job.size ? (job.size / 1024 / 1024).toFixed(1) + ' MB source' : ''
        const details = formatLoadingProgressDetails(progress, [transferred])
        loadingDetail.value = (progress.phase || 'Processing model') + (details ? ': ' + details : '')
      }
      if (job.state !== 'complete') throw new Error(job.error || 'The backend could not parse this document.')
      await displayTask
      if (streamError) throw streamError
      job.manifest = await fetchImportJson(`/api/models/${job.id}/manifest`, 'Import manifest request')
      if (job.manifest == null) throw new Error('The backend returned an empty import manifest.')
      const sceneResult = PandaUIApp.finalizeBackendMeshDocument(doc, job.manifest)
      stream.dispose()
      refreshRenderMaterials()
      rememberRecentEntry(job.recentFile || accepted.recentFile || recentEntry)
      fileDrawerVisible.value = false
      const unsupported = Math.max(0, (job.manifest?.unsupported || 0) - (job.manifest?.pendingMeshCount || 0))
      const chunks = job.manifest?.chunks?.length || 0
      if (job.manifest?.sourceFormat === 'dwg' || job.manifest?.sourceFormat === 'dxf') {
        const warnings = job.manifest.warnings || []
        if (unsupported > 0 || warnings.length > 0) {
          showFileDropMessage(`CAD loaded with warnings. ${unsupported > 0 ? 'Skipped ' + job.manifest.warningSummary + '. ' : ''}${warnings[0] || ''}`)
          console.warn('CAD import warnings:', { skipped: job.manifest.skippedEntities, warnings })
        }
      } else if (unsupported > 0) window.alert(`Loaded ${chunks} display chunk(s). Skipped ${unsupported} unsupported object(s); the import continued.`)
      if (sceneResult.deferredChunks > 0) window.alert(`Loaded ${sceneResult.loadedVertices.toLocaleString()} GPU vertices into Three.js. Deferred ${sceneResult.deferredChunks} surface mesh chunk(s), containing ${sceneResult.deferredVertices.toLocaleString()} vertices, because the 50,000,000 vertex safety budget was reached.`)
      if (sceneResult.progressiveEdgeChunks > 0) console.info(`Progressively loading ${sceneResult.progressiveEdgeChunks} edge chunk(s), containing ${sceneResult.progressiveEdgeVertices.toLocaleString()} line-index vertices.`)
    } catch (error) {
      stream.dispose()
      doc.dispose()
      await displayTask
      throw error
    }
  }

  async function importModelOnBackend (file, mode = 'open') {
    loadingModel.value = true
    loadingDetail.value = `${mode === 'import' ? 'Importing' : 'Opening'} ${file.name}...`
    try {
      if (mode === 'open') await PandaUIApp.prepareForDocumentReplacement()
      const upload = await fetch('/api/models', {
        method: 'POST',
        // HTTP header values are limited to ISO-8859-1. Encode filenames
        // here so Chinese and other Unicode names can be uploaded safely.
        headers: { 'X-PandaUI-File-Name': encodeURIComponent(file.name) },
        body: file
      })
      const accepted = await upload.json()
      if (!upload.ok) throw new Error(accepted.error || 'The backend rejected this file.')
      await completeBackendImport(accepted, file.name, { name: file.name, displayPath: file.name }, mode)
    } catch (error) {
      console.error('Backend model import failed:', error)
      window.alert(`Unable to ${mode === 'import' ? 'import' : 'open'} ${file.name}. ${error.message}`)
    } finally {
      loadingModel.value = false
      loadingDetail.value = ''
    }
  }

  async function importModelPathOnBackend (entry, mode = 'open') {
    const filePath = entry.path
    const name = recentFileName(entry)
    loadingModel.value = true
    loadingDetail.value = `${mode === 'import' ? 'Importing' : 'Opening'} ${name}...`
    try {
      if (mode === 'open') await PandaUIApp.prepareForDocumentReplacement()
      const queued = await fetch('/api/models/path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      })
      const accepted = await queued.json()
      if (!queued.ok) throw new Error(accepted.error || 'The backend rejected this file path.')
      await completeBackendImport(accepted, name, entry, mode)
    } catch (error) {
      console.error('Recent model import failed:', error)
      window.alert(`Unable to ${mode === 'import' ? 'import' : 'open'} ${name}. ${error.message}`)
    } finally {
      loadingModel.value = false
      loadingDetail.value = ''
    }
  }

  async function selectRecentFile (entry) {
    if (modelImportBusy.value) return
    pendingRecentEntry = null
    if (fileProcessing.value === 'frontend') {
      // A stored server path does not grant browser access to that file.
      // Keep the Open/Import choice, then request the original local file.
      pendingRecentEntry = entry
      pendingRecentFilePath.value = entry.path || entry.name
      recentFileDialogVisible.value = true
      return
    }
    if (!entry?.reopenable || !entry.path) {
      window.alert(`The browser did not retain the original path for ${entry?.name || 'this file'}. Please select it again.`)
      openFile(null, 'open')
      return
    }
    const filePath = entry.path
    try {
      const response = await fetch('/api/files/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The file path could not be checked.')
      if (!result.exists || !result.isFile) {
        window.alert(`The recent file no longer exists:\n${filePath}`)
        return
      }
      if (!result.supported) {
        window.alert(`This recent file type cannot be reopened from its saved path:\n${filePath}`)
        return
      }
      pendingRecentFilePath.value = filePath
      recentFileDialogVisible.value = true
    } catch (error) {
      window.alert(`Unable to check the recent file. ${error.message}`)
    }
  }

  function runRecentFileAction (mode) {
    const filePath = pendingRecentFilePath.value
    recentFileDialogVisible.value = false
    pendingRecentFilePath.value = ''
    const entry = pendingRecentEntry || recentFiles.value.find(item => item.path === filePath)
    pendingRecentEntry = null
    if (fileProcessing.value === 'frontend') {
      const extension = (entry?.name || filePath).split('.').pop().toLowerCase()
      openFile(openFileTypes.find(type => type.extensions.includes('.' + extension)), mode)
      return
    }
    if (entry) importModelPathOnBackend(entry, mode)
  }

  async function openModelContents (file, mode, files = []) {
    const name = file.name
    localImportController = new AbortController()
    loadingModel.value = true
    loadingDetail.value = `${mode === 'import' ? 'Importing' : 'Opening'} ${name} on the frontend...`
    await new Promise(resolve => requestAnimationFrame(resolve))
    try {
      // Pass a File handle; the import worker reads it on demand.
      const openSuccess = await PandaUIApp.openLocalFile(file, mode, {
        files,
        signal: localImportController.signal,
        onProgress: progress => {
          const read = progress.sourceBytes ? `${formatProgressBytes(progress.readBytes)} / ${formatProgressBytes(progress.sourceBytes)} ${progress.phase === 'Locating block placements' ? 'scanned' : 'read'}` : ''
          loadingDetail.value = `${progress.phase || 'Importing on frontend'}: ${formatLoadingProgressDetails(progress, [read])}`
        }
      })
      if (!openSuccess) {
        if (hasInsufficientMemory()) {
          showMemoryFullMessage(name)
          return false
        }
        throw new Error('The file could not be read as a supported model.')
      }
      fileDrawerVisible.value = false
      refreshRenderMaterials()
    } catch (error) {
      if (error.name === 'AbortError') return false
      console.error('Failed to open model:', error)
      if (/WebAssembly parser memory limit/i.test(error.message || '')) {
        window.alert(`Unable to open ${name}. ${error.message}`)
        return false
      }
      if (hasInsufficientMemory() || /memory|allocation|heap/i.test(error.message)) {
        showMemoryFullMessage(name)
      } else {
        window.alert(`Unable to open ${name}. ${error.message}`)
      }
      return false
    } finally {
      localImportController = null
      loadingModel.value = false
      loadingDetail.value = ''
    }
    return true
  }

  function showFileDropMessage (message) {
    window.clearTimeout(fileDropMessageTimer)
    modelFileDropMessage.value = message
    if (message) fileDropMessageTimer = window.setTimeout(() => { modelFileDropMessage.value = '' }, 6000)
  }

  function openDroppedModel (files, directories) {
    if (directories) { showFileDropMessage('Drop a model file, not a folder.'); return }
    if (modelImportBusy.value) { showFileDropMessage('A model is opening. Please wait before dropping another file.'); return }
    return openSelectedFiles(files)
  }

  function openSelectedFiles (files, mode = 'open') {
    if (!files?.length) return
    try { const selected = selectModelFiles(files); return openLocalFile(selected.file, mode, selected.files) } catch (error) { showFileDropMessage(error.message) }
  }

  async function openLocalFile (file, mode = 'open', files = []) {
    if (!file || modelImportBusy.value) return
    const lowerName = file.name.toLowerCase()
    const extension = lowerName.includes('.') ? lowerName.slice(lowerName.lastIndexOf('.')) : ''
    if (!openFileTypes.some(type => type.extensions.includes(extension))) {
      showFileDropMessage(`Unsupported model file: ${file.name}. Choose a format from Files > Open.`)
      return
    }
    const processor = window.PandaUIBackendMode === 'local' ? 'frontend' : fileProcessing.value
    const supported = processor === 'backend' ? backendExtensions : frontendExtensions
    if (!supported.includes(extension)) {
      const other = processor === 'backend' ? 'Frontend' : 'Backend'
      window.alert(`${file.name} cannot be opened with ${processor === 'backend' ? 'Backend' : 'Frontend'} processing. Select ${other} in Files > File processing, then choose the file again.`)
      return
    }
    showFileDropMessage('')
    openingLocalFile.value = true
    try {
      if (processor === 'backend') {
        await importModelOnBackend(file, mode)
        return
      }
      if (hasInsufficientMemory()) {
        showMemoryFullMessage(file.name)
        return
      }
      const opened = await openModelContents(file, mode, files)
      if (opened) rememberRecentFile(file)
    } catch (error) {
      console.error('Unable to read local model:', error)
      showFileDropMessage(`Unable to read ${file.name}: ${error.message}`)
    } finally {
      openingLocalFile.value = false
    }
  }

  function openFile (fileType = null, mode = 'open') {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.multiple = fileProcessing.value === 'frontend'
    fileInput.accept = fileType?.accept || (mode === 'import'
      ? importFileTypes.find(item => item.id === 'importable').accept
      : openFileTypes.find(item => item.id === 'all').accept)
    if (fileInput.multiple) fileInput.accept += ',' + SIDECAR_ACCEPT
    fileInput.style.display = 'none'
    fileInput.onchange = event => {
      const files = Array.from(event.target.files)
      fileInput.remove()
      return openSelectedFiles(files, mode)
    }
    fileInput.addEventListener('cancel', () => fileInput.remove(), { once: true })
    document.body.appendChild(fileInput)
    let eventMouse = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    })
    fileInput.dispatchEvent(eventMouse)
  }

  async function createEmptyDocument () {
    await PandaUIApp.createEmptyDocument()
    fileDrawerVisible.value = false
  }

  let backendExitCancellationSent = false

  function cancelBackendActivitiesOnExit () {
    if (backendExitCancellationSent) return
    backendExitCancellationSent = true
    const endpoint = '/api/activity/cancel'
    fetch(endpoint, { method: 'POST', cache: 'no-store', keepalive: true }).catch(() => {})
  }
  const useLocalProcessing = () => { if (window.PandaUIBackendMode === 'local') fileProcessing.value = 'frontend' }

  watch(fileDrawerVisible, visible => {
    if (!visible) {
      openFileMenuVisible.value = false
      importFileMenuVisible.value = false
    }
  })
  onMounted(() => {
    modelFileDrop = new ModelFileDrop({
      frame: document.getElementById('editorFrame'),
      onFiles: openDroppedModel,
      onActive: active => { modelFileDragActive.value = active },
      delegate: event => {
        const canvas = document.getElementById('editorFrame')?.contentWindow?.graphcanvas
        if (!canvas || event.target !== canvas.canvas) return false
        const node = canvas.nodeAt(canvas.toGraph(event.clientX, event.clientY))
        return typeof node?.onDropFile === 'function'
      }
    })

    window.addEventListener('pagehide', cancelBackendActivitiesOnExit)
    window.addEventListener('beforeunload', cancelBackendActivitiesOnExit)
    window.addEventListener('pandaui-backend-mode', useLocalProcessing)
  })
  onUnmounted(() => {
    localImportController?.abort()
    modelFileDrop?.dispose()
    window.clearTimeout(fileDropMessageTimer)
    window.removeEventListener('pagehide', cancelBackendActivitiesOnExit)
    window.removeEventListener('beforeunload', cancelBackendActivitiesOnExit)
    window.removeEventListener('pandaui-backend-mode', useLocalProcessing)
  })

  const cancelFileImport = () => { localImportController?.abort(); PandaUIApp.cancelLocalImport() }
  return { fileProcessing, modelImportBusy, cancelFileImport, modelFileDragActive, modelFileDropMessage, openFileMenuVisible, importFileMenuVisible, recentFileDialogVisible, pendingRecentFilePath, openFileTypes, importFileTypes, loadingModel, loadingDetail, closeModel, selectRecentFile, runRecentFileAction, openFile, createEmptyDocument }
}
