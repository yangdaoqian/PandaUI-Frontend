export function retryableSceneError (error) {
  return error?.name !== 'AbortError' && (!error.status || [408, 425, 429, 500, 502, 503, 504].includes(error.status))
}

// GET is safe to repeat. Recover short proxy/connection failures here, before
// a large scene finishes its initial object pass. Never repeat a POST here.
export async function downloadSceneAsset (url, options = {}, settings = {}) {
  const { retryDelayMs = 250, ...requestSettings } = settings
  for (let attempt = 0; ; attempt++) {
    try { return await sceneRequest(url, { ...options, method: 'GET' }, { ...requestSettings, binary: true }) } catch (error) {
      if (attempt >= 1 || !retryableSceneError(error) || error.name === 'TimeoutError' || options.signal?.aborted) throw error
      await new Promise((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer)
          options.signal?.removeEventListener('abort', cancel)
          reject(Object.assign(new Error('Display download cancelled.'), { name: 'AbortError' }))
        }
        const timer = setTimeout(() => { options.signal?.removeEventListener('abort', cancel); resolve() }, retryDelayMs)
        options.signal?.addEventListener('abort', cancel, { once: true })
        if (options.signal?.aborted) cancel()
      })
    }
  }
}

// An idle timeout, not a total download limit: large assets may keep streaming
// for as long as data arrives. Include the response body in cancellation.
export async function sceneRequest (url, options = {}, { requests, binary = false, timeoutMs = 60000, headerTimeoutMs = timeoutMs } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  let timer, timedOut = false, reader
  const active = (delay = timeoutMs) => {
    clearTimeout(timer)
    if (delay > 0) timer = setTimeout(() => { timedOut = true; controller.abort() }, delay)
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  if (options.signal?.aborted) controller.abort()
  requests?.add(controller)
  try {
    active(headerTimeoutMs)
    const response = await fetch(url, { ...options, signal: controller.signal })
    active()
    let bytes
    if (response.body?.getReader) {
      reader = response.body.getReader()
      const chunks = []
      let length = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value); length += value.byteLength
        active()
      }
      bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    } else bytes = new Uint8Array(await response.arrayBuffer())
    if (!response.ok) {
      let message, code
      try { const error = JSON.parse(new TextDecoder().decode(bytes)); message = error.error; code = error.code } catch (_) { /* Proxies often return plain text or HTML. */ }
      throw Object.assign(new Error(message || 'Scene service returned HTTP ' + response.status + '. Please check the backend connection.'), { status: response.status, code })
    }
    if (binary) return bytes.buffer
    try { return JSON.parse(new TextDecoder().decode(bytes)) } catch (_) { throw new Error('Scene service returned an incomplete or invalid response.') }
  } catch (error) {
    if (timedOut) throw Object.assign(new Error('Scene transfer stalled. Retrying when the backend is available.'), { name: 'TimeoutError', status: 504 })
    throw error
  } finally {
    clearTimeout(timer)
    reader?.releaseLock()
    options.signal?.removeEventListener('abort', abort)
    requests?.delete(controller)
  }
}
