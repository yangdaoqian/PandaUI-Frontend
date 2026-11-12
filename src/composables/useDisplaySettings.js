import PandaUIApp from '../PandaUIApp'
import { normalizeViewportSettings } from '../AdaptiveViewport'
import { normalizeEdgeWidth } from '../EdgeDisplayRenderer'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { DEFAULT_MESH_PRECISION, DEFAULT_MESH_WORKER_COUNT, loadMeshPrecision } from '../import/MeshQuality'
import { createDefaultRenderSettings, createDefaultShadingSettings, normalizeRenderSettings, normalizeShadingSettings, VIEW_SETTINGS_STORAGE_KEY } from '../DisplayMaterialSettings'

export default function useDisplaySettings ({ viewmodel }) {
  const displaySettingsMessage = ref('')
  const meshingBusy = ref(false)
  let meshRequest = 0

  async function updateMeshPrecision () {
    const request = ++meshRequest
    meshingBusy.value = true
    displaySettingsMessage.value = 'Regenerating meshes and curves…'
    try {
      const result = await PandaUIApp.regenerateRenderMeshes(viewmodel.value.meshPrecision, progress => {
        if (request === meshRequest) displaySettingsMessage.value = `Regenerating ${progress.documentName}: ${progress.updated} object(s) updated…`
      })
      if (request !== meshRequest) return
      displaySettingsMessage.value = result.failures.length
        ? `Updated ${result.updated} object(s). ${result.failures.length} object(s) have incomplete meshes; available faces and edges are retained: ${result.failures[0].message}`
        : result.documents ? `Meshes and curves regenerated: ${result.updated} object(s).` : 'Mesh quality will apply when a frontend 3DM file is opened.'
    } catch (error) {
      if (request === meshRequest && error.name !== 'AbortError') displaySettingsMessage.value = `Unable to regenerate meshes and curves: ${error.message}`
    } finally { if (request === meshRequest) meshingBusy.value = false }
  }

  watch(() => viewmodel.value.meshPrecision, updateMeshPrecision)
  watch(() => viewmodel.value.workerCount, count => PandaUIApp.setMeshWorkerCount(count))
  onUnmounted(() => { meshRequest++; PandaUIApp.cancelRenderMeshing() })

  function updateVisibility () {
    PandaUIApp.updateVisibility()
  }

  function setLayerVisibility ({ node, visible }) {
    node.visible = visible
    updateVisibility()
  }

  function updateRenderSettings () {
    Object.assign(viewmodel.value.renderSettings, normalizeRenderSettings(viewmodel.value.renderSettings))
    PandaUIApp.updateVisibility()
  }

  function updateShadingSettings () {
    Object.assign(viewmodel.value.shadingSettings, normalizeShadingSettings(viewmodel.value.shadingSettings))
    PandaUIApp.updateVisibility()
  }

  function saveDisplaySettings () {
    try {
      const payload = {
        version: 5,
        edgeWidth: normalizeEdgeWidth(viewmodel.value.edgeWidth),
        viewportSettings: normalizeViewportSettings(viewmodel.value.viewportSettings),
        shadingSettings: normalizeShadingSettings(viewmodel.value.shadingSettings),
        renderSettings: normalizeRenderSettings(viewmodel.value.renderSettings),
        sharpEdgeThreshold: Number(viewmodel.value.sharpEdgeThreshold),
        meshPrecision: Number(viewmodel.value.meshPrecision),
        workerCount: Number(viewmodel.value.workerCount),
        pointSize: viewmodel.value.pointSize,
        pointShape: viewmodel.value.pointShape,
        showGrid: viewmodel.value.showGrid,
        model1: { displayMode: viewmodel.value.model1.displayMode, edgesVisible: viewmodel.value.model1.edgesVisible, meshEdgesVisible: viewmodel.value.model1.meshEdgesVisible, nonSharpEdgesVisible: viewmodel.value.model1.nonSharpEdgesVisible, meshFaceEdgesVisible: viewmodel.value.model1.meshFaceEdgesVisible }
      }
      window.localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(payload))
      displaySettingsMessage.value = 'Display parameters saved locally'
    } catch (error) {
      console.error('Unable to save display settings:', error)
      displaySettingsMessage.value = 'Unable to save display parameters'
    }
  }

  function loadDisplaySettings () {
    try {
      const stored = window.localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY)
      if (stored == null) {
        displaySettingsMessage.value = 'No local display parameters found'
        return
      }
      const payload = JSON.parse(stored)
      // Apply the new meshing defaults once without resetting other display preferences.
      if (!(Number(payload.version) >= 5)) {
        payload.meshPrecision = DEFAULT_MESH_PRECISION
        payload.workerCount = DEFAULT_MESH_WORKER_COUNT
        payload.version = 5
        window.localStorage.setItem(VIEW_SETTINGS_STORAGE_KEY, JSON.stringify(payload))
      }
      viewmodel.value.edgeWidth = normalizeEdgeWidth(payload.edgeWidth)
      viewmodel.value.viewportSettings = normalizeViewportSettings(payload.viewportSettings)
      Object.assign(viewmodel.value.shadingSettings, normalizeShadingSettings(payload.shadingSettings))
      Object.assign(viewmodel.value.renderSettings, normalizeRenderSettings(payload.renderSettings))
      if (Number.isFinite(Number(payload.pointSize))) viewmodel.value.pointSize = Number(payload.pointSize)
      if (typeof payload.pointShape === 'string') viewmodel.value.pointShape = payload.pointShape
      if (typeof payload.showGrid === 'boolean') viewmodel.value.showGrid = payload.showGrid
      if (Number.isFinite(Number(payload.sharpEdgeThreshold))) viewmodel.value.sharpEdgeThreshold = Math.min(1, Math.max(0, Number(payload.sharpEdgeThreshold)))
      viewmodel.value.meshPrecision = loadMeshPrecision(payload.meshPrecision, payload.version)
      if (payload.workerCount != null && Number.isFinite(Number(payload.workerCount))) viewmodel.value.workerCount = Math.min(8, Math.max(0, Math.round(Number(payload.workerCount))))
      if (payload.model1 != null) Object.assign(viewmodel.value.model1, payload.model1)
      updatePointSize()
      PandaUIApp.updateVisibility()
      displaySettingsMessage.value = 'Local display parameters loaded'
    } catch (error) {
      console.error('Unable to load display settings:', error)
      displaySettingsMessage.value = 'Local display parameters are invalid'
    }
  }

  function resetDisplaySettings () {
    Object.assign(viewmodel.value.shadingSettings, createDefaultShadingSettings())
    Object.assign(viewmodel.value.renderSettings, createDefaultRenderSettings())
    viewmodel.value.sharpEdgeThreshold = 0.9
    viewmodel.value.meshPrecision = DEFAULT_MESH_PRECISION
    viewmodel.value.workerCount = DEFAULT_MESH_WORKER_COUNT
    viewmodel.value.pointSize = 8
    viewmodel.value.pointShape = 'square'
    viewmodel.value.edgeWidth = 1
    viewmodel.value.viewportSettings = normalizeViewportSettings()
    viewmodel.value.model1.nonSharpEdgesVisible = true
    updatePointSize()
    PandaUIApp.updateVisibility()
    displaySettingsMessage.value = 'Display parameters reset to defaults'
  }

  function updatePointSize () {
    PandaUIApp.setGraphPointSize(viewmodel.value.pointSize)
    PandaUIApp.setGraphPointShape(viewmodel.value.pointShape)
  }

  function updateViewportSettings () {
    PandaUIApp.getDisplayPipeline()?.setDirtyFlag()
  }

  function updateDisplayEnvironment (mode, clear) {
    if (mode === 'render') {
      if (clear) clearRenderEnvironment()
      else selectRenderEnvironment()
    } else {
      if (clear) clearShadingEnvironment()
      else selectShadingEnvironment()
    }
  }

  function selectEnvironment (loaderName) {
    const fileInput = document.createElement('input')

    fileInput.type = 'file'
    fileInput.accept = '.hdr,image/jpeg,image/png'
    fileInput.style.display = 'none'
    fileInput.onchange = async () => {
      const file = fileInput.files[0]
      document.body.removeChild(fileInput)
      if (file == null) return
      try {
        await PandaUIApp.getDisplayPipeline()[loaderName](file)
        PandaUIApp.updateVisibility()
      } catch (error) {
        console.error('Unable to load render environment:', error)
        window.alert(`Unable to load environment map: ${error.message}`)
      }
    }
    document.body.appendChild(fileInput)
    fileInput.click()
  }

  function selectRenderEnvironment () {
    selectEnvironment('loadRenderEnvironment')
  }

  function selectShadingEnvironment () {
    selectEnvironment('loadShadingEnvironment')
  }

  function clearRenderEnvironment () {
    PandaUIApp.getDisplayPipeline().clearRenderEnvironment()
    PandaUIApp.updateVisibility()
  }

  function clearShadingEnvironment () {
    PandaUIApp.getDisplayPipeline().clearShadingEnvironment()
    PandaUIApp.updateVisibility()
  }

  onMounted(() => {
    if (window.localStorage.getItem(VIEW_SETTINGS_STORAGE_KEY) != null) loadDisplaySettings()
    else PandaUIApp.updateVisibility()
  })

  return { displaySettingsMessage, meshingBusy, updateVisibility, setLayerVisibility, updateRenderSettings, updateShadingSettings, saveDisplaySettings, loadDisplaySettings, resetDisplaySettings, updatePointSize, updateViewportSettings, updateDisplayEnvironment, selectRenderEnvironment, selectShadingEnvironment, clearRenderEnvironment, clearShadingEnvironment }
}
