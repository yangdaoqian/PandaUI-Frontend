import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls'
import { viewportControlSize } from './ViewportControlSize'

export default class GumballController {
  constructor ({ camera, domElement, parentElement, scene, orbitControls, getMarker, onChange, onDragState, onCommit }) {
    this.camera = camera
    this.domElement = domElement
    this.parentElement = parentElement
    this.scene = scene
    this.orbitControls = orbitControls
    this.getMarker = getMarker
    this.onChange = onChange
    this.onDragState = onDragState
    this.onCommit = onCommit
    this.object = null
    this.editable = true
    this.startState = null
    this.commitPending = false
    this.consumePointerUntil = 0
    this.mode = 'translate'
    this.snapEnabled = true
    this.snapValues = { translate: 1, rotate: 15, scale: 0.1 }
    this.pivot = new THREE.Object3D()
    this.pivot.name = 'PandaUI Gumball Pivot'
    this.pivot.userData.pandauiGumball = true
    scene.add(this.pivot)

    this.controls = new TransformControls(camera, domElement)
    this.controls.setMode(this.mode)
    this.controls.setSize(0.85)
    this.controls.visible = false
    this.viewportSize = { width: 1, height: 1 }
    this.baseControlSize = 0.85
    this.controls.userData.pandauiGumball = true
    this.controls.traverse(child => {
      child.userData.pandauiGumball = true
      if (child.material != null) {
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        materials.forEach(material => {
          material.depthTest = false
          material.depthWrite = false
          material.transparent = true
        })
      }
      child.renderOrder = 2500
    })
    scene.add(this.controls)

    this.panel = this.createPanel()
    parentElement.appendChild(this.panel)
    this.applySnapSettings()

    this.handleMouseDown = this.handleMouseDown.bind(this)
    this.handleMouseUp = this.handleMouseUp.bind(this)
    this.handlePointerMove = this.handlePointerMove.bind(this)
    this.handleObjectChange = this.handleObjectChange.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.controls.addEventListener('mouseDown', this.handleMouseDown)
    this.controls.addEventListener('mouseUp', this.handleMouseUp)
    this.controls.addEventListener('objectChange', this.handleObjectChange)
    this.domElement.addEventListener('pointermove', this.handlePointerMove, true)
    this.domElement.addEventListener('mousemove', this.handlePointerMove, true)
    document.addEventListener('keydown', this.handleKeyDown, true)
  }

  createPanel () {
    const panel = document.createElement('div')
    Object.assign(panel.style, {
      position: 'absolute',
      display: 'none',
      right: '12px',
      bottom: '12px',
      zIndex: '76',
      width: '260px',
      padding: '9px',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: '5px',
      background: 'rgba(35, 40, 46, 0.62)',
      backdropFilter: 'blur(8px)',
      webkitBackdropFilter: 'blur(8px)',
      color: '#eef4f7',
      font: '12px/1.35 Arial, sans-serif',
      boxShadow: '0 5px 18px rgba(0, 0, 0, 0.28)',
      pointerEvents: 'auto'
    })

    const createRow = () => {
      const row = document.createElement('div')
      Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px' })
      return row
    }
    const styleButton = button => Object.assign(button.style, {
      flex: '1',
      height: '26px',
      padding: '2px 6px',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: '3px',
      background: 'rgba(0, 0, 0, 0.18)',
      color: '#eef4f7',
      cursor: 'pointer'
    })
    const styleInput = input => Object.assign(input.style, {
      minWidth: '0',
      width: '58px',
      height: '25px',
      padding: '2px 5px',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      borderRadius: '3px',
      background: 'rgba(0, 0, 0, 0.22)',
      color: '#eef4f7'
    })

    const title = document.createElement('div')
    title.textContent = 'Gumball'
    Object.assign(title.style, { marginBottom: '8px', fontWeight: '600' })
    panel.appendChild(title)

    const modeRow = createRow()
    this.modeButtons = {}
    ;[
      ['translate', 'Move · W'],
      ['rotate', 'Rotate · E'],
      ['scale', 'Scale · R']
    ].forEach(([mode, text]) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = text
      styleButton(button)
      button.addEventListener('click', () => this.setMode(mode))
      this.modeButtons[mode] = button
      modeRow.appendChild(button)
    })
    panel.appendChild(modeRow)

