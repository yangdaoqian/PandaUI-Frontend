import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import CursorWheelZoom from './CursorWheelZoom'
import { fitCameraToBounds, updateCameraDepth } from './CameraFraming'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { expandVisibleSceneBounds } from './SceneBounds'
import PandaUIApp from './PandaUIApp'
import DisplayMode from './DisplayMode'
import SceneUtilities from './SceneUtilities'
import AdaptiveViewport from './AdaptiveViewport'
import EdgeDisplayRenderer from './EdgeDisplayRenderer'
import ClippingPlaneDisplay from './ClippingPlaneDisplay'
import { ensureShadingHeadlight } from './DisplayLighting'
import { applyRenderMaterialSettings, applyShadingMaterialSettings, createDefaultRenderSettings, createDefaultShadingSettings, normalizeRenderSettings, normalizeShadingSettings } from './DisplayMaterialSettings'
import GraphPreviewRegistry from './display/GraphPreviewRegistry'
import SceneMaterialEditor from './display/SceneMaterialEditor'
import SceneSelection from './display/SceneSelection'
import GroupEditContext from './display/GroupEditContext'
import SceneVisibility from './display/SceneVisibility'
import SceneInteraction from './display/SceneInteraction'
import ControlPointController from './modeling/ControlPointController'
import SubDDisplayController from './modeling/SubDDisplayController'
import ImportedMaterialEditor from './render/ImportedMaterialEditor'
import ObjectUVEditor from './render/ObjectUVEditor'
import { resolveSceneReference } from './render/SceneObjectReference'
import { renderBindingTargetIds, resolveRenderBindingTargets } from './render/RenderBindingTargets'
import ControlPointGeometrySource from './modeling/ControlPointGeometrySource'
import NodeCClient from './compute/NodeCClient.mjs'
import RenderEngine from './render/RenderEngine'
import displayMemorySnapshot from './display/DisplayMemorySnapshot'
import { inspectGpuPreference } from './display/GpuPreference'

export default class DisplayPipeline {
  #previews
  #materials
  #selection
  #groups
  #visibility
  #interaction
  #controlPoints
  #subdDisplay
  #importedMaterials
  #objectUV
  #ui = null
  #renderer = null
  #labelRenderer = null
  #camera = null
  #controls = null
  #cursorWheelZoom = null
  #parentElement = null // parent DOM element on page that the WebGL control is added to
  #frameSize = [0, 0]
  #resizeObserver = null
  #pixelRatioQuery = null
  #adaptiveViewport = null
  #edgeDisplay = new EdgeDisplayRenderer()
  #clippingDisplay = new ClippingPlaneDisplay()
  #viewportHelperScene = new THREE.Scene()
  #activeClippingPlanes = []
  #contextLost = false
  #environmentTargets = new Map()
  #disposed = false
  #viewportStatusTime = 0
  #backgroundScene = new THREE.Scene()
  #backgroundTexture = null
  #backgroundSignature = ''

  #sceneRevision = 0
  #sceneBoundsRevision = -1
  #sceneBounds = null

  #renderedDocumentScene = null
  #renderedDocumentRevision = -1
  #frameTimings = {}

  #renderEnvironment = null
  #defaultRenderEnvironment = null
  #shadingEnvironment = null
  #dirtyFlag = false
  #shadingSettings = createDefaultShadingSettings()
  #renderSettings = createDefaultRenderSettings()
  #graphRenderEnabled = false
  #nodeRenderer = null

