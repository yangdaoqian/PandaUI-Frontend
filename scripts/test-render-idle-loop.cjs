const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'))
let now = 1000
function loadClass (file, name) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/^import .*\r?\n/gm, '')
    .replace(/export default class /g, 'class ')
    .replace(/export function /g, 'function ')
  return vm.runInNewContext(source + '\n' + name, { performance: { now: () => now } })
}
const AdaptiveViewport = loadClass('src/AdaptiveViewport.js', 'AdaptiveViewport')
const RenderEngine = loadClass('src/render/RenderEngine.js', 'RenderEngine')
// Exercise the actual pipeline scheduling methods without constructing WebGL/UI.
const pipelineSource = fs.readFileSync(path.join(root, 'src/DisplayPipeline.js'), 'utf8')
const dirtyMethod = pipelineSource.slice(pipelineSource.indexOf('  setDirtyFlag ('), pipelineSource.indexOf('\n  attachSharedScene'))
const qualityMethod = pipelineSource.slice(pipelineSource.indexOf('  updateViewportQuality ('), pipelineSource.indexOf('\n  resizeViewport'))
const Pipeline = vm.runInNewContext(`class Pipeline {
  #adaptiveViewport; #nodeRenderer; #dirtyFlag = false; #disposed = false;
  #importedMaterials; #sceneRevision = 0; #frameSize = [100, 100]; #frameTimings = {};
  #edgeDisplay = { configure: () => false }; #renderer; #viewportStatusTime = Infinity;
  constructor(adaptive, engine, renderer) { this.#adaptiveViewport = adaptive; this.#nodeRenderer = engine; this.#renderer = renderer }
  viewportPixelRatio() { return this.#adaptiveViewport.scale }
  requestFrame() { if (!this.#disposed) this.#dirtyFlag = true }
  takeFrame() { const dirty = this.#dirtyFlag; this.#dirtyFlag = false; return dirty }
  ${dirtyMethod}
  ${qualityMethod}
}; Pipeline`, { performance: { now: () => now }, window: { dispatchEvent () {} }, CustomEvent: class {} })

for (const gpu of [false, true]) {
  now = 1000
  const gl = { getExtension: () => gpu ? { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 } : null,
    isContextLost: () => false, createQuery: () => ({}), beginQuery () {}, endQuery () {}, deleteQuery () {},
    getParameter: () => false, QUERY_RESULT_AVAILABLE: 3, QUERY_RESULT: 4,
    getQueryParameter: (_, key) => key === 3 ? true : 140e6 }
  const renderer = { getContext: () => gl, capabilities: { isWebGL2: true }, getPixelRatio: () => pixelRatio }
  let pixelRatio = 0.6
  const adaptive = new AdaptiveViewport(renderer)
  adaptive.scale = adaptive.activeScale = 0.6
  adaptive.lastFrame = 0
  const engine = Object.create(RenderEngine.prototype)
  const config = { mode: 'raster', quality: { resolutionScale: 1, interactionScale: 0.5, rasterSamples: 4 } }
  Object.assign(engine, { store: { active: ['test-render', config] }, renderer, version: 1, sceneVersion: 0,
    lastInteraction: 0, resources: { refreshTargets () {} }, composite () {} })
  const pipeline = new Pipeline(adaptive, engine, renderer)
  const statuses = []
  engine.services = { requestFrame: () => pipeline.requestFrame(), sceneContext: () => ({ scenes: [] }),
    onStatus: status => statuses.push({ time: now, ...status }) }
  let key, samples = 0, frames = 0
  // GPU output is replaced; keep RenderEngine's real request/status/interaction logic.
  engine.rasterFrame = (_, camera, width, height, scale, targetSamples) => {
    const next = JSON.stringify([width, height, scale, targetSamples, engine.sceneVersion])
    if (next !== key) { key = next; samples = 0 }
    samples = Math.min(targetSamples, samples + 1)
    return { texture: {}, status: { samples, targetSamples, done: samples === targetSamples } }
  }
  function tick (loading = false) {
    pipeline.updateViewportQuality({}, 1, loading)
    if (pipeline.takeFrame()) {
      frames++
      pixelRatio = adaptive.scale
      adaptive.beginFrame(now)
      engine.renderFrame({ camera: {}, width: 100 * pixelRatio, height: 100 * pixelRatio })
      now += 140
      adaptive.endFrame(now)
    }
    now += 20
  }
  const finish = now + 8000
  while (now < finish) tick()
  const settledFrames = frames
  const idleFinish = now + 2000
  while (now < idleFinish) tick()
  assert.equal(frames, settledFrames, `${gpu ? 'GPU' : 'CPU'} idle accumulation must stop drawing; statuses=${statuses.map(s => s.state).join(',')}`)
  assert.equal(adaptive.scale, 1, 'Idle refinement must retain full resolution')
  assert.equal(statuses.at(-1).state, 'ready')
  assert.equal(engine.sceneVersion, 0, 'Refinement must not mutate scene revision')

  pipeline.setDirtyFlag(true)
  assert.equal(adaptive.scale, 0.6, 'A real scene edit must resume adaptive resolution')
  assert.equal(engine.sceneVersion, 1)
  tick()
  assert(frames > settledFrames, 'Scene edits still redraw')
  const settleAfterEdit = now + 8000
  while (now < settleAfterEdit) tick()
  assert.equal(adaptive.scale, 1)
  adaptive.noteInteraction(now)
  pipeline.setDirtyFlag(false)
  assert.equal(adaptive.scale, 0.6, 'Camera gestures still resume adaptive resolution')
  assert.equal(engine.sceneVersion, 1, 'Camera motion must not rebuild scene resources')
  const settleAfterCamera = now + 8000
  while (now < settleAfterCamera) tick()
  assert.equal(adaptive.scale, 1)
  tick(true)
  assert.equal(adaptive.scale, 0.6, 'Import work still resumes adaptive resolution')
  adaptive.dispose()
  console.log(`PASS ${gpu ? 'GPU timer' : 'CPU fallback'}: idle settles; scene edits, camera and loading resume (${root})`)
}
