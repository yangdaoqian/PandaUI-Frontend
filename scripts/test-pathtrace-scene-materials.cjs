const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const babel = require('@babel/core')
const THREE = require('three')

// Use the application's real Three r120 and adapter, with no global require hook.
const modules = new Map()
function load (filename) {
  filename = path.resolve(__dirname, '..', filename)
  if (modules.has(filename)) return modules.get(filename).exports
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const nativeRequire = loaded.require.bind(loaded)
  loaded.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(filename), name.endsWith('.js') ? name : name + '.js')) : nativeRequire(name)
  modules.set(filename, loaded)
  loaded._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs']
  }).code, filename)
  return loaded.exports
}
const { createRenderSnapshot, renderCameraDescriptor } = load('src/render/RenderSceneAdapter.js')
const tests = []
const test = (name, run) => tests.push({ name, run })
const sceneWith = (...objects) => { const scene = new THREE.Scene(); scene.add(...objects); return scene }
const mesh = (geometry = triangle(), material = new THREE.MeshPhysicalMaterial()) => new THREE.Mesh(geometry, material)
const snapshot = (scene, config = {}, options) => createRenderSnapshot([scene], config, options)
function triangle () {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2))
  geometry.setIndex([0, 1, 2])
  return geometry
}
function near (actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, i) => assert(Math.abs(value - expected[i]) < tolerance, `${i}: ${value} != ${expected[i]}`))
}

test('glass and physical surface descriptors retain linear colors, maps and scalar parameters', async () => {
  const material = new THREE.MeshPhysicalMaterial({ roughness: 0.05, metalness: 0.1, transmission: 0.95, opacity: 0.65, transparent: true, clearcoat: 0.7, clearcoatRoughness: 0.12, alphaTest: 0.1, side: THREE.DoubleSide })
  material.color.setRGB(0.1, 0.2, 0.3)
  material.emissive.setRGB(0.02, 0.04, 0.08)
  material.emissiveIntensity = 2
  material.normalScale.set(2, 3)
  material.userData.pandaSurface = { materialType: 'glass', ior: 1.52, reflection: 0.8, refractionRoughness: 0.05, thickness: 2.4, refractionColor: '#808080', attenuationDistance: 50 }
  const image = { tagName: 'IMG', width: 16, height: 8 }
  const texture = new THREE.Texture(image)
  texture.encoding = THREE.sRGBEncoding
  texture.repeat.set(2, 3); texture.offset.set(0.2, 0.4); texture.rotation = 0.3
  texture.wrapS = THREE.RepeatWrapping
  material.map = texture; material.emissiveMap = texture
  const pixels = new Uint8Array([128, 128, 255, 255])
  material.normalMap = new THREE.DataTexture(pixels, 1, 1)
  const beforeMatrix = texture.matrix.toArray()
  const result = await snapshot(sceneWith(mesh(triangle(), material)), { environment: { preset: 'hdri', background: false }, effects: { ground: true, shadows: false } })
  assert.equal(result.materials.length, 1)
  const m = result.materials[result.instances[0].material]
  assert.equal(typeof result.instances[0].material, 'number')
  near(m.color, [0.1, 0.2, 0.3]); near(m.emissive, [0.02, 0.04, 0.08])
  for (const key of ['roughness', 'metalness', 'transmission', 'opacity', 'transparent', 'clearcoat', 'clearcoatRoughness', 'alphaTest', 'side', 'emissiveIntensity']) assert.equal(m[key], material[key])
  for (const key of ['materialType', 'ior', 'reflection', 'refractionRoughness', 'thickness', 'attenuationDistance']) assert.equal(m[key], material.userData.pandaSurface[key])
  near(m.refractionColor, new THREE.Color('#808080').convertSRGBToLinear().toArray())
  near(m.attenuationColor, m.refractionColor); near(m.normalScale, [2, 3])
  assert.deepEqual(m.pandaSurface.refractionColor, m.refractionColor)
  assert.equal(result.textures.length, 2)
  assert.equal(m.map, m.emissiveMap)
  assert.equal(result.textures[m.map].image, image, 'borrow DOM image identity, not a JSON clone')
  assert.equal(result.textures[m.normalMap].data, pixels, 'typed texture bytes must not be copied or detached')
  assert.equal(result.textures[m.normalMap].width, 1)
  assert.equal(result.textures[m.map].colorSpace, 'srgb')
  assert.deepEqual(result.textures[m.map].repeat, [2, 3])
  const expectedUV = new THREE.Matrix3()
  expectedUV.setUvTransform(0.2, 0.4, 2, 3, 0.3, 0, 0)
  near(result.textures[m.map].matrix, expectedUV.toArray())
  assert.deepEqual(texture.matrix.toArray(), beforeMatrix)
  assert.equal(material.userData.pandaSurface.refractionColor, '#808080')
  assert.doesNotThrow(() => JSON.stringify(result.materials))
})

