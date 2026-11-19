import * as THREE from 'three'
import { resourceMeshes } from './RenderResourceMaterials'
import { materialIdentity } from './MaterialIdentity'
import schema from '../../public/editor/shared/MaterialSchema'
import { setSurfaceSettings, surfaceSettings } from './MaterialSurface'
import MaterialPreview from './MaterialPreview'

const colorKeys = schema.colors
const ranges = schema.ranges
const isEditableSurfaceMaterial = material => material?.isMeshStandardMaterial === true || material?.isMeshPhysicalMaterial === true
const cloneEditableMaterial = (source, doc, copyTextures = false) => {
  const clone = source.isMeshPhysicalMaterial ? source.clone() : new THREE.MeshPhysicalMaterial()
  if (!source.isMeshPhysicalMaterial) { THREE.MeshStandardMaterial.prototype.copy.call(clone, source); clone.defines = { STANDARD: '', PHYSICAL: '' } }
  if (copyTextures) {
    const textures = new Map()
    for (const [key, value] of Object.entries(clone)) {
      if (!value?.isTexture) continue
      if (!textures.has(value)) { const texture = value.clone(); texture.needsUpdate = true; textures.set(value, texture); doc.disposableResources.push(texture) }
      clone[key] = textures.get(value)
    }
  }
  return clone
}
const hex = color => {
  const value = (color || new THREE.Color()).clone().convertLinearToSRGB()
  return '#' + ['r', 'g', 'b'].map(key => Math.round(Math.max(0, Math.min(1, value[key])) * 255).toString(16).padStart(2, '0')).join('')
}

// Equivalent materials share a reference within an editable document scope.
// The graph stores settings; GPU objects remain owned by the imported document.
export default class ImportedMaterialEditor {
  constructor (services) { this.services = services; this.versions = new Map(); this.textures = new WeakMap(); this.disposed = false; this.index = new Map(); this.meshKeys = new WeakMap(); this.thumbnails = new Map(); this.indexDocuments = new Set() }

  entries () {
    const entries = new Map(), docs = this.services.documents().filter(doc => !doc.disposed)
    const scenes = new Map(docs.map(doc => [doc.three?.middleground, doc]))
    const signatures = new Map()
    for (const doc of docs) {
      const groups = new Map()
      for (const material of doc.pandaMaterialLibrary || []) {
        const id = material.userData.pandaSceneMaterialSourceId || material.uuid
        const key = JSON.stringify([doc.documentId, String(id)])
        const entry = { key, id: String(id), doc, material, targets: [] }
        groups.set(materialIdentity(material), entry); entries.set(key, entry)
      }
      for (const mesh of resourceMeshes([doc.three?.middleground])) {
        let owner, locked = false
        for (let part = mesh; part; part = part.parent) {
          if (!owner && scenes.has(part)) owner = scenes.get(part)
          if (part.userData?.readOnly || part.userData?.nodePreview) locked = true
        }
        if (locked || owner !== doc) continue
        const source = this.services.source(mesh)
        ;(Array.isArray(source) ? source : [source]).forEach((material, slot) => {
          if (!isEditableSurfaceMaterial(material)) return
          let id = material.userData.pandaSceneMaterialSourceId || material.userData.rhinoMaterialId || material.uuid
          if (!signatures.has(material)) signatures.set(material, materialIdentity(material))
          const signature = signatures.get(material)
          if (!groups.has(signature)) {
            let key = JSON.stringify([doc.documentId, String(id)])
            if (entries.has(key)) { id = String(id) + ':' + material.uuid; key = JSON.stringify([doc.documentId, id]) }
            const entry = { key, id: String(id), doc, material, targets: [] }
            groups.set(signature, entry); entries.set(key, entry)
          }
          groups.get(signature).targets.push({ mesh, slot, material })
        })
      }
    }
    return entries
  }

