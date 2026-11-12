import * as THREE from 'three'
import SceneUtilities from '../SceneUtilities'
import { decodeDisplayRecord } from '../import/DisplayRecord'
import { meshQualityOptions } from '../import/MeshQuality'
import releaseTable from '../import/releaseTable'

const abortError = () => Object.assign(new Error('Control point geometry operation cancelled.'), { name: 'AbortError' })
const fail = (code, message) => { throw Object.assign(new Error(message), { code }) }
const copyArchive = geometry => {
  if (!geometry || typeof geometry.data !== 'string' || !geometry.data.length) fail('INVALID_GEOMETRY', 'An encoded geometry archive is required.')
  return { ...geometry }
}
const sameArchive = (a, b) => a?.data === b?.data && a?.version === b?.version && a?.archive3dm === b?.archive3dm && a?.opennurbs === b?.opennurbs

/**
 * Geometry stays in the original definition coordinate system. The placement
 * root (and every parent instance transform) stays in place during replacement.
 * History stores {documentId, objectId, geometry, attributes}; attributes are
 * JSON-safe nodecEncodeAttributes bytes. Undo MUST prepare/apply that archive,
 * not merely swap the old display buffers.
 */
export default class ControlPointGeometrySource {
  constructor ({ getModule, createWorker = () => new Worker(new URL('./ControlPointSource.worker.js', import.meta.url)), sceneUtilities = SceneUtilities } = {}) {
    this.getModule = getModule
    this.createWorker = createWorker
    this.sceneUtilities = sceneUtilities
    this.documents = new WeakMap()
    this.pending = new Set()
    this.prepared = new Set()
    this.sequence = 0
    this.disposed = false
  }

  check (doc, signal) {
    if (this.disposed || doc?.disposed || signal?.aborted) throw abortError()
  }

  root (doc, selected) {
    let root = selected
    if (typeof selected === 'string') {
      root = null
      doc.three?.middleground?.traverse(part => { if (part.userData?.pandauiObjectId === selected && part.userData?.importedModelObject) root = part })
    } else {
      while (root && !root.userData?.importedModelObject) root = root.parent
    }
    if (!root?.userData?.pandauiObjectId || !root.userData.sourceGeometryId) fail('INVALID_PLACEMENT', 'Select an imported curve or surface placement.')
    for (let ancestor = root; ancestor; ancestor = ancestor.parent) if (ancestor === doc.three?.middleground) return root
    fail('STALE_PLACEMENT', 'The selected geometry is no longer in this document.')
  }

  request (operation, payload, { signal } = {}) {
    this.check(null, signal)
    return new Promise((resolve, reject) => {
      const worker = this.createWorker(), id = ++this.sequence
      let finished = false
      const finish = (error, result) => {
        if (finished) return
        finished = true
        signal?.removeEventListener('abort', cancel)
        this.pending.delete(cancel)
        worker.onmessage = worker.onerror = worker.onmessageerror = null
        worker.terminate()
        if (error) reject(error)
        else resolve(result)
      }
      const cancel = () => finish(abortError())
      this.pending.add(cancel)
      signal?.addEventListener('abort', cancel, { once: true })
      worker.onmessage = ({ data }) => {
        if (data.id !== id) return
        const error = data.error
        finish(error ? Object.assign(new Error(error.message || String(error)), { name: error.name || 'Error', code: error.code }) : null, data.result)
      }
      worker.onerror = event => finish(new Error(event.message || 'The geometry worker stopped.'))
      worker.onmessageerror = () => finish(new Error('Unable to receive geometry from the worker.'))
      if (signal?.aborted) { cancel(); return }
      // Do not transfer archives/input buffers: callers and history retain them.
      try { worker.postMessage({ id, operation, payload }) } catch (error) { finish(error) }
    })
  }

