import { LoadingManager, Texture } from 'three'
import { sceneFileAbortError } from './SceneFileRecords'

// A failed local image deliberately fails decoding too: no colored placeholder
// should accidentally become a normal, metallic, or base-color map.
const missingImage = 'data:image/png;base64,'
const textureTimeout = 15000

function normalize (value) {
  let text = String(value).replace(/\\/g, '/')
  try { text = decodeURIComponent(text) } catch (_) { /* Literal filenames may contain %. */ }
  const parts = []
  for (const part of text.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

export function createSceneFileResources (file, files = [], warnings = []) {
  const manager = new LoadingManager(), urls = new Map(), ownedUrls = new Set()
  const entries = [...new Set([file, ...Array.from(files || [])])].map(value => ({ file: value, path: normalize(value.webkitRelativePath || value.relativePath || value.name) }))
  const mainPath = normalize(file.webkitRelativePath || file.relativePath || file.name)
  const directory = mainPath.includes('/') ? mainPath.slice(0, mainPath.lastIndexOf('/') + 1) : ''
  const warn = message => { if (!warnings.includes(message)) warnings.push(message) }
  const find = uri => {
    if (/^(data:|blob:)/i.test(uri)) return null
    const clean = String(uri).split(/[?#]/)[0]
    const relative = normalize(clean), absolute = normalize(directory + clean)
    let candidates = entries.filter(entry => entry.path === absolute)
    if (!candidates.length) candidates = entries.filter(entry => entry.path === relative)
    if (!candidates.length) candidates = entries.filter(entry => entry.path.endsWith('/' + relative))
    if (!candidates.length) candidates = entries.filter(entry => entry.path.split('/').pop() === relative.split('/').pop())
    if (!candidates.length) throw new Error(`Missing selected resource: ${uri}. Select the model and its sidecar files together.`)
    if (candidates.length !== 1) throw new Error(`Ambiguous selected resource: ${uri}. Select files with their relative folder paths.`)
    return candidates[0].file
  }
  const resolve = uri => {
    if (/^data:/i.test(uri)) return uri
    if (/^blob:/i.test(uri)) { ownedUrls.add(uri); return uri }
    const selected = find(uri)
    if (!urls.has(selected)) { const url = URL.createObjectURL(selected); urls.set(selected, url); ownedUrls.add(url) }
    return urls.get(selected)
  }
  // Geometry buffers are checked by prepareGLTF before parsing. Remaining
  // optional images may fail, but must never fall through to network loading.
  manager.setURLModifier(uri => {
    try { return resolve(uri) } catch (error) { warn(error.message); return missingImage }
  })
  manager.onError = uri => warn(`Resource could not be decoded: ${uri.startsWith('data:') ? '(embedded image)' : uri}`)
  let pending = 0
  const waiters = []
  const itemStart = manager.itemStart.bind(manager), itemEnd = manager.itemEnd.bind(manager)
  manager.itemStart = uri => { pending++; itemStart(uri) }
  manager.itemEnd = uri => { itemEnd(uri); pending--; if (!pending) waiters.splice(0).forEach(resolve => resolve()) }
  const cancellations = new Set()
  // glTF rejects its entire scene when the standard image loader fails. This
  // local DOM loader completes optional images with an empty texture instead,
  // and bounds decoding time even for malformed embedded images.
  const textureLoader = {
    load (uri, onLoad) {
      const texture = new Texture(), image = document.createElement('img')
      const url = manager.resolveURL(uri)
      let done = false
      const finish = success => {
        if (done) return
        done = true
        clearTimeout(timer)
        image.onload = image.onerror = null
        cancellations.delete(cancel)
        if (success) { texture.image = image; texture.needsUpdate = true } else {
          warn(`Optional texture could not be decoded: ${uri.startsWith('data:') || uri.startsWith('blob:') ? '(embedded image)' : uri}; using material values.`)
          image.removeAttribute('src')
        }
        try { onLoad?.(texture) } finally { manager.itemEnd(url) }
      }
      const cancel = () => finish(false)
      const timer = setTimeout(cancel, textureTimeout)
      cancellations.add(cancel)
      image.onload = () => finish(true)
      image.onerror = cancel
      manager.itemStart(url)
      image.src = url
      return texture
    }
  }
  return {
    manager,
    textureLoader,
    find,
    resolve,
    wait: () => pending ? new Promise(resolve => {
      const complete = () => { clearTimeout(timer); resolve() }
      const timer = setTimeout(() => {
        warn('Optional texture decoding timed out; unavailable textures use material values.')
        const index = waiters.indexOf(complete)
        if (index !== -1) waiters.splice(index, 1)
        resolve()
      }, textureTimeout)
      waiters.push(complete)
    }) : Promise.resolve(),
    dispose: () => { cancellations.forEach(cancel => cancel()); ownedUrls.forEach(url => URL.revokeObjectURL(url)); ownedUrls.clear(); urls.clear() }
  }
}

export function withSceneFileAbort (promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(sceneFileAbortError())
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(sceneFileAbortError()) }
    signal.addEventListener('abort', abort, { once: true })
    promise.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}
