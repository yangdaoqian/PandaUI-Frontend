import * as THREE from 'three'
import { compactRangeGeometry, releaseBrepSelection } from '../BrepDisplayRanges'
import { createPointMaterial } from '../PointDisplaySettings'
import { isDisplayOnlySharedObject } from './SharedSelectionPolicy'
import { sceneObjectLocked } from '../GeometryDocumentViewState'

export default class SceneSelection {
  #services
  #selectedObject = null
  #selectionHighlight = null

  constructor (services) {
    this.#services = services
  }

  highlightCurve (curveId) {
    const activeModel = this.#services.getActiveModel()
    let curve = null
    if (activeModel != null) {
      activeModel.three.middleground.traverse(object => {
        if (curve == null && object.isLine && object.userData.pandauiObjectId === curveId) curve = object
      })
    }
    this.setSelectedObject(curve)
    return curve != null
  }

  setSelectedObject (object, clientX = null, clientY = null) {
    if (sceneObjectLocked(object)) object = null
    if (isDisplayOnlySharedObject(object)) object = null
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
      if (ancestor.userData?.nodePreview || ancestor.userData?.nonselectable) { object = null; break }
    }
    if (this.#selectedObject === object) {
      if (object != null && Number.isFinite(clientX) && Number.isFinite(clientY)) this.showSelectionInfo(object, clientX, clientY)
      if (object != null) this.#services.notifySelectionChanged(this.#services.getSelectedMaterialSettings(), { reason: 'object-selection' })
      return
    }
    this.restoreSelectedObject()
    this.#selectedObject = object
    if (object == null) {
      this.#services.notifySelectionChanged(null, { reason: 'object-selection' })
      this.#services.setDirtyFlag()
      return
    }

    // A hit from a merged render batch must become a real source object before
    // it can receive a gumball, material edits, or a tree marker.
    this.#services.materializeRenderObject?.(object)
    this.#services.captureSelection(object)

    this.#selectionHighlight = this.createSelectionHighlight(object)
    if (this.#selectionHighlight != null) this.addSelectionHighlight()
    const transformTarget = this.#services.getTransformTarget(object)
    if (!this.#services.isPicking() && transformTarget != null) this.#services.attachGumball(transformTarget, !transformTarget.userData?.readOnly)
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) this.showSelectionInfo(object, clientX, clientY)
    this.#services.notifySelectionChanged(this.#services.getSelectedMaterialSettings(), { reason: 'object-selection' })
    this.#services.setDirtyFlag()
  }

  showSelectionInfo (object, clientX, clientY) {
    if (object == null) return
    const position = object.geometry?.getAttribute('position')
    const index = object.geometry?.getIndex()
    const rows = [
      ['Name', object.userData?.originalName || object.name || 'unnamed'],
      ['Type', String(object.userData?.originalType || object.userData?.geometryType || object.type || 'geometry').toLowerCase()]
    ]
    const root = this.#services.getTransformTarget(object)
    const shared = root?.userData?.sharedObject || root?.userData?.sharedDocument
    if (shared?.ownerUsername && shared.publicationState !== 'published') rows.push(['Owner', shared.ownerUsername])
    if (object.fullLayerPath) rows.push(['Layer', object.fullLayerPath])
    if (Number.isInteger(object.userData?.sourceObject)) rows.push(['Source Index', String(object.userData.sourceObject)])
    if (position != null) rows.push(['Vertices', position.count.toLocaleString()])
    if (object.isMesh && index != null) rows.push(['Triangles', Math.floor(index.count / 3).toLocaleString()])
    else if (object.isLine && index != null) rows.push(['Segments', Math.floor(index.count / 2).toLocaleString()])

    this.#services.ui.showSelection(rows, clientX, clientY)
  }

