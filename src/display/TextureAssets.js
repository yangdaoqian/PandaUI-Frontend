export default class TextureAssets {
  #assets = new Map()
  #bindings = new Map()

  get size () { return this.#assets.size }

  track (material) {
    if (this.#bindings.has(material.uuid)) return
    this.#bindings.set(material.uuid, new WeakRef(material))
    const id = material.uuid
    material.addEventListener('dispose', () => this.#bindings.delete(id))
  }

  capture (texture) {
    if (!texture) return null
    texture.userData = texture.userData || {}
    const textureAssetId = texture.userData.pandauiTextureAssetId || texture.uuid
    texture.userData.pandauiTextureAssetId = textureAssetId
    if (!this.#assets.has(textureAssetId)) this.#assets.set(textureAssetId, texture)
    return {
      textureAssetId, repeat: texture.repeat.toArray(), offset: texture.offset.toArray(),
      center: texture.center.toArray(), rotation: texture.rotation, wrapS: texture.wrapS, wrapT: texture.wrapT
    }
  }

  restore (state) {
    if (!state) return null
    const source = this.#assets.get(state.textureAssetId)
    if (!source) throw new Error('Texture asset is no longer available: ' + state.textureAssetId)
    const texture = source.clone()
    texture.userData = { ...source.userData, pandauiOwnedTexture: true }
    texture.repeat.fromArray(state.repeat)
    texture.offset.fromArray(state.offset)
    texture.center.fromArray(state.center)
    texture.rotation = state.rotation
    texture.wrapS = state.wrapS
    texture.wrapT = state.wrapT
    texture.needsUpdate = true
    return texture
  }

  matches (texture, state) {
    if (!texture || !state) return !texture && !state
    return (texture.userData?.pandauiTextureAssetId || texture.uuid) === state.textureAssetId &&
      texture.rotation === state.rotation && texture.wrapS === state.wrapS && texture.wrapT === state.wrapT &&
      texture.repeat.toArray().every((value, index) => value === state.repeat[index]) &&
      texture.offset.toArray().every((value, index) => value === state.offset[index]) &&
      texture.center.toArray().every((value, index) => value === state.center[index])
  }

  retain (ids) {
    for (const [id, reference] of this.#bindings) {
      const material = reference.deref()
      if (!material) this.#bindings.delete(id)
      else if (material.map) ids.add(material.map.userData?.pandauiTextureAssetId || material.map.uuid)
    }
    for (const [id, texture] of this.#assets) {
      if (ids.has(id)) continue
      texture.dispose()
      this.#assets.delete(id)
    }
  }

  dispose () { this.#bindings.clear(); this.retain(new Set()) }
}