test('all physical maps use numeric indices and preserve custom UV transforms', async () => {
  const material = new THREE.MeshPhysicalMaterial()
  const texture = new THREE.DataTexture(new Float32Array([1, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  texture.matrixAutoUpdate = false
  texture.matrix.set(2, 0, 0.3, 0, 4, 0.6, 0, 0, 1)
  const slots = ['map', 'alphaMap', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'lightMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'transmissionMap', 'thicknessMap', 'specularMap', 'specularColorMap', 'specularIntensityMap', 'sheenColorMap', 'sheenRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap', 'anisotropyMap']
  slots.forEach(slot => { material[slot] = texture })
  const result = await snapshot(sceneWith(mesh(triangle(), material)))
  slots.forEach(slot => assert.equal(result.materials[0][slot], 0, slot))
  assert.equal(result.textures.length, 1)
  near(result.textures[0].matrix, texture.matrix.toArray())
  assert.equal(result.textures[0].type, THREE.FloatType)
})

test('interleaved UV/UV2 and normalized RGBA are packed without mutation', async () => {
  const geometry = triangle()
  const buffer = new THREE.InterleavedBuffer(new Float32Array([
    0, 0, 0, 0, 0, 0.1, 0.2, 1, 0, 0, 1, 0, 0.3, 0.4, 0, 1, 0, 0, 1, 0.5, 0.6
  ]), 7)
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0))
  geometry.setAttribute('uv', new THREE.InterleavedBufferAttribute(buffer, 2, 3))
  geometry.setAttribute('uv2', new THREE.InterleavedBufferAttribute(buffer, 2, 5))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Uint8Array([255, 0, 128, 255, 0, 255, 0, 128, 0, 0, 255, 0]), 4, true))
  const result = await snapshot(sceneWith(mesh(geometry, new THREE.MeshPhysicalMaterial({ vertexColors: true }))))
  const packed = result.geometries[0]
  near(packed.positions, [0, 0, 0, 1, 0, 0, 0, 1, 0])
  near(packed.uv, [0, 0, 1, 0, 0, 1]); near(packed.uv2, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6])
  near(packed.colors, [1, 0, 128 / 255, 1, 0, 1, 0, 128 / 255, 0, 0, 1, 0])
  assert.equal(result.materials[0].vertexColors, true)
  packed.positions[0] = 42
  assert.equal(geometry.attributes.position.getX(0), 0)
})

test('shared geometry/material instances retain parent transforms, tint and bounds', async () => {
  const geometry = triangle(), material = new THREE.MeshPhysicalMaterial()
  material.color.setRGB(0.5, 0.25, 1)
  const instanced = new THREE.InstancedMesh(geometry, material, 3)
  const locals = [new THREE.Matrix4().makeTranslation(2, 0, 0), new THREE.Matrix4().makeScale(-2, 3, 0.5), new THREE.Matrix4().makeTranslation(4, 0, 1)]
  locals.forEach((matrix, i) => instanced.setMatrixAt(i, matrix))
  instanced.setColorAt(0, new THREE.Color(0.2, 0.4, 0.6))
  instanced.setColorAt(1, new THREE.Color(0.8, 0.4, 0.2))
  instanced.setColorAt(2, new THREE.Color(0.2, 0.4, 0.6))
  const parent = new THREE.Group(); parent.position.set(10, 20, 30); parent.scale.set(2, 3, 4); parent.rotation.z = Math.PI / 2
  parent.add(instanced, mesh(geometry, material), mesh(geometry, material))
  const sourceColors = Array.from(instanced.instanceColor.array)
  const result = await snapshot(sceneWith(parent))
  assert.equal(result.geometries.length, 1); assert.equal(result.instances.length, 5); assert.equal(result.materials.length, 3)
  locals.forEach((local, i) => near(result.instances[i].matrix, instanced.matrixWorld.clone().multiply(local).toArray()))
  near(result.materials[result.instances[0].material].color, [0.1, 0.1, 0.6])
  assert.equal(result.instances[0].material, result.instances[2].material)
  assert.equal(result.instances[3].material, result.instances[4].material)
  assert.deepEqual(Array.from(instanced.instanceColor.array), sourceColors)
  near(material.color.toArray(), [0.5, 0.25, 1])
  const expected = new THREE.Box3()
  for (const instance of result.instances) expected.union(new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 0)).applyMatrix4(new THREE.Matrix4().fromArray(instance.matrix)))
  near(result.bounds.min, expected.min.toArray()); near(result.bounds.max, expected.max.toArray())
})

