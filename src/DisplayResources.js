/* global FinalizationRegistry, WeakRef */

const geometries = new WeakMap()
const attributeUsers = new WeakMap()
const references = new Map()
const cleanup = new FinalizationRegistry(id => references.delete(id))

function geometryAttributes (geometry) {
  return new Set([...Object.values(geometry.attributes), geometry.index, ...Object.values(geometry.morphAttributes || {}).flat()].filter(Boolean).map(attribute => attribute.isInterleavedBufferAttribute ? attribute.data : attribute))
}

function attributeState (attribute) {
  if (!attributeUsers.has(attribute)) attributeUsers.set(attribute, { users: 0, waiting: new Set() })
  return attributeUsers.get(attribute)
}

export function geometryReference (geometry) {
  if (!geometries.has(geometry)) {
    const originalDispose = geometry.dispose.bind(geometry)
    const attributes = geometryAttributes(geometry)
    attributes.forEach(attribute => attributeState(attribute).users++)
    const state = { users: 0, requested: false, disposed: false, dispose: null }
    const dispose = state.dispose = () => {
      geometryAttributes(geometry).forEach(attribute => {
        if (!attributes.has(attribute)) { attributes.add(attribute); attributeState(attribute).users++ }
      })
      let finalized = false
      const finalize = () => {
        if (finalized || [...attributes].some(attribute => attributeState(attribute).users > 0)) return
        finalized = true
        attributes.forEach(attribute => attributeState(attribute).waiting.delete(finalize))
        references.delete(geometry.uuid)
        const currentAttributes = geometry.attributes
        geometry.attributes = { ...currentAttributes }
        let index = 0
        attributes.forEach(attribute => { geometry.attributes['released' + index++] = attribute })
        try { originalDispose() } finally { geometry.attributes = currentAttributes }
      }
      const pending = new Set([finalize])
      attributes.forEach(attribute => {
        const resource = attributeState(attribute)
        resource.users--
        resource.waiting.add(finalize)
        if (!resource.users) resource.waiting.forEach(callback => pending.add(callback))
      })
      pending.forEach(callback => callback())
    }
    geometries.set(geometry, state)
    geometry.dispose = () => {
      state.requested = true
      if (!state.users && !state.disposed) { state.disposed = true; dispose() }
    }
    references.set(geometry.uuid, new WeakRef(geometry))
    cleanup.register(geometry, geometry.uuid)
  }
  return geometry.uuid
}

export function findGeometryResource (id) {
  const geometry = references.get(id)?.deref()
  return geometry && !geometries.get(geometry)?.disposed ? geometry : null
}

export function retainGeometry (geometry) {
  geometryReference(geometry)
  const state = geometries.get(geometry)
  state.users++
  let released = false
  return () => {
    if (released) return
    released = true
    state.users--
    if (!state.users && state.requested && !state.disposed) { state.disposed = true; state.dispose() }
  }
}

export function detachDisplayMaterials (root, modes = ['shading', 'render', 'edge']) {
  const copies = new Map()
  const owners = new Set()
  const copy = material => {
    if (!material) return material
    if (material.userData?.pandauiMaterialOwner === root.uuid) return material
    if (!copies.has(material)) {
      const cloned = material.clone()
      delete cloned.userData.pandauiPooledMaterial
      cloned.userData.pandauiMaterialOwner = root.uuid
      copies.set(material, cloned)
    }
    return copies.get(material)
  }
  root?.traverse(object => {
    owners.add(object.uuid)
    const materials = object.userData.displayMaterials
    if (object.isMesh && materials) {
      for (const mode of modes) {
        if (!materials[mode]) continue
        const previous = materials[mode]
        materials[mode] = Array.isArray(previous) ? previous.map(copy) : copy(previous)
        if (object.material === previous) object.material = materials[mode]
      }
    } else if (object.isLine && modes.includes('edge')) {
      object.material = copy(object.material)
    }
  })
  copies.forEach((cloned, previous) => {
    if (owners.has(previous.userData?.pandauiMaterialOwner)) previous.dispose()
  })
}
