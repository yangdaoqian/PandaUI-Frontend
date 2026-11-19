/* eslint-env node */
// Usage: node scripts/test-skp-browser.cjs dist/spa path/to/model.skp [...]
// Private models are provided at runtime and never copied into the export.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os')
function playwright () {
  if (process.env.PANDAUI_PLAYWRIGHT_PATH) return require(process.env.PANDAUI_PLAYWRIGHT_PATH)
  try { return require('playwright') } catch { return require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
}
async function main () {
  const root = path.resolve(process.argv[2] || 'dist/spa'), files = process.argv.slice(3).map(file => path.resolve(file))
  assert(files.length, 'Supply at least one SKP fixture path')
  const expectedWarnings = JSON.parse(process.env.PANDAUI_SKP_EXPECT_WARNINGS || '[]')
  const errors = [], writes = [], results = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') writes.push(url.pathname)
      res.writeHead(503, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ code: 'BACKEND_UNAVAILABLE', error: 'Frontend-only SKP test' })); return
    }
    if (url.pathname.startsWith('/__fixture/')) {
      const file = files[Number(url.pathname.split('/').pop())]
      if (!file) { res.writeHead(404).end(); return }
      fs.createReadStream(file).pipe(res); return
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  let browser
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await playwright().chromium.launch({ channel: 'msedge', headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    page.setDefaultTimeout(120000)
    page.on('pageerror', e => errors.push(e.message))
    page.on('dialog', async d => {
      const expected = expectedWarnings.length && files.some(file => d.message() === `Loaded ${path.basename(file)}.\n\n${expectedWarnings.join('\n\n')}`)
      if (!expected) errors.push(d.message())
      await d.dismiss()
    })
    await page.addInitScript(() => {
      const NativeWorker = window.Worker
      window.skpWorkers = []
      window.Worker = class extends NativeWorker {
        constructor (...args) {
          super(...args)
          const info = { requests: 0, batches: 0, records: 0, terminated: false }
          this.testInfo = info; window.skpWorkers.push(info)
          this.addEventListener('message', ({ data }) => {
            if (data.error) info.error = data.error
            if (data.result?.records) { info.batches++; info.records += data.result.records.length }
          })
        }
        postMessage (...args) { this.testInfo.requests++; return super.postMessage(...args) }
        terminate () { this.testInfo.terminated = true; return super.terminate() }
      }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' })
    await page.locator('#canvasParent > canvas').waitFor()
    await page.evaluate(() => {
      const key = Object.keys(window).find(k => k.startsWith('webpackChunk'))
      window[key].push([['skp-test'], {}, require => {
        for (const [id, factory] of Object.entries(require.m)) {
          if (!factory.toString().includes('modelDocuments()') || !factory.toString().includes('openLocalFile(')) continue
          for (const value of Object.values(require(id))) if (typeof value?.modelDocuments === 'function' && typeof value?.openLocalFile === 'function') window.testApp = value
        }
      }])
    })
    await page.waitForFunction(() => window.testApp?.getNodeC())
    for (let index = 0; index < files.length; index++) {
      const result = await page.evaluate(async ({ index, name }) => {
        const app = window.testApp, before = new Set(app.modelDocuments()), started = performance.now()
        const response = await fetch('/__fixture/' + index)
        let sawEdgesBeforeMesh = false, partialMeshes = 0
        const ok = await app.openLocalFile(new File([await response.arrayBuffer()], name), 'open', { onProgress: progress => {
          if (progress.done) return
          const current = app.modelDocuments().find(d => !before.has(d))
          let edges = 0, meshes = 0
          current?.three.middleground.traverse(o => { if (o.isMesh && !o.userData.renderBatch) meshes++; if (o.userData.sharpEdge) edges++ })
          if (edges && !meshes) sawEdgesBeforeMesh = true
          if (meshes) partialMeshes = Math.max(partialMeshes, meshes)
        } })
        const doc = app.modelDocuments().find(d => !before.has(d))
        if (!doc) throw Error('Import did not create a document')
        const roots = doc.three.middleground.children.filter(o => o.userData.importedModelObject)
        const stats = () => {
          let mesh = 0, triangles = 0, features = 0, topology = 0, visibleTopology = 0, hidden = 0
          roots.forEach(root => root.traverse(o => {
            if (o.isMesh) { mesh++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3 }
            if (o.userData.sharpEdge) features++
            if (o.userData.meshGeometryEdges) { topology++; if (o.visible) visibleTopology++ }
            if (o.userData.importedHiddenObject) hidden++
          }))
          return { mesh, triangles, features, topology, visibleTopology, hidden }
        }
        const initial = stats()
        doc.setMeshEdgeVisibility(true); const edgesOn = stats()
        doc.setMeshEdgeVisibility(false); doc.setRenderMode(true); doc.setRenderMode(false)
        const restored = stats()
        const layer = roots[0]?.fullLayerPath
        doc.setLayerVisibility(layer, false)
        const layerHidden = roots.filter(o => o.fullLayerPath === layer).every(o => !o.visible)
        doc.setLayerVisibility(layer, true)
        const box = app.getDisplayPipeline()
        let editableMesh
        roots.forEach(root => root.traverseVisible(o => { if (!editableMesh && o.isMesh) editableMesh = o }))
        const editRoot = box.findEnterableGroup(editableMesh)
        if (!editRoot || !box.enterGroupEditLevel(editRoot)) throw Error('Cannot enter imported instance')
        const member = box.selectionTarget({ object: editableMesh })
        box.setSelectedObject(member)
        if (member === editRoot || box.getSelectedObjectRoot() !== member) throw Error('Internal member selection resolved to the whole instance')
        const overlay = box.createSelectionHighlight(member)
        if (!overlay) throw Error('Selected internal member has no highlight')
        let highlightedEdges = 0
        overlay.traverse(o => {
          if (o.isMesh) throw Error('Selected faces must retain their original appearance')
          if (o.isLine) highlightedEdges++
          o.material?.dispose()
          if (o.userData.ownedSelectionGeometry) o.geometry?.dispose()
        })
        if (!highlightedEdges) throw Error('Mesh-only member needs an edge highlight')
        box.setSelectedObject(null); box.clearGroupEditMode()
        const catalog = box.importedMaterialCatalog().filter(entry => JSON.parse(entry.key)[0] === doc.documentId)
        if (!catalog.length || catalog.some(entry => entry.name === 'Unnamed material')) throw Error('Named editable material library is missing')
        const entry = catalog[0]
        await box.updateImportedMaterial(entry.key, { roughness: 0.19, color: '#00ff00' })
        const updated = box.importedMaterialCatalog().find(item => item.key === entry.key)
        if (!updated || Math.abs(updated.settings.roughness - 0.19) > 1e-8 || updated.settings.color !== '#00ff00') throw Error('Material edits were not retained')
        let textures = 0, uvMeshes = 0
        roots.forEach(root => root.traverse(o => { if (o.isMesh && o.userData.displayMaterials?.render.map) { textures++; if (o.geometry.attributes.uv) uvMeshes++ } }))
        box.setDirtyFlag()
        return { name, ok, objects: roots.length, layers: doc.layers.length, initial, edgesOn, restored, layerHidden, materials: catalog.map(m => ({ name: m.name, count: m.count })), textures, uvMeshes, sawEdgesBeforeMesh, partialMeshes, warnings: doc.importWarnings, elapsedMs: performance.now() - started, workers: window.skpWorkers }
      }, { index, name: path.basename(files[index]) })
      assert.equal(result.ok, true)
      assert(result.objects && result.initial.mesh && result.initial.features && result.layers)
      assert.equal(result.initial.visibleTopology, 0)
      assert(result.edgesOn.visibleTopology > 0)
      assert.deepEqual(result.restored, result.initial)
      assert(result.layerHidden)
      assert.deepEqual(result.warnings, expectedWarnings, 'Unexpected import warnings')
      assert(result.workers.every(w => !w.error))
      assert(result.workers.some(w => w.records > 0 && w.terminated))
      assert(result.sawEdgesBeforeMesh, 'Source edges must reach the scene before surfaces')
      if (process.env.PANDAUI_SKP_PROGRESS_TEST === '1') {
        assert(result.workers[result.workers.length - 1].batches > 3)
        assert(result.partialMeshes > 1)
        assert.equal(result.objects, 1)
        assert.equal(result.materials.length, 1)
        assert(result.textures > 1 && result.textures === result.uvMeshes)
      }
      results.push(result); console.log(JSON.stringify(result))
    }
    assert.deepEqual(writes, [], 'Frontend import must not upload/convert through the unavailable backend')
    assert.deepEqual(errors, [])
    console.log('PASS browser SKP: actual production worker, unavailable backend, meshes/edges/tree, display-mode roundtrip, hide/show, and worker cleanup.')
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
