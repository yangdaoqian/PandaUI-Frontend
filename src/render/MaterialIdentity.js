import * as THREE from 'three'

// Compare full-precision render state, not names, source IDs or rounded colors.
// Textures are borrowed resources: only the same texture/UV state is equivalent.
const ignored = new Set(['id', 'uuid', 'name', 'version', '_listeners', 'userData'])
const metadata = new Set(['rhinoMaterialId', 'pandaSceneMaterialSourceId', 'pandaSceneMaterialEdited'])
function value (item) {
  if (item?.isTexture) return { texture: item.uuid }
  if (Array.isArray(item)) return item.map(value)
  if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, value(item[key])]))
  return item
}
export function materialIdentity (material) {
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) return material.uuid
  const state = Object.fromEntries(Object.keys(material).sort().filter(key => !ignored.has(key)).map(key => [key, value(material[key])]))
  state.userData = Object.fromEntries(Object.keys(material.userData || {}).sort().filter(key => !metadata.has(key)).map(key => [key, value(material.userData[key])]))
  return JSON.stringify(state)
}
