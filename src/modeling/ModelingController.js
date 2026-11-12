import PandaUIApp from '../PandaUIApp'
import * as THREE from 'three'
import browserCrypto from '../../public/editor/src/BrowserCrypto'

class ModelingController {
  constructor () {
    this.active = false
    this.startPoint = null
    this.busy = false
    this.documentId = null
    this.modeState = null
    this.geometryKeys = new Map()
    this.constructionPlane = 'XY'
    this.gridSnap = true
    this.gridSize = 1
    this.endpointSnap = true
  }

  toggleLineTool (modeState = null) {
    if (this.active) this.deactivate()
    else this.activateLineTool(modeState)
  }

  activateLineTool (modeState = null) {
    this.active = true
    this.startPoint = null
    this.modeState = modeState
    if (this.modeState != null) this.modeState.value = true
    PandaUIApp.getDisplayPipeline().setModelingTool(this)
  }

  deactivate () {
    this.active = false
    this.startPoint = null
    PandaUIApp.getDisplayPipeline().setModelingTool(null)
    if (this.modeState != null) this.modeState.value = false
    this.modeState = null
  }

  getConstructionPlane () {
    return this.constructionPlane
  }

  getSnapSettings () {
    return {
      gridSnap: this.gridSnap,
      gridSize: this.gridSize,
      endpointSnap: this.endpointSnap
    }
  }

  setConstructionPlane (value) {
    if (!['XY', 'XZ', 'YZ'].includes(value)) return
    this.constructionPlane = value
    this.clearCurrentPoint()
  }

  setGridSnap (value) {
    this.gridSnap = value === true
  }

  setGridSize (value) {
    const size = Number(value)
    if (Number.isFinite(size) && size > 0) this.gridSize = size
  }

  setEndpointSnap (value) {
    this.endpointSnap = value === true
  }

  submitCoordinates (values) {
    if (!Array.isArray(values) || values.length < 3) return false
    const coordinates = values.slice(0, 3).map(Number)
    if (coordinates.some(value => !Number.isFinite(value))) return false
    this.pointerClick(new THREE.Vector3(coordinates[0], coordinates[1], coordinates[2]))
    return true
  }

  clearCurrentPoint () {
    this.startPoint = null
    PandaUIApp.getDisplayPipeline().clearModelingPreview()
  }

  cancel () {
    if (this.startPoint != null) {
      this.clearCurrentPoint()
      return true
    }
    this.deactivate()
    return false
  }

  pointerMove (point) {
    if (!this.active || this.startPoint == null) return
    PandaUIApp.getDisplayPipeline().setModelingLinePreview(this.startPoint, point)
  }

  pointerClick (point) {
    if (!this.active || this.busy) return
    if (this.startPoint == null) {
      this.startPoint = point.clone()
      PandaUIApp.getDisplayPipeline().setModelingLinePreview(this.startPoint, this.startPoint)
      return
    }
    const start = this.startPoint.clone()
    const end = point.clone()
    this.startPoint = null
    PandaUIApp.getDisplayPipeline().clearModelingPreview()
    this.createLine(start, end)
  }

  async createLine (start, end) {
    if (start.distanceTo(end) <= 1.0e-9) return
    await this.execute({
      command: 'modeling.create_line',
      commandId: this.createId(),
      inputs: {
        start: [start.x, start.y, start.z],
        end: [end.x, end.y, end.z],
        name: 'Line'
      }
    })
  }

  undo () {
    return PandaUIApp.getDisplayPipeline().executeModelingHistory('modeling.undo')
  }

  redo () {
    return PandaUIApp.getDisplayPipeline().executeModelingHistory('modeling.redo')
  }

  async execute (command) {
    if (this.busy) return false
    this.busy = true
    try {
      const activeDocument = PandaUIApp.getActiveModel()
      const applied = await PandaUIApp.getOperations().executeModeling({
        documentId: this.documentId || activeDocument?.documentId || browserCrypto.randomUUID(),
        ...command
      })
      const result = applied.value
      this.documentId = result.documentId || this.documentId
      return true
    } catch (error) {
      console.error('Modeling command failed:', error)
      window.alert(error.message || 'Modeling command failed.')
      return false
    } finally {
      this.busy = false
    }
  }

  applyResult (result) {
    PandaUIApp.getDisplayPipeline().applyModelingResult(result, this.geometryKeys)
  }

  createId () {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()
    return 'line-' + Date.now() + '-' + Math.random().toString(16).slice(2)
  }
}

export default new ModelingController()
