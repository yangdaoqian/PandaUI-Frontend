import * as THREE from 'three'
import ParameterScenePicker, { scenePickAccessError } from '../ParameterScenePicker.js'
import { isDisplayOnlySharedObject } from './SharedSelectionPolicy'
import { rangeAtIntersection, createBrepSelection, materializeBrepSelection } from '../BrepDisplayRanges'
import GumballController from '../modeling/GumballController'

export default class SceneInteraction {
  #services
  #raycaster = new THREE.Raycaster()
  #pointer = new THREE.Vector2()
  #pointerDown = null
  #contextPointerDown = null
  #curvePickHandler = null
  #objectPickHandler = null
  #objectSelection = null
  #modelingTool = null
  #modelingPreviewLine = null
  #gumballController = null
  #deleting = false

  constructor (services) {
    this.#services = services
    const createGumball = services.createGumball || (options => new GumballController(options))
    this.#gumballController = createGumball({
      camera: this.#services.getCamera(),
      domElement: this.#services.domElement,
      parentElement: this.#services.parentElement,
      scene: this.#services.helperScene,
      orbitControls: this.#services.controls,
      getMarker: object => this.createSceneObjectMarker(object),
      onChange: () => {
        this.#services.controlPoints?.handleChanged()
        this.#services.syncClippingPlaneTransform?.(this.#services.getSelectedObject())
        this.#services.setDirtyFlag()
      },
      onDragState: dragging => {
        if (dragging) materializeBrepSelection(this.#services.getSelectedObject())
        this.#services.updateSelectionHighlightForTransform(dragging)
      },
      onCommit: transform => this.commitGumballTransform(transform)
    })
    this.#gumballController.setViewportSize(...this.#services.getViewportSize())
  }

  setModelingTool (tool) {
    if (tool) this.#services.controlPoints?.stop()
    this.#modelingTool = tool || null
    this.#services.domElement.style.cursor = this.#modelingTool == null ? '' : 'crosshair'
    if (this.#modelingTool == null) this.clearModelingPreview()
    this.updateModelingPanel()
  }

  updateModelingPanel () {
    const settings = this.#modelingTool?.getSnapSettings?.() || {}
    this.#services.ui.state.modeling = this.#modelingTool ? {
      plane: this.#modelingTool.getConstructionPlane?.() || 'XY',
      gridSnap: settings.gridSnap !== false,
      gridSize: Number(settings.gridSize) || 1,
      endpointSnap: settings.endpointSnap !== false
    } : null
  }

  setModelingLinePreview (start, end) {
    if (start == null || end == null) return
    if (this.#modelingPreviewLine == null) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
      const material = new THREE.LineDashedMaterial({ color: 0x31ccec, dashSize: 0.8, gapSize: 0.4, depthTest: false, depthWrite: false, transparent: true, opacity: 0.9 })
      this.#modelingPreviewLine = new THREE.Line(geometry, material)
      this.#modelingPreviewLine.frustumCulled = false
      this.#modelingPreviewLine.renderOrder = 2000
      this.#services.getPreviewScene().add(this.#modelingPreviewLine)
    }
    const position = this.#modelingPreviewLine.geometry.getAttribute('position')
    position.setXYZ(0, start.x, start.y, start.z)
    position.setXYZ(1, end.x, end.y, end.z)
    position.needsUpdate = true
    this.#modelingPreviewLine.geometry.computeBoundingSphere()
    this.#modelingPreviewLine.computeLineDistances()
    this.#services.setDirtyFlag()
  }

  clearModelingPreview () {
    if (this.#modelingPreviewLine == null) return
    this.#services.getPreviewScene().remove(this.#modelingPreviewLine)
    this.#modelingPreviewLine.geometry.dispose()
    this.#modelingPreviewLine.material.dispose()
    this.#modelingPreviewLine = null
    this.#services.setDirtyFlag()
  }

  onContextMenu = (event) => {
    event.preventDefault()
    event.stopPropagation()
    const dragDistance = this.#contextPointerDown == null
      ? 0
      : Math.hypot(event.clientX - this.#contextPointerDown.x, event.clientY - this.#contextPointerDown.y)
    this.#contextPointerDown = null
    if (dragDistance > 4) {
      this.hideContextMenu()
      return
    }
    if (this.parameterPicker) { this.parameterPicker.finish(false); return }
    if (this.#objectSelection) { this.finishObjectSelection(false); return }
    if (this.#services.getSelectedObject() == null) {
      this.hideContextMenu()
      window.dispatchEvent(new CustomEvent('pandaui-switch-editor-mode', {
        detail: { active: true, addNodeMenu: { clientX: event.clientX, clientY: event.clientY } }
      }))
      return
    }
    this.#services.showContextMenu(event.clientX, event.clientY)
  }

  onDocumentPointerDown = (event) => {
    if (this.#services.ui.state.menu && !event.target?.closest?.('[data-viewport-menu]')) this.hideContextMenu()
  }

  onDocumentKeyDown = (event) => {
    const points = this.#services.controlPoints
    const textInput = event.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '')
    if (event.key === 'Escape' && points?.active && !textInput) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!points.applying && !this.#gumballController?.isTransforming()) points.stop()
      return
    }
    if (event.key === 'F10' && !textInput && event.target === this.#services.domElement) {
      event.preventDefault()
      points?.start(this.#services.getSelectedObject())
      return
    }
    if (event.key === 'F11' && points?.active && !textInput) { event.preventDefault(); points.stop(); return }
    if (event.key === 'Delete' && points?.active && !textInput) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.#services.ui.state.status = 'Finish control point editing before deleting the object.'
      return
    }
    if (event.key === 'Escape' && this.#objectSelection) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.finishObjectSelection(true)
      return
    }
    if (event.key === 'Escape' && this.parameterPicker) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.parameterPicker.finish(true)
      return
    }
    const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target?.isContentEditable === true
    if (event.key === 'Delete' && !editable && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && event.target === this.#services.domElement) {
      if (!this.deletionTarget() || this.isPicking() || this.#objectPickHandler || this.#curvePickHandler || this.#modelingTool || this.#gumballController?.isTransforming()) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!event.repeat) this.deleteSelectedObject()
      return
    }
    const modelingPanelInput = event.target?.closest?.('[data-viewport-modeling]') != null || this.#gumballController?.containsElement(event.target) === true
    if (event.key === 'Escape' && this.#modelingTool != null) {
      event.preventDefault()
      event.stopPropagation()
      this.#modelingTool.cancel?.()
      return
    }
    if ((editable && !modelingPanelInput) || !(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (points?.active && ['z', 'y'].includes(key) && (points.busy || this.#gumballController?.isTransforming())) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (key === 'z' && event.shiftKey) {
      event.preventDefault()
      event.stopPropagation()
      this.#services.executeModelingHistory('modeling.redo')
    } else if (key === 'z') {
      event.preventDefault()
      event.stopPropagation()
      this.#services.executeModelingHistory('modeling.undo')
    } else if (key === 'y') {
      event.preventDefault()
      event.stopPropagation()
      this.#services.executeModelingHistory('modeling.redo')
    }
  }

  hideContextMenu = () => {
    this.#services.ui.hideMenu()
  }

  async deleteSelectedObject () {
    if (this.#deleting) return false
    const selected = this.#services.getSelectedObject()
    const root = this.deletionTarget()
    if (!root) return false
    if (selected.userData.selectionRole === 'brepFace' || selected.userData.selectionRole === 'brepEdge') {
      this.#services.ui.state.status = 'Select the whole object to delete it.'
      return false
    }
    this.#deleting = true
    this.hideContextMenu()
    try {
      return await this.#services.deleteSceneObject(root)
    } catch (error) {
      this.#services.ui.state.status = error.message || 'Could not delete the selected object.'
      return false
    } finally { this.#deleting = false }
  }

  deletionTarget () {
    const selected = this.#services.getSelectedObject()
    if (!selected) return null
    for (let object = selected; object; object = object.parent) {
      if (object.userData?.nodePreview || object.userData?.nonselectable || object.userData?.readOnly || object.userData?.clippingHelper) return null
    }
    const root = this.#services.getTransformTarget(selected)
    return root?.parent && !root.isScene && root.userData.clippingPlaneId == null ? root : null
  }

  onAuxiliaryClick = (event) => {
    if (event.button >= 2) event.preventDefault()
  }

  onNavigationMouseButton = (event) => {
    if (event.button !== 3 && event.button !== 4) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  canStartNodeGraphGesture (event) {
    if (this.#services.controlPoints?.active) return false
    if (this.parameterPicker || this.#objectSelection || this.#modelingTool || this.#objectPickHandler || this.#curvePickHandler) return false
    this.#gumballController?.handlePointerMove(event)
    return !this.#gumballController?.isTransforming() && !this.#gumballController?.isHoveringHandle()
  }

  onPointerDown = (event) => {
    this.#services.domElement.focus?.({ preventScroll: true })
    if (event.button === 2) {
      this.#contextPointerDown = { x: event.clientX, y: event.clientY }
      return
    }
    if (event.button !== 0) return
    this.#pointerDown = { x: event.clientX, y: event.clientY }
  }

  onPointerCancel = () => {
    this.#pointerDown = null
    this.#contextPointerDown = null
  }

  onPointerMove = (event) => {
    if (this.parameterPicker) { this.parameterPicker.move(event); return }
    if (this.#modelingTool == null || typeof this.#modelingTool.pointerMove !== 'function') return
    const point = this.modelingPointAtPointer(event.clientX, event.clientY)
    if (point != null) {
      this.updateModelingCoordinateReadout(point)
      this.#modelingTool.pointerMove(point, event)
    }
  }

  onPointerUp = (event) => {
    if (this.#objectSelection) {
      if (event.button !== 0 || !this.#pointerDown) return
      const distance = Math.hypot(event.clientX - this.#pointerDown.x, event.clientY - this.#pointerDown.y)
      this.#pointerDown = null
      if (distance <= 4) this.selectAtPointer(event.clientX, event.clientY)
      return
    }
    if (this.parameterPicker) {
      if (event.button !== 0 || !this.#pointerDown) return
      const distance = Math.hypot(event.clientX - this.#pointerDown.x, event.clientY - this.#pointerDown.y)
      this.#pointerDown = null
      if (distance <= 4) this.parameterPicker.click(event)
      return
    }
    if (event.button === 0 && (this.#gumballController?.isTransforming() || this.#gumballController?.isHoveringHandle())) {
      this.#pointerDown = null
      return
    }
    if (event.button === 0 && this.#gumballController?.consumesPointerUp()) {
      this.#pointerDown = null
      return
    }
    if (event.button !== 0 || this.#pointerDown == null) return
    const distance = Math.hypot(event.clientX - this.#pointerDown.x, event.clientY - this.#pointerDown.y)
    this.#pointerDown = null
    if (distance > 4) return
    if (this.#services.controlPoints?.active) {
      this.#services.controlPoints.pick(event.clientX, event.clientY)
      return
    }
    if (this.#modelingTool != null && typeof this.#modelingTool.pointerClick === 'function') {
      const point = this.modelingPointAtPointer(event.clientX, event.clientY)
      if (point != null) this.#modelingTool.pointerClick(point, event)
      return
    }
    this.selectAtPointer(event.clientX, event.clientY)
  }

  parameterPointAtPointer (clientX, clientY, plane) {
    return this.modelingPointAtPointer(clientX, clientY, plane)
  }

  beginParameterPick (options, complete) {
    this.finishObjectSelection(true)
    this.parameterPicker?.finish(true)
    this.#modelingTool?.deactivate?.()
    this.hideContextMenu()
    this.clearCurveHighlight()
    const picker = new ParameterScenePicker(this, options, result => {
      if (this.parameterPicker === picker) this.parameterPicker = null
      this.setSelectedObject(null)
      complete(result)
    })
    this.parameterPicker = picker
  }

  beginObjectSelection (complete) {
    this.finishObjectSelection(true)
    this.parameterPicker?.finish(true)
    this.#modelingTool?.deactivate?.()
    this.hideContextMenu()
    this.#curvePickHandler = null
    this.#objectPickHandler = null
    this.#pointerDown = null
    this.#objectSelection = { complete, original: this.#services.getSelectedObject(), cursor: this.#services.domElement.style.cursor }
    this.#gumballController?.detach()
    this.#services.domElement.style.cursor = 'crosshair'
  }

  finishObjectSelection (cancelled = false) {
    const selection = this.#objectSelection
    if (!selection) return
    this.#objectSelection = null
    this.#pointerDown = null
    this.#contextPointerDown = null
    this.#services.domElement.style.cursor = selection.cursor
    if (cancelled) this.setSelectedObject(selection.original?.parent ? selection.original : null)
    if (this.#services.getSelectedObject()) {
      const target = this.#services.getTransformTarget(this.#services.getSelectedObject())
      this.#gumballController?.attach(target, !target?.userData?.readOnly)
    }
    selection.complete?.({ cancelled })
  }

  modelingPointAtPointer (clientX, clientY, planeOverride = null) {
    const rect = this.#services.domElement.getBoundingClientRect()
    this.#pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    this.#raycaster.setFromCamera(this.#pointer, this.#services.getCamera())
    const constructionPlane = planeOverride || this.#modelingTool?.getConstructionPlane?.() || 'XY'
    const normal = constructionPlane === 'XZ'
      ? new THREE.Vector3(0, 1, 0)
      : constructionPlane === 'YZ'
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 0, 1)
    const point = new THREE.Vector3()
    if (this.#raycaster.ray.intersectPlane(new THREE.Plane(normal, 0), point) == null) return null
    return this.snapModelingPoint(point, clientX, clientY, constructionPlane, this.#modelingTool?.getSnapSettings?.() || {})
  }

  snapModelingPoint (point, clientX, clientY, constructionPlane, settings) {
    const snapped = point.clone()
    const gridSize = Number(settings.gridSize)
    if (settings.gridSnap !== false && Number.isFinite(gridSize) && gridSize > 0) {
      if (constructionPlane !== 'YZ') snapped.x = Math.round(snapped.x / gridSize) * gridSize
      if (constructionPlane !== 'XZ') snapped.y = Math.round(snapped.y / gridSize) * gridSize
      if (constructionPlane !== 'XY') snapped.z = Math.round(snapped.z / gridSize) * gridSize
    }
    if (settings.endpointSnap !== false) return this.endpointAtPointer(clientX, clientY, 12) || snapped
    return snapped
  }

  endpointAtPointer (clientX, clientY, pixelRadius) {
    const rect = this.#services.domElement.getBoundingClientRect()
    const roots = [this.#services.getPreviewScene()]
    const activeModel = this.#services.getActiveModel()
    if (activeModel != null) roots.push(activeModel.three.middleground)
    roots.forEach(root => root.updateMatrixWorld(true))

    let closest = null
    let closestDistance = pixelRadius
    let scanned = 0
    const localPoint = new THREE.Vector3()
    const worldPoint = new THREE.Vector3()
    const projected = new THREE.Vector3()
    for (const root of roots) {
      root.traverse(object => {
        if (scanned >= 5000 || object === this.#modelingPreviewLine || object.visible === false) return
        if ((!object.isLine && !object.isLineSegments) || object.geometry == null) return
        const position = object.geometry.getAttribute('position')
        if (position == null) return
        for (let index = 0; index < position.count && scanned < 5000; index++, scanned++) {
          localPoint.fromBufferAttribute(position, index)
          worldPoint.copy(localPoint).applyMatrix4(object.matrixWorld)
          projected.copy(worldPoint).project(this.#services.getCamera())
          if (projected.z < -1 || projected.z > 1) continue
          const screenX = rect.left + (projected.x + 1) * rect.width * 0.5
          const screenY = rect.top + (1 - projected.y) * rect.height * 0.5
          const distance = Math.hypot(screenX - clientX, screenY - clientY)
          if (distance > closestDistance) continue
          closestDistance = distance
          closest = worldPoint.clone()
        }
      })
      if (scanned >= 5000) break
    }
    return closest
  }

  updateModelingCoordinateReadout (point) {
    if (point) this.#services.ui.state.pointer = 'Pointer: ' + [point.x, point.y, point.z].map(value => value.toFixed(3)).join(', ')
  }

  onDoubleClick = (event) => {
    if (this.parameterPicker || this.#objectSelection) return
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const intersections = this.intersectionsAtPointer(event.clientX, event.clientY)
    const hit = intersections.map(intersection => this.#services.resolveRenderBatchHit?.(intersection) || intersection).find(intersection => this.isSelectable(intersection.object))
    if (hit == null) {
      if (this.#services.getCurrentGroupEditContext() != null) this.#services.exitGroupEditLevel()
      else window.dispatchEvent(new CustomEvent('pandaui-switch-editor-mode', { detail: { active: true } }))
      return
    }
    const group = this.#services.findEnterableGroup(hit.object)
    if (group != null) this.#services.enterGroupEditLevel(group)
  }

  selectAtPointer (clientX, clientY) {
    const intersections = this.intersectionsAtPointer(clientX, clientY)
    if (this.#objectPickHandler != null) {
      const objectHit = intersections.map(intersection => this.#services.resolveRenderBatchHit?.(intersection) || intersection).find(intersection => this.isSelectable(intersection.object))
      if (objectHit != null) {
        const target = this.#services.getTransformTarget(objectHit.object)
        const marker = this.createSceneObjectMarker(target)
        this.setSelectedObject(target, clientX, clientY)
        const handler = this.#objectPickHandler
        this.#objectPickHandler = null
        handler(marker)
      }
      return
    }
    if (this.#curvePickHandler != null) {
      const curveHit = intersections.find(intersection => this.isCurveSelectable(intersection.object))
      if (curveHit != null) {
        const selected = this.selectionTarget(curveHit, true)
        const curveId = selected.userData.pandauiObjectId
        this.setSelectedObject(selected, clientX, clientY)
        const handler = this.#curvePickHandler
        this.#curvePickHandler = null
        handler(curveId, selected.userData.sourceObject, this.getCurvePolyline(selected))
      }
      return
    }
    const hit = intersections.find(intersection => this.isSelectable(intersection.object))
    this.setSelectedObject(hit == null ? null : this.selectionTarget(hit), clientX, clientY)
  }

  selectionTarget (hit, forceSubobject = false) {
    hit = this.#services.resolveRenderBatchHit?.(hit) || hit
    const subobject = rangeAtIntersection(hit)
    if (subobject && (forceSubobject || this.#services.getCurrentGroupEditContext() === hit.object.parent)) return createBrepSelection(hit.object, subobject)
    return this.#services.getTransformTarget(hit.object)
  }

  intersectionsAtPointer (clientX, clientY, pixelRadius = 5) {
    const rect = this.#services.domElement.getBoundingClientRect()
    this.#pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    this.#raycaster.setFromCamera(this.#pointer, this.#services.getCamera())
    this.#raycaster.params.Points.threshold = 0.5
    const lineThreshold = this.#raycaster.params.Line.threshold
    if (pixelRadius != null) {
      const span = this.#services.getCamera().isOrthographicCamera
        ? (this.#services.getCamera().top - this.#services.getCamera().bottom) / this.#services.getCamera().zoom
        : 2 * this.#services.getCamera().position.distanceTo(this.#services.controls.target) * Math.tan(THREE.MathUtils.degToRad(this.#services.getCamera().fov) / 2) / this.#services.getCamera().zoom
      const threshold = Math.max(1e-9, span * pixelRadius / Math.max(1, rect.height))
      this.#raycaster.params.Line.threshold = threshold
      this.#raycaster.params.Points.threshold = threshold
    }

    const roots = []
    const activeModel = this.#services.getActiveModel()
    if (activeModel != null) roots.push(activeModel.three.middleground)
    roots.push(this.#services.getPreviewScene())
    const clippingScene = this.#services.getClippingDisplayScene?.()
    if (clippingScene != null) roots.push(clippingScene)
    roots.forEach(root => root.updateMatrixWorld(true))
    try {
      const hits = this.#raycaster.intersectObjects(roots, true)
      const helpers = hits.filter(hit => hit.object.userData?.clippingHelper && this.isSelectable(hit.object))
      const geometry = hits.filter(hit => !hit.object.userData?.clippingHelper && this.#services.getClippingPlanes().every(plane => plane.distanceToPoint(hit.point) >= -1e-8))
      return [...helpers, ...geometry]
    } finally {
      this.#raycaster.params.Line.threshold = lineThreshold
      this.#raycaster.params.Points.threshold = 0.5
    }
  }

  isSelectable (object) {
    if (isDisplayOnlySharedObject(object)) return false
    if (object === this.#services.getSelectionHighlight()) return false
    if ((this.#objectPickHandler || this.#curvePickHandler || this.isPicking()) && scenePickAccessError(object)) return false
    if (object.userData?.groupEditBounds === true) return false
    // The render shadow catcher is presentation-only and must never become
    // the active object when clicking the rendered viewport.
    if (object.userData.renderShadowGround === true) return false
    let current = object
    while (current != null) {
      if (current.userData?.pandauiGumball === true || current.isTransformControls === true) return false
      if (current.userData?.selectionHighlight === true) return false
      if (current.userData?.kukaPreview === true || current.userData?.kukaNonSelectable === true) return false
      if (current.userData?.nodePreview === true || current.userData?.nonselectable === true) return false
      if (!current.visible) return false
      current = current.parent
    }
    if (object.userData?.clippingHelper) return !this.isPicking() && !this.#objectPickHandler && !this.#curvePickHandler && !object.userData.selectionHighlight
    const editGroup = this.#services.getCurrentGroupEditContext()
    if (editGroup != null && !this.#services.isDescendantOf(object, editGroup)) return false
    return !!(object.isMesh || object.isPoints || object.isLine)
  }

  isCurveSelectable (object) {
    return object.isLine && typeof object.userData.pandauiObjectId === 'string' && this.isSelectable(object)
  }

  getCurvePolyline (object) {
    const position = object.geometry?.getAttribute('position')
    if (position == null || position.count < 2) return []
    const indices = object.geometry.getIndex()
    const pointIndices = []
    if (indices != null) {
      for (let index = 0; index + 1 < indices.count; index += 2) {
        const start = indices.getX(index)
        const end = indices.getX(index + 1)
        if (pointIndices.length === 0) pointIndices.push(start, end)
        else if (pointIndices[pointIndices.length - 1] === start) pointIndices.push(end)
        else return []
      }
    } else {
      for (let index = 0; index < position.count; index++) pointIndices.push(index)
    }
    object.updateWorldMatrix(true, false)
    const point = new THREE.Vector3()
    return pointIndices.map(index => {
      point.fromBufferAttribute(position, index)
      object.localToWorld(point)
      return [point.x, point.y, point.z]
    })
  }

  pickCurve (handler) {
    this.#objectPickHandler = null
    this.#curvePickHandler = handler
  }

  pickObject (handler) {
    this.#curvePickHandler = null
    this.#objectPickHandler = handler
  }

  clearCurveHighlight () {
    this.finishObjectSelection(true)
    this.parameterPicker?.finish(true)
    this.#curvePickHandler = null
    this.#objectPickHandler = null
    this.setSelectedObject(null)
  }

  async commitGumballTransform ({ object, marker, startWorldMatrix, endWorldMatrix }) {
    if (object.userData?.controlPointHandle) return this.#services.controlPoints.commit({ object, marker, startWorldMatrix, endWorldMatrix })
    if (object.userData?.sharedObject) {
      await window.PandaUISceneWorkspace.transform(object, endWorldMatrix.toArray())
      this.#services.refreshSelectionHighlight()
      return { object }
    }
    const inverse = new THREE.Matrix4().getInverse(startWorldMatrix)
    const delta = new THREE.Matrix4().multiplyMatrices(endWorldMatrix, inverse)
    const identity = new THREE.Matrix4()
    if (delta.elements.every((value, index) => Math.abs(value - identity.elements[index]) <= 1.0e-10)) {
      this.#services.refreshSelectionHighlight()
      return { object }
    }

    if (marker?.source === 'clipping-plane') {
      this.#services.syncClippingPlaneTransform?.(object)
      const before = marker.clippingPlaneState
      const after = this.#services.captureClippingPlaneState?.(marker.clippingPlaneId)
      if (before && after) this.#services.getOperations().recordClippingPlaneTransform(before, after)
      this.#services.refreshSelectionHighlight()
      return { object }
    }

    const backendEditable = marker?.documentId != null && marker?.geometryId != null &&
      marker?.poolGeneration != null && !['step-native', 'skp-native'].includes(marker.poolGeneration)
    if (!backendEditable) {
      const parentInverse = new THREE.Matrix4().getInverse(object.parent?.matrixWorld || new THREE.Matrix4())
      this.#services.getOperations().recordState('scene.transform',
        { marker, matrix: new THREE.Matrix4().multiplyMatrices(parentInverse, startWorldMatrix).toArray() },
        { marker, matrix: new THREE.Matrix4().multiplyMatrices(parentInverse, endWorldMatrix).toArray() }, 'Transform object')
      this.#services.refreshSelectionHighlight()
      return { object }
    }

    const elements = delta.elements
    const matrix = [
      elements[0], elements[4], elements[8], elements[12],
      elements[1], elements[5], elements[9], elements[13],
      elements[2], elements[6], elements[10], elements[14],
      elements[3], elements[7], elements[11], elements[15]
    ]
    const parentInverse = new THREE.Matrix4().getInverse(object.parent?.matrixWorld || new THREE.Matrix4())
    await this.#services.getOperations().executeModeling({
      documentId: marker.documentId, command: 'modeling.transform_geometry', geometryRef: marker.geometryRef, matrix
    }, {
      before: { marker, matrix: new THREE.Matrix4().multiplyMatrices(parentInverse, startWorldMatrix).toArray() },
      after: { marker, matrix: new THREE.Matrix4().multiplyMatrices(parentInverse, endWorldMatrix).toArray() }
    })
    this.#services.setDirtyFlag()
    return { object }
  }
parameterPicker = null
isPicking () { return !!(this.parameterPicker || this.#objectSelection) }
attachGumball (object, editable = !object?.userData?.readOnly) {
  if (object?.userData?.controlPointHandle) this.#gumballController?.setMode('translate')
  this.#gumballController?.attach(object, editable)
}
detachGumball () { this.#gumballController?.detach() }
setCamera (camera) { this.#gumballController?.setCamera(camera) }
setViewportSize (width, height) { this.#gumballController?.setViewportSize(width, height) }
updateModeling (action) {
  const methods = { plane: 'setConstructionPlane', grid: 'setGridSnap', 'grid-size': 'setGridSize', endpoint: 'setEndpointSnap', coordinates: 'submitCoordinates' }
  this.#modelingTool?.[methods[action.name]]?.(action.value)
  this.updateModelingPanel()
}
cancelPicking () { this.finishObjectSelection(true); this.parameterPicker?.finish(true) }
dispose () {
  this.cancelPicking()
  this.clearModelingPreview()
  this.#gumballController?.dispose()
  this.#gumballController = null
  this.#curvePickHandler = null
  this.#objectPickHandler = null
  this.#pointerDown = null
  this.#contextPointerDown = null
}
createSceneObjectMarker (...args) { return this.#services.createSceneObjectMarker(...args) }
getTransformTarget (...args) { return this.#services.getTransformTarget(...args) }
setGraphGeometry (...args) { return this.#services.setGraphGeometry(...args) }
removeGraphGeometry (...args) { return this.#services.removeGraphGeometry(...args) }
setSelectedObject (...args) { return this.#services.setSelectedObject(...args) }
}
