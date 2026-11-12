import * as THREE from 'three'

const aborted = () => Object.assign(new Error('Control point editing cancelled.'), { name: 'AbortError' })

// Control handles are viewport helpers, never document objects or node previews.
export default class ControlPointController {
  constructor (services) {
    this.services = services
    this.session = null
    this.loading = null
    this.applying = false
    this.generation = 0
    this.group = new THREE.Group()
    this.group.name = 'Control points'
    this.group.userData.pandauiGumball = true
    this.group.userData.nonselectable = true
    services.helperScene.add(this.group)
    this.handle = new THREE.Object3D()
    this.handle.userData.controlPointHandle = true
    this.handle.userData.pandauiGumball = true
    services.helperScene.add(this.handle)
  }

  get active () { return !!(this.session || this.loading) }
  get busy () { return !!this.loading || this.applying }

  target (object) {
    for (let item = object; item && !item.isScene; item = item.parent) {
      if (item.userData?.importedModelObject && item.userData.sourceGeometryId) return item
    }
    return null
  }

  documentFor (root) {
    const documents = this.services.getModelDocuments()
    // Imported document scenes can be nested below the active document scene.
    // The nearest owning scene wins, not the first document in the app list.
    for (let item = root; item; item = item.parent) {
      const doc = documents.find(doc => item === doc.three?.middleground)
      if (doc) return doc
    }
    return null
  }

  assertEditable (doc, root) {
    if (!doc || doc.disposed || !root?.parent || this.documentFor(root) !== doc) throw new Error('The source document is no longer open.')
    for (let item = root; item; item = item.parent) {
      if (item.userData?.readOnly || item.userData?.nodePreview) throw new Error('This geometry is not editable in this workspace.')
    }
    if (doc.localImportInProgress || doc.remeshStream) throw new Error('Wait for the document geometry to finish loading before editing control points.')
  }

  canStart (object) {
    const root = this.target(object)
    if (!root) return false
    try { this.assertEditable(this.documentFor(root), root); return true } catch (_) { return false }
  }

  async start (object) {
    if (this.applying || this.disposed) return false
    this.stop(false)
    const root = this.target(object)
    const doc = this.documentFor(root)
    const generation = this.generation
    try {
      this.assertEditable(doc, root)
      const controller = new AbortController()
      this.loading = controller
      this.services.status('Loading control points…')
      const source = await this.services.source.read(doc, root, { signal: controller.signal })
      const data = await this.services.client.run('geometry.controlPoints', { geometry: source.geometry }, { signal: controller.signal })
      if (generation !== this.generation) throw aborted()
      this.assertEditable(doc, root)
      this.loading = null
      this.session = { doc, root, source, data, selected: -1 }
      this.services.selectObject(root)
      this.services.detachGumball()
      this.draw()
      this.services.status('Select a control point, then drag its Gumball. Esc: finish. Ctrl+Z: undo.')
      return true
    } catch (error) {
      if (generation === this.generation) {
        this.loading = null
        if (error.name !== 'AbortError') this.services.status(error.message)
      }
      return false
    }
  }

  clearDisplay () {
    this.group.children.slice().forEach(child => {
      this.group.remove(child)
      child.geometry?.dispose()
      child.material?.dispose()
    })
  }

