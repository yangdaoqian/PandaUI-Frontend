const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const vm = require('node:vm')
const babel = require('@babel/core')
const THREE = require('three')

// Compile just the tested ESM modules; do not install a process-wide require
// hook or import another test's application bootstrap. Use real Three r120 data.
const cache = new Map()
function load (relative) {
  const filename = path.resolve(__dirname, '..', relative)
  if (cache.has(filename)) return cache.get(filename).exports
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const nativeRequire = loaded.require.bind(loaded)
  loaded.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(filename), name.endsWith('.js') ? name : name + '.js')) : nativeRequire(name)
  cache.set(filename, loaded)
  const source = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs']
  }).code
  loaded._compile(source, filename)
  return loaded.exports
}
const { createRenderSnapshot, renderCameraDescriptor } = load('src/render/RenderSceneAdapter.js')
const { normalizeRenderConfiguration, RenderConfigurationStore } = load('src/render/RenderConfiguration.js')
const tests = []
const test = (name, fn) => tests.push({ name, fn })
const config = extra => ({ kind: 'render.config', enabled: true, mode: 'pathtrace', ...extra })
const snapshot = (scene, settings = {}) => createRenderSnapshot([scene], config(settings))
const sceneWith = (...objects) => { const scene = new THREE.Scene(); scene.add(...objects); return scene }
function geometry (indexed = true) {
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    2, 0, 0, 3, 0, 0, 2, 1, 0,
    4, 0, 0, 5, 0, 0, 4, 1, 0
  ], 3))
  result.computeVertexNormals()
  if (indexed) result.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8])
  return result
}
const mesh = (geo = geometry(), material = new THREE.MeshStandardMaterial()) => new THREE.Mesh(geo, material)
function instanceMaterial (snapshot, index = 0) {
  const id = snapshot.instances[index].material
  assert(Number.isInteger(id) && id >= 0 && id < snapshot.materials.length, 'Instances reference the material table by numeric index')
  return snapshot.materials[id]
}
function near (actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, i) => assert(Math.abs(value - expected[i]) < tolerance, `component ${i}: ${value} != ${expected[i]}`))
}

test('empty scenes return an empty, serializable snapshot', async () => {
  const result = await createRenderSnapshot([null, new THREE.Scene()], config())
  assert.deepEqual(result.geometries, [])
  assert.deepEqual(result.instances, [])
  assert.deepEqual(result.lights, [])
  assert.deepEqual(result.materials, [])
  assert.deepEqual(result.textures, [])
  assert.deepEqual(result.bounds, { min: [0, 0, 0], max: [0, 0, 0] })
  assert.equal(result.environment, undefined)
  assert.equal(result.effects, undefined)
  assert.doesNotThrow(() => JSON.stringify(result))
})

test('ordinary mesh snapshots contain indexed triangles without mutating source geometry', async () => {
  const object = mesh()
  const position = object.geometry.attributes.position
  const source = Array.from(position.array)
  const result = await snapshot(sceneWith(object))
  assert.equal(result.geometries.length, 1)
  assert.equal(result.instances.length, 1)
  assert(result.geometries[0].positions instanceof Float32Array)
  assert(result.geometries[0].indices instanceof Uint32Array)
  assert.deepEqual(Array.from(result.geometries[0].indices), [0, 1, 2, 3, 4, 5, 6, 7, 8])
  result.geometries[0].positions[0] = 999
  assert.deepEqual(Array.from(position.array), source, 'snapshot buffers are owned copies')
})

