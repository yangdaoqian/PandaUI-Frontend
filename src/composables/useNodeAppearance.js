import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import NodeAppearance from '../../public/editor/src/PandaUI/NodeAppearance'

const storageKey = 'pandaui-node-appearance-v1'

export default function useNodeAppearance () {
  let saved
  try { saved = JSON.parse(localStorage.getItem(storageKey)) } catch {}
  const nodeAppearance = reactive(NodeAppearance.normalize(saved))
  const appearanceStorageError = ref(false)
  const previousStyles = new Map()

  function applyNodeAppearance () {
    const settings = NodeAppearance.normalize(nodeAppearance)
    Object.entries(NodeAppearance.cssVariables(settings)).forEach(([key, value]) => {
      const style = document.documentElement.style
      if (!previousStyles.has(key)) previousStyles.set(key, style.getPropertyValue(key))
      style.setProperty(key, value)
    })
    document.getElementById('editorFrame')?.contentWindow?.graphcanvas?.setAppearance(settings)
  }

  function updateNodeAppearance (key, value) {
    if (!Object.prototype.hasOwnProperty.call(NodeAppearance.defaults, key)) return
    Object.assign(nodeAppearance, NodeAppearance.normalize({ ...nodeAppearance, [key]: value }))
  }

  function resetNodeAppearance () { Object.assign(nodeAppearance, NodeAppearance.defaults) }

  watch(nodeAppearance, () => {
    applyNodeAppearance()
    try {
      localStorage.setItem(storageKey, JSON.stringify(nodeAppearance))
      appearanceStorageError.value = false
    } catch { appearanceStorageError.value = true }
  })
  onMounted(applyNodeAppearance)
  onUnmounted(() => previousStyles.forEach((value, key) => {
    if (value) document.documentElement.style.setProperty(key, value)
    else document.documentElement.style.removeProperty(key)
  }))
  return { nodeAppearance, appearanceStorageError, updateNodeAppearance, resetNodeAppearance, applyNodeAppearance }
}