  async read (doc, selected, { signal } = {}) {
    this.check(doc, signal)
    const root = this.root(doc, selected), objectId = root.userData.pandauiObjectId
    const sourceGeometryId = root.userData.sourceGeometryId
    const edit = doc.geometryEdits?.get(objectId)
    let cache = this.documents.get(doc)
    if (!cache) { cache = { originals: new Map(), header: null }; this.documents.set(doc, cache) }
    let original = cache.originals.get(sourceGeometryId)
    if (!original && (!edit || !cache.header)) {
      const module = await this.getModule()
      this.check(doc, signal)
      let table, object, geometry, attributes
      try {
        const archive = doc.subdSources?.get(sourceGeometryId)
        if (archive && (doc.subdSourceHeader || doc.rhinoDoc)) {
          // SubD cages are compact and retained once per definition. Avoid a
          // complete multi-GB file scan for every display toggle or CV edit.
          original = { geometry: archive.geometry, attributes: archive.attributes, header: doc.subdSourceHeader || module.nodecDocumentHeader(doc.rhinoDoc) }
        }
        if (!original && doc.rhinoDoc) {
          table = doc.rhinoDoc.objects(); object = table.findId(sourceGeometryId)
          if (object) {
            geometry = object.geometry(); attributes = object.attributes()
            if (geometry && attributes) {
              original = {
                geometry: geometry.encode(),
                attributes: Array.from(module.nodecEncodeAttributes(attributes)),
                displayAttributes: { id: attributes.id, name: attributes.name, layerIndex: attributes.layerIndex, materialIndex: attributes.materialIndex, visible: attributes.visible },
                header: module.nodecDocumentHeader(doc.rhinoDoc)
              }
            }
          }
        }
      } finally { attributes?.delete(); geometry?.delete(); object?.delete(); releaseTable(table) }
      if (!original) original = await this.request('source.load', { file: doc.sourceFile, sourceGeometryId }, { signal })
      this.check(doc, signal)
      this.root(doc, root)
      cache.header = original.header
      delete original.header
      cache.originals.set(sourceGeometryId, original)
    }
    // Re-read the map after await: another edit may have committed while loading.
    const current = doc.geometryEdits?.get(objectId) || original || edit
    return { documentId: doc.documentId, objectId, sourceGeometryId, geometry: copyArchive(current.geometry), attributes: Array.from(current.attributes), displayAttributes: original?.displayAttributes }
  }

  async prepare (doc, selected, state, { signal, quality = doc.meshPrecision, subdDisplayMode } = {}) {
    this.check(doc, signal)
    const root = this.root(doc, selected), objectId = root.userData.pandauiObjectId
    if (state.documentId != null && state.documentId !== doc.documentId) fail('INVALID_DOCUMENT', 'Geometry history belongs to another document.')
    if (state.objectId != null && state.objectId !== objectId) fail('INVALID_PLACEMENT', 'Geometry history belongs to another placement.')
    const geometry = copyArchive(state.geometry)
    const previous = doc.geometryEdits?.get(objectId)
    const source = await this.read(doc, root, { signal })
    const attributes = Array.from(state.attributes || source.attributes)
    const preview = await this.request('geometry.preview', { geometry, meshingOptions: { ...meshQualityOptions(quality), subdDisplayMode: subdDisplayMode || root.userData.subdDisplayMode || 'smooth' } }, { signal })
    this.check(doc, signal)
    this.root(doc, root)
    const module = await this.getModule()
    this.check(doc, signal)
    const resources = []
    let metadata, decoded, pairs
    try {
      metadata = module.File3dm.fromByteArray(this.documents.get(doc).header)
      if (!metadata) fail('INVALID_SOURCE_FILE', 'Unable to decode model display metadata.')
      decoded = decodeDisplayRecord(module, { ...preview, attributes: Uint8Array.from(attributes) })
      pairs = this.sceneUtilities.createThreeGeometryOnLayer([[decoded.geometry, decoded.attributes, preview.brepPreview, preview.edgePreview]], metadata, resources, true)
      if (!pairs.length || pairs.some(([part]) => !part.isObject3D)) fail('PREVIEW_FAILED', 'The edited geometry has no usable display.')
      // Include alternate appearance resources created during conversion.
      pairs.forEach(([part]) => part.traverse(child => {
        const materials = child.userData?.displayMaterials
        if (materials) resources.push(materials.shading, materials.render)
      }))
      this.check(doc, signal)
      const prepared = {
        doc,
        root,
        objectId,
        previous,
        geometry,
        attributes,
        signal,
        bounds: new THREE.Box3(new THREE.Vector3(...preview.min), new THREE.Vector3(...preview.max)),
        parts: pairs.map(([part]) => part),
        resources,
        disposed: false,
        applied: false,
        dispose: () => {
          if (prepared.disposed || prepared.applied) return
          prepared.disposed = true
          this.prepared.delete(prepared)
          for (const resource of new Set(resources)) resource?.dispose()
        }
      }
      this.prepared.add(prepared)
      return prepared
    } catch (error) {
      for (const resource of new Set(resources)) resource?.dispose()
      throw error
    } finally {
      pairs?.forEach(([, bounds]) => bounds?.delete())
      decoded?.geometry.delete(); decoded?.attributes.delete(); metadata?.delete()
    }
  }

