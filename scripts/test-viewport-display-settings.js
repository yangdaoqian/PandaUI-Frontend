const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const THREE = require('three')
const scope = vm.createContext({ THREE, console, performance, Float32Array })
function load (file, names) {
  let source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  source = source.replace(/import\s+\* as THREE from [^\n]+\n/g, '')
  source = source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g, (match, bindings, target) => target.includes('three.module') ? `const {${bindings}} = THREE;` : '')
  source = source.replace(/export default class /g, 'class ').replace(/export function /g, 'function ').replace(/export\s*\{[^}]+\};?/g, '')
  vm.runInContext(source + '\n' + names.map(name => `globalThis.${name} = ${name}`).join('\n'), scope, { filename: file })
}
load('node_modules/three/examples/jsm/lines/LineSegmentsGeometry.js', ['LineSegmentsGeometry'])
load('node_modules/three/examples/jsm/lines/LineMaterial.js', ['LineMaterial'])
load('src/EdgeDisplayRenderer.js', ['EdgeDisplayRenderer', 'buildEdgeGeometry', 'normalizeEdgeWidth'])
load('src/AdaptiveViewport.js', ['AdaptiveViewport'])

const createViewport = () => new scope.AdaptiveViewport({ getContext: () => ({ getExtension: () => null }), capabilities: { isWebGL2: true } })
const viewport = createViewport()
function calibrate (controller, interval, start = 0, idle = true) {
  for (let frame = 0; frame <= 24; frame++) controller.observeRefresh(start + frame * interval, idle)
}
assert.strictEqual(viewport.targetGpuMs, 100)
for (let sample = 0; sample < 8; sample++) viewport.sample(95, 1000 + sample * 25)
assert.strictEqual(viewport.scale, 1, 'Frames below 100 ms must not be degraded to chase the old GPU target')
calibrate(viewport, 1000 / 60)
for (let sample = 0; sample < 40; sample++) viewport.sample(140, 1500 + sample * 40)
assert(viewport.scale < 1 && viewport.scale >= 0.6, 'Sustained load must lower resolution without exceeding the clarity floor')
const lowered = viewport.scale
for (let sample = 0; sample < 60; sample++) viewport.sample(98, 3100 + sample * 16)
assert.strictEqual(viewport.scale, lowered, 'The 96–100 ms band must hold resolution steady')
for (let sample = 0; sample < 180; sample++) viewport.sample(90, 4200 + sample * 20)
assert(viewport.scale > lowered, 'Spare frame time must gradually restore resolution')
viewport.scale = 0.6
viewport.lastFrame = 1000
assert(viewport.tick(1400, true), 'Idle scenes must request one full-resolution redraw')
assert.strictEqual(viewport.scale, 1)
assert(!viewport.tick(1800, true), 'Idle scenes must not request perpetual redraws')
viewport.noteInteraction(1810)
assert.strictEqual(viewport.scale, 0.6, 'Interaction must resume at the remembered scale before drawing')
viewport.reset(true)
assert.strictEqual(viewport.scale, 0.6, 'Changing tabs must not lose the interactive resolution')
viewport.configure({ adaptive: false, targetFps: 30 })
assert.strictEqual('targetFps' in viewport.settings, false, 'Legacy fixed frame-rate settings must be ignored')
assert.strictEqual(viewport.targetGpuMs, 100, 'Old saved FPS settings must not override the GPU time target')
viewport.beginFrame(1900)
viewport.endFrame(2000)
assert.strictEqual(viewport.scale, 1, 'Disabling adaptation must preserve full resolution')

const busyStartup = createViewport()
calibrate(busyStartup, 40, 0, false)
assert.strictEqual(busyStartup.targetGpuMs, 100, 'Slow browser callbacks must not redefine the GPU budget')