test('instanced and regular meshes share geometry/material tables with distinct parent/world transforms', async () => {
  const geo = geometry()
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.7 })
  const instanced = new THREE.InstancedMesh(geo, material, 2)
  const locals = [new THREE.Matrix4().makeTranslation(2, 0, 0), new THREE.Matrix4().makeScale(-2, 3, 0.5)]
  locals.forEach((matrix, i) => instanced.setMatrixAt(i, matrix))
  instanced.position.set(0, 5, 0)
  const regular = mesh(geo, material)
  regular.position.set(-3, 1, 2)
  const parent = new THREE.Group()
  parent.position.set(10, 20, 30)
  parent.rotation.z = Math.PI / 3
  parent.scale.set(2, 1, 3)
  parent.add(instanced, regular)
  const scene = sceneWith(parent)
  const result = await snapshot(scene)
  assert.equal(result.geometries.length, 1)
  assert.equal(result.instances.length, 3)
  assert.equal(new Set(result.instances.map(item => item.geometryId)).size, 1)
  locals.forEach((local, i) => near(result.instances[i].matrix, new THREE.Matrix4().multiplyMatrices(instanced.matrixWorld, local).toArray()))
  near(result.instances[2].matrix, regular.matrixWorld.toArray())
  assert.equal(result.geometries[0].indices.length / 3, 3, 'triangle storage is shared, not expanded per instance')
  assert.equal(result.materials.length, 1)
  result.instances.forEach((instance, i) => {
    assert.equal(instance.geometryId, result.geometries[0].geometryId)
    assert.equal(instanceMaterial(result, i), result.materials[0])
  })
  const localBounds = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(5, 1, 0))
  const worldBounds = new THREE.Box3()
  result.instances.forEach(instance => worldBounds.union(localBounds.clone().applyMatrix4(new THREE.Matrix4().fromArray(instance.matrix))))
  near(result.bounds.min, worldBounds.min.toArray()); near(result.bounds.max, worldBounds.max.toArray())
  const repeated = await snapshot(scene)
  assert.equal(repeated.geometries[0].geometryId, result.geometries[0].geometryId)
  geo.attributes.position.needsUpdate = true
  const revised = await snapshot(scene)
  assert.notEqual(revised.geometries[0].geometryId, result.geometries[0].geometryId)
})

test('instance color uses the installed Three r120 attribute API and multiplies material color', async () => {
  const material = new THREE.MeshStandardMaterial()
  material.color.setRGB(0.5, 0.25, 1)
  const object = new THREE.InstancedMesh(geometry(), material, 2)
  object.setMatrixAt(0, new THREE.Matrix4())
  object.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 0, 0))
  object.setColorAt(0, new THREE.Color(0.2, 0.4, 0.6))
  object.setColorAt(1, new THREE.Color(0.8, 0.4, 0.2))
  const result = await snapshot(sceneWith(object))
  near(instanceMaterial(result, 0).color, [0.1, 0.1, 0.6])
  near(instanceMaterial(result, 1).color, [0.4, 0.1, 0.2])
  near(material.color.toArray(), [0.5, 0.25, 1])
})

test('hidden parents/helpers/render batches are skipped as subtrees and duplicated scene roots are visited once', async () => {
  const scene = new THREE.Scene()
  const visible = mesh()
  scene.add(visible)
  const flags = ['pandauiHidden', 'renderBatch', 'selectionHighlight', 'pandauiGumball', 'renderShadowGround', 'renderResourceRig', 'clippingHelper']
  for (const flag of flags) {
    const parent = new THREE.Group()
    parent.userData[flag] = true
    parent.add(mesh(), new THREE.Line(geometry(), new THREE.LineBasicMaterial()))
    scene.add(parent)
  }
  const hidden = new THREE.Group()
  hidden.visible = false; hidden.add(mesh()); scene.add(hidden)
  const result = await createRenderSnapshot([scene, scene], config())
  assert.equal(result.instances.length, 1)
  assert.equal(result.geometries.length, 1)
  assert.equal(visible.visible, true)
  assert.equal(hidden.visible, false)
})