  apply (doc, selected, state, prepared, { displayOnly = false } = {}) {
    this.check(doc, prepared?.signal)
    const root = this.root(doc, selected), objectId = root.userData.pandauiObjectId
    if (!this.prepared.has(prepared) || prepared.disposed || prepared.applied || prepared.doc !== doc || prepared.root !== root || prepared.objectId !== objectId || !sameArchive(state.geometry, prepared.geometry)) fail('INVALID_PREPARED_GEOMETRY', 'The prepared geometry does not match this edit.')
    if ((state.documentId != null && state.documentId !== doc.documentId) || (state.objectId != null && state.objectId !== objectId)) fail('INVALID_PLACEMENT', 'Geometry history belongs to another placement.')
    if (doc.geometryEdits?.get(objectId) !== prepared.previous) fail('STALE_GEOMETRY', 'The geometry changed while its display was being prepared.')
    const entry = { documentId: doc.documentId, objectId, sourceGeometryId: root.userData.sourceGeometryId, geometry: copyArchive(prepared.geometry), attributes: prepared.attributes.slice() }
    // replaceBrepDisplay mutates only the children of this exact root, retaining
    // layer/material overrides and all placement matrices. Never replace by the
    // sourceGeometryId: other block instances still refer to the original.
    const replaced = doc.replaceBrepDisplay([root], prepared.parts, prepared.resources)
    if (!replaced) fail('STALE_PLACEMENT', 'The selected geometry could not be replaced.')
    // Imported roots can carry cached definition-local bounds. Keeping their
    // old box makes selection/zoom include geometry that an edit removed.
    if (root.boundingBox) root.boundingBox.copy(prepared.bounds)
    else root.boundingBox = prepared.bounds.clone()
    if (!displayOnly) {
      if (!doc.geometryEdits) doc.geometryEdits = new Map()
      doc.geometryEdits.set(objectId, entry)
      doc.meshPrecision = null
    }
    prepared.applied = true
    this.prepared.delete(prepared)
    return entry
  }

  async remeshEdits (doc, { signal, quality, beforeReplace, afterReplace, onProgress, header, check } = {}) {
    let updated = 0
    const failures = []
    if (header) {
      let cache = this.documents.get(doc)
      if (!cache) { cache = { originals: new Map() }; this.documents.set(doc, cache) }
      cache.header = header
    }
    const roots = new Map()
    doc.three?.middleground?.traverse(root => { if (root.userData?.importedModelObject) roots.set(root.userData.pandauiObjectId, root) })
    for (const [id, state] of doc.geometryEdits || []) {
      this.check(doc, signal)
      check?.()
      const root = roots.get(id)
      if (!root) continue
      let prepared
      try {
        prepared = await this.prepare(doc, root, state, { signal, quality })
        check?.()
        if (doc.geometryEdits.get(id) !== state) continue
        beforeReplace?.([root])
        try { this.apply(doc, root, state, prepared); updated++ } finally { afterReplace?.([root]) }
        onProgress?.({ updated })
      } catch (error) {
        if (error.name === 'AbortError') throw error
        failures.push({ objectId: id, message: error.message })
      } finally { prepared?.dispose() }
    }
    return { updated, failures }
  }

  dispose () {
    this.disposed = true
    for (const cancel of [...this.pending]) cancel()
    for (const prepared of [...this.prepared]) prepared.dispose()
    this.documents = new WeakMap()
  }
}

export { ControlPointGeometrySource }