  catalog () {
    const entries = [...this.entries().values()]
    this.index = new Map(entries.map(entry => [entry.key, entry])); this.meshKeys = new WeakMap()
    this.indexDocuments = new Set(entries.map(entry => entry.doc))
    for (const entry of entries) {
      for (const { mesh } of entry.targets) {
        const keys = this.meshKeys.get(mesh) || new Set(); keys.add(entry.key); this.meshKeys.set(mesh, keys)
      }
    }
    for (const key of this.thumbnails.keys()) if (!this.index.has(key)) this.thumbnails.delete(key)
    const duplicates = entries.filter(entry => entry.targets.some(target => target.material !== entry.material))
    if (duplicates.length) {
      this.services.edit(() => {
        for (const entry of duplicates) {
          for (const target of entry.targets) {
            if (target.material !== entry.material) this.assign(entry, target, entry.material)
          }
        }
      })
      this.services.invalidate()
    }
    return entries.map(entry => {
      const m = entry.material
      return { key: entry.key,
        name: m.name || 'Unnamed material',
        document: entry.doc.name || 'Document',
        count: new Set(entry.targets.map(t => t.mesh)).size,
        settings: surfaceSettings(m, hex),
        textureName: m.map?.name || '',
        bumpTextureName: m.bumpMap?.name || '',
        normalTextureName: m.normalMap?.name || '' }
    }).sort((a, b) => (a.document + a.name).localeCompare(b.document + b.name))
  }

  preview (key) {
    if (this.disposed) throw new Error('Material editor is closed.')
    const entry = this.index.get(key)
    if (!entry) throw new Error('Select an available material.')
    if (entry.doc.disposed) { this.index.delete(key); this.thumbnails.delete(key); throw new Error('The source document was closed.') }
    const target = entry.targets.find(({ mesh }) => {
      for (let part = mesh; part; part = part.parent) {
        if (part.userData?.readOnly || part.userData?.nodePreview) return false
        if (part === entry.doc.three?.middleground) return true
      }
      return false
    })
    if (!target && !entry.doc.pandaMaterialLibrary?.includes(entry.material)) throw new Error('The material is no longer editable.')
    const sources = target ? this.services.source(target.mesh) : entry.material, material = Array.isArray(sources) ? sources[target.slot] : sources
    const signature = [material.uuid, material.version, ...Object.values(material).filter(value => value?.isTexture).map(texture => texture.uuid + ':' + texture.version)].join('|')
    const cached = this.thumbnails.get(key)
    if (cached?.signature === signature) return cached.image
    if (!this.previewRenderer) this.previewRenderer = new MaterialPreview(this.services.renderer)
    const image = this.previewRenderer.render(material)
    this.thumbnails.delete(key); this.thumbnails.set(key, { signature, image })
    while (this.thumbnails.size > 24) this.thumbnails.delete(this.thumbnails.keys().next().value)
    return image
  }

  selection (object) {
    const keys = new Set()
    object?.traverse(part => { for (const key of this.meshKeys.get(part) || []) keys.add(key) })
    if (!keys.size && object) {
      const editable = [...resourceMeshes([object])].some(mesh => {
        for (let part = mesh; part; part = part.parent) if (part.userData?.readOnly || part.userData?.nodePreview) return false
        const source = this.services.source(mesh)
        return (Array.isArray(source) ? source : [source]).some(isEditableSurfaceMaterial)
      })
      if (editable) { this.catalog(); object.traverse(part => { for (const key of this.meshKeys.get(part) || []) keys.add(key) }) }
    }
    return [...keys]
  }

  pruneDocuments () {
    if (![...this.indexDocuments].some(doc => doc.disposed)) return
    for (const [key, entry] of this.index) if (entry.doc.disposed) { this.index.delete(key); this.thumbnails.delete(key); this.versions.delete(key) }
    for (const doc of this.indexDocuments) if (doc.disposed) this.indexDocuments.delete(doc)
  }

