(function (global) {
  var PandaUI = global.PandaUI
  var DataTree = global.PandaUIKernel && global.PandaUIKernel.DataTree
  var defaultPreviewColor = 0xff69b4
  var defaultPreviewOpacity = 0.75
  var parameterPickSession = null
  var backendInputCaches = new WeakMap()
  var backendRequests = new WeakMap()

  function localBackendMode () {
    try { return (global.parent && global.parent.PandaUIBackendMode || global.PandaUIBackendMode) === 'local' } catch (_) { return global.PandaUIBackendMode === 'local' }
  }
  global.PandaUIIsLocalBackendMode = localBackendMode

  function backendUnavailable () {
    var error = new Error('Backend unavailable. Local features remain available.')
    error.code = 'BACKEND_UNAVAILABLE'
    return error
  }

  function releaseBackendInputs (node) {
    var request = backendRequests.get(node)
    backendRequests.delete(node)
    backendInputCaches.delete(node)
    if (request) request.controller.abort()
  }

  function inputSourceState (node, port, index) {
    var state = [port, index, port.name, port.type]
    var links = node.getInputLinks ? node.getInputLinks(index) : (port.link == null ? [] : [port.link])
    links.forEach(function (id) {
      var link = node.graph && node.graph.links.get(String(id))
      var source = link && node.graph.getNodeById(link.origin_id)
      var output = source && source.outputs[link.origin_slot]
      state.push(id, output, output && output._dataRevision, output && output._data)
    })
    if (!links.length) state.push(JSON.stringify(node.properties.sceneValues || null))
    return state
  }

  function sameInputSource (previous, current) {
    return previous && previous.length === current.length && previous.every(function (value, index) { return Object.is(value, current[index]) })
  }
  function geometryDataType (type) {
    return typeof type === 'string' ? type.replace(/^rhino\./, 'panda.') : type
  }
  function parameterPickType (entry) {
    if (!entry || !entry.isParam) return null
    var type = String(entry.outputs && entry.outputs[0] && entry.outputs[0].type || '').toLowerCase()
    if (entry.name === 'Mesh Face') return null
    return ['circle', 'line', 'point', 'brep', 'surface', 'mesh', 'curve', 'geometry'].indexOf(type) !== -1 ? type : null
  }
  function commitParameterValues (node, values) {
    node.properties.sceneValues = values
    if (node.graph) {
      node.graph.invalidateNode(node, { propagate: true, reason: 'parameter-scene-values' })
      node.graph.commitHistory('parameter-scene-values', node)
    }
    node.setDirtyCanvas(true)
  }
  global.addEventListener('message', function (event) {
    var message = event.data
    if (event.origin !== global.location.origin || event.source !== global.parent || !message || message.type !== 'pandaui-parameter-picked') return
    var session = parameterPickSession
    if (!session || session.token !== message.token) return
    parameterPickSession = null
    if (!message.cancelled && session.node.graph && Array.isArray(message.values) && message.values.length) commitParameterValues(session.node, message.values)
  })
  if (typeof DataTree !== 'function') throw new Error('PandaUIKernel.DataTree is not loaded.')
  function setNodeExecutionState (node, state, error) {
    if (node && typeof node.setExecutionState === 'function') node.setExecutionState(state, error)
    else {
      node._executionState = state
      if (error !== undefined) node._executionError = error ? (error.message || String(error)) : null
      if (node.getNodeAttributes) node.getNodeAttributes().setExecutionState(state, error)
      node.setDirtyCanvas(true)
    }
  }
  var plugins = [
    {
      id: 'nodec-control-points',
      name: 'NodeC Control Points',
      version: '1.0.0',
      icon: 'edit',
      description: 'Read and edit native curve and surface control points.',
      prefixes: ['NodeC/Edit/']
    },
    {
      id: 'pandaui-geometry',
      name: 'PandaUI Geometry',
      version: '1.0.0',
      icon: 'architecture',
      description: 'Nodes that exchange geometry data with the PandaUI Three.js viewport.',
      types: ['geometry/draw_point', 'geometry/get_curve', 'geometry/divide_curve', 'display/clipping_plane']
    },
    {
      id: 'pandaui-widgets',
      name: 'PandaUI Widgets',
      version: '1.0.0',
      icon: 'tune',
      description: 'PandaUI input widgets for graph parameters.',
      types: ['widget/slider', 'Input/Sketch Widget']
    },
    {
      id: 'pandaui-kuka-robot',
      name: 'Kuka Robot',
      version: '1.0.0',
      icon: 'precision_manufacturing',
      description: 'Ten robot transforms plus an optional eleventh transform for picked Tool objects.',
      types: ['robot/kuka2700']
    }
  ]

  function typesForPlugin (plugin) {
    var types = (plugin.types || []).slice()
    Object.keys(PandaUI.nodeTypes).forEach(function (type) {
      if (!(plugin.prefixes || []).some(function (prefix) { return type.indexOf(prefix) === 0 })) return
      if ((plugin.exclude || []).indexOf(type) === -1) types.push(type)
    })
    return Array.from(new Set(types)).filter(function (type) { return PandaUI.nodeTypes[type] != null })
  }

  function catalog () {
    return plugins.map(function (plugin) {
      var result = Object.assign({}, plugin)
      if (plugin.groups && plugin.groups.length) {
        var flat = []
        plugin.groups.forEach(function (group) {
          (group.categories || []).forEach(function (cat) {
            (cat.nodes || []).forEach(function (node) { flat.push(node) })
          })
        })
        result.nodes = flat.sort(function (a, b) { return a.name.localeCompare(b.name) })
      } else {
        result.nodes = typesForPlugin(plugin).map(function (type) {
          var node = PandaUI.nodeTypes[type]
          return { type: type, name: node.title || type, description: node.desc || type }
        }).sort(function (left, right) { return left.name.localeCompare(right.name) })
      }
      if (plugin.groups) result.groups = plugin.groups
      delete result.types
      delete result.prefixes
      delete result.exclude
      return result
    })
  }

  function applyStates (states) {
    states = states || {}
    plugins.forEach(function (plugin) {
      var state = states[plugin.id] || {}
      var enabled = state.installed !== false && state.enabled !== false
      typesForPlugin(plugin).forEach(function (type) {
        PandaUI.nodeTypes[type].pandauiPluginEnabled = enabled
      })
    })
    global.dispatchEvent(new CustomEvent('pandaui-node-plugins-changed'))
  }

  function installPluginSource (source, fileName) {
    var before = Object.keys(PandaUI.nodeTypes)
    global.PandaUINodePlugin = null
    try {
      new Function('PandaUI', 'window', String(source))(PandaUI, global)
    } catch (error) {
      return { error: 'Plugin execution failed: ' + error.message }
    }
    var plugin = global.PandaUINodePlugin
    if (plugin == null || typeof plugin.id !== 'string' || typeof plugin.name !== 'string') {
      return { error: 'Plugin must assign window.PandaUINodePlugin with id and name.' }
    }
    if (plugins.some(function (item) { return item.id === plugin.id })) {
      return { error: 'A plugin with this id is already installed.' }
    }
    var registeredTypes = Object.keys(PandaUI.nodeTypes).filter(function (type) { return before.indexOf(type) === -1 })
    plugin.version = String(plugin.version || '1.0.0')
    plugin.icon = String(plugin.icon || 'extension')
    plugin.description = String(plugin.description || fileName || 'Custom PandaUI node plugin.')
    plugin.types = Array.isArray(plugin.types) && plugin.types.length > 0 ? plugin.types : registeredTypes
    plugins.push(plugin)
    global.PandaUINodePlugin = null
    global.dispatchEvent(new CustomEvent('pandaui-node-plugins-changed'))
    return { plugin: plugin }
  }

  function runtimeMessageList (messages, key) {
    var values = messages && Array.isArray(messages[key]) ? messages[key] : []
    return values.map(function (value) { return String(value) })
  }

  function graphDocumentId () {
    return global.PandaUIGraphDocumentId || 'graph-workspace'
  }

  var pendingNodeRequests = new Set()
  var instantiatedDocuments = new Set()

  function trackNodeRequest (request) {
    pendingNodeRequests.add(request)
    request.finally(function () { pendingNodeRequests.delete(request) }).catch(function () {})
    return request
  }

  global.waitPandaUIGhNodeRequests = function () { return Promise.allSettled(Array.from(pendingNodeRequests)) }

  function componentDefinition (node) {
    return node && node.getComponentDefinition ? node.getComponentDefinition() : null
  }

  function ghEntryForNode (node) {
    var definition = componentDefinition(node)
    return definition && definition.metadata && definition.metadata.ghEntry
      ? definition.metadata.ghEntry
      : node && node._ghEntry
  }

  function backendDefinitionId (node) {
    var definition = componentDefinition(node)
    var entry = ghEntryForNode(node)
    if (!entry) return null
    return definition && (definition.guid || definition.id) || entry.id || null
  }

  function isParamReference (value) {
    return value != null && typeof value === 'object' && value.kind === 'paramRef'
  }

  function linkedSource (node, port) {
    if (!node || !node.graph || !node.graph.links || !port || port.link == null) return null
    if (port.links && port.links.length > 1) return null
    var link = node.graph.links.get(String(port.link))
    if (!link) return null
    var source = node.graph.getNodeById(link.origin_id)
    return source ? { node: source, portIndex: Number(link.origin_slot) || 0 } : null
  }

  function frontendValueReference (value) {
    if (value && typeof value === 'object' && (value.kind || value.__geo)) return value
    var type = value == null ? 'null' : (Array.isArray(value) ? 'array' : typeof value)
    return { kind: 'structRef', type: type, data: value }
  }

  function frontendDataTreeSummary (value) {
    var wire = toGhPortPayload(value)
    Object.keys(wire).forEach(function (key) {
      var tuple = wire[key]
      if (!Array.isArray(tuple) || !Array.isArray(tuple[1])) return
      tuple[1] = tuple[1].map(frontendValueReference)
    })
    return wire
  }

  function frontendParamReference (node, port, value, documentId, solutionGeneration) {
    if (isParamReference(value)) return value
    var source = linkedSource(node, port)
    if (!source || backendDefinitionId(source.node)) return null
    var sourcePort = source.node.outputs && source.node.outputs[source.portIndex]
    var summary
    if (value && value._isDualData && value.display && value.display.treeData) {
      summary = frontendDataTreeSummary(value.display.treeData)
    } else if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.path) && Array.isArray(value.datas)) {
      summary = frontendDataTreeSummary(value)
    } else {
      summary = frontendDataTreeSummary(buildWidgetTreeData(value))
    }
    var sourceRevision = Number(source.node.dataRevision || source.node._dataRevision || source.node.version || source.node._version || solutionGeneration || 0)
    return {
      kind: 'paramRef',
      backendGeneration: String(global.PandaUIBackendGeneration || ''),
      documentId: documentId,
      componentInstanceId: String(source.node.id),
      paramInstanceId: String(sourcePort && (sourcePort.paramInstanceId || sourcePort.instanceGuid || sourcePort.guid) || ('frontend:' + source.node.id + ':output:' + source.portIndex)),
      paramIndex: source.portIndex,
      direction: 'output',
      solutionGeneration: Number(solutionGeneration || 0),
      dataRevision: isFinite(sourceRevision) ? sourceRevision : 0,
      dataTreeSummary: summary
    }
  }

  function releaseBackendGeometry (data) {
    ;(Array.isArray(data && data.releasedGeometryIds) ? data.releasedGeometryIds : []).forEach(function (geometryId) {
      if (global.parent !== global) global.parent.postMessage({ type: 'pandaui-release-geometry', documentId: data.documentId || graphDocumentId(), geometryId: geometryId }, global.location.origin)
    })
  }

  function updateGraphDocumentId (data, epoch) {
    if (epoch !== (global._pandauiGraphDocumentEpoch || 0)) return data
    if (data && data.documentId) global.PandaUIGraphDocumentId = data.documentId
    releaseBackendGeometry(data)
    return data
  }

  function instantiateBackendNode (node) {
    if (localBackendMode()) return Promise.resolve(null)
    var definitionId = backendDefinitionId(node)
    if (!node || !definitionId || global._pandauiGraphSyncing === true) return Promise.resolve(null)
    var epoch = global._pandauiGraphDocumentEpoch || 0
    instantiatedDocuments.add(graphDocumentId())
    return trackNodeRequest(fetch('/api/node/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: graphDocumentId(), nodeInstanceId: String(node.id), id: definitionId })
    }).then(function (response) { return response.json() }).then(function (data) { return updateGraphDocumentId(data, epoch) }).catch(function (error) {
      console.error('[GH Node] Backend instantiate failed:', node.id, error)
      return null
    }))
  }

  function removeBackendNode (node) {
    if (localBackendMode()) return Promise.resolve(null)
    if (!node || !backendDefinitionId(node) || global._pandauiGraphSyncing === true) return Promise.resolve(null)
    var epoch = global._pandauiGraphDocumentEpoch || 0
    return trackNodeRequest(fetch('/api/node/instances', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: graphDocumentId(), nodeInstanceId: String(node.id) })
    }).then(function (response) { return response.json() }).then(function (data) { return updateGraphDocumentId(data, epoch) }).catch(function (error) {

      console.error('[GH Node] Backend removal failed:', node.id, error)
      return null
    }))
  }

  function syncBackendNodes () {
    if (localBackendMode()) return Promise.resolve(null)
    if (global._pandauiGraphSyncing === true) return Promise.resolve(null)
    var epoch = global._pandauiGraphDocumentEpoch || 0
    var graph = global.graph
    var nodes = graph && Array.isArray(graph._nodes) ? graph._nodes.filter(function (node) {
      return node && backendDefinitionId(node)
    }).map(function (node) {
      return { nodeInstanceId: String(node.id), id: backendDefinitionId(node) }
    }) : []
    if (nodes.length === 0 && !instantiatedDocuments.has(graphDocumentId())) return Promise.resolve(null)
    if (nodes.length > 0) instantiatedDocuments.add(graphDocumentId())
    else instantiatedDocuments.delete(graphDocumentId())
    return trackNodeRequest(fetch(nodes.length ? '/api/node/instances/sync' : '/api/node/instances/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: graphDocumentId(), nodes: nodes })
    }).then(function (response) { return response.json() }).then(function (data) { return updateGraphDocumentId(data, epoch) }).catch(function (error) {
      console.error('[GH Node] Backend instance sync failed:', error)
      return null
    }))
  }

  function closeBackendDocument () {
    if (localBackendMode()) return
    var body = JSON.stringify({ documentId: graphDocumentId() })
    if (global.navigator && typeof global.navigator.sendBeacon === 'function') {
      global.navigator.sendBeacon('/api/node/instances/close', new Blob([body], { type: 'application/json' }))
      return
    }
    fetch('/api/node/instances/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {})
  }

  global.syncPandaUIGhNodeInstances = syncBackendNodes
  global.closePandaUIGhNodeDocument = closeBackendDocument

   function registerGhCatalog (catalog) {
      
    var entries = Array.isArray(catalog) ? catalog : []
    var skipped = 0

    // Ensure there is a GH catalog plugin entry so discovered components show up
    // in the editor plugin catalog UI.
    var ghPluginIndex = plugins.findIndex(function (p) { return p.id === 'gh-catalog' })
    if (ghPluginIndex === -1) {
      plugins.push({ id: 'gh-catalog', name: 'GH Catalog', version: '1.0.0', icon: 'extension', description: 'Discovered Grasshopper components', types: [], groups: [] })
      ghPluginIndex = plugins.length - 1
    }

    // Build three-level hierarchy: library (gha) -> category -> node list
    var libraryMap = {}
    var ghTypes = []

    entries.forEach(function (entry) {
      if (!entry) { skipped++; return }

      var displayName = entry.name || entry.id || entry.category || 'Unknown'
      var libraryName = entry.libraryName || 'Unknown'
      var category = String(entry.category || 'gh').replace(/[\s\\/]+/g, '_')
      var safeName = String(displayName).replace(/[\s\\/]+/g, '_')
      var componentGuid = String(entry.componentGuid || entry.ComponentGuid || entry.guid || entry.id || '')
      var safeGuid = componentGuid.replace(/[^a-zA-Z0-9_.-]+/g, '_') || 'anonymous'
      var exposure = String(entry.exposure || entry.Exposure || '').toLowerCase()
      var isHiddenExposure = exposure === 'hidden' || exposure.indexOf('hidden') >= 0
      var isReflection = entry.execution === 'mantisReflection'
      var localImplementation = global.PandaUILocalNodeExecution && global.PandaUILocalNodeExecution.implementationStatus
        ? global.PandaUILocalNodeExecution.implementationStatus(entry) : null
      var nodeDescription = entry.description || entry.category || 'GH component'
      if (localImplementation && localImplementation.status === 'placeholder') nodeDescription += '\n\nFrontend implementation pending. Runs on the backend.'
      if (localBackendMode() && (!global.PandaUILocalNodeExecution || !global.PandaUILocalNodeExecution.supports(entry))) {
        nodeDescription += '\n\nRequires backend. Backend unavailable. Local features remain available.'
        localImplementation = Object.assign({}, localImplementation, { label: 'Backend · Unavailable offline', reason: 'This node requires the backend.' })
      }
      // Keep the readable hierarchy, but make the registered type unique by ComponentGuid.
      var typeName = libraryName + '/' + category + '/' + safeName + '-' + safeGuid
      if (isReflection) typeName = 'Mantis/' + entry.reflection.assemblyId + '/' + category + '/' + safeGuid
      var definitionMetadata = {
        id: componentGuid || typeName,
        guid: componentGuid || typeName,
        version: String(entry.version || entry.componentVersion || '1.0.0'),
        title: displayName,
        category: String(entry.category || category),
        description: nodeDescription,
        pluginId: 'gh-catalog',
        executor: 'backend',
        execution: entry.execution || 'gh',
        dynamic: true,
        exposure: exposure,
        inputs: Array.isArray(entry.inputs) ? entry.inputs : [],
        outputs: Array.isArray(entry.outputs) ? entry.outputs : [],
        metadata: { ghEntry: entry, libraryName: libraryName, frontendImplementation: localImplementation, execute: executeGhBackend }
      }

      function AutoGhNode () {
        this.properties = {}
        this.size = [180, 60]
        this.inputs = []
        this.outputs = []
        Object.defineProperty(this, '_ghEntry', {
          value: definitionMetadata.metadata.ghEntry,
          configurable: true,
          enumerable: false,
          writable: true
        })
      }
      AutoGhNode.title = displayName
      AutoGhNode.desc = nodeDescription
      AutoGhNode.pandauiDefinition = definitionMetadata

      // onNodeCreated: build ports from catalog
      AutoGhNode.prototype.onNodeCreated = function () {
        var definitionEntry = ghEntryForNode(this) || entry
        ;(definitionEntry.inputs || []).forEach(function (input) {
          try { this.addInput(input && input.name ? input.name : 'In', input && input.type ? input.type : 'generic', isReflection ? {
            clrType: input.clrType, access: input.access, optional: input.optional,
            defaultValue: input.defaultValue, enumValues: input.enumValues, parameterIndex: input.parameterIndex
          } : undefined) } catch (e) { console.warn('Failed to add input on', typeName, e) }
        }.bind(this))
        ;(definitionEntry.outputs || []).forEach(function (output) {
          try { this.addOutput(output && output.name ? output.name : 'Out', output && output.type ? output.type : 'generic', isReflection ? {
            clrType: output.clrType, access: output.access, parameterIndex: output.parameterIndex
          } : undefined) } catch (e) { console.warn('Failed to add output on', typeName, e) }
        }.bind(this))
        if (global.PandaUIControlPointNodes && global.PandaUIControlPointNodes.configureNode) global.PandaUIControlPointNodes.configureNode(definitionEntry, this)
        try {
          if (!isReflection && !this.inputs.length && !this.outputs.length) {
            try { this.addInput('in', 'generic') } catch (e) {}
            try { this.addOutput('out', 'generic') } catch (e) {}
          }
        } catch (err) { console.warn('Failed to add fallback ports on', typeName, err) }
      }

      AutoGhNode.prototype.onAdded = function () {
        instantiateBackendNode(this)

      }

      AutoGhNode.prototype.getExtraMenuOptions = function () {
        var node = this
        var type = parameterPickType(ghEntryForNode(node))
        if (!type) return []
        function start (mode) {
          var token = String(node.id) + ':' + Date.now() + ':' + Math.random()
          parameterPickSession = { node: node, token: token }
          global.parent.postMessage({ type: 'pandaui-parameter-pick', nodeId: String(node.id), token: token, pickType: type, mode: mode }, global.location.origin)
        }
        var options = [{ content: 'Pick Object from Scene', callback: function () { start('pick') } }]
        if (['point', 'line', 'circle', 'curve'].indexOf(type) !== -1) {
          options.push({ content: type === 'curve' ? 'Draw Polyline' : 'Draw ' + type.charAt(0).toUpperCase() + type.slice(1), callback: function () { start('draw') } })
        }
        options.push({ content: 'Clear Persistent Values', callback: function () { commitParameterValues(node, []) } })
        return options
      }

      AutoGhNode.prototype.onRemoved = function () {
        releaseBackendInputs(this)
        if (parameterPickSession && parameterPickSession.node === this) {
          global.parent.postMessage({ type: 'pandaui-parameter-pick-cancel', token: parameterPickSession.token }, global.location.origin)
          parameterPickSession = null
        }
        if (this._executionAbort) this._executionAbort.abort()
        this._executionAbort = null
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'pandaui-clear-param-preview', marker: { nodeId: String(this.id) } }, window.location.origin)
        }
        removeBackendNode(this)
      }

      function executeGhBackend (executionContext, forceFullInputs) {
        var node = executionContext && executionContext.node
        if (!node) throw new Error('GH backend execution requires a node context.')
        // Geometry parameters preserve scene identity for render/UV nodes. No
        // backend round trip (or conversion to a disposable preview) is needed.
        if (ghEntryForNode(node).isParam && String(ghEntryForNode(node).name).toLowerCase() === 'geometry') {
          var geometryPort = node.inputs && node.inputs[0]
          var sceneValue = geometryPort && geometryPort.link != null ? node.getInputData(0) : { path: ['{0}'], datas: node.properties.sceneValues || [] }
          var sceneTree = sceneValue && sceneValue._isDualData ? sceneValue.display.treeData : normalizeToTreeData(sceneValue)
          if (sceneTree && Array.isArray(sceneTree.datas) && sceneTree.datas.length && sceneTree.datas.every(function (value) { return value && value.sceneObject && !value.subobject })) {
            var sceneOutput = buildDualData(node.outputs[0], sceneTree, node, 0, new Map(), null, null)
            node.setOutputData(0, sceneOutput)
            node._lastOutputData = sceneOutput; node._executionBackend = 'frontend'; node._executionError = null
            setNodeExecutionState(node, 'success')
            return Promise.resolve()
          }
        }
        var activeRequest = backendRequests.get(node)
        if (activeRequest) return activeRequest.promise.then(function () {
          if (!node.graph || executionContext.isCurrent && !executionContext.isCurrent() || executionContext.solutionToken !== node.graph._solutionToken) return
          return executeGhBackend(executionContext, forceFullInputs)
        })
        // Backend execution uses the stable GH ComponentDefinition GUID.
        var nodeId = backendDefinitionId(node) || node.id
        var solutionToken = executionContext.solutionToken || node.graph && node.graph._solutionToken || 0
        var graphDocumentId = global.PandaUIGraphDocumentId || 'graph-workspace'
        global.PandaUIGraphDocumentId = graphDocumentId

        var supportsInputUpdates = ghEntryForNode(node).execution !== 'mantisReflection'
        var localExecutor = global.PandaUILocalNodeExecution
        var localCandidate = localExecutor && localExecutor.supports(ghEntryForNode(node))
        var previousInputs = backendInputCaches.get(node)
        var patchInputs = !localCandidate && !forceFullInputs && supportsInputUpdates && previousInputs && previousInputs.revision &&
          previousInputs.documentId === graphDocumentId && previousInputs.nodeId === nodeId && previousInputs.generation === global.PandaUIBackendGeneration
        if (patchInputs) patchInputs = previousInputs.states.size === node.inputs.length && node.inputs.every(function (port, index) {
          var state = previousInputs.states.get(port.name || ('in' + index))
          return state && state[0] === port && state[1] === index && state[3] === port.type
        })
        var inputStates = new Map()
        var changedInputPorts = new Set()
        var removedInputs = []
        var inputValues = new Map()
        var inputs = {}
        if (node.inputs) {
          node.inputs.forEach(function (port, i) {
            var portName = port.name || ('in' + i)
            var state = inputSourceState(node, port, i)
            inputStates.set(portName, state)
            if (patchInputs && sameInputSource(previousInputs.states.get(portName), state)) return
            changedInputPorts.add(i)
            if (port.link != null || ghEntryForNode(node).isParam && Array.isArray(node.properties.sceneValues)) {
              var val = port.link != null ? node.getInputData(i) : { path: ['{0}'], datas: [] }
              inputValues.set(i, val)
              if (port.link == null) {
                inputs[portName] = { path0: ['{0}', node.properties.sceneValues] }
                return
              }
              if (val !== undefined && val !== null) {
                var frontendReference = frontendParamReference(node, port, val, graphDocumentId, solutionToken)
                if (frontendReference) {
                  inputs[portName] = frontendReference
                } else if (isParamReference(val)) {
                  inputs[portName] = val
                } else if (val._isDualData && val.display && val.display.treeData) {
                  inputs[portName] = toGhPortPayload(val.display.treeData)
                } else if (val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.path) && Array.isArray(val.datas)) {
                  // 上游是 GH 标量节点 → 保留其真实 GH_Path 分支。
                  inputs[portName] = toGhPortPayload(val)
                } else {
                  // 上游是原生节点 → 按控件值构造 GH_Path。
                  inputs[portName] = toGhPortPayload(buildWidgetTreeData(val))
                }
              }
            }
            if (patchInputs && !Object.prototype.hasOwnProperty.call(inputs, portName)) removedInputs.push(portName)
          })
        }
        if (patchInputs) previousInputs.states.forEach(function (_, name) {
          if (!inputStates.has(name)) removedInputs.push(name)
        })

        if (node._executionAbort && node._executionAbort !== executionContext.abortController) node._executionAbort.abort()
        var controller = executionContext.abortController || new AbortController()
        node._executionAbort = controller
        node._executionCancelled = false
        setNodeExecutionState(node, 'running')

        var requestStartedAt = global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now()
        var availablePreviews = {}
        if (window.parent.PandaUICaptureScenePreview) {
          ;(node.inputs || []).forEach(function (port, index) {
            if (!changedInputPorts.has(index)) return
            var value = port.link != null ? inputValues.get(index) : null
            var references = value && value._isDualData ? value.display.treeData.datas : index === 0 ? node.properties.sceneValues : []
            ;(references || []).forEach(function (reference) {
              if (!reference || !reference.previewId || reference.pickTransform || reference.subobject || availablePreviews[reference.previewId]) return
              var snapshots = window.parent.PandaUICaptureScenePreview([reference])
              if (snapshots) availablePreviews[reference.previewId] = snapshots[0]
            })
          })
        }
        var scenePreviews = null
        if (ghEntryForNode(node).isParam && window.parent.PandaUICaptureScenePreview) {
          try {
            var inputPort = node.inputs && node.inputs[0]
            var inputValue = inputPort && inputPort.link != null ? node.getInputData(0) : null
            var sceneReferences = inputValue && inputValue._isDualData
              ? inputValue.display.treeData.datas : inputPort && inputPort.link == null ? node.properties.sceneValues : null
            var parameterName = String(ghEntryForNode(node).name || '').toLowerCase()
            var compatible = Array.isArray(sceneReferences) && sceneReferences.every(function (reference) {
              var type = String(reference && reference.geometryType || '').toLowerCase()
              var edge = reference && reference.subobject && reference.subobject.type === 'brepEdge'
              if (parameterName === 'geometry') return true
              if (parameterName === 'curve') return edge || /curve/.test(type)
              if (parameterName === 'mesh') return type === 'mesh'
              return (parameterName === 'brep' || parameterName === 'surface') && !edge && /brep|surface/.test(type)
            })
            if (compatible) scenePreviews = window.parent.PandaUICaptureScenePreview(sceneReferences)
          } catch (error) { console.warn('[GH Node] Scene preview unavailable:', error) }
        }
        var request = {
          id: nodeId,
          execution: ghEntryForNode(node).execution || 'gh',
          nodeInstanceId: String(node.id),
          documentId: graphDocumentId,
          inputs: inputs,
          inputUpdate: supportsInputUpdates ? { version: 1, mode: patchInputs ? 'patch' : 'replace', baseRevision: patchInputs ? previousInputs.revision : null, removed: removedInputs } : undefined,
          scenePreviewCount: scenePreviews ? scenePreviews.length : 0,
          availablePreviewIds: Object.keys(availablePreviews)
        }
        // Scene identity is local UI metadata, not a native geometry resource.
        var requestBody = JSON.stringify(request, function (key, value) { return key === 'sceneObject' ? undefined : value })
        var requestPreparedAt = global.performance && typeof global.performance.now === 'function' ? global.performance.now() : Date.now()
        console.log('[GH Node] Request prepared:', nodeId, 'bytes=' + requestBody.length, 'serializeMs=' + Math.round(requestPreparedAt - requestStartedAt))

        // Cancelling a solution discards its outputs, but waits for the in-flight
        // native call to acknowledge its inputs. Aborting HTTP alone cannot stop
        // that call and would enqueue a full resend on every slider movement.
        var transport = { controller: new AbortController(), graph: node.graph }
        backendRequests.set(node, transport)
        function runBackend () {
          if (localBackendMode()) return Promise.reject(backendUnavailable())
          return fetch('/api/node/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody,
            signal: transport.controller.signal
          }).then(function (res) { return res.json() })
        }
        var localController = new AbortController()
        var cancelLocal = function () { localController.abort() }
        controller.signal.addEventListener('abort', cancelLocal, { once: true })
        transport.controller.signal.addEventListener('abort', cancelLocal, { once: true })
        if (controller.signal.aborted || transport.controller.signal.aborted) cancelLocal()
        transport.promise = (localExecutor
          ? localExecutor.execute(ghEntryForNode(node), request, { signal: localController.signal }, runBackend)
          : runBackend())
        .then(function (data) {
          if (backendRequests.get(node) !== transport || node.graph !== transport.graph || global.PandaUIGraphDocumentId !== graphDocumentId) return
          var pendingPreviews = patchInputs && previousInputs.pendingPreviews || new Map()
          if (data && data.ok && data.outputs) {
            var changedPreviews = patchInputs && Array.isArray(data.inputPreviewChanges) ? data.inputPreviewChanges : node.inputs.map(function (_, index) { return index })
            changedPreviews.forEach(function (index) {
              pendingPreviews.set(index, { preview: ghEntryForNode(node).isParam ? null : (data.paramPreviews && data.paramPreviews.inputs || {})[String(index)], available: availablePreviews })
            })
            if (supportsInputUpdates && data.inputRevision) backendInputCaches.set(node, {
              revision: data.inputRevision, states: inputStates, documentId: data.documentId || graphDocumentId,
              nodeId: nodeId, generation: data.poolGeneration || global.PandaUIBackendGeneration, pendingPreviews: pendingPreviews
            })
            else backendInputCaches.delete(node)
            global.PandaUIBackendGeneration = data.poolGeneration || global.PandaUIBackendGeneration
          } else backendInputCaches.delete(node)
          if (controller.signal.aborted || executionContext.isCurrent && !executionContext.isCurrent() || !node.graph || node.graph._solutionToken !== solutionToken) {
            node._executionCancelled = true
            setNodeExecutionState(node, 'aborted')
            return
          }
          if (data && data.code === 'INPUT_CACHE_MISS' && patchInputs) {
            backendRequests.delete(node)
            return executeGhBackend(executionContext, true)
          }
          if (data && data.ok && data.outputs) {
            node._executionBackend = data.executor || 'backend'
            node._localFallbackReason = data.localFallbackReason || null
            node._localFallbackCode = data.localFallbackCode || null
            node._executionTimings = data.timings || null
            node._runtimeMessages = data.runtimeMessages || null
            node._executionError = null
            node._executionErrorCode = null
            global.PandaUIGraphDocumentId = data.documentId || global.PandaUIGraphDocumentId
            global.PandaUIBackendGeneration = data.poolGeneration || global.PandaUIBackendGeneration
            ;(Array.isArray(data.releasedGeometryIds) ? data.releasedGeometryIds : []).forEach(function (geometryId) {
              window.parent.postMessage({ type: 'pandaui-release-geometry', documentId: data.documentId, geometryId: geometryId }, window.location.origin)
            })
            var outputs = data.outputs
            var paramPreviews = data.paramPreviews || {}
            var outputParamPreviews = paramPreviews.outputs || paramPreviews
            syncDirectPreview(node, data.componentPreview, 'component', -1, 'Component', availablePreviews)
            if (node.inputs) {
              node.inputs.forEach(function (port, i) {
                var pendingPreview = pendingPreviews.get(i)
                if (!pendingPreview) return
                syncDirectPreview(node, pendingPreview.preview, 'input', -1000 - i, port.name || ('in' + i), pendingPreview.available)
              })
            }
            pendingPreviews.clear()
            var renderById = new Map()
            ;(Array.isArray(data.renderUpdates) ? data.renderUpdates : []).forEach(function (update) {
              if (update && update.geometryId) renderById.set(String(update.geometryId), update)
            })
            var lastOutputData = null
            if (node.outputs) {
              node.outputs.forEach(function (port, i) {
                try {
                  var portName = port.name || ('out' + i)
                  var val = outputs[portName]
                  if (val === undefined) {
                    var keys = Object.keys(outputs)
                    if (keys[i] !== undefined) val = outputs[keys[i]]
                  }
                  if (val !== undefined) {
                    var treeData = normalizeToTreeData(val)
                    var outputPreview = outputParamPreviews[String(i)] || outputParamPreviews[portName]
                    var outputSnapshots = data.timings && data.timings.scenePreviewReused === 1 ? scenePreviews : sceneSnapshotsForPreview(outputPreview, treeData, availablePreviews)
                    var outputData = buildDualData(port, treeData, node, i, renderById, outputPreview, outputSnapshots)
                    node.setOutputData(i, outputData)
                    lastOutputData = outputData

                  }
                } catch (portErr) {
                  console.error('[GH Node] Error setting output port', i, ':', portErr)
                }
              })
            }

            console.log('[GH Node] Executed OK, outputs:', Object.keys(outputs))
            var runtimeErrors = runtimeMessageList(node._runtimeMessages, 'errors')
            var runtimeWarnings = runtimeMessageList(node._runtimeMessages, 'warnings')
            setNodeExecutionState(node, runtimeErrors.length > 0 ? 'error' : (runtimeWarnings.length > 0 ? 'warning' : 'success'))
          } else {
            backendInputCaches.delete(node)
            node._runtimeMessages = data && data.runtimeMessages ? data.runtimeMessages : null
            node._executionError = data && data.error ? String(data.error) : 'Node execution failed.'
            setNodeExecutionState(node, 'error', node._executionError)
          }
        })
        .catch(function (err) {
          if (backendRequests.get(node) !== transport) return
          backendInputCaches.delete(node)
          if (controller.signal.aborted || err.name === 'AbortError') {
            node._executionCancelled = true
            setNodeExecutionState(node, 'aborted')
            return
          }
          console.error('[GH Node] Execute failed:', nodeId, err)
          node._runtimeMessages = null
          node._executionError = err && err.message ? err.message : String(err)
          node._executionErrorCode = err && err.code || null
          setNodeExecutionState(node, 'error', node._executionError)
        })
        .finally(function () {
          controller.signal.removeEventListener('abort', cancelLocal)
          transport.controller.signal.removeEventListener('abort', cancelLocal)
          if (backendRequests.get(node) === transport) backendRequests.delete(node)
          if (node._executionAbort === controller) node._executionAbort = null
        })
        return transport.promise
      }

      // Compatibility entry for plugins and callers that still invoke onExecute directly.
      global.PandaUIExecuteBackendNode = executeGhBackend
      AutoGhNode.prototype.onExecute = function () {
        var context = this.getActiveExecutionContext ? this.getActiveExecutionContext() : null
        var ownsContext = false
        if (!context && this.createExecutionContext) {
          context = this.createExecutionContext({ solutionToken: this.graph ? this.graph._solutionToken : 0 })
          ownsContext = true
        }
        var result = executeGhBackend(context || {
          node: this,
          graph: this.graph,
          solutionToken: this.graph ? this.graph._solutionToken : 0,
          abortController: new AbortController(),
          isCurrent: function () { return true }
        })
        if (!ownsContext) return result
        return Promise.resolve(result).finally(function () {
          context.complete()
          if (context.node && context.node.clearExecutionContext) context.node.clearExecutionContext(context)
        })
      }

      AutoGhNode.prototype.onConfigure = function () {
        releaseBackendInputs(this)
        this._executionCancelled = false
        var parameter = ghEntryForNode(this)
        if (parameter && parameter.isParam && !this.inputs.length) {
          var port = (parameter.inputs || [])[0] || (parameter.outputs || [])[0]
          if (port) this.addInput(port.name || 'Value', port.type || 'generic')
        }
        if (this.getNodeAttributes) this.getNodeAttributes().syncFromNode()
      }

      AutoGhNode.prototype.onExecutionCancelled = function () {
        if (this._executionAbort) this._executionAbort.abort()
        this._executionAbort = null
        this._executionCancelled = true
        setNodeExecutionState(this, 'aborting')
      }

      if (PandaUI.nodeTypes[typeName] == null) {
        try {
          PandaUI.registerNode(typeName, AutoGhNode)
        } catch (e) {
          console.error('Failed to register GH node type', typeName, e)
          return
        }
      }

      // Register in the search box extras so the right-click "Add Node" menu
      // shows a human-readable name instead of the raw type path.
      // registerSearchboxExtra(node_type, description, data)
      try {
        var searchLabel = libraryName + ' / ' + category + ' / ' + displayName
        if (typeof PandaUI.registerSearchboxExtra === 'function') {
          PandaUI.registerSearchboxExtra(typeName, searchLabel, null)
        }
      } catch (e) { /* ignore searchbox registration failures */ }

      ghTypes.push(typeName)

      // Build hierarchy maps
      if (!libraryMap[libraryName]) libraryMap[libraryName] = { categories: {} }
      var lib = libraryMap[libraryName]
      if (!isHiddenExposure) {
        if (!lib.categories[category]) lib.categories[category] = []
        lib.categories[category].push({
        type: typeName,
        name: displayName,
          description: entry.description || ''
        })
      }
    })

    // Build sorted groups array for Vue rendering
    var groups = Object.keys(libraryMap).sort().map(function (libName) {
      var lib = libraryMap[libName]
      var categories = Object.keys(lib.categories).sort().map(function (catName) {
        var nodes = lib.categories[catName].slice().sort(function (a, b) { return a.name.localeCompare(b.name) })
        return { name: catName, nodes: nodes }
      })
      return { name: libName, categories: categories }
    })

    // Update GH plugin and notify UI
    plugins[ghPluginIndex].types = Array.from(new Set((plugins[ghPluginIndex].types || []).concat(ghTypes)))
    plugins[ghPluginIndex].groups = groups
    console.log('[gh-catalog] received', entries.length, 'entries, registered', ghTypes.length, 'node types, skipped', skipped, 'groups:', groups.length)
    global.dispatchEvent(new CustomEvent('pandaui-node-plugins-changed'))
  }

  // ========== 双数据辅助函数 ==========

  // Frontend widget → tree format with proper path construction
  // Single value: 5 → {path:['{0}'], datas:[5]}
  // Flat list: [a,b] → {path:['{0;0}','{0;1}'], datas:[a,b]}
  // 2D list: [[a,b],[c]] → {path:['{0;0;0}','{0;0;1}','{0;1;0}'], datas:[a,b,c]}
  function buildWidgetTreeData (value) {
    return DataTree.fromWidget(value).toLegacy()
  }

  // Convert the internal tree representation to the wire format:
  // { path0: ["{0;0}", [value0, value1], [preview0, preview1]] }
  function toGhPortPayload (treeData) {
    return DataTree.from(treeData).toWire()
  }

  // 统一成内部 {path:[], datas:[], previews?:[]} 格式
  function normalizeToTreeData (val) {
    if (val == null) return { path: ['{0}'], datas: [], previews: [] }
    if (DataTree.isTreeData(val) || (val._isDualData && val.display && val.display.treeData)) return DataTree.from(val).toLegacy()
    var tree = new DataTree()
    if (Array.isArray(val)) val.forEach(function (item) { tree.add('{0}', item) })
    else tree.add('{0}', val)
    return tree.toLegacy()
  }

  function isGeometryReference (value) {
    return value != null && typeof value === 'object' && value.kind === 'geometryRef' &&
      typeof value.documentId === 'string' && typeof value.geometryId === 'string'
  }

  // 从 tree data 中提取第一个几何体
  function extractFirstGeometry (treeData) {
    if (treeData == null || !treeData.datas) return null
    for (var i = 0; i < treeData.datas.length; i++) {
      var item = treeData.datas[i]
      if (item && typeof item === 'object' && (item.__geo || isGeometryReference(item))) return item
    }
    return null
  }

  // 判断是否有几何体
  function hasGeometry (treeData) {
    if (treeData == null || !treeData.datas) return false
    for (var i = 0; i < treeData.datas.length; i++) {
      if (treeData.datas[i] && typeof treeData.datas[i] === 'object' && (treeData.datas[i].__geo || isGeometryReference(treeData.datas[i]))) return true
    }
    return false
  }

  // 判断是否是几何体类型 (根据端口 type 标签)
  function isGeometryPort (port) {
    if (!port || !port.type) return false
    var t = String(port.type).toLowerCase()
    var geoTypes = ['mesh', 'brep', 'subd', 'curve', 'surface', 'point', 'vector', 'plane', 'line', 'box', 'circle', 'arc', 'rectangle', 'transform', 'matrix', 'meshface', 'geometry']
    return geoTypes.indexOf(t) !== -1
  }

  function numericValues (value) {
    if (Array.isArray(value)) return value
    if (ArrayBuffer.isView(value)) return value
    return []
  }

  function packPreview (preview, chunks, state) {
    if (preview == null || typeof preview !== 'object') return null
    var positions = numericValues(preview.positions)
    if (positions.length < 3) return null
    var descriptor = {
      type: String(preview.type || 'polyline'),
      positionByteOffset: state.byteLength,
      positionCount: positions.length,
      indexByteOffset: 0,
      indexCount: 0
    }
    var positionValues = new Float32Array(positions)
    chunks.push({ byteOffset: state.byteLength, values: positionValues })
    state.byteLength += positionValues.byteLength

    var normals = numericValues(preview.normals)
    if (normals.length === positions.length) {
      descriptor.normalByteOffset = state.byteLength
      descriptor.normalCount = normals.length
      var normalValues = new Float32Array(normals)
      chunks.push({ byteOffset: state.byteLength, values: normalValues })
      state.byteLength += normalValues.byteLength
    }

    var indices = numericValues(preview.indices)
    if (indices.length > 0) {
      descriptor.indexByteOffset = state.byteLength
      descriptor.indexCount = indices.length
      var indexValues = new Uint32Array(indices)
      chunks.push({ byteOffset: state.byteLength, values: indexValues })
      state.byteLength += indexValues.byteLength
    }
    return descriptor
  }

  function cloneGeometryReference (geometry) {
    if (!isGeometryReference(geometry)) return null
    return {
      kind: geometry.kind,
      documentId: geometry.documentId,
      geometryId: geometry.geometryId,
      previewId: geometry.previewId,
      geometryType: geometry.geometryType,
      originalType: geometry.originalType,
      name: geometry.name,
      revision: geometry.revision,
      poolGeneration: geometry.poolGeneration,
      sceneObject: geometry.sceneObject,
      geometrySpace: geometry.geometrySpace
    }
  }

  function buildPortDisplayBuffer (treeData, previews, renderParts, node, portIndex, scenePreviews) {
    var chunks = []
    var state = { byteLength: 0 }
    var items = []
    var datas = treeData && Array.isArray(treeData.datas) ? treeData.datas : []
    var baseId = 'node_' + node.id + '_p' + portIndex
    var inlinePickValues = datas.filter(function (item) {
      return item && ['panda.point', 'panda.line', 'panda.circle', 'panda.polyline'].indexOf(geometryDataType(item.__geo)) !== -1 && Array.isArray(item.data)
    })
    for (var i = 0; i < datas.length; i++) {
      var geometry = datas[i]
      if (!geometry || (!geometry.__geo && !isGeometryReference(geometry))) continue
      var geometryType = geometryDataType(geometry.geometryType || geometry.__geo)
      var preview = previews && previews[i]
      if (!preview && geometryDataType(geometry.__geo) === 'panda.point' && numericValues(geometry.data).length >= 3) {
        preview = { type: 'points', positions: numericValues(geometry.data).slice(0, 3) }
      }
      var previewDescriptor = packPreview(preview, chunks, state)
      var partDescriptors = []
      var parts = renderParts && renderParts[i]
      if (Array.isArray(parts)) {
        parts.forEach(function (part) {
          var partPreview = packPreview(part && part.preview, chunks, state)
          if (partPreview) partDescriptors.push({ role: part.role || 'surface', preview: partPreview })
        })
      }
      var sceneGeometry = scenePreviews && scenePreviews[i]
      if (!previewDescriptor && partDescriptors.length === 0 && !sceneGeometry) continue
      var aggregated = preview && preview.parameterPreview || sceneGeometry && sceneGeometry.parameterPreview || Array.isArray(parts) && parts.some(function (part) { return part.preview && part.preview.parameterPreview })
      items.push({
        sourceIndex: i,
        sceneGeometry: sceneGeometry,
        id: baseId + '_' + i,
        geometryType: geometryType,
        geometryRef: cloneGeometryReference(geometry),
        pickValues: isGeometryReference(geometry) ? null : aggregated ? inlinePickValues : inlinePickValues.indexOf(geometry) !== -1 ? [geometry] : null,
        pickAmbiguous: !!aggregated && datas.length > 1 && datas.some(isGeometryReference),
        preview: previewDescriptor,
        renderParts: partDescriptors
      })
    }
    if (items.length === 0) return null
    var data = new ArrayBuffer(state.byteLength)
    chunks.forEach(function (chunk) {
      new Uint8Array(data, chunk.byteOffset, chunk.values.byteLength).set(new Uint8Array(chunk.values.buffer, chunk.values.byteOffset, chunk.values.byteLength))
    })

    return { version: 1, byteLength: state.byteLength, data: data, items: items }
  }

  function paramPreviewStyle (color) {
    var fallback = { color: defaultPreviewColor, opacity: defaultPreviewOpacity }
    if (color == null || typeof color !== 'object') return fallback
    var components = [color.r ?? color.R, color.g ?? color.G, color.b ?? color.B]
    if (components.some(function (value) { return value == null || !Number.isFinite(Number(value)) })) return fallback
    components = components.map(function (value) { return Math.round(Math.max(0, Math.min(255, Number(value)))) })
    var alpha = color.a ?? color.A
    return {
      color: (components[0] << 16) | (components[1] << 8) | components[2],
      opacity: alpha == null || !Number.isFinite(Number(alpha)) ? 1 : Math.max(0, Math.min(255, Number(alpha))) / 255
    }
  }

  function applyParamPreview (treeData, previews, renderParts, paramPreview) {
    if (paramPreview == null || typeof paramPreview !== 'object') return
    var datas = treeData && Array.isArray(treeData.datas) ? treeData.datas : []
    var targetIndex = datas.findIndex(function (item) {
      return item && typeof item === 'object' && (item.__geo || isGeometryReference(item))
    })
    if (targetIndex < 0) return
    var mesh = paramPreview.mesh
    if (mesh && numericValues(mesh.positions).length >= 3) previews[targetIndex] = { type: 'mesh', positions: mesh.positions, normals: mesh.normals, indices: mesh.indices || [], parameterPreview: true }
    var edges = paramPreview.edges
    if (edges && numericValues(edges.positions).length >= 6) {
      renderParts[targetIndex] = [{ role: 'edge', preview: { type: 'lineSegments', positions: edges.positions, parameterPreview: true } }]
    }
  }

  function sceneSnapshotsForPreview (preview, treeData, available) {
    if (!preview || !Array.isArray(preview.geometryRefs)) return null
    if (!preview.mesh && !preview.edges && treeData.datas.every(function (item) { return item && item.previewId && available && available[item.previewId] })) {
      return treeData.datas.map(function (item) { return available[item.previewId] })
    }
    var snapshots = []
    preview.geometryRefs.forEach(function (id) { if (available && available[id]) snapshots = snapshots.concat(available[id]) })
    if (!snapshots.length) return null
    snapshots.parameterPreview = true
    var result = []
    var index = treeData.datas.findIndex(function (item) { return item && (item.__geo || isGeometryReference(item)) })
    if (index >= 0) result[index] = snapshots
    return result
  }

  function syncDirectPreview (node, paramPreview, direction, portIndex, portName, available) {
    if (!node || window.parent === window) return
    var marker = { nodeId: String(node.id), direction: direction, portIndex: portIndex, portName: portName }
    window.parent.postMessage({ type: 'pandaui-clear-param-preview', marker: marker }, window.location.origin)
    var input = direction === 'input' ? node.inputs[-1000 - portIndex] : null
    if (input) input._directPreviewData = null
    if (paramPreview == null || typeof paramPreview !== 'object') return
    var treeData = { datas: [{ __geo: 'panda.geometry' }] }
    var previews = [null]
    var renderParts = [null]
    applyParamPreview(treeData, previews, renderParts, paramPreview)
    var displayBuffer = buildPortDisplayBuffer(treeData, previews, renderParts, node, portIndex, sceneSnapshotsForPreview(paramPreview, treeData, available))
    if (!displayBuffer) return
    var style = paramPreviewStyle(paramPreview.color)
    if (input) {
      input._directPreviewData = { _isDualData: true, display: { type: 'panda.geometry', buffer: displayBuffer, treeData: treeData, color: style.color, edgesColor: style.color, opacity: style.opacity } }
      input.drawPreviewMesh()
      input.drawPreviewWire()
      return
    }
    window.parent.postMessage({
      type: 'pandaui-set-geometry-buffer',
      buffer: displayBuffer,
      display: {
        type: 'panda.geometry',
        nodeId: node.id,
        nodeType: node.type,
        portIndex: portIndex,
        portName: portName,
        color: style.color,
        edgesColor: style.color,
        opacity: style.opacity,
        previewVisibility: previewAttributesForNode(node)
      }
    }, window.location.origin)
  }

  function buildDualData (port, treeData, node, portIndex, renderById, paramPreview, scenePreviews) {
    var raw = extractFirstGeometry(treeData)
    var style = paramPreviewStyle(paramPreview && paramPreview.color)

    if (raw) {
      var geometryType = geometryDataType(raw.geometryType || raw.__geo || port.type)
      var previews = treeData.datas.map(function (item) {
        if (!isGeometryReference(item)) return null
        var update = renderById && renderById.get(String(item.geometryId))
        return update ? update.preview : null
      })
      var renderParts = treeData.datas.map(function (item) {
        if (!isGeometryReference(item)) return null
        var update = renderById && renderById.get(String(item.geometryId))
        return update && Array.isArray(update.parts) ? update.parts : null
      })
      applyParamPreview(treeData, previews, renderParts, paramPreview)
      var displayPreviews = previews.some(Boolean) ? previews : (treeData.previews || [])
      var displayBuffer = buildPortDisplayBuffer(treeData, displayPreviews, renderParts, node, portIndex, scenePreviews)
      return {
        _isDualData: true,
        raw: raw,
        display: {
          type: geometryType,
          nodeId: node.id,
          nodeType: node.type,
          portIndex: portIndex,
          portName: port.name || ('out' + portIndex),
          color: style.color,
          edgesColor: style.color,
          opacity: style.opacity,
          treeData: treeData,
          buffer: displayBuffer
        }
      }
    } else {
      return treeData
    }
  }

  function previewAttributesForNode (node) {
    var attributes = node && node.getNodeAttributes ? node.getNodeAttributes() : null
    return attributes && attributes.previewSettings
      ? attributes.previewSettings()
      : { visible: true, meshVisible: true, wireVisible: true }
  }

  function previewRoleForDescriptor (descriptor, partRole) {
    if (String(partRole || '').toLowerCase() === 'edge' || String(partRole || '').toLowerCase() === 'wire') return 'wire'
    return descriptor && String(descriptor.type || '').toLowerCase() === 'mesh' ? 'mesh' : 'wire'
  }

  function filterDisplayBuffer (displayBuffer, role) {
    if (!displayBuffer || !(displayBuffer.data instanceof ArrayBuffer) || !Array.isArray(displayBuffer.items)) return null
    var items = displayBuffer.items.map(function (item) {
      var snapshots = item.sceneGeometry && item.sceneGeometry.filter(function (snapshot) { return (snapshot.type === 'mesh' ? 'mesh' : 'wire') === role })
      var parts = Array.isArray(item.renderParts) ? item.renderParts : []
      var renderParts = parts.filter(function (part) {
        return previewRoleForDescriptor(part.preview, part.role) === role
      })
      var preview = previewRoleForDescriptor(item.preview) === role ? item.preview : null
      if (role === 'wire' && !preview && renderParts.length === 0 && item.preview && String(item.preview.type || '').toLowerCase() === 'mesh') {
        preview = item.preview
      }
      if (!preview && renderParts.length === 0 && !(snapshots && snapshots.length)) return null
      return Object.assign({}, item, { preview: preview, renderParts: renderParts, sceneGeometry: snapshots })
    }).filter(Boolean)
    if (items.length === 0) return null
    return { version: displayBuffer.version, byteLength: displayBuffer.byteLength, data: displayBuffer.data, items: items }
  }

  function portPreviewBounds (value) {
    var display = value && value._isDualData && value.display
    if (!display) return null
    var bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
    function include (positions, stride, indices, range, matrix) {
      if (!positions || stride < 3) return
      var count = indices ? indices.length : positions.length / stride
      var start = range ? Math.max(0, range.start) : 0
      var end = range ? Math.min(count, start + range.count) : count
      for (var offset = start; offset < end; offset++) {
        var index = (indices ? indices[offset] : offset) * stride
        var horizontal = positions[index]; var vertical = positions[index + 1]; var depth = positions[index + 2]
        if (matrix && matrix.length === 16) {
          var denominator = matrix[3] * horizontal + matrix[7] * vertical + matrix[11] * depth + matrix[15]
          var transformedX = (matrix[0] * horizontal + matrix[4] * vertical + matrix[8] * depth + matrix[12]) / denominator
          var transformedY = (matrix[1] * horizontal + matrix[5] * vertical + matrix[9] * depth + matrix[13]) / denominator
          depth = (matrix[2] * horizontal + matrix[6] * vertical + matrix[10] * depth + matrix[14]) / denominator
          horizontal = transformedX; vertical = transformedY
        }
        if (!Number.isFinite(horizontal) || !Number.isFinite(vertical) || !Number.isFinite(depth)) continue
        bounds[0] = Math.min(bounds[0], horizontal); bounds[3] = Math.max(bounds[3], horizontal)
        bounds[1] = Math.min(bounds[1], vertical); bounds[4] = Math.max(bounds[4], vertical)
        bounds[2] = Math.min(bounds[2], depth); bounds[5] = Math.max(bounds[5], depth)
      }
    }
    var buffer = display.buffer
    ;(buffer && buffer.items || []).forEach(function (item) {
      ;[item.preview].concat((item.renderParts || []).map(function (part) { return part.preview })).forEach(function (preview) {
        if (!preview || !(buffer.data instanceof ArrayBuffer)) return
        var positions = new Float32Array(buffer.data, preview.positionByteOffset, preview.positionCount)
        var indices = preview.indexCount ? new Uint32Array(buffer.data, preview.indexByteOffset, preview.indexCount) : null
        include(positions, 3, indices)
      })
      ;(item.sceneGeometry || []).forEach(function (snapshot) {
        var position = snapshot.attributes && snapshot.attributes.position
        if (position) include(position.array, position.itemSize, snapshot.index, snapshot.drawRange, snapshot.matrix)
      })
    })
    ;(display.treeData && display.treeData.datas || []).forEach(function (item) {
      var type = geometryDataType(item && item.__geo)
      if (!item || !Array.isArray(item.data)) return
      if (type === 'panda.point' || type === 'panda.line') include(item.data, 3)
      else if (type === 'panda.polyline') item.data.forEach(function (point) { include(point, 3) })
    })
    return bounds.every(Number.isFinite) ? bounds : null
  }

  function postParamPreviewCommand (param, command) {
    var node = param && param.owner
    if (!node || window.parent === window) return null
    var marker = { nodeId: String(node.id), direction: param.direction, portIndex: param.direction === 'input' ? -1000 - param.index : param.index, portName: param.name }
    if (command.action === 'zoom') {
      var value = param.direction === 'input' ? param._directPreviewData || node.getInputData(param.index) : param.rawValue
      var sources = param.direction === 'input' && node.graph ? node.getInputLinks(param.index).map(function (id) { return node.graph.links.get(String(id)) }).filter(Boolean).map(function (link) {
        return { nodeId: String(link.origin_id), portIndex: link.origin_slot }
      }) : []
      window.parent.postMessage({ type: 'pandaui-zoom-param-preview', marker: marker, bounds: portPreviewBounds(value), sources: sources }, window.location.origin)
      return true
    }
    if (command.action === 'visibility') {
      window.parent.postMessage({
        type: 'pandaui-set-param-preview-visibility',
        marker: marker,
        role: command.role,
        visible: command.visible,
        attributes: command.attributes
      }, window.location.origin)
      return true
    }
    if (command.action === 'clear') {
      window.parent.postMessage({ type: 'pandaui-clear-param-preview', marker: marker, role: command.role }, window.location.origin)
      return true
    }
    if (command.action === 'bake') {
      if (param.direction !== 'output') return null
      window.parent.postMessage({ type: 'pandaui-bake-param-preview', marker: marker }, window.location.origin)
      return true
    }
    if (command.action !== 'draw') return null
    var outputData = param.direction === 'input' ? (param._directPreviewData || node.getInputData(param.index)) : param.rawValue
    if (param.direction === 'input' && outputData && !outputData._isDualData) outputData = buildDualData(param, normalizeToTreeData(outputData), node, marker.portIndex)
    var display = outputData && outputData._isDualData && outputData.display
    if (!display) return null
    if (param.direction === 'output' || !display.buffer) {
      notifyParentGeometry(node, marker.portIndex, param, outputData)
      return true
    }
    var filteredBuffer = filterDisplayBuffer(display.buffer, command.role)
    if (!filteredBuffer) return null
    filteredBuffer = Object.assign({}, filteredBuffer, { items: filteredBuffer.items.map(function (item) {
      return Object.assign({}, item, { id: 'node_' + node.id + '_p' + marker.portIndex + '_' + item.sourceIndex })
    }) })
    window.parent.postMessage({
      type: 'pandaui-draw-param-preview',
      marker: marker,
      role: command.role,
      buffer: filteredBuffer,
      display: Object.assign({}, display, {
        treeData: undefined,
        buffer: undefined,
        nodeId: node.id,
        nodeType: node.type,
        portIndex: marker.portIndex,
        portName: param.name,
        previewRole: command.role,
        previewVisibility: command.attributes
      })
    }, window.location.origin)
    return filteredBuffer.items.length
  }

  // 通知父窗口在 Three.js 场景中创建几何体显示
  function notifyParentGeometry (node, portIndex, port, outputData) {
    if (window.parent === window) return
    var treeData = outputData.display && outputData.display.treeData
    if (!treeData || !treeData.datas) return

    var baseId = 'node_' + node.id + '_p' + portIndex
    var datas = treeData.datas
    var displayBuffer = outputData.display && outputData.display.buffer
    var previewVisibility = typeof port.getPreviewAttributes === 'function' ? port.getPreviewAttributes() : previewAttributesForNode(node)
    var bufferedIndices = {}

    if (displayBuffer && displayBuffer.data instanceof ArrayBuffer && Array.isArray(displayBuffer.items)) {
      displayBuffer.items.forEach(function (item) { bufferedIndices[item.sourceIndex] = true })
      window.parent.postMessage({
        type: 'pandaui-set-geometry-buffer',
        buffer: Object.assign({}, displayBuffer, { items: displayBuffer.items.map(function (item) {
          return Object.assign({}, item, { id: baseId + '_' + item.sourceIndex })
        }) }),
        display: {
          type: outputData.display.type,
          nodeId: node.id,
          nodeType: node.type,
          portIndex: portIndex,
          portName: port.name || ('out' + portIndex),
          color: outputData.display.color,
          edgesColor: outputData.display.edgesColor,
          opacity: outputData.display.opacity,
          previewVisibility: previewVisibility
        }
      }, window.location.origin)
    }

    for (var i = 0; i < datas.length; i++) {
      if (bufferedIndices[i]) continue
      var geo = datas[i]
      if (!geo || (!geo.__geo && !isGeometryReference(geo))) continue
      var id = baseId + '_' + i
      var geometryType = geometryDataType(geo.geometryType || geo.__geo)
      var color = outputData.display.color ?? defaultPreviewColor
      var opacity = outputData.display.opacity ?? defaultPreviewOpacity
      if (geometryDataType(geo.__geo) === 'panda.point' && Array.isArray(geo.data) && geo.data.length >= 3) {
        // Points use the dedicated graph-point layer so the global point-size setting
        // keeps them visible and they render above imported geometry.
        window.parent.postMessage({
          type: 'pandaui-draw-point',
          id: id,
          x: Number(geo.data[0]) || 0,
          y: Number(geo.data[1]) || 0,
          z: Number(geo.data[2]) || 0,
          color: color,
          opacity: opacity,
          visible: previewVisibility.visible !== false && previewVisibility.wireVisible !== false,
          nodeId: node.id,
          portIndex: portIndex,
          portName: port.name || ('out' + portIndex),
          previewVisibility: previewVisibility
        }, window.location.origin)
        continue
      }
      window.parent.postMessage({

        type: 'pandaui-set-geometry',
        id: id,
        geometryRef: isGeometryReference(geo) ? geo : null,
        raw: isGeometryReference(geo) ? null : Object.assign({}, geo, { __geo: geometryDataType(geo.__geo) }),
        preview: null,
        renderParts: null,
        display: {
          type: geometryType,
          nodeId: node.id,
          nodeType: node.type,
          portIndex: portIndex,
          portName: port.name || ('out' + portIndex),
          color: color,
          edgesColor: outputData.display.edgesColor ?? color,
          opacity: opacity,
          previewVisibility: previewVisibility
        }
      }, window.location.origin)
    }
  }

  global.PandaUINodePlugins = plugins
  global.PandaUIParamPreviewDispatcher = postParamPreviewCommand
  global.PandaUIGeometryOutputDispatcher = notifyParentGeometry
  global.PandaUIBuildPortDisplayBuffer = buildPortDisplayBuffer
  global.PandaUIBuildNativeNodeOutput = function (node, portIndex, treeData) {
    return buildDualData(node.outputs[portIndex], treeData, node, portIndex)
  }
  global.getPandaUINodePluginCatalog = catalog
  global.applyPandaUINodePluginStates = applyStates
  global.installPandaUINodePluginSource = installPluginSource
  global.registerPandaUIGhCatalog = registerGhCatalog
})(this)




