const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium } = require('playwright')
async function run () {
  const root = path.resolve(__dirname, '../public')
  const counts = new Map()
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    counts.set(pathname, (counts.get(pathname) || 0) + 1)
    if (pathname === '/test-index.json') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ schemaVersion: 1, packages: ['/missing/manifest.json', '/nodec/packages/nodecurvec/manifest.json'] }))
      return
    }
    const file = path.resolve(root, '.' + pathname)
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : file.endsWith('.html') ? 'text/html' : 'text/css')
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    // Exercise state arriving before async package discovery finishes.
    await page.addInitScript(() => { window.PandaUIBackendMode = 'local' })
    await page.goto('http://127.0.0.1:' + server.address().port + '/editor/index.html')
    await page.evaluate(async () => { await window.PandaUIEditorReady; await window.PandaUIWasmPackagesReady })
    const result = await page.evaluate(async () => {
      const api = window.PandaUIWasmPackages
      const types = api.packages.flatMap(p => p.types)
      if (types.length !== 630) throw new Error('Incorrect loaded node count: ' + types.length)
      const type = types.find(t => PandaUI.nodeTypes[t].title === 'Closed')
      const node = PandaUI.createNode(type)
      graph.add(node)
      await graph.getGraphDocument().flushDirty()
      const state = node._executionState
      const warning = node._runtimeMessages?.warnings[0]
      const ports = { inputs: node.inputs.map(p => [p.name, p.type, p.access]), outputs: node.outputs.map(p => p.name) }
      const serialized = graph.serialize()
      graph.configure(serialized)
      await graph.getGraphDocument().flushDirty()
      const restored = graph._nodes.find(n => n.type === type)
      const restoreOk = restored && !restored._isMissingNode && restored.inputs.length === 1
      const pluginId = PandaUI.nodeTypes[type].pandauiDefinition.pluginId
      applyPandaUINodePluginStates({ [pluginId]: { enabled: false } })
      const disabled = PandaUI.createNode(type) === null
      applyPandaUINodePluginStates({})
      await api.reload()
      const duplicateCount = api.packages.flatMap(p => p.types).length
      const { NodePackageLoader } = await import('/nodec/NodePackageLoader.mjs')
      const isolated = new NodePackageLoader()
      const mixed = await isolated.loadAll('/test-index.json')
      isolated.dispose()
      const record = api.loader.packages.get('nodecurvec')
      const cancel = new AbortController()
      const cancelled = api.loader.solve('nodecurvec', record.manifest.nodes[0].id, { signal: cancel.signal }).then(() => 'unexpected', error => error.name)
      cancel.abort()
      const cancellation = await cancelled
      api.loader.reset()
      const recovered = await api.loader.solve('nodecurvec', record.manifest.nodes[0].id)
      return { count: types.length, packages: api.packages.length, state, warning, ports, restoreOk, disabled, duplicateCount, mixed, cancellation, recovered, search: !!PandaUI.searchbox_extras[type] }
    })
    assert.equal(result.packages, 7)
    assert.equal(result.state, 'warning')
    assert.match(result.warning, /SolveInstance is not implemented/)
    assert.deepEqual(result.ports, { inputs: [['Curve', 'curve', 'item']], outputs: ['Closed', 'Periodic'] })
    assert(result.restoreOk && result.disabled && result.search)
    assert.equal(result.duplicateCount, 630)
    assert.equal(result.mixed.filter(r => r.status === 'failed').length, 1)
    assert.equal(result.mixed.filter(r => r.status === 'loaded').length, 1)
    assert.equal(result.cancellation, 'AbortError')
    assert.equal(result.recovered.status, 'pending')
    const menus = await page.evaluate(async () => {
      // Mixed-case adapter/plugin paths must merge with existing native paths.
      for (const type of ['Display/MenuFixture', 'Input/MenuFixture', 'Maths/MenuFixture', 'Transform/MenuFixture', 'transform/MenuFixture2']) {
        function Fixture () {}
        Fixture.title = 'Menu Fixture'
        PandaUI.registerNode(type, Fixture)
      }
      const labels = () => [...graphcanvas.menu.querySelectorAll('.pandaui-node-menu__list > button')].map(b => b.textContent)
      graphcanvas.showAddNodeMenu(100, 100, [100, 100])
      const roots = labels().filter(s => s.endsWith(' ›')).map(s => s.slice(0, -2))
      graphcanvas.showAddNodeMenu(100, 100, [100, 100], ['Display'])
      const display = labels()
      const clipping = [...graphcanvas.menu.querySelectorAll('button')].find(b => b.textContent === PandaUI.nodeTypes['display/clipping_plane'].title)
      if (!clipping) throw new Error('Clipping Plane disappeared from Display.')
      clipping.click()
      const legacyType = graph._nodes[graph._nodes.length - 1].type
      const type = PandaUIWasmPackages.packages.flatMap(p => p.types).find(t => PandaUI.nodeTypes[t].title === 'Closed')
      const path = graphcanvas.nodeMenuPath(type)
      graphcanvas.showAddNodeMenu(100, 100, [250, 100], path)
      const pendingLabel = graphcanvas.nodeMenuLabel(type)
      const pending = [...graphcanvas.menu.querySelectorAll('button')].find(b => b.textContent === pendingLabel)
      if (!pending) throw new Error('WASM node disappeared from its functional category.')
      pending.click()
      const addedType = graph._nodes[graph._nodes.length - 1].type
      graphcanvas.showNodeChooser(100, 100, [100, 100])
      const search = graphcanvas.menu.querySelector('input')
      search.value = 'geometry / curves / wasm'
      search.dispatchEvent(new Event('input'))
      const searchResults = labels()
      graphcanvas.closeMenu()
      return { roots, display, legacyType, addedType, expectedType: type, pendingLabel, path, searchResults }
    })
    assert.equal(new Set(menus.roots.map(s => s.toLowerCase())).size, menus.roots.length)
    // The standalone export intentionally excludes the robot plugin.
    assert.deepEqual(menus.roots.filter(name => name !== 'Robotics'), ['Panels', 'Parameters', 'Data', 'Math', 'Geometry', 'Transform', 'Display', 'Render', 'Scripting', 'AI'])
    assert(menus.display.includes('Menu Fixture'))
    assert.equal(menus.legacyType, 'display/clipping_plane')
    assert.equal(menus.addedType, menus.expectedType)
    assert.match(menus.pendingLabel, / · Pending$/)
    assert.deepEqual(menus.path, ['Geometry', 'Curves', 'WASM', 'Analysis'])
    assert(menus.searchResults.length > 0 && menus.searchResults.every(s => s.includes('Geometry / Curves / WASM')))
    assert.equal([...counts.keys()].filter(url => url.startsWith('/api/')).length, 0, 'No backend requests')
    assert.equal(counts.get('/nodec/NodeC.wasm'), undefined, 'Registration does not duplicate/load geometry runtime')
    assert.deepEqual(errors, [])
    console.log('PASS browser: offline auto-discovery, 7 packages / 630 Add Node types, real Worker load, pending warnings, ports, save/restore, enable/disable, idempotent reload, failure isolation, cancellation, Worker recovery.')
    console.log('PASS menus: mixed-case categories merged, functional WASM placement, pending labels, normalized search, legacy node creation and stable type IDs.')
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
