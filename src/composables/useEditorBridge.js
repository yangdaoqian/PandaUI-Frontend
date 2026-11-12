import PandaUIApp from '../PandaUIApp'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { createEditorMessageRouter } from '../editor/EditorMessageRouter'

function decodeDisplayPreview (buffer, descriptor) {
  if (!(buffer instanceof ArrayBuffer) || descriptor == null) return null
  const positionCount = Number(descriptor.positionCount) || 0
  if (positionCount < 3) return null
  const positions = new Float32Array(new Float32Array(buffer, Number(descriptor.positionByteOffset) || 0, positionCount))
  const indexCount = Number(descriptor.indexCount) || 0
  const indices = indexCount > 0
    ? new Uint32Array(new Uint32Array(buffer, Number(descriptor.indexByteOffset) || 0, indexCount))
    : null
  const normals = descriptor.normalCount === positionCount
    ? new Float32Array(new Float32Array(buffer, Number(descriptor.normalByteOffset) || 0, positionCount))
    : null
  return { type: descriptor.type || 'polyline', positions, normals, indices }
}

function decodePortDisplayBuffer (displayBuffer) {
  if (displayBuffer?.version !== 1 || !(displayBuffer.data instanceof ArrayBuffer) || !Array.isArray(displayBuffer.items)) return []
  return displayBuffer.items.map(item => ({
    ...item,
    preview: decodeDisplayPreview(displayBuffer.data, item.preview),
    renderParts: Array.isArray(item.renderParts)
      ? item.renderParts.map(part => ({ role: part.role || 'surface', preview: decodeDisplayPreview(displayBuffer.data, part.preview) })).filter(part => part.preview != null)
      : []
  }))
}