    const valueRow = createRow()
    this.valueInputs = ['X', 'Y', 'Z'].map(axis => {
      const input = document.createElement('input')
      input.type = 'number'
      input.step = 'any'
      input.placeholder = axis
      input.title = `${axis} value`
      styleInput(input)
      valueRow.appendChild(input)
      return input
    })
    const applyButton = document.createElement('button')
    applyButton.type = 'button'
    applyButton.textContent = 'Apply'
    styleButton(applyButton)
    applyButton.style.flex = '0 0 58px'
    applyButton.addEventListener('click', () => this.applyNumericValues())
    this.valueInputs.forEach(input => input.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      this.applyNumericValues()
    }))
    valueRow.appendChild(applyButton)
    panel.appendChild(valueRow)

    const snapRow = createRow()
    const snapToggle = document.createElement('input')
    snapToggle.type = 'checkbox'
    snapToggle.checked = this.snapEnabled
    snapToggle.addEventListener('change', () => {
      this.snapEnabled = snapToggle.checked
      this.applySnapSettings()
    })
    const snapLabel = document.createElement('label')
    snapLabel.textContent = 'Snap'
    snapLabel.appendChild(snapToggle)
    Object.assign(snapLabel.style, { display: 'flex', flexDirection: 'row-reverse', gap: '4px', alignItems: 'center' })
    const snapValue = document.createElement('input')
    snapValue.type = 'number'
    snapValue.min = '0.000001'
    snapValue.step = 'any'
    styleInput(snapValue)
    snapValue.addEventListener('change', () => {
      const value = Number(snapValue.value)
      if (Number.isFinite(value) && value > 0) this.snapValues[this.mode] = value
      this.updatePanel()
      this.applySnapSettings()
    })
    const snapUnit = document.createElement('span')
    snapUnit.style.color = 'rgba(238, 244, 247, 0.72)'
    snapRow.append(snapLabel, snapValue, snapUnit)
    panel.appendChild(snapRow)
    this.snapToggle = snapToggle
    this.snapValueInput = snapValue
    this.snapUnit = snapUnit

    const hint = document.createElement('div')
    hint.textContent = 'Drag axes or enter absolute values'
    hint.style.color = 'rgba(238, 244, 247, 0.64)'
    panel.appendChild(hint)
    this.updateModeButtons()
    return panel
  }

  setEditable (editable) {
    this.editable = editable !== false
    this.controls.enabled = this.editable
    const controls = [...Object.values(this.modeButtons || {}), ...(this.valueInputs || []), this.snapToggle, this.snapValueInput]
    controls.filter(Boolean).forEach(control => { control.disabled = !this.editable })
    if (this.object?.userData?.controlPointHandle) {
      for (const mode of ['rotate', 'scale']) if (this.modeButtons?.[mode]) this.modeButtons[mode].disabled = true
    }
    if (this.panel) this.panel.style.opacity = this.editable ? '1' : '0.72'
  }

  setCamera (camera) {
    if (camera == null) return
    this.camera = camera
    this.controls.camera = camera
    this.controls.updateMatrixWorld(true)
  }

  setViewportSize (width, height) {
    const safeWidth = Math.max(1, Number(width) || 1)
    const safeHeight = Math.max(1, Number(height) || 1)
    this.viewportSize = { width: safeWidth, height: safeHeight }
    this.controls.setSize(viewportControlSize(safeWidth, safeHeight))
  }
  attach (object, editable = true) {
    if (object == null || object.parent == null) return this.detach()
    this.object = object
    this.setEditable(editable)
    object.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(object)
    const center = bounds.isEmpty() ? object.getWorldPosition(new THREE.Vector3()) : bounds.getCenter(new THREE.Vector3())
    this.pivot.position.copy(center)
    this.pivot.quaternion.identity()
    this.pivot.scale.set(1, 1, 1)
    this.pivot.updateMatrixWorld(true)
    this.controls.attach(this.pivot)
    this.controls.visible = true
    this.controls.updateMatrixWorld(true)
    this.panel.style.display = 'block'
    this.updatePanel()
  }

  detach () {
    this.object = null
    this.startState = null
    this.setEditable(true)
    this.controls.detach()
    this.controls.visible = false
    this.domElement.style.cursor = ''
    this.panel.style.display = 'none'
  }

  dispose () {
    document.removeEventListener('keydown', this.handleKeyDown, true)
    this.domElement.removeEventListener('pointermove', this.handlePointerMove, true)
    this.domElement.removeEventListener('mousemove', this.handlePointerMove, true)
    this.controls.removeEventListener('mouseDown', this.handleMouseDown)
    this.controls.removeEventListener('mouseUp', this.handleMouseUp)
    this.controls.removeEventListener('objectChange', this.handleObjectChange)
    this.controls.detach()
    this.scene.remove(this.controls)
    this.scene.remove(this.pivot)
    this.controls.dispose()
    this.panel.remove()
  }

  setMode (mode) {
    if (!['translate', 'rotate', 'scale'].includes(mode)) return
    if (this.object?.userData?.controlPointHandle && mode !== 'translate') return
    this.mode = mode
    this.controls.setMode(mode)
    this.updateModeButtons()
    this.updatePanel()
    this.applySnapSettings()
    this.onChange?.()
  }

  applySnapSettings () {
    this.controls.setTranslationSnap(this.snapEnabled ? this.snapValues.translate : null)
    this.controls.setRotationSnap(this.snapEnabled ? THREE.MathUtils.degToRad(this.snapValues.rotate) : null)
    this.controls.setScaleSnap(this.snapEnabled ? this.snapValues.scale : null)
  }

  updateModeButtons () {
    if (this.modeButtons == null) return
    Object.entries(this.modeButtons).forEach(([mode, button]) => {
      const active = mode === this.mode
      button.style.borderColor = active ? 'rgba(49, 204, 236, 0.8)' : 'rgba(255, 255, 255, 0.18)'
      button.style.background = active ? 'rgba(49, 204, 236, 0.18)' : 'rgba(0, 0, 0, 0.18)'
    })
  }

  updatePanel () {
    if (this.object == null || this.valueInputs == null) return
    const values = this.mode === 'translate'
      ? [this.pivot.position.x, this.pivot.position.y, this.pivot.position.z]
      : this.mode === 'rotate'
        ? [this.pivot.rotation.x, this.pivot.rotation.y, this.pivot.rotation.z].map(THREE.MathUtils.radToDeg)
        : [this.pivot.scale.x, this.pivot.scale.y, this.pivot.scale.z]
    values.forEach((value, index) => { this.valueInputs[index].value = Number(value.toFixed(6)).toString() })
    this.snapToggle.checked = this.snapEnabled
    this.snapValueInput.value = String(this.snapValues[this.mode])
    this.snapUnit.textContent = this.mode === 'rotate' ? 'degrees' : this.mode === 'scale' ? 'factor' : 'units'
  }

  beginTransform () {
    if (this.object == null || this.startState != null) return
    this.object.updateWorldMatrix(true, false)
    this.pivot.updateWorldMatrix(true, false)
    this.startState = {
      marker: this.getMarker?.(this.object),
      worldMatrix: this.object.matrixWorld.clone(),
      pivotWorldMatrix: this.pivot.matrixWorld.clone(),
      position: this.object.position.clone(),
      quaternion: this.object.quaternion.clone(),
      scale: this.object.scale.clone(),
      pivotPosition: this.pivot.position.clone(),
      pivotQuaternion: this.pivot.quaternion.clone(),
      pivotScale: this.pivot.scale.clone()
    }
    this.onDragState?.(true)
  }

  async finishTransform () {
    if (this.object == null || this.startState == null || this.commitPending) return
    const object = this.object
    const state = this.startState
    this.startState = null
    object.updateWorldMatrix(true, false)
    const endWorldMatrix = object.matrixWorld.clone()
    this.consumePointerUntil = performance.now() + 100
    this.onDragState?.(false)
    this.updatePanel()
    this.commitPending = true
    try {
      const replacement = await this.onCommit?.({ object, marker: state.marker, startWorldMatrix: state.worldMatrix, endWorldMatrix })
      if (replacement?.object != null) this.attach(replacement.object, !replacement.object.userData?.readOnly)
      else if (this.object === object) this.updatePanel()
    } catch (error) {
      object.position.copy(state.position)
      object.quaternion.copy(state.quaternion)
      object.scale.copy(state.scale)
      object.updateMatrixWorld(true)
      this.pivot.position.copy(state.pivotPosition)
      this.pivot.quaternion.copy(state.pivotQuaternion)
      this.pivot.scale.copy(state.pivotScale)
      this.pivot.updateMatrixWorld(true)
      this.updatePanel()
      this.onChange?.()
      console.error('Gumball transform failed:', error)
      window.alert(error.message || 'Gumball transform failed.')
    } finally {
      this.commitPending = false
    }
  }

  applyNumericValues () {
    if (!this.editable || this.object == null || this.commitPending) return
    let values = this.valueInputs.map(input => Number(input.value))
    if (values.some(value => !Number.isFinite(value))) return
    const snap = this.snapEnabled ? this.snapValues[this.mode] : 0
    if (snap > 0) values = values.map(value => Math.round(value / snap) * snap)
    if (this.mode === 'scale' && values.some(value => Math.abs(value) < 1.0e-9)) return
    this.beginTransform()
    if (this.mode === 'translate') this.pivot.position.set(...values)
    else if (this.mode === 'rotate') this.pivot.rotation.set(...values.map(THREE.MathUtils.degToRad))
    else this.pivot.scale.set(...values)
    this.pivot.updateMatrixWorld(true)
    this.applyPivotTransform()
    this.onChange?.()
    this.finishTransform()
  }

  handleMouseDown () {
    this.consumePointerUntil = performance.now() + 100
    this.orbitControls.enabled = false
    this.beginTransform()
  }

  handlePointerMove (event) {
    if (!this.controls.visible || !this.controls.enabled || event.pointerType === 'touch') return
    const rect = this.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    this.controls.updateMatrixWorld(true)
    this.controls.pointerHover({
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      button: -1
    })
    this.domElement.style.cursor = this.controls.axis == null ? '' : 'pointer'
  }

  handleMouseUp () {
    this.orbitControls.enabled = true
    this.finishTransform()
  }

  handleObjectChange () {
    this.applyPivotTransform()
    this.updatePanel()
    this.onChange?.()
  }

  applyPivotTransform () {
    if (this.object == null || this.startState == null) return
    this.pivot.updateWorldMatrix(true, false)
    const pivotInverse = new THREE.Matrix4().getInverse(this.startState.pivotWorldMatrix)
    const delta = new THREE.Matrix4().multiplyMatrices(this.pivot.matrixWorld, pivotInverse)
    const nextWorld = new THREE.Matrix4().multiplyMatrices(delta, this.startState.worldMatrix)
    const parentInverse = new THREE.Matrix4()
    if (this.object.parent != null) {
      this.object.parent.updateWorldMatrix(true, false)
      parentInverse.getInverse(this.object.parent.matrixWorld)
    }
    const nextLocal = new THREE.Matrix4().multiplyMatrices(parentInverse, nextWorld)
    nextLocal.decompose(this.object.position, this.object.quaternion, this.object.scale)
    this.object.updateMatrix()
    this.object.updateMatrixWorld(true)
  }

  handleKeyDown (event) {
    if (!this.editable || this.object == null) return
    const editable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || event.target?.isContentEditable === true
    if (editable || event.ctrlKey || event.metaKey || event.altKey) return
    const key = event.key.toLowerCase()
    const mode = key === 'w' ? 'translate' : key === 'e' ? 'rotate' : key === 'r' ? 'scale' : null
    if (mode != null) {
      event.preventDefault()
      event.stopPropagation()
      this.setMode(mode)
    } else if (key === 's') {
      event.preventDefault()
      event.stopPropagation()
      this.snapEnabled = !this.snapEnabled
      this.applySnapSettings()
      this.updatePanel()
    }
  }

  consumesPointerUp () {
    return performance.now() <= this.consumePointerUntil
  }

  isTransforming () {
    return this.controls?.visible === true && this.controls?.dragging === true
  }

  isHoveringHandle () {
    return this.controls?.visible === true && this.controls?.axis != null
  }

  containsElement (element) {
    return element instanceof Node && this.panel.contains(element)
  }
}