  assign (entry, { mesh, slot }, material, replacePool = true) {
    const bag = mesh.userData.displayMaterials
    const original = bag?.render || mesh.material
    if (replacePool) entry.doc.replaceImportedDisplayMaterial?.(Array.isArray(original) ? original[slot] : original, material)
    const replacement = Array.isArray(original) ? original.map((m, i) => i === slot ? material : m) : material
    if (bag) mesh.userData.displayMaterials = { ...bag, render: replacement }
    if (mesh.material === original || !bag) mesh.material = replacement
    entry.doc.disposableResources?.track?.(mesh)
    entry.doc.invalidateRenderObject?.(mesh)
  }

  copy (key) {
    const entry = this.entries().get(key)
    if (!entry || this.disposed) throw new Error('Select an editable material.')
    const material = cloneEditableMaterial(entry.material, entry.doc, true)
    material.name = (material.name || 'Material') + ' copy'
    material.userData.pandaMaterialLibraryId = material.uuid
    material.userData.pandaSceneMaterialSourceId = material.uuid
    material.userData.pandaSceneMaterialEdited = true
    setSurfaceSettings(material, {})
    ;(entry.doc.pandaMaterialLibrary ||= []).push(material)
    entry.doc.disposableResources.push(material)
    this.services.invalidate()
    return JSON.stringify([entry.doc.documentId, material.uuid])
  }

  rename (key, name) {
    name = String(name || '').trim()
    if (!name || name.length > 160) throw new Error('Enter a material name of 1–160 characters.')
    const entry = this.entries().get(key)
    if (!entry || this.disposed) throw new Error('Select an editable material.')
    this.services.edit(() => {
      let material = entry.material
      if (!entry.doc.pandaMaterialLibrary?.includes(material)) {
        material = cloneEditableMaterial(material, entry.doc)
        material.userData.pandaSceneMaterialSourceId = entry.id
        material.userData.pandaSceneMaterialEdited = true
        material.userData.pandaMaterialLibraryId = material.uuid
        setSurfaceSettings(material, {})
        ;(entry.doc.pandaMaterialLibrary ||= []).push(material)
        entry.doc.disposableResources.push(material)
        entry.targets.forEach(target => this.assign(entry, target, material))
      }
      material.name = name
    })
    this.services.invalidate(); this.thumbnails.delete(key)
  }

  applyToSelection (key, object) {
    const entry = this.entries().get(key)
    if (!entry || this.disposed) throw new Error('Select an editable material.')
    if (!object) throw new Error('Select an object in the scene first.')
    const targets = []
    for (const mesh of resourceMeshes([object])) {
      let owned = false, locked = false
      for (let part = mesh; part; part = part.parent) {
        if (part === entry.doc.three?.middleground) owned = true
        if (part.userData?.readOnly || part.userData?.nodePreview) locked = true
      }
      if (!owned || locked) throw new Error('Select editable objects in the material’s document.')
      const source = this.services.source(mesh)
      ;[].concat(source || []).forEach((material, slot) => { if (isEditableSurfaceMaterial(material)) targets.push({ mesh, slot }) })
    }
    if (!targets.length) throw new Error('The selection has no editable mesh surfaces.')
    this.services.edit(() => targets.forEach(target => this.assign(entry, target, entry.material, false)))
    this.catalog(); this.services.invalidate()
    return targets.length
  }

