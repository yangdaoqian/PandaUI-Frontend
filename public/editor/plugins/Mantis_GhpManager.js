(function (PandaUI, global) {
  'use strict'

  function element (tag, className, text) {
    var result = document.createElement(tag)
    result.className = className || ''
    if (text != null) result.textContent = text
    return result
  }

  function uniquePaths (values) {
    var result = []
    ;(Array.isArray(values) ? values : []).forEach(function (value) {
      var path = String(value || '').trim()
      if (path && result.indexOf(path) < 0) result.push(path)
    })
    return result
  }

  function GhpManagerNode () {
    this.properties = {
      paths: [],
      selectedPath: '',
      autoLoad: true,
      loadedPaths: [],
      catalog: [],
      status: 'Ready',
      error: ''
    }
    this.size = [440, 360]
    this.widgetUI = 'ghp'
    this._loadRequests = new Map()
    this._loadControllers = new Map()
    this._disposed = false
    this.addInput('Path', 'string')
    this.addOutput('Catalog', 'generic')
    this.addOutput('Status', 'string')
    this.addOutput('Count', 'integer')
  }

  GhpManagerNode.title = 'GHP Manager'
  GhpManagerNode.desc = 'Load and persist Mantis GHP/GHA component libraries.'
  GhpManagerNode.prototype.getMinimumSize = function () { return [360, 220] }
  GhpManagerNode.prototype.computeSize = function () {
    var minimum = this.getMinimumSize()
    this.size[0] = Math.max(minimum[0], Number(this.size[0]) || minimum[0])
    this.size[1] = Math.max(minimum[1], Number(this.size[1]) || minimum[1])
    this.ensurePortLabelWidth()
    return this.size
  }
  GhpManagerNode.prototype.widgetContentTop = function () { return 56 }
  GhpManagerNode.prototype.onConfigure = function () {
    this.properties.paths = uniquePaths(this.properties.paths)
    this.properties.loadedPaths = uniquePaths(this.properties.loadedPaths)
    if (!Array.isArray(this.properties.catalog)) this.properties.catalog = []
    if (typeof this.properties.autoLoad !== 'boolean') this.properties.autoLoad = true
    if (!this.properties.status) this.properties.status = 'Ready'
  }
  GhpManagerNode.prototype.onAdded = function () {
    if (!this.properties.autoLoad || !this.properties.paths.length) return
    this.loadAll()
  }
  GhpManagerNode.prototype.onRemoved = function () {
    this._disposed = true
    this._loadControllers.forEach(function (controller) { controller.abort() })
    this._loadControllers.clear()
    this._loadRequests.clear()
  }
  GhpManagerNode.prototype.setStatus = function (status, error) {
    if (this._disposed) return
    this.properties.status = String(status || 'Ready')
    this.properties.error = error ? String(error.message || error) : ''
    this.setOutputData(0, Array.isArray(this.properties.catalog) ? this.properties.catalog : [])
    this.setOutputData(1, this.properties.error ? this.properties.status + ': ' + this.properties.error : this.properties.status)
    this.setOutputData(2, Array.isArray(this.properties.catalog) ? this.properties.catalog.length : 0)
    this.setDirtyCanvas()
  }
  GhpManagerNode.prototype.publishCatalog = function (catalog) {
    if (this._disposed) return
    this.properties.catalog = Array.isArray(catalog) ? catalog : []
    if (typeof global.registerPandaUIGhCatalog === 'function') global.registerPandaUIGhCatalog(this.properties.catalog)
    this.setOutputData(0, this.properties.catalog)
    this.setOutputData(2, this.properties.catalog.length)
  }
  GhpManagerNode.prototype.rememberPath = function (path) {
    var paths = uniquePaths(this.properties.paths.concat([path]))
    var changed = JSON.stringify(paths) !== JSON.stringify(this.properties.paths)
    this.properties.paths = paths
    if (changed && this.graph && !this.graph._restoring) this.graph.commitHistory('ghp-path', this)
  }
  GhpManagerNode.prototype.loadPath = function (path) {
    var node = this
    path = String(path || '').trim()
    if (!path) {
      this.setStatus('Error', 'Enter an absolute .ghp or .gha path.')
      return Promise.resolve({ ok: false, error: 'A GHP path is required.' })
    }
    if (this._loadRequests.has(path)) return this._loadRequests.get(path)
    this.properties.selectedPath = path
    this.setStatus('Loading ' + path)
    var controller = new AbortController()
    this._loadControllers.set(path, controller)
    var request = fetch('/api/node/ghp/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path }),
      signal: controller.signal
    }).then(function (response) {
      return response.json().catch(function () { throw new Error('Invalid GHP loader response.') }).then(function (data) {
        if (!response.ok || !data || data.ok !== true) throw new Error(data && data.error || 'The GHP assembly could not be loaded.')
        return data
      })
    }).then(function (data) {
      if (node._disposed) return data
      node.rememberPath(data.path || path)
      node.properties.loadedPaths = uniquePaths(node.properties.loadedPaths.concat([data.path || path]))
      node.publishCatalog(data.catalog)
      node.setStatus('Loaded ' + (data.name || data.path || path))
      node.setDirtyCanvas()
      return data
    }).catch(function (error) {
      if (!node._disposed && error.name !== 'AbortError') node.setStatus('Error', error)
      return { ok: false, error: error.message || String(error) }
    }).finally(function () {
      if (node._loadRequests.get(path) === request) node._loadRequests.delete(path)
      if (node._loadControllers.get(path) === controller) node._loadControllers.delete(path)
    })
    this._loadRequests.set(path, request)
    return request
  }
  GhpManagerNode.prototype.loadAll = function () {
    var node = this
    var paths = uniquePaths(this.properties.paths)
    return paths.reduce(function (chain, path) { return chain.then(function () { return node.loadPath(path) }) }, Promise.resolve())
  }
  GhpManagerNode.prototype.refreshCatalog = function () {
    var node = this
    this.setStatus('Refreshing catalog')
    return fetch('/api/node/catalog').then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok || !data || data.ok !== true) throw new Error(data && data.error || 'The node catalog could not be refreshed.')
        node.publishCatalog(data.catalog)
        node.setStatus('Catalog refreshed')
        return data
      })
    }).catch(function (error) {
      node.setStatus('Error', error)
      return { ok: false, error: error.message || String(error) }
    })
  }
  GhpManagerNode.prototype.removePath = function (path) {
    var removed = String(path || '')
    this.properties.paths = this.properties.paths.filter(function (item) { return item !== removed })
    this.properties.loadedPaths = this.properties.loadedPaths.filter(function (item) { return item !== removed })
    if (this.properties.selectedPath === removed) this.properties.selectedPath = ''
    if (this.graph && !this.graph._restoring) this.graph.commitHistory('ghp-remove-path', this)
    this.setDirtyCanvas()
  }
  GhpManagerNode.prototype.onExecute = function () {
    var input = this.getInputData(0)
    var path = input == null ? this.properties.selectedPath : String(input)
    this.setOutputData(0, Array.isArray(this.properties.catalog) ? this.properties.catalog : [])
    this.setOutputData(1, this.properties.error ? this.properties.status + ': ' + this.properties.error : this.properties.status)
    this.setOutputData(2, Array.isArray(this.properties.catalog) ? this.properties.catalog.length : 0)
    if (path && path !== this.properties.selectedPath) this.properties.selectedPath = path
  }
  GhpManagerNode.prototype.buildWidgetUI = function (root, control) {
    var node = this
    root.classList.add('pandaui-ghp-manager')
    var pathRow = element('div', 'pandaui-ghp-path-row')
    var input = element('input', 'pandaui-ghp-path')
    input.type = 'text'
    input.placeholder = 'Absolute path to a .ghp or .gha file'
    input.setAttribute('aria-label', 'GHP path')
    var load = element('button', 'pandaui-ghp-action', 'Load')
    load.type = 'button'
    var refresh = element('button', 'pandaui-ghp-action', 'Refresh')
    refresh.type = 'button'
    pathRow.append(input, load, refresh)
    var autoRow = element('label', 'pandaui-ghp-auto')
    var auto = element('input')
    auto.type = 'checkbox'
    autoRow.append(auto, element('span', '', 'Load saved libraries when the document opens'))
    var status = element('div', 'pandaui-ghp-status')
    var list = element('div', 'pandaui-ghp-list')
    root.append(pathRow, autoRow, status, list)

    function connectedPath () {
      var value = node.getInputData(0)
      return value == null ? '' : String(value)
    }
    function selectedPath () { return connectedPath() || input.value.trim() || node.properties.selectedPath }
    function renderList () {
      list.replaceChildren()
      node.properties.paths.forEach(function (path) {
        var row = element('div', 'pandaui-ghp-item')
        var label = element('span', '', path)
        label.title = path
        var button = element('button', 'pandaui-ghp-remove', '×')
        button.type = 'button'; button.title = 'Remove saved path'
        button.addEventListener('click', function () { node.removePath(path) })
        row.append(label, button); list.appendChild(row)
      })
    }
    load.addEventListener('click', function () { node.loadPath(selectedPath()) })
    refresh.addEventListener('click', function () { node.refreshCatalog() })
    input.addEventListener('change', function () { node.properties.selectedPath = input.value.trim(); node.setDirtyCanvas() })
    auto.addEventListener('change', function () {
      node.properties.autoLoad = auto.checked
      if (node.graph) node.graph.commitHistory('ghp-auto-load', node)
    })
    this._widgetInput = input
    control.bindings.push(function () {
      if (document.activeElement !== input) input.value = node.properties.selectedPath || ''
      auto.checked = node.properties.autoLoad !== false
      status.textContent = node.properties.error ? node.properties.status + ': ' + node.properties.error : node.properties.status
      status.dataset.state = node.properties.error ? 'error' : (/^Loaded|refreshed/i.test(node.properties.status) ? 'ready' : /^Loading|Refreshing/i.test(node.properties.status) ? 'busy' : 'idle')
      renderList()
    })
    control.disposers.push(function () { node._widgetInput = null })
  }

  PandaUI.registerNode('Mantis/GHP Manager', GhpManagerNode)
  if (Array.isArray(global.PandaUINodePlugins) && !global.PandaUINodePlugins.some(function (plugin) { return plugin.id === 'mantis-ghp-manager' })) {
    global.PandaUINodePlugins.push({ id: 'mantis-ghp-manager', name: 'Mantis GHP Manager', version: '1.0.0', icon: 'extension', description: 'Load and persist Mantis GHP/GHA component libraries.', types: ['Mantis/GHP Manager'] })
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') global.dispatchEvent(new CustomEvent('pandaui-node-plugins-changed'))
  }
})(window.PandaUI, window)