const highRefresh = createViewport()
calibrate(highRefresh, 1000 / 144)
for (let sample = 0; sample < 40; sample++) highRefresh.sample(25, 1500 + sample * 25)
assert.strictEqual(highRefresh.scale, 1, 'A 144 Hz monitor must not force a faster GPU target')
highRefresh.dispose()

const simulated = createViewport()
let simulatedTime = 1000
for (let frame = 0; frame < 300; frame++) {
  const cost = 70 + 60 * simulated.scale ** 2
  simulatedTime += cost
  simulated.sample(cost, simulatedTime)
}
const settledCost = 70 + 60 * simulated.scale ** 2
assert(settledCost >= 96 && settledCost <= 100, 'Resolution feedback must converge to the GPU target band')
const stableScale = simulated.scale
for (let frame = 0; frame < 120; frame++) simulated.sample(99 + (frame % 2 ? 1.5 : -1.5), simulatedTime += 100)
assert.strictEqual(simulated.scale, stableScale, 'Small timing fluctuations around 100 ms must not cause resolution oscillation')
for (let frame = 0; frame < 800; frame++) {
  const cost = 70 + 16 * simulated.scale ** 2
  simulatedTime += cost
  simulated.sample(cost, simulatedTime)
}
assert.strictEqual(simulated.scale, 1, 'A lighter model must regain resolution during interaction')
for (let frame = 0; frame < 200; frame++) simulated.sample(120, simulatedTime += 120)
assert.strictEqual(simulated.scale, 0.6, 'Geometry-heavy scenes must respect the minimum resolution even if 100 ms is unattainable')

const importing = createViewport()
importing.scale = importing.activeScale = 0.7
importing.beginFrame(1000)
importing.endFrame(1002)
for (let chunk = 1; chunk <= 30; chunk++) {
  const now = 1000 + chunk * 500
  assert.strictEqual(importing.tick(now, true, true), false, 'Waiting between download batches must not restore full resolution')
  importing.tick(now + 1, false, true)
  importing.beginFrame(now + 1)
  importing.endFrame(now + 3)
}
assert.strictEqual(importing.scale, 0.7, 'Importing fast chunks must not repeatedly resize the drawing buffer')
assert.strictEqual(importing.tick(16500, true, false), true, 'Full clarity must return after loading finishes')
assert.strictEqual(importing.scale, 1)
importing.noteInteraction(16510)
assert.strictEqual(importing.scale, 0.7)

const cappedDisplay = createViewport()
calibrate(cappedDisplay, 1000 / 60)
for (let frame = 0; frame < 240; frame++) {
  const now = 1000 + frame * 1000 / 60
  cappedDisplay.tick(now)
  cappedDisplay.beginFrame(now)
  cappedDisplay.endFrame(now + 2)
}
assert.strictEqual(cappedDisplay.scale, 1, 'A 60 Hz presentation cap alone must not degrade a fast scene')
assert(Math.abs(cappedDisplay.fps - 60) < 0.1, 'FPS must report actual draws, not inverse GPU or CPU time')

const overloadedDisplay = createViewport()
calibrate(overloadedDisplay, 1000 / 120)
for (let frame = 0; frame < 100; frame++) {
  const now = 1000 + frame * 1000 / 60
  overloadedDisplay.tick(now)
  overloadedDisplay.beginFrame(now)
  overloadedDisplay.endFrame(now + 2)
}
assert.strictEqual(overloadedDisplay.scale, 1, 'Browser frame cadence alone must not force resolution below what render time requires')

