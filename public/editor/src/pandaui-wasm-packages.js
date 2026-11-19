(function (global) {
  'use strict'
  const PandaUI = global.PandaUI
  const registered = new Map()
  let states = global.PandaUINodePluginStates || {}
  let client
  let loading
  let closed = false
  function applyStates (event) {
    states = event.detail || states
    for (const plugin of registered.values()) {
      const state = states[plugin.id] || {}
      for (const type of plugin.types) PandaUI.nodeTypes[type].pandauiPluginEnabled = state.installed !== false && state.enabled !== false
    }
  }
  function register ({ manifest }) {
    const id = 'wasm:' + manifest.id
    if (registered.has(id)) return
    const types = manifest.nodes.map(node => 'WASM/' + manifest.name + '/' + node.category.replace(/[\\/]/g, '_') + '/' + node.id)
    if (types.some(type => PandaUI.nodeTypes[type])) throw new Error('WASM node type is already registered.')
    const categories = new Map()
    manifest.nodes.forEach((entry, index) => {
      const type = types[index]
      const description = entry.description + '\n\nWASM package loaded. SolveInstance implementation pending.'
      function PackageNode () {
        this.size = [210, 80]
        entry.inputs.forEach(port => this.addInput(port.name, port.type, port))
        entry.outputs.forEach(port => this.addOutput(port.name, port.type, port))
        this._executionBackend = 'node-package-wasm'
      }
      PackageNode.title = entry.name
      PackageNode.desc = description
      PackageNode.pandauiDefinition = {
        id: id + ':' + entry.id, guid: entry.id, version: manifest.version,
        title: entry.name, category: entry.category, description, pluginId: id,
        executor: 'native', execution: 'wasm-package', inputs: entry.inputs, outputs: entry.outputs,
        metadata: { packageId: manifest.id, frontendImplementation: { status: 'placeholder', label: 'WASM · SolveInstance pending', reason: 'Registration is implemented; computation is pending.' } }
      }
      PackageNode.prototype.onExecute = async function () {
        if (PandaUI.nodeTypes[type].pandauiPluginEnabled === false) throw new Error('WASM node package is disabled.')
        const context = this.getActiveExecutionContext?.()
        const result = await client.solve(manifest.id, entry.id, { signal: context?.signal })
        if (context?.signal.aborted || context?.isCurrent && !context.isCurrent()) throw new DOMException('Node cancelled.', 'AbortError')
        // Empty output + warning is deliberate: never forward inputs or pretend a
        // placeholder produced valid geometry. The scheduler clears old previews.
        this.outputs.forEach((port, i) => this.setOutputData(i, undefined))
        this._runtimeMessages = { errors: [], warnings: [result.message], remarks: [] }
      }
      PandaUI.registerNode(type, PackageNode)
      PandaUI.registerSearchboxExtra(type, 'WASM / ' + manifest.name + ' / ' + entry.category + ' / ' + entry.name, null)
      if (!categories.has(entry.category)) categories.set(entry.category, [])
      categories.get(entry.category).push({ type, name: entry.name, description })
    })
    const plugin = { id, name: manifest.name + ' · WASM', version: manifest.version, icon: 'extension', description: 'Loaded locally. SolveInstance implementations are pending.', types,
      groups: [{ name: manifest.name, categories: [...categories].map(([name, nodes]) => ({ name, nodes })) }] }
    registered.set(id, plugin)
    global.PandaUINodePlugins.push(plugin)
    applyStates({ detail: states })
    global.dispatchEvent(new CustomEvent('pandaui-wasm-packages-loaded'))
    global.dispatchEvent(new CustomEvent('pandaui-node-plugins-changed'))
  }
  async function reload () {
    if (loading) return loading
    loading = (async () => {
      const { NodePackageLoader } = await import('/nodec/NodePackageLoader.mjs')
      if (closed) return []
      if (!client) client = new NodePackageLoader()
      const results = await client.loadAll(undefined, register)
      const failures = results.filter(r => r.status === 'failed')
      if (failures.length) throw new Error(failures.map(r => r.path + ': ' + r.error).join('\n'))
      return results
    })().finally(() => { loading = null })
    return loading
  }
  global.addEventListener('pandaui-plugin-states-applied', applyStates)
  global.addEventListener('pagehide', () => { closed = true; client?.dispose(); client = null })
  global.addEventListener('pageshow', event => { if (event.persisted) { closed = false; reload().catch(report) } })
  function report (error) {
    console.error('WASM node packages:', error)
    if (global.parent !== global) global.parent.postMessage({ type: 'pandaui-editor-status', status: 'WASM node packages: ' + error.message }, global.location.origin)
  }
  global.PandaUIWasmPackages = { reload, get loader () { return client }, get packages () { return [...registered.values()] } }
  global.PandaUIWasmPackages.ready = reload().catch(error => { report(error); return [] })
})(window)
