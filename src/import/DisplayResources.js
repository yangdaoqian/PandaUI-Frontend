import { retainGeometry } from '../DisplayResources'

// Indexed document ownership. Conversion code can keep using push/includes;
// replacing one object's buffers never scans the whole document's resources.
export default class DisplayResources extends Set {
  #objects = new WeakMap()
  #references = new Map()
  #geometryReleases = new Map()

  add (resource) {
    if (resource?.isBufferGeometry && !this.has(resource)) this.#geometryReleases.set(resource, retainGeometry(resource))
    return super.add(resource)
  }

  delete (resource) {
    this.#geometryReleases.get(resource)?.()
    this.#geometryReleases.delete(resource)
    return super.delete(resource)
  }

  push (...resources) { resources.forEach(resource => { if (resource) this.add(resource) }); return this.size }
  includes (resource) { return this.has(resource) }
  filter (predicate) { return Array.from(this).filter(predicate) }

  track (object) {
    const next = new Set([object.geometry, object.material, ...Object.values(object.userData?.displayMaterials || {})].flat().filter(Boolean))
    const previous = this.#objects.get(object) || new Set()
    previous.forEach(resource => { if (!next.has(resource)) this.#decrement(resource) })
    next.forEach(resource => {
      this.add(resource)
      if (!previous.has(resource)) this.#references.set(resource, (this.#references.get(resource) || 0) + 1)
    })
    this.#objects.set(object, next)
  }

  untrack (object) {
    this.#objects.get(object)?.forEach(resource => this.#decrement(resource))
    this.#objects.delete(object)
  }

  #decrement (resource) {
    const count = (this.#references.get(resource) || 0) - 1
    if (count > 0) this.#references.set(resource, count)
    else this.#references.delete(resource)
  }

  releaseGeometry (geometry) {
    if (this.#references.has(geometry)) return false
    this.delete(geometry)
    geometry.dispose()
    return true
  }

  clear () {
    this.#geometryReleases.forEach(release => release())
    this.#geometryReleases.clear()
    super.clear(); this.#objects = new WeakMap(); this.#references.clear()
  }
}