test('material groups intersect drawRange, preserve separate material slots and share equal ranges', async () => {
  const geo = geometry()
  geo.addGroup(0, 6, 0); geo.addGroup(6, 3, 1)
  geo.setDrawRange(3, 6)
  const materials = [new THREE.MeshStandardMaterial({ color: 0xff0000 }), new THREE.MeshStandardMaterial({ color: 0x00ff00 })]
  const result = await snapshot(sceneWith(mesh(geo, materials), mesh(geo, materials)))
  assert.equal(result.geometries.length, 2)
  assert.equal(result.instances.length, 4)
  assert.deepEqual(Array.from(result.geometries[0].indices), [3, 4, 5])
  assert.deepEqual(Array.from(result.geometries[1].indices), [6, 7, 8])
  near(instanceMaterial(result, 0).color, [1, 0, 0])
  near(instanceMaterial(result, 1).color, [0, 1, 0])
  materials[1].visible = false
  assert.equal((await snapshot(sceneWith(mesh(geo, materials)))).instances.length, 1)
  geo.setDrawRange(0, 0)
  assert.equal((await snapshot(sceneWith(mesh(geo, materials)))).instances.length, 0)
})

test('nonindexed and interleaved attributes pack position and normals correctly', async () => {
  const geo = new THREE.BufferGeometry()
  const buffer = new THREE.InterleavedBuffer(new Float32Array([
    0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1
  ]), 6)
  geo.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0))
  geo.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3))
  const result = await snapshot(sceneWith(mesh(geo)))
  assert.deepEqual(Array.from(result.geometries[0].positions), [0, 0, 0, 1, 0, 0, 0, 1, 0])
  assert.deepEqual(Array.from(result.geometries[0].normals), [0, 0, 1, 0, 0, 1, 0, 0, 1])
  assert.deepEqual(Array.from(result.geometries[0].indices), [0, 1, 2])
})

test('unaligned triangle draw range rejects explicitly', async () => {
  const geo = geometry(); geo.setDrawRange(1, 3)
  await assert.rejects(snapshot(sceneWith(mesh(geo))), /triangle draw range/i)
})

for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'lightMap', 'transmissionMap', 'thicknessMap', 'specularIntensityMap', 'specularColorMap', 'sheenColorMap', 'sheenRoughnessMap']) {
  test(`${slot} snapshots a numeric texture reference and borrows pixel data`, async () => {
    const material = new THREE.MeshPhysicalMaterial()
    const pixels = new Uint8Array([128, 64, 255, 255])
    const texture = new THREE.DataTexture(pixels, 1, 1)
    texture.repeat.set(2, 3); texture.offset.set(0.1, 0.2)
    texture.wrapS = THREE.RepeatWrapping
    material[slot] = texture
    const result = await snapshot(sceneWith(mesh(geometry(), material), mesh(geometry(), material)))
    assert.equal(result.materials.length, 1); assert.equal(result.textures.length, 1)
    const id = instanceMaterial(result)[slot]
    assert.equal(id, 0)
    assert.equal(instanceMaterial(result, 1)[slot], id)
    assert.equal(result.textures[id].data, pixels)
    assert.equal(result.textures[id].image, texture.image)
    assert.equal(result.textures[id].width, 1); assert.equal(result.textures[id].height, 1)
    assert.equal(result.textures[id].wrapS, THREE.RepeatWrapping)
    near(result.textures[id].repeat, [2, 3]); near(result.textures[id].offset, [0.1, 0.2])
  })
}
for (const [label, properties] of [
  ['opacity', { opacity: 0.5, transparent: true }], ['transparent blend flag', { transparent: true }],
  ['alpha test', { alphaTest: 0.5 }], ['transmission', { transmission: 0.5 }]
]) {
  test(`${label} is accepted and retained in the material table`, async () => {
    const material = new THREE.MeshPhysicalMaterial(properties)
    const result = await snapshot(sceneWith(mesh(geometry(), material)))
    for (const [key, value] of Object.entries(properties)) assert.equal(instanceMaterial(result)[key], value)
  })
}

