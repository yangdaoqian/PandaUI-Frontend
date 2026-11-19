import * as THREE from 'three'
import { clearDisplayObjectImport, normalizeImportLayerPath } from './DisplayObjectImport'

// STEP geometry and exact archives are already in source world coordinates.
// These groups carry ONLY user deltas; descriptor transforms are metadata.
export default class StreamingStepInstances {
  instances = new Map()
  displayDocuments = new Map()
  state = 'loading'

  constructor (document) { this.document = document }

  setInstances (descriptors = []) {
    if (this.state !== 'loading') return
    // Validate the parent-first protocol before changing the scene.
    const known = new Set(this.instances.keys())
    for (const descriptor of descriptors) {
      if (typeof descriptor.id !== 'string' || !descriptor.id || descriptor.parentId === descriptor.id ||
        (descriptor.parentId != null && !known.has(descriptor.parentId))) throw new Error('Invalid STEP instance hierarchy.')
      if (descriptor.transform && (descriptor.transform.length !== 16 || !descriptor.transform.every(Number.isFinite))) throw new Error('Invalid STEP instance transform.')
      known.add(descriptor.id)
    }
    for (const descriptor of descriptors) {
      let group = this.instances.get(descriptor.id)
      if (!group) {
        group = new THREE.Group()
        group.name = descriptor.name || 'STEP instance'
        group.visible = descriptor.visible !== false
        group.userData.importedBlockInstance = true
        group.userData.stepInstanceId = descriptor.id
        group.userData.stepInstanceState = 'loading'
        if (!group.visible) group.userData.pandauiHidden = true
        const path = Array.isArray(descriptor.path) ? descriptor.path.join('::') : descriptor.path
        const layerPath = normalizeImportLayerPath(path)
        this.document.tagImportedObject(group, `step-instance:${descriptor.id}`, layerPath, group.name)
        this.instances.set(descriptor.id, group)
        const parent = descriptor.parentId == null ? this.document.three.middleground : this.target(descriptor.parentId)
        if (parent) {
          parent.add(group)
          this.document.configureImportedObject(group, layerPath)
        } else group.userData.stepInstanceState = 'cancelled'
      } else this.target(descriptor.id)
      // Refresh metadata without reparenting, retagging or resetting live edits.
      group.userData.stepInstance = {
        ...descriptor,
        path: Array.isArray(descriptor.path) ? [...descriptor.path] : descriptor.path,
        transform: descriptor.transform ? Array.from(descriptor.transform) : null
      }
    }
  }

  target (id) {
    if (this.state !== 'loading' || this.document.disposed) return null
    const group = this.instances.get(id)
    if (!group) throw new Error(`Unknown STEP instance: ${id}`)
    if (group.userData.stepInstanceState === 'cancelled') return null
    // A deleted parent leaves its children attached to a detached subtree.
    // Never recreate or reattach it when later records/metadata arrive.
    for (let ancestor = group; ancestor; ancestor = ancestor.parent) {
      if (ancestor.userData.stepInstanceState === 'cancelled') break
      if (ancestor === this.document.three.middleground) return group
    }
    group.userData.stepInstanceState = 'cancelled'
    return null
  }

  mount (id, roots) {
    const group = this.target(id)
    if (!group) return false
    for (const root of roots) {
      root.userData.stepInstanceId = id
      group.add(root)
    }
    return true
  }

  // DisplayObjectImport keeps an object/material index per document. Give each
  // occurrence its own scope, routing only its new roots to the instance group.
  // Methods stay bound to the real document (which owns private render state).
  displayDocument (id) {
    if (!this.displayDocuments.has(id)) {
      const document = this.document
      const scope = {
        get disposed () { return document.disposed },
        get layers () { return document.layers },
        get importedGeometrySources () { return document.importedGeometrySources },
        get importedGeometryHeader () { return document.importedGeometryHeader },
        set importedGeometryHeader (value) { document.importedGeometryHeader = value },
        disposableResources: document.disposableResources,
        three: { middleground: { add: root => this.mount(id, [root]) } },
        tagImportedObject: (root, key, ...args) => document.tagImportedObject(root, `step:${id}:${key}`, ...args),
        configureImportedObject: (...args) => document.configureImportedObject(...args),
        countImportedParts: root => document.countImportedParts(root),
        setLayerVisibility: (...args) => document.setLayerVisibility(...args),
        onImportedRoot: root => document.onImportedRoot?.(root)
      }
      this.displayDocuments.set(id, scope)
    }
    return this.displayDocuments.get(id)
  }

  fail ({ instanceId, entity, message }) {
    const group = this.target(instanceId)
    if (!group) return
    group.userData.stepInstanceState = 'failed'
    ;(group.userData.stepInstanceFailures ||= []).push({ entity, message })
  }

  finish ({ failed = false, cancelled = false } = {}) {
    if (this.state !== 'loading') return this.state
    for (const [id, group] of this.instances) {
      this.target(id)
      if (group.userData.stepInstanceState === 'cancelled') continue
      if (cancelled) group.userData.stepInstanceState = 'cancelled'
      else if (failed || group.userData.stepInstanceState === 'failed') group.userData.stepInstanceState = 'failed'
      else group.userData.stepInstanceState = 'complete'
    }
    this.state = cancelled ? 'cancelled' : failed || [...this.instances.values()].some(group => group.userData.stepInstanceState === 'failed') ? 'failed' : 'complete'
    this.displayDocuments.forEach(scope => clearDisplayObjectImport(scope))
    this.displayDocuments.clear()
    this.instances.clear()
    return this.state
  }

  // Scene geometry/resources belong to the document. Release only indexes;
  // the normal document disposal also handles already detached resources.
  dispose () {
    this.finish({ cancelled: true })
    this.state = 'disposed'
    this.instances.clear()
    this.document = null
  }
}
