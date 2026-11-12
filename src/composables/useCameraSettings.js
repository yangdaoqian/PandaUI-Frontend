import PandaUIApp from '../PandaUIApp'
import { onMounted, ref } from 'vue'

export default function useCameraSettings ({ viewmodel, closeViewPresets }) {
  const panMode = ref(false)

  const cameraSettings = ref({
    projection: 'perspective',
    fov: 45,
    orthographicHeight: 40,
    near: 0.01,
    far: 1000,
    position: { x: 40, y: -40, z: 56.5685 },
    target: { x: 0, y: 0, z: 0 }
  })

  const cameraProjectionOptions = [
    { label: 'Perspective', value: 'perspective' },
    { label: 'Orthographic', value: 'orthographic' }
  ]

  function refreshCameraSettings () {
    cameraSettings.value = PandaUIApp.getDisplayPipeline().getCameraSettings()
  }

  function applyCameraSettings () {
    PandaUIApp.getDisplayPipeline().setCameraSettings(cameraSettings.value)
    refreshCameraSettings()
  }

  function resetTopView () {
    PandaUIApp.getDisplayPipeline().resetToTopView()
    refreshCameraSettings()
    panMode.value = true
  }

  function perspectiveCamera () {
    return viewmodel.value.perspectiveCamera
  }

  function setProjection (perspective) {
    const projectionChanged = PandaUIApp.viewModel().perspectiveCamera !== perspective
    // 3D perspective always restores orbit rotation; 2D plans use panning.
    panMode.value = !perspective
    if (projectionChanged) {
      PandaUIApp.viewModel().perspectiveCamera = perspective
      PandaUIApp.getDisplayPipeline().zoomExtents(true)
    }
    setLeftButtonMode()
  }

  function setViewPreset (preset) {
    PandaUIApp.getDisplayPipeline().setViewPreset(preset)
    refreshCameraSettings()
    viewmodel.value.perspectiveCamera = false
    panMode.value = preset !== 'axonometric'
    closeViewPresets()
  }

  function reset3DView () {
    PandaUIApp.getDisplayPipeline().reset3DView()
    refreshCameraSettings()
    panMode.value = false
    setLeftButtonMode()
  }

  function zoomSceneExtents () {
    PandaUIApp.getDisplayPipeline().zoomSceneExtents()
    refreshCameraSettings()
  }

  function setLeftButtonMode () {
    PandaUIApp.getDisplayPipeline().setPanMode(panMode.value || !PandaUIApp.viewModel().perspectiveCamera)
  }

  onMounted(refreshCameraSettings)

  return { panMode, cameraSettings, cameraProjectionOptions, refreshCameraSettings, applyCameraSettings, resetTopView, perspectiveCamera, setProjection, setViewPreset, reset3DView, zoomSceneExtents }
}