const counter = createViewport()
counter.configure({ adaptive: false })
for (let frame = 0; frame < 121; frame++) {
  const now = 1000 + frame * 1000 / 120
  counter.tick(now)
  counter.beginFrame(now)
  counter.endFrame(now + 1)
}
assert(Math.abs(counter.fps - 120) < 0.1, 'FPS counting must work with adaptation disabled')
assert.strictEqual(counter.idle, false)
assert.strictEqual(counter.mode, 'continuous')
assert(Math.abs(counter.cpuMs - 1) < 0.01, 'CPU render cost must be measured separately from frame cadence')
const drawnFrames = counter.frameTimes.length
for (let frame = 1; frame < 20; frame++) counter.tick(2001 + frame * 8, true)
assert.strictEqual(counter.frameTimes.length, drawnFrames, 'Idle RAF callbacks must never count as rendered frames')
counter.tick(2402, true)
assert.strictEqual(counter.fps, null)
assert.strictEqual(counter.idle, true, 'Demand-rendered scenes must show Idle instead of a fabricated refresh rate')
assert.strictEqual(counter.frameTimes.length, 0)
counter.beginFrame(3000)
counter.endFrame(3001)
assert.strictEqual(counter.fps, null, 'Resuming must not average across an idle pause')
counter.reset()
assert.strictEqual(counter.frameTimes.length, 0, 'Visibility changes must discard stale FPS windows')

const sparseDraws = createViewport()
calibrate(sparseDraws, 1000 / 120)
for (let frame = 0; frame < 240; frame++) {
  const now = 1000 + frame * 1000 / 120
  sparseDraws.tick(now, frame % 2 !== 0)
  if (frame % 2 === 0) {
    sparseDraws.beginFrame(now)
    sparseDraws.endFrame(now + 1)
  }
}
assert.strictEqual(sparseDraws.scale, 1, 'Input events at 60 Hz must not be mistaken for a 120 Hz rendering bottleneck')
assert(Math.abs(sparseDraws.fps - 60) < 0.1)
assert.strictEqual(sparseDraws.mode, 'on-demand', 'Sparse redraws must be labelled as update frequency, not a continuous FPS shortfall')
sparseDraws.noteInteraction(3000)
sparseDraws.tick(3001)
sparseDraws.beginFrame(3001)
sparseDraws.endFrame(3002)
assert.strictEqual(sparseDraws.mode, 'continuous', 'Camera interaction must report FPS even when input events arrive slower than RAF')
assert.strictEqual(sparseDraws.fps, null, 'A new camera gesture must discard the previous sparse-update FPS')

const loadingUpdates = createViewport()
for (let frame = 0; frame < 240; frame++) {
  const now = 1000 + frame * 1000 / 60
  loadingUpdates.tick(now, frame % 17 !== 0)
  if (frame % 17 === 0) {
    loadingUpdates.beginFrame(now)
    loadingUpdates.endFrame(now + 2)
  }
}
assert(Math.abs(loadingUpdates.fps - 60 / 17) < 0.01)
assert.strictEqual(loadingUpdates.mode, 'on-demand', '3.5 updates/sec with fast draws must not be presented as 3.5 continuous FPS')
assert.strictEqual(loadingUpdates.scale, 1, 'Low-frequency import updates must not lower resolution')

const stalledDraws = createViewport()
stalledDraws.tick(1000)
stalledDraws.beginFrame(1000)
stalledDraws.endFrame(2200)
stalledDraws.tick(2210, true)
assert.strictEqual(stalledDraws.idle, false, 'A just-completed slow frame must not immediately be labelled idle')
stalledDraws.beginFrame(2210)
stalledDraws.endFrame(3410)
assert(Math.abs(stalledDraws.fps - 1000 / 1210) < 0.01, 'Extremely slow rendering must still report its actual FPS')
stalledDraws.tick(3420)
stalledDraws.beginFrame(3420)
stalledDraws.endFrame(4620)
assert.strictEqual(stalledDraws.mode, 'continuous', 'Consecutive slow frames exceeding 250 ms must still be identified as continuous rendering')
assert(stalledDraws.cpuMs > 1000)

