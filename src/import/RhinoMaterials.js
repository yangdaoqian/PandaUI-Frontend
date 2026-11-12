import * as THREE from 'three'
import releaseTable from './releaseTable'

const libraries = new WeakMap()
const clamp = (value, fallback, min = 0, max = 1) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
const rgb = (value, scale = 255) => value && ['r', 'g', 'b'].every(k => Number.isFinite(value[k])) ? new THREE.Color(value.r / scale, value.g / scale, value.b / scale) : null
const basename = name => String(name).replace(/\\/g, '/').split('/').pop().toLowerCase()
const slots = { map: ['PBR_BaseColor', 'Bitmap'], bumpMap: ['Bump'], alphaMap: ['Opacity', 'Transparency'], metalnessMap: ['PBR_Metallic'], roughnessMap: ['PBR_Roughness'], emissiveMap: ['PBR_Emission'], aoMap: ['PBR_AmbientOcclusion'] }

export function describeRhinoMaterial (material, module = {}) {
  let pbr
  try {
    pbr = material.physicallyBased?.()
    const physical = pbr?.supported === true
    const color = physical ? rgb(pbr.baseColor, 1) : rgb(material.diffuseColor)?.convertSRGBToLinear()
    const emissive = physical ? rgb(pbr.emissionColor, 1) : rgb(material.emissionColor)?.convertSRGBToLinear()
    const opacity = physical ? clamp(pbr.opacity, 1) : 1 - clamp(material.transparency, 0)
    const ior = physical ? clamp(pbr.reflectiveIOR, 1.5, 1, 2.333) : clamp(material.indexOfRefraction, 1.5, 1, 2.333)
    const textures = {}
    for (const [slot, types] of Object.entries(slots)) {
      for (const type of types) {
        const enumValue = module.TextureType?.[type]
        if (enumValue === undefined || !material.getTexture) continue
        let texture
        try {
          texture = material.getTexture(enumValue)
          if (!texture?.enabled || !texture.fileName) continue
          textures[slot] = { path: texture.fileName, repeat: texture.repeat, offset: texture.offset, rotation: texture.rotation || 0, wrapU: texture.wrapU?.value, wrapV: texture.wrapV?.value }
          break
        } finally { texture?.delete() }
      }
    }
    return { id: material.id,
      name: material.name || '',
      physical,
      color,
      emissive,
      opacity,
      textures,
      metalness: physical ? clamp(pbr.metallic, 0) : 0,
      roughness: physical ? clamp(pbr.roughness, 0.5, 0.04) : Math.max(0.04, Math.sqrt(2 / (clamp(material.shine, 0, 0, 255) + 2))),
      clearcoat: physical ? clamp(pbr.clearcoat, 0) : 0,
      clearcoatRoughness: physical ? clamp(pbr.clearcoatRoughness, 0.1) : 0.1,
      reflectivity: (ior - 1) / (ior + 1) / 0.4 }
  } finally { pbr?.delete() }
}

export function rhinoRenderMaterial (source, document, module) {
  if (!source) return null
  const library = libraries.get(document)
  return library ? library.create(source, module) : makeMaterial(describeRhinoMaterial(source, module))
}

function makeMaterial (descriptor) {
  const { color, emissive, opacity, metalness, roughness, clearcoat, clearcoatRoughness, reflectivity } = descriptor
  const material = new THREE.MeshPhysicalMaterial({ color: color || new THREE.Color(0.7, 0.7, 0.7), emissive: emissive || new THREE.Color(0, 0, 0), opacity, transparent: opacity < 1, depthWrite: opacity === 1, metalness, roughness, clearcoat, clearcoatRoughness, reflectivity, side: THREE.DoubleSide })
  material.name = descriptor.name
  material.userData.rhinoMaterialId = descriptor.id
  return material
}

export default class RhinoMaterials {
  constructor (resources, invalidate = () => {}, loader = null) {
    this.resources = resources; this.invalidate = invalidate
    this.loader = loader
    this.descriptors = new Map(); this.materials = new Map(); this.textures = new Map(); this.files = []
    this.warnings = new Set(); this.disposed = false; this.urls = new Set()
  }

