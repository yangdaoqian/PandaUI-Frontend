import * as THREE from 'three'
import { applyMaterialSurface } from './MaterialSurface'
import { resourceMeshes } from './RenderResourceMaterials'
import { resolveSceneReference } from './SceneObjectReference'

const idOf = object => String(object.userData?.pandauiObjectId || object.userData?.sharedObject?.objectId || object.userData?.objectId || object.uuid)
const inverse = matrix => new THREE.Matrix4().getInverse(matrix)
const modes = ['existing', 'xy', 'xz', 'yz', 'box', 'cylindrical', 'spherical', 'copy']
function topology (geometry) {
  let hash = 2166136261
  for (const index of geometry.index?.array || []) hash = Math.imul(hash ^ index, 16777619)
  return [geometry.attributes.position.count, geometry.index?.count || 0, hash >>> 0].join(':')
}

export default class ObjectUVEditor {
  constructor (services) { this.services = services; this.states = new WeakMap() }

  documentFor (object) {
    const docs = this.services.documents()
    for (let part = object; part; part = part.parent) {
      const doc = docs.find(doc => !doc.disposed && doc.three?.middleground === part)
      if (doc) return doc
    }
    return null
  }

  reference (object) {
    const doc = this.documentFor(object)
    if (!doc || !object || object.isScene) throw new Error('Select a document object first.')
    return { documentId: String(doc.documentId), objectId: idOf(object), name: object.name || (doc.name || 'Object') + ' / ' + idOf(object).slice(0, 8) }
  }

  resolve (reference, editable = true) {
    const { doc, root } = resolveSceneReference(this.services.documents(), reference)
    if (!root || this.documentFor(root) !== doc) throw new Error('The UV object is no longer in the loaded document.')
    if (doc.localImportInProgress || doc.remeshStream) throw new Error('Wait for object loading / remeshing to finish.')
    const meshes = [...resourceMeshes([root])].filter(mesh => mesh.geometry?.attributes.position)
    if (!meshes.length) throw new Error('The selected object has no editable render mesh.')
    for (const mesh of meshes) {
      if (this.documentFor(mesh) !== doc) throw new Error('Choose objects from one document.')
      for (let part = mesh; part; part = part.parent) if (part.userData?.nodePreview || (editable && part.userData?.readOnly)) throw new Error('This object is not editable in this workspace.')
      if (mesh.isInstancedMesh) throw new Error('Convert this GPU instance collection to individual objects before editing UVs.')
    }
    root.updateWorldMatrix(true, true)
    return { doc, root, meshes }
  }

  state (mesh) {
    let state = this.states.get(mesh)
    if (!state || (mesh.geometry !== state.base && mesh.geometry !== state.generated)) {
      state = { base: mesh.geometry, generated: null, recipe: null, materials: new Set(), textures: new Map() }; this.states.set(mesh, state)
    }
    return state
  }

