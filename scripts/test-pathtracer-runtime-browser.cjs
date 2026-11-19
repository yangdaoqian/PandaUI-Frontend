// Real WebGL2 regression of the isolated production runtime; no raster fallback.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
let chromium
try { ({ chromium } = require('playwright')) } catch (_) {
  ({ chromium } = require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')))
}
async function main () {
  const root = path.resolve(__dirname, '..')
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost').pathname
    if (url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<script src="/three.js"></script><script src="/shared/pathtracer/runtime.js"></script>'); return }
    const file = url === '/three.js' ? path.join(root, 'node_modules/three/build/three.js') : path.resolve(root, 'public', '.' + url)
    if (url !== '/three.js' && !file.startsWith(path.join(root, 'public') + path.sep)) { res.writeHead(403).end(); return }
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', url.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()) }
      if (message.text().startsWith('TEST:')) console.log(message.text())
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const result = await page.evaluate(async () => {
      const THREE = window.THREE
      const tracer = new window.PandaPathTracerRuntime.PathTracer()
      const capability = await tracer.initialize()
      if (!capability.supported) throw new Error('Real GPU runtime unavailable: ' + capability.reason)
      window.tracer = tracer
      const identity = new THREE.Matrix4().toArray()
      const geometry = (g, geometryId) => ({ geometryId, positions: g.attributes.position.array, normals: g.attributes.normal.array, uv: g.attributes.uv.array, indices: g.index?.array })
      const sphere = geometry(new THREE.SphereBufferGeometry(0.8, 24, 16), 'sphere')
      const back = geometry(new THREE.PlaneBufferGeometry(7, 7), 'back')
      const image = document.createElement('canvas'); image.width = image.height = 64
      const context = image.getContext('2d')
      for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) { context.fillStyle = (x + y) % 2 ? '#ffcc44' : '#0044ff'; context.fillRect(x * 8, y * 8, 8, 8) }
      const scene = {
        geometries: [sphere, back],
        instances: [
          { geometryId: 'sphere', matrix: identity, material: 0 },
          { geometryId: 'back', matrix: new THREE.Matrix4().makeTranslation(0, 0, -1.5).toArray(), material: 1 }
        ],
        materials: [
          { color: [1, 1, 1], roughness: 0, metalness: 0, transmission: 1, ior: 1.5, thickness: 1, opacity: 1, side: 2 },
          { color: [1, 1, 1], roughness: 0.7, metalness: 0, map: 0, emissive: [0.3, 0.3, 0.3], emissiveMap: 0 }
        ],
        textures: [{ image, colorSpace: 'srgb', flipY: true, wrapS: 1000, wrapT: 1000, repeat: [1, 1], matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
        lights: [{ type: 'sun', color: [1, 1, 1], intensity: 2, position: [2, 3, 5], target: [0, 0, 0], direction: [-2, -3, -5] }],
        environment: { preset: 'sky', intensity: 1, background: true },
        effects: { ground: false }, bounds: { min: [-3.5, -3.5, -1.5], max: [3.5, 3.5, 0.8] }
      }
      const camera = { type: 'perspective', position: [0, 0, 4], target: [0, 0, 0], up: [0, 1, 0], fov: 45, aspect: 1, near: 0.01, far: 100 }
      tracer.setCamera(camera)
      tracer.configure({ samples: 12, bounces: 6, resolutionScale: 1, exposure: 1, denoise: false })
      const sample = async label => {
        const start = performance.now()
        while (true) {
          const progress = tracer.step(64, 64)
          if (progress.state === 'fallback') throw new Error(label + ': ' + progress.reason)
          if (progress.done) break
          if (performance.now() - start > 90000) throw new Error(label + ' timed out: ' + JSON.stringify(progress))
          await new Promise(resolve => setTimeout(resolve, 5))
        }
        const canvas = await tracer.copyToCanvas()
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        console.log('TEST: ' + label + ' ' + Math.round(performance.now() - start) + ' ms')
        return Array.from(pixels)
      }
      const difference = (a, b) => a.reduce((sum, value, index) => sum + (index % 4 < 3 ? Math.abs(value - b[index]) : 0), 0) / (a.length * 0.75)
      await tracer.setScene(scene)
      const glass = await sample('glass + checker texture')
      scene.materials[0].ior = 1.01
      await tracer.setScene(scene)
      const lowIor = await sample('near-air IOR')
      scene.materials[0].ior = 1.5; scene.materials[0].roughness = 0.35
      await tracer.setScene(scene)
      const rough = await sample('rough transmission')
      scene.materials[0].transmission = 0; scene.materials[0].roughness = 0.3; scene.materials[0].color = [0.6, 0.05, 0.03]
      await tracer.setScene(scene)
      const opaque = await sample('opaque')
      scene.materials[0].transparent = true; scene.materials[0].opacity = 0.15
      await tracer.setScene(scene)
      const transparent = await sample('alpha transparency')
      delete scene.materials[1].map; delete scene.materials[1].emissiveMap
      await tracer.setScene(scene)
      const untextured = await sample('without texture')
      tracer.configure({ denoise: true, denoiseStrength: 1 })
      const denoised = await sample('denoised')
      tracer.configure({ denoise: false, exposure: 0.3 })
      const dark = await sample('exposure')
      tracer.configure({ exposure: 1 })
      const mask = document.createElement('canvas'); mask.width = mask.height = 2
      const maskContext = mask.getContext('2d')
      scene.materials[0].opacity = 1; scene.materials[0].alphaMap = 1
      scene.textures.push({ image: mask, colorSpace: '', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] })
      maskContext.fillStyle = '#ff0000'; maskContext.fillRect(0, 0, 2, 2)
      await tracer.setScene(scene)
      const zeroGreen = await sample('alpha mask red=1 green=0')
      maskContext.fillStyle = '#00ff00'; maskContext.fillRect(0, 0, 2, 2)
      await tracer.setScene(scene)
      const fullGreen = await sample('alpha mask red=0 green=1')
      const requests = [tracer.setScene(scene), tracer.setScene(scene), tracer.setScene(scene)]
      const queued = await Promise.all(requests)
      await sample('coalesced scene builds')
      const recovered = await tracer.setScene({ ...scene, lights: [{ type: 'ambient', intensity: 1 }] })
      if (recovered.supported !== false || !/ambient/.test(recovered.reason)) throw new Error('Unsupported light did not report explicit fallback')
      const recovery = await tracer.setScene(scene)
      if (!recovery.supported) throw new Error('Valid scene did not recover from unsupported content')
      await sample('recovery after explicit fallback')
      const progress = { ...tracer.progress }
      const before = tracer.progress.samples
      for (let i = 0; i < 10; i++) tracer.step(64, 64)
      const settled = before === tracer.progress.samples
      const diagnostics = tracer.diagnostics
      await tracer.dispose(); await tracer.dispose()
      const released = tracer.diagnostics.rendererMemory === null
      return {
        capability, progress, settled, released, diagnostics, superseded: queued.filter(r => r.superseded).length,
        differences: { ior: difference(glass, lowIor), rough: difference(glass, rough), alpha: difference(opaque, transparent), texture: difference(transparent, untextured), denoise: difference(untextured, denoised), exposure: difference(untextured, dark), alphaGreen: difference(zeroGreen, fullGreen) },
        nonBlack: glass.filter((value, i) => i % 4 < 3 && value > 10).length
      }
    })
    console.log(JSON.stringify(result, null, 2))
    assert(result.nonBlack > 1000, 'GPU output should contain shaded geometry')
    for (const [feature, value] of Object.entries(result.differences)) assert(value > 0.05, `${feature} must affect rendered pixels (${value})`)
    assert(result.settled, 'Completed rendering must stop accumulating')
    assert(result.released, 'Disposal must finish and release the renderer')
    assert.equal(result.superseded, 2, 'Only the newest queued scene should be published')
    assert.deepEqual(errors, [], 'No shader, worker, disposal or page errors')
    console.log('PASS: isolated path tracer glass/IOR/roughness/alpha/textures/denoise/exposure/settling/disposal')
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
