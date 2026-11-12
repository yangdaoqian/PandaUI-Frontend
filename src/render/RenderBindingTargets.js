// Bindings keep their serialized string IDs. A shared placement also retains
// source geometry IDs, so matching must not choose just one metadata field.
export function renderBindingTargetIds (object) {
  const data = object?.userData || {}
  return [...new Set([data.sharedObject?.objectId, data.sharedDocument?.objectId,
    data.pandauiObjectId, data.geometryId, data.objectId, object?.uuid]
    .filter(id => typeof id === 'string' && id.length))]
}

export function resolveRenderBindingTargets (scenes, ids) {
  const wanted = new Set(ids.map(String)), roots = new Set()
  for (const scene of scenes) {
    scene?.traverse(object => {
      if (!renderBindingTargetIds(object).some(id => wanted.has(id))) return
      for (let item = object; item; item = item.parent) {
        if (item.userData?.readOnly || item.userData?.nodePreview) return
      }
      roots.add(object)
    })
  }
  return [...roots]
}