  draw () {
    this.clearDisplay()
    const session = this.session
    if (!session) return
    const { root, data, selected } = session
    root.updateWorldMatrix(true, false)
    this.group.matrixAutoUpdate = false
    this.group.matrix.copy(root.matrixWorld)
    const positions = data.points.flat()
    const colors = data.points.flatMap((_, index) => index === selected ? [1, 0.85, 0] : [0.2, 0.85, 1])
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, vertexColors: true, depthTest: false, depthWrite: false, toneMapped: false }))
    const lines = []
    const edge = (a, b) => { lines.push(...data.points[a], ...data.points[b]) }
    if (data.kind === 'subd') {
      data.edges.forEach(([a, b]) => edge(a, b))
    } else if (data.kind === 'surface') {
      for (let u = 0; u < data.countU; u++) {
        for (let v = 0; v < data.countV; v++) {
          const index = u * data.countV + v
          if (v + 1 < data.countV) edge(index, index + 1)
          if (u + 1 < data.countU) edge(index, index + data.countV)
        }
      }
    } else for (let i = 1; i < data.points.length; i++) edge(i - 1, i)
    const net = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines, 3)),
      new THREE.LineBasicMaterial({ color: 0x36b9d5, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false, toneMapped: false }))
    this.group.add(net, this.points)
    this.group.traverse(child => { child.renderOrder = 2490; child.userData.pandauiGumball = true; child.raycast = () => {} })
    this.services.setDirtyFlag(false)
  }

  pick (clientX, clientY) {
    if (!this.session || this.busy) return false
    const { root, data } = this.session
    const doc = this.session.doc
    try { this.assertEditable(doc, root) } catch (error) { this.stop(); this.services.status(error.message); return true }
    const rect = this.services.domElement.getBoundingClientRect()
    if (!rect.width || !rect.height) return true
    root.updateWorldMatrix(true, false)
    const camera = this.services.getCamera()
    camera.updateWorldMatrix(true, false)
    let selected = -1, distance = 12, depth = Infinity
    data.points.forEach((point, index) => {
      const projected = new THREE.Vector3(...point).applyMatrix4(root.matrixWorld).project(camera)
      if (projected.z < -1 || projected.z > 1) return
      const pixels = Math.hypot(rect.left + (projected.x + 1) * rect.width / 2 - clientX, rect.top + (1 - projected.y) * rect.height / 2 - clientY)
      if (pixels < distance - 0.01 || (Math.abs(pixels - distance) < 0.01 && projected.z < depth)) { selected = index; distance = pixels; depth = projected.z }
    })
    this.session.selected = selected
    this.draw()
    if (selected < 0) this.services.detachGumball()
    else {
      this.handle.position.fromArray(data.points[selected]).applyMatrix4(root.matrixWorld)
      this.handle.quaternion.identity(); this.handle.scale.set(1, 1, 1)
      this.handle.updateMatrixWorld(true)
      this.services.attachGumball(this.handle)
      this.services.status('Control point ' + selected + ' · Weight ' + data.weights[selected])
    }
    return true
  }

  handleChanged () {
    if (!this.session || this.session.selected < 0) return
    const { root, data, selected } = this.session
    root.updateWorldMatrix(true, false)
    const local = root.worldToLocal(this.handle.getWorldPosition(new THREE.Vector3()))
    const original = data.points[selected]
    // Only the helper net moves during a drag; one real geometry transaction is
    // submitted at pointer release. This avoids queuing a remesh per mousemove.
    data.points[selected] = local.toArray()
    this.draw()
    data.points[selected] = original
  }

  async commit ({ object }) {
    const session = this.session
    if (object !== this.handle || !session || session.selected < 0 || this.busy) throw new Error('No control point is ready for editing.')
    const { root, doc, selected, source, data } = session
    this.assertEditable(doc, root)
    root.updateWorldMatrix(true, false)
    if (Math.abs(root.matrixWorld.determinant()) < 1e-12) throw new Error('The object transform is not invertible.')
    const point = root.worldToLocal(object.getWorldPosition(new THREE.Vector3())).toArray()
    if (point.every((value, index) => Math.abs(value - data.points[selected][index]) < 1e-10)) return { object: this.handle }
    this.applying = true
    try {
      const result = await this.services.client.run('geometry.setControlPoints', { geometry: source.geometry, updates: [{ index: selected, point }] })
      this.assertEditable(doc, root)
      const target = { documentId: doc.documentId, objectId: root.userData.pandauiObjectId }
      await this.services.getOperations().executeControlPoints(
        { ...target, geometry: source.geometry, attributes: source.attributes },
        { ...target, geometry: result.geometry, attributes: source.attributes })
      this.services.status('Control point updated. Ctrl+Z: undo.')
      return { object: this.session === session ? this.handle : null }
    } finally { this.applying = false }
  }

  findStateTarget (state) {
    const doc = this.services.getModelDocuments().find(item => item.documentId === state?.documentId)
    let root
    doc?.three?.middleground?.traverse(item => {
      if (item.userData.importedModelObject && item.userData.pandauiObjectId === state.objectId) root = item
    })
    this.assertEditable(doc, root)
    return { doc, root }
  }

  async applyState (state, { signal } = {}) {
    const { doc, root } = this.findStateTarget(state)
    const prepared = await this.services.source.prepare(doc, root, state, { signal })
    let applied = false
    try {
      const data = await this.services.client.run('geometry.controlPoints', { geometry: state.geometry }, { signal })
      if (signal?.aborted) throw aborted()
      if (this.disposed) throw aborted()
      this.assertEditable(doc, root)
      this.services.source.apply(doc, root, state, prepared)
      applied = true
      if (this.session?.root === root) {
        this.session.source = { geometry: state.geometry, attributes: state.attributes }
        this.session.data = data
        this.draw()
        const index = this.session.selected
        if (index >= 0) {
          this.handle.position.fromArray(data.points[index]).applyMatrix4(root.matrixWorld)
          this.handle.updateMatrixWorld(true)
          this.services.attachGumball(this.handle)
        }
      }
      this.services.refreshSelectionHighlight()
      this.services.setDirtyFlag()
      return true
    } finally { if (!applied) prepared.dispose?.() }
  }

  selectionChanged (object) {
    if (this.active && object !== this.session?.root) this.stop(false, true)
  }

  stop (restore = true, force = false) {
    if (this.applying && !force) return false
    this.generation++
    this.loading?.abort()
    this.loading = null
    const root = this.session?.root
    this.session = null
    this.clearDisplay()
    this.services.detachGumball()
    if (restore && root?.parent) this.services.attachGumball(root)
    this.services.status('')
    this.services.setDirtyFlag(false)
    return true
  }

  dispose () {
    this.disposed = true
    this.applying = false
    this.stop(false)
    this.group.parent?.remove(this.group)
    this.handle.parent?.remove(this.handle)
    this.services.client.dispose()
    this.services.source.dispose?.()
  }
}