test('indexed groups intersect drawRange, share geometry slices, and omit unused vertices from bounds', async () => {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0, 999, 999, 999], 3))
  geometry.setIndex([0, 1, 2, 3, 4, 5, 0, 2, 3])
  geometry.addGroup(0, 6, 0); geometry.addGroup(6, 3, 1); geometry.setDrawRange(3, 6)
  const materials = [new THREE.MeshPhysicalMaterial(), new THREE.MeshPhysicalMaterial({ metalness: 1 })]
  const result = await snapshot(sceneWith(mesh(geometry, materials), mesh(geometry, materials)))
  assert.equal(result.geometries.length, 2); assert.equal(result.instances.length, 4)
  assert.deepEqual(Array.from(result.geometries[0].indices), [3, 4, 5])
  assert.deepEqual(Array.from(result.geometries[1].indices), [0, 2, 3])
  assert.equal(result.geometries[0].positions, result.geometries[1].positions, 'share one packed attribute buffer across slices')
  assert.notEqual(result.instances[0].material, result.instances[1].material)
  near(result.bounds.min, [0, 0, 0]); near(result.bounds.max, [3, 1, 0])
  geometry.setDrawRange(1, 3)
  await assert.rejects(snapshot(sceneWith(mesh(geometry))), /triangle draw range/)
})

test('legacy Geometry converts privately and nonindexed triangles are indexed', async () => {
  const legacy = new THREE.Geometry()
  legacy.vertices.push(new THREE.Vector3(), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0))
  legacy.faces.push(new THREE.Face3(0, 1, 2))
  legacy.faceVertexUvs[0].push([new THREE.Vector2(), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)])
  legacy.computeFaceNormals()
  const before = JSON.stringify(legacy.toJSON())
  const result = await snapshot(sceneWith(mesh(legacy)))
  assert.deepEqual(Array.from(result.geometries[0].indices), [0, 1, 2])
  assert.deepEqual(Array.from(result.geometries[0].uv), [0, 0, 1, 0, 0, 1])
  assert.equal(legacy.__directGeometry, undefined)
  assert.equal(JSON.stringify(legacy.toJSON()), before)
})

test('actual light rig exports sun/spot targets, point, area and ambient in world space', async () => {
  const parent = new THREE.Group(); parent.position.set(4, 5, 6); parent.rotation.z = 0.4
  const rig = new THREE.Group(); rig.userData.renderResourceRig = true; parent.add(rig)
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  const point = new THREE.PointLight(0xffffff, 0, 25, 2)
  const spot = new THREE.SpotLight(0xffffff, 3, 30, 0.4, 0.3, 2)
  const area = new THREE.RectAreaLight(0xffffff, 5, 4, 2)
  const ambient = new THREE.AmbientLight(0xffffff, 0.1)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.2)
  const hidden = new THREE.PointLight(); hidden.visible = false
  sun.position.set(1, 2, 10); spot.position.set(-3, 2, 5); area.rotation.set(0.2, 0.3, 0.4)
  sun.target.position.set(2, 3, 1); spot.target.position.set(1, 3, 2)
  point.color.setRGB(0.1, 0.2, 0.3)
  rig.add(sun, sun.target, point, spot, spot.target, area, ambient, hemi, hidden)
  const result = await snapshot(sceneWith(parent, mesh()), { lights: [{ type: 'point', intensity: 100 }] }, { lightScene: rig })
  assert.equal(result.lights.length, 6)
  assert.equal(result.instances.length, 1)
  for (const light of [sun, spot]) {
    const item = result.lights.find(item => item.type === (light === sun ? 'sun' : 'spot'))
    const origin = light.getWorldPosition(new THREE.Vector3()), target = light.target.getWorldPosition(new THREE.Vector3())
    near(item.position, origin.toArray()); near(item.target, target.toArray()); near(item.direction, target.sub(origin).normalize().toArray())
    near(item.matrix, light.matrixWorld.toArray())
  }
  const p = result.lights.find(item => item.type === 'point')
  near(p.color, [0.1, 0.2, 0.3]); assert.equal(p.intensity, 0); assert.equal(p.decay, 2); assert.equal(p.distance, 25)
  const a = result.lights.find(item => item.type === 'area')
  assert.equal(a.width, 4); assert.equal(a.height, 2)
  near(a.quaternion, area.getWorldQuaternion(new THREE.Quaternion()).toArray())
  assert.equal(result.lights.find(item => item.type === 'spot').penumbra, 0.3)
  assert.equal((await snapshot(new THREE.Scene(), { lights: [{ type: 'point' }] }, { lightScene: new THREE.Group() })).lights.length, 0)
})

