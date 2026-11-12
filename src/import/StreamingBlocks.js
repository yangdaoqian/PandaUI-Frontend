import * as THREE from 'three'
import ImportWorkBudget from './ImportWorkBudget'

// File3dm definition geometry is not a scene object. Mount it only below an
// actual instance transform, even when the definition arrives much later.
export default class StreamingBlocks {
  definitions = new Map()
  objects = new Map()
  waiting = new Map()
  roots = new Map()
  tasks = []
  indexed = false
  disposed = false
  errors = 0

  constructor ({ definitions, onRoot, onPart, onChange, budget = new ImportWorkBudget() }) {
    definitions.forEach(definition => this.definitions.set(definition.id, definition.objects))
    this.onRoot = onRoot
    this.onPart = onPart
    this.onChange = onChange
    this.budget = budget
  }

  get pendingObjects () { return this.waiting.size }
  needsGeometry (id) { return !this.indexed || this.waiting.has(id) }

  addReference (reference) {
    if (this.objects.has(reference.id)) return
    this.deliver(reference.id, { reference })
    if (!reference.definition) {
      const group = new THREE.Group()
      group.name = reference.name || 'Block instance'
      group.userData.importedBlockInstance = true
      this.roots.set(reference.id, group)
      this.onRoot(group, reference)
      this.tasks.push({ target: { group, path: new Set(), key: reference.id, root: reference }, object: { reference } })
    }
  }

  addGeometry (id, roots) { this.deliver(id, { roots }) }

  deliver (id, object) {
    this.objects.set(id, object)
    const targets = this.waiting.get(id) || []
    this.waiting.delete(id)
    targets.forEach(target => this.tasks.push({ target, object }))
  }

  * mount ({ target, object }) {
    const { group, path, key, root } = target
    if (object.reference) {
      const reference = object.reference
      const children = this.definitions.get(reference.definitionId)
      if (!children || path.has(reference.definitionId)) { this.errors++; return }
      const nextPath = new Set(path).add(reference.definitionId)
      group.matrix.fromArray(reference.matrix)
      group.matrix.decompose(group.position, group.quaternion, group.scale)
      group.matrixAutoUpdate = false
      group.visible &&= reference.visible !== false
      if (reference.visible === false) group.userData.pandauiHidden = true
      for (let index = 0; index < children.length; index++) {
        const id = children[index]
        const child = new THREE.Group()
        group.add(child)
        const placement = { group: child, path: nextPath, key: key + ':' + index, root }
        const known = this.objects.get(id)
        if (known) this.tasks.push({ target: placement, object: known })
        else {
          if (!this.waiting.has(id)) this.waiting.set(id, [])
          this.waiting.get(id).push(placement)
        }
        yield
      }
    } else {
      for (let index = 0; index < object.roots.length; index++) {
        yield * this.mountDisplay(object.roots[index], group, root, key + ':' + index)
      }
    }
  }

  * mountDisplay (source, parent, root, key) {
    // Clone one node at a time. A Mesh.copy in Three r120 ignores recursive=false;
    // the view also prevents JSON serializing the shared materials in userData.
    // The source/template is never modified, even while a frame is rendering it.
    const view = Object.create(source)
    view.userData = {}
    view.children = []
    const copy = view.clone(false)
    copy.userData = { ...source.userData }
    if (source.boundingBox) copy.boundingBox = source.boundingBox.clone()
    parent.add(copy)
    this.onPart(copy, root, key)
    yield
    for (let index = 0; index < source.children.length; index++) {
      yield * this.mountDisplay(source.children[index], copy, root, key + ':' + index)
    }
  }

  async drain () {
    let index = 0
    try {
      while (index < this.tasks.length) {
        if (this.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
        for (const step of this.mount(this.tasks[index++])) {
          void step
          if (this.budget.expired) {
            this.onChange?.()
            await this.budget.yield()
          }
          if (this.disposed) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
        }
      }
    } finally { this.tasks.splice(0, index) }
  }

  // Geometry/material buffers are owned by PandaUIDoc; these are only indexes
  // and templates. Rendered clones keep their shared buffers after cleanup.
  dispose () {
    this.disposed = true
    this.definitions.clear(); this.objects.clear(); this.waiting.clear(); this.roots.clear(); this.tasks = []
  }
}
