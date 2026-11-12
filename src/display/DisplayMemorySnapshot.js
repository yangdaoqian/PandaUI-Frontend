// On-demand inventory only. Never retain scene resources in the returned report
// or traverse the scene on every frame. Byte counts describe CPU backing stores,
// not driver VRAM allocations or the JavaScript object/Map overhead.
export default function displayMemorySnapshot (roots) {
  const buffers = new Set(), geometries = new Set(), materials = new Set(), textures = new Set()
  const source = new Set(), batches = new Set(), textureBuffers = new Set()
  const meshBuffers = new Set(), lineBuffers = new Set()
  let objects = 0, meshes = 0, lines = 0
  const addArray = (array, category) => {
    if (ArrayBuffer.isView(array)) { buffers.add(array.buffer); category.add(array.buffer) }
  }
  const addAttribute = (attribute, category) => addArray(attribute?.data?.array || attribute?.array, category)
  const addTexture = texture => {
    if (!texture?.isTexture || textures.has(texture)) return
    textures.add(texture)
    for (const image of [texture.image].flat()) addArray(image?.data, textureBuffers)
    for (const mip of texture.mipmaps || []) addArray(mip?.data, textureBuffers)
  }
  const addMaterial = material => {
    if (!material?.isMaterial || materials.has(material)) return
    materials.add(material)
    Object.values(material).forEach(value => { if (value?.isTexture) addTexture(value) })
    Object.values(material.uniforms || {}).forEach(uniform => {
      for (const value of [uniform?.value].flat()) addTexture(value)
    })
  }
  for (const root of new Set(roots.filter(Boolean))) {
    root.traverse(object => {
      objects++; if (object.isMesh) meshes++; if (object.isLine) lines++
      const geometry = object.geometry, category = object.userData?.renderBatch ? batches : source
      if (geometry) {
        geometries.add(geometry)
        Object.values(geometry.attributes || {}).forEach(attribute => addAttribute(attribute, category))
        addAttribute(geometry.index, category)
        Object.values(geometry.morphAttributes || {}).flat().forEach(attribute => addAttribute(attribute, category))
        if (!object.userData?.renderBatch && (object.isMesh || object.isLine)) {
          const kind = object.isMesh ? meshBuffers : lineBuffers
          Object.values(geometry.attributes || {}).forEach(attribute => addAttribute(attribute, kind))
          addAttribute(geometry.index, kind)
        }
      }
      addAttribute(object.instanceMatrix, category); addAttribute(object.instanceColor, category)
      for (const material of [object.material].flat()) addMaterial(material)
      Object.values(object.userData?.displayMaterials || {}).forEach(addMaterial)
      addTexture(object.background); addTexture(object.environment)
    })
  }
  const bytes = set => [...set].reduce((sum, buffer) => sum + buffer.byteLength, 0)
  return {
    objects,
    meshes,
    lines,
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
    cpuBufferBytes: bytes(buffers),
    sourceBufferBytes: bytes(source),
    batchBufferBytes: bytes(batches),
    textureBufferBytes: bytes(textureBuffers),
    sourceMeshBufferBytes: bytes(meshBuffers),
    sourceLineBufferBytes: bytes(lineBuffers),
    note: 'CPU backing stores deduplicated by identity, including hidden sources. Categories may overlap. Excludes JS object overhead, image decoder storage, WASM heaps and driver VRAM.'
  }
}