let disjoint = false
let available = false
let deleted = 0
let allocated = 0
let issued = 0
let polls = 0
let gpuMilliseconds = 140
const extension = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }
const gpu = new scope.AdaptiveViewport({
  capabilities: { isWebGL2: true },
  getContext: () => ({
    getExtension: () => extension, isContextLost: () => false,
    createQuery: () => ({ id: ++allocated }),
    beginQuery (target, query) {
      assert(!gpu.pending.some(entry => entry.query === query), 'An unresolved timer query must never be reused')
      issued++
    },
    endQuery () {},
    deleteQuery: () => { deleted++ }, QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4,
    getParameter: () => { polls++; return disjoint },
    getQueryParameter: (query, key) => key === 3 ? available : gpuMilliseconds * 1e6
  })
})
for (let frame = 0; frame < 10; frame++) { gpu.beginFrame(1000 + frame * 120); gpu.endFrame(1001 + frame * 120) }
assert.strictEqual(gpu.pending.length, 4, 'Unresolved GPU queries must stay bounded')
gpu.tick(2100)
assert.strictEqual(gpu.samples, 0, 'GPU results must never block or be read before ready')
available = true
gpu.tick(2201)
assert.strictEqual(gpu.gpuMs, 140, 'GPU nanoseconds must become milliseconds independently of CPU timings')
assert.strictEqual(deleted, 0, 'Completed queries must be recycled rather than deleted each frame')
assert.strictEqual(allocated, 4)
assert.strictEqual(gpu.scale, 0.9, 'GPU overload must bypass warmup but lower resolution by at most 10% per adjustment')
gpuMilliseconds = 180
gpu.beginFrame(2320)
gpu.endFrame(2321)
gpu.tick(2322)
assert.strictEqual(gpu.scale, 0.9, 'New-scale measurements must wait 250 ms before the next reduction')
for (const now of [2480, 2740, 3000, 3260]) {
  gpu.beginFrame(now)
  gpu.endFrame(now + 1)
  gpu.tick(now + 2)
}
assert.strictEqual(gpu.scale, 0.6, 'Repeated overload must stop at the 60% clarity floor')
gpu.tick(3700, true)
assert.strictEqual(gpu.scale, 1, 'Idle must automatically restore full resolution')
gpu.beginFrame(3701)
gpu.endFrame(3702)
assert.strictEqual(gpu.tick(3810, true), false, 'An expensive idle quality redraw must not trigger a downscale/redraw loop')
assert.strictEqual(gpu.scale, 1)
gpu.noteInteraction(3820)
assert.strictEqual(gpu.scale, 0.6, 'Resuming must restore the reduced scale before the first camera frame')
gpuMilliseconds = 100
gpu.beginFrame(3940)
gpu.endFrame(3941)
gpu.tick(3942)
assert.strictEqual(gpu.scale, 0.6, 'A frame at the threshold must keep its resolution')
gpu.beginFrame(4060)
gpu.endFrame(4061)
disjoint = true
gpu.tick(4062)
assert.strictEqual(gpu.samples, 0, 'Disjoint timings must be discarded')
assert.strictEqual(gpu.pending.length, 0)
assert.strictEqual(gpu.gpuMs, null)
disjoint = false
gpu.reset()
gpuMilliseconds = 25
gpu.beginFrame(4280)
gpu.endFrame(4380)
gpu.tick(4381)
assert.strictEqual(gpu.scale, 1, 'A slow CPU frame with a fast GPU must not reduce resolution')
assert.strictEqual(gpu.gpuMs, 25)
const issuedBefore = issued
const pollsBefore = polls
for (let frame = 0; frame < 120; frame++) {
  const now = 5000 + frame * 1000 / 60
  gpu.tick(now)
  gpu.beginFrame(now)
  gpu.endFrame(now + 1)
}
assert(issued - issuedBefore <= 21 && issued > issuedBefore, 'GPU sampling must stay near 10 Hz instead of querying every draw')
assert(polls - pollsBefore <= 21, 'GPU driver polling must be throttled independently of RAF frequency')
assert.strictEqual(allocated, 4, 'Timer queries must remain bounded and reusable through resets and disjoint results')
const fallback = createViewport()
fallback.tick(100)
fallback.beginFrame(100)
fallback.endFrame(240)
assert.strictEqual(fallback.scale, 0.9, 'Without GPU timers, a slow submission must use the same gradual reduction policy')
fallback.tick(600, true)
assert.strictEqual(fallback.scale, 1)
assert.strictEqual(fallback.tick(610, false), false, 'A refinement frame must not resume reduced resolution')
assert.strictEqual(fallback.scale, 1)
fallback.resumeResolution() // DisplayPipeline.setDirtyFlag explicitly marks new display geometry.
assert.strictEqual(fallback.scale, 0.9)

