// A generation owns every allocation, including loader placeholders. Cancellation
// settles apply immediately; callbacks arriving later can only release resources.
export default class RenderResourceScope {
  constructor () {
    this.closed = false
    this.resources = new Set()
    this.released = new WeakSet()
    this.cancel = new Set()
  }

  own (resource) {
    if (!resource || this.released.has(resource)) return resource
    this.resources.add(resource)
    if (this.closed) this.release(resource)
    return resource
  }

  release (resource) {
    if (!resource || this.released.has(resource)) return
    this.released.add(resource)
    this.resources.delete(resource)
    resource.dispose()
  }

  dispose () {
    if (this.closed) return
    this.closed = true
    for (const cancel of this.cancel) cancel()
    this.cancel.clear()
    for (const resource of this.resources) this.release(resource)
  }

  load (loader, source) {
    return new Promise((resolve, reject) => {
      if (this.closed) { reject(new Error('Render generation cancelled')); return }
      if (source?.kind === 'render.texture') source = source.url
      let url = source
      let revoke = () => {}
      if (typeof Blob !== 'undefined' && source instanceof Blob) {
        url = URL.createObjectURL(source)
        let revoked = false
        revoke = () => {
          if (!revoked) URL.revokeObjectURL(url)
          revoked = true
        }
      }
      if (typeof url !== 'string' || !url.trim()) {
        reject(new Error('A texture source must be a URL, data URL, blob URL, or Blob'))
        return
      }
      const cancel = () => { revoke(); reject(new Error('Render generation cancelled')) }
      this.cancel.add(cancel)
      const finish = () => { revoke(); this.cancel.delete(cancel) }
      try {
        const pending = loader.load(url, texture => {
          this.own(texture)
          finish()
          if (!this.closed) resolve(texture)
        }, undefined, error => {
          finish()
          reject(error instanceof Error ? error : new Error(`Failed to load texture: ${url.slice(0, 120)}`))
        })
        this.own(pending)
      } catch (error) {
        finish()
        reject(error)
      }
    })
  }
}
