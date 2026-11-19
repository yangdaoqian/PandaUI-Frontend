import { LibreDwg } from '@mlightcad/libredwg-web'

let runtimePromise = null

function runtimePath () {
  // The wrapper is bundled with the worker. The large WASM binary stays a
  // separately replaceable public asset so it can be cached and licensed on
  // its own.
  const origin = typeof self !== 'undefined' && self.location?.origin
    ? self.location.origin
    : typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/shared/libredwg`
}

async function runtime () {
  if (!runtimePromise) runtimePromise = LibreDwg.create(runtimePath())
  try {
    return await runtimePromise
  } catch (error) {
    runtimePromise = null
    throw new Error(`DWG frontend runtime could not be loaded: ${error?.message || error}`)
  }
}

function exactArrayBuffer (bytes) {
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : bytes.slice().buffer
}

/**
 * Convert a DWG to the ASCII DXF representation used by DxfImport.
 *
 * Keeping this boundary small is deliberate: LibreDWG owns the DWG binary
 * decoding, while DxfImport owns PandaUI's display records and interaction
 * metadata. The source DWG is never written to disk or sent to the backend.
 */
export async function convertDwgToAsciiDxf (bytes) {
  const libredwg = await runtime()
  const content = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (!content.length) throw new Error('DWG input is empty.')
  const dxf = libredwg.dwg_write_dxf(exactArrayBuffer(content))
  if (!dxf?.byteLength) throw new Error('LibreDWG could not convert this DWG to DXF.')
  return new TextDecoder('utf-8').decode(dxf)
}

export function resetLibredwgRuntime () {
  // Used by tests and by a failed worker recovery. The worker itself is
  // terminated on cancellation, so this is not part of the normal hot path.
  runtimePromise = null
}