test('helper/hidden subtrees and duplicate roots are excluded; real curves still request fallback', async () => {
  const scene = sceneWith(mesh())
  for (const flag of ['renderBatch', 'selectionHighlight', 'pandauiGumball', 'renderShadowGround', 'renderResourceRig', 'clippingHelper', 'groupEditBounds', 'pandauiHidden']) {
    const group = new THREE.Group(); group.userData[flag] = true; group.add(mesh(), new THREE.Points(triangle())); scene.add(group)
  }
  scene.add(new THREE.GridHelper())
  const result = await createRenderSnapshot([scene, scene], {})
  assert.equal(result.instances.length, 1)
  for (const shape of [new THREE.Points(triangle()), new THREE.Line(triangle()), new THREE.Sprite()]) await assert.rejects(snapshot(sceneWith(shape)), /real-time/)
  const edge = new THREE.Line(triangle()); edge.userData.edgeLines = true
  assert.equal((await snapshot(sceneWith(edge))).instances.length, 0)
  await assert.rejects(snapshot(sceneWith(edge), { effects: { showEdges: true } }), /Visible CAD edges/)
  const curve = new THREE.Line(triangle())
  assert.equal((await snapshot(sceneWith(curve), { effects: { showCurves: false } })).instances.length, 0)
})

test('environment/effects pass through without HDR, automotive or ground rejection', async () => {
  for (const preset of ['hdri', 'automotive', 'studio']) {
    const config = { environment: { preset, url: 'test.hdr', background: false }, effects: { ground: true, shadows: false } }
    const result = await snapshot(new THREE.Scene(), config)
    assert.equal(result.environment, config.environment); assert.equal(result.effects, config.effects)
    assert.deepEqual(result.bounds, { min: [0, 0, 0], max: [0, 0, 0] })
  }
})

test('cancellation before traversal and during a large single mesh rejects AbortError', async () => {
  const already = new AbortController(); already.abort()
  await assert.rejects(createRenderSnapshot([], {}, { signal: already.signal }), { name: 'AbortError' })
  const controller = new AbortController()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(900000), 3))
  let delivered = false
  const timer = setTimeout(() => { delivered = true; controller.abort() }, 0)
  try { await assert.rejects(snapshot(sceneWith(mesh(geometry)), {}, { signal: controller.signal }), { name: 'AbortError' }) } finally { clearTimeout(timer) }
  assert(delivered, 'snapshot must yield to the event loop while packing a large object')
})

test('camera descriptor preserves zoomed orthographic and perspective contracts', () => {
  const camera = new THREE.OrthographicCamera(-4, 8, 5, -3, 0.25, 1000)
  camera.zoom = 2; camera.position.set(1, 2, 3)
  const parent = new THREE.Group(); parent.position.set(10, -5, 7); parent.rotation.z = Math.PI / 2
  parent.add(camera); parent.updateMatrixWorld(true)
  const result = renderCameraDescriptor(camera)
  assert.deepEqual([result.left, result.right, result.bottom, result.top], [-1, 5, -1, 3])
  near(result.position, [8, -4, 10]); near(result.up, [-1, 0, 0])
  const perspective = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500); perspective.zoom = 2
  assert.equal(renderCameraDescriptor(perspective).fov, perspective.getEffectiveFOV())
})

;(async () => {
  for (const { name, run } of tests) { await run(); console.log('PASS', name) }
  console.log(`Passed ${tests.length} scene/material adapter tests (Three r${THREE.REVISION}).`)
})().catch(error => { console.error(error); process.exitCode = 1 })
