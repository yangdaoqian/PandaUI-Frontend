import * as THREE from 'three'

const identity = () => new THREE.Matrix4().toArray()
const abortError = () => Object.assign(new Error('Geometry publication cancelled.'), { name: 'AbortError' })
const sourceId = part => part.userData?.sourceGeometryId || /:object:([0-9a-f-]{36})(?::|$)/i.exec(part.userData?.pandauiObjectId || '')?.[1]
export function meshPacket (geometry) {
  // Parametric Three primitives serialize constructor arguments rather than
  // buffers; the native bridge requires the actual current vertex attributes.
  const view = new THREE.BufferGeometry()
  view.index = geometry.index
  view.attributes = geometry.attributes
  view.groups = geometry.groups
  view.drawRange = geometry.drawRange
  return view.toJSON()
}

export default class FrontendGeometryPublisher {
  constructor ({ upload, createWorker = () => new Worker(new URL('./FrontendGeometryExport.worker.js', import.meta.url)) }) {
    this.upload = upload
    this.createWorker = createWorker
  }

  worker (message, consume, signal) {
    if (signal?.aborted) return Promise.reject(abortError())
    return new Promise((resolve, reject) => {
      const worker = this.createWorker()
      let finished = false
      const finish = error => {
        if (finished) return
        finished = true; signal?.removeEventListener('abort', cancel); worker.terminate()
        if (error) reject(error)
        else resolve()
      }
      const cancel = () => finish(abortError())
      signal?.addEventListener('abort', cancel, { once: true })
      worker.onerror = event => finish(new Error(event.message || 'Geometry export worker failed.'))
      worker.onmessageerror = () => finish(new Error('Could not receive exported geometry.'))
      worker.onmessage = async ({ data }) => {
        if (finished) return
        try {
          if (data.error) throw new Error(data.error)
          if (data.done) { finish(); return }
          await consume(data.archive || { geometry: data.geometry })
          if (finished) return
          if (message.operation === 'scan') worker.postMessage({ operation: 'next' })
          else finish()
        } catch (error) { finish(error) }
      }
      try { worker.postMessage(message) } catch (error) { finish(error) }
    })
  }

  async publish (entries, { signal, progress = () => {} } = {}) {
    const results = new Map(entries.map(entry => [entry.objectId, { objectId: entry.objectId, expectedRevision: entry.revision, archiveIds: [] }]))
    const scans = new Map(), immediate = []
    const check = entry => {
      if (signal?.aborted || entry.doc.disposed || !entry.root.parent) throw abortError()
      if (entry.doc.localImportInProgress || entry.doc.remeshStream) throw new Error('Wait for import / remeshing to finish before publishing.')
    }
    for (const entry of entries) {
      check(entry)
      entry.root.updateWorldMatrix(true, true)
      const inverse = new THREE.Matrix4().getInverse(entry.root.matrixWorld)
      const visit = async part => {
        if (part.userData?.renderBatch || part.userData?.meshFaceEdges || part.userData?.selectionHighlight || part.userData?.nonselectable) return
        const id = sourceId(part)
        const matrix = new THREE.Matrix4().multiplyMatrices(inverse, part.matrixWorld).toArray()
        const edit = entry.doc.geometryEdits?.get(part.userData.pandauiObjectId) || await entry.doc.loadLocalGeometryEdit?.(part.userData.pandauiObjectId)
        if (edit) { immediate.push({ entry, geometry: edit.geometry, sourceGeometryId: id, matrix }); return }
        const imported = id && (entry.doc.importedGeometrySources?.get(id) || await entry.doc.loadLocalGeometry?.(id))
        if (imported) { immediate.push({ entry, geometry: imported.geometry, sourceGeometryId: id, matrix }); return }
        if (id && /\.3dm$/i.test(entry.doc.sourceFile?.name || '')) {
          let scan = scans.get(entry.doc)
          if (!scan) { scan = new Map(); scans.set(entry.doc, scan) }
          const key = id.toLowerCase(), targets = scan.get(key) || []
          targets.push({ entry, matrix }); scan.set(key, targets)
          return
        }
        if (part.geometry && (part.isMesh || part.isLine || part.isPoints)) {
          if (/\.3dm$/i.test(entry.doc.sourceFile?.name || '') && /brep|subd|surface|extrusion/i.test(part.userData.originalType || part.userData.geometryType || '')) throw new Error('Original source ID is missing. Reopen this model before publishing it.')
          immediate.push({ entry, part, matrix })
          return
        }
        for (const child of part.children) await visit(child)
      }
      await visit(entry.root)
    }
    let completed = 0
    const upload = async (entry, geometry, matrix, sourceGeometryId) => {
      check(entry)
      const response = await this.upload(entry, { assetId: entry.assetId, geometryParts: [{ geometry, matrix: matrix || identity(), sourceGeometryId }] }, signal)
      results.get(entry.objectId).archiveIds.push(response.archiveId)
      progress(++completed)
    }
    for (const item of immediate) {
      if (item.geometry) await upload(item.entry, item.geometry, item.matrix, item.sourceGeometryId)
      else {
        item.entry.doc.materializeRenderObject?.(item.part)
        const geometry = item.part.geometry, positions = geometry.attributes.position
        const points = () => Array.from({ length: geometry.index?.count || positions.count }, (_, offset) => {
          const i = geometry.index ? geometry.index.getX(offset) : offset
          return [positions.getX(i), positions.getY(i), positions.getZ(i)]
        })
        if (item.part.isMesh) {
          await this.worker({ operation: 'encode', part: { type: 'Mesh', json: meshPacket(geometry) } }, async value => {
            if (item.part.isInstancedMesh) {
              for (let index = 0; index < item.part.count; index++) {
                const placement = new THREE.Matrix4()
                item.part.getMatrixAt(index, placement)
                await upload(item.entry, value.geometry, new THREE.Matrix4().fromArray(item.matrix).multiply(placement).toArray())
              }
            } else await upload(item.entry, value.geometry, item.matrix)
          }, signal)
        } else {
          const values = points()
          const batches = item.part.isPoints ? values.map(point => [point]) : item.part.isLineSegments ? Array.from({ length: values.length / 2 }, (_, i) => values.slice(i * 2, i * 2 + 2)) : [item.part.isLineLoop ? values.concat([values[0]]) : values]
          for (const batch of batches) await this.worker({ operation: 'encode', part: { type: item.part.isPoints ? 'Points' : 'Line', points: batch } }, value => upload(item.entry, value.geometry, item.matrix), signal)
        }
      }
    }
    for (const [doc, targets] of scans) {
      await this.worker({ operation: 'scan', file: doc.sourceFile, sourceIds: [...targets.keys()] }, async value => {
        for (const target of targets.get(value.sourceGeometryId.toLowerCase())) await upload(target.entry, value.geometry, target.matrix, value.sourceGeometryId)
      }, signal)
    }
    const selections = [...results.values()]
    if (selections.some(item => !item.archiveIds.length)) throw new Error('Some objects have no original geometry available. Publication was not completed.')
    return selections
  }
}