export default function useEditorBridge ({ closeAllPopupPanels, saveEditorGraphToFile, loadEditorGraphFromFile, requestNodeDocumentCommand, onPluginCatalog, onPluginInstalled }) {
  const editorMode = ref(false)

  const editorSaveMessage = ref('')

  const editorExecutionState = ref({ stepMode: true, lastAction: '' })

  const editorFrameLoaded = ref(false)
  let stopMaterialSelection
  let lastMaterialObject
  const previewRequests = new Map()

  function runEditorCommand (command, value = null) {
    const editorFrame = document.getElementById('editorFrame')
    if (editorFrame?.contentWindow == null) return
    // Vue wraps state in proxies, which cannot cross the iframe message boundary.
    const messageValue = value != null && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value
    editorFrame.contentWindow.postMessage({ type: 'pandaui-editor-command', command, value: messageValue }, window.location.origin)
  }

  function postToEditor (message) {
    const editorFrame = document.getElementById('editorFrame')
    if (editorFrame?.contentWindow != null) editorFrame.contentWindow.postMessage(message, window.location.origin)
  }

  function switchEditorMode (event) {
    editorMode.value = event.detail?.active === true
    const position = event.detail?.addNodeMenu
    if (!editorMode.value || !position) return
    const frame = document.getElementById('editorFrame')
    const graph = frame?.contentWindow?.graphcanvas
    if (!graph) return
    const bounds = frame.getBoundingClientRect()
    const clientX = position.clientX - bounds.left
    const clientY = position.clientY - bounds.top
    graph.canvas.focus({ preventScroll: true })
    graph.showAddNodeMenu(clientX, clientY, graph.toGraph(clientX, clientY))
  }

  const transformDisplayBuffer = async message => {
    let transformedCount = 0
    let error = ''
    try {
      transformedCount = message.type === 'pandaui-transform-display-buffer-matrix'
        ? PandaUIApp.transformGraphDisplayBufferMatrix(message.marker, message.transform, message.relative === true)
        : PandaUIApp.transformGraphDisplayBuffers(
          message.marker,
          message.translation,
          message.rotation,
          message.scale,
          message.relative === true
        )
      if (transformedCount === 0) error = 'Display buffer objects were not found or the transform is invalid.'
    } catch (transformError) {
      error = transformError.message || String(transformError)
    }
    document.getElementById('editorFrame').contentWindow.postMessage({
      type: 'pandaui-display-buffer-transformed',
      nodeId: message.nodeId,
      marker: message.marker,
      transformedCount,
      error
    }, window.location.origin)
  }

  const handlers = {
    'pandaui-scene-material-reference': async message => {
      try {
        const keys = PandaUIApp.getDisplayPipeline().importedMaterialReference(message.reference)
        postToEditor({ type: 'pandaui-scene-material-reference-result', nodeId: String(message.nodeId), requestId: message.requestId, keys })
      } catch (error) { postToEditor({ type: 'pandaui-scene-material-reference-result', nodeId: String(message.nodeId), requestId: message.requestId, error: error.message }) }
    },
    'pandaui-object-uv': async message => {
      try {
        const pipeline = PandaUIApp.getDisplayPipeline()
        const result = message.action === 'capture' ? { reference: pipeline.objectUVSelection() } : pipeline.editObjectUV(message)
        postToEditor({ type: 'pandaui-object-uv-result', nodeId: String(message.nodeId), requestId: message.requestId, role: message.role, ...result })
      } catch (error) { postToEditor({ type: 'pandaui-object-uv-result', nodeId: String(message.nodeId), requestId: message.requestId, error: error.message }) }
    },
    'pandaui-scene-material-preview': async message => {
      clearTimeout(previewRequests.get(String(message.nodeId)))
      previewRequests.set(String(message.nodeId), setTimeout(() => {
        previewRequests.delete(String(message.nodeId))
        try { postToEditor({ type: 'pandaui-scene-material-preview-result', nodeId: String(message.nodeId), requestId: message.requestId, image: PandaUIApp.getDisplayPipeline().importedMaterialPreview(message.key) }) } catch (error) {
          postToEditor({ type: 'pandaui-scene-material-preview-result', nodeId: String(message.nodeId), requestId: message.requestId, error: error.message })
        }
      }, 32))
    },
    'pandaui-scene-materials-list': async message => {
      try { postToEditor({ type: 'pandaui-scene-materials-result', nodeId: String(message.nodeId), requestId: message.requestId, materials: PandaUIApp.getDisplayPipeline().importedMaterialCatalog(), selectedKeys: PandaUIApp.getDisplayPipeline().importedMaterialSelection() }) } catch (error) {
        postToEditor({ type: 'pandaui-scene-materials-result', nodeId: String(message.nodeId), requestId: message.requestId, error: error.message })
      }
    },
    'pandaui-scene-material-edit': async message => {
      try {
        const result = await PandaUIApp.getDisplayPipeline().updateImportedMaterial(message.key, message.settings)
        postToEditor({ type: 'pandaui-scene-material-status', nodeId: String(message.nodeId), requestId: message.requestId, status: result.stale ? 'Superseded' : `${result.count} material slot(s) updated` })
      } catch (error) { postToEditor({ type: 'pandaui-scene-material-status', nodeId: String(message.nodeId), requestId: message.requestId, error: error.message }) }
    },
    'pandaui-mnurbs-command': async message => {
      try {
        const pipeline = PandaUIApp.getDisplayPipeline()
        let status
        if (message.command === 'display') status = `${await pipeline.setSubDDisplay(message.mode, message.scope === 'all')} SubD object(s) updated`
        else if (message.command === 'points-on') {
          if (!await pipeline.showControlPoints()) throw new Error('Unable to open control points. Select an editable curve, surface or SubD; see viewport status.')
          status = 'Control points on'
        } else if (message.command === 'points-off') {
          if (!pipeline.hideControlPoints()) throw new Error('Wait for the control point operation to finish.')
          status = 'Control points off'
        } else throw new Error('Unknown MNurbs command.')
        postToEditor({ type: 'pandaui-mnurbs-status', nodeId: String(message.nodeId), requestId: message.requestId, status })
      } catch (error) { postToEditor({ type: 'pandaui-mnurbs-status', nodeId: String(message.nodeId), requestId: message.requestId, error: error.message }) }
    },
    'pandaui-render-config': async message => {
      try { await PandaUIApp.getDisplayPipeline().getRenderEngine().setConfiguration(message.nodeId, message.descriptor) } catch (error) {
        postToEditor({ type: 'pandaui-render-status', nodeId: String(message.nodeId), state: 'error', error: error.message })
      }
    },
    'pandaui-render-selection-request': async message => {
      try { postToEditor({ type: 'pandaui-render-selection-result', nodeId: String(message.nodeId), requestId: message.requestId, targets: PandaUIApp.getDisplayPipeline().renderNodeSelection() }) } catch (error) {
        postToEditor({ type: 'pandaui-render-selection-result', nodeId: String(message.nodeId), requestId: message.requestId, targets: [], error: error.message })
      }
    },
    'pandaui-render-export': async message => {
      try {
        const engine = PandaUIApp.getDisplayPipeline().getRenderEngine()
        const blob = await engine.exportImage(message.nodeId, message)
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = Array.from(String(message.filename || 'render.png'), char => char.charCodeAt(0) < 32 || /[\\/]/.test(char) ? '_' : char).join('').replace(/(?:\.png)?$/i, '.png')
        document.body.appendChild(link); link.click(); link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        postToEditor({ type: 'pandaui-render-status', nodeId: String(message.nodeId), requestId: message.requestId, state: 'exported', backend: engine.lastExportBackend, message: `PNG exported using ${engine.lastExportBackend}.${engine.pathFailure ? ' ' + engine.pathFailure : ''}` })
      } catch (error) { postToEditor({ type: 'pandaui-render-status', nodeId: String(message.nodeId), requestId: message.requestId, state: 'error', error: error.message }) }
    },
    'pandaui-switch-editor-mode': async message => {
      editorMode.value = message.active === true
    },
    'pandaui-editor-pointerdown': async () => {
      closeAllPopupPanels()
    },
    'pandaui-clipping-plane': async message => {
      PandaUIApp.getDisplayPipeline().setClippingPlane(message.nodeId, message.descriptor)
    },
    'pandaui-clipping-plane-clear': async message => {
      PandaUIApp.getDisplayPipeline().removeClippingPlane(message.nodeId)
    },
    'pandaui-kuka-robot': async message => {
      const frame = document.getElementById('editorFrame')
      const nodeId = String(message.nodeId || '')
      const robotName = String(message.robotName || 'Kuka 2700')
      if (frame?.contentWindow != null) frame.contentWindow.postMessage({ type: 'pandaui-kuka-robot-status', nodeId, revision: message.revision, status: `Loading ${robotName}...` }, window.location.origin)
      try {
        if (!await PandaUIApp.setKukaRobotPreview(nodeId, message)) return
        const transformStatus = String(message.transformSummary || '').trim()
        if (frame?.contentWindow != null) frame.contentWindow.postMessage({ type: 'pandaui-kuka-robot-status', nodeId, revision: message.revision, status: transformStatus ? `${robotName} ready · ${transformStatus}` : `${robotName} ready`, loaded: true }, window.location.origin)
      } catch (error) {
        console.error('Unable to load Kuka 2700 preview:', error)
        if (frame?.contentWindow != null) frame.contentWindow.postMessage({ type: 'pandaui-kuka-robot-status', nodeId, revision: message.revision, status: error.message || String(error), loaded: false }, window.location.origin)
      }
    },
    'pandaui-kuka-robot-clear': async message => {
      PandaUIApp.clearKukaRobotPreview(message.nodeId)
    },
    'pandaui-draw-point': async message => {
      PandaUIApp.setGraphPoint(message.id, message)
    },
    'pandaui-parameter-pick': async message => {
      const pipeline = PandaUIApp.getDisplayPipeline()
      pipeline.beginParameterPick(message, result => {
        document.getElementById('editorFrame')?.contentWindow?.postMessage({ type: 'pandaui-parameter-picked', ...result }, window.location.origin)
        editorMode.value = true
      })
      editorMode.value = false
    },
    'pandaui-parameter-pick-cancel': async message => {
      const picker = PandaUIApp.getDisplayPipeline()?.parameterPicker
      if (picker?.options.token === message.token) picker.finish(true)
    },
    'pandaui-pick-curve': async message => {
      editorMode.value = false
      PandaUIApp.pickCurve((curveId, sourceObject, points) => {
        document.getElementById('editorFrame').contentWindow.postMessage({ type: 'pandaui-curve-picked', nodeId: message.nodeId, curveId, sourceObject, points }, window.location.origin)
        editorMode.value = true
      })
    },
    'pandaui-pick-object': async message => {
      editorMode.value = false
      PandaUIApp.pickObject(marker => {
        document.getElementById('editorFrame').contentWindow.postMessage({ type: 'pandaui-object-picked', nodeId: message.nodeId, marker }, window.location.origin)
        editorMode.value = true
      })
    },
    'pandaui-transform-display-buffer': transformDisplayBuffer,
    'pandaui-transform-display-buffer-matrix': transformDisplayBuffer,
    'pandaui-transform-object': async message => {
      let marker = null
      let error = ''
      if (message.mode === 'view' || message.marker?.geometryId == null || message.marker?.documentId == null) {
        marker = PandaUIApp.transformSceneObject(message.marker, message.operation, message.values, message.relative === true)
        if (marker == null) error = 'Scene object was not found or the transform is invalid.'
      } else {
        try {
          const matrix = PandaUIApp.createModelTransformMatrix(message.marker, message.operation, message.values, message.relative === true)
          if (matrix == null) throw new Error('Transform matrix is invalid.')
          const pipeline = PandaUIApp.getDisplayPipeline()
          const display = pipeline.captureTransformDisplay(message.marker, matrix)
          const result = await PandaUIApp.getOperations().executeModeling({
            documentId: message.marker.documentId,
            command: 'modeling.transform_geometry',
            geometryRef: message.marker.geometryRef,
            matrix
          }, display)
          marker = pipeline.createSceneObjectMarker(pipeline.resolveSceneObjects(message.marker)[0])
          marker.geometryRef = result.value.geometryRef
        } catch (transformError) {
          error = transformError.message || String(transformError)
        }
      }
      document.getElementById('editorFrame').contentWindow.postMessage({
        type: 'pandaui-object-transformed',
        nodeId: message.nodeId,
        marker,
        error
      }, window.location.origin)
    },
    'pandaui-highlight-curve': async message => {
      PandaUIApp.highlightCurve(message.curveId)
    },
    'pandaui-clear-curve-highlight': async () => {
      PandaUIApp.clearCurveHighlight()
    },
    'pandaui-editor-exit': async () => {
      editorMode.value = false
    },
    'pandaui-editor-save': async () => {
      saveEditorGraphToFile()
    },
    'pandaui-editor-load': async () => {
      loadEditorGraphFromFile()
    },
    'pandaui-node-document-command': async message => {
      requestNodeDocumentCommand(message.command)
    },
    'pandaui-editor-status': async message => {
      editorSaveMessage.value = message.status || ''
      if (message.error) PandaUIApp.getViewportUi().state.status = editorSaveMessage.value
    },
    'pandaui-collaboration-status': async message => {
      const status = message.status || {}
      if (status.state === 'conflict' || status.state === 'error' || status.state === 'sync-error') {
        editorSaveMessage.value = status.message || status.state
        PandaUIApp.getViewportUi().state.status = editorSaveMessage.value
      }
    },
    'pandaui-editor-execution-state': async message => {
      editorExecutionState.value = {
        stepMode: message.stepMode === true,
        lastAction: typeof message.lastAction === 'string' ? message.lastAction : ''
      }
    },
    'pandaui-draw-point-cloud': async message => {
      PandaUIApp.setGraphPointCloud(message.id, message)
    },
    'pandaui-set-geometry-buffer': async message => {
      decodePortDisplayBuffer(message.buffer).forEach(item => {
        if (item.geometryRef == null && item.preview?.type === 'points' && item.preview.positions.length >= 3 && item.renderParts.length === 0) {
          PandaUIApp.setGraphPoint(item.id, {
            id: item.id,
            x: item.preview.positions[0],
            y: item.preview.positions[1],
            z: item.preview.positions[2],
            color: message.display?.color,
            opacity: message.display?.opacity,
            visible: message.display?.previewVisibility?.visible !== false && message.display?.previewVisibility?.wireVisible !== false,
            nodeId: message.display?.nodeId,
            portIndex: message.display?.portIndex,
            portName: message.display?.portName,
            previewVisibility: message.display?.previewVisibility
          })
          return
        }
        const payload = item.geometryRef != null
          ? { geometryRef: item.geometryRef, preview: item.preview, renderParts: item.renderParts }
          : { __geo: item.geometryType, preview: item.preview, renderParts: item.renderParts, pickValues: item.pickValues }
        PandaUIApp.setGraphGeometry(item.id, { ...payload, sceneGeometry: item.sceneGeometry, pickAmbiguous: item.pickAmbiguous }, { ...message.display, type: item.geometryType })
      })
    },
    'pandaui-draw-param-preview': async message => {
      PandaUIApp.clearGraphPreview(message.marker, message.role)
      decodePortDisplayBuffer(message.buffer).forEach(item => {
        const previewId = `${item.id}:preview:${message.role}`
        if (item.geometryRef == null && item.preview?.type === 'points' && item.preview.positions.length >= 3 && item.renderParts.length === 0) {
          PandaUIApp.setGraphPoint(previewId, {
            id: previewId,
            x: item.preview.positions[0],
            y: item.preview.positions[1],
            z: item.preview.positions[2],
            color: message.display?.color,
            opacity: message.display?.opacity,
            visible: true,
            nodeId: message.marker?.nodeId,
            portIndex: message.marker?.portIndex,
            portName: message.marker?.portName,
            previewRole: message.role,
            previewVisibility: message.display?.previewVisibility
          })
          return
        }
        const payload = item.geometryRef != null
          ? { geometryRef: item.geometryRef, preview: item.preview, renderParts: item.renderParts }
          : { __geo: item.geometryType, preview: item.preview, renderParts: item.renderParts, pickValues: item.pickValues }
        PandaUIApp.setGraphGeometry(previewId, { ...payload, sceneGeometry: item.sceneGeometry, pickAmbiguous: item.pickAmbiguous }, { ...message.display, type: item.geometryType, previewRole: message.role })
      })
    },
    'pandaui-set-geometry': async message => {
      const payload = message.geometryRef != null
        ? { geometryRef: message.geometryRef, preview: message.preview, renderParts: message.renderParts }
        : (message.preview ? { ...message.raw, preview: message.preview } : message.raw)
      PandaUIApp.setGraphGeometry(message.id, payload, message.display)
    },
    'pandaui-set-param-preview-visibility': async message => {
      PandaUIApp.setGraphPreviewVisibility(message.marker, message.role, message.visible, message.attributes)
    },
    'pandaui-set-node-preview-visibility': async message => {
      PandaUIApp.setGraphNodePreviewVisibility(message.nodeId, message.visible)
    },
    'pandaui-node-preview-selection': async message => {
      PandaUIApp.setGraphNodeSelection(message.nodeIds)
    },
    'pandaui-clear-param-preview': async message => {
      PandaUIApp.clearGraphPreview(message.marker, message.role)
    },
    'pandaui-bake-param-preview': async message => {
      const count = PandaUIApp.bakeGraphPreview(message.marker)
      if (!count) throw new Error('No output preview is available to bake.')
    },
    'pandaui-zoom-param-preview': async message => {
      PandaUIApp.zoomGraphPreview(message.marker, message.bounds, message.sources)
    },
    'pandaui-release-geometry': async message => {
      PandaUIApp.releaseGeometry(message.documentId, message.geometryId)
    },
    'pandaui-node-plugin-catalog': async message => {
      onPluginCatalog(message)
    },
    'pandaui-node-plugin-installed': async message => {
      onPluginInstalled(message)
    }
  }

  const syncEditorEvent = createEditorMessageRouter(handlers, {
    getFrame: () => document.getElementById('editorFrame'),
    getOrigin: () => window.location.origin,
    onError: error => { editorSaveMessage.value = error.message || String(error) }
  })

  const showOperationError = event => {
    editorSaveMessage.value = event.detail?.message || 'Document operation failed.'
    PandaUIApp.getViewportUi().state.status = editorSaveMessage.value
  }

  watch(editorMode, active => {
    const graph = document.getElementById('editorFrame')?.contentWindow?.graphcanvas
    if (graph) graph.setEditorMode(active)
    else if (editorFrameLoaded.value) postToEditor({ type: 'pandaui-editor-mode', active })
  }, { flush: 'sync' })
  onMounted(() => {
    stopMaterialSelection = PandaUIApp.onSelectionChanged(() => {
      const object = PandaUIApp.getDisplayPipeline()?.getSelectedObjectRoot()
      if (object === lastMaterialObject) return
      lastMaterialObject = object
      const keys = PandaUIApp.getDisplayPipeline()?.importedMaterialSelection() || []
      postToEditor({ type: 'pandaui-scene-material-selection', keys })
    })
    window.addEventListener('message', syncEditorEvent)
    window.addEventListener('pandaui-switch-editor-mode', switchEditorMode)
    window.addEventListener('pandaui-operation-error', showOperationError)
  })
  onUnmounted(() => {
    stopMaterialSelection?.(); previewRequests.forEach(clearTimeout); previewRequests.clear()
    PandaUIApp.getDisplayPipeline()?.clearRenderNodes()
    window.removeEventListener('message', syncEditorEvent)
    window.removeEventListener('pandaui-switch-editor-mode', switchEditorMode)
    window.removeEventListener('pandaui-operation-error', showOperationError)
    PandaUIApp.getOperations().bind(null)
  })

  return { editorMode, editorSaveMessage, editorExecutionState, editorFrameLoaded, runEditorCommand, postToEditor }
}
