import { surfaceProgramIdentity } from './MaterialSurface'

// Names and full-precision render state must match; source IDs may differ.
// Textures are borrowed resources: only the same texture/UV state is equivalent.
const ignored = new Set(['id', 'uuid', 'version', '_listeners', 'userData', 'onBeforeCompile', 'customProgramCacheKey'])
const metadata = new Set(['rhinoMaterialId', 'pandauiMaterialId', 'pandaSceneMaterialSourceId', 'pandaSceneMaterialEdited'])
function value (item) {
  if (item?.isTexture) return { texture: item.uuid }
  if (Array.isArray(item)) return item.map(value)
  if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, value(item[key])]))
  return item
}
export function materialIdentity (material) {
  const program = surfaceProgramIdentity(material)
  if (program == null) return material.uuid
  const state = Object.fromEntries(Object.keys(material).sort().filter(key => !ignored.has(key)).map(key => [key, value(material[key])]))
  state.program = program
  state.userData = Object.fromEntries(Object.keys(material.userData || {}).sort().filter(key => !metadata.has(key)).map(key => [key, value(material.userData[key])]))
  return JSON.stringify(state)
}
