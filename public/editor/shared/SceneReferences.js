(function (global) {
  'use strict'
  // Parameter geometry leaves carry sceneObject:{documentId,objectId,name}.
  // Native geometryRef leaves use geometryId for the same stable object ID.
  function reference (value) {
    if (!value || typeof value !== 'object') return null
    var ref = value.sceneObject || value.geometryRef || value
    if (ref && ref.sceneObject) ref = ref.sceneObject
    var id = ref.objectId || ref.geometryId
    if (typeof ref.documentId !== 'string' || !ref.documentId.trim() || typeof id !== 'string' || !id.trim()) return null
    return { documentId: ref.documentId, objectId: id, name: typeof ref.name === 'string' ? ref.name : '' }
  }
  function collect (value, accepts) {
    var result = [], ancestors = new Set(), budget = 20000
    function visit (item, depth) {
      if (item == null || depth > 32 || --budget < 0 || ancestors.has(item)) return
      if (accepts(item)) { result.push(item); return }
      if (typeof item !== 'object') return
      ancestors.add(item)
      var next = function (child) { visit(child, depth + 1) }
      if (item._isDualData) next((item.display && item.display.treeData) || item.raw)
      else if (item.dataTreeSummary) next(item.dataTreeSummary)
      else if (item.dataTree) next(item.dataTree)
      else if (item.kind === 'structRef') next(item.data)
      else if (global.PandaUIKernel && global.PandaUIKernel.DataTree && item instanceof global.PandaUIKernel.DataTree) next(item.values())
      else if (Array.isArray(item.datas)) next(item.datas)
      else if (Array.isArray(item)) {
        if (typeof item[0] === 'string' && /^\{[\d;\s-]*\}$/.test(item[0]) && Array.isArray(item[1])) next(item[1])
        else item.forEach(next)
      } else Object.keys(item).filter(function (key) { return /^path\d+$/.test(key) }).sort(function (a, b) { return Number(a.slice(4)) - Number(b.slice(4)) }).forEach(function (key) { next(item[key]) })
      ancestors.delete(item)
    }
    visit(value, 0)
    return result
  }
  function references (value) {
    var found = new Map()
    collect(value, function (item) { return !!reference(item) }).forEach(function (item) {
      var ref = reference(item)
      found.set(JSON.stringify([ref.documentId, ref.objectId]), ref)
    })
    return Array.from(found.values())
  }
  function hasInput (node, name) {
    var slot = node.findInputSlot(name)
    return slot >= 0 && (node.isInputConnected(slot) || node.inputs[slot].data != null)
  }
  function value (node, name, fallback) { return hasInput(node, name) ? node.getInputData(node.findInputSlot(name)) : fallback }
  function scalar (value) { return collect(value, function (item) { return typeof item !== 'object' })[0] }
  global.PandaUISceneReferences = { reference: reference, references: references, collect: collect, hasInput: hasInput, value: value, scalar: scalar }
})(window)