test('vertex colors and UV channels remain usable alongside numeric material references', async () => {
  const geo = geometry()
  const count = geo.attributes.position.count
  const colors = new Uint8Array(count * 3), uv = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) { colors.set([255, 128, 0], i * 3); uv.set([i / count, 0.5], i * 2) }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3, true))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setAttribute('uv2', new THREE.BufferAttribute(uv.slice(), 2))
  const result = await snapshot(sceneWith(mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true }))))
  assert.equal(instanceMaterial(result).vertexColors, true)
  near(result.geometries[0].colors.slice(0, 3), [1, 128 / 255, 0])
  near(result.geometries[0].uv, uv); near(result.geometries[0].uv2, uv)
  result.geometries[0].uv[0] = 100
  assert.equal(uv[0], 0, 'UV arrays are snapshot-owned copies')
})

test('standalone lines/points fall back while CAD edge overlays are excluded', async () => {
  for (const object of [new THREE.Line(geometry()), new THREE.Points(geometry())]) {
    await assert.rejects(snapshot(sceneWith(object)), /curves or points.*real-time/i)
  }
  for (const flag of ['surfaceWires', 'edgeLines', 'meshGeometryEdges', 'meshFaceEdges']) {
    const line = new THREE.Line(geometry()); line.userData[flag] = true
    assert.equal((await snapshot(sceneWith(line))).instances.length, 0)
  }
})
test('animated deformation still requests explicit fallback', async () => {
  const deformed = mesh(); deformed.morphTargetInfluences = [0.5]
  await assert.rejects(snapshot(sceneWith(deformed)), /deformation.*real-time/i)
})

test('HDRI, automotive environment and ground settings pass through for the new runtime', async () => {
  for (const preset of ['hdri', 'automotive', 'sky']) {
    const environment = { preset, url: 'blob:local-hdr', background: false, intensity: 1.7 }
    const effects = { ground: true, groundHeight: -2, groundRoughness: 0.2, shadows: false }
    const result = await snapshot(sceneWith(mesh()), { environment, effects })
    assert.deepEqual(result.environment, environment)
    assert.deepEqual(result.effects, effects)
    assert.equal(result.instances.length, 1)
  }
})

test('actual spot/area/ambient lights use the supplied rig and world transforms', async () => {
  const parent = new THREE.Group(); parent.position.set(10, 20, 30); parent.rotation.z = Math.PI / 2
  const rig = new THREE.Group(); rig.userData.renderResourceRig = true; parent.add(rig)
  const spot = new THREE.SpotLight(0xffffff, 2, 50, 0.4, 0.2, 2)
  spot.position.set(2, 3, 4); spot.target.position.set(0, 0, 0)
  spot.color.setRGB(0.1, 0.2, 0.3)
  const area = new THREE.RectAreaLight(0xffffff, 3, 5, 7)
  area.rotation.x = Math.PI / 3
  const ambient = new THREE.AmbientLight(0xffffff, 0.15)
  const hidden = new THREE.PointLight(); hidden.visible = false
  rig.add(spot, spot.target, area, ambient, hidden)
  const result = await createRenderSnapshot([sceneWith(mesh(), parent)], config({ lights: [{ type: 'point', intensity: 999 }] }), { lightScene: rig })
  assert.deepEqual(result.lights.map(light => light.type), ['spot', 'area', 'ambient'])
  const origin = spot.getWorldPosition(new THREE.Vector3()), target = spot.target.getWorldPosition(new THREE.Vector3())
  near(result.lights[0].position, origin.toArray()); near(result.lights[0].target, target.toArray())
  near(result.lights[0].direction, target.sub(origin).normalize().toArray())
  near(result.lights[0].color, [0.1, 0.2, 0.3])
  assert.equal(result.lights[0].angle, 0.4); assert.equal(result.lights[0].penumbra, 0.2)
  assert.equal(result.lights[0].distance, 50); assert.equal(result.lights[0].decay, 2)
  assert.equal(result.lights[1].width, 5); assert.equal(result.lights[1].height, 7)
  near(result.lights[1].quaternion, area.getWorldQuaternion(new THREE.Quaternion()).toArray())
  assert.equal(result.lights[2].intensity, 0.15)
  const empty = await createRenderSnapshot([], config({ lights: [{ type: 'sun' }] }), { lightScene: new THREE.Group() })
  assert.deepEqual(empty.lights, [], 'An explicitly empty rig must not resurrect configured lights')
})

