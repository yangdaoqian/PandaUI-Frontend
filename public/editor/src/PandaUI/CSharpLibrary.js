(function (global) {
  'use strict'

  function element (tag, className, text) {
    var result = document.createElement(tag)
    result.className = className || ''
    if (text != null) result.textContent = text
    return result
  }

  global.PandaUICSharpLibrary = {
    open: function (node, canvas) {
      if (node._closeGhpDialog) node._closeGhpDialog()
      var dialog = element('dialog', 'pandaui-csharp-library')
      dialog.setAttribute('aria-label', 'Add Node to .ghp')
      var form = element('form')
      form.appendChild(element('h3', '', 'Add Node to .ghp'))
      form.appendChild(element('p', '', 'Create a library or add this component to an existing one. Existing nodes are kept.'))
      var fields = {}
      var properties = node.properties
      var defaults = {
        path: properties.ghpPath || '', name: properties.componentName || 'C# Script',
        nickname: properties.componentNickname || 'CS', category: properties.componentCategory || 'Mantis',
        subcategory: properties.componentSubcategory || 'Script', description: properties.componentDescription || ''
      }
      var labels = { path: 'GHP file path', name: 'Node name', nickname: 'Nickname', category: 'Category', subcategory: 'Subcategory', description: 'Description' }
      var grid = element('div', 'pandaui-csharp-library-fields')
      Object.keys(defaults).forEach(function (key) {
        var label = element('label', 'pandaui-csharp-library-' + key, labels[key])
        var input = element('input')
        input.type = 'text'; input.value = defaults[key]; input.name = key
        input.setAttribute('aria-label', labels[key])
        input.required = key === 'path' || key === 'name'
        if (key === 'path') input.placeholder = 'C:\\Libraries\\MyNodes.ghp'
        fields[key] = input
        label.appendChild(input); grid.appendChild(label)
      })
      var paths = element('datalist')
      paths.id = 'pandaui-ghp-paths-' + String(node.id)
      fields.path.setAttribute('list', paths.id)
      var managers = node.graph ? node.graph._nodes.filter(function (item) { return item.type === 'Mantis/GHP Manager' }) : []
      var knownPaths = new Set()
      managers.forEach(function (manager) { (manager.properties.paths || []).forEach(function (path) { if (/\.ghp$/i.test(path)) knownPaths.add(path) }) })
      knownPaths.forEach(function (path) { var option = element('option'); option.value = path; paths.appendChild(option) })
      if (!fields.path.value && knownPaths.size === 1) fields.path.value = Array.from(knownPaths)[0]
      var status = element('p', 'pandaui-csharp-library-status')
      status.setAttribute('role', 'status')
      var actions = element('div', 'pandaui-csharp-library-actions')
      var close = element('button', '', 'Cancel'); close.type = 'button'
      var save = element('button', '', 'Add to library'); save.type = 'submit'
      actions.append(close, save); form.append(grid, paths, status, actions); dialog.appendChild(form)
      var disposed = false
      var controller = null
      function cleanup () {
        if (disposed) return
        disposed = true
        if (controller) controller.abort()
        dialog.remove()
        node._closeGhpDialog = null
      }
      node._closeGhpDialog = cleanup
      close.addEventListener('click', cleanup)
      dialog.addEventListener('cancel', function (event) { event.preventDefault(); cleanup() })
      ;['pointerdown', 'keydown', 'keyup', 'wheel'].forEach(function (type) { dialog.addEventListener(type, function (event) { event.stopPropagation() }) })
      form.addEventListener('submit', async function (event) {
        event.preventDefault()
        if (save.disabled) return
        save.disabled = true
        status.dataset.state = 'busy'; status.textContent = 'Compiling current code…'
        var source = properties.code
        var references = JSON.stringify(properties.references || [])
        try {
          var compiled = await node.compile()
          if (disposed) return
          if (!compiled || !compiled.ok) throw new Error((compiled && (compiled.error || (compiled.diagnostics || []).map(function (item) { return item.message }).join('\n'))) || 'Compile the script successfully before adding it.')
          if (properties.code !== source || JSON.stringify(properties.references || []) !== references) throw new Error('The code changed. Try adding it again.')
          var payload = { componentId: compiled.componentId }
          Object.keys(fields).forEach(function (key) { payload[key] = fields[key].value.trim() })
          status.textContent = 'Saving library…'
          controller = new AbortController()
          var response = await fetch('/api/node/script/ghp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal })
          var data = await response.json()
          if (!response.ok || !data.ok) throw new Error(data.error || 'Could not save the library.')
          if (disposed) return
          properties.ghpPath = data.path
          managers.forEach(function (manager) { manager.rememberPath(data.path); manager.properties.selectedPath = data.path; manager.setDirtyCanvas() })
          if (node.graph) node.graph.commitHistory('csharp-ghp-path', node)
          status.dataset.state = 'ready'; status.textContent = 'Saved ' + data.name + ' · ' + data.count + ' nodes in ' + data.path + '. Load it with GHP Manager.'
          close.textContent = 'Close'
        } catch (error) {
          if (!disposed) { status.dataset.state = 'error'; status.textContent = error.message || String(error); save.disabled = false }
        }
      })
      if (canvas) canvas.closeMenu()
      document.body.appendChild(dialog)
      dialog.showModal()
      fields.path.focus()
    }
  }
})(window)