  async update (key, settings = {}) {
    if (this.disposed) throw new Error('Material editor is closed.')
    const patch = {}
    if ('materialType' in settings) {
      if (!Object.hasOwn(schema.types, settings.materialType)) throw new Error('Unknown material type.')
      patch.materialType = settings.materialType
    }
    for (const name of colorKeys) {
      if (name in settings) {
        if (typeof settings[name] !== 'string' || !/^#[\da-f]{6}$/i.test(settings[name])) throw new Error('Invalid material color.')
        patch[name] = settings[name]
      }
    }
    for (const [name, [min, max]] of Object.entries(ranges)) {
      if (name in settings) {
        if (typeof settings[name] !== 'number' || !Number.isFinite(settings[name])) throw new Error('Invalid material ' + name)
        patch[name] = Math.max(min, Math.min(max, settings[name]))
      }
    }
    const initial = this.entries().get(key)
    if (!initial) throw new Error('This material is no longer available or editable. Refresh the material list.')
    const version = (this.versions.get(key) || 0) + 1
    this.versions.set(key, version)
    const states = this.textures.get(initial.doc) || new Map()
    this.textures.set(initial.doc, states)
    const textures = []
    try {
      for (const [name, descriptor] of Object.entries(schema.textures)) {
        if (!Object.hasOwn(settings, name)) continue
        const stateKey = JSON.stringify([key, name]), previous = states.get(stateKey)
        const url = settings[name]
        if (url && (typeof url !== 'string' || !/^data:image\/(png|jpeg|webp|gif|bmp);base64,/i.test(url))) throw new Error('Choose a PNG, JPEG, WebP, GIF or BMP image.')
        const owned = !!url && previous?.url !== url
        const texture = url ? (owned ? await new THREE.TextureLoader().loadAsync(url) : previous.texture) : null
        textures.push({ stateKey, previous, url, texture, owned, slot: descriptor.slot })
        if (texture) {
          texture.encoding = descriptor.srgb ? THREE.sRGBEncoding : THREE.LinearEncoding
          texture.name = String(settings[name + 'Name'] || 'Selected image'); texture.needsUpdate = true
        }
      }
      if (this.disposed || this.versions.get(key) !== version) { textures.forEach(t => { if (t.owned) t.texture.dispose() }); return { stale: true } }
      const entry = this.entries().get(key)
      if (!entry) throw new Error('The source document was closed or its permissions changed.')
      let count = 0
      this.services.edit(() => {
        let shared = null
        const changed = new Set()
        for (const { mesh, slot } of entry.targets.length ? entry.targets : [{ mesh: null, slot: 0 }]) {
          const bag = mesh?.userData.displayMaterials
          const original = bag?.render || mesh?.material || entry.material
          const source = Array.isArray(original) ? original[slot] : original
          let material = shared || source
          if (!source.userData.pandaSceneMaterialEdited) {
            if (!shared) {
              const clone = source.isMeshPhysicalMaterial ? source.clone() : new THREE.MeshPhysicalMaterial()
              if (!source.isMeshPhysicalMaterial) { THREE.MeshStandardMaterial.prototype.copy.call(clone, source); clone.defines = { STANDARD: '', PHYSICAL: '' } }
              clone.userData.pandaSceneMaterialSourceId = entry.id
              clone.userData.pandaSceneMaterialEdited = true
              shared = clone; entry.doc.disposableResources.push(clone)
            }
            material = shared
          }
          if (!changed.has(material)) {
            for (const texture of textures) {
              material[texture.slot] = texture.texture
              if (texture.texture && material.userData.pandaUVRepeat) {
                if (material.userData.pandaUVRepeat.u) texture.texture.wrapS = THREE.RepeatWrapping
                if (material.userData.pandaUVRepeat.v) texture.texture.wrapT = THREE.RepeatWrapping
                texture.texture.needsUpdate = true
              }
            }
            setSurfaceSettings(material, patch)
            material.needsUpdate = true; changed.add(material)
          }
          if (mesh) this.assign(entry, { mesh, slot }, material)
          count++
        }
        for (const texture of textures) if (texture.owned) entry.doc.disposableResources.push(texture.texture)
      })
      for (const item of textures) {
        const { previous, texture, stateKey, url } = item
        states.set(stateKey, { url, texture })
        if (previous?.texture && previous.texture !== texture) {
          // Only textures created by this editor are released here. Imported
          // texture images can be shared by other materials and are borrowed.
          entry.doc.disposableResources.delete?.(previous.texture)
          previous.texture.dispose()
        }
      }
      this.services.invalidate()
      this.thumbnails.delete(key)
      return { count, name: entry.material.name || 'Material' }
    } catch (error) { textures.forEach(t => { if (t.owned) t.texture.dispose() }); throw error }
  }

  dispose () { this.disposed = true; this.versions.clear(); this.textures = new WeakMap(); this.index.clear(); this.indexDocuments.clear(); this.thumbnails.clear(); this.meshKeys = new WeakMap(); this.previewRenderer?.dispose(); this.previewRenderer = null }
}