test('sun/point lights preserve authored direction, positions and linearized colors', async () => {
  const result = await snapshot(new THREE.Scene(), { lights: [
    { type: 'sun', color: '#808080', intensity: 2, position: [0, 0, 10], target: [0, 0, 0] },
    { type: 'point', position: [1, 2, 3], intensity: 0 }
  ] })
  near(result.lights[0].direction, [0, 0, -1])
  near(result.lights[0].color, new THREE.Color('#808080').convertSRGBToLinear().toArray())
  assert.deepEqual(result.lights[1].position, [1, 2, 3])
  assert.equal(result.lights[1].intensity, 0)
})
test('aborted snapshots reject with AbortError', async () => {
  const controller = new AbortController(); controller.abort()
  await assert.rejects(createRenderSnapshot([new THREE.Scene()], config(), { signal: controller.signal }), { name: 'AbortError' })
})

test('orthographic camera preserves zoomed asymmetric bounds and parent transform', () => {
  const camera = new THREE.OrthographicCamera(-4, 8, 5, -3, 0.25, 1000)
  camera.zoom = 2; camera.position.set(1, 2, 3)
  const parent = new THREE.Group()
  parent.position.set(10, -5, 7); parent.rotation.z = Math.PI / 2
  parent.add(camera); parent.updateMatrixWorld(true)
  const result = renderCameraDescriptor(camera)
  assert.equal(result.type, 'orthographic')
  assert.deepEqual([result.left, result.right, result.bottom, result.top], [-1, 5, -1, 3])
  near(result.position, [8, -4, 10]); near(result.target, [8, -4, 9]); near(result.up, [-1, 0, 0])
  assert.equal(result.near, 0.25); assert.equal(result.far, 1000)
  assert.equal(result.fov, undefined)
})
test('perspective camera exports effective zoomed FOV and aspect', () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500)
  camera.zoom = 2
  const result = renderCameraDescriptor(camera)
  assert.equal(result.type, 'perspective')
  assert.equal(result.fov, camera.getEffectiveFOV())
  assert.equal(result.aspect, 16 / 9)
})

test('normal changes invalidate shared geometry snapshots', async () => {
  const object = mesh(), scene = sceneWith(object)
  const before = await snapshot(scene)
  object.geometry.attributes.normal.setXYZ(0, 0, 1, 0)
  object.geometry.attributes.normal.needsUpdate = true
  const after = await snapshot(scene)
  assert.notEqual(before.geometries[0].geometryId, after.geometries[0].geometryId)
})

test('clearcoat, sheen and Panda glass surface fields are accepted as plain descriptors', async () => {
  const material = new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.15, transmission: 0.8 })
  material.sheen = new THREE.Color(0.1, 0.2, 0.3)
  material.userData.pandaSurface = { materialType: 'glass', ior: 1.67, reflection: 0.8, refractionRoughness: 0.05, thickness: 2, refractionColor: '#aabbcc', attenuationDistance: 10 }
  const result = await snapshot(sceneWith(mesh(geometry(), material)), { environment: { background: false }, lights: [{ type: 'sun', castShadow: false }] })
  const descriptor = instanceMaterial(result)
  assert.equal(descriptor.clearcoat, 1); assert.equal(descriptor.clearcoatRoughness, 0.15)
  assert.equal(descriptor.transmission, 0.8); assert.equal(descriptor.sheen, 1)
  near(descriptor.sheenColor, [0.1, 0.2, 0.3])
  for (const field of ['materialType', 'ior', 'reflection', 'refractionRoughness', 'thickness', 'attenuationDistance']) {
    assert.equal(descriptor[field], material.userData.pandaSurface[field])
    assert.equal(descriptor.pandaSurface[field], material.userData.pandaSurface[field])
  }
  near(descriptor.refractionColor, new THREE.Color('#aabbcc').convertSRGBToLinear().toArray())
  near(descriptor.attenuationColor, descriptor.refractionColor)
  assert.equal(result.lights[0].castShadow, false)
  assert.equal(result.environment.background, false)
  assert.doesNotThrow(() => JSON.stringify(result.materials))
})

