import * as THREE from 'three'

export const SMALL_RENDER_OBJECT_BYTES = 10 * 1024 * 1024
export const MIN_RENDER_BATCH_BYTES = 1 * 1024 * 1024

function geometryBytes (geometry) {
  return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, geometry.index?.array.byteLength || 0)
}

function visible (object) {
  for (let current = object; current; current = current.parent) if (!current.visible || current.userData?.pandauiHidden) return false
  return true
}

function within (object, root) {
  for (let current = object; current; current = current.parent) if (current === root) return true
  return false
}

function batchParent (object, scene) {
  for (let current = object.parent; current && current !== scene; current = current.parent) {
    if (current.userData?.importedBlockInstance) return current
  }
  return scene
}

function flagged (object, key) {
  for (let current = object; current; current = current.parent) if (current.userData?.[key]) return true
  return false
}

function materialKey (material) {
  if (!material) return ''
  if (Array.isArray(material)) return JSON.stringify(material.map(materialKey))
  // toJSON includes physical properties, maps, defines and clipping settings.
  // Compare texture identity, never export their pixels: PMREM render targets
  // are not CanvasImageSources and r120's image exporter throws on them.
  // Exporting ordinary images here also needlessly encodes PNGs for each mesh.
  const meta = { textures: Object.create(null), images: Object.create(null) }
  for (const value of Object.values(material)) if (value?.isTexture) meta.textures[value.uuid] = { uuid: value.uuid }
  // UUID/name/version do not affect pixels. Keep custom compile hooks distinct.
  const { uuid, name, metadata, ...properties } = material.toJSON(meta)
  return JSON.stringify(properties) + String(material.onBeforeCompile) + JSON.stringify(material.clippingPlanes)
}

