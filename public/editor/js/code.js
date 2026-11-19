window.PandaUIEditorReady = (async function (global) {
  if (global.PandaUIWorkspaceReady) await global.PandaUIWorkspaceReady
  var editor = new global.PandaUI.Editor('#main')
  var graph = editor.graph
  var graphDocument = graph.getGraphDocument()
  var privateGraphIdKey = 'pandaui-private-graph-id-v2:' + global.PandaUIWorkspaceToken
  var privateGraphBackupKey = 'pandaui-private-graph-backup-v2:' + global.PandaUIWorkspaceToken
  var initialDocumentId = (!global.PandaUIWorkspaceForked && global.sessionStorage.getItem(privateGraphIdKey)) || global.PandaUICrypto.randomUUID()
  global.sessionStorage.setItem(privateGraphIdKey, initialDocumentId)

  global.editor = editor
  global.graphcanvas = editor.graphcanvas
  global.graph = graph
  graph.documentId = initialDocumentId
  global.PandaUIGraphDocumentId = initialDocumentId
  global._pandauiGraphDocumentEpoch = 0

  graph.setStepMode(true)
  graph.onBeforeNodeSolution = function (node) { setNativeNodeState(node, 'running') }
  graph.onAfterNodeSolution = function (node) { setNativeNodeState(node, 'success') }
  graph.onNodeSolutionError = function (node, error) { setNativeNodeState(node, 'error', error) }
  graph.onNodeConnectionChange = function (direction, node) {
    graph.events.emit('connection-changed', { direction: direction, node: node })
    if (direction === global.PandaUI.INPUT) graph.invalidateNode(node, { propagate: true, reason: 'connection' })
  }

  function setNativeNodeState (node, state, error) {
    var definition = node && node.getComponentDefinition ? node.getComponentDefinition() : null
    if (!node || node._ghEntry || (definition && definition.metadata && definition.metadata.ghEntry) || (definition && definition.execution === 'wasm-package')) return
    node._executionState = state
    node._executionError = error ? (error.message || String(error)) : null
    if (node.getNodeAttributes) node.getNodeAttributes().setExecutionState(state, error)
    node.setDirtyCanvas(true, false)
  }

  function cancelRunningNodes () {
    graph._nodes.forEach(function (node) {
      if (typeof node.onExecutionCancelled === 'function') node.onExecutionCancelled()
    })
  }

  function saveGraph () {
    var data = JSON.stringify(graph.serialize())
    if (global.parent === global) localStorage.setItem('pandaui-editor-save', data)
    else global.parent.postMessage({ type: 'pandaui-editor-save', graph: data }, global.location.origin)
  }

  function configureGraph (data) {
    if (!data) return
    graphcanvas.cancelPointerInteraction()
    global._pandauiGraphSyncing = true
    try { graph.configure(typeof data === 'string' ? JSON.parse(data) : data) }
    finally { global._pandauiGraphSyncing = false }
    if (typeof global.syncPandaUIGhNodeInstances === 'function') global.syncPandaUIGhNodeInstances()
    graphcanvas.cancelPointerInteraction()
  }

  function restoreAvailableMissingNodes () {
    var missing = graph._nodes.filter(function (node) { return node._isMissingNode && global.PandaUI.nodeTypes[node.type] })
    if (!missing.length) return 0
    var snapshot = graph.serialize()
    var selectedIds = Object.keys(graphcanvas.selected_nodes)
    graphcanvas.cancelPointerInteraction()
    graph.configure(snapshot, { skipHistory: true })
    graphcanvas.selected_nodes = {}
    selectedIds.forEach(function (id) {
      var node = graph.getNodeById(id)
      if (node) graphcanvas.selectNode(node, true)
    })
    graph.setDirtyCanvas()
    return missing.length
  }

  global.PandaUINodeDocuments = {
    get id () { return global.PandaUIGraphDocumentId },
    capture: function () {
      return {
        graph: graph.serialize(), history: graph.history.capture(), editToken: graph.history.stateToken(),
        stepMode: graph.stepMode, view: { scale: graphcanvas.scale, offset: Array.from(graphcanvas.offset) }
      }
    },
    activate: async function (documentId, snapshot) {
      if (graph._asyncOperationActive || graph.history.transaction) throw new Error('Finish the active document operation before switching node documents.')
      var data = snapshot.graph
      var previousId = global.PandaUIGraphDocumentId
      var previousStepMode = graph.stepMode
      var manager = graph._nodes.find(function (node) { return node.panelId === 'EDITOR' })
      var managerPosition = manager ? Array.from(manager.pos) : [80, 80]
      graph.abortSolution()
      graph.stepMode = false
      global._pandauiGraphDocumentEpoch++
      global._pandauiGraphSyncing = true
      try {
        if (global.waitPandaUIGhNodeRequests) await global.waitPandaUIGhNodeRequests()
        if (!(global.PandaUIIsLocalBackendMode && global.PandaUIIsLocalBackendMode())) {
          var response = await fetch('/api/node/instances/close', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: previousId })
          })
          var result = await response.json()
          if (!response.ok || result.ok !== true) throw new Error(result.error || 'Could not release the previous node document.')
        }
        graphcanvas.cancelPointerInteraction()
        global.PandaUIGraphDocumentId = documentId
        graph.documentId = documentId
        global.sessionStorage.setItem(privateGraphIdKey, documentId)
        global.PandaUIBackendGeneration = ''
        graph.vars = {}
        graph.inputs = {}
        graph.outputs = {}
        graph.configure(data, { skipHistory: true })
        if (!graph._nodes.some(function (node) { return node.panelId === 'EDITOR' }) && global.PandaUI.nodeTypes['Panels/Editor']) {
          var panel = global.PandaUI.createNode('Panels/Editor')
          panel.pos = managerPosition
          graph.add(panel, { silent: true, record: false })
        }
        graph.history.restore(snapshot.history)
        graphcanvas.scale = snapshot.view && snapshot.view.scale || 1
        graphcanvas.offset = snapshot.view && snapshot.view.offset ? snapshot.view.offset.slice() : [0, 0]
        graphcanvas.selected_nodes = {}
        graphcanvas.cancelPointerInteraction()
      } catch (error) {
        graph.setStepMode(previousStepMode)
        throw error
      } finally {
        global._pandauiGraphSyncing = false
      }
      if (typeof global.syncPandaUIGhNodeInstances === 'function') await global.syncPandaUIGhNodeInstances()
      graph.setStepMode(snapshot.stepMode !== false)
      graph.setDirtyCanvas()
      if (global.PandaUISyncPanelNodes) global.PandaUISyncPanelNodes(graphcanvas, true)
      reportExecutionState('document')
    }
  }

  function downloadGraph () {
    var file = new Blob([JSON.stringify(graph.serialize())], { type: 'application/json' })
    var url = URL.createObjectURL(file)
    var element = document.createElement('a')
    element.href = url
    element.download = 'PandaUI.graph.json'
    element.hidden = true
    document.body.appendChild(element)
    element.click()
    element.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 60000)
  }

  function sendPluginCatalog () {
    if (global.parent === global || typeof global.getPandaUINodePluginCatalog !== 'function') return
    global.parent.postMessage({ type: 'pandaui-node-plugin-catalog', plugins: global.getPandaUINodePluginCatalog() }, global.location.origin)
  }

  global.addEventListener('pandaui-wasm-packages-loaded', function () {
    restoreAvailableMissingNodes()
    sendPluginCatalog()
  })

  global.PandaUIWasmPackagesReady = import('/editor/src/pandaui-wasm-packages.js?v=20261116-1')
    .then(function () { return global.PandaUIWasmPackages.ready })
    .catch(function (error) { console.error('Unable to initialize WASM node packages:', error) })

  function reportExecutionState (lastAction) {
    if (global.parent === global) return
    global.parent.postMessage({
      type: 'pandaui-editor-execution-state',
      stepMode: graphDocument.stepMode === true,
      canUndo: graph.canUndo(),
      canRedo: graph.canRedo(),
      lastAction: lastAction
    }, global.location.origin)
  }

  graph.events.on('document-restored', function () {
    if (typeof global.syncPandaUIGhNodeInstances === 'function') global.syncPandaUIGhNodeInstances()
    graphcanvas.cancelPointerInteraction()
  })
  graph.events.on('node-added', function (event) {
    var node = event.detail && event.detail.result
    if (node && typeof node.onExecute === 'function') graph.invalidateNode(node, { source: true, reason: 'node-added' })
  })
  graph.events.on('history-changed', function (event) {
    if (['undo', 'redo', 'rollback'].indexOf(event.detail.reason) >= 0) {
      graphcanvas.cancelPointerInteraction()
      Object.keys(graphcanvas.selected_nodes).forEach(function (id) {
        var current = graph.getNodeById(id)
        if (current) graphcanvas.selected_nodes[id] = current
        else delete graphcanvas.selected_nodes[id]
      })
      if (graphcanvas.selected_group) graphcanvas.selected_group = graph._groups.find(function (group) { return group.id === graphcanvas.selected_group.id }) || null
    }
    reportExecutionState('history')
    if (!global._pandauiGraphSyncing && global.parent !== global) global.parent.dispatchEvent(new CustomEvent('pandaui-node-document-change', { detail: { editToken: graph.history.stateToken() } }))
  })

  function applyHistoryAction (action) {
    function failed (error) {
      global.parent.postMessage({ type: 'pandaui-editor-status', error: true, status: action + ' failed: ' + error.message }, global.location.origin)
      return false
    }
    try {
      var result = graph[action]()
      if (result && typeof result.then === 'function') return result.then(function (changed) { reportExecutionState(action); return changed }, failed)
      reportExecutionState(action)
      return result
    } catch (error) { return failed(error) }
  }

  global.addEventListener('keydown', function (event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    var targetName = event.target && event.target.localName
    if (targetName === 'input' || targetName === 'textarea' || (event.target && event.target.isContentEditable)) return
    var key = String(event.key || '').toLowerCase()
    var documentCommand = key === 's' ? (event.shiftKey ? 'save-as' : 'save') : key === 'o' ? 'open' : key === 'n' ? 'new' : null
    if (documentCommand && global.parent !== global) {
      event.preventDefault()
      event.stopImmediatePropagation()
      global.parent.postMessage({ type: 'pandaui-node-document-command', command: documentCommand }, global.location.origin)
      return
    }
    var handled = key === 'z' && !event.shiftKey
      ? applyHistoryAction('undo')
      : ((key === 'z' && event.shiftKey) || key === 'y' ? applyHistoryAction('redo') : false)
    if (handled) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }, true)

  global.addEventListener('pointerdown', function () {
    if (global.parent !== global) global.parent.postMessage({ type: 'pandaui-editor-pointerdown' }, global.location.origin)
  }, true)

  global.addEventListener('resize', function () { graphcanvas.resize() })

  global.addEventListener('message', function (event) {
    if (event.origin !== global.location.origin || !event.data) return
    if (event.data.type === 'pandaui-editor-mode') {
      graphcanvas.setEditorMode(event.data.active === true)
      return
    }
    if (event.data.type !== 'pandaui-editor-command') return
    var command = event.data.command
    if (command === 'save') saveGraph()
    else if (command === 'load') global.parent.postMessage({ type: 'pandaui-editor-load' }, global.location.origin)
    else if (command === 'configure') {
      try { configureGraph(event.data.value) }
      catch (error) { global.parent.postMessage({ type: 'pandaui-editor-status', status: 'Saved graph is invalid.' }, global.location.origin) }
    } else if (command === 'download') downloadGraph()
    else if (command === 'undo') applyHistoryAction('undo')
    else if (command === 'redo') applyHistoryAction('redo')
    else if (command === 'select-all') { graphcanvas.selectAll(); graphcanvas.setDirty() }
    else if (command === 'fit-view') { graphcanvas.fitView(); graphcanvas.setDirty() }
    else if (command === 'reset-view') { graphcanvas.resetView(); graphcanvas.setDirty() }
    else if (command === 'snap-to-grid') { graphcanvas.snapToGrid = !graphcanvas.snapToGrid; graphcanvas.setDirty() }
    else if (command === 'step-mode-toggle') {
      var enabled = !graphDocument.stepMode
      if (!enabled) cancelRunningNodes()
      graphDocument.setStepMode(enabled)
      if (enabled) graphDocument.flushDirty()
      reportExecutionState(enabled ? 'step-on' : 'step-off')
    } else if (command === 'step') {
      graphDocument.solveAll()
      reportExecutionState('step')
    } else if (command === 'plugins') sendPluginCatalog()
    else if (command === 'register-gh-catalog') {
      if (typeof global.registerPandaUIGhCatalog === 'function') global.registerPandaUIGhCatalog(event.data.value)
      restoreAvailableMissingNodes()
      // A local workspace can reconnect without recreating its graph/iframe.
      if (typeof global.syncPandaUIGhNodeInstances === 'function') global.syncPandaUIGhNodeInstances()
      sendPluginCatalog()
    } else if (command === 'plugin-states') {
      if (typeof global.applyPandaUINodePluginStates === 'function') global.applyPandaUINodePluginStates(event.data.value)
      sendPluginCatalog()
    } else if (command === 'install-plugin') {
      var install = typeof global.installPandaUINodePluginSource === 'function'
        ? global.installPandaUINodePluginSource(event.data.value && event.data.value.source, event.data.value && event.data.value.name)
        : { error: 'Plugin installer is unavailable.' }
      global.parent.postMessage(install.error
        ? { type: 'pandaui-node-plugin-installed', error: install.error }
        : { type: 'pandaui-node-plugin-installed', pluginId: install.plugin.id }, global.location.origin)
      if (!install.error) sendPluginCatalog()
      if (!install.error) restoreAvailableMissingNodes()
    }
  })

  global.onbeforeunload = function () {
    global.sessionStorage.setItem(privateGraphBackupKey, JSON.stringify(graph.serialize()))
    if (typeof global.closePandaUIGhNodeDocument === 'function') global.closePandaUIGhNodeDocument()
  }


  var privateBackup = global.sessionStorage.getItem(privateGraphBackupKey)
  if (privateBackup) {
    try { configureGraph(privateBackup) } catch (error) { console.warn('Unable to restore the private graph:', error) }
  }
  reportExecutionState('ready')
})(window)
