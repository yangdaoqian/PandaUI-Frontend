import * as THREE from 'three'

export default class CursorWheelZoom {
  constructor (controls, onZoom = null) {
    this.controls = controls
    this.element = controls.domElement
    this.raycaster = new THREE.Raycaster()
    this.plane = new THREE.Plane()
    this.pointer = new THREE.Vector2()
    this.anchor = new THREE.Vector3()
    this.offset = new THREE.Vector3()
    this.before = event => {
      this.pending = false
      if (!controls.enabled || !controls.enableZoom || !event.deltaY) return
      const camera = controls.object
      const bounds = this.element.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      camera.updateMatrixWorld()
      this.pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2)
      this.plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(this.offset), controls.target)
      this.raycaster.setFromCamera(this.pointer, camera)
      this.pending = this.raycaster.ray.intersectPlane(this.plane, this.anchor) != null
      this.distance = camera.position.distanceTo(controls.target)
      this.zoom = camera.zoom
    }
    this.after = () => {
      if (!this.pending) return
      this.pending = false
      const camera = controls.object
      if (camera.zoom === this.zoom && Math.abs(camera.position.distanceTo(controls.target) - this.distance) <= this.distance * 1e-12) return
      camera.updateMatrixWorld()
      this.raycaster.setFromCamera(this.pointer, camera)
      if (!this.raycaster.ray.intersectPlane(this.plane, this.offset)) return
      this.offset.subVectors(this.anchor, this.offset)
      if (![this.offset.x, this.offset.y, this.offset.z].every(Number.isFinite)) return
      camera.position.add(this.offset)
      controls.target.add(this.offset)
      controls.update()
      onZoom?.()
    }
    this.element.addEventListener('wheel', this.before, { capture: true, passive: true })
    this.element.addEventListener('wheel', this.after, { passive: true })
  }

  dispose () {
    this.element.removeEventListener('wheel', this.before, true)
    this.element.removeEventListener('wheel', this.after)
  }
}
