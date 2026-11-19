import * as THREE from 'three'
import RasterRenderer, { rasterResolution } from '../src/render/RasterRenderer.js'
import { setSurfaceSettings } from '../src/render/MaterialSurface.js'
import { mirrorCameraForPlane } from '../src/render/MaterialRefractionPass.js'

window.runRasterTests = ({ webgl1 = false } = {}) => {
  const checks = []
  const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label) }
  const canvas = document.createElement('canvas')
  const context = webgl1 ? canvas.getContext('webgl', { alpha: true, antialias: false }) : undefined
  const renderer = new THREE.WebGLRenderer({ canvas, context, logarithmicDepthBuffer: true, antialias: false, alpha: true })
  renderer.setPixelRatio(2)
  renderer.setSize(128, 128)
  renderer.outputEncoding = THREE.sRGBEncoding
  const raster = new RasterRenderer(renderer)
  check(raster.renderer === renderer, 'Uses the supplied WebGL context')
  const reflectionDepthShader = { vertexShader: '#include <logdepthbuf_pars_vertex>\n#include <logdepthbuf_vertex>', fragmentShader: '#include <logdepthbuf_pars_fragment>\n#include <logdepthbuf_fragment>' }
  raster.refraction.reflectionDepthMaterial.onBeforeCompile(reflectionDepthShader)
  check(!/logdepthbuf|USE_LOGDEPTHBUF/.test(reflectionDepthShader.vertexShader + reflectionDepthShader.fragmentShader), 'Reflection depth capture removes logarithmic depth')
  check(raster.aoSupported, 'Browser supports actual SSAO')
  const doc = new THREE.Scene(), preview = new THREE.Scene(), lights = new THREE.Scene()
  const parent = new THREE.Group()
  parent.position.x = 0.25
  parent.add(doc)
  const floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 1 }))
  floor.rotation.x = -Math.PI / 2
  const box = new THREE.Mesh(new THREE.BoxBufferGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.7 }))
  box.position.y = 1
  doc.add(floor, box)
  lights.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2))
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(5, 4, 7)
  camera.lookAt(0, 0.6, 0)
  const options = { scenes: [doc, preview, lights], camera, width: 128, height: 128, background: 0x111111, quality: { fxaa: false }, effects: { ao: 0, bloom: 0, exposure: 1 } }
  const draw = changes => raster.render({ ...options, ...changes })
  const pixels = result => {
    const bytes = new Uint8Array(result.width * result.height * 4)
    renderer.readRenderTargetPixels(result.target, 0, 0, result.width, result.height, bytes)
    return bytes
  }
  const sum = bytes => { let total = 0; for (let i = 0; i < bytes.length; i += 4) total += bytes[i] + bytes[i + 1] + bytes[i + 2]; return total }
  const differs = (a, b) => a.some((value, index) => value !== b[index])
  const plainResult = draw()
  const plain = pixels(plainResult)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 4
  const alreadyConfigured = pixels(draw())
  check(!differs(plain, alreadyConfigured), 'Existing renderer tone mapping/exposure cannot double-map raster output')
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1
  check(plainResult.width === 128 && plainResult.height === 128, 'Physical dimensions do not multiply DPR twice')
  check(sum(plain) > 100000, 'Beauty produces visible pixels')
  check(!raster.aoPass.enabled && !raster.bloomPass.enabled && !raster.fxaaPass.enabled, 'Zero effects and FXAA false disable postpasses')
  check(doc.parent === parent && box.parent === doc && lights.children[0].parent === lights, 'Original parents retained')
  check(raster.scene.autoUpdate === false && raster.scene.children[0] === doc, 'Proxy borrows source roots without cloning')
  check(box.matrixWorld.elements[12] === 0.25, 'World matrices include source ancestors before rendering')
  const ray = new THREE.Raycaster()
  ray.setFromCamera(new THREE.Vector2(), camera)
  check(ray.intersectObject(doc, true).some(hit => hit.object === box || hit.object === floor), 'Picking still targets original objects')
  const reflectionScene = new THREE.Scene()
  const reflectionFloor = new THREE.Mesh(new THREE.PlaneBufferGeometry(12, 12), new THREE.MeshPhysicalMaterial({ color: 0x777777, metalness: 1, roughness: 0.08 }))
  reflectionFloor.rotation.x = -Math.PI / 2
  const reflectionSubject = new THREE.Mesh(new THREE.BoxBufferGeometry(1.6, 1.6, 1.6), new THREE.MeshPhysicalMaterial({ color: 0xff2020, roughness: 0.45 }))
  reflectionSubject.position.y = 1.2
  reflectionScene.add(reflectionFloor, reflectionSubject)
  setSurfaceSettings(reflectionFloor.material, { materialType: 'metal', reflection: 1, metalness: 1, roughness: 0.08 })
  const reflectionCamera = camera.clone()
  const reflectionDraw = () => draw({ scenes: [reflectionScene, lights], camera: reflectionCamera, effects: { ao: 0, bloom: 0 }, background: 0x050505 })
  const redReflection = pixels(reflectionDraw())
  reflectionSubject.material.color.set(0x2040ff)
  reflectionSubject.material.needsUpdate = true
  const blueReflection = pixels(reflectionDraw())
  let reflectedGroundDelta = 0
  for (let y = 0; y < 48; y++) for (let x = 0; x < 128; x++) {
    const index = (y * 128 + x) * 4
    reflectedGroundDelta += Math.abs(redReflection[index] - blueReflection[index]) + Math.abs(redReflection[index + 1] - blueReflection[index + 1]) + Math.abs(redReflection[index + 2] - blueReflection[index + 2])
  }
  check(reflectedGroundDelta > 100, 'Authored reflective ground receives scene-object reflections')
  setSurfaceSettings(reflectionSubject.material, { reflection: 0.7, roughness: 0.45 })
  reflectionDraw()
  check(!!raster.refraction.reflectionPlane, 'A curved reflective object does not switch the authored ground mirror to SSR')
  const captureProbe = new THREE.WebGLRenderTarget(128, 128)
  const reflectedSubjectPixels = () => {
    reflectionDraw()
    raster.copyPass.render(renderer, captureProbe, raster.refraction.reflectionTarget)
    return pixels({ target: captureProbe, width: 128, height: 128 })
  }
  const mirroredBlue = reflectedSubjectPixels()
  reflectionSubject.material.color.set(0xff2020); reflectionSubject.material.needsUpdate = true
  check(differs(mirroredBlue, reflectedSubjectPixels()), 'Authored ground retains other reflective objects in its mirror capture')
  const authoredGlass = new THREE.Mesh(reflectionFloor.geometry, new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide }))
  authoredGlass.rotation.copy(reflectionFloor.rotation); authoredGlass.position.y = 0.2
  setSurfaceSettings(authoredGlass.material, { transmission: 1, reflection: 0, ior: 1, thickness: 0, roughness: 0 })
  reflectionScene.add(authoredGlass)
  const authoredClear = reflectedSubjectPixels()
  setSurfaceSettings(authoredGlass.material, { roughness: 0.8 })
  check(differs(authoredClear, reflectedSubjectPixels()), 'Authored ground mirror also evaluates the intervening frosted glass')
  reflectionScene.remove(authoredGlass); authoredGlass.material.dispose(); reflectionDraw()
  check(raster.refraction.mirrorTransmission.stages.length === 0, 'Removing mirror glass releases its optical captures')
  const screenTarget = raster.refraction.screenCapture.reflectionTarget
  let releasedScreen = false; screenTarget.addEventListener('dispose', () => { releasedScreen = true })
  setSurfaceSettings(reflectionSubject.material, { reflection: 0 }); reflectionDraw()
  check(releasedScreen && !raster.refraction.screenCapture, 'Removing curved reflections releases the extra SSR capture')
  captureProbe.dispose()
  // A flat mirror must cover every visible point of its plane, including Z-up,
  // rolled and parented cameras. A world-space lookAt hint is not local +Y.
  for (const ortho of [false, true]) {
    const c = ortho ? new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 100) : new THREE.PerspectiveCamera(45, 1.5, 0.1, 100)
    c.up.set(0, 0, 1); c.position.set(8, -12, 7); c.lookAt(0, 0, 1); c.rotateZ(0.2)
    const rig = new THREE.Group(); rig.rotation.z = 0.3; rig.add(c); rig.updateMatrixWorld(true)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const mirrored = mirrorCameraForPlane(c, { normal: plane.normal, constant: 0 })
    let tested = 0
    for (let y = -0.9; y <= 0.91; y += 0.15) for (let x = -0.9; x <= 0.91; x += 0.15) {
      ray.setFromCamera(new THREE.Vector2(x, y), c)
      const hit = ray.ray.intersectPlane(plane, new THREE.Vector3())
      if (!hit) continue
      const projected = hit.project(mirrored); tested++
      if (Math.abs(projected.x) > 1.00001 || Math.abs(projected.y) > 1.00001) throw new Error('Mirror capture clips a visible plane point')
    }
    check(tested > 30, `Z-up ${ortho ? 'orthographic' : 'perspective'} mirror covers the full visible plane`)
  }
  // Single open surface: a rear object rendered last must not overwrite it,
  // nor become a false SSR hit when the reflected ray points toward the camera.
  const openScene = new THREE.Scene(), openGeometry = new THREE.PlaneBufferGeometry(5, 5)
  const openSurface = new THREE.Mesh(openGeometry, new THREE.MeshPhysicalMaterial({ color: '#777777', roughness: 0.35, side: THREE.DoubleSide }))
  openSurface.rotation.x = 0.05; openSurface.position.z = -2
  setSurfaceSettings(openSurface.material, { reflection: 1, transmission: 0, opacity: 1 })
  const behindSolid = new THREE.Mesh(new THREE.PlaneBufferGeometry(3, 3), new THREE.MeshBasicMaterial({ color: '#ff0000' }))
  behindSolid.position.z = -4; behindSolid.renderOrder = 100
  openScene.add(openSurface, behindSolid, new THREE.AmbientLight(0xffffff, 1))
  const openCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
  const openDraw = () => pixels(draw({ scenes: [openScene], camera: openCamera, width: 96, height: 96, effects: { ao: 0, bloom: 0, fxaa: false } }))
  const rearRed = openDraw(); behindSolid.material.color.set('#0000ff'); const rearBlue = openDraw()
  const openCenter = (48 * 96 + 48) * 4
  check(rearRed.slice(openCenter, openCenter + 4).every((value, i) => Math.abs(value - rearBlue[openCenter + i]) < 2), 'Open opaque reflective face blocks rear objects and rejects false behind-surface SSR hits')
  check(openSurface.material.depthWrite && !openSurface.material.transparent, 'Reflective render copies preserve the opaque source material')
  for (const object of [openSurface, behindSolid]) { object.geometry.dispose(); object.material.dispose() }
  const ao = pixels(draw({ effects: { ao: { strength: 2, radius: 2 }, bloom: 0 } }))
  check(sum(ao) < sum(plain), `SSAO darkens actual pixels (${sum(ao)} < ${sum(plain)})`)
  check(raster.aoPass.ssaoMaterial.uniforms.tDepth.value === raster.aoPass.normalRenderTarget.depthTexture, 'SSAO reconstructs from normal depth')
  check(raster.aoPass.depthRenderMaterial.uniforms.tDepth.value === raster.aoPass.normalRenderTarget.depthTexture, 'Depth visualization uses normal depth')
  check(raster.aoPass.beautyRenderTarget.depthTexture !== raster.aoPass.normalRenderTarget.depthTexture, 'Beauty log depth remains independent')
  const normalShader = { vertexShader: '#include <logdepthbuf_pars_vertex>\n#include <logdepthbuf_vertex>', fragmentShader: '#include <logdepthbuf_pars_fragment>\n#include <logdepthbuf_fragment>' }
  raster.aoPass.normalMaterial.onBeforeCompile(normalShader)
  check(!/logdepth/.test(normalShader.vertexShader + normalShader.fragmentShader), 'Normal shaders remove all logarithmic depth chunks')
  const bloom = pixels(draw({ effects: { ao: 0, bloom: { strength: 1.2, threshold: 0.2 } } }))
  check(sum(bloom) > sum(plain), 'UnrealBloom changes actual pixels')
  const fxaa = pixels(draw({ quality: { fxaa: true } }))
  check(differs(fxaa, plain), 'FXAA changes edge pixels')
  const dim = pixels(draw({ effects: { exposure: 0.25 } }))
  const bright = pixels(draw({ effects: { exposure: 2 } }))
  check(sum(dim) < sum(plain) && sum(bright) > sum(plain), 'Exposure changes output exactly in the final pass')
  const black = pixels(draw({ effects: { exposure: 0 } }))
  check(sum(black) === 0, 'Zero exposure is respected')
  const ortho = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.2, 150)
  ortho.position.copy(camera.position)
  ortho.quaternion.copy(camera.quaternion)
  const orthographic = pixels(draw({ camera: ortho, effects: { ao: 1, bloom: 0.2 }, quality: 'high' }))
  check(sum(orthographic) > 0, 'Orthographic AO/bloom/FXAA shaders compile and render')
  check(raster.aoPass.ssaoMaterial.defines.PERSPECTIVE_CAMERA === 0, 'Orthographic reconstruction define updated')
  ortho.near = 0.5; ortho.far = 200; ortho.zoom = 1.5; ortho.updateProjectionMatrix()
  draw({ camera: ortho, effects: { ao: 1 } })
  check(raster.aoPass.ssaoMaterial.uniforms.cameraNear.value === 0.5 && raster.aoPass.depthRenderMaterial.uniforms.cameraFar.value === 200, 'Near/far refreshed without resize')
  check(raster.aoPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.equals(ortho.projectionMatrix), 'Projection refreshed without resize')
  draw({ effects: { ao: 1 } })
  check(raster.aoPass.ssaoMaterial.defines.PERSPECTIVE_CAMERA === 1, 'Switch back to perspective recompiles correctly')

  // Directly sample normal projection depth through SSAOPass's depth output;
  // a front plane at z=-10 has orthographic-linear depth (10-near)/(far-near).
  const depthScene = new THREE.Scene()
  const depthMesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(20, 20), new THREE.MeshBasicMaterial())
  depthMesh.position.z = -10
  depthScene.add(depthMesh)
  const depthCamera = new THREE.PerspectiveCamera(45, 1, 1, 101)
  draw({ scenes: [depthScene], camera: depthCamera, effects: { ao: 1 } })
  const depthTarget = new THREE.WebGLRenderTarget(1, 1)
  raster.aoPass.renderPass(renderer, raster.aoPass.depthRenderMaterial, depthTarget)
  const depthPixel = new Uint8Array(4)
  renderer.readRenderTargetPixels(depthTarget, 0, 0, 1, 1, depthPixel)
  // SSAODepthShader visualizes one minus linear depth.
  check(Math.abs(depthPixel[0] / 255 - 0.91) < 0.015, 'Real GPU normal depth is conventional projection depth under log renderer: ' + depthPixel[0])

  const savedTarget = new THREE.WebGLRenderTarget(32, 32)
  savedTarget.viewport.set(2, 3, 20, 22)
  savedTarget.scissor.set(4, 5, 12, 14)
  savedTarget.scissorTest = true
  renderer.setViewport(3, 4, 100, 101)
  renderer.setScissor(5, 6, 90, 91)
  renderer.setScissorTest(true)
  renderer.setRenderTarget(savedTarget)
  renderer.setClearColor(0x123456, 0.35)
  renderer.autoClear = false
  renderer.autoClearColor = false
  renderer.autoClearDepth = false
  renderer.sortObjects = false
  renderer.toneMapping = THREE.ReinhardToneMapping
  renderer.toneMappingExposure = 2.7
  renderer.localClippingEnabled = true
  const clipping = [new THREE.Plane(new THREE.Vector3(1, 0, 0), 100)]
  renderer.clippingPlanes = clipping
  const state = () => JSON.stringify({
    viewport: renderer.getViewport(new THREE.Vector4()).toArray(),
    scissor: renderer.getScissor(new THREE.Vector4()).toArray(),
    currentViewport: renderer.getCurrentViewport(new THREE.Vector4()).toArray(),
    glScissor: Array.from(renderer.getContext().getParameter(renderer.getContext().SCISSOR_BOX)),
    scissorTest: renderer.getScissorTest(),
    color: renderer.getClearColor().getHex(),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    autoClearColor: renderer.autoClearColor,
    autoClearDepth: renderer.autoClearDepth,
    clipping: renderer.localClippingEnabled,
    sort: renderer.sortObjects,
    tone: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    encoding: renderer.outputEncoding
  })
  const before = state()
  draw({ effects: { ao: 1, bloom: 0.5 } })
  check(state() === before && renderer.getRenderTarget() === savedTarget && renderer.clippingPlanes === clipping, 'All shared renderer state restored after render')
  raster.compositeToScreen()
  check(state() === before && renderer.getRenderTarget() === savedTarget, 'Screen composite restores state without another tone mapping')
  const callback = box.onBeforeRender
  box.onBeforeRender = () => { throw new Error('intentional render failure') }
  let caught = false
  try { draw({ effects: { ao: 1 } }) } catch (error) { caught = error.message === 'intentional render failure' }
  box.onBeforeRender = callback
  check(caught && state() === before && renderer.getRenderTarget() === savedTarget, 'State restored when a source callback throws')
  renderer.setRenderTarget(null)
  renderer.clippingPlanes = []
  renderer.setScissorTest(false)
  renderer.autoClear = renderer.autoClearColor = renderer.autoClearDepth = true
  const tiny = draw({ width: 1, height: 1, effects: { ao: 1, bloom: 1 } })
  check(tiny.width === 1 && tiny.height === 1, 'Tiny targets and all bloom mips remain valid')
  const bounded = draw({ width: 1e6, height: 5e5, quality: { maxDimension: 64, maxPixels: 2048 } })
  check(bounded.width <= 64 && bounded.width * bounded.height <= 2048 && Math.abs(bounded.width / bounded.height - 2) < 0.1, 'Resolution bounds preserve aspect ratio')
  const gpuBound = rasterResolution(1e9, 1e9, { maxDimension: 1e9, maxPixels: 1e9 }, 128)
  check(gpuBound.width === 128 && gpuBound.height === 128, 'GPU maximum bounds untrusted quality requests')

  // Transparent sort must be global across document and preview roots.
  const red = new THREE.Mesh(new THREE.PlaneBufferGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 'red', opacity: 0.5, transparent: true, depthWrite: false }))
  const blue = new THREE.Mesh(red.geometry, new THREE.MeshBasicMaterial({ color: 'blue', opacity: 0.5, transparent: true, depthWrite: false }))
  red.position.z = -2; blue.position.z = -3
  const first = new THREE.Scene(), second = new THREE.Scene()
  first.add(red); second.add(blue)
  const transparent = pixels(draw({ scenes: [first, second], camera: depthCamera, background: 0, width: 32, height: 32 }))
  const center = (16 * 32 + 16) * 4
  check(transparent[center] > transparent[center + 2], 'Transparent surfaces sort back-to-front across scene roots')
  check(red.parent === first && blue.parent === second, 'Transparent source parents retained')
  const sortedAgain = pixels(draw({ scenes: [second, first], camera: depthCamera, background: 0, width: 32, height: 32 }))
  check(!differs(transparent, sortedAgain), 'Transparent result is independent of root submission order')
  raster.aoSupported = false
  const fallback = draw({ effects: { ao: 1 } })
  check(fallback.status.degraded && /AO/.test(fallback.status.reason) && !raster.aoPass.enabled && raster.beautyPass.enabled, 'Missing AO capability explicitly reports fallback and disables AO')
  raster.aoSupported = true

  const glassScene = new THREE.Scene()
  const checker = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255, 20, 60, 100, 255, 20, 60, 100, 255, 255, 255, 255, 255]), 2, 2, THREE.RGBAFormat)
  checker.wrapS = checker.wrapT = THREE.RepeatWrapping; checker.repeat.set(6, 6); checker.needsUpdate = true
  const backdrop = new THREE.Mesh(new THREE.PlaneBufferGeometry(8, 8), new THREE.MeshBasicMaterial({ map: checker }))
  backdrop.position.z = -4; glassScene.add(backdrop)
  const glass = new THREE.Mesh(new THREE.SphereBufferGeometry(0.7, 32, 24), new THREE.MeshPhysicalMaterial())
  glass.position.z = -2; glassScene.add(glass)
  setSurfaceSettings(glass.material, { materialType: 'glass', transmission: 1, opacity: 1, reflection: 0, ior: 1, thickness: 1, roughness: 0, refractionRoughness: 0 })
  const glassCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const glassDraw = () => draw({ scenes: [glassScene], camera: glassCamera, width: 96, height: 96, effects: { ao: 0, bloom: 0 } })
  const noBend = pixels(glassDraw())
  setSurfaceSettings(glass.material, { ior: 1.8 })
  const bent = pixels(glassDraw())
  check(differs(noBend, bent), 'IOR changes transmitted background pixels independently of opacity')
  check(glass.material.opacity === 1 && glass.material.visible, 'Refraction retains opacity and restores glass visibility')
  // Pixel contrast inside glass must fall; the exposed background stays sharp.
  setSurfaceSettings(glass.material, { ior: 1, roughness: 0, refractionRoughness: 0, thickness: 0 })
  const clearGlass = pixels(glassDraw())
  check(raster.refraction.levels.length === 0, 'Clear glass allocates no blur pyramid')
  const contrast = data => {
    let sum = 0
    for (let y = 32; y < 64; y++) for (let x = 32; x < 64; x++) {
      const i = (y * 96 + x) * 4
      sum += Math.abs(data[i] - data[i - 4]) + Math.abs(data[i] - data[i - 96 * 4])
    }
    return sum
  }
  setSurfaceSettings(glass.material, { roughness: 0.05 })
  const slightGlass = pixels(glassDraw())
  check(contrast(slightGlass) > contrast(clearGlass) * 0.9, 'Roughness 0.05 retains at least 90% of clear glass contrast')
  setSurfaceSettings(glass.material, { roughness: 0.5 })
  const frostedGlass = pixels(glassDraw())
  check(contrast(frostedGlass) < contrast(clearGlass) * 0.95, `Surface roughness softens transmitted checkerboard contrast (${contrast(frostedGlass)} < ${contrast(clearGlass)})`)
  setSurfaceSettings(glass.material, { roughness: 0.8 })
  const heavyGlass = pixels(glassDraw())
  check(contrast(heavyGlass) < contrast(frostedGlass), 'Higher roughness increases transmitted blur')
  check(clearGlass.slice(0, 96 * 4).every((value, i) => value === heavyGlass[i]), 'Frosting leaves exposed background unchanged')
  setSurfaceSettings(glass.material, { roughness: 0, refractionRoughness: 0.5 })
  check(!differs(pixels(glassDraw()), frostedGlass), 'Independent refraction roughness can produce the same frosting')
  let backgroundCaptures = 0
  backdrop.onBeforeRender = () => { backgroundCaptures++ }
  const secondGlass = new THREE.Mesh(glass.geometry, glass.material.clone())
  secondGlass.position.set(0.4, 0, -2.1); glassScene.add(secondGlass)
  glassDraw()
  check(backgroundCaptures === 3 && raster.refraction.levels.length === 4, 'Glass shares one color and one conventional depth capture plus beauty draw')
  glassScene.remove(secondGlass); secondGlass.material.dispose(); backdrop.onBeforeRender = () => {}
  const blurTargets = raster.refraction.levels.flat(), releasedBlur = new Set()
  blurTargets.forEach(target => target.addEventListener('dispose', () => releasedBlur.add(target)))
  draw({ scenes: [glassScene], camera: glassCamera, width: 95, height: 63, effects: { ao: 0, bloom: 0 } })
  check(raster.refraction.levels[0][1].width === 48 && raster.refraction.levels[3][1].height === 1, 'NPOT resize keeps wide-radius blur levels bounded on both WebGL versions')
  releasedBlur.clear()
  raster.refraction.levels.flat().forEach(target => target.addEventListener('dispose', () => releasedBlur.add(target)))
  setSurfaceSettings(glass.material, { roughness: 0, refractionRoughness: 0 })
  check(!differs(pixels(glassDraw()), clearGlass), 'Returning roughness to zero restores the original sharp image')
  check(releasedBlur.size === 8 && raster.refraction.levels.length === 0, 'Returning to clear glass disposes all eight blur buffers')
  const transmissionTarget = raster.refraction.target
  check(transmissionTarget.width === 96, 'Refraction target follows the bounded render resolution')
  const originalCallback = backdrop.onBeforeRender
  backdrop.onBeforeRender = () => { throw new Error('refraction failure') }
  const glassState = state(); let glassFailure = false
  try { glassDraw() } catch (error) { glassFailure = error.message === 'refraction failure' }
  backdrop.onBeforeRender = originalCallback
  check(glassFailure && glass.material.visible && state() === glassState, 'Failed refraction restores materials and shared renderer state')
  setSurfaceSettings(glass.material, { roughness: 0.35 }); glassDraw()
  const activeBlurTargets = raster.refraction.levels.flat(), activeReleased = new Set()
  activeBlurTargets.forEach(target => target.addEventListener('dispose', () => activeReleased.add(target)))
  let refractionReleased = false
  transmissionTarget.addEventListener('dispose', () => { refractionReleased = true })
  setSurfaceSettings(glass.material, { transmission: 0 }); glassDraw()
  check(refractionReleased && !raster.refraction.target, 'Releases background capture when no glass remains')
  check(activeReleased.size === 8 && raster.refraction.levels.length === 0, 'Removing the last glass releases the complete blur pyramid')
  const glassCanvas = document.createElement('canvas'); glassCanvas.width = 288; glassCanvas.height = 96
  const glassContext = glassCanvas.getContext('2d')
  ;[clearGlass, frostedGlass, heavyGlass].forEach((data, i) => glassContext.putImageData(new ImageData(new Uint8ClampedArray(data), 96, 96), i * 96, 0))
  const glassImage = glassCanvas.toDataURL('image/png')
  checker.dispose(); backdrop.geometry.dispose(); backdrop.material.dispose(); glass.geometry.dispose(); glass.material.dispose()

  // Keep checker screen frequency constant: blur must depend on the physical
  // gap, not perspective shrinkage or a fixed roughness-only screen filter.
  const distanceScene = new THREE.Scene()
  const distanceChecker = new THREE.DataTexture(new Uint8Array([255,255,255,255, 0,0,0,255, 0,0,0,255, 255,255,255,255]), 2, 2, THREE.RGBAFormat)
  distanceChecker.wrapS = distanceChecker.wrapT = THREE.RepeatWrapping; distanceChecker.repeat.set(10, 10); distanceChecker.needsUpdate = true
  const distanceBack = new THREE.Mesh(new THREE.PlaneBufferGeometry(8, 8), new THREE.MeshBasicMaterial({ map: distanceChecker }))
  const distanceGlass = new THREE.Mesh(new THREE.PlaneBufferGeometry(3.5, 3.5), new THREE.MeshPhysicalMaterial())
  distanceGlass.position.z = -2
  setSurfaceSettings(distanceGlass.material, { transmission: 1, opacity: 1, reflection: 0, roughness: 0.6, ior: 1, thickness: 0 })
  distanceScene.add(distanceBack, distanceGlass)
  const distanceImages = []
  for (const ortho of [false, true]) {
    const c = ortho ? new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20) : new THREE.PerspectiveCamera(60, 1, 0.1, 20)
    const renderGap = z => {
      distanceBack.position.z = z; distanceBack.scale.setScalar(ortho ? 1 : -z / 2.02)
      const image = pixels(draw({ scenes: [distanceScene], camera: c, width: 96, height: 96, effects: { ao: 0, bloom: 0, fxaa: false } }))
      const target = raster.refraction.stages[0]?.depthTarget
      if (target) {
        const rgba = new Uint8Array(4); renderer.readRenderTargetPixels(target, 48, 48, 1, 1, rgba)
        const depth = (rgba[0] / 16777216 + rgba[1] / 65536 + rgba[2] / 256 + rgba[3]) / 256
        const actual = ortho ? c.near + depth * (c.far - c.near) : c.near * c.far / (c.far - depth * (c.far - c.near))
        check(Math.abs(actual + z) < 0.001, `Packed transmission depth decodes the actual ${-z} model-unit background distance`)
      }
      return image
    }
    const contact = renderGap(-2.02), far = renderGap(-8)
    setSurfaceSettings(distanceGlass.material, { roughness: 0 })
    const clear = renderGap(-2.02)
    setSurfaceSettings(distanceGlass.material, { roughness: 0.6 })
    check(contrast(contact) > contrast(clear) * 0.95, `${ortho ? 'Orthographic' : 'Perspective'} contact objects retain sharp detail behind frosted glass`)
    check(contrast(far) < contrast(contact) * 0.5, `${ortho ? 'Orthographic' : 'Perspective'} distant objects lose detail at unchanged glass roughness (${contrast(far)} / ${contrast(contact)})`)
    const nearLight = sum(contact), farLight = sum(far)
    check(farLight > nearLight * 0.7, `Distance frosting spreads light instead of fading transmission to black (${nearLight} -> ${farLight}, ortho=${ortho})`)
    const clearPane = new THREE.Mesh(new THREE.PlaneBufferGeometry(8, 8), new THREE.MeshPhysicalMaterial())
    clearPane.position.z = -2.01
    setSurfaceSettings(clearPane.material, { transmission: 1, reflection: 0, ior: 1, thickness: 0, roughness: 0 })
    distanceScene.add(clearPane)
    const throughClearContact = renderGap(-2.02), throughClearFar = renderGap(-8)
    check(contrast(throughClearFar) < contrast(throughClearContact) * 0.5, `${ortho ? 'Orthographic' : 'Perspective'} rear clear glass preserves distance frosting (${contrast(throughClearFar)} / ${contrast(throughClearContact)})`)
    distanceScene.remove(clearPane)
    if (ortho) {
      // One mesh with a sloping middle: its left side almost touches the frost,
      // while its right side is six units away. Object-center depth cannot pass.
      const rampGeometry = new THREE.PlaneBufferGeometry(4, 4, 32, 1)
      const positions = rampGeometry.attributes.position
      for (let vertex = 0; vertex < positions.count; vertex++) positions.setZ(vertex, -2.02 - 5.98 * THREE.MathUtils.clamp((positions.getX(vertex) + 1) / 2, 0, 1))
      positions.needsUpdate = true; rampGeometry.computeBoundingBox(); rampGeometry.computeBoundingSphere()
      const ramp = new THREE.Mesh(rampGeometry, distanceBack.material)
      distanceBack.visible = false; distanceScene.add(ramp)
      // Include a close clear sheet to exercise propagation and spatial depth.
      distanceScene.add(clearPane)
      const rampDraw = () => pixels(draw({ scenes: [distanceScene], camera: c, width: 96, height: 96, effects: { ao: 0, bloom: 0, fxaa: false } }))
      setSurfaceSettings(distanceGlass.material, { roughness: 0 })
      const sharpRamp = rampDraw()
      setSurfaceSettings(distanceGlass.material, { roughness: 0.6 })
      const frostedRamp = rampDraw()
      const regionalContrast = (data, left, right) => {
        let result = 0
        for (let y = 24; y < 72; y++) for (let x = left; x < right; x++) {
          const i = (y * 96 + x) * 4
          result += Math.abs(data[i] - data[i + 4]) + Math.abs(data[i] - data[i + 384])
        }
        return result
      }
      const nearRatio = regionalContrast(frostedRamp, 9, 20) / regionalContrast(sharpRamp, 9, 20)
      const farRatio = regionalContrast(frostedRamp, 76, 86) / regionalContrast(sharpRamp, 76, 86)
      check(nearRatio > 0.9 && farRatio < 0.5, `One object's near pixels stay sharp and distant pixels blur (${nearRatio.toFixed(3)}, ${farRatio.toFixed(3)})`)
      distanceScene.remove(ramp, clearPane); rampGeometry.dispose(); distanceBack.visible = true
    }
    clearPane.geometry.dispose(); clearPane.material.dispose()
    if (ortho) distanceImages.push(contact, far)
  }
  const distanceCanvas = document.createElement('canvas'); distanceCanvas.width = 192; distanceCanvas.height = 96
  distanceImages.forEach((data, i) => distanceCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), 96, 96), i * 96, 0))
  const distanceImage = distanceCanvas.toDataURL('image/png')
  // User calibration in millimetres: .5 roughness loses detail after 1000 mm,
  // zero stays clear, and low values must not abruptly become frosted.
  const metricCamera = new THREE.OrthographicCamera(-2000, 2000, 2000, -2000, 100, 20000)
  distanceScene.scale.setScalar(1000); distanceBack.scale.setScalar(1)
  const metricDraw = (roughness, gap) => {
    distanceBack.position.z = -2 - gap / 1000
    setSurfaceSettings(distanceGlass.material, { roughness, frostDistance: 1000 })
    return pixels(draw({ scenes: [distanceScene], camera: metricCamera, width: 96, height: 96, effects: { ao: 0, bloom: 0, fxaa: false } }))
  }
  const metricClear = contrast(metricDraw(0, 1000))
  const metricLow = contrast(metricDraw(0.05, 1000)), metricHalf = contrast(metricDraw(0.5, 1000)), metricFull = contrast(metricDraw(1, 1000))
  check(metricLow > metricClear * 0.9, 'Roughness .05 retains detail at 1000 mm instead of abruptly frosting')
  check(metricHalf < metricClear * 0.02 && metricFull < metricClear * 0.01, `Roughness .5 at 1000 mm and roughness 1 diffuse directional detail (${metricClear}, ${metricHalf}, ${metricFull})`)
  const graded = [1, 100, 500, 1000].map(gap => contrast(metricDraw(0.5, gap)))
  check(graded[0] > graded[1] && graded[1] > graded[2] && graded[2] > graded[3], `Pixel frosting increases smoothly with distance (${graded.join(', ')})`)
  const calibratedMM = metricDraw(0.5, 1000)
  distanceScene.scale.setScalar(1)
  setSurfaceSettings(distanceGlass.material, { frostDistance: 1 })
  const meterCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
  const calibratedM = pixels(draw({ scenes: [distanceScene], camera: meterCamera, width: 96, height: 96, effects: { ao: 0, bloom: 0, fxaa: false } }))
  check(Math.abs(contrast(calibratedMM) - contrast(calibratedM)) < metricClear * 0.01, 'Frost reference distance supports equivalent metre and millimetre models')
  setSurfaceSettings(distanceGlass.material, { frostDistance: 1000 })
  draw({ scenes: [distanceScene], camera: openCamera, width: 96, height: 96 })
  const depthTargets = raster.refraction.stages.map(stage => stage.depthTarget).filter(Boolean), releasedDepth = new Set()
  depthTargets.forEach(target => target.addEventListener('dispose', () => releasedDepth.add(target)))
  distanceGlass.visible = false
  draw({ scenes: [distanceScene], camera: openCamera, width: 96, height: 96 })
  check(releasedDepth.size === depthTargets.length && depthTargets.length > 0, 'Removing frosted glass disposes its separate packed-depth attachments')
  for (const object of [distanceGlass, distanceBack]) { object.geometry.dispose(); object.material.dispose() }
  distanceChecker.dispose()

  // Rear glass must be part of the front glass input, with shared materials,
  // solid occlusion and exception-safe transient assignments.
  const layered = new THREE.Scene(), layerCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 20)
  const white = new THREE.Mesh(new THREE.PlaneBufferGeometry(8, 8), new THREE.MeshBasicMaterial({ color: 'white' }))
  white.position.z = -6; layered.add(white)
  const front = new THREE.Mesh(new THREE.PlaneBufferGeometry(3.5, 3.5), new THREE.MeshPhysicalMaterial())
  const rear = new THREE.Mesh(new THREE.PlaneBufferGeometry(1.4, 1.4), new THREE.MeshPhysicalMaterial())
  front.position.z = -2; rear.position.z = -4; layered.add(front, rear)
  setSurfaceSettings(front.material, { transmission: 1, roughness: 0.35, refractionRoughness: 0, reflection: 0, ior: 1, thickness: 1 })
  setSurfaceSettings(rear.material, { transmission: 1, roughness: 0, reflection: 0, ior: 1, thickness: 1, refractionColor: '#2288dd', attenuationDistance: 1 })
  const frontSource = front.material, rearSource = rear.material
  const layerDraw = (effects = {}) => draw({ scenes: [layered], camera: layerCamera, width: 96, height: 96, effects: { ao: 0, bloom: 0, fxaa: false, ...effects } })
  rear.visible = false; const onlyFront = pixels(layerDraw()); rear.visible = true
  const stacked = pixels(layerDraw())
  check(differs(onlyFront, stacked), 'Frosted foreground includes the rear transmissive glass in its ordered input')
  const middle = (48 * 96 + 48) * 4
  check(stacked[middle + 2] > stacked[middle] && stacked[middle] < onlyFront[middle], 'Rear transmission tint survives foreground frosting')
  check(front.material === frontSource && rear.material === rearSource, 'Layer rendering restores source material identities')
  layered.children.reverse()
  check(!differs(stacked, pixels(layerDraw())), 'Layer composition depends on camera depth rather than insertion order')
  const shared = front.material
  setSurfaceSettings(shared, { roughness: 0, refractionColor: '#bbbbbb', attenuationDistance: 1 })
  rear.material = shared
  const twice = pixels(layerDraw()); rear.visible = false
  const onceLayer = pixels(layerDraw()); rear.visible = true
  check(twice[middle] < onceLayer[middle] - 10, 'Objects sharing one glass material get distinct rear/front transmission inputs')
  rear.material = rearSource
  const solid = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#dd5522' }))
  solid.position.z = -3; layered.add(solid)
  const occluded = pixels(layerDraw()); rear.visible = false; const withoutRear = pixels(layerDraw()); rear.visible = true
  check(!differs(occluded, withoutRear), 'Shared opaque depth prevents rear glass from leaking through a solid object')
  layered.remove(solid); solid.geometry.dispose(); solid.material.dispose()
  // A five-pane alternating stack must compose every pane in depth order.
  // This is the vehicle case: frosted and dark transparent panes alternate
  // before the opaque object behind them.
  const fiveScene = new THREE.Scene()
  const fiveBackdrop = new THREE.Mesh(new THREE.PlaneBufferGeometry(8, 8), new THREE.MeshBasicMaterial({ color: '#eeeeee' }))
  fiveBackdrop.position.z = -8; fiveScene.add(fiveBackdrop)
  const fivePanes = Array.from({ length: 5 }, (_, index) => {
    const pane = new THREE.Mesh(new THREE.PlaneBufferGeometry(3.5, 3.5), new THREE.MeshPhysicalMaterial())
    pane.position.z = -2 - index
    setSurfaceSettings(pane.material, {
      transmission: 1,
      roughness: index % 2 === 0 ? 0.35 : 0,
      reflection: 0,
      ior: 1,
      thickness: 1,
      refractionColor: index % 2 === 0 ? ['#ffe0e0', '#e0ffe0', '#e0e0ff'][index / 2] : '#080b18',
      attenuationDistance: index % 2 === 0 ? 10 : 0.35
    })
    fiveScene.add(pane)
    return pane
  })
  const fiveDraw = () => draw({ scenes: [fiveScene], camera: layerCamera, width: 96, height: 96, effects: { ao: 0, bloom: 0, fxaa: false } })
  pixels(fiveDraw())
  check(raster.refraction.stages.length === 5, 'Five overlapping glass panes receive five ordered transmission bands')
  check(raster.refraction.stages.every(stage => stage.materials.size === 1), 'Each five-layer pane receives its own captured transmission material')
  // CAD imports often store positions in geometry, leaving every object origin
  // at zero. Three sorts transparency by origin, not geometry bounds: the rear
  // pane must never paint over the already-filtered front pane in the beauty pass.
  const stackChecker = new THREE.DataTexture(new Uint8Array([255,255,255,255, 0,0,0,255, 0,0,0,255, 255,255,255,255]), 2, 2, THREE.RGBAFormat)
  stackChecker.wrapS = stackChecker.wrapT = THREE.RepeatWrapping; stackChecker.repeat.set(10, 10); stackChecker.needsUpdate = true
  fiveBackdrop.material.map = stackChecker; fiveBackdrop.material.needsUpdate = true
  fivePanes.forEach((pane, i) => setSurfaceSettings(pane.material, { roughness: i === 0 ? 0.8 : 0, refractionColor: i % 2 ? '#bbbbbb' : '#ffffff', attenuationDistance: 10, thickness: 0.1 }))
  const filteredStack = pixels(fiveDraw())
  setSurfaceSettings(fivePanes[0].material, { roughness: 0 })
  const clearStack = pixels(fiveDraw())
  setSurfaceSettings(fivePanes[0].material, { roughness: 0.8 })
  check(contrast(filteredStack) < contrast(clearStack) * 0.6, `The first frosted pane removes rear-stack detail (${contrast(filteredStack)} / ${contrast(clearStack)})`)
  fivePanes.forEach(pane => { pane.geometry.translate(0, 0, pane.position.z); pane.position.z = 0; pane.geometry.computeBoundingSphere(); pane.geometry.computeBoundingBox() })
  const bakedStack = pixels(fiveDraw())
  check(!differs(filteredStack, bakedStack), 'CAD geometry with coincident object origins retains the front-pane frosting')
  fivePanes.forEach((pane, i) => { pane.renderOrder = i * 10 })
  check(!differs(filteredStack, pixels(fiveDraw())), 'Authored renderOrder cannot paint rear glass over front frosting')
  check(!differs(filteredStack, pixels(fiveDraw())), 'Repeated frames do not contaminate shared capture depth with beauty glass depth')
  check(fivePanes.every(pane => pane.material.depthWrite === false), 'Beauty depth writes do not change authored glass materials')
  const stackCanvas = document.createElement('canvas'); stackCanvas.width = 288; stackCanvas.height = 96
  ;[clearStack, filteredStack, bakedStack].forEach((data, i) => stackCanvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), 96, 96), i * 96, 0))
  const stackImage = stackCanvas.toDataURL('image/png')
  // A far left pane and a near right pane are disjoint, but both overlap a
  // middle wide pane. Reusing band zero for the near pane would skip the middle.
  fivePanes.forEach((pane, i) => { pane.visible = i < 3; pane.renderOrder = 0; pane.geometry.dispose(); pane.geometry = new THREE.PlaneBufferGeometry(i === 1 ? 3.5 : 1, 3.5) })
  fivePanes[0].position.set(-1.2, 0, -6)
  fivePanes[1].position.set(0, 0, -4)
  fivePanes[2].position.set(1.2, 0, -2)
  fivePanes.forEach((pane, i) => setSurfaceSettings(pane.material, { roughness: i === 2 ? 0.6 : 0, thickness: 1, refractionColor: i === 1 ? '#555555' : '#ffffff', attenuationDistance: 1 }))
  const chainWithMiddle = pixels(fiveDraw())
  fivePanes[1].visible = false
  const chainWithoutMiddle = pixels(fiveDraw())
  const chainPixel = (48 * 96 + 76) * 4
  check(chainWithMiddle[chainPixel] < chainWithoutMiddle[chainPixel] - 10, 'Partial overlap chains preserve the intermediate dark glass behind the front pane')
  stackChecker.dispose()
  for (const pane of fivePanes) { pane.geometry.dispose(); pane.material.dispose() }
  fiveBackdrop.geometry.dispose(); fiveBackdrop.material.dispose()
  const originalShadowRender = renderer.shadowMap.render
  rear.onBeforeRender = () => { throw new Error('layer failure') }
  let layerFailure = false
  try { layerDraw() } catch (error) { layerFailure = error.message === 'layer failure' }
  rear.onBeforeRender = () => {}
  check(layerFailure && front.material === frontSource && rear.material === rearSource && renderer.shadowMap.render === originalShadowRender, 'Failed layer draw restores glass materials and the shadow renderer')
  const extras = Array.from({ length: 6 }, (_, i) => {
    const mesh = new THREE.Mesh(rear.geometry, rearSource); mesh.position.set(0, 0, -2.2 - i * 0.2); layered.add(mesh); return mesh
  })
  let solidDraws = 0; white.onBeforeRender = () => { solidDraws++ }; layerDraw()
  check(raster.refraction.stages.length === 8 && solidDraws === 2, 'Eight overlapping glass objects use eight ordered bands without repeating opaque CAD geometry')
  white.onBeforeRender = () => {}; extras.forEach(mesh => layered.remove(mesh))
  const attachedDepth = raster.refraction.target.depthTexture
  let depthDisposals = 0; attachedDepth.addEventListener('dispose', () => { depthDisposals++ })
  front.visible = rear.visible = false; layerDraw()
  check(raster.refraction.stages.length === 0 && depthDisposals === 1, 'All transmission stages release their single shared opaque depth exactly once')
  front.visible = rear.visible = true
  front.material = frontSource; rear.material = rearSource
  // Glass should not cast an opaque shadow, including a mixed material group.
  const receiver = new THREE.Mesh(new THREE.PlaneBufferGeometry(8, 8), new THREE.MeshStandardMaterial({ color: '#dddddd' }))
  receiver.position.z = -6; receiver.receiveShadow = true; layered.remove(white); layered.add(receiver)
  const glassSun = new THREE.DirectionalLight(0xffffff, 3); glassSun.position.set(-2, 0, 3); glassSun.target.position.set(0, 0, -6)
  glassSun.castShadow = true; glassSun.shadow.camera.left = glassSun.shadow.camera.bottom = -5; glassSun.shadow.camera.right = glassSun.shadow.camera.top = 5; glassSun.shadow.camera.far = 30; glassSun.shadow.mapSize.set(256, 256)
  layered.add(glassSun, glassSun.target, new THREE.AmbientLight(0xffffff, 0.2))
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap
  front.castShadow = rear.castShadow = true
  const glassShadow = pixels(layerDraw())
  front.castShadow = rear.castShadow = false
  check(!differs(glassShadow, pixels(layerDraw())), 'Transmissive materials do not leave opaque shadow silhouettes')
  const caster = new THREE.Mesh(new THREE.BoxBufferGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: '#888888' }))
  caster.position.set(1, 0, -4); caster.castShadow = true; layered.add(caster)
  const solidShadow = pixels(layerDraw()); caster.castShadow = false
  check(differs(solidShadow, pixels(layerDraw())), 'Opaque objects still cast ordinary shadows next to glass')
  for (const mesh of [front, rear, white, receiver, caster]) { mesh.geometry.dispose(); mesh.material.dispose() }
  glassSun.shadow.map?.dispose()

  // Subpixel edge coverage and history lifetime, using real GPU pixels.
  const aaScene = new THREE.Scene()
  const aaGeometry = new THREE.BufferGeometry()
  aaGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.91, -0.87, -2, 0.86, -0.73, -2, 0.19, 0.93, -2], 3))
  const aaMesh = new THREE.Mesh(aaGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff }))
  aaScene.add(aaMesh)
  const aaCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  const aaDraw = (samples, revision = 1, width = 64) => draw({ scenes: [aaScene], camera: aaCamera, width, height: 64, background: 0x000000, effects: { exposure: 1, fxaa: false }, quality: { rasterSamples: samples, revision } })
  const rawAA = pixels(aaDraw(1)), beforeProjection = aaCamera.projectionMatrix.clone(), beforeInverse = aaCamera.projectionMatrixInverse.clone()
  let aaResult, draws = 0
  aaMesh.onBeforeRender = () => { draws++ }
  for (let i = 0; i < 8; i++) aaResult = aaDraw(8)
  const smoothedAA = pixels(aaResult)
  const peak = Math.max(...rawAA.filter((_, i) => i % 4 === 0))
  const partial = data => data.reduce((sum, value, i) => sum + (i % 4 === 0 && value > 0 && value < peak - 1 ? 1 : 0), 0)
  check(aaResult.status.done && aaResult.status.samples === 8, 'Idle AA converges in a bounded eight samples')
  check(partial(smoothedAA) > partial(rawAA), 'Subpixel averaging creates real partial-coverage edge pixels')
  check(aaCamera.projectionMatrix.equals(beforeProjection) && aaCamera.projectionMatrixInverse.equals(beforeInverse), 'Jitter restores camera matrices exactly for picking and helpers')
  const completedDraws = draws; aaDraw(8)
  check(draws === completedDraws, 'Converged AA returns cached output without another scene draw')
  aaCamera.position.x += 0.1
  check(aaDraw(8).status.samples === 1, 'Camera motion resets AA history')
  check(aaDraw(8, 2).status.samples === 1, 'Scene revision resets AA history')
  check(aaDraw(8, 2, 80).status.samples === 1, 'Viewport resize resets AA history')
  const aaTargets = raster.accumulation.targets.slice(), aaReleased = new Set()
  aaTargets.forEach(target => target.addEventListener('dispose', () => aaReleased.add(target)))
  aaDraw(1)
  check(aaReleased.size === 2 && !raster.accumulation.targets.length, 'Disabling AA releases both history buffers')
  aaGeometry.dispose(); aaMesh.material.dispose()

  // Z-up studio: verify real reflected pixels, cache lifetime and both projections.
  const studio = new THREE.Scene(), studioCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  const subject = new THREE.Mesh(new THREE.BoxBufferGeometry(2, 1, 1), new THREE.MeshStandardMaterial({ color: 0xe43c18, roughness: 0.25 }))
  subject.position.z = 0.7; subject.castShadow = true; studio.add(subject)
  const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-2, -2, 6); sun.castShadow = true
  sun.shadow.camera.left = sun.shadow.camera.bottom = -5; sun.shadow.camera.right = sun.shadow.camera.top = 5
  sun.shadow.camera.near = 0.1; sun.shadow.camera.far = 30; sun.shadow.mapSize.set(256, 256)
  studio.add(sun, new THREE.AmbientLight(0xffffff, 0.3))
  studioCamera.up.set(0, 0, 1); studioCamera.position.set(4, -6, 2.6); studioCamera.lookAt(0, 0, 0.4)
  const bounds = new THREE.Box3(new THREE.Vector3(-1, -0.5, 0), new THREE.Vector3(1, 0.5, 1.2))
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap
  const studioOptions = { scenes: [studio], camera: studioCamera, bounds, width: 192, height: 192, background: 0x15181d,
    effects: { ground: true, groundAutoHeight: true, groundSize: 5, groundRoughness: 0.1, groundReflection: 1, reflectionResolution: 128, exposure: 1, ao: 0.6, aoRadius: 0.04 }, quality: { revision: 'studio', rasterSamples: 4 } }
  const studioDraw = patch => raster.render({ ...studioOptions, ...patch })
  let shadowUpdates = 0
  const updateShadow = sun.shadow.updateMatrices.bind(sun.shadow)
  sun.shadow.updateMatrices = (...args) => { shadowUpdates++; return updateShadow(...args) }
  const captureCount = raster.studioFloor.captures
  let reflected
  for (let i = 0; i < 4; i++) reflected = studioDraw()
  const reflectionPixels = pixels(reflected)
  check(shadowUpdates === 1, 'Progressive AA and mirror capture share one shadow-map update')
  check(raster.studioFloor.captures === captureCount + 1, 'One mirror capture shared by all progressive AA samples')
  check(raster.fxaaPass.enabled, 'Final FXAA remains enabled alongside progressive AA')
  check(webgl1 ? raster.studioFloor.targets[0].width > raster.studioFloor.resolution : raster.studioFloor.samples > 1, 'Reflections use MSAA or supersampling rather than one unfiltered sample')
  const filterTarget = new THREE.WebGLRenderTarget(128, 128)
  const originalTarget = renderer.getRenderTarget()
  const readLevel = index => {
    raster.copyPass.render(renderer, filterTarget, raster.studioFloor.targets[index])
    return pixels({ target: filterTarget, width: 128, height: 128 })
  }
  const nearPixels = readLevel(3), farPixels = readLevel(4)
  renderer.setRenderTarget(originalTarget); filterTarget.dispose()
  const variation = data => { let sum = 0; for (let y = 1; y < 128; y++) for (let x = 1; x < 128; x++) {
    const i = (y * 128 + x) * 4
    for (let c = 0; c < 3; c++) sum += Math.abs(data[i + c] - data[i - 4 + c]) + Math.abs(data[i + c] - data[i - 512 + c])
  } return sum }
  check(variation(farPixels) < variation(nearPixels), 'Far reflection level has lower edge contrast than near reflection')
  let noDistance
  for (let i = 0; i < 4; i++) noDistance = studioDraw({ effects: { ...studioOptions.effects, groundDistanceBlur: 0 } })
  check(differs(pixels(noDistance), reflectionPixels), 'Distance blur changes ground pixels with unchanged geometry and camera')
  check(!studio.children.includes(raster.studioFloor.mesh) && !raster.scene.children.includes(raster.studioFloor.mesh), 'Render floor never becomes document or picking geometry')
  let withoutResult
  for (let i = 0; i < 4; i++) withoutResult = studioDraw({ effects: { ...studioOptions.effects, groundReflection: 0 } })
  const withoutReflection = pixels(withoutResult)
  check(differs(reflectionPixels, withoutReflection), 'Floor reflection changes actual shaded pixels')
  check(!raster.studioFloor.targets, 'Disabling reflection immediately releases all reflection targets')
  studioDraw(); const captured = raster.studioFloor.captures
  studioCamera.position.x += 1; studioCamera.lookAt(0, 0, 0.4); studioDraw()
  check(raster.studioFloor.captures === captured + 1, 'Camera motion invalidates reflection')
  const studioOrtho = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100)
  studioOrtho.position.copy(studioCamera.position); studioOrtho.quaternion.copy(studioCamera.quaternion)
  check(sum(pixels(studioDraw({ camera: studioOrtho }))) > 0, 'Orthographic floor reflections compile and draw')
  const studioState = state(), clipsBefore = renderer.clippingPlanes
  subject.onBeforeRender = () => { throw new Error('mirror failure') }
  let mirrorFailed = false
  try { studioDraw({ quality: { revision: 'failed' } }) } catch (error) { mirrorFailed = error.message === 'mirror failure' }
  subject.onBeforeRender = () => {}
  check(mirrorFailed && state() === studioState && renderer.clippingPlanes === clipsBefore && subject.visible, 'Reflection exceptions preserve renderer clipping and source visibility')
  const reflectionTargets = raster.studioFloor.targets.slice(), releasedFloor = new Set()
  reflectionTargets.forEach(target => target.addEventListener('dispose', () => releasedFloor.add(target)))
  studioDraw({ effects: { ground: false } })
  check(releasedFloor.size === 5, 'Turning off studio floor releases every GPU reflection buffer')
  // Capture a deterministic fixture for visual review after the correctness checks.
  renderer.setPixelRatio(1); renderer.setSize(640, 480)
  studioCamera.aspect = 640 / 480; studioCamera.updateProjectionMatrix()
  let reviewImage
  for (let i = 0; i < 4; i++) reviewImage = studioDraw({ width: 640, height: 480 })
  raster.compositeToScreen(reviewImage)
  const studioImage = renderer.domElement.toDataURL('image/png')
  subject.geometry.dispose(); subject.material.dispose(); sun.shadow.map?.dispose()

  // CAD shells can be separated by fractions of a model unit at metre-scale
  // camera distances. A 16-bit mirror depth attachment lets rear faces win.
  const shellScene = new THREE.Scene(), shellCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 1e9)
  shellCamera.up.set(0, 0, 1); shellCamera.position.set(4000, -6000, 3000); shellCamera.lookAt(0, 0, 1000)
  const frontShell = new THREE.Mesh(new THREE.PlaneBufferGeometry(4000, 4000, 12, 12), new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide }))
  const rearShell = new THREE.Mesh(frontShell.geometry, new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide }))
  frontShell.position.z = 1000; rearShell.position.z = 1000.1; shellScene.add(frontShell, rearShell)
  const shellProbe = new THREE.WebGLRenderTarget(128, 128)
  const shellPixels = () => {
    studioDraw({ scenes: [shellScene], camera: shellCamera, bounds: new THREE.Box3(new THREE.Vector3(-2000, -2000, 0), new THREE.Vector3(2000, 2000, 1001)), quality: { rasterSamples: 1 }, effects: { ...studioOptions.effects, groundAutoHeight: false, groundHeight: 0, ao: 0, groundRoughness: 0, groundDistanceBlur: 0 } })
    raster.copyPass.render(renderer, shellProbe, raster.studioFloor.targets[1])
    return pixels({ target: shellProbe, width: 128, height: 128 })
  }
  const withRear = shellPixels(); rearShell.visible = false
  const frontOnly = shellPixels()
  let leakedShellPixels = 0, shellInteriorPixels = 0
  for (let y = 2; y < 126; y++) for (let x = 2; x < 126; x++) {
    const i = (y * 128 + x) * 4
    const inside = [-2, 0, 2].every(dy => [-2, 0, 2].every(dx => frontOnly[i + (dy * 128 + dx) * 4 + 1] > 250))
    if (inside) { shellInteriorPixels++; if (withRear[i] > 40) leakedShellPixels++ }
  }
  check(shellInteriorPixels > 100 && leakedShellPixels < shellInteriorPixels * 0.01, `Mirror depth preserves close CAD shells without rear triangles bleeding through (${leakedShellPixels}/${shellInteriorPixels})`)
  shellProbe.dispose(); frontShell.geometry.dispose(); frontShell.material.dispose(); rearShell.material.dispose()

  const mirrorGlassScene = new THREE.Scene()
  const mirrorBack = new THREE.Mesh(new THREE.BoxBufferGeometry(2, 1, 2), new THREE.MeshBasicMaterial({ color: '#ff2200' }))
  mirrorBack.position.set(0, 1, 1.2); mirrorGlassScene.add(mirrorBack)
  const mirrorPane = new THREE.Mesh(new THREE.PlaneBufferGeometry(5, 4), new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide }))
  mirrorPane.rotation.x = Math.PI / 2; mirrorPane.position.set(0, -1, 2)
  setSurfaceSettings(mirrorPane.material, { transmission: 1, roughness: 0, reflection: 0, ior: 1, thickness: 0 })
  mirrorGlassScene.add(mirrorPane)
  const mirrorProbe = new THREE.WebGLRenderTarget(128, 128)
  const captureGlassMirror = () => {
    studioDraw({ scenes: [mirrorGlassScene], quality: { rasterSamples: 1 }, effects: { ...studioOptions.effects, ao: 0, groundRoughness: 0, groundDistanceBlur: 0 } })
    raster.copyPass.render(renderer, mirrorProbe, raster.studioFloor.targets[1])
    return pixels({ target: mirrorProbe, width: 128, height: 128 })
  }
  const clearMirror = captureGlassMirror()
  setSurfaceSettings(mirrorPane.material, { roughness: 0.8 })
  const roughMirror = captureGlassMirror()
  check(differs(clearMirror, roughMirror), 'Floor mirror evaluates glass transmission and frosting from its own camera')
  mirrorProbe.dispose(); mirrorPane.geometry.dispose(); mirrorPane.material.dispose(); mirrorBack.geometry.dispose(); mirrorBack.material.dispose()

  const resources = [raster.aoPass.ssaoMaterial, raster.aoPass.noiseTexture, raster.bloomPass.materialCopy, raster.bloomPass.compositeMaterial, raster.outputTarget]
  const disposed = new Set()
  for (const resource of resources) resource.addEventListener('dispose', () => disposed.add(resource))
  let sourceDisposed = false
  box.geometry.addEventListener('dispose', () => { sourceDisposed = true })
  raster.dispose(); raster.dispose()
  check(disposed.size === resources.length, 'Explicitly disposes r120 SSAO/noise/bloom omissions and output target')
  check(!sourceDisposed && doc.parent === parent && box.parent === doc, 'Disposal preserves original scene ownership and geometry')
  check(!renderer.getContext().isContextLost(), 'Disposal does not destroy the shared renderer/context')
  const secondRaster = new RasterRenderer(renderer)
  const repeated = secondRaster.render(options)
  check(sum(pixels(repeated)) > 0, 'A new raster instance works after full disposal')
  secondRaster.dispose()
  const lostRenderer = Object.create(renderer)
  lostRenderer.getContext = () => ({ isContextLost: () => true })
  const unavailable = new RasterRenderer(lostRenderer)
  const unavailableOutput = unavailable.render(options)
  check(!unavailableOutput.status.supported && unavailableOutput.texture === null && unavailableOutput.target === null, 'Lost context returns unsupported status without allocation or GL queries')
  unavailable.dispose()
  const gl = renderer.getContext()
  check(gl.getError() === gl.NO_ERROR, 'No GL errors after shader, resize and disposal checks')
  depthTarget.dispose(); savedTarget.dispose()
  for (const mesh of [floor, box, depthMesh, red, blue, reflectionFloor, reflectionSubject]) { mesh.geometry.dispose(); mesh.material.dispose() }
  renderer.dispose()
  renderer.forceContextLoss()
  return { studioImage, glassImage, distanceImage, stackImage, checks, count: checks.length, webgl1, aoPixelDelta: sum(plain) - sum(ao), bloomPixelDelta: sum(bloom) - sum(plain), normalDepthByte: depthPixel[0], capabilities: raster.status.capabilities }
}
