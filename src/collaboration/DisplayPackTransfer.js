import { TARGET_BYTES, MAX_ITEMS, encodeDisplayPack, decodeDisplayPack } from '../../public/shared/DisplayPack'
import { sceneRequest, retryableSceneError } from './SceneRequest'

// Group only within a document and visibility class. Decoded attribute arrays
// can retain the shared pack buffer; no per-object byte copy is necessary.
export function groupDisplayDownloads (objects, canBatch) {
  const groups = [], current = new Map()
  for (const object of objects) {
    if (!canBatch(object) || object.displayBytes > TARGET_BYTES) { groups.push([object]); continue }
    const key = object.privateDocumentId + ':' + (object.visible !== false)
    let group = current.get(key)
    const size = object.displayBytes || 16 * 1024
    if (!group || group.length >= MAX_ITEMS || group.bytes + size > TARGET_BYTES) {
      group = []; group.bytes = 0; group.packed = true; current.set(key, group); groups.push(group)
    }
    group.push(object); group.bytes += size
  }
  return groups
}

export async function readDisplayGroup (objects, signal, requests) {
  const ids = [...new Set(objects.map(object => object.assetId))]
  let buffer
  for (let attempt = 0; ; attempt++) {
    try {
      // This POST is a read-only batch lookup, safe to repeat after a gateway failure.
      buffer = await sceneRequest('/api/collaboration/assets/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assetIds: ids }), signal }, { requests, binary: true })
      break
    } catch (error) {
      if (attempt || signal?.aborted || !retryableSceneError(error)) throw error
    }
  }
  const entries = new Map(decodeDisplayPack(buffer).map(entry => [entry.assetId, entry]))
  if (entries.size !== ids.length || ids.some(id => !entries.has(id))) throw new Error('Incomplete shared display batch.')
  return entries
}

export { TARGET_BYTES, MAX_ITEMS, encodeDisplayPack }
