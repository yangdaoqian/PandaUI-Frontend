(function (global) {
  'use strict'
  var kernel = global.PandaUIKernel = global.PandaUIKernel || {}
  var own = function (value, key) { return Object.prototype.hasOwnProperty.call(value, key) }
  function reject (message, code) { var error = new Error(message); error.code = code || 'INVALID_OPERATION'; throw error }
  function clone (value) {
    return JSON.parse(JSON.stringify(value, function (key, item) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') reject('Reserved operation field: ' + key)
      if (typeof item === 'function' || ArrayBuffer.isView(item) || item instanceof ArrayBuffer) reject('Operations contain editing data, not executable code or geometry buffers.')
      if (typeof item === 'number' && !Number.isFinite(item)) reject('Operation numbers must be finite.')
      return item
    }))
  }
  function equal (left, right) { return JSON.stringify(left) === JSON.stringify(right) }
  function difference (before, after) {
    var patch = { fields: [], properties: [] }
    Array.from(new Set(Object.keys(before).concat(Object.keys(after)))).forEach(function (key) {
      if (key === 'id' || key === 'type') return
      if (key === 'properties') {
        var oldValues = before.properties || {}; var newValues = after.properties || {}
        Array.from(new Set(Object.keys(oldValues).concat(Object.keys(newValues)))).forEach(function (name) {
          if (!equal(oldValues[name], newValues[name])) patch.properties.push({ name: name, value: newValues[name], remove: !own(newValues, name) })
        })
      } else if (!equal(before[key], after[key])) patch.fields.push({ name: key, value: after[key], remove: !own(after, key) })
    })
    return patch
  }
  function hasChanges (patch) { return patch.fields.length > 0 || patch.properties.length > 0 }
  function command (type, payload) { return { type: type, payload: payload } }
  function stableInstanceId (prefix) { return prefix + '-' + kernel.newOperationId() }
  function fieldName (name) {
    if (typeof name !== 'string' || ['__proto__', 'prototype', 'constructor'].indexOf(name) >= 0) reject('Invalid editing field name.')
    return name
  }
  function instanceId (value) { return typeof value === 'string' && value.length > 0 || Number.isSafeInteger(value) && value >= 0 }
  kernel.newOperationId = function () {
    return global.crypto && global.crypto.randomUUID ? global.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2)
  }
  kernel.installGraphOperations = function (PandaUI) {
    var prototype = PandaUI.GraphDocument.prototype
    var raw = {}
    ;['add', 'remove', 'connect', 'removeLink', 'clear', 'configure', 'addGroup', 'removeGroup'].forEach(function (name) { raw[name] = prototype[name] })
    var setProperty = PandaUI.BaseNode.prototype.setProperty
    function nodeAt (graph, id) {
      var node = graph.getNodeById(id)
      if (!node) reject('Node not found: ' + String(id), 'NODE_NOT_FOUND')
      return node
    }
    function relatedLinks (graph, nodeId) {
      return Array.from(graph.links.values()).filter(function (link) { return String(link.origin_id) === String(nodeId) || String(link.target_id) === String(nodeId) }).map(clone)
    }
    function restoreLinks (graph, links) {
      var ids = new Set()
      links.forEach(function (link) {
        if (!link || !instanceId(link.id) || ids.has(String(link.id)) || graph.links.has(String(link.id))) reject('Invalid or duplicate connection ID.')
        ids.add(String(link.id))
        var source = nodeAt(graph, link.origin_id); var target = nodeAt(graph, link.target_id)
        if (!Number.isInteger(link.origin_slot) || !Number.isInteger(link.target_slot) || !source.outputs[link.origin_slot] || !target.inputs[link.target_slot]) reject('Cannot restore a connection to a missing port.')
      })
      links.forEach(function (link) {
        var source = nodeAt(graph, link.origin_id); var target = nodeAt(graph, link.target_id)
        raw.connect.call(graph, source, link.origin_slot, target, link.target_slot, { id: link.id, silent: true, append: true })
      })
    }
    function remember (graph, node) { if (node && node.graph === graph) graph._nodeStates.set(String(node.id), clone(node.serialize())) }
    function patchNode (graph, node, patch) {
      var state = node.serialize()
      var editableFields = Object.keys(state)
      ;(patch.properties || []).forEach(function (change) {
        fieldName(change && change.name)
        if (change.remove) delete state.properties[change.name]
        else state.properties[change.name] = change.value
      })
      ;(patch.fields || []).forEach(function (change) {
        fieldName(change && change.name)
        if (editableFields.indexOf(change.name) < 0 || ['id', 'type', 'properties'].indexOf(change.name) >= 0) reject('Invalid node field patch.')
        if (change.remove) delete state[change.name]
        else state[change.name] = change.value
      })
      if (!Array.isArray(state.pos) || !Array.isArray(state.size) || state.pos.length !== 2 || state.size.length !== 2 || !state.pos.concat(state.size).every(Number.isFinite)) reject('Invalid node position or size.')
      var changesPorts = (patch.fields || []).some(function (field) { return field.name === 'inputs' || field.name === 'outputs' })
      ;(patch.properties || []).forEach(function (change) {
        var nextValue = change.remove ? undefined : change.value
        if (typeof node.onPropertyChanged === 'function' && node.onPropertyChanged(change.name, nextValue, node.properties[change.name]) === false) reject('Node rejected property: ' + change.name, 'PROPERTY_REJECTED')
      })
      if (!changesPorts) {
        node.properties = state.properties
        ;(patch.fields || []).forEach(function (field) {
          if (field.name === 'widgets') {
            ;(state.widgets || []).forEach(function (saved) {
              var widget = node.widgets.find(function (item) { return item.name === saved.name })
              if (widget) widget.value = saved.value
            })
          } else if (field.remove) delete node[field.name]
          else node[field.name] = clone(field.value)
        })
        if ((patch.properties || []).length && typeof node.onConfigure === 'function') node.onConfigure(state)
        if ((patch.fields || []).some(function (field) { return field.name === 'flags' })) node.setPreviewVisible(node.flags.previewVisible !== false)
        if ((patch.properties || []).length) graph.invalidateNode(node, { propagate: true, reason: 'operation' })
        node.setDirtyCanvas()
        return
      }
      var links = relatedLinks(graph, node.id)
      links.forEach(function (link) { raw.removeLink.call(graph, link.id, { silent: true }) })
      node.flags = Object.assign({}, state.flags || {})
      node.configure(state)
      restoreLinks(graph, patch.links || links.filter(function (link) {
        var source = graph.getNodeById(link.origin_id); var target = graph.getNodeById(link.target_id)
        return source && target && source.outputs[link.origin_slot] && target.inputs[link.target_slot]
      }))
      node.setPreviewVisible(node.flags.previewVisible !== false)
      if ((patch.properties || []).length || (patch.fields || []).some(function (change) { return ['inputs', 'outputs'].indexOf(change.name) >= 0 })) graph.invalidateNode(node, { propagate: true, reason: 'operation' })
      node.setDirtyCanvas()
    }
    prototype._performOperation = function (operation, options) {
      options = options || {}
      if (!operation || typeof operation.type !== 'string' || operation.version != null && operation.version !== 1) reject('Invalid operation version or type.')
      if (operation.documentId != null && operation.documentId !== this.documentId) reject('Operation belongs to another document.', 'DOCUMENT_MISMATCH')
      var payload = operation.payload || {}
      var graph = this
      var node; var before; var after; var inverse; var value; var links; var changed = true
      if (operation.type === 'batch') {
        if (!Array.isArray(payload.operations)) reject('A batch requires operations.')
        var completed = []
        try {
          payload.operations.forEach(function (child) { var result = graph._performOperation(child); if (result.changed) completed.push(result) })
        } catch (error) {
          completed.reverse().forEach(function (result) { graph._performOperation(result.inverse) })
          throw error
        }
        return { changed: completed.length > 0, value: completed.map(function (result) { return result.value }), inverse: command('batch', { operations: completed.slice().reverse().map(function (result) { return result.inverse }) }) }
      }
      if (operation.type === 'add_node' || operation.type === 'restore_node') {
        var saved = payload.node
        if (!saved || typeof saved.type !== 'string' || !instanceId(saved.id)) reject('A node operation requires a type and instance ID.')
        if (this.getNodeById(saved.id)) reject('Node ID already exists: ' + saved.id)
        node = options.liveNode || PandaUI.createNode(saved.type, saved.title)
        if (!node && operation.type === 'restore_node') node = PandaUI.createMissingNode(saved.type, saved.title)
        if (!node) reject('Node type unavailable: ' + saved.type, 'NODE_TYPE_UNAVAILABLE')
        if (!options.liveNode) node.configure(saved)
        node.id = saved.id
        inverse = command('remove_node', { nodeId: node.id })
        try {
          raw.add.call(this, node, { silent: true })
          if (Number.isInteger(payload.index)) { this._nodes.splice(this._nodes.indexOf(node), 1); this._nodes.splice(payload.index, 0, node) }
          if (payload.links) restoreLinks(this, payload.links)
        } catch (error) {
          if (node.graph === this) raw.remove.call(this, node, { silent: true })
          throw error
        }
        remember(this, node); value = node
      } else if (operation.type === 'remove_node') {
        node = nodeAt(this, payload.nodeId)
        inverse = command('restore_node', { node: node.serialize(), index: this._nodes.indexOf(node), links: relatedLinks(this, node.id) })
        raw.remove.call(this, node, { silent: true })
        this._nodeStates.delete(String(node.id)); value = node
      } else if (operation.type === 'set_property' || operation.type === 'patch_node') {
        node = nodeAt(this, payload.nodeId)
        before = options.previousState || node.serialize()
        links = relatedLinks(this, node.id)
        try {
        if (operation.type === 'set_property') {
          fieldName(payload.name)
          if (typeof payload.name !== 'string' || !own(node.properties, payload.name)) reject('Unknown node property: ' + payload.name, 'PROPERTY_NOT_FOUND')
          if (setProperty.call(node, payload.name, payload.value, { silent: true }) === false) reject('Node rejected property: ' + payload.name, 'PROPERTY_REJECTED')
        } else if (!options.previousState) patchNode(this, node, payload.patch || {})
        } catch (error) {
          var rollbackPatch = difference(node.serialize(), before)
          if (hasChanges(rollbackPatch)) patchNode(this, node, rollbackPatch)
          throw error
        }
        after = node.serialize()
        var reversePatch = difference(after, before)
        if (reversePatch.fields.some(function (field) { return field.name === 'inputs' || field.name === 'outputs' })) reversePatch.links = links
        inverse = command('patch_node', { nodeId: node.id, patch: reversePatch })
        changed = hasChanges(reversePatch); remember(this, node); value = operation.type === 'set_property' ? true : node
      } else if (operation.type === 'connect') {
        var source = nodeAt(this, payload.src); var target = nodeAt(this, payload.dst)
        if (!instanceId(payload.linkId)) reject('A connection requires a stable link ID.')
        if (!Number.isInteger(payload.outSlot) || !Number.isInteger(payload.inSlot) || !source.outputs[payload.outSlot] || !target.inputs[payload.inSlot]) reject('Connection port does not exist.', 'PORT_NOT_FOUND')
        if (payload.mode !== 'append' && payload.mode !== 'replace') reject('Connection mode must be append or replace.')
        if (this.dependencyGraph.downstream(target, true).indexOf(source) >= 0) reject('This connection would create a cycle.', 'CYCLIC_CONNECTION')
        if (this.links.has(String(payload.linkId))) reject('Link ID already exists.')
        links = target.getInputLinks(payload.inSlot).map(function (id) { return clone(graph.links.get(String(id))) })
        value = raw.connect.call(this, source, payload.outSlot, target, payload.inSlot, { id: payload.linkId, silent: true, append: payload.mode === 'append' })
        changed = !links.some(function (link) { return String(link.id) === String(value.id) })
        inverse = command('replace_input_links', { nodeId: target.id, slot: payload.inSlot, links: links })
        remember(this, source); remember(this, target)
      } else if (operation.type === 'disconnect' || operation.type === 'replace_input_links') {
        if (operation.type === 'disconnect') {
          var link = this.links.get(String(payload.linkId))
          if (!link) return { changed: false, value: false }
          node = nodeAt(this, link.target_id); payload = { nodeId: node.id, slot: link.target_slot, links: node.getInputLinks(link.target_slot).filter(function (id) { return String(id) !== String(link.id) }).map(function (id) { return clone(graph.links.get(String(id))) }) }
        }
        node = nodeAt(this, payload.nodeId)
        if (!node.inputs[payload.slot] || !Array.isArray(payload.links)) reject('Invalid input connection restoration.')
        links = node.getInputLinks(payload.slot).map(function (id) { return clone(graph.links.get(String(id))) })
        var replacedIds = new Set(links.map(function (saved) { return String(saved.id) }))
        var restoredIds = new Set()
        payload.links.forEach(function (saved) {
          if (!saved || !instanceId(saved.id) || restoredIds.has(String(saved.id)) || graph.links.has(String(saved.id)) && !replacedIds.has(String(saved.id))) reject('Invalid or duplicate connection ID.')
          restoredIds.add(String(saved.id))
          if (String(saved.target_id) !== String(node.id) || saved.target_slot !== payload.slot) reject('Restored connections must target the specified input.')
          var origin = nodeAt(graph, saved.origin_id)
          if (!Number.isInteger(saved.origin_slot) || !origin.outputs[saved.origin_slot]) reject('Source port no longer exists.')
          if (graph.dependencyGraph.downstream(node, true).indexOf(origin) >= 0) reject('This connection would create a cycle.', 'CYCLIC_CONNECTION')
        })
        inverse = command('replace_input_links', { nodeId: node.id, slot: payload.slot, links: links })
        links.forEach(function (saved) { raw.removeLink.call(graph, saved.id, { silent: true }) })
        restoreLinks(this, payload.links); remember(this, node); value = true; changed = !equal(links, payload.links)
      } else if (operation.type === 'add_group' || operation.type === 'remove_group' || operation.type === 'patch_group') {
        var groups = this._groups || []
        var group = groups.find(function (item) { return String(item.id) === String(payload.groupId) })
        if (operation.type === 'add_group') {
          if (!payload.group || payload.group.id == null || groups.some(function (item) { return String(item.id) === String(payload.group.id) })) reject('Invalid or duplicate group.')
          group = raw.addGroup.call(this, options.liveGroup || new PandaUI.GraphGroup(payload.group), { silent: true })
          if (Number.isInteger(payload.index)) { groups.splice(groups.indexOf(group), 1); groups.splice(payload.index, 0, group) }
          inverse = command('remove_group', { groupId: group.id })
        } else {
          if (!group) reject('Group not found: ' + payload.groupId)
          if (operation.type === 'patch_group' && (!payload.state || String(payload.state.id) !== String(group.id))) reject('Group instance IDs cannot be changed.')
          before = options.previousState || group.serialize()
          if (operation.type === 'remove_group') { inverse = command('add_group', { group: before, index: groups.indexOf(group) }); raw.removeGroup.call(this, group, { silent: true }); this._groupStates.delete(String(group.id)) }
          else { if (!options.previousState) group.configure(payload.state); inverse = command('patch_group', { groupId: group.id, state: before }); changed = !equal(before, group.serialize()) }
        }
        if (operation.type !== 'remove_group') this._groupStates.set(String(group.id), clone(group.serialize()))
        value = group
      } else if (operation.type === 'reorder_nodes') {
        if (!Array.isArray(payload.ids) || payload.ids.length !== this._nodes.length || new Set(payload.ids.map(String)).size !== this._nodes.length) reject('Invalid node ordering.')
        inverse = command('reorder_nodes', { ids: this._nodes.map(function (item) { return item.id }) })
        var ordered = payload.ids.map(function (id) { return nodeAt(graph, id) })
        changed = ordered.some(function (item, index) { return item !== graph._nodes[index] }); this._nodes = ordered; value = true
      } else if (this._operationHandlers.has(operation.type)) {
        var handler = this._operationHandlers.get(operation.type)
        if (handler.async) reject('This operation requires asynchronous execution.')
        return handler.execute(payload, options)
      } else reject('Unknown graph operation: ' + operation.type)
      return { changed: changed, value: value, inverse: inverse && clone(inverse) }
    }
    prototype.applyOperation = function (input, options) {
      options = options || {}
      if (this._asyncOperationActive) reject('An asynchronous document operation is still running.', 'OPERATION_BUSY')
      var operation = clone(input)
      if (!operation || typeof operation.type !== 'string' || operation.version != null && operation.version !== 1) reject('Invalid operation version or type.')
      if (operation.documentId != null && operation.documentId !== this.documentId) reject('Operation belongs to another document.', 'DOCUMENT_MISMATCH')
      var previous = operation.operationId && this._processedOperations.get(operation.operationId)
      if (previous) {
        if (!equal(previous.operation.type, operation.type) || !equal(previous.operation.payload, operation.payload)) reject('Operation ID reused with different contents.', 'OPERATION_ID_CONFLICT')
        return { operation: previous.operation, revision: previous.revision, duplicate: true, value: null }
      }
      if (operation.baseRevision != null && operation.baseRevision !== this.revision) reject('Graph revision changed.', 'REVISION_CONFLICT')
      operation.version = 1; operation.operationId = operation.operationId || kernel.newOperationId(); operation.documentId = this.documentId; operation.baseRevision = this.revision
      operation.actorId = operation.actorId || options.actorId || this.clientId
      operation.source = operation.source || options.source || this._operationSource || 'ui'
      if (this.requiresAsyncOperation(operation)) {
        this._asyncOperationActive = true
        this._batchDepth++
        this.history.notify('busy')
        return this.performAsyncOperation(operation, options).then(function (result) {
          this._asyncOperationActive = false
          this._batchDepth--
          return this.completeOperation(operation, result, options)
        }.bind(this), function (error) {
          this._asyncOperationActive = false
          this._batchDepth--
          this.history.notify('failed')
          throw error
        }.bind(this))
      }
      var result
      this._operationDepth++
      this._batchDepth++
      try { result = this._performOperation(operation, options) } finally { this._operationDepth--; this._batchDepth-- }
      return this.completeOperation(operation, result, options)
    }
    prototype.completeOperation = function (operation, result, options) {
      if (!result || typeof result.changed !== 'boolean') reject('Invalid operation handler result.')
      if (result.changed) result.inverse = clone(result.inverse)
      if (result.changed) {
        this.revision++
        var entry = { operation: operation, inverse: result.inverse, revision: this.revision }
        this._processedOperations.set(operation.operationId, entry)
        if (this._processedOperations.size > 1000) this._processedOperations.delete(this._processedOperations.keys().next().value)
        if (options.record !== false && !this._loadingDocument) this.history.record(entry)
        this.events.emit('operation-applied', { operation: operation, inverse: result.inverse, revision: this.revision, source: options.source || operation.source })
        if (!options.silent && options.record !== false) this.commitHistory(options.label || operation.type)
        if (options.solve !== false && this._batchDepth === 0 && this._dirty.size) this.requestSolution()
        this.setDirtyCanvas()
      }
      return { operation: operation, revision: this.revision, changed: result.changed, value: result.value }
    }
    prototype.registerOperationHandler = function (type, handler) {
      if (typeof type !== 'string' || type.indexOf('.') < 1 || !handler || typeof handler.execute !== 'function' || this._operationHandlers.has(type)) reject('Invalid or duplicate domain operation handler.')
      this._operationHandlers.set(type, handler)
      return function () { this._operationHandlers.delete(type) }.bind(this)
    }
    prototype.requiresAsyncOperation = function (operation) {
      if (operation.type === 'batch') return (operation.payload.operations || []).some(this.requiresAsyncOperation.bind(this))
      return this._operationHandlers.get(operation.type)?.async === true
    }
    prototype.performAsyncOperation = async function (operation, options) {
      if (operation.version != null && operation.version !== 1) reject('Invalid operation version.')
      if (operation.documentId != null && operation.documentId !== this.documentId) reject('Operation belongs to another document.', 'DOCUMENT_MISMATCH')
      if (operation.type === 'batch') {
        var completed = []
        try {
          for (var child of operation.payload.operations) {
            var result = await this.performAsyncOperation(child, options)
            if (result.changed) completed.push(result)
          }
        } catch (error) {
          for (var previous of completed.reverse()) await this.performAsyncOperation(previous.inverse, { record: false })
          throw error
        }
        return { changed: completed.length > 0, value: completed.map(function (item) { return item.value }), inverse: command('batch', { operations: completed.reverse().map(function (item) { return item.inverse }) }) }
      }
      var handler = this._operationHandlers.get(operation.type)
      if (handler?.async) return handler.execute(operation.payload, options)
      this._operationDepth++
      try { return this._performOperation(operation, options) } finally { this._operationDepth-- }
    }
    prototype.syncNodeEdit = function (node) {
      if (!node || node.graph !== this || this._loadingDocument || this._operationDepth) return
      var before = this._nodeStates.get(String(node.id))
      if (!before) { remember(this, node); return }
      var patch = difference(before, node.serialize())
      if (hasChanges(patch)) return this.applyOperation(command('patch_node', { nodeId: node.id, patch: patch }), { previousState: before, silent: true })
    }
    prototype.syncGroupEdit = function (group) {
      var before = this._groupStates.get(String(group.id))
      if (before && !equal(before, group.serialize())) return this.applyOperation(command('patch_group', { groupId: group.id, state: group.serialize() }), { previousState: before, silent: true })
    }
    prototype.commitHistory = function (reason, targets) {
      if (this._restoring || this._loadingDocument || this._operationDepth || this._batchDepth) return false
      if (targets && typeof targets === 'object') (Array.isArray(targets) ? targets : [targets]).forEach(function (target) { if (target.graph === this) this.syncNodeEdit(target); else this.syncGroupEdit(target) }, this)
      return this.history.commit(reason)
    }
    prototype.beginTransaction = function (label) { return this.history.begin(label) }
    prototype.commitTransaction = function () { return this.history.commitTransaction() }
    prototype.rollbackTransaction = function () { this.abortSolution(); return this.history.rollback() }
    prototype.canUndo = function () { return this.history.cursor > 0 || this.history.pending.length > 0 }
    prototype.canRedo = function () { return this.history.cursor < this.history.entries.length && !this.history.pending.length }
    prototype.undo = function () { this.abortSolution(); return this.history.undo() }
    prototype.redo = function () { this.abortSolution(); return this.history.redo() }
    prototype.restoreHistory = function (index) {
      if (!Number.isInteger(index) || index < 0 || index > this.history.entries.length) return false
      var advance = function () {
        while (this.history.cursor !== index) {
          var result = this.history.cursor > index ? this.undo() : this.redo()
          if (result && typeof result.then === 'function') return result.then(function (changed) { return changed ? advance() : false })
          if (!result) return false
        }
        return true
      }.bind(this)
      return advance()
    }
    prototype.add = function (node, options) {
      if (this._operationDepth || this._loadingDocument) return raw.add.call(this, node, options)
      if (!node || node.graph === this) return node
      if (node.id == null) node.id = stableInstanceId('node')
      return this.applyOperation(command('add_node', { node: node.serialize() }), Object.assign({}, options, { liveNode: node })).value
    }
    prototype.remove = function (node, options) {
      if (this._operationDepth || this._loadingDocument) return raw.remove.call(this, node, options)
      if (!node || node.graph !== this) return null
      return this.applyOperation(command('remove_node', { nodeId: node.id }), options).value
    }
    prototype.connect = function (source, outSlot, target, inSlot, options) {
      if (this._operationDepth || this._loadingDocument) return raw.connect.call(this, source, outSlot, target, inSlot, options)
      if (!source || !target) return null
      options = options || {}
      return this.applyOperation(command('connect', { src: source.id, outSlot: outSlot, dst: target.id, inSlot: inSlot, mode: options.append ? 'append' : 'replace', linkId: options.id != null ? options.id : stableInstanceId('link') }), options).value
    }
    prototype.removeLink = function (id, options) {
      if (this._operationDepth || this._loadingDocument) return raw.removeLink.call(this, id, options)
      return this.applyOperation(command('disconnect', { linkId: id }), options).value
    }
    prototype.addGroup = function (group, options) {
      if (this._operationDepth || this._loadingDocument) return raw.addGroup.call(this, group, options)
      group = group instanceof PandaUI.GraphGroup ? group : new PandaUI.GraphGroup(group)
      return this.applyOperation(command('add_group', { group: group.serialize() }), Object.assign({}, options, { liveGroup: group })).value
    }
    prototype.removeGroup = function (group, options) {
      if (this._operationDepth || this._loadingDocument) return raw.removeGroup.call(this, group, options)
      return this.applyOperation(command('remove_group', { groupId: group.id }), options).value
    }
    prototype.clear = function (options) {
      if (this._operationDepth || this._loadingDocument) return raw.clear.call(this, options)
      this.abortSolution()
      var operations = this._nodes.slice().reverse().map(function (node) { return command('remove_node', { nodeId: node.id }) }).concat((this._groups || []).slice().reverse().map(function (group) { return command('remove_group', { groupId: group.id }) }))
      this.applyOperation(command('batch', { operations: operations }), Object.assign({ label: 'clear' }, options))
      this._dirty.clear(); this.events.emit('document-cleared', {})
    }
    prototype.configure = function (data, options) {
      if (this._asyncOperationActive) reject('Wait for the active operation before replacing the document.', 'OPERATION_BUSY')
      this._loadingDocument = true
      try { raw.configure.call(this, data, Object.assign({}, options, { skipHistory: true })) } finally { this._loadingDocument = false }
      this._nodeStates.clear(); this._groupStates.clear(); this._processedOperations.clear()
      this._nodes.forEach(function (node) { remember(this, node) }, this)
      ;(this._groups || []).forEach(function (group) { this._groupStates.set(String(group.id), clone(group.serialize())) }, this)
      if (!options || !options.skipHistory) { this.history.clear(); this.revision = 0; this.history.notify('configure') }
      if (this.dependencyGraph) this.dependencyGraph.invalidate('configure')
      return this
    }
    PandaUI.BaseNode.prototype.setProperty = function (name, value, options) {
      if (!this.graph || this.graph._operationDepth || this.graph._loadingDocument) return setProperty.call(this, name, value, options)
      return this.graph.applyOperation(command('set_property', { nodeId: this.id, name: name, value: value }), options).value
    }
    var setPreviewVisible = PandaUI.BaseNode.prototype.setPreviewVisible
    PandaUI.BaseNode.prototype.setPreviewVisible = function (visible) {
      var result = setPreviewVisible.call(this, visible)
      if (this.graph && !this.graph._operationDepth && !this.graph._loadingDocument) this.graph.syncNodeEdit(this)
      return result
    }
  }
})(typeof window !== 'undefined' ? window : globalThis)
