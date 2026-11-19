const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core'), THREE = require('three')
const loader = require.extensions['.js']
require.extensions['.js'] = (module, filename) => {
  if (filename.endsWith(path.join('three', 'build', 'three.module.js'))) module.exports = THREE
  else if (filename.startsWith(path.resolve('src/render') + path.sep) || filename.includes(path.join('three', 'examples', 'jsm'))) module._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, filename)
  else loader(module, filename)
}
const Editor = require('../src/render/ImportedMaterialEditor').default
const Resources = require('../src/render/RenderResources').default
const { setSurfaceSettings, applySceneReflection } = require('../src/render/MaterialSurface')
const { materialIdentity } = require('../src/render/MaterialIdentity')

async function main () {
  const material = new THREE.MeshPhysicalMaterial({ color: 0x889999, roughness: 0.3, metalness: 0.4 })
  material.name = 'Imported copper'; material.userData.rhinoMaterialId = 'source-material'
  material.userData.pandauiPhysicalBase = { roughness: 0.3, metalness: 0.4 }
  const docs = ['A', 'B'].map(id => ({ documentId: id, name: id, three: { middleground: new THREE.Scene() }, disposableResources: [], invalidateRenderObject () {} }))
  function mesh (doc, locked = false) {
    const mesh = new THREE.Mesh(new THREE.BoxBufferGeometry(), material)
    mesh.userData.displayMaterials = { shading: new THREE.MeshPhongMaterial(), render: material }
    mesh.userData.readOnly = locked; doc.three.middleground.add(mesh); return mesh
  }
  const a = mesh(docs[0]), b = mesh(docs[0]), locked = mesh(docs[0], true), other = mesh(docs[1])
  const resources = new Resources({ renderer: { capabilities: { maxTextureSize: 4096 } } })
  await resources.apply({ lights: [{ type: 'sun', castShadow: true }] }, { scenes: docs.map(d => d.three.middleground) })
  let frames = 0
  const editor = new Editor({ documents: () => docs, source: m => resources.sourceMaterial(m), edit: fn => resources.editSourceMaterials(fn), invalidate: () => frames++ })
  const list = editor.catalog()
  assert.equal(list.length, 2, 'Identical source IDs in different documents stay distinct')
  const entry = list.find(row => row.document === 'A')
  assert.equal(entry.count, 2)
  assert.deepEqual(editor.selection(a), [entry.key])
  assert.deepEqual(editor.selection(locked), [])
  let previews = 0
  editor.previewRenderer = { render () { previews++; return 'data:image/png;base64,test' }, dispose () {} }
  const scan = editor.entries
  editor.entries = () => { throw new Error('Preview must not rescan the scene') }
  editor.preview(entry.key); editor.preview(entry.key)
  assert.equal(previews, 1, 'Repeated selection reuses its cached sphere')
  editor.entries = scan
  await editor.update(entry.key, { color: '#ff0000', roughness: 0.8, metalness: 0.1, opacity: 0.4 })
  assert.equal(a.material.color.getHex(), 0xff0000, 'Render override is refreshed immediately')
  assert.equal(b.material.color.getHex(), 0xff0000)
  assert.equal(a.material.roughness, 0.8); assert.equal(a.material.opacity, 0.4)
  assert(a.material.transparent); assert(!a.material.depthWrite)
  assert.notEqual(locked.material.color.getHex(), 0xff0000)
  assert.notEqual(other.material.color.getHex(), 0xff0000)
  assert.equal(material.roughness, 0.3, 'Original material shared with locked objects is untouched')
  const source = resources.sourceMaterial(a)
  assert.equal(source.userData.pandauiPhysicalBase.roughness, 0.8)
  await editor.update(entry.key, { materialType: 'glass', transmission: 1, opacity: 1, ior: 1.8, reflection: 0.7, thickness: 2, refractionColor: '#bbddff', refractionRoughness: 0.15, bumpScale: 0.4, normalScale: 0.6 })
  assert.equal(resources.sourceMaterial(a).transmission, 1)
  assert.equal(a.material.transmission, 1, 'Render override retains transmission')
  assert.equal(a.material.opacity, 1, 'Glass does not fake transmission using opacity')
  assert.equal(a.material.userData.pandaSurface.ior, 1.8)
  assert.equal(a.material.bumpScale, 0.4)
  assert.equal(a.material.normalScale.x, 0.6)
  assert.equal(editor.catalog().find(row => row.key === entry.key).settings.materialType, 'glass')
  const count = docs[0].disposableResources.length
  await editor.update(entry.key, { color: '#00ff00', opacity: 1 })
  assert.equal(docs[0].disposableResources.length, count, 'Continuous edits reuse owned material clones')
  assert.equal(editor.catalog().find(row => row.document === 'A').key, entry.key)
  await assert.rejects(editor.update(entry.key, { roughness: NaN }))
  assert.equal(resources.sourceMaterial(a).color.getHex(), 0x00ff00)
  assert.equal(frames, 3)
  resources.dispose()
  assert.equal(a.userData.displayMaterials.render.color.getHex(), 0x00ff00, 'Disabling Render Output preserves edited source')
  docs[0].disposed = true
  await assert.rejects(editor.update(entry.key, { opacity: 0 }))
  editor.dispose()
  for (const object of [a, b, locked, other]) { object.geometry.dispose(); object.userData.displayMaterials.shading.dispose() }
  for (const doc of docs) for (const owned of doc.disposableResources) owned.dispose()
  material.dispose()
  // Different archive IDs with equal render state become actual shared refs.
  const scene = new THREE.Scene(), owned = []
  const doc = { documentId: 'merge', three: { middleground: scene }, disposableResources: owned }
  const first = new THREE.MeshPhysicalMaterial({ roughness: 0.25, metalness: 0.8 })
  first.name = 'Metal'; first.userData.rhinoMaterialId = 'one'
  const equal = first.clone(); equal.userData.rhinoMaterialId = 'two'
  const variant = first.clone(); variant.userData.rhinoMaterialId = 'three'; variant.roughness = 0.9
  const precise = first.clone(); precise.userData.rhinoMaterialId = 'precise'; precise.color.r -= 0.00001
  const mapped = first.clone(); mapped.map = new THREE.Texture(); mapped.userData.rhinoMaterialId = 'map'
  const differentUV = mapped.clone(); differentUV.map = mapped.map.clone(); differentUV.map.repeat.x = 2; differentUV.userData.rhinoMaterialId = 'uv'
  const materials = [first, equal, variant, precise, mapped, differentUV]
  const meshes = materials.map(mat => { const mesh = new THREE.Mesh(new THREE.BoxBufferGeometry(), mat); scene.add(mesh); return mesh })
  const multi = new THREE.Mesh(new THREE.BoxBufferGeometry(), [equal, variant]); scene.add(multi)
  const isolated = new Editor({ documents: () => [doc], source: m => m.material, edit: action => action(), invalidate () {} })
  const merged = isolated.catalog()
  assert.equal(merged.length, 5, 'Only equal full-precision state merges, not same names or different textures/UVs')
  assert.equal(meshes[0].material, meshes[1].material)
  assert.equal(multi.material[0], meshes[0].material)
  assert.equal(multi.material[1], variant)
  const group = merged.find(row => row.count === 3)
  await isolated.update(group.key, { roughness: 0.6 })
  assert.equal(meshes[0].material, meshes[1].material)
  assert.equal(multi.material[0], meshes[0].material)
  assert.equal(multi.material[1].roughness, 0.9)
  assert.equal(isolated.catalog().find(row => row.count === 3).key, group.key)
  assert.equal(owned.length, 1, 'One editable material for all references')
  const copiedKey = isolated.copy(group.key)
  assert.equal(isolated.catalog().find(row => row.key === copiedKey).count, 0, 'Unused copies stay in the library')
  isolated.previewRenderer = { render: () => 'preview', dispose () {} }
  assert.equal(isolated.preview(copiedKey), 'preview')
  isolated.rename(copiedKey, 'Independent metal')
  await isolated.update(copiedKey, { roughness: 0.2 })
  assert.equal(meshes[0].material.roughness, 0.6, 'Editing copy never changes original')
  doc.replaceImportedDisplayMaterial = () => { throw new Error('Applying must not replace all document references') }
  assert.equal(isolated.applyToSelection(copiedKey, meshes[0]), 1)
  assert.equal(meshes[0].material.roughness, 0.2)
  assert.equal(meshes[1].material.roughness, 0.6, 'Unselected shared references retain original material')
  meshes[1].userData.readOnly = true
  assert.throws(() => isolated.applyToSelection(copiedKey, meshes[1]), /editable objects/)
  delete meshes[1].userData.readOnly
  delete doc.replaceImportedDisplayMaterial
  const mappedEntry = isolated.catalog().find(row => isolated.entries().get(row.key).material === mapped)
  const textureKey = isolated.copy(mappedEntry.key)
  const textureCopy = isolated.entries().get(textureKey).material
  assert.notEqual(textureCopy.map, mapped.map, 'Copied material owns independent texture state')
  assert.equal(textureCopy.map.image, mapped.map.image, 'Immutable texture image is reused')
  textureCopy.map.repeat.x = 3
  assert.equal(mapped.map.repeat.x, 1)
  const standard = new THREE.MeshStandardMaterial()
  const standardMesh = new THREE.Mesh(new THREE.BoxBufferGeometry(), standard); scene.add(standardMesh)
  const standardKey = isolated.catalog().find(row => isolated.entries().get(row.key).material === standard).key
  const physicalKey = isolated.copy(standardKey)
  await isolated.update(physicalKey, { materialType: 'glass', transmission: 1 })
  assert(isolated.entries().get(physicalKey).material.isMeshPhysicalMaterial)
  standardMesh.geometry.dispose(); standard.dispose()
  isolated.dispose(); [...meshes, multi].forEach(mesh => mesh.geometry.dispose())
  ;[...materials, ...owned].forEach(mat => mat.dispose()); mapped.map.dispose(); differentUV.map.dispose()
  // Saved glass materials regain per-instance shader closures when reopened.
  // They still share appearance, even with distinct source IDs / edit history.
  const glass = new THREE.MeshPhysicalMaterial(), duplicate = new THREE.MeshPhysicalMaterial()
  for (const mat of [glass, duplicate]) setSurfaceSettings(mat, { materialType: 'glass', roughness: 0.05, transmission: 1, refractionRoughness: 0.05, thickness: 1 })
  glass.name = 'Glass'; duplicate.name = 'Glass copy'
  glass.userData.pandauiMaterialId = 'glass-a'; duplicate.userData.pandauiMaterialId = 'glass-b'
  duplicate.userData.pandaSceneMaterialEdited = true; duplicate.userData.pandaSceneMaterialSourceId = 'previous-edit'
  assert.notEqual(materialIdentity(glass), materialIdentity(duplicate), 'Equal parameters with different names remain distinct')
  duplicate.name = glass.name
  assert.equal(materialIdentity(glass), materialIdentity(duplicate), 'Known surface shaders compare appearance, not closure or source identity')
  applySceneReflection(glass); applySceneReflection(duplicate)
  assert.equal(materialIdentity(glass), materialIdentity(duplicate), 'Known reflection extensions also deduplicate')
  const glassDoc = { documentId: 'glass', three: { middleground: new THREE.Scene() }, disposableResources: [] }
  const glassMeshes = [glass, duplicate].map(material => { const mesh = new THREE.Mesh(new THREE.BoxBufferGeometry(), material); glassDoc.three.middleground.add(mesh); return mesh })
  let invalidations = 0
  const glassEditor = new Editor({ documents: () => [glassDoc], source: mesh => mesh.material, edit: action => action(), invalidate: () => invalidations++ })
  const glassList = glassEditor.catalog()
  assert.equal(glassList.length, 1); assert.equal(glassList[0].count, 2)
  assert.equal(glassMeshes[0].material, glassMeshes[1].material, 'Duplicate source objects share a material instance')
  glassEditor.catalog(); glassEditor.catalog()
  assert.equal(invalidations, 1, 'Repeated catalog reads do not invalidate an already merged scene')
  const namedCopy = glass.clone(); namedCopy.name = 'Different glass name'
  const namedMesh = new THREE.Mesh(glassMeshes[0].geometry, namedCopy); glassDoc.three.middleground.add(namedMesh)
  assert.equal(glassEditor.catalog().length, 2, 'Catalog keeps different names separate despite identical parameters')
  assert.equal(namedMesh.material, namedCopy)
  await glassEditor.update(glassList[0].key, { roughness: 0.1 })
  assert(glassMeshes.every(mesh => mesh.material.roughness === 0.1))
  assert.equal(namedCopy.roughness, 0.05, 'Editing one name does not change another named material')
  glassDoc.three.middleground.remove(namedMesh); namedCopy.dispose()
  setSurfaceSettings(duplicate, { thickness: 2 })
  assert.notEqual(materialIdentity(glass), materialIdentity(duplicate), 'Different optical depth remains distinct')
  duplicate.onBeforeCompile = () => {}
  applySceneReflection(duplicate)
  assert.equal(materialIdentity(duplicate), duplicate.uuid, 'Unknown/replaced hooks are never merged')
  glassEditor.dispose(); glassMeshes.forEach(mesh => mesh.geometry.dispose())
  ;[glass, duplicate, ...glassDoc.disposableResources].forEach(material => material.dispose())
  console.log('PASS imported material catalog, cross-document identity, permission isolation, live render clones, invalid edits, resource reuse and mode restoration')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
