import { onMounted, onUnmounted, ref } from 'vue'

export default function useNodePlugins ({ runEditorCommand, editorFrameLoaded }) {
  const requests = new AbortController()
  let catalogRequest = 0, pluginRequest = 0, modeRequest = 0
  const nodePlugins = ref([])

  const expandedPluginIds = ref([])

  const nodePluginStates = ref(loadNodePluginStates())

  const nodePluginSources = ref(loadNodePluginSources())

  const folderNodePluginSources = ref([])

  const nodePluginFile = ref(null)

  const pluginInstallMessage = ref('')

  const pendingNodePlugin = ref(null)

  const pendingNodeCatalog = ref(null)

  const catalogLoaded = ref(false)

  const catalogCount = ref(0)

  const catalogError = ref('')

  function localBackendMode () {
    try { return (window.parent?.PandaUIBackendMode || window.PandaUIBackendMode) === 'local' } catch (_) { return window.PandaUIBackendMode === 'local' }
  }

  async function fetchCatalog (local) {
    const response = await fetch(local ? '/editor/local-node-catalog.json' : '/api/node/catalog', { cache: 'no-store', signal: requests.signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Unable to load node catalog.')
    const catalog = Array.isArray(data.catalog) ? data.catalog : Array.isArray(data) ? data : null
    if (!catalog) throw new Error('Invalid node catalog.')
    return catalog
  }

  function loadNodePluginStates () {
    try {
      const saved = window.localStorage.getItem('pandaui-node-plugin-states')
      return saved == null ? {} : JSON.parse(saved)
    } catch (error) {
      console.warn('Unable to restore node plugin states:', error)
      return {}
    }
  }

  function loadNodePluginSources () {
    try {
      const saved = window.localStorage.getItem('pandaui-node-plugin-sources')
      return saved == null ? [] : JSON.parse(saved)
    } catch (error) {
      console.warn('Unable to restore node plugin sources:', error)
      return []
    }
  }

  function saveNodePluginSources () {
    try {
      window.localStorage.setItem('pandaui-node-plugin-sources', JSON.stringify(nodePluginSources.value))
    } catch (error) {
      console.warn('Unable to save node plugin sources:', error)
    }
  }

  function isPluginInstalled (plugin) {
    return nodePluginStates.value[plugin.id]?.installed !== false
  }

  function isPluginEnabled (plugin) {
    const state = nodePluginStates.value[plugin.id]
    return state?.installed !== false && state?.enabled !== false
  }

  function applyNodePluginStates () {
    try {
      window.localStorage.setItem('pandaui-node-plugin-states', JSON.stringify(nodePluginStates.value))
    } catch (error) {
      console.warn('Unable to save node plugin states:', error)
    }
    runEditorCommand('plugin-states', nodePluginStates.value)
  }

  function setPluginInstalled (plugin, installed) {
    nodePluginStates.value = { ...nodePluginStates.value, [plugin.id]: { installed, enabled: installed } }
    applyNodePluginStates()
  }

  function setPluginEnabled (plugin, enabled) {
    nodePluginStates.value = { ...nodePluginStates.value, [plugin.id]: { installed: isPluginInstalled(plugin), enabled } }
    applyNodePluginStates()
  }

  function togglePluginDetails (id) {
    expandedPluginIds.value = expandedPluginIds.value.includes(id)
      ? expandedPluginIds.value.filter(value => value !== id)

      : [...expandedPluginIds.value, id]
  }

  function nodeCountForPlugin (plugin) {
    if (plugin.groups && plugin.groups.length) {
      var total = 0
      plugin.groups.forEach(function (g) {
        (g.categories || []).forEach(function (c) { total += (c.nodes || []).length })
      })
      return total
    }
    return (plugin.nodes || []).length
  }

  function requestNodePlugins () {
    const sources = [...folderNodePluginSources.value, ...nodePluginSources.value]
    const installedSources = new Set()
    sources.forEach(plugin => {
      if (installedSources.has(plugin.source)) return
      installedSources.add(plugin.source)
      runEditorCommand('install-plugin', plugin)
    })
    runEditorCommand('plugins')
    applyNodePluginStates()
  }

  async function loadNodeCatalog () {
    const generation = ++catalogRequest
    catalogError.value = ''
    catalogLoaded.value = false
    pendingNodeCatalog.value = null
    try {
      let catalog
      try { catalog = await fetchCatalog(localBackendMode()) } catch (error) {
        if (requests.signal.aborted || generation !== catalogRequest) return
        // The parent can discover an unavailable backend while this request is
        // in flight. Authentication and other server errors are not offline mode.
        if (error.code !== 'BACKEND_UNAVAILABLE') throw error
        catalog = await fetchCatalog(true)
      }
      if (requests.signal.aborted || generation !== catalogRequest) return
      catalogCount.value = catalog.length
      if (!editorFrameLoaded.value) {
        pendingNodeCatalog.value = catalog
        return
      }
      runEditorCommand('register-gh-catalog', catalog)
      catalogLoaded.value = true
    } catch (error) {
      if (requests.signal.aborted || generation !== catalogRequest) return
      console.warn('Unable to load node catalog from the adapter:', error)
      catalogError.value = error.message || 'Failed to load catalog'
    }
  }

  async function loadFolderNodePlugins (refreshEditor = true) {
    const generation = ++pluginRequest
    if (localBackendMode()) {
      folderNodePluginSources.value = []
      return
    }
    try {
      const response = await fetch('/api/node-plugins', { cache: 'no-store', signal: requests.signal })
      const data = await response.json()
      if (requests.signal.aborted || generation !== pluginRequest) return
      if (!response.ok) throw new Error(data.error || 'Unable to load bundled plugins.')
      folderNodePluginSources.value = Array.isArray(data.plugins) ? data.plugins.filter(plugin => typeof plugin?.source === 'string') : []
      if (refreshEditor && editorFrameLoaded.value && catalogLoaded.value) requestNodePlugins()
    } catch (error) {
      if (requests.signal.aborted || generation !== pluginRequest) return
      if (error.code === 'BACKEND_UNAVAILABLE') { folderNodePluginSources.value = []; return }
      console.warn('Unable to load plugins from the plugins folder:', error)
    }
  }

  async function installNodePlugin (file) {
    const pluginFile = Array.isArray(file) ? file[0] : file
    if (pluginFile == null) return
    try {
      const source = await pluginFile.text()
      pluginInstallMessage.value = `Installing ${pluginFile.name}...`
      pendingNodePlugin.value = { name: pluginFile.name, source }
      runEditorCommand('install-plugin', pendingNodePlugin.value)
    } catch (error) {
      console.error('Unable to read node plugin:', error)
      pluginInstallMessage.value = 'Unable to read plugin file'
    } finally {
      nodePluginFile.value = null
    }
  }

  function onPluginCatalog (message) {
    nodePlugins.value = Array.isArray(message.plugins) ? message.plugins : []
  }

  function onPluginInstalled (message) {
    if (message.error) {
      pluginInstallMessage.value = message.error
      pendingNodePlugin.value = null
    } else if (pendingNodePlugin.value != null) {
      const plugin = pendingNodePlugin.value
      if (!nodePluginSources.value.some(item => item.source === plugin.source)) {
        nodePluginSources.value = [...nodePluginSources.value, plugin]
        saveNodePluginSources()
      }
      nodePluginStates.value = { ...nodePluginStates.value, [message.pluginId]: { installed: true, enabled: true } }
      pluginInstallMessage.value = 'Plugin installed'
      pendingNodePlugin.value = null
      applyNodePluginStates()
    }
  }

  function flushPendingCatalog () {
    if (pendingNodeCatalog.value == null) return
    runEditorCommand('register-gh-catalog', pendingNodeCatalog.value)
    catalogCount.value = pendingNodeCatalog.value.length
    pendingNodeCatalog.value = null
    catalogLoaded.value = true
  }
  async function onBackendMode (event) {
    if (!['local', 'online'].includes(event.detail?.mode) || requests.signal.aborted) return
    const generation = ++modeRequest
    await Promise.all([loadNodeCatalog(), loadFolderNodePlugins(false)])
    if (!requests.signal.aborted && generation === modeRequest && editorFrameLoaded.value && catalogLoaded.value) requestNodePlugins()
  }
  onMounted(() => {
    window.addEventListener('pandaui-backend-mode', onBackendMode)
    return loadFolderNodePlugins()
  })
  onUnmounted(() => {
    window.removeEventListener('pandaui-backend-mode', onBackendMode)
    requests.abort()
  })

  return { nodePlugins, expandedPluginIds, nodePluginStates, nodePluginSources, folderNodePluginSources, nodePluginFile, pluginInstallMessage, pendingNodePlugin, catalogLoaded, catalogCount, catalogError, isPluginInstalled, isPluginEnabled, setPluginInstalled, setPluginEnabled, togglePluginDetails, nodeCountForPlugin, requestNodePlugins, loadNodeCatalog, installNodePlugin, flushPendingCatalog, onPluginCatalog, onPluginInstalled }
}