function layoutKey (geometry) {
  return Object.keys(geometry.attributes).sort().map(name => {
    const a = geometry.attributes[name]
    return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`
  }).join('|')
}

// Render buffers are disposable acceleration data. Source geometry, IDs and
// visibility remain authoritative, including while a document is being shared.
export default class ImportedRenderBatcher {
  suspended = false
  #document
  #batches = new Set()
  #bySource = new Map()
  #byRenderObject = new Map()
  #pending = new Set()
  #editing = new Set()
  #renderHidden = []
  #checkedRevision

  constructor (document, { smallBytes = SMALL_RENDER_OBJECT_BYTES, batchBytes = MIN_RENDER_BATCH_BYTES } = {}) {
    this.#document = document
    this.smallBytes = smallBytes
    this.batchBytes = batchBytes
  }

  get batches () { return [...this.#batches] }
  get batchCount () { return this.#batches.size }
  get materialized () { return this.#editing.size > 0 }

  queue (root) {
    this.#checkedRevision = undefined
    root?.traverse(object => {
      if ((object.isMesh || object.isLineSegments) && !object.userData?.renderBatch) this.#pending.add(object)
    })
  }

  #dissolve (batch, requeue = true) {
    this.#batches.delete(batch)
    this.#byRenderObject.delete(batch.object)
    batch.object.parent?.remove(batch.object)
    batch.geometry.dispose()
    batch.sourceObjects.forEach(source => {
      const state = this.#bySource.get(source)
      if (state?.batch !== batch) return
      source.raycast = state.raycast
      this.#bySource.delete(source)
      if (requeue) this.#pending.add(source)
    })
  }

  invalidate (root) {
    this.#checkedRevision = undefined
    const batches = new Set()
    root?.traverse(object => {
      const state = this.#bySource.get(object)
      if (state) batches.add(state.batch)
    })
    batches.forEach(batch => this.#dissolve(batch))
  }

  clear () {
    this.#checkedRevision = undefined
    this.finishRender()
    this.#batches.forEach(batch => this.#dissolve(batch, false))
    this.#pending.clear()
  }

  dispose () { this.clear(); this.#editing.clear() }

  rebuild () {
    this.clear()
    this.queue(this.#document.three?.middleground)
    this.flush(true)
  }

  #candidate (object) {
    const geometry = object.geometry, material = object.material
    if ((!object.isMesh && !object.isLineSegments) || object.isSkinnedMesh || object.isInstancedMesh) return false
    if (!geometry?.attributes?.position || !material?.isMaterial || material.isShaderMaterial || material.transparent || material.opacity < 0.999) return false
    if (object.userData.localDocumentId !== this.#document.documentId || !within(object, this.#document.three.middleground)) return false
    if (object.userData.renderBatch || !visible(object)) return false
    if (['nodePreview', 'nonselectable', 'selectionHighlight', 'meshFaceEdges', 'brepSelection', 'kukaPreview'].some(key => flagged(object, key))) return false
    if ([...this.#editing].some(root => within(object, root))) return false
    // Hiding a mesh for the render pass also hides its children. Leave meshes
    // with visible triangle-edge overlays independent.
    if (object.children.some(child => child.visible)) return false
    if (Object.keys(geometry.morphAttributes || {}).length || geometry.groups.length || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false
    if (Object.values(geometry.attributes).some(a => a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute)) return false
    if (geometry.attributes.position.itemSize !== 3 || geometry.attributes.position.normalized) return false
    if (geometry.attributes.normal && (geometry.attributes.normal.itemSize !== 3 || geometry.attributes.normal.normalized)) return false
    if (geometry.attributes.tangent) return false
    return geometryBytes(geometry) > 0 && geometryBytes(geometry) < this.smallBytes
  }

  flush (final = false) {
    if (this.suspended || this.#document.disposed || !this.#document.three?.middleground || !this.#pending.size) return
    const groups = new Map(), materials = new Map()
    const signature = material => {
      if (!materials.has(material)) materials.set(material, materialKey(material))
      return materials.get(material)
    }
    for (const object of this.#pending) {
      if (this.#bySource.has(object) || !this.#candidate(object)) continue
      const parent = batchParent(object, this.#document.three.middleground)
      object.updateWorldMatrix(true, false)
      parent.updateWorldMatrix(true, false)
      const matrix = new THREE.Matrix4().getInverse(parent.matrixWorld).multiply(object.matrixWorld)
      // Negative transforms flip winding. Keep mirrored geometry independent.
      if (matrix.determinant() <= 0) continue
      const type = object.isMesh ? 'mesh' : 'line-segments'
      const edgeLines = flagged(object, 'edgeLines'), sharpEdge = flagged(object, 'sharpEdge')
      const key = JSON.stringify([parent.uuid, type, !!object.geometry.index, layoutKey(object.geometry), signature(object.material), signature(object.userData.displayMaterials?.render), signature(object.userData.displayMaterials?.shading), object.fullLayerPath, edgeLines, sharpEdge, object.renderOrder, object.layers.mask, object.castShadow, object.receiveShadow])
      let group = groups.get(key)
      if (!group) {
        group = { key, parent, type, edgeLines, sharpEdge, material: object.material, items: [], bytes: 0 }
        groups.set(key, group)
      }
      const bytes = geometryBytes(object.geometry)
      group.items.push({ object, bytes, matrix })
      group.bytes += bytes
    }
    this.#pending.clear()
    const tails = new Map()
    if (final) for (const batch of this.#batches) tails.set(batch.key, batch)
    groups.forEach(group => {
      let items = [], bytes = 0, last = null
      for (const item of group.items) {
        items.push(item); bytes += item.bytes
        if (bytes >= this.batchBytes && items.length > 1) {
          last = this.createBatch(group, items)
          items = []; bytes = 0
        }
      }
      // Only fold a short tail into the final batch at the end of a stream.
      // Sealed batches otherwise survive subsequent appends unchanged.
      if (final && items.length) {
        last ||= tails.get(group.key)
        if (last) {
          const joined = last.items.concat(items)
          this.#dissolve(last, false)
          this.createBatch(group, joined)
          items = []
        }
      }
      items.forEach(item => this.#pending.add(item.object))
    })
  }

  createBatch (group, items) {
    const geometry = new THREE.BufferGeometry(), ranges = []
    const first = items[0].object.geometry
    const vertexCount = items.reduce((sum, item) => sum + item.object.geometry.attributes.position.count, 0)
    const indexCount = items.reduce((sum, item) => sum + (item.object.geometry.index?.count || 0), 0)
    const point = new THREE.Vector3(), normalMatrix = new THREE.Matrix3()
    try {
      // Allocate each destination only once; no cloned intermediate buffers.
      for (const name of Object.keys(first.attributes)) {
        const attribute = first.attributes[name]
        geometry.setAttribute(name, new THREE.BufferAttribute(new attribute.array.constructor(vertexCount * attribute.itemSize), attribute.itemSize, attribute.normalized))
      }
      if (first.index) geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indexCount), 1))
      let firstVertex = 0, firstIndex = 0
      for (const item of items) {
        const source = item.object.geometry, count = source.attributes.position.count
        normalMatrix.getNormalMatrix(item.matrix)
        for (const name of Object.keys(first.attributes)) {
          const from = source.attributes[name], to = geometry.attributes[name]
          if (name === 'position' || name === 'normal') {
            for (let i = 0; i < count; i++) {
              point.fromBufferAttribute(from, i)
              if (name === 'normal') point.applyMatrix3(normalMatrix).normalize()
              else point.applyMatrix4(item.matrix)
              to.setXYZ(firstVertex + i, point.x, point.y, point.z)
            }
          } else to.array.set(from.array, firstVertex * from.itemSize)
        }
        if (source.index) for (let i = 0; i < source.index.count; i++) geometry.index.array[firstIndex + i] = source.index.getX(i) + firstVertex
        const countIndices = source.index?.count || count
        ranges.push({ object: item.object, firstVertex, vertexCount: count, firstIndex, indexCount: countIndices })
        firstVertex += count; firstIndex += countIndices
      }
      geometry.computeBoundingBox()
      geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new THREE.Sphere())
      const object = group.type === 'mesh' ? new THREE.Mesh(geometry, group.material) : new THREE.LineSegments(geometry, group.material)
      const source = items[0].object
      object.name = `Render batch (${items.length} objects)`
      object.renderOrder = source.renderOrder
      object.layers.mask = source.layers.mask
      object.castShadow = source.castShadow; object.receiveShadow = source.receiveShadow
      // Never put Object3D references in serializable document metadata.
      object.userData = { renderBatch: true, renderBatchType: group.type, renderBatchSources: items.length, renderBatchBytes: items.reduce((sum, item) => sum + item.bytes, 0) }
      if (group.edgeLines) Object.assign(object.userData, { edgeLines: true, sharpEdge: group.sharpEdge })
      object.fullLayerPath = source.fullLayerPath
      object.userData.displayMaterials = source.userData.displayMaterials
      const batch = { key: group.key, object, geometry, ranges, items, sourceObjects: new Set(items.map(item => item.object)) }
      const raycast = object.raycast
      object.raycast = (raycaster, hits) => {
        const mergedHits = []
        raycast.call(object, raycaster, mergedHits)
        for (const hit of mergedHits) {
          const resolved = this.resolveHit(hit)
          if (resolved && visible(resolved.object)) hits.push(resolved)
        }
      }
      group.parent.add(object)
      this.#batches.add(batch)
      this.#byRenderObject.set(object, batch)
      items.forEach(({ object: source, matrix }) => {
        this.#bySource.set(source, { batch, raycast: source.raycast, geometry: source.geometry, material: source.material, parent: source.parent, matrix, positionVersion: source.geometry.attributes.position.version, indexVersion: source.geometry.index?.version })
        source.raycast = () => {}
      })
      return batch
    } catch (error) { geometry.dispose(); throw error }
  }

  materialize (object) {
    if (!object || !within(object, this.#document.three.middleground)) return false
    // The caller passes the actual transform target, so an individual object
    // edit does not dissolve every batch of its containing block.
    this.#editing.add(object)
    this.invalidate(object)
    this.flush()
    return true
  }

  restore () {
    if (!this.#editing.size) return false
    this.#editing.forEach(root => this.queue(root))
    this.#editing.clear()
    this.flush(true)
    return true
  }

  prepareRender (revision) {
    // Visibility/deletion can also change through the tree or undo. Rebuild
    // only affected batches and leave untouched buffers mounted.
    if (revision == null || revision !== this.#checkedRevision) {
      const dirty = new Set()
      this.#document.three?.middleground?.updateMatrixWorld(true)
      const expected = new THREE.Matrix4()
      this.#bySource.forEach((state, source) => {
        expected.multiplyMatrices(state.batch.object.parent.matrixWorld, state.matrix)
        const moved = expected.elements.some((value, index) => Math.abs(value - source.matrixWorld.elements[index]) > 1e-9)
        if (moved || !visible(source) || !within(source, this.#document.three.middleground) || source.geometry !== state.geometry || source.material !== state.material || source.parent !== state.parent || source.geometry.attributes.position?.version !== state.positionVersion || source.geometry.index?.version !== state.indexVersion) dirty.add(state.batch)
      })
      dirty.forEach(batch => this.#dissolve(batch))
      this.flush()
      this.#checkedRevision = revision
    }
    this.#bySource.forEach((state, source) => {
      if (!source.visible) return
      this.#renderHidden.push(source)
      source.visible = false
    })
  }

  finishRender () {
    this.#renderHidden.forEach(source => { source.visible = true })
    this.#renderHidden.length = 0
  }

  resolveHit (hit) {
    const batch = this.#byRenderObject.get(hit?.object)
    if (!batch) return null
    const isMesh = batch.object.isMesh
    const offset = isMesh ? hit.faceIndex * 3 : hit.index
    const range = batch.ranges.find(range => offset >= range.firstIndex && offset < range.firstIndex + range.indexCount)
    if (!range) return null
    const result = { ...hit, object: range.object }
    if (isMesh) {
      result.faceIndex = Math.floor((offset - range.firstIndex) / 3)
      if (hit.face) {
        result.face = { ...hit.face, a: hit.face.a - range.firstVertex, b: hit.face.b - range.firstVertex, c: hit.face.c - range.firstVertex }
        const item = batch.items[batch.ranges.indexOf(range)]
        // Raycaster normals are geometry-local. Convert the merged normal
        // back to source-local before consumers apply the source world matrix.
        result.face.normal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(item.matrix).transpose()).normalize()
      }
    } else result.index = offset - range.firstIndex
    return result
  }
}