  constructor (parentElement) {
    console.log('create pipeline')
    THREE.Object3D.DefaultUp = new THREE.Vector3(0, 0, 1)
    const initialWidth = Math.max(1, Math.round(parentElement.clientWidth))
    const initialHeight = Math.max(1, Math.round(parentElement.clientHeight))
    this.#renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' })
    this.#adaptiveViewport = new AdaptiveViewport(this.#renderer)
    this.#renderer.shadowMap.enabled = true
    this.#renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.#renderer.outputEncoding = THREE.sRGBEncoding
    this.#renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.#renderer.toneMappingExposure = 1
    this.#renderer.setPixelRatio(this.viewportPixelRatio(initialWidth, initialHeight))
    this.#renderer.setSize(initialWidth, initialHeight)
    this.#parentElement = parentElement
    this.#parentElement.innerHTML = '' // workaround to hide logo
    if (window.getComputedStyle(this.#parentElement).position === 'static') this.#parentElement.style.position = 'relative'
    this.#parentElement.appendChild(this.#renderer.domElement)

    this.#ui = PandaUIApp.getViewportUi()
    this.#ui.setActions({
      'hide-menu': () => this.hideContextMenu(),
      'zoom-selected': () => this.zoomSelected(false),
      'hide-selected': () => this.hideSelectedObject(),
      'control-points-on': () => this.#controlPoints.start(this.getSelectedObjectRoot()),
      'control-points-off': () => this.#controlPoints.stop(),
      'show-object': action => this.showHiddenObject(this.resolveSceneObjects(action.marker)[0]),
      'show-all': () => this.showAllHiddenObjects(),
      modeling: action => this.#interaction.updateModeling(action)
    })
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    document.addEventListener('keydown', this.onDocumentKeyDown, true)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    window.addEventListener('blur', this.hideContextMenu)

    this.#labelRenderer = new CSS2DRenderer()
    this.#labelRenderer.domElement.id = 'labels'
    this.#labelRenderer.setSize(initialWidth, initialHeight)
    this.#labelRenderer.domElement.style.position = 'absolute'
    this.#labelRenderer.domElement.style.top = 0
    this.#labelRenderer.domElement.style.pointerEvents = 'none'
    parentElement.appendChild(this.#labelRenderer.domElement)

    this.#camera = new THREE.PerspectiveCamera(45, initialWidth / initialHeight, 1, 1000)
    this.#camera.position.z = 40
    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement)
    this.#controls.screenSpacePanning = true
    this.#controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    this.#controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE
    this.#controls.addEventListener('change', () => {
      this.#adaptiveViewport.noteInteraction()
      this.setDirtyFlag(false)
    })
    this.#cursorWheelZoom = new CursorWheelZoom(this.#controls, () => {
      this.#adaptiveViewport.noteInteraction()
      this.setDirtyFlag(false)
    })
    this.#frameSize = [initialWidth, initialHeight]

    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver(() => {
        this.resizeViewport()
        this.setDirtyFlag(false)
      })
      this.#resizeObserver.observe(this.#parentElement)
    }

    // Ensure the canvas and parent allow pointer interactions by default.
    try {
      this.#renderer.domElement.style.pointerEvents = 'auto'
      this.#renderer.domElement.tabIndex = 0
      this.#renderer.domElement.style.touchAction = 'none'
      this.#renderer.domElement.style.webkitTouchCallout = 'none'
      this.#parentElement.style.pointerEvents = 'auto'
    } catch (e) { /* ignore on read-only environments */ }

    this.#renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.#renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.#renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.#renderer.domElement.addEventListener('pointercancel', this.onPointerCancel)
    this.#renderer.domElement.addEventListener('dblclick', this.onDoubleClick)
    this.#renderer.domElement.addEventListener('contextmenu', this.onContextMenu)

    this.#renderer.domElement.addEventListener('auxclick', this.onAuxiliaryClick)
    this.#renderer.domElement.addEventListener('mousedown', this.onNavigationMouseButton, true)
    this.#renderer.domElement.addEventListener('mouseup', this.onNavigationMouseButton, true)
    this.#renderer.domElement.addEventListener('webglcontextlost', this.onContextLost)
    this.#renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored)

    // A neutral studio environment gives physical materials visible metal
    // reflections and glass transmission without changing the viewport's
    // user-configured background.
    const environmentScene = new RoomEnvironment()
    const pmremGenerator = new THREE.PMREMGenerator(this.#renderer)
    this.#renderEnvironment = this.retainEnvironmentTarget(pmremGenerator.fromScene(environmentScene, 0.04))
    this.#defaultRenderEnvironment = this.#renderEnvironment
    pmremGenerator.dispose()
    environmentScene.traverse((object) => {
      if (object.geometry != null) object.geometry.dispose()
      if (object.material != null) object.material.dispose()
    })

    // Node-produced meshes are rendered in an overlay scene, so give that
    // scene the same neutral viewport lighting used by imported geometry.

    this.#previews = new GraphPreviewRegistry({
      getOperations: () => PandaUIApp.getOperations(),
      setDirtyFlag: (...args) => this.setDirtyFlag(...args),
      getActiveModel: (...args) => PandaUIApp.getActiveModel(...args),
      getModelDocuments: () => PandaUIApp.modelDocuments(),
      getSelectedObjectRoot: (...args) => this.getSelectedObjectRoot(...args),
      clearGroupEditMode: (...args) => this.clearGroupEditMode(...args),
      setSelectedObject: (...args) => this.setSelectedObject(...args),
      zoomExtentsWithoutRhino: (...args) => this.zoomExtentsWithoutRhino(...args),
      getSelectedObject: () => this.#selection.object,
      applyDisplaySettings: (...args) => this.applyDisplaySettings(...args),
      getShadingSettings: () => this.#shadingSettings,
      getRenderSettings: () => this.#renderSettings,
      isRenderEnabled: () => this.#graphRenderEnabled,
      clippingDisplay: this.#clippingDisplay,
      getCurrentGroupEditContext: (...args) => this.getCurrentGroupEditContext(...args),
      isDescendantOf: (...args) => this.isDescendantOf(...args),
      directChildUnder: (...args) => this.directChildUnder(...args),
      refreshSelectionHighlight: (...args) => this.refreshSelectionHighlight(...args)
    })
    this.#materials = new SceneMaterialEditor({
      getActiveModel: () => PandaUIApp.getActiveModel(),
      getModelDocuments: () => PandaUIApp.modelDocuments(),
      getSelectedObjectRoot: (...args) => this.getSelectedObjectRoot(...args),
      createSceneObjectMarker: (...args) => this.createSceneObjectMarker(...args),
      resolveSceneObjects: (...args) => this.resolveSceneObjects(...args),
      getRenderMaterial: (...args) => PandaUIApp.getRenderMaterial(...args),
      isRenderEnabled: () => this.#graphRenderEnabled,
      notifySelectionChanged: (...args) => PandaUIApp.notifySelectionChanged(...args),
      setDirtyFlag: (...args) => this.setDirtyFlag(...args),
      viewModel: (...args) => PandaUIApp.viewModel(...args),
      getOperations: (...args) => PandaUIApp.getOperations(...args),
      getSelectedObject: () => this.#selection.object
    })
    this.#selection = new SceneSelection({
      getActiveModel: (...args) => PandaUIApp.getActiveModel(...args),
      notifySelectionChanged: (...args) => PandaUIApp.notifySelectionChanged(...args),
      setDirtyFlag: (...args) => this.setDirtyFlag(...args),
      captureSelection: object => this.#materials.captureSelection(object),
      getPreviewScene: () => this.#previews.scene,
      getSelectionScene: object => this.#clippingDisplay.getTransformTarget(object) || this.#previews.scene,
      isPicking: () => this.#interaction.isPicking(),
      attachGumball: object => this.#interaction.attachGumball(object),
      getTransformTarget: (...args) => this.getTransformTarget(...args),
      materializeRenderObject: object => PandaUIApp.modelDocuments().forEach(doc => doc.materializeRenderObject?.(object)),
      restoreRenderBatches: () => PandaUIApp.modelDocuments().forEach(doc => doc.restoreRenderBatches?.()),
      getSelectedMaterialSettings: (...args) => this.getSelectedMaterialSettings(...args),
      ui: this.#ui,
      detachGumball: () => this.#interaction.detachGumball(),
      clearMaterialSelection: () => this.#materials.clearSelection()
    })
    this.#groups = new GroupEditContext({
      getTransformTarget: (...args) => this.getTransformTarget(...args),
      setSelectedObject: (...args) => this.setSelectedObject(...args),
      setDirtyFlag: (...args) => this.setDirtyFlag(...args),
      getSceneRevision: () => this.#sceneRevision,
      getPreviewScene: () => this.#previews.scene,
      getActiveModel: (...args) => PandaUIApp.getActiveModel(...args),
      getSelectionHighlight: () => this.#selection.highlight
    })
    this.#controlPoints = new ControlPointController({
      helperScene: this.#viewportHelperScene,
      domElement: this.#renderer.domElement,
      getCamera: () => this.#camera,
      getModelDocuments: () => PandaUIApp.modelDocuments(),
      getOperations: () => PandaUIApp.getOperations(),
      source: new ControlPointGeometrySource({ getModule: () => PandaUIApp.getNodeC() }),
      client: new NodeCClient(),
      attachGumball: object => this.#interaction.attachGumball(object),
      detachGumball: () => this.#interaction?.detachGumball(),
      selectObject: object => this.setSelectedObject(object),
      status: text => { this.#ui.state.status = text },
      setDirtyFlag: (...args) => this.setDirtyFlag(...args),
      refreshSelectionHighlight: () => this.refreshSelectionHighlight()
    })
    this.#subdDisplay = new SubDDisplayController(this.#controlPoints)
    this.#importedMaterials = new ImportedMaterialEditor({
      renderer: this.#renderer,
      documents: () => this.renderDocuments(),
      source: mesh => this.#nodeRenderer?.resources.sourceMaterial(mesh) || mesh.userData.displayMaterials?.render || mesh.material,
      edit: action => this.#nodeRenderer?.resources ? this.#nodeRenderer.resources.editSourceMaterials(action) : action(),
      invalidate: () => this.setDirtyFlag()
    })
    this.#objectUV = new ObjectUVEditor({
      documents: () => this.renderDocuments(),
      record: (before, after, label) => PandaUIApp.getOperations().recordState('scene.uv', before, after, label),
      invalidate: () => { this.refreshSelectionHighlight(); this.setDirtyFlag() }
    })
    this.#visibility = new SceneVisibility({
      controlPoints: this.#controlPoints,
      documentTreeObjects: (...args) => this.documentTreeObjects(...args),
      getSelectedObjectRoot: (...args) => this.getSelectedObjectRoot(...args),
      setSelectedObject: (...args) => this.setSelectedObject(...args),
      setDirtyFlag: (...args) => this.setDirtyFlag(...args),
      getOperations: (...args) => PandaUIApp.getOperations(...args),
      getModelDocuments: () => PandaUIApp.modelDocuments(),
      getPreviewScene: () => this.#previews.scene,
      createSceneObjectMarker: (...args) => this.createSceneObjectMarker(...args),
      ui: this.#ui,
      getSelectedObject: () => this.#selection.object,
      getTransformTarget: (...args) => this.getTransformTarget(...args),
      resolveSceneObjects: (...args) => this.resolveSceneObjects(...args)
    })
    this.#interaction = new SceneInteraction({
      controlPoints: this.#controlPoints,
      getCamera: () => this.#camera,
      domElement: this.#renderer.domElement,
      parentElement: this.#parentElement,
      helperScene: this.#viewportHelperScene,
      controls: this.#controls,
      setDirtyFlag: (...args) => this.setDirtyFlag(...args),
      getSelectedObject: () => this.#selection.object,
      updateSelectionHighlightForTransform: (...args) => this.updateSelectionHighlightForTransform(...args),
      getViewportSize: () => this.#frameSize,
      ui: this.#ui,
      getPreviewScene: () => this.#previews.scene,
      getClippingDisplayScene: () => this.#clippingDisplay.scene,
      showContextMenu: (...args) => this.showContextMenu(...args),
      executeModelingHistory: (...args) => this.executeModelingHistory(...args),
      getTransformTarget: (...args) => this.getTransformTarget(...args),
      getActiveModel: (...args) => PandaUIApp.getActiveModel(...args),
      resolveRenderBatchHit: hit => PandaUIApp.modelDocuments().reduce((resolved, doc) => doc.resolveRenderBatchHit?.(resolved) || resolved, hit),
      getCurrentGroupEditContext: (...args) => this.getCurrentGroupEditContext(...args),
      exitGroupEditLevel: (...args) => this.exitGroupEditLevel(...args),
      findEnterableGroup: (...args) => this.findEnterableGroup(...args),
      enterGroupEditLevel: (...args) => this.enterGroupEditLevel(...args),
      getClippingPlanes: () => this.#activeClippingPlanes,
      syncClippingPlaneTransform: object => {
        const changed = this.#clippingDisplay.syncObjectTransform(object)
        if (changed) this.setDirtyFlag()
        return changed
      },
      captureClippingPlaneState: id => this.#clippingDisplay.captureTransformState(id),
      getSelectionHighlight: () => this.#selection.highlight,
      isDescendantOf: (...args) => this.isDescendantOf(...args),
      refreshSelectionHighlight: (...args) => this.refreshSelectionHighlight(...args),
      getOperations: (...args) => PandaUIApp.getOperations(...args),
      createSceneObjectMarker: (...args) => this.createSceneObjectMarker(...args),
      deleteSceneObject: root => window.PandaUISceneWorkspace
        ? window.PandaUISceneWorkspace.deleteObject(root)
        : this.removeSharedSource(root),
      setGraphGeometry: (...args) => this.setGraphGeometry(...args),
      removeGraphGeometry: (...args) => this.removeGraphGeometry(...args),
      setSelectedObject: (...args) => this.setSelectedObject(...args)
    })
    this.#materials.observeOperations()
    this.onPixelRatioChange()
  }

  dispose () {
    this.#disposed = true
    this.#nodeRenderer?.dispose()
    this.#controlPoints.dispose()
    this.#subdDisplay.dispose()
    this.#importedMaterials.dispose()
    this.#objectUV.dispose()
    this.finishObjectSelection(true)
    this.#interaction.cancelPicking()
    this.#pixelRatioQuery?.removeEventListener('change', this.onPixelRatioChange)
    console.log('dispose pipeline')
    this.#adaptiveViewport.dispose()
    this.#edgeDisplay.dispose()
    this.#clippingDisplay.dispose()
    this.#renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost)
    this.#renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored)
    if (this.#resizeObserver != null) {
      this.#resizeObserver.disconnect()
      this.#resizeObserver = null
    }
    this.#renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.#renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.#renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.#renderer.domElement.removeEventListener('pointercancel', this.onPointerCancel)
    this.#renderer.domElement.removeEventListener('dblclick', this.onDoubleClick)
    this.#renderer.domElement.removeEventListener('contextmenu', this.onContextMenu)
    this.#renderer.domElement.removeEventListener('auxclick', this.onAuxiliaryClick)
    this.#renderer.domElement.removeEventListener('mousedown', this.onNavigationMouseButton, true)
    this.#renderer.domElement.removeEventListener('mouseup', this.onNavigationMouseButton, true)
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true)
    document.removeEventListener('keydown', this.onDocumentKeyDown, true)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('blur', this.hideContextMenu)
    this.clearModelingPreview()
    this.#cursorWheelZoom?.dispose()
    this.#controls.dispose()
    this.restoreSelectedObject()
    this.clearGroupEditMode()
    this.#interaction.dispose()
    this.#materials.dispose()
    this.clearGroupEditBounds()
    this.#previews.dispose()
    this.#renderer.domElement.remove()
    this.#labelRenderer.domElement.remove()
    this.#ui.dispose()
    this.#visibility.reset()
    for (const target of this.#environmentTargets.values()) target.dispose()
    this.#environmentTargets.clear()
    this.#backgroundTexture?.dispose()
    this.#backgroundTexture = null
    this.#backgroundScene.traverse(object => {
      object.geometry?.dispose()
      if (Array.isArray(object.material)) object.material.forEach(material => material?.dispose())
      else object.material?.dispose()
    })
    this.#renderer.dispose()
    this.#renderer.forceContextLoss()
  }

  onContextLost = (event) => {
    event.preventDefault()
    this.#contextLost = true
    PandaUIApp.stopRenderLoop()
    console.error('WebGL context lost. The browser does not report whether this was caused by memory pressure or a GPU reset.', this.getDisplayMemoryDiagnostics())
    this.#edgeDisplay.dispose()
    this.#ui.state.status = 'Rendering paused: graphics context lost. Waiting for GPU recovery.'
  }

  onContextRestored = () => {
    this.#contextLost = false
    this.#ui.state.status = ''
    const settings = this.#adaptiveViewport.settings
    this.#adaptiveViewport.dispose()
    this.#adaptiveViewport = new AdaptiveViewport(this.#renderer)
    this.#adaptiveViewport.configure(settings)
    this.#renderer.shadowMap.needsUpdate = true
    this.setDirtyFlag()
    PandaUIApp.startRenderLoop()
  }

  retainEnvironmentTarget (target) {
    this.#environmentTargets.set(target.texture, target)
    return target.texture
  }

  disposeEnvironmentTexture (texture) {
    const target = this.#environmentTargets.get(texture)
    if (target) { target.dispose(); this.#environmentTargets.delete(texture) } else texture?.dispose()
  }

  setClippingPlane (id, descriptor) {
    if (!descriptor) return this.removeClippingPlane(id)
    const result = this.#clippingDisplay.set(id, descriptor)
    this.#clippingDisplay.setPreviewVisible(id, this.#previews.isNodeVisible(id))
    this.refreshClippingPlaneSelection(id)
    this.setDirtyFlag()
    return result
  }

  removeClippingPlane (id) {
    if (String(this.#selection.object?.userData?.clippingPlaneId) === String(id)) this.setSelectedObject(null)
    const removed = this.#clippingDisplay.remove(id)
    if (removed) this.setDirtyFlag()
    return removed
  }

  applyClippingPlaneState = state => {
    const changed = this.#clippingDisplay.applyTransformState(state)
    if (changed) {
      this.refreshClippingPlaneSelection(state.clippingPlaneId)
      this.setDirtyFlag()
    }
    return changed
  }

  refreshClippingPlaneSelection (id) {
    const selected = this.#selection.object
    if (!selected || String(selected.userData?.clippingPlaneId) !== String(id)) return
    const target = this.#clippingDisplay.getTransformTarget(selected)
    if (!target?.visible) { this.setSelectedObject(null); return }
    this.#selection.refreshSelectionHighlight()
    this.#interaction.attachGumball(target)
  }

  getDisplayMemoryDiagnostics (detailed = false) {
    const gl = this.#renderer.getContext?.()
    const adapter = detailed && gl?.getExtension('WEBGL_debug_renderer_info')
    return { geometries: this.#renderer.info.memory.geometries,
      textures: this.#renderer.info.memory.textures,
      programs: this.#renderer.info.programs?.length || 0,
      render: { ...this.#renderer.info.render },
      edgeCache: this.#edgeDisplay.diagnostics(),
      graphObjects: this.#previews.size,
      environmentTargets: this.#environmentTargets.size,
      clippingPlanes: this.#clippingDisplay.planes.length,
      contextLost: this.#contextLost,
      ...(detailed ? { documents: displayMemorySnapshot(PandaUIApp.modelDocuments().flatMap(doc => [doc.three?.middleground, doc.three?.foreground])), mainWasmHeapBytes: PandaUIApp.getRhino3dm()?.HEAPU8?.byteLength ?? null, gpu: adapter ? gl.getParameter(adapter.UNMASKED_RENDERER_WEBGL) : 'unknown', powerPreference: gl?.getContextAttributes()?.powerPreference || 'unknown' } : {}) }
  }

  checkGraphicsPreference () {
    if (this.#ui) this.#ui.state.gpu = inspectGpuPreference(this.#renderer.getContext?.())
  }

  onPixelRatioChange = () => {
    this.#pixelRatioQuery?.removeEventListener('change', this.onPixelRatioChange)
    this.#pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    this.#pixelRatioQuery.addEventListener('change', this.onPixelRatioChange)
    this.resizeViewport()
    this.setDirtyFlag()
  }

  onVisibilityChange = () => {
    this.#adaptiveViewport.reset(true)
    if (!document.hidden) this.setDirtyFlag()
  }

  viewportPixelRatio (width, height) {
    const deviceRatio = Number(window.devicePixelRatio) || 1
    const sizeLimit = this.#renderer.capabilities.maxTextureSize
    const maximum = Math.min(deviceRatio, 2, Math.sqrt(8388608 / (width * height)), sizeLimit / width, sizeLimit / height)
    return maximum * (this.#adaptiveViewport?.scale || 1)
  }

  updateViewportQuality (settings, edgeWidth, loading = false) {
    const configured = this.#adaptiveViewport.configure(settings)
    const edgesChanged = this.#edgeDisplay.configure(edgeWidth)
    const adjusted = this.#adaptiveViewport.tick(performance.now(), !this.#dirtyFlag, loading)
    if (configured || edgesChanged || adjusted || this.#renderer.getPixelRatio() !== this.viewportPixelRatio(...this.#frameSize)) {
      this.#dirtyFlag = true
    }
    const now = performance.now()
    if (now - this.#viewportStatusTime < 250) return
    this.#viewportStatusTime = now
    window.dispatchEvent(new CustomEvent('pandaui-viewport-quality', {
      detail: {
        width: this.#renderer.domElement.width,
        height: this.#renderer.domElement.height,
        pixelRatio: this.#renderer.getPixelRatio(),
        scale: this.#adaptiveViewport.scale,
        fps: this.#adaptiveViewport.fps,
        mode: this.#adaptiveViewport.mode,
        cpuMs: this.#adaptiveViewport.cpuMs,
        gpuMs: this.#adaptiveViewport.gpuMs,
        callbackMs: this.#adaptiveViewport.callbackMs,
        drawCalls: this.#renderer.info.render.calls,
        triangles: this.#renderer.info.render.triangles,
        idle: this.#adaptiveViewport.idle,
        targetGpuMs: this.#adaptiveViewport.targetGpuMs,
        milliseconds: this.#adaptiveViewport.averageMs,
        source: this.#adaptiveViewport.source,
        timings: { ...this.#frameTimings },
        resources: this.getDisplayMemoryDiagnostics()
      }
    }))
  }

  resizeViewport () {
    const viewportWidth = Math.round(this.#parentElement.clientWidth)
    const viewportHeight = Math.round(this.#parentElement.clientHeight)
    if (viewportWidth < 1 || viewportHeight < 1) return false
    this.#interaction?.setViewportSize(viewportWidth, viewportHeight)
    const pixelRatio = this.viewportPixelRatio(viewportWidth, viewportHeight)
    if (this.#frameSize[0] === viewportWidth && this.#frameSize[1] === viewportHeight && this.#renderer.getPixelRatio() === pixelRatio) return false

    const aspect = viewportWidth / viewportHeight
    if (this.#camera.isPerspectiveCamera) {
      this.#camera.aspect = aspect
    } else if (this.#camera.isOrthographicCamera) {
      const halfHeight = Math.max((this.#camera.top - this.#camera.bottom) / 2, 0.0001)
      const centerX = (this.#camera.left + this.#camera.right) / 2
      const centerY = (this.#camera.top + this.#camera.bottom) / 2
      const halfWidth = halfHeight * aspect
      this.#camera.left = centerX - halfWidth
      this.#camera.right = centerX + halfWidth
      this.#camera.top = centerY + halfHeight
      this.#camera.bottom = centerY - halfHeight
    }
    this.#camera.updateProjectionMatrix()
    this.#renderer.setDrawingBufferSize(viewportWidth, viewportHeight, pixelRatio)
    this.#renderer.domElement.style.width = `${viewportWidth}px`
    this.#renderer.domElement.style.height = `${viewportHeight}px`
    this.#labelRenderer.setSize(viewportWidth, viewportHeight)
    this.#frameSize = [viewportWidth, viewportHeight]
    SceneUtilities.viewportSize.width = viewportWidth
    SceneUtilities.viewportSize.height = viewportHeight
    return true
  }

  getRenderEnvironment () {
    return this.#renderEnvironment
  }

  getShadingEnvironment () {
    return this.#shadingEnvironment
  }

  applyDisplaySettings (shadingSettings = {}, renderSettings = {}, renderEnabled = false) {
    this.#shadingSettings = normalizeShadingSettings(shadingSettings)
    this.#renderSettings = normalizeRenderSettings(renderSettings)
    this.#graphRenderEnabled = renderEnabled === true
    const graphSky = this.#previews.scene.getObjectByName('Graph sky light')
    const graphKey = this.#previews.scene.getObjectByName('Graph key light')
    const graphFill = this.#previews.scene.getObjectByName('Graph fill light')
    if (graphSky != null) graphSky.intensity = this.#graphRenderEnabled ? this.#renderSettings.ambientLight : this.#shadingSettings.skyLight
    if (graphKey != null) graphKey.intensity = this.#graphRenderEnabled ? this.#renderSettings.keyLight : this.#shadingSettings.keyLight
    if (graphFill != null) graphFill.intensity = this.#graphRenderEnabled ? this.#renderSettings.fillLight : 0
    const headlight = this.#camera?.getObjectByName('Shading headlight')
    if (headlight != null) headlight.intensity = this.#graphRenderEnabled ? 0 : this.#shadingSettings.keyLight
    this.#previews.scene.environment = this.#graphRenderEnabled ? this.#renderEnvironment : this.#shadingEnvironment
    this.#previews.scene.traverse(object => {
      const materials = object.userData.displayMaterials
      if (materials == null) return
      const shadingMaterials = Array.isArray(materials.shading) ? materials.shading : [materials.shading]
      const renderMaterials = Array.isArray(materials.render) ? materials.render : [materials.render]
      shadingMaterials.filter(Boolean).forEach(material => applyShadingMaterialSettings(material, this.#shadingSettings, this.#shadingEnvironment))
      renderMaterials.filter(Boolean).forEach(material => applyRenderMaterialSettings(material, this.#renderSettings, this.#renderEnvironment, this.#graphRenderEnabled))
      object.material = this.#graphRenderEnabled ? materials.render : materials.shading
    })
    this.setDirtyFlag()
  }

  async loadRenderEnvironment (file) {
    const environment = await this.loadEnvironmentTexture(file)
    if (this.#renderEnvironment !== this.#defaultRenderEnvironment) this.disposeEnvironmentTexture(this.#renderEnvironment)
    this.#renderEnvironment = environment
    this.setDirtyFlag()
  }

  clearRenderEnvironment () {
    if (this.#renderEnvironment !== this.#defaultRenderEnvironment) this.disposeEnvironmentTexture(this.#renderEnvironment)
    this.#renderEnvironment = this.#defaultRenderEnvironment
    this.setDirtyFlag()
  }

  async loadShadingEnvironment (file) {
    const environment = await this.loadEnvironmentTexture(file)
    if (this.#shadingEnvironment != null) this.disposeEnvironmentTexture(this.#shadingEnvironment)
    this.#shadingEnvironment = environment
    this.setDirtyFlag()
  }

  clearShadingEnvironment () {
    if (this.#shadingEnvironment != null) this.disposeEnvironmentTexture(this.#shadingEnvironment)
    this.#shadingEnvironment = null
    this.setDirtyFlag()
  }

  async loadEnvironmentTexture (file) {
    const sourceUrl = URL.createObjectURL(file)
    let sourceTexture = null
    try {
      sourceTexture = await new Promise((resolve, reject) => {
        const loader = file.name.toLowerCase().endsWith('.hdr') ? new RGBELoader() : new THREE.TextureLoader()
        loader.load(sourceUrl, resolve, undefined, reject)
      })
      if (!file.name.toLowerCase().endsWith('.hdr')) sourceTexture.encoding = THREE.sRGBEncoding
      if (this.#disposed) throw new Error('Viewport closed before the environment finished loading.')
      const pmremGenerator = new THREE.PMREMGenerator(this.#renderer)
      const environment = this.retainEnvironmentTarget(pmremGenerator.fromEquirectangular(sourceTexture))
      pmremGenerator.dispose()
      sourceTexture.dispose()
      sourceTexture = null
      return environment
    } finally {
      if (sourceTexture != null) sourceTexture.dispose()
      URL.revokeObjectURL(sourceUrl)
    }
  }

  clearModelResources () {
    this.#controlPoints.stop(false)
    this.#sceneBounds = null
    this.#renderedDocumentScene = null
    this.#frameTimings = {}
    this.#edgeDisplay.dispose()
    this.#adaptiveViewport.reset()
    this.finishObjectSelection(true)
    this.#interaction.cancelPicking()
    this.clearGroupEditMode()
    this.restoreSelectedObject()
    this.#materials.clearResources()
    this.#visibility.reset()
    this.#activeClippingPlanes = this.#clippingDisplay.planes
    this.notifyModelingHistory()
    PandaUIApp.notifySelectionChanged(null)
    this.#renderer.renderLists.dispose()
    this.#renderer.info.reset()
    this.#renderer.setRenderTarget(null)
    this.#renderer.clear(true, true, true)
    this.setDirtyFlag()
  }

  setDirtyFlag (sceneChanged = true, notifyScene = true) {
    this.#importedMaterials?.pruneDocuments()
    this.#dirtyFlag = true
    this.#nodeRenderer?.invalidate(sceneChanged)
    if (sceneChanged) {
      this.#sceneRevision++
      if (notifyScene) window.dispatchEvent(new CustomEvent('pandaui-scene-content-changed'))
    }
  }

  attachSharedScene (group) { this.#previews.scene.add(group); this.setDirtyFlag(true, false) }

  get renderNodesActive () { return this.#nodeRenderer?.active === true }

  renderNodeSelection () {
    const object = this.getSelectedObjectRoot()
    if (!object) throw new Error('Select a scene object first.')
    for (let item = object; item; item = item.parent) if (item.userData?.readOnly || item.userData?.nodePreview) throw new Error('Select an editable document object.')
    const id = renderBindingTargetIds(object)[0]
    if (!id) throw new Error('The selected object has no stable document ID.')
    return [String(id)]
  }
  importedMaterialCatalog = () => this.#importedMaterials.catalog()
  renderDocuments = () => [...PandaUIApp.modelDocuments(), ...(window.PandaUISceneWorkspace?.renderDocuments() || [])]
  updateImportedMaterial = (key, settings) => this.#importedMaterials.update(key, settings)
  importedMaterialPreview = key => this.#importedMaterials.preview(key)
  importedMaterialSelection = () => this.#importedMaterials.selection(this.#selection.object)
  importedMaterialReference (reference) {
    const { root } = resolveSceneReference(this.renderDocuments(), reference)
    return this.#importedMaterials.selection(root)
  }
  objectUVSelection = () => this.#objectUV.reference(this.getSelectedObjectRoot())
  editObjectUV = command => this.#objectUV.command(command)
  applyObjectUVState = state => this.#objectUV.applyState(state)

  getRenderEngine () {
    if (this.#nodeRenderer) return this.#nodeRenderer
    const sceneContext = () => {
      const scenes = [PandaUIApp.getActiveModel()?.three?.middleground, this.#previews.scene].filter(Boolean)
      return {
        scenes,
        resolveTargets: ids => resolveRenderBindingTargets(scenes, ids)
      }
    }
    this.#nodeRenderer = new RenderEngine(this.#renderer, {
      sceneContext,
      requestFrame: () => { if (!this.#disposed) this.#dirtyFlag = true },
      onStatus: message => {
        if (!this.#disposed) document.getElementById('editorFrame')?.contentWindow?.postMessage(message, window.location.origin)
      },
      setEnabled: () => PandaUIApp.updateVisibility(),
      getDocuments: () => PandaUIApp.modelDocuments(),
      getCamera: () => this.#camera,
      getClippingPlanes: () => this.#activeClippingPlanes,
      invalidateObject: object => { for (const doc of PandaUIApp.modelDocuments()) doc.invalidateRenderObject?.(object) },
      setCamera: settings => this.setCameraSettings({ ...settings, position: { x: settings.position[0], y: settings.position[1], z: settings.position[2] }, target: { x: settings.target[0], y: settings.target[1], z: settings.target[2] } })
    })
    return this.#nodeRenderer
  }

  clearRenderNodes () { return this.#nodeRenderer?.clear() }

  removeSharedSource (root) { return this.#previews.removeSharedSource(root) }

  sharedSceneSources () { return this.#previews.sharedSceneSources() }

  get parameterPicker () { return this.#interaction?.parameterPicker }

  isDirty () {
    return this.#dirtyFlag
  }

  setModelingTool = (...args) => this.#interaction.setModelingTool(...args)

  updateModelingPanel = (...args) => this.#interaction.updateModelingPanel(...args)

  setModelingLinePreview = (...args) => this.#interaction.setModelingLinePreview(...args)

  clearModelingPreview = (...args) => this.#interaction.clearModelingPreview(...args)

  removeGraphGeometry = (...args) => this.#previews.removeGraphGeometry(...args)

  findSceneGeometry = (...args) => this.#previews.findSceneGeometry(...args)

  documentTreeObjects = (...args) => this.#previews.documentTreeObjects(...args)

  documentTreeSelection = (...args) => this.#previews.documentTreeSelection(...args)

  selectDocumentTreeItem = (...args) => this.#previews.selectDocumentTreeItem(...args)

  zoomDocumentTreeItem = (...args) => this.#previews.zoomDocumentTreeItem(...args)

  setDocumentTreeVisibility = (...args) => this.#visibility.setDocumentTreeVisibility(...args)

  graphIdForObject = (...args) => this.#previews.graphIdForObject(...args)

  applyModelingResult = (...args) => this.#previews.applyModelingResult(...args)

  setGraphPoint = (...args) => this.#previews.setGraphPoint(...args)

  addPreviewObject = (...args) => this.#previews.addPreviewObject(...args)

  removePreviewObject = (...args) => this.#previews.removePreviewObject(...args)

  setGraphPointCloud = (...args) => this.#previews.setGraphPointCloud(...args)

  setGraphPointSize = (...args) => this.#previews.setGraphPointSize(...args)

  getGraphObjectsBoundingBox = (...args) => this.#previews.getGraphObjectsBoundingBox(...args)
  zoomGraphPreview = (...args) => this.#previews.zoomGraphPreview(...args)

  captureScenePreview = (...args) => this.#previews.captureScenePreview(...args)

  setGraphGeometry = (...args) => this.#previews.setGraphGeometry(...args)

  bakeGraphPreview = (...args) => this.#previews.bakePreview(...args)

  applyGraphPreviewMetadata = (...args) => this.#previews.applyGraphPreviewMetadata(...args)

  setGraphNodePreviewVisibility (nodeId, visible) {
    this.#previews.setGraphNodePreviewVisibility(nodeId, visible)
    this.refreshClippingPlaneSelection(nodeId)
  }

  setGraphNodeSelection = (...args) => this.#previews.setGraphNodeSelection(...args)

  applyGraphNodeHighlight = (...args) => this.#previews.applyGraphNodeHighlight(...args)

  setGraphPreviewVisibility = (...args) => this.#previews.setGraphPreviewVisibility(...args)

  clearGraphPreview = (...args) => this.#previews.clearGraphPreview(...args)

  rhinoGeometryType = (...args) => this.#previews.rhinoGeometryType(...args)

  applyGeometryReference = (...args) => this.#previews.applyGeometryReference(...args)

  tryAsyncGeometryConversion = (...args) => this.#previews.tryAsyncGeometryConversion(...args)

  disposeGraphObject = (...args) => this.#previews.disposeGraphObject(...args)

  createFallbackGeometry = (...args) => this.#previews.createFallbackGeometry(...args)

  // Backwards-compatible no-op for removed KUKA-specific display code.
  // Some call sites still invoke updateGraphKukaDisplay(); keep a harmless
  // stub so those calls do not throw after KUKA removal.
  updateGraphKukaDisplay = (...args) => this.#previews.updateGraphKukaDisplay(...args)

  onContextMenu = (...args) => this.#interaction.onContextMenu(...args)
  onPointerCancel = (...args) => this.#interaction.onPointerCancel(...args)

  onDocumentPointerDown = (...args) => this.#interaction.onDocumentPointerDown(...args)

  onDocumentKeyDown = (...args) => this.#interaction.onDocumentKeyDown(...args)

  async executeModelingHistory (command) {
    try { return await (command === 'modeling.undo' ? PandaUIApp.getOperations().undo() : PandaUIApp.getOperations().redo()) } catch (error) { window.dispatchEvent(new CustomEvent('pandaui-operation-error', { detail: { message: error.message } })); return false }
  }

  getModelingHistory () { return PandaUIApp.getOperations().getState() }
  subscribeModelingHistory (listener) { return PandaUIApp.getOperations().subscribe(listener) }
  notifyModelingHistory () { PandaUIApp.getOperations().notify() }
  setModelingHistoryLimit (limit) { PandaUIApp.getOperations().setLimit(limit) }
  async restoreModelingHistory (index) {
    try { return await PandaUIApp.getOperations().restore(index) } catch (error) { window.dispatchEvent(new CustomEvent('pandaui-operation-error', { detail: { message: error.message } })); return false }
  }

  hideContextMenu = (...args) => this.#interaction.hideContextMenu(...args)

  onAuxiliaryClick = (...args) => this.#interaction.onAuxiliaryClick(...args)

  onNavigationMouseButton = (...args) => this.#interaction.onNavigationMouseButton(...args)

  canStartNodeGraphGesture = (...args) => this.#interaction.canStartNodeGraphGesture(...args)

  onPointerDown = (...args) => this.#interaction.onPointerDown(...args)

  onPointerMove = (...args) => this.#interaction.onPointerMove(...args)

  onPointerUp = (...args) => this.#interaction.onPointerUp(...args)

  parameterPointAtPointer = (...args) => this.#interaction.parameterPointAtPointer(...args)

  beginParameterPick = (...args) => this.#interaction.beginParameterPick(...args)

  beginObjectSelection = (...args) => this.#interaction.beginObjectSelection(...args)

  finishObjectSelection = (...args) => this.#interaction.finishObjectSelection(...args)

  modelingPointAtPointer = (...args) => this.#interaction.modelingPointAtPointer(...args)

  snapModelingPoint = (...args) => this.#interaction.snapModelingPoint(...args)

  endpointAtPointer = (...args) => this.#interaction.endpointAtPointer(...args)

  updateModelingCoordinateReadout = (...args) => this.#interaction.updateModelingCoordinateReadout(...args)

  onDoubleClick = (...args) => this.#interaction.onDoubleClick(...args)

  selectAtPointer = (...args) => this.#interaction.selectAtPointer(...args)

  selectionTarget = (...args) => this.#interaction.selectionTarget(...args)

  intersectionsAtPointer = (...args) => this.#interaction.intersectionsAtPointer(...args)

  contextObjectName = (...args) => this.#visibility.contextObjectName(...args)

  getHiddenObjects = (...args) => this.#visibility.getHiddenObjects(...args)

  showContextMenu = (...args) => this.#visibility.showContextMenu(...args)

  applyObjectVisibilityState = (...args) => this.#visibility.applyObjectVisibilityState(...args)

  applyObjectTransformState = (...args) => this.#previews.applyObjectTransformState(...args)

  captureTransformDisplay = (...args) => this.#previews.captureTransformDisplay(...args)

  updateObjectGeometryReference = (...args) => this.#previews.updateObjectGeometryReference(...args)

  hideSelectedObject = (...args) => this.#visibility.hideSelectedObject(...args)

  showHiddenObject = (...args) => this.#visibility.showHiddenObject(...args)

  showAllHiddenObjects = (...args) => this.#visibility.showAllHiddenObjects(...args)

  isSelectable = (...args) => this.#interaction.isSelectable(...args)

  isCurveSelectable = (...args) => this.#interaction.isCurveSelectable(...args)

  getCurvePolyline = (...args) => this.#interaction.getCurvePolyline(...args)

  pickCurve = (...args) => this.#interaction.pickCurve(...args)

  pickObject = (...args) => this.#interaction.pickObject(...args)

  getTransformTarget (object) {
    return this.#clippingDisplay.getTransformTarget(object) || this.#previews.getTransformTarget(object)
  }

  getCurrentGroupEditContext = (...args) => this.#groups.getCurrentGroupEditContext(...args)

  isDescendantOf = (...args) => this.#groups.isDescendantOf(...args)

  directChildUnder = (...args) => this.#groups.directChildUnder(...args)

  hasEditableGroupChildren = (...args) => this.#groups.hasEditableGroupChildren(...args)

  findEnterableGroup = (...args) => this.#groups.findEnterableGroup(...args)

  enterGroupEditLevel = (...args) => this.#groups.enterGroupEditLevel(...args)

  exitGroupEditLevel = (...args) => this.#groups.exitGroupEditLevel(...args)

  clearGroupEditMode = (...args) => this.#groups.clearGroupEditMode(...args)

  updateGroupEditBounds = (...args) => this.#groups.updateGroupEditBounds(...args)

  clearGroupEditBounds = (...args) => this.#groups.clearGroupEditBounds(...args)

  restoreGroupEditIsolation = (...args) => this.#groups.restoreGroupEditIsolation(...args)

  refreshGroupEditIsolation = (...args) => this.#groups.refreshGroupEditIsolation(...args)

  createSceneObjectMarker (object) {
    return this.#clippingDisplay.createSceneObjectMarker(object) || this.#previews.createSceneObjectMarker(object)
  }

  resolveSceneObjects = (...args) => this.#previews.resolveSceneObjects(...args)

  transformSceneObject = (...args) => this.#previews.transformSceneObject(...args)

  transformGraphDisplayBuffers = (...args) => this.#previews.transformGraphDisplayBuffers(...args)

  transformGraphDisplayBufferMatrix = (...args) => this.#previews.transformGraphDisplayBufferMatrix(...args)

  createModelTransformMatrix = (...args) => this.#previews.createModelTransformMatrix(...args)

  replaceSceneGeometry = (...args) => this.#previews.replaceSceneGeometry(...args)

  commitGumballTransform = (...args) => this.#interaction.commitGumballTransform(...args)

  releaseGeometry = (...args) => this.#previews.releaseGeometry(...args)

  highlightCurve = (...args) => this.#selection.highlightCurve(...args)

  clearCurveHighlight = (...args) => this.#interaction.clearCurveHighlight(...args)

  setSelectedObject = (...args) => {
    this.#controlPoints?.selectionChanged(args[0])
    return this.#selection.setSelectedObject(...args)
  }
  applyControlPointState = (...args) => this.#controlPoints.applyState(...args)
  setSubDDisplay = (mode, all = false) => this.#subdDisplay.apply(mode, this.getSelectedObjectRoot(), all)
  showControlPoints = () => this.#controlPoints.start(this.getSelectedObjectRoot())
  hideControlPoints = () => this.#controlPoints.stop()

  showSelectionInfo = (...args) => this.#selection.showSelectionInfo(...args)

  createSelectionHighlight = (...args) => this.#selection.createSelectionHighlight(...args)

  restoreSelectedObject = (...args) => this.#selection.restoreSelectedObject(...args)

  refreshSelectionHighlight = (...args) => this.#selection.refreshSelectionHighlight(...args)

  updateSelectionHighlightForTransform = (...args) => this.#selection.updateSelectionHighlightForTransform(...args)

  getSelectedObjectRoot = (...args) => this.#selection.getSelectedObjectRoot(...args)

  getSelectedRenderMaterialId = (...args) => this.#materials.getSelectedRenderMaterialId(...args)

  restoreRenderMaterialDefinition = (...args) => this.#materials.restoreRenderMaterialDefinition(...args)
  createRenderMaterial = (...args) => this.#materials.createRenderMaterial(...args)
  editRenderMaterial = (...args) => this.#materials.editRenderMaterial(...args)
  setRenderMaterialTexture = (...args) => this.#materials.setRenderMaterialTexture(...args)

  materialSnapshot = (...args) => this.#materials.materialSnapshot(...args)

  restoreMaterialSnapshot = (...args) => this.#materials.restoreMaterialSnapshot(...args)

  captureSelectedMaterialSnapshot = (...args) => this.#materials.captureSelectedMaterialSnapshot(...args)

  restoreSelectedMaterialSnapshot = (...args) => this.#materials.restoreSelectedMaterialSnapshot(...args)

  assignSelectedRenderMaterial = (...args) => this.#materials.assignSelectedRenderMaterial(...args)

  getEditableMaterials = (...args) => this.#materials.getEditableMaterials(...args)

  getSelectedShadingMaterialSettings = (...args) => this.#materials.getSelectedShadingMaterialSettings(...args)

  updateSelectedShadingMaterial = (...args) => this.#materials.updateSelectedShadingMaterial(...args)

  getSelectedMaterialSettings = (...args) => this.#materials.getSelectedMaterialSettings(...args)

  ensureTextureCoordinates = (...args) => this.#materials.ensureTextureCoordinates(...args)

  setSelectedMaterialTexture = (...args) => this.#materials.setSelectedMaterialTexture(...args)

  clearSelectedMaterialTexture = (...args) => this.#materials.clearSelectedMaterialTexture(...args)

  disposeUnusedSelectedMaterialTexture = (...args) => this.#materials.disposeUnusedSelectedMaterialTexture(...args)

  updateSelectedMaterial = (...args) => this.#materials.updateSelectedMaterial(...args)

  resetSelectedMaterial = (...args) => this.#materials.resetSelectedMaterial(...args)

  getFrameDiagnostics () {
    return { ...this.#frameTimings, gpuMs: this.#adaptiveViewport.gpuMs, drawCalls: this.#renderer.info.render.calls, scale: this.#adaptiveViewport.scale }
  }

  recordFrameTimings (timings) {
    for (const [name, elapsed] of Object.entries(timings)) {
      this.#frameTimings[name] = this.#frameTimings[name] == null ? elapsed : this.#frameTimings[name] * 0.85 + elapsed * 0.15
    }
  }

  renderDocumentScene (scene, width, height) {
    const documents = PandaUIApp.modelDocuments()
    ensureShadingHeadlight(scene, this.#camera, PandaUIApp.viewModel().lightColor, this.#graphRenderEnabled ? 0 : this.#shadingSettings.keyLight)
    const autoUpdate = scene.autoUpdate
    const revision = this.#sceneRevision
    if (this.#renderedDocumentScene === scene && this.#renderedDocumentRevision === revision) scene.autoUpdate = false
    try {
      documents.forEach(doc => doc.prepareRenderBatches?.(revision))
      this.#edgeDisplay.render(this.#renderer, scene, this.#camera, width, height, revision)
      this.#renderedDocumentScene = scene
      this.#renderedDocumentRevision = revision
    } finally {
      documents.forEach(doc => doc.finishRenderBatches?.())
      scene.autoUpdate = autoUpdate
    }
  }

  drawFrameBuffer (showGrid, displayMode, document) {
    if (this.#contextLost) return
    const started = performance.now()
    this.#dirtyFlag = false
    this.resizeViewport()
    this.#renderer.info.autoReset = false
    this.#renderer.info.reset()
    this.#adaptiveViewport.beginFrame(started)
    this.#edgeDisplay.beginFrame()
    try {
      const viewportWidth = this.#frameSize[0]
      const viewportHeight = this.#frameSize[1]

      this.#controls.update()
      this.updateFrustum()
      this.#camera.updateWorldMatrix(true, true)
      this.updateGroupEditBounds()
      SceneUtilities.viewportSize.width = viewportWidth
      SceneUtilities.viewportSize.height = viewportHeight
      this.#activeClippingPlanes = displayMode.clipping ? [...(document.clippingPlanes || []), ...this.#clippingDisplay.planes] : []
      this.#renderer.clippingPlanes = []

      this.#renderer.autoClear = false
      this.#renderer.sortObjects = false
      const prepared = performance.now()
      // background draw will still clear the depth/color buffer
      // since the background scene defines a background fill color
      this.drawBackground(showGrid, displayMode)
      this.updateGraphKukaDisplay()
      const backgroundDrawn = performance.now()

      if (this.#nodeRenderer?.render({ camera: this.#camera, width: this.#renderer.domElement.width, height: this.#renderer.domElement.height, clippingPlanes: this.#activeClippingPlanes })) {
        this.drawViewportHelpers(viewportWidth, viewportHeight, [document?.three?.middleground, this.#previews.scene])
        this.#labelRenderer.render(document.three.foreground, this.#camera)
        this.recordFrameTimings({ prepareMs: prepared - started, backgroundMs: backgroundDrawn - prepared, modelMs: performance.now() - backgroundDrawn, previewMs: 0, labelsMs: 0 })
        return
      }

      this.#renderer.sortObjects = true
      this.#renderer.clearDepth()
      this.#renderer.clippingPlanes = this.#activeClippingPlanes
      this.renderDocumentScene(document.three.middleground, viewportWidth, viewportHeight)
      const modelDrawn = performance.now()
      this.#edgeDisplay.render(this.#renderer, this.#previews.scene, this.#camera, viewportWidth, viewportHeight)
      this.drawViewportHelpers(viewportWidth, viewportHeight, [document?.three?.middleground, this.#previews.scene])
      const previewDrawn = performance.now()
      this.#labelRenderer.render(document.three.foreground, this.#camera)
      this.recordFrameTimings({ prepareMs: prepared - started, backgroundMs: backgroundDrawn - prepared, modelMs: modelDrawn - backgroundDrawn, previewMs: previewDrawn - modelDrawn, labelsMs: performance.now() - previewDrawn })
    } finally { this.#edgeDisplay.endFrame(); this.#adaptiveViewport.endFrame() }
  }

  drawViewportHelpers (width, height, scenes = [this.#previews.scene]) {
    this.#renderer.clippingPlanes = []
    this.#renderer.clearDepth()
    this.#clippingDisplay.update(this.#camera, width, height, scenes, this.#sceneRevision)
    if (this.#clippingDisplay.entries.size) this.#renderer.render(this.#clippingDisplay.scene, this.#camera)
    if (this.renderNodesActive && this.#selection.highlight?.visible) this.#renderer.render(this.#selection.highlight, this.#camera)
    this.#renderer.render(this.#viewportHelperScene, this.#camera)
  }

  drawEmptyFrame (showGrid, displayMode) {
    if (this.#contextLost) return
    const started = performance.now()
    this.#dirtyFlag = false
    this.resizeViewport()
    this.#renderer.info.autoReset = false
    this.#renderer.info.reset()
    this.#adaptiveViewport.beginFrame(started)
    this.#edgeDisplay.beginFrame()
    try {
      const viewportWidth = this.#frameSize[0]
      const viewportHeight = this.#frameSize[1]

      this.#controls.update()
      this.updateFrustum()
      this.#camera.updateWorldMatrix(true, true)
      SceneUtilities.viewportSize.width = viewportWidth
      SceneUtilities.viewportSize.height = viewportHeight
      this.#renderer.autoClear = false
      this.#renderer.sortObjects = false
      const prepared = performance.now()
      this.#activeClippingPlanes = displayMode.clipping ? this.#clippingDisplay.planes : []
      this.#renderer.clippingPlanes = []
      this.drawBackground(showGrid, displayMode)
      const backgroundDrawn = performance.now()
      if (this.#nodeRenderer?.render({ camera: this.#camera, width: this.#renderer.domElement.width, height: this.#renderer.domElement.height, clippingPlanes: this.#activeClippingPlanes })) {
        this.drawViewportHelpers(viewportWidth, viewportHeight, [this.#previews.scene])
        this.recordFrameTimings({ prepareMs: prepared - started, backgroundMs: backgroundDrawn - prepared, modelMs: performance.now() - backgroundDrawn, previewMs: 0, labelsMs: 0 })
        return
      }
      this.#renderer.sortObjects = true
      this.#renderer.clearDepth()
      this.#renderer.clippingPlanes = this.#activeClippingPlanes
      this.#edgeDisplay.render(this.#renderer, this.#previews.scene, this.#camera, viewportWidth, viewportHeight)
      this.drawViewportHelpers(viewportWidth, viewportHeight, [this.#previews.scene])
      this.recordFrameTimings({ prepareMs: prepared - started, backgroundMs: backgroundDrawn - prepared, modelMs: 0, previewMs: performance.now() - backgroundDrawn, labelsMs: 0 })
    } finally { this.#edgeDisplay.endFrame(); this.#adaptiveViewport.endFrame() }
  }

  drawBackground (showGrid, displayMode) {
    // Draw background color and grid based on passed in display mode
    if (displayMode.backgroundStyle === DisplayMode.backgroundModes[0]) {
      const signature = `solid:${displayMode.backgroundColor}`
      if (signature !== this.#backgroundSignature) {
        this.#backgroundTexture?.dispose()
        this.#backgroundTexture = null
        this.#backgroundScene.background = new THREE.Color(displayMode.backgroundColor)
        this.#backgroundSignature = signature
      }
    } else if (displayMode.backgroundStyle === DisplayMode.backgroundModes[1]) {
      const signature = `gradient:${displayMode.backgroundGradientTop}:${displayMode.backgroundGradientBottom}`
      if (signature !== this.#backgroundSignature) {
        const parentElement = document.createElement('canvas')
        parentElement.width = 128
        parentElement.height = 128
        const context = parentElement.getContext('2d')
        const gradient = context.createLinearGradient(0, 0, 0, parentElement.height)
        gradient.addColorStop(1, displayMode.backgroundGradientTop)
        gradient.addColorStop(0.1, displayMode.backgroundGradientBottom)
        context.fillStyle = gradient
        context.fillRect(0, 0, parentElement.width, parentElement.height)
        this.#backgroundTexture?.dispose()
        this.#backgroundTexture = new THREE.CanvasTexture(parentElement)
        this.#backgroundScene.background = this.#backgroundTexture
        this.#backgroundSignature = signature
      }
    }

    if (this.#backgroundScene.grid == null) {
      this.#backgroundScene.grid = SceneUtilities.createGrid()
      this.#backgroundScene.add(this.#backgroundScene.grid)
    }
    this.#backgroundScene.grid.visible = showGrid

    this.#renderer.render(this.#backgroundScene, this.#camera)
  }

  boxCorners (box) {
    return [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z), // 000
      new THREE.Vector3(box.min.x, box.min.y, box.max.z), // 001
      new THREE.Vector3(box.min.x, box.max.y, box.min.z), // 010
      new THREE.Vector3(box.min.x, box.max.y, box.max.z), // 011
      new THREE.Vector3(box.max.x, box.min.y, box.min.z), // 100
      new THREE.Vector3(box.max.x, box.min.y, box.max.z), // 101
      new THREE.Vector3(box.max.x, box.max.y, box.min.z), // 110
      new THREE.Vector3(box.max.x, box.max.y, box.max.z) // 111
    ]
  }

  updateFrustum () {
    this.#controls.minDistance = 0
    this.#controls.maxDistance = Infinity
    if (this.#sceneBoundsRevision !== this.#sceneRevision) {
      this.#sceneBounds = PandaUIApp.visibleObjectsBoundingBox()
      this.#sceneBoundsRevision = this.#sceneRevision
    }
    const bbox = this.#sceneBounds
    if (bbox == null || bbox.isEmpty() || this.#camera == null) return
    updateCameraDepth(this.#camera, this.#controls.target, bbox)
  }

  setPanMode (on) {
    this.#controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    this.#controls.mouseButtons.RIGHT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    this.#controls.touches.ONE = THREE.TOUCH.ROTATE
    this.#controls.update()
    this.setDirtyFlag(false)
  }

  getCameraSettings () {
    const camera = this.#camera
    return {
      projection: camera.isPerspectiveCamera ? 'perspective' : 'orthographic',
      fov: camera.isPerspectiveCamera ? camera.fov : 45,
      orthographicHeight: camera.isOrthographicCamera ? (camera.top - camera.bottom) : 40,
      near: camera.near,
      far: camera.far,
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: this.#controls.target.x, y: this.#controls.target.y, z: this.#controls.target.z }
    }
  }

  setCameraSettings (settings) {
    const numeric = (value, fallback) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : fallback
    }
    const previous = this.#camera
    const perspective = settings.projection !== 'orthographic'
    const aspect = this.#parentElement.clientWidth / Math.max(this.#parentElement.clientHeight, 1)
    const near = Math.max(numeric(settings.near, previous.near), 0.00001)
    const far = Math.max(numeric(settings.far, previous.far), near * 1.01)
    let camera = previous

    if (perspective !== previous.isPerspectiveCamera) {
      if (perspective) {
        camera = new THREE.PerspectiveCamera(THREE.MathUtils.clamp(numeric(settings.fov, 45), 1, 179), aspect, near, far)
      } else {
        const height = Math.max(numeric(settings.orthographicHeight, 40), 0.0001)
        const halfHeight = height / 2
        camera = new THREE.OrthographicCamera(-halfHeight * aspect, halfHeight * aspect, halfHeight, -halfHeight, near, far)
      }
      camera.position.copy(previous.position)
      camera.quaternion.copy(previous.quaternion)
      camera.up.copy(previous.up)

      const parent = previous.parent
      while (previous.children.length > 0) camera.add(previous.children[0])
      if (parent != null) {
        parent.remove(previous)
        parent.add(camera)
      }
      this.#camera = camera
      this.#controls.object = camera
      this.#interaction?.setCamera(camera)
    } else if (perspective) {
      camera.fov = THREE.MathUtils.clamp(numeric(settings.fov, camera.fov), 1, 179)
    } else {
      const height = Math.max(numeric(settings.orthographicHeight, camera.top - camera.bottom), 0.0001)
      const halfHeight = height / 2
      camera.left = -halfHeight * aspect
      camera.right = halfHeight * aspect
      camera.top = halfHeight
      camera.bottom = -halfHeight
    }

    camera.near = near
    camera.far = far
    camera.position.set(
      numeric(settings.position?.x, camera.position.x),
      numeric(settings.position?.y, camera.position.y),
      numeric(settings.position?.z, camera.position.z)
    )
    this.#controls.target.set(
      numeric(settings.target?.x, this.#controls.target.x),
      numeric(settings.target?.y, this.#controls.target.y),
      numeric(settings.target?.z, this.#controls.target.z)
    )
    camera.lookAt(this.#controls.target)
    camera.updateProjectionMatrix()
    this.#controls.update()
    PandaUIApp.viewModel().perspectiveCamera = perspective
    this.setPanMode(!perspective)
    this.setDirtyFlag(false)
  }

  resetToTopView () {
    this.setCameraSettings({
      projection: 'perspective',
      fov: 45,
      near: 0.01,
      far: 1000,
      position: { x: 40, y: -40, z: 56.5685 },
      target: { x: 0, y: 0, z: 0 }
    })
  }

  reset3DView () {
    this.#camera.up.set(0, 0, 1)
    this.#camera.zoom = 1
    this.#controls.minDistance = 0
    this.#controls.maxDistance = Infinity
    this.resetToTopView()
    this.zoomSceneExtents()
  }

  setViewPreset (preset) {
    const views = {
      top: { direction: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
      bottom: { direction: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, -1, 0) },
      front: { direction: new THREE.Vector3(0, -1, 0), up: new THREE.Vector3(0, 0, 1) },
      back: { direction: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, 1) },
      left: { direction: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
      right: { direction: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
      axonometric: { direction: new THREE.Vector3(1, -1, 1).normalize(), up: new THREE.Vector3(0, 0, 1) }
    }
    const view = views[preset]
    const bounds = PandaUIApp.visibleObjectsBoundingBox()
    if (view == null || bounds == null || bounds.isEmpty()) return

    // 2D preset views are orthographic so dimensions remain stable while orbiting.
    PandaUIApp.viewModel().perspectiveCamera = false
    const target = bounds.getCenter(new THREE.Vector3())
    this.#camera.up.copy(view.up)
    this.#camera.position.copy(target).add(view.direction)
    this.#controls.target.copy(target)
    this.#camera.lookAt(target)
    this.zoomExtentsWithoutRhino(true, bounds)
    // Orthographic plan views prioritize panning; axonometric remains orbitable.
    this.setPanMode(preset !== 'axonometric')
    this.setDirtyFlag(false)
  }

  // Ensure pointer interaction and orbit controls are enabled. Call after
  // opening documents or any DOM changes that might overlay the canvas.
  ensureInteraction () {
    try {
      if (this.#parentElement != null) this.#parentElement.style.pointerEvents = 'auto'
      if (this.#renderer != null && this.#renderer.domElement != null) this.#renderer.domElement.style.pointerEvents = 'auto'
      if (this.#controls != null) this.#controls.enabled = true
      // Force controls update to sync internal state
      if (this.#controls != null) this.#controls.update()
      console.log('DisplayPipeline: ensured interaction (pointer-events / controls.enabled)')
    } catch (e) {
      // Ignore any errors in environments where DOM isn't writable
    }
  }

  zoomExtents (createNewCamera) {
    const bounds = PandaUIApp.visibleObjectsBoundingBox()
    if (bounds == null || bounds.isEmpty()) return
    this.zoomExtentsWithoutRhino(createNewCamera, bounds)
  }

  zoomSceneExtents () {
    const bounds = PandaUIApp.visibleObjectsBoundingBox()
    if (bounds == null || bounds.isEmpty()) return false
    this.zoomExtentsWithoutRhino(false, bounds)
    return true
  }

  zoomDocumentExtents (createNewCamera = false) {
    const bounds = PandaUIApp.activeDocumentBoundingBox()
    if (bounds == null || bounds.isEmpty()) return false
    this.zoomExtentsWithoutRhino(createNewCamera, bounds)
    return true
  }

  zoomSelected (createNewCamera = false) {
    const root = this.getSelectedObjectRoot()
    if (root == null || root.visible === false) return false
    const bounds = expandVisibleSceneBounds(root, new THREE.Box3())
    if (bounds.isEmpty()) return false
    this.zoomExtentsWithoutRhino(createNewCamera, bounds)
    return true
  }

  zoomExtentsWithoutRhino (createNewCamera, bounds) {
    const size = new THREE.Vector2(0, 0)
    this.#renderer.getSize(size)
    if (size.x <= 0 || size.y <= 0) {
      const element = this.#renderer.domElement
      size.set(Math.max(element?.clientWidth || 1, 1), Math.max(element?.clientHeight || 1, 1))
    }
    const sphere = bounds.getBoundingSphere(new THREE.Sphere())
    const radius = Math.max(sphere.radius, 0.01)

    if (createNewCamera) {
      const activeModel = PandaUIApp.getActiveModel()
      const up = this.#camera.up.clone()
      const position = this.#camera.position.clone()
      this.#camera.parent?.remove(this.#camera)
      if (PandaUIApp.viewModel().perspectiveCamera) {
        this.#camera = new THREE.PerspectiveCamera(45, size.x / size.y, radius * 0.001, radius * 10)
      } else {
        this.#camera = new THREE.OrthographicCamera(-1, 1, 1, -1, radius * 0.001, radius * 10)
      }
      this.#camera.up.copy(up)
      this.#camera.position.copy(position)
      this.#controls.object = this.#camera
      this.#interaction?.setCamera(this.#camera)
      if (activeModel != null) ensureShadingHeadlight(activeModel.three.middleground, this.#camera, PandaUIApp.viewModel().lightColor, this.#graphRenderEnabled ? 0 : this.#shadingSettings.keyLight)
    }

    fitCameraToBounds(this.#camera, this.#controls.target, bounds, size.x / size.y)
    this.#sceneBoundsRevision = -1
    this.updateFrustum()
    this.#camera.updateProjectionMatrix()
    // Ensure camera looks at the computed target and controls reflect the change
    try { this.#camera.lookAt(this.#controls.target) } catch (e) { /* ignore */ }
    try { this.#controls.update() } catch (e) { /* ignore */ }
    this.setDirtyFlag(false)
  }
}