const source = new THREE.BufferGeometry()
source.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 3, 0, 0, 3, 4, 0], 3))
source.setIndex([2, 1, 1, 0])
source.setDrawRange(2, 2)
const wide = scope.buildEdgeGeometry(source, true)
assert.strictEqual(wide.index.count, 6, 'Each wide segment uses only two triangles')
assert.strictEqual(wide.attributes.position.count, 4)
assert.strictEqual(scope.normalizeEdgeWidth(2.4), 2)
assert.strictEqual(scope.normalizeEdgeWidth(2.5), 3)
assert.strictEqual(scope.normalizeEdgeWidth(99), 6)
assert.strictEqual(scope.normalizeEdgeWidth(NaN), 1)
assert.deepStrictEqual(Array.from(wide.attributes.instanceStart.data.array), [3, 0, 0, 0, 0, 0], 'Indexed edges must retain draw range and direction')
assert.deepStrictEqual(Array.from(wide.attributes.instanceDistanceStart.data.array), [0, 3])
wide.dispose()
source.setIndex(null)
source.setDrawRange(0, Infinity)
const loop = scope.buildEdgeGeometry(source, false, true)
assert.strictEqual(loop.instanceCount, 3, 'Closed curves must include the closing segment')
loop.dispose()

const originalMaterial = new THREE.LineDashedMaterial({ color: 0xff3900, opacity: 0.75, transparent: true, depthWrite: false, dashSize: 2, gapSize: 1 })
const line = new THREE.Line(source, originalMaterial)
const scene = new THREE.Scene()
scene.add(line)
const edges = new scope.EdgeDisplayRenderer()
edges.configure(4)
let renderCount = 0
const renderer = { render () {
  renderCount++
  assert.strictEqual(line.isMesh, true, 'Wide edges must render actual triangles')
  assert.strictEqual(line.geometry.instanceCount, 2)
  assert.strictEqual(line.material.linewidth, 4)
  assert.strictEqual(line.material.resolution.x, 631)
  assert.strictEqual(line.material.color.getHex(), 0xff3900)
  assert.strictEqual(line.material.opacity, 0.75)
  assert.strictEqual(line.material.depthWrite, false)
  assert.strictEqual(line.material.dashSize, 2)
  assert.strictEqual(line.material.defines.USE_DASH, '')
} }
edges.render(renderer, scene, new THREE.Camera(), 631, 612)
assert.strictEqual(renderCount, 1)
assert.strictEqual(line.geometry, source, 'Original geometry must remain available for selection and preview copies')
assert.strictEqual(line.material, originalMaterial, 'Original material must remain available for editing and undo')
assert.strictEqual(line.isMesh, undefined)
assert.strictEqual(line.isLine, true)
assert.throws(() => edges.render({ render () { throw new Error('test draw failure') } }, scene, new THREE.Camera(), 631, 612), /test draw failure/)
assert.strictEqual(line.geometry, source, 'Failed rendering must also restore scene objects')
assert.strictEqual(line.material, originalMaterial)
const cachedCurve = edges.geometryFor(line)
const segmentLine = new THREE.LineSegments(source, originalMaterial)
const cachedSegments = edges.geometryFor(segmentLine)
assert.notStrictEqual(cachedCurve, cachedSegments, 'A shared source can represent both a polyline and independent edges')
assert.strictEqual(edges.geometryFor(line), cachedCurve, 'Changing line topology must not discard another occurrence cache')
source.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 6, 0, 0, 6, 8, 0], 3))
assert.notStrictEqual(edges.geometryFor(line), cachedCurve, 'Replacing an attribute must invalidate the display cache even when its version is zero')
source.dispose()
originalMaterial.dispose()
assert.strictEqual(edges.geometries.size, 0, 'Disposing source geometry must release its wide-edge buffers')
assert.strictEqual(edges.materials.size, 0)
edges.dispose()

