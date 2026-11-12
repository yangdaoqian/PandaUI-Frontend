import PandaUIApp from '../PandaUIApp'
import { onMounted, onUnmounted, ref } from 'vue'

export default function useRenderMaterials ({ editorMode }) {
  const renderMaterials = ref([])

  const selectedRenderMaterial = ref(null)

  const selectedSceneObject = ref(null)

  const materialTextureFile = ref(null)

  const shadeMaterial = ref(null)

  const materialTypeOptions = [
    { label: 'General', value: 'general' },
    { label: 'Glass', value: 'glass' },
    { label: 'Metal', value: 'metal' },
    { label: 'Plastic', value: 'plastic' },
    { label: 'Emissive', value: 'emissive' },
    { label: 'Paint / Coating', value: 'paint' },
    { label: 'Textured', value: 'textured' }
  ]

  const materialTypeLabel = value => materialTypeOptions.find(option => option.value === value)?.label || 'General'

  const uvWrapOptions = [
    { label: 'Repeat', value: 1000 },
    { label: 'Clamp to edge', value: 1001 }
  ]

  function setMaterialEditorValue (material) {
    selectedRenderMaterial.value = material == null ? null : { ...material }
    materialTextureFile.value = null
  }

  function refreshRenderMaterials (preferredId = null) {
    const currentId = preferredId || selectedRenderMaterial.value?.id || PandaUIApp.getSelectedRenderMaterialId()
    renderMaterials.value = PandaUIApp.getRenderMaterials()
    const selected = renderMaterials.value.find(material => material.id === currentId) || renderMaterials.value[0] || null
    setMaterialEditorValue(selected)
  }

  function selectRenderMaterial (material) {
    setMaterialEditorValue(material)
  }

  function selectMaterialObject () {
    const pipeline = PandaUIApp.getDisplayPipeline()
    if (!pipeline) return
    pipeline.beginObjectSelection(() => {
      refreshRenderMaterials(PandaUIApp.getSelectedRenderMaterialId())
      editorMode.value = true
    })
    editorMode.value = false
  }

  function createRenderMaterial () {
    const created = PandaUIApp.createRenderMaterial('Material ' + (renderMaterials.value.length + 1))
    if (created == null) return
    refreshRenderMaterials(created.id)
  }

  function updateRenderMaterial () {
    const settings = selectedRenderMaterial.value
    if (settings == null) return
    const updated = PandaUIApp.updateRenderMaterial(settings.id, settings)
    if (updated == null) return
    const index = renderMaterials.value.findIndex(material => material.id === updated.id)
    if (index >= 0) renderMaterials.value.splice(index, 1, updated)
    selectedRenderMaterial.value = { ...updated }
  }

  function resetRenderMaterial () {
    const id = selectedRenderMaterial.value?.id
    if (id == null) return
    const updated = PandaUIApp.resetRenderMaterial(id)
    if (updated != null) refreshRenderMaterials(updated.id)
  }

  function assignSelectedRenderMaterial () {
    const id = selectedRenderMaterial.value?.id
    if (id == null) return
    PandaUIApp.assignSelectedRenderMaterial(id)
  }

  function updateShadeMaterial () {
    if (shadeMaterial.value == null) return
    const settings = {
      color: shadeMaterial.value.color,
      opacity: Number(shadeMaterial.value.opacity),
      transparent: Number(shadeMaterial.value.opacity) < 0.995
    }
    if (PandaUIApp.updateSelectedShadingMaterial(settings)) {
      shadeMaterial.value = { ...shadeMaterial.value, ...PandaUIApp.getSelectedShadingMaterialSettings() }
    }
  }

  async function loadRenderMaterialTexture (file) {
    const id = selectedRenderMaterial.value?.id
    const textureFile = Array.isArray(file) ? file[0] : file
    if (id == null || textureFile == null) return
    materialTextureFile.value = null
    try {
      const updated = await PandaUIApp.setRenderMaterialTexture(id, textureFile)
      if (updated != null) refreshRenderMaterials(updated.id)
    } catch (error) {
      console.error('Failed to apply render material texture:', error)
    }
  }

  function clearRenderMaterialTexture () {
    const id = selectedRenderMaterial.value?.id
    if (id == null) return
    const updated = PandaUIApp.clearRenderMaterialTexture(id)
    if (updated != null) refreshRenderMaterials(updated.id)
  }

  let unsubscribeSelection = null

  onMounted(() => {
    unsubscribeSelection = PandaUIApp.onSelectionChanged(selection => {
      refreshRenderMaterials()
      selectedSceneObject.value = selection
      shadeMaterial.value = PandaUIApp.getSelectedShadingMaterialSettings()
      const materialId = PandaUIApp.getSelectedRenderMaterialId()
      if (materialId != null) {
        const material = renderMaterials.value.find(item => item.id === materialId)
        if (material != null) selectRenderMaterial(material)
      }
    })

  })
  onUnmounted(() => unsubscribeSelection?.())

  return { renderMaterials, selectedRenderMaterial, selectedSceneObject, materialTextureFile, shadeMaterial, materialTypeOptions, materialTypeLabel, uvWrapOptions, refreshRenderMaterials, selectRenderMaterial, selectMaterialObject, createRenderMaterial, updateRenderMaterial, resetRenderMaterial, assignSelectedRenderMaterial, updateShadeMaterial, loadRenderMaterialTexture, clearRenderMaterialTexture }
}