test('configuration defaults/clamps, orthographic settings and defensive ownership copies', () => {
  assert.equal(normalizeRenderConfiguration(null), null)
  const source = config({ camera: { position: [1, 2, 3], target: [0, 0, 0], projection: 'orthographic', orthographicHeight: 25 }, quality: { samples: 5.7, bounces: 999, resolutionScale: 999 }, effects: { exposure: -1 } })
  const result = normalizeRenderConfiguration(source)
  assert.equal(result.quality.samples, 6); assert.equal(result.quality.bounces, 16)
  assert.equal(result.quality.resolutionScale, 2); assert.equal(result.quality.interactionScale, 0.6)
  assert.equal(result.quality.denoise, true); assert.equal(result.quality.denoiseStrength, 0.5)
  const denoise = normalizeRenderConfiguration(config({ quality: { denoise: false, denoiseStrength: 99 } }))
  assert.equal(denoise.quality.denoise, false); assert.equal(denoise.quality.denoiseStrength, 1)
  assert.equal(result.camera.projection, 'orthographic'); assert.equal(result.camera.orthographicHeight, 25)
  assert(result.effects.exposure > 0)
  assert.equal(result.effects.fxaa, true)
  assert.equal(normalizeRenderConfiguration(config({ effects: { fxaa: false } })).effects.fxaa, false)
  source.camera.position[0] = 999
  assert.deepEqual(result.camera.position, [1, 2, 3])
})
test('last changed output owns rendering; unchanged outputs cannot steal; removal restores previous', () => {
  const store = new RenderConfigurationStore()
  const a = config({ quality: { samples: 10 } }); const b = config({ quality: { samples: 20 } })
  assert.equal(store.set('A', a), true); assert.equal(store.set('B', b), true)
  assert.equal(store.active[0], 'B')
  assert.equal(store.set('A', JSON.parse(JSON.stringify(a))), false)
  assert.equal(store.active[0], 'B')
  assert.equal(store.set('A', config({ quality: { samples: 11 } })), true)
  assert.equal(store.active[0], 'A')
  assert.equal(store.set('A', null), true); assert.equal(store.active[0], 'B')
  store.set('B', config({ enabled: false })); assert.equal(store.active, null)
  store.set(42, a); assert.equal(store.active[0], '42')
  store.clear(); assert.equal(store.active, null); assert.equal(store.entries.size, 0)
})
test('removing/disable of an already absent output is deduplicated', () => {
  const store = new RenderConfigurationStore()
  assert.equal(store.set('missing', null), false)
  assert.equal(store.set('missing', config({ enabled: false })), false)
})
test('equivalent reordered nested configs do not steal output ownership', () => {
  const store = new RenderConfigurationStore()
  store.set('A', config({ environment: { preset: 'sky', intensity: 2, background: true } }))
  store.set('B', config())
  assert.equal(store.set('A', config({ environment: { background: true, intensity: 2, preset: 'sky' } })), false)
  assert.equal(store.active[0], 'B')
})
test('invalid mode/vector/kind and cyclic input leave prior configuration untouched', () => {
  const store = new RenderConfigurationStore(); store.set('good', config())
  const previous = JSON.stringify(store.active)
  const cycle = config(); cycle.environment = cycle
  for (const invalid of [{ kind: 'render.material' }, config({ mode: 'unknown' }), config({ camera: { position: [1, 2] } }), config({ quality: { samples: 'bad' } }), cycle]) {
    assert.throws(() => store.set('bad', invalid))
    assert.equal(JSON.stringify(store.active), previous)
  }
})
for (const [label, descriptor] of [
  ['nonfinite samples', config({ quality: { samples: Infinity } })],
  ['NaN camera coordinate', config({ camera: { position: [NaN, 0, 1] } })],
  ['nonfinite light', config({ lights: [{ kind: 'render.light', id: 'L', type: 'point', intensity: Infinity }] })],
  ['invalid environment container', config({ environment: 'sky' })],
  ['invalid lights container', config({ lights: 'not-a-list' })],
  ['invalid binding targets', config({ bindings: [{ kind: 'render.binding', targets: [{}], material: { color: '#ffffff' } }] })]
]) {
  test(`invalid configuration rejects ${label} atomically`, () => {
    const store = new RenderConfigurationStore(); store.set('good', config())
    assert.throws(() => store.set('bad', descriptor))
    assert.equal(store.active[0], 'good')
  })
}
test('missing output node IDs are rejected', () => {
  for (const id of [null, undefined, '']) assert.throws(() => new RenderConfigurationStore().set(id, config()))
})