  createSelectionHighlight (object) {
    let highlight = null
    const color = 0xffff00
    const root = this.#services.getTransformTarget(object)
    if (root?.userData?.clippingPlaneId != null) {
      const highlight = new THREE.Group()
      highlight.userData.worldSpaceHighlight = true
      root.children.filter(child => child.isLine).forEach(edge => {
        const material = new THREE.LineBasicMaterial({ color, toneMapped: false, transparent: false, opacity: 1, depthTest: false, depthWrite: false })
        const line = edge.isLineSegments ? new THREE.LineSegments(edge.geometry, material) : new THREE.LineLoop(edge.geometry, material)
        line.userData.selectionHighlight = true
        line.raycast = () => {}
        highlight.add(line)
      })
      highlight.renderOrder = 2493
      highlight.traverse(child => { child.renderOrder = 2493; child.userData.selectionHighlight = true; child.userData.nonselectable = true })
      highlight.userData.selectionHighlight = true
      return highlight
    }
    const edgeObjects = []
    root.traverse(child => {
      if (child.isLine && !child.userData?.selectionHighlight && !child.userData?.nonselectable && !child.userData?.meshGeometryEdges && !child.userData?.meshFaceEdges) edgeObjects.push(child)
    })
    if (highlight == null && edgeObjects.length > 0) {
      highlight = new THREE.Group()
      highlight.userData.worldSpaceHighlight = true
      edgeObjects.forEach(edge => {
        const material = new THREE.LineBasicMaterial({ color, toneMapped: false, transparent: false, opacity: 1, depthTest: false, depthWrite: false })
        const line = edge.isLineSegments ? new THREE.LineSegments(edge.geometry, material) : new THREE.Line(edge.geometry, material)
        edge.updateWorldMatrix(true, false)
        line.matrixAutoUpdate = false
        line.matrix.copy(edge.matrixWorld)
        line.matrixWorld.copy(edge.matrixWorld)
        line.matrixWorldNeedsUpdate = true
        highlight.add(line)
      })
    } else if (object.isPoints) {
      highlight = new THREE.Points(object.geometry, createPointMaterial({
        color,
        size: Math.max(Number(object.material?.size) || 1, 7),
        sizeAttenuation: false,
        transparent: false,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      }))
    } else if (object.isLine && !object.userData?.meshFaceEdges && !object.userData?.meshGeometryEdges) {
      const material = new THREE.LineBasicMaterial({ color, toneMapped: false, transparent: false, opacity: 1, depthTest: false, depthWrite: false })
      highlight = object.isLineSegments
        ? new THREE.LineSegments(object.geometry, material)
        : new THREE.Line(object.geometry, material)
    }
    // Mesh-only members (including progressive import packets) have no
    // analytic edge object. Use boundaries/creases, never a face tint or the
    // complete triangle wireframe. Coplanar triangulation diagonals disappear.
    if (highlight == null) {
      const outlines = new THREE.Group()
      outlines.userData.worldSpaceHighlight = true
      root.traverseVisible(child => {
        if (!child.isMesh || !child.geometry || child.userData?.selectionHighlight || child.userData?.nonselectable || child.userData?.renderBatch) return
        const source = child.geometry
        const total = source.index?.count ?? source.attributes.position?.count ?? 0
        const start = source.drawRange.start
        const count = Math.max(0, Math.min(source.drawRange.count, total - start))
        if (!count) return
        // EdgesGeometry ignores drawRange; a material packet may share the
        // entire position/index buffers while drawing only one member range.
        const subset = start || count < total ? compactRangeGeometry(source, { indexStart: start, indexCount: count }) : null
        let geometry
        try { geometry = new THREE.EdgesGeometry(subset || source, 30) } finally { subset?.dispose() }
        const outline = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false, toneMapped: false }))
        child.updateWorldMatrix(true, false)
        outline.matrixAutoUpdate = false
        outline.matrix.copy(child.matrixWorld)
        outline.matrixWorld.copy(child.matrixWorld)
        outline.userData.ownedSelectionGeometry = true
        outline.raycast = () => {}
        outlines.add(outline)
      })
      if (outlines.children.length) highlight = outlines
    }
    if (highlight == null) return null
    if (highlight.userData.worldSpaceHighlight !== true) {
      object.updateWorldMatrix(true, false)
      highlight.matrixAutoUpdate = false
      highlight.matrix.copy(object.matrixWorld)
      highlight.matrixWorld.copy(object.matrixWorld)
      highlight.matrixWorldNeedsUpdate = true
    }
    highlight.renderOrder = 1001
    highlight.traverse(child => { child.renderOrder = 1001; child.userData.selectionHighlight = true; child.userData.nonselectable = true })
    highlight.userData.selectionHighlight = true
    return highlight
  }

  restoreSelectedObject () {
    this.#services.detachGumball()
    this.#services.clearMaterialSelection()
    const previous = this.#selectedObject
    this.#selectedObject = null
    this.#services.ui.clearSelection()
    if (this.#selectionHighlight != null) {
      this.#selectionHighlight.parent?.remove(this.#selectionHighlight)
      this.#selectionHighlight.traverse(object => { object.material?.dispose(); if (object.userData.ownedSelectionGeometry) object.geometry?.dispose() })
      this.#selectionHighlight = null
    }
    releaseBrepSelection(previous)
    this.#services.restoreRenderBatches?.()
  }

  refreshSelectionHighlight () {
    if (this.#selectionHighlight != null) {
      this.#selectionHighlight.parent?.remove(this.#selectionHighlight)
      this.#selectionHighlight.traverse(object => { object.material?.dispose(); if (object.userData.ownedSelectionGeometry) object.geometry?.dispose() })
      this.#selectionHighlight = null
    }
    if (this.#selectedObject == null) return
    this.#selectionHighlight = this.createSelectionHighlight(this.#selectedObject)
    if (this.#selectionHighlight != null) this.addSelectionHighlight()
    this.#services.setDirtyFlag()
  }

  addSelectionHighlight () {
    const scene = this.#services.getSelectionScene?.(this.#selectedObject) || this.#services.getPreviewScene()
    scene.add(this.#selectionHighlight)
  }

  updateSelectionHighlightForTransform (dragging) {
    if (dragging) {
      if (this.#selectionHighlight != null) this.#selectionHighlight.visible = false
    } else {
      this.refreshSelectionHighlight()
    }
    this.#services.setDirtyFlag()
  }

  getSelectedObjectRoot () {
    return this.#selectedObject == null ? null : this.#services.getTransformTarget(this.#selectedObject)
  }
  get object () { return this.#selectedObject }
  get highlight () { return this.#selectionHighlight }
}