const cachedScene = new THREE.Scene()
const sharedSource = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 0, 0)])
sharedSource.computeBoundingSphere()
const pooled = new THREE.LineBasicMaterial({ depthWrite: true })
for (let index = 0; index < 50; index++) cachedScene.add(new THREE.LineSegments(sharedSource, pooled))
const farSource = sharedSource.clone()
const farLine = new THREE.LineSegments(farSource, pooled)
farLine.position.x = 1000
cachedScene.add(farLine)
let traversals = 0
let materialUpdates = 0
const traversal = cachedScene.traverseVisible
cachedScene.traverseVisible = function (visit) { traversals++; traversal.call(this, visit) }
const updateMaterial = edges.materialFor
edges.materialFor = function (...args) { materialUpdates++; return updateMaterial.apply(this, args) }
edges.configure(3)
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
camera.position.z = 10
const sink = { render () {} }
edges.render(sink, cachedScene, camera, 600, 600, 1)
edges.render(sink, cachedScene, camera, 600, 600, 1)
assert.strictEqual(traversals, 1, 'Navigation reuses the visible edge list until the scene revision changes')
assert.strictEqual(materialUpdates, 2, 'A pooled material is synchronized once per render, not once per occurrence')
assert.strictEqual(edges.geometries.size, 1, 'Offscreen edges do not allocate wide geometry')
const sharedWide = edges.geometryFor(cachedScene.children[0])
edges.configure(5)
edges.render(sink, cachedScene, camera, 600, 600, 1)
assert.strictEqual(edges.geometryFor(cachedScene.children[0]), sharedWide, 'Width changes reuse segment buffers')
edges.render(sink, cachedScene, camera, 600, 600, 2)
assert.strictEqual(traversals, 2, 'Visibility and document changes invalidate the edge list')
assert.strictEqual(cachedScene.autoUpdate, true)
sharedSource.dispose(); farSource.dispose(); pooled.dispose(); edges.dispose()

const boundedEdges = new scope.EdgeDisplayRenderer(256)
boundedEdges.configure(4)
const boundedScene = new THREE.Scene()
for (let index = 0; index < 5; index++) {
  boundedScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0.5, 0, 0)]), new THREE.LineBasicMaterial()))
}
let visibleLines = 0
boundedEdges.render({ render () { visibleLines = boundedScene.children.filter(object => object.visible).length } }, boundedScene, camera, 600, 600)
assert.equal(visibleLines, 5, 'Exceeding the auxiliary cache budget must never hide model edges')
assert(boundedEdges.cacheBytes <= 256)
assert.equal(boundedEdges.fallbackObjects, 4, 'Edges over the budget fall back to their original single-pixel buffers')
const removedLines = boundedScene.children.slice()
removedLines.forEach(object => boundedScene.remove(object))
boundedEdges.render(sink, boundedScene, camera, 600, 600)
assert.equal(boundedEdges.cacheBytes, 0, 'Removed or hidden objects must not retain auxiliary GPU buffers')
assert.equal(boundedEdges.materials.size, 0)
removedLines.forEach(object => { object.geometry.dispose(); object.material.dispose() })
boundedEdges.dispose()
gpu.dispose()
assert.strictEqual(deleted, allocated, 'Disposing the viewport must release every pooled GPU query')
viewport.dispose()
console.log('PASS: 100 ms GPU convergence and recovery, 60% resolution floor, idle clarity, actual draw FPS, bounded queries, indexed edges, scene restoration and resource release')