test('real plugin texture descriptors normalize into all resource slots without changing source URLs', () => {
  const context = { console, AbortController, setTimeout, clearTimeout, addEventListener () {} }
  context.window = context; context.parent = context; context.globalThis = context
  vm.createContext(context)
  require('./editor-test-kernel')(context)
  for (const file of ['src/Kernel/Data/Path.js', 'src/Kernel/Data/DataTree.js', 'src/PandaUI/Runtime.js', 'shared/MaterialSchema.js', 'shared/SceneReferences.js', 'plugins/Render_Nodes.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/editor', file), 'utf8'), context, { filename: file })
  }
  const material = context.PandaUI.createNode('render/pbr_material')
  const texture = context.PandaUI.createNode('render/texture')
  const environment = context.PandaUI.createNode('render/environment')
  const pairs = { color: 'map', normal: 'normalMap', roughness: 'roughnessMap', metalness: 'metalnessMap', emissive: 'emissiveMap', opacity: 'alphaMap', ao: 'aoMap', clearcoat: 'clearcoatMap' }
  for (const role of Object.keys(pairs)) {
    texture.properties.url = 'data:image/png;base64,' + role
    texture.properties.role = role
    texture.onExecute()
    const slot = material.findInputSlot(role[0].toUpperCase() + role.slice(1) + ' texture')
    material.inputs[slot].data = texture.getOutputData(0)
  }
  material.onExecute(); environment.onExecute()
  const emitted = material.getOutputData(0)
  const resources = load('src/render/RenderResourceMaterials.js')
  const slots = resources.resourceTextureSlots(emitted.textures)
  for (const [role, slot] of Object.entries(pairs)) {
    assert(resources.resourceTextureRoles.includes(slot), slot)
    assert.equal(slots[slot].kind, 'render.texture')
    assert.equal(resources.resourceTextureSource(slots[slot]), 'data:image/png;base64,' + role)
  }
  assert.equal(typeof environment.getOutputData(0).url, 'string')
  assert.equal(resources.resourceTextureSlots({ color: 'canonical', map: 'explicit' }).map, 'explicit')
})

;(async () => {
  let failed = 0
  for (const { name, fn } of tests) {
    try { await fn(); console.log('PASS ' + name) } catch (error) {
      failed++
      console.error('FAIL ' + name + '\n  ' + error.name + ': ' + error.message.replace(/\n/g, '\n  '))
    }
  }
  console.log(`Render scene adapter/configuration: ${tests.length - failed}/${tests.length} passed; ${failed} failed.`)
  if (failed) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