  recipe (target, settings = {}) {
    const mapping = settings.mapping || 'existing'
    if (!modes.includes(mapping) || mapping === 'copy') throw new Error('Unknown UV mapping mode.')
    const values = { mapping }
    for (const [key, fallback] of Object.entries({ scaleU: 1, scaleV: 1, repeatU: 1, repeatV: 1, offsetU: 0, offsetV: 0, rotation: 0 })) {
      const value = settings[key] ?? fallback
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid UV ' + key)
      values[key] = value
    }
    if (values.repeatU <= 0 || values.repeatV <= 0) throw new Error('UV repeat must be greater than zero.')
    if (!values.scaleU || !values.scaleV) throw new Error('UV scale cannot be zero.')
    const frame = target.root.matrixWorld.clone(), bounds = new THREE.Box3(), point = new THREE.Vector3()
    for (const mesh of target.meshes) {
      const positions = this.state(mesh).base.attributes.position, transform = inverse(frame).multiply(mesh.matrixWorld)
      for (let i = 0; i < positions.count; i++) bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(transform))
    }
    return { ...values, frame: frame.toArray(), min: bounds.min.toArray(), max: bounds.max.toArray() }
  }

  command ({ target, source, action = 'apply', settings, matchMode = 'mapping' }) {
    const resolved = this.resolve(target)
    const before = { target, items: resolved.meshes.map(mesh => ({ meshId: mesh.uuid, recipe: this.state(mesh).recipe })) }
    let recipes
    if (action === 'reset') recipes = resolved.meshes.map(() => null)
    else if (action === 'match') {
      const origin = this.resolve(source, false)
      if (matchMode === 'coordinates') {
        if (origin.meshes.length !== resolved.meshes.length) throw new Error('UV coordinate copying requires the same number of mesh parts.')
        recipes = resolved.meshes.map((mesh, i) => {
          const input = origin.meshes[i].geometry, uv = input.attributes.uv
          if (!uv || topology(input) !== topology(this.state(mesh).base)) throw new Error('UV coordinate copying requires matching vertex counts and triangle indices. Use mapping settings for different topology.')
          const coordinates = []
          for (let vertex = 0; vertex < uv.count; vertex++) coordinates.push(uv.getX(vertex), uv.getY(vertex))
          return { mapping: 'copy', coordinates, topology: topology(input), repeatU: this.state(origin.meshes[i]).recipe?.repeatU ?? 1, repeatV: this.state(origin.meshes[i]).recipe?.repeatV ?? 1 }
        })
      } else if (matchMode === 'mapping') {
        const recipe = this.state(origin.meshes[0]).recipe
        if (!recipe || recipe.mapping === 'copy') throw new Error('The source has no reusable projection. Apply a UV Edit mapping first, or copy UV coordinates for matching topology.')
        if (origin.meshes.some(mesh => JSON.stringify(this.state(mesh).recipe) !== JSON.stringify(recipe))) throw new Error('Source parts use different mappings. Select a single mapped part.')
        recipes = resolved.meshes.map(() => JSON.parse(JSON.stringify(recipe)))
      } else throw new Error('Unknown UV matching mode.')
    } else if (action === 'apply') { const recipe = this.recipe(resolved, settings); recipes = resolved.meshes.map(() => recipe) } else throw new Error('Unknown UV action.')
    const after = { target, items: resolved.meshes.map((mesh, i) => ({ meshId: mesh.uuid, recipe: recipes[i] })) }
    this.services.record(before, after, action === 'match' ? 'Match object UV' : action === 'reset' ? 'Reset object UV' : 'Edit object UV')
    return { count: resolved.meshes.length }
  }

  build (mesh, recipe) {
    const base = this.state(mesh).base
    if (!recipe) return base
    for (const key of ['repeatU', 'repeatV']) {
      if (recipe[key] != null && (typeof recipe[key] !== 'number' || !Number.isFinite(recipe[key]) || recipe[key] <= 0)) throw new Error('Invalid saved UV repeat.')
    }
    if (!modes.includes(recipe.mapping)) throw new Error('Invalid saved UV mapping.')
    let geometry
    try {
      const seams = ['box', 'cylindrical', 'spherical'].includes(recipe.mapping)
      geometry = seams && base.index ? base.toNonIndexed() : base.clone()
      const positions = geometry.attributes.position, uv = new Float32Array(positions.count * 2)
      if (recipe.mapping === 'copy') {
        if (recipe.topology !== topology(base) || recipe.coordinates?.length !== uv.length || !recipe.coordinates.every(Number.isFinite)) throw new Error('The mesh topology changed; UV coordinates cannot be restored.')
        uv.set(recipe.coordinates)
      } else {
        const original = geometry.attributes.uv
        if (recipe.mapping === 'existing' && !original) throw new Error('This object has no UVs. Choose a projection first.')
        const transform = inverse(new THREE.Matrix4().fromArray(recipe.frame)).multiply(mesh.matrixWorld)
        const min = new THREE.Vector3().fromArray(recipe.min), max = new THREE.Vector3().fromArray(recipe.max), size = max.clone().sub(min)
        const center = min.clone().add(max).multiplyScalar(0.5), point = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), normal = new THREE.Vector3()
        const angle = recipe.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(transform)
          let u, v
          let axes = recipe.mapping === 'xz' ? ['x', 'z'] : recipe.mapping === 'yz' ? ['y', 'z'] : ['x', 'y']
          if (recipe.mapping === 'box') {
            const start = i - i % 3
            a.fromBufferAttribute(positions, start).applyMatrix4(transform)
            b.fromBufferAttribute(positions, Math.min(start + 1, positions.count - 1)).applyMatrix4(transform).sub(a)
            normal.fromBufferAttribute(positions, Math.min(start + 2, positions.count - 1)).applyMatrix4(transform).sub(a).cross(b)
            const n = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)]
            axes = n[0] >= n[1] && n[0] >= n[2] ? ['y', 'z'] : n[1] >= n[2] ? ['x', 'z'] : ['x', 'y']
          }
          if (recipe.mapping === 'existing') { u = original.getX(i); v = original.getY(i) } else if (['cylindrical', 'spherical'].includes(recipe.mapping)) {
            const x = point.x - center.x, y = point.y - center.y, z = point.z - center.z
            u = Math.atan2(y, x) / (2 * Math.PI) + 0.5
            v = recipe.mapping === 'spherical' ? Math.asin(Math.max(-1, Math.min(1, z / (Math.hypot(x, y, z) || 1)))) / Math.PI + 0.5 : (point.z - min.z) / (size.z || 1)
          } else { u = (point[axes[0]] - min[axes[0]]) / (size[axes[0]] || 1); v = (point[axes[1]] - min[axes[1]]) / (size[axes[1]] || 1) }
          uv[i * 2] = u; uv[i * 2 + 1] = v
        }
        if (['cylindrical', 'spherical'].includes(recipe.mapping)) {
          for (let i = 0; i + 5 < uv.length; i += 6) {
            if (Math.max(uv[i], uv[i + 2], uv[i + 4]) - Math.min(uv[i], uv[i + 2], uv[i + 4]) > 0.5) for (let j = 0; j < 6; j += 2) if (uv[i + j] < 0.5) uv[i + j] += 1
          }
        }
        for (let i = 0; i < uv.length; i += 2) {
          const u = (uv[i] - 0.5) * recipe.scaleU, v = (uv[i + 1] - 0.5) * recipe.scaleV
          uv[i] = u * cos - v * sin + 0.5 + recipe.offsetU; uv[i + 1] = u * sin + v * cos + 0.5 + recipe.offsetV
        }
      }
      if (recipe.mapping !== 'copy') {
        for (let i = 0; i < uv.length; i += 2) { uv[i] *= recipe.repeatU ?? 1; uv[i + 1] *= recipe.repeatV ?? 1 }
      }
      if (!uv.every(Number.isFinite)) throw new Error('UV settings exceeded the finite coordinate range.')
      geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      geometry.deleteAttribute('tangent') // Normal mapping must use derivatives after reparameterization.
      return geometry
    } catch (error) { geometry?.dispose(); throw error }
  }

  // UVs are object-local; repeat wrapping must not mutate a shared material or
  // texture. Keep one private material/texture copy per edited mesh and reuse it.
  applyRepeat (mesh, recipe, doc) {
    const state = this.state(mesh)
    const repeat = { u: (recipe?.repeatU ?? 1) !== 1, v: (recipe?.repeatV ?? 1) !== 1 }
    const copies = new Map()
    const copy = source => {
      if (!source) return source
      if (copies.has(source)) return copies.get(source)
      if (!repeat.u && !repeat.v && !state.materials.has(source) && !source.userData.pandaUVRepeat) return source
      const material = state.materials.has(source) ? source : source.clone()
      if (material !== source) {
        material.userData.pandaSceneMaterialSourceId = material.uuid
        applyMaterialSurface(material)
        state.materials.add(material); doc.disposableResources.push(material)
      }
      material.userData.pandaUVRepeat = repeat
      for (const [slot, texture] of Object.entries(material)) {
        if (!texture?.isTexture || slot === 'envMap' || texture.mapping !== THREE.UVMapping) continue
        let entry = state.textures.get(texture)
        if (!entry) {
          const cloned = texture.clone(); cloned.needsUpdate = true
          entry = { texture: cloned, s: texture.wrapS, t: texture.wrapT }
          state.textures.set(texture, entry); state.textures.set(cloned, entry)
          doc.disposableResources.push(cloned)
        }
        material[slot] = entry.texture
        const s = repeat.u ? THREE.RepeatWrapping : entry.s, t = repeat.v ? THREE.RepeatWrapping : entry.t
        if (entry.texture.wrapS !== s || entry.texture.wrapT !== t) {
          entry.texture.wrapS = s; entry.texture.wrapT = t; entry.texture.needsUpdate = true
        }
      }
      material.needsUpdate = true; copies.set(source, material)
      return material
    }
    const replace = value => Array.isArray(value) ? value.map(copy) : copy(value)
    mesh.material = replace(mesh.material)
    if (mesh.userData.displayMaterials) mesh.userData.displayMaterials = Object.fromEntries(Object.entries(mesh.userData.displayMaterials).map(([key, value]) => [key, replace(value)]))
  }

  applyState (snapshot) {
    return this.services.edit ? this.services.edit(() => this.applySnapshot(snapshot)) : this.applySnapshot(snapshot)
  }

  applySnapshot (snapshot) {
    const target = this.resolve(snapshot.target), staged = []
    try {
      for (const item of snapshot.items) {
        const mesh = target.meshes.find(mesh => mesh.uuid === item.meshId)
        if (!mesh) throw new Error('The UV mesh was replaced; undo / redo cannot target it.')
        staged.push({ mesh, recipe: item.recipe, geometry: this.build(mesh, item.recipe), state: this.state(mesh) })
      }
    } catch (error) { staged.forEach(item => { if (item.geometry !== item.state.base) item.geometry.dispose() }); throw error }
    for (const item of staged) {
      const { mesh, geometry, recipe, state } = item, previous = state.generated
      target.doc.materializeRenderObject?.(mesh)
      this.applyRepeat(mesh, recipe, target.doc)
      mesh.geometry = geometry; state.generated = recipe ? geometry : null; state.recipe = recipe
      target.doc.disposableResources.push(geometry)
      target.doc.disposableResources.track?.(mesh)
      const materials = [mesh.material, mesh.userData.displayMaterials?.render].flat().filter(Boolean)
      materials.forEach(material => { material.needsUpdate = true })
      target.doc.invalidateRenderObject?.(mesh)
      if (previous && previous !== geometry) {
        if (target.doc.disposableResources.releaseGeometry) target.doc.disposableResources.releaseGeometry(previous)
        else { target.doc.disposableResources.delete?.(previous); previous.dispose() }
      }
    }
    this.services.invalidate()
    return staged.length
  }

  dispose () { this.states = new WeakMap() }
}
