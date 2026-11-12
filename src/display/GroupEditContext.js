import * as THREE from 'three'
import { isDisplayOnlySharedObject } from './SharedSelectionPolicy'

export default class GroupEditContext {
  #services
  #groupEditStack = []
  #groupIsolationStates = new Map()
  #groupEditBounds = null
  #groupBoundsRevision = -1
  #groupBoundsObject = null

  constructor (services) {
    this.#services = services
  }

  getCurrentGroupEditContext () {
    return this.#groupEditStack.length === 0 ? null : this.#groupEditStack[this.#groupEditStack.length - 1]
  }

  isDescendantOf (object, ancestor) {
    let current = object
    while (current != null) {
      if (current === ancestor) return true
      current = current.parent
    }
    return false
  }

  directChildUnder (group, object) {
    if (group == null || object == null || !this.isDescendantOf(object, group)) return null
    let current = object
    while (current.parent != null && current.parent !== group) current = current.parent
    return current.parent === group ? current : null
  }

  hasEditableGroupChildren (group) {
    return !isDisplayOnlySharedObject(group) && group?.isGroup === true && group.children.some(child => child.isGroup || child.userData.faceRanges?.length || child.userData.edgeRanges?.length)
  }

  findEnterableGroup (object) {
    const editGroup = this.getCurrentGroupEditContext()
    if (editGroup != null) {
      const child = this.directChildUnder(editGroup, object)
      return this.hasEditableGroupChildren(child) ? child : null
    }

    const target = this.#services.getTransformTarget(object)
    if (this.hasEditableGroupChildren(target)) return target
    let candidate = null
    let current = object.parent
    while (current != null && !current.isScene) {
      if ((current.userData?.geometryId != null || current.userData?.selectionRole != null) && this.hasEditableGroupChildren(current)) candidate = current
      current = current.parent
    }
    return candidate
  }

  enterGroupEditLevel (group) {
    if (!this.hasEditableGroupChildren(group)) return false
    const current = this.getCurrentGroupEditContext()
    if (current != null && this.directChildUnder(current, group) !== group) return false
    this.#services.setSelectedObject(null)
    this.#groupEditStack.push(group)
    this.refreshGroupEditIsolation()
    this.updateGroupEditBounds()
    this.#services.setDirtyFlag()
    return true
  }

  exitGroupEditLevel () {
    if (this.#groupEditStack.length === 0) return false
    this.#services.setSelectedObject(null)
    this.#groupEditStack.pop()
    this.refreshGroupEditIsolation()
    this.updateGroupEditBounds()
    this.#services.setDirtyFlag()
    return true
  }

  clearGroupEditMode () {
    this.#groupEditStack = []
    this.restoreGroupEditIsolation()
    this.clearGroupEditBounds()
  }

  updateGroupEditBounds () {
    const editGroup = this.getCurrentGroupEditContext()
    if (this.#groupBoundsObject === editGroup && this.#groupBoundsRevision === this.#services.getSceneRevision()) return
    this.#groupBoundsObject = editGroup
    this.#groupBoundsRevision = this.#services.getSceneRevision()
    if (editGroup == null) {
      this.clearGroupEditBounds()
      return
    }
    editGroup.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(editGroup)
    if (bounds.isEmpty()) {
      this.clearGroupEditBounds()
      return
    }
    const corners = [
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.min.z),
      new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.min.z),
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.max.z),
      new THREE.Vector3(bounds.max.x, bounds.min.y, bounds.max.z),
      new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
      new THREE.Vector3(bounds.min.x, bounds.max.y, bounds.max.z)
    ]
    const edgePairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
    const positions = []
    edgePairs.forEach(([start, end]) => positions.push(...corners[start].toArray(), ...corners[end].toArray()))
    if (this.#groupEditBounds == null) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      const material = new THREE.LineDashedMaterial({ color: 0x80deea, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false })
      this.#groupEditBounds = new THREE.LineSegments(geometry, material)
      this.#groupEditBounds.userData.groupEditBounds = true
      this.#groupEditBounds.frustumCulled = false
      this.#groupEditBounds.renderOrder = 1100
      this.#services.getPreviewScene().add(this.#groupEditBounds)
      this.#groupEditBounds.computeLineDistances()
    } else {
      const position = this.#groupEditBounds.geometry.getAttribute('position')
      position.array.set(positions)
      position.needsUpdate = true
    }
    const diagonal = bounds.min.distanceTo(bounds.max)
    const material = this.#groupEditBounds.material
    material.dashSize = Math.max(diagonal * 0.025, 0.001)
    material.gapSize = material.dashSize * 0.65
    material.needsUpdate = true
    this.#groupEditBounds.computeLineDistances()
    this.#groupEditBounds.geometry.computeBoundingSphere()
  }

  clearGroupEditBounds () {
    this.#groupBoundsObject = null
    if (this.#groupEditBounds == null) return
    this.#services.getPreviewScene().remove(this.#groupEditBounds)
    this.#groupEditBounds.geometry.dispose()
    this.#groupEditBounds.material.dispose()
    this.#groupEditBounds = null
  }

  restoreGroupEditIsolation () {
    this.#groupIsolationStates.forEach((state, object) => {
      const currentMaterials = Array.isArray(object.material) ? object.material : [object.material]
      const stillDimmed = currentMaterials.length === state.dimmed.length && currentMaterials.every((material, index) => material === state.dimmed[index])
      if (stillDimmed) object.material = state.wasArray ? state.original : state.original[0]
      state.dimmed.forEach(material => material.dispose())
    })
    this.#groupIsolationStates.clear()
  }

  refreshGroupEditIsolation () {
    this.restoreGroupEditIsolation()
    const editGroup = this.getCurrentGroupEditContext()
    if (editGroup == null) return

    const roots = []
    const activeModel = this.#services.getActiveModel()
    if (activeModel != null) roots.push(activeModel.three.middleground)
    roots.push(this.#services.getPreviewScene())
    roots.forEach(root => {
      root.traverse(object => {
        if (this.isDescendantOf(object, editGroup) || object === this.#services.getSelectionHighlight() || object.userData?.renderShadowGround === true) return
        if (!(object.isMesh || object.isPoints || object.isLine) || object.material == null) return
        const wasArray = Array.isArray(object.material)
        const original = wasArray ? object.material.slice() : [object.material]
        const dimmed = original.map(material => {
          const clone = material.clone()
          clone.transparent = true
          clone.opacity = Math.min(Number.isFinite(Number(material.opacity)) ? Number(material.opacity) : 1, 0.18)
          clone.depthWrite = false
          clone.needsUpdate = true
          return clone
        })
        this.#groupIsolationStates.set(object, { original, dimmed, wasArray })
        object.material = wasArray ? dimmed : dimmed[0]
      })
    })
  }
}
