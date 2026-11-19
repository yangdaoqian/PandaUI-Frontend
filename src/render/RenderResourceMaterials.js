import * as THREE from 'three'
import { isRenderCurve, isRenderEdge } from './RenderVisibility'
import { applyRenderShadowFilter } from './RenderShadowFilter'
import { applyMaterialSurface, setSurfaceSettings } from './MaterialSurface'

const textureAliases = { color: 'map', bump: 'bumpMap', normal: 'normalMap', roughness: 'roughnessMap', metalness: 'metalnessMap', emissive: 'emissiveMap', opacity: 'alphaMap', ao: 'aoMap', clearcoat: 'clearcoatMap' }
export const resourceTextureRoles = Object.values(textureAliases)

export function resourceTextureSlots (textures = {}) {
  const slots = { ...textures }
  for (const [alias, slot] of Object.entries(textureAliases)) {
    if (!(slot in slots) && alias in slots) slots[slot] = slots[alias]
  }
  return slots
}

export function resourceNumber (value, fallback, min = 0, max = Infinity) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

export function isResourceObject (object, includePreviews = false) {
  for (let current = object; current; current = current.parent) {
    const data = current.userData || {}
    if ((!includePreviews && data.nodePreview) || data.renderBatch || data.selectionHighlight || data.renderShadowGround || data.clippingHelper || data.renderResourceRig) return false
  }
  return true
}

export function resourceMeshes (roots, includePreviews = false) {
  const meshes = new Set()
  for (const root of roots) {
    root?.traverse(object => {
      if (object.isMesh && !isRenderCurve(object) && !isRenderEdge(object) && isResourceObject(object, includePreviews)) meshes.add(object)
    })
  }
  return meshes
}

export function resourceTextureSource (source) {
  return source?.kind === 'render.texture' ? source.url : source
}

function physicalCopy (source) {
  if (source?.isMeshPhysicalMaterial) return source.clone()
  const material = new THREE.MeshPhysicalMaterial({ roughness: 0.5, metalness: 0 })
  if (source?.isMeshStandardMaterial) {
    THREE.MeshStandardMaterial.prototype.copy.call(material, source)
    material.defines = { STANDARD: '', PHYSICAL: '' }
  } else if (source) {
    // Preserve rendering semantics and borrowed textures without changing geometry,
    // material groups, UVs, vertex colors, skinning, or the original material.
    for (const key of ['name', 'side', 'vertexColors', 'opacity', 'transparent', 'depthTest', 'depthWrite', 'alphaTest', 'blending', 'blendSrc', 'blendDst', 'blendEquation', 'premultipliedAlpha', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'visible', 'fog', 'wireframe', 'skinning', 'morphTargets', 'morphNormals', 'clipIntersection', 'clipShadows', 'clippingPlanes', 'map', 'alphaMap', 'normalMap', 'bumpMap', 'bumpScale', 'aoMap', 'aoMapIntensity', 'lightMap', 'lightMapIntensity', 'emissiveMap', 'emissiveIntensity', 'displacementMap', 'displacementScale', 'displacementBias']) {
      if (source[key] !== undefined) material[key] = source[key]
    }
    for (const key of ['color', 'emissive', 'normalScale']) {
      if (source[key]) material[key].copy(source[key])
    }
  }
  return material
}

export function createResourceMaterial (source, binding, environment, intensity, scope, shadows = false) {
  if (!binding && (!environment || !source?.isMeshStandardMaterial) && !(shadows && source?.isMeshStandardMaterial)) return source
  const material = scope.own(binding ? physicalCopy(source) : source.clone())
  // Runtime-only ownership: editor display presets must not overwrite node
  // parameters on this clone. Symbols do not enter document/graph serialization.
  Object.defineProperty(material, Symbol.for('PandaUI.nodeRenderMaterial'), { value: true })
  if (binding) {
    const settings = binding.material || {}
    for (const key of ['color', 'emissive']) {
      if (settings[key] != null) material[key].set(settings[key]).convertSRGBToLinear()
    }
    for (const key of ['roughness', 'metalness', 'opacity', 'clearcoat']) {
      material[key] = resourceNumber(settings[key], material[key], 0, 1)
    }
    material.emissiveIntensity = resourceNumber(settings.emissiveIntensity, material.emissiveIntensity)
    if (settings.opacity != null) {
      material.transparent = material.opacity < 1
      material.depthWrite = !material.transparent
    }
    // Legacy bindings without a surface schema still need the r120 F0
    // approximation. Typed bindings get their IOR from pandaSurface and the
    // custom shader, so native reflectivity remains an independent control.
    if (settings.ior != null && !settings.materialType) {
      const ior = resourceNumber(settings.ior, 1.5, 1, 7 / 3)
      material.reflectivity = (ior - 1) / (ior + 1) / 0.4
    }
    // r120 transmission is not accurate scene refraction. Never substitute alpha.
    material.transmission = 0
    material.transmissionMap = null
    if (settings.materialType) setSurfaceSettings(material, settings)
    for (const role of resourceTextureRoles) {
      if (Object.prototype.hasOwnProperty.call(settings.textures || {}, role)) material[role] = binding.textures[role] || null
    }
    if (material.alphaMap) {
      material.transparent = true
      material.depthWrite = false
    }
  }
  if (environment) {
    material.envMap = environment
    material.envMapIntensity = intensity
  }
  applyMaterialSurface(material)
  if (shadows) applyRenderShadowFilter(material)
  return material
}
