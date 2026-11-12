import * as THREE from 'three'

export const DEFAULT_SHADING_SETTINGS = Object.freeze({
  environmentIntensity: 0.12,
  skyLight: 0.15,
  keyLight: 0.4,
  ambientLift: 0.125,
  specularIntensity: 0.2,
  shininess: 36
})

export const DEFAULT_RENDER_SETTINGS = Object.freeze({
  environmentIntensity: 0.6,
  ambientLight: 0.35,
  keyLight: 0.85,
  fillLight: 0.2,
  metalnessScale: 1,
  roughnessScale: 1,
  clearcoatBoost: 0,
  clearcoatRoughness: 0.28,
  reflectivity: 0.5
})

export const VIEW_SETTINGS_STORAGE_KEY = 'pandaui-display-environment-settings-v1'

export function createDefaultShadingSettings () {
  return { ...DEFAULT_SHADING_SETTINGS }
}

export function createDefaultRenderSettings () {
  return { ...DEFAULT_RENDER_SETTINGS }
}

function numberSetting (settings, name, fallback, minimum, maximum) {
  const value = Number(settings?.[name])
  return THREE.MathUtils.clamp(Number.isFinite(value) ? value : fallback, minimum, maximum)
}

export function normalizeShadingSettings (settings = {}) {
  return {
    environmentIntensity: numberSetting(settings, 'environmentIntensity', DEFAULT_SHADING_SETTINGS.environmentIntensity, 0, 1),
    skyLight: numberSetting(settings, 'skyLight', DEFAULT_SHADING_SETTINGS.skyLight, 0, 1.5),
    keyLight: numberSetting(settings, 'keyLight', DEFAULT_SHADING_SETTINGS.keyLight, 0, 2),
    ambientLift: numberSetting(settings, 'ambientLift', DEFAULT_SHADING_SETTINGS.ambientLift, 0, 0.25),
    specularIntensity: numberSetting(settings, 'specularIntensity', DEFAULT_SHADING_SETTINGS.specularIntensity, 0, 1),
    shininess: numberSetting(settings, 'shininess', DEFAULT_SHADING_SETTINGS.shininess, 1, 128)
  }
}

export function normalizeRenderSettings (settings = {}) {
  return {
    environmentIntensity: numberSetting(settings, 'environmentIntensity', DEFAULT_RENDER_SETTINGS.environmentIntensity, 0, 2),
    ambientLight: numberSetting(settings, 'ambientLight', DEFAULT_RENDER_SETTINGS.ambientLight, 0, 2),
    keyLight: numberSetting(settings, 'keyLight', DEFAULT_RENDER_SETTINGS.keyLight, 0, 3),
    fillLight: numberSetting(settings, 'fillLight', DEFAULT_RENDER_SETTINGS.fillLight, 0, 2),
    metalnessScale: numberSetting(settings, 'metalnessScale', DEFAULT_RENDER_SETTINGS.metalnessScale, 0, 2),
    roughnessScale: numberSetting(settings, 'roughnessScale', DEFAULT_RENDER_SETTINGS.roughnessScale, 0.25, 2),
    clearcoatBoost: numberSetting(settings, 'clearcoatBoost', DEFAULT_RENDER_SETTINGS.clearcoatBoost, 0, 0.75),
    clearcoatRoughness: numberSetting(settings, 'clearcoatRoughness', DEFAULT_RENDER_SETTINGS.clearcoatRoughness, 0, 1),
    reflectivity: numberSetting(settings, 'reflectivity', DEFAULT_RENDER_SETTINGS.reflectivity, 0, 1)
  }
}

export function applyShadingMaterialSettings (material, settings = {}, environment = null) {
  if (material == null || !material.isMeshPhongMaterial) return
  const normalized = normalizeShadingSettings(settings)
  material.emissive.copy(material.color).multiplyScalar(normalized.ambientLift)
  material.specular.setRGB(normalized.specularIntensity, normalized.specularIntensity, normalized.specularIntensity)
  material.shininess = normalized.shininess
  material.envMap = environment
  material.reflectivity = environment == null ? 0 : normalized.environmentIntensity
  material.toneMapped = false
  material.needsUpdate = true
}

export function applyRenderMaterialSettings (material, settings = {}, environment = null, enabled = true) {
  if (material == null || (!material.isMeshPhysicalMaterial && !material.isMeshStandardMaterial)) return
  if (material[Symbol.for('PandaUI.nodeRenderMaterial')]) return
  const normalized = normalizeRenderSettings(settings)
  if (material.userData.pandauiPhysicalBase == null) {
    material.userData.pandauiPhysicalBase = {
      metalness: Number(material.metalness) || 0,
      roughness: Number.isFinite(material.roughness) ? material.roughness : 0.5,
      clearcoat: Number(material.clearcoat) || 0,
      clearcoatRoughness: Number.isFinite(material.clearcoatRoughness) ? material.clearcoatRoughness : DEFAULT_RENDER_SETTINGS.clearcoatRoughness,
      reflectivity: Number.isFinite(material.reflectivity) ? material.reflectivity : DEFAULT_RENDER_SETTINGS.reflectivity
    }
  }
  const base = material.userData.pandauiPhysicalBase
  material.metalness = THREE.MathUtils.clamp(base.metalness * normalized.metalnessScale, 0, 1)
  material.roughness = THREE.MathUtils.clamp(base.roughness * normalized.roughnessScale, 0.04, 1)
  if ('clearcoat' in material) material.clearcoat = THREE.MathUtils.clamp(base.clearcoat + normalized.clearcoatBoost, 0, 1)
  if ('clearcoatRoughness' in material) material.clearcoatRoughness = THREE.MathUtils.clamp(base.clearcoatRoughness * normalized.clearcoatRoughness / DEFAULT_RENDER_SETTINGS.clearcoatRoughness, 0, 1)
  if ('reflectivity' in material) material.reflectivity = THREE.MathUtils.clamp(base.reflectivity * normalized.reflectivity / DEFAULT_RENDER_SETTINGS.reflectivity, 0, 1)
  material.envMap = enabled ? environment : null
  material.envMapIntensity = normalized.environmentIntensity
  material.toneMapped = true
  material.needsUpdate = true
}