  bind (document) { if (document) libraries.set(document, this) }

  create (source, module) {
    const id = source.id || source.name
    if (!this.descriptors.has(id)) this.descriptors.set(id, describeRhinoMaterial(source, module))
    const descriptor = this.descriptors.get(id)
    // Names and archive IDs do not affect appearance. Texture paths and UV
    // transforms remain in the key, even before their images finish loading.
    const appearance = { ...descriptor }
    delete appearance.id; delete appearance.name; delete appearance.physical
    const materialKey = JSON.stringify(appearance)
    if (this.materials.has(materialKey)) return this.materials.get(materialKey)
    const material = makeMaterial(descriptor)
    for (const [slot, settings] of Object.entries(descriptor.textures)) {
      const key = JSON.stringify([slot, settings])
      if (!this.textures.has(key)) {
        const texture = new THREE.Texture()
        // A missing or still-loading image must not turn the object black.
        if (typeof document !== 'undefined') {
          const pixel = document.createElement('canvas'); pixel.width = pixel.height = 1
          const context = pixel.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 1, 1)
          texture.image = pixel; texture.needsUpdate = true
        }
        texture.name = settings.path
        texture.encoding = ['map', 'emissiveMap'].includes(slot) ? THREE.sRGBEncoding : THREE.LinearEncoding
        texture.wrapS = settings.wrapU === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
        texture.wrapT = settings.wrapV === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping
        if (Array.isArray(settings.repeat)) texture.repeat.fromArray(settings.repeat)
        if (Array.isArray(settings.offset)) texture.offset.fromArray(settings.offset)
        texture.rotation = settings.rotation
        this.textures.set(key, { texture, path: settings.path, loaded: false })
        this.resources.push(texture)
      }
      material[slot] = this.textures.get(key).texture
    }
    if (material.alphaMap) { material.transparent = true; material.depthWrite = false }
    this.materials.set(materialKey, material)
    this.resources.push(material)
    return material
  }

  async loadTextures (document, module) {
    if (this.disposed) return
    this.bind(document)
    // Register paths even for surfaces that have not arrived yet.
    const table = document.materials?.()
    try {
      for (let i = 0; i < (table?.count || 0); i++) {
        const source = table.get(i)
        try { this.create(source, module) } finally { source?.delete() }
      }
    } finally { releaseTable(table) }
    for (const entry of this.textures.values()) {
      if (this.disposed) return
      if (entry.loaded) continue
      let url
      const files = this.files.filter(file => basename(file.name) === basename(entry.path))
      if (files.length === 1) { url = URL.createObjectURL(files[0]); this.urls.add(url) } else {
        let base64
        try { base64 = document.getEmbeddedFileAsBase64?.(entry.path) } catch (_) { this.warnings.add(`Unable to read embedded texture: ${entry.path}`) }
        if (base64) url = `data:image/${/\.jpe?g$/i.test(entry.path) ? 'jpeg' : 'png'};base64,` + base64
      }
      if (!url) { this.warnings.add(`Texture not found: ${entry.path}. Select the image with the model or embed it in the 3DM.`); continue }
      try {
        const loader = this.loader || (this.loader = new THREE.TextureLoader())
        const loaded = await new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject))
        if (!this.disposed) {
          entry.texture.image = loaded.image
          entry.texture.needsUpdate = true
          entry.loaded = true
          this.invalidate()
        }
        loaded.dispose()
      } catch (_) { if (!this.disposed) this.warnings.add(`Unable to decode texture: ${entry.path}`) } finally {
        if (this.urls.delete(url)) URL.revokeObjectURL(url)
      }
    }
  }

  dispose () {
    this.disposed = true
    this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls.clear()
    this.files = []; this.descriptors.clear(); this.materials.clear(); this.textures.clear()
    this.invalidate = () => {}
  }
}
