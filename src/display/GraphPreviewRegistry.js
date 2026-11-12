import * as THREE from 'three'
import { isDisplayOnlySharedObject } from './SharedSelectionPolicy'
import RhinoGeometryConverter from '../RhinoGeometryConverter.js'
import { documentGeometryVisible } from '../GeometryDocumentViewState'
import { expandVisibleSceneBounds } from '../SceneBounds'
import { captureGeometry, restoreGeometryPreview } from '../SceneGeometryPreview.js'
import { createBrepSelection, releaseBrepSelection, materializeBrepSelection } from '../BrepDisplayRanges'
import { createPointMaterial, setPointDisplaySettings } from '../PointDisplaySettings'
import { renderPreviewSurfaceDepth } from '../PreviewSurfaceRendering'
import { removeDocumentDisplay } from '../DocumentObjectMoves'
import { DEFAULT_SHADING_SETTINGS } from '../DisplayMaterialSettings'

export default class GraphPreviewRegistry {
  #services
  #previewScene = new THREE.Scene()
  #previewObjects = new Map()
  #documentObjects = new Set()
  #nodeState = { visibility: new Map(), selected: new Set() }

  constructor (services) {
    this.#services = services
    const graphSkyLight = new THREE.HemisphereLight(0xffffff, 0x8f969c, DEFAULT_SHADING_SETTINGS.skyLight)
    graphSkyLight.name = 'Graph sky light'
    this.#previewScene.add(graphSkyLight)
    const graphKeyLight = new THREE.DirectionalLight(0xffffff, DEFAULT_SHADING_SETTINGS.keyLight)
    graphKeyLight.name = 'Graph key light'
    graphKeyLight.position.set(0.3, -0.5, 1)
    this.#previewScene.add(graphKeyLight)
    const graphFillLight = new THREE.DirectionalLight(0x9fc4ff, 0)
    graphFillLight.name = 'Graph fill light'
    graphFillLight.position.set(-0.8, 0.4, 0.35)
    this.#previewScene.add(graphFillLight)
  }

  removeGraphGeometry (id) {
    const object = this.#previewObjects.get(id)
    if (object == null) return false
    this.disposeGraphObject(object)
    this.#previewScene.remove(object)
    this.#previewObjects.delete(id)
    this.#services.setDirtyFlag()
    return true
  }

  removeSharedSource (root) {
    if (!root) return false
    const contains = object => object && (object === root || root.getObjectByProperty('uuid', object.uuid) != null)
    if (contains(this.#services.getSelectedObjectRoot?.())) this.#services.setSelectedObject(null)
    if (contains(this.#services.getCurrentGroupEditContext?.())) this.#services.clearGroupEditMode()
    if (this.#documentObjects.delete(root)) {
      root.parent?.remove(root)
      this.disposeGraphObject(root)
      this.#services.setDirtyFlag()
      return true
    }
    const id = this.graphIdForObject(root)
    if (id != null) return this.removeGraphGeometry(id)
    const documents = this.#services.getModelDocuments()
    let model
    for (let parent = root.parent; parent && !model; parent = parent.parent) model = documents.find(document => parent === document.three?.middleground)
    if (!model) return false
    removeDocumentDisplay(model, root)
    this.#services.setDirtyFlag()
    return true
  }

  sharedSceneSources () {
    const sources = []
    const seen = new Set()
    const add = root => {
      if (seen.has(root)) return
      seen.add(root)
      sources.push({ key: 'model:' + (root.userData.pandauiObjectId || root.uuid), nativeDocumentId: root.userData.documentId, localDocumentId: root.userData.localDocumentId, geometryId: root.userData.geometryId, root })
    }
    this.#documentObjects.forEach(add)
    const visit = root => {
      if (root.userData?.renderBatch || root.userData?.nodePreview || root.userData?.sharedScene || root.userData?.selectionHighlight || root.userData?.renderShadowGround || root.isLight || root.isCamera) return
      if (root.userData?.importedBlockInstance || root.userData?.importedModelObject || root.userData?.geometryId || root.isMesh || root.isLine || root.isPoints) {
        add(root)
        return
      }
      root.children.forEach(visit)
    }
    const documents = this.#services.getModelDocuments?.() || [this.#services.getActiveModel()]
    documents.forEach(document => document?.three?.middleground.children.forEach(visit))
    return sources
  }

  findSceneGeometry (documentId, geometryId) {
    let match = null
    const inspect = root => root?.traverse(object => {
      if (match != null || object.userData?.documentId !== documentId || object.userData?.geometryId !== geometryId) return
      match = this.getTransformTarget(object)
    })
    inspect(this.#previewScene)
    inspect(this.#services.getActiveModel()?.three?.middleground)
    return match
  }

  documentTreeObjects (reference) {
    const objects = new Set()
    const matchesLayer = path => !reference.layerPath || path === reference.layerPath || path?.startsWith(reference.layerPath + '::')
    const addShared = object => {
      const shared = object.userData?.sharedObject || object.userData?.sharedDocument
      if (!shared) return
      if (reference.objectId) {
        if (shared.objectId === reference.objectId) objects.add(object)
        return
      }
      if (![shared.nativeDocumentId, shared.privateDocumentId, shared.publicDocumentId].includes(reference.documentId)) return
      if (reference.geometryId && shared.geometryId !== reference.geometryId) return
      if (reference.poolGeneration && shared.poolGeneration && reference.poolGeneration !== shared.poolGeneration) return
      if (matchesLayer(shared.layerPath)) objects.add(object)
    }
    const matches = object => !reference.objectId && object.userData?.documentId === reference.documentId &&
      (!reference.geometryId || object.userData.geometryId === reference.geometryId) &&
      (!reference.poolGeneration || object.userData.poolGeneration === reference.poolGeneration) && matchesLayer(object.fullLayerPath || object.userData.layerPath)
    this.#services.getModelDocuments().forEach(document => {
      document.objectsByGeometryId?.forEach(addShared)
      if (reference.objectId || document.documentId !== reference.documentId || (reference.poolGeneration && document.poolGeneration !== reference.poolGeneration)) return
      if (reference.geometryId) {
        const object = document.objectsByGeometryId?.get(reference.geometryId)
        if (object && matchesLayer(object.fullLayerPath || object.userData.layerPath)) objects.add(object)
      } else document.objectsByGeometryId?.forEach(object => { if (matchesLayer(object.fullLayerPath || object.userData.layerPath)) objects.add(object) })
    })
    this.#previewObjects.forEach(object => { if (matches(object)) objects.add(object) })
    this.#documentObjects.forEach(object => { if (matches(object)) objects.add(object); addShared(object) })
    this.#services.getActiveModel()?.three?.middleground.traverse(object => { if (object.userData?.sharedObject || object.userData?.sharedDocument) addShared(object) })
    this.#previewScene.children.filter(object => object.userData?.sharedScene).forEach(scene => {
      scene.children.forEach(addShared)
    })
    return Array.from(objects)
  }

  documentTreeSelection () {
    const data = this.#services.getSelectedObjectRoot()?.userData
    if (data?.sharedObject) {
      const shared = data.sharedObject
      return { documentId: shared.nativeDocumentId || shared.privateDocumentId, geometryId: shared.geometryId, objectId: shared.objectId, poolGeneration: shared.poolGeneration }
    }
    return data?.documentId && data?.geometryId ? { documentId: data.documentId, geometryId: data.geometryId, poolGeneration: data.poolGeneration } : null
  }

  selectDocumentTreeItem (reference) {
    const object = this.documentTreeObjects(reference).find(candidate => !candidate.userData.nodePreview && !candidate.userData.nonselectable && !isDisplayOnlySharedObject(candidate))
    if (!object) return false
    this.#services.clearGroupEditMode()
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false
    this.#services.setSelectedObject(object)
    return this.#services.getSelectedObjectRoot() != null
  }

  zoomDocumentTreeItem (reference) {
    const bounds = new THREE.Box3()
    this.documentTreeObjects(reference).forEach(object => {
      expandVisibleSceneBounds(object, bounds)
    })
    if (bounds.isEmpty()) return false
    this.#services.zoomExtentsWithoutRhino(false, bounds)
    return true
  }

  graphIdForObject (target) {
    let match = null
    this.#previewObjects.forEach((object, id) => {
      if (match == null && (object === target || object.getObjectByProperty('uuid', target?.uuid) != null)) match = id
    })
    return match
  }

  applyModelingResult (result, geometryKeys = null) {
    const selectedRoot = this.#services.getSelectedObject() == null ? null : this.getTransformTarget(this.#services.getSelectedObject())
    const selectedDocumentId = selectedRoot?.userData?.documentId
    const selectedGeometryId = selectedRoot?.userData?.geometryId
    ;(result?.releasedGeometryIds || []).forEach(geometryId => {
      if (selectedDocumentId === result.documentId && selectedGeometryId === geometryId) this.#services.setSelectedObject(null)
      const key = geometryKeys?.get(String(geometryId))
      if (key != null) this.removeGraphGeometry(key)
      this.releaseGeometry(result.documentId, geometryId)
      geometryKeys?.delete(String(geometryId))
    })

    let lastObject = null
    ;(result?.renderUpdates || []).forEach(update => {
      const geometryRef = update.geometryRef || {
        documentId: result.documentId,
        geometryId: update.geometryId,
        geometryType: update.geometryType,
        revision: update.revision
      }
      const existing = this.findSceneGeometry(geometryRef.documentId, geometryRef.geometryId)
      const wasSelected = existing != null && selectedRoot === existing
      if (existing != null) {
        const graphId = this.graphIdForObject(existing)
        const marker = this.createSceneObjectMarker(existing)
        const replacementMarker = this.replaceSceneGeometry(marker, geometryRef, update.preview, update.parts)
        lastObject = replacementMarker == null ? null : this.resolveSceneObjects(replacementMarker)[0]
        if (graphId != null) geometryKeys?.set(String(geometryRef.geometryId), graphId)
        if (wasSelected && lastObject != null) this.#services.setSelectedObject(lastObject)
      } else {
        const key = geometryKeys?.get(String(geometryRef.geometryId)) || `modeling:${geometryRef.geometryId}`
        geometryKeys?.set(String(geometryRef.geometryId), key)
        lastObject = this.setGraphGeometry(key, {
          geometryRef,
          preview: update.preview,
          renderParts: update.parts
        }, {
          color: 0x31ccec,
          edgesColor: 0x31ccec,
          previewRole: 'wire',
          portName: 'Modeling'
        })
      }
    })
    this.#services.setDirtyFlag()
    return lastObject
  }

  setGraphPoint (id, point) {
    let drawPoint = this.#previewObjects.get(id)
    if (drawPoint != null && !drawPoint.isPoints) {
      this.disposeGraphObject(drawPoint)
      this.#previewScene.remove(drawPoint)
      this.#previewObjects.delete(id)
      drawPoint = null
    }
    if (drawPoint == null) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3))
      const material = createPointMaterial({
        color: point.color,
        sizeAttenuation: false,
        depthTest: false,
        depthWrite: false,
        transparent: true
      })
      drawPoint = new THREE.Points(geometry, material)
      drawPoint.frustumCulled = false
      drawPoint.renderOrder = 1000
      this.#previewObjects.set(id, drawPoint)
      this.#previewScene.add(drawPoint)
    }

    drawPoint.visible = point.visible !== false
    drawPoint.userData.graphId = String(id)
    drawPoint.userData.nodeId = point.nodeId == null ? null : String(point.nodeId)
    drawPoint.userData.portIndex = Number.isInteger(point.portIndex) ? point.portIndex : Number(point.portIndex)
    drawPoint.userData.portName = point.portName || ''
    drawPoint.userData.pandauiPreviewRole = point.previewRole || 'wire'
    drawPoint.userData.previewCollectionRole = point.previewRole || 'wire'
    drawPoint.userData.previewVisibility = { ...(point.previewVisibility || {}) }
    drawPoint.geometry.attributes.position.setXYZ(0, point.x, point.y, point.z)
    drawPoint.geometry.attributes.position.needsUpdate = true
    delete drawPoint.material.userData.graphPreviewBaseColor
    drawPoint.material.color.set(point.color)
    drawPoint.material.needsUpdate = true
    this.applyGraphPreviewMetadata(drawPoint, id, point)
    this.#services.setDirtyFlag()
  }

  addPreviewObject (object) {
    if (object == null) return false
    object.userData.nodePreview = true
    this.#previewScene.add(object)
    this.#services.setDirtyFlag()
    return true
  }

  removePreviewObject (object) {
    if (object == null || object.parent !== this.#previewScene) return false
    this.#previewScene.remove(object)
    this.#services.setDirtyFlag()
    return true
  }

  setGraphPointCloud (id, pointCloud) {
    let drawPoints = this.#previewObjects.get(id)
    if (drawPoints == null) {
      const material = createPointMaterial({
        color: pointCloud.color || '#31ccec',
        sizeAttenuation: false,
        transparent: true,
        alphaTest: 0.5,
        depthTest: false,
        depthWrite: false
      })
      drawPoints = new THREE.Points(new THREE.BufferGeometry(), material)
      drawPoints.frustumCulled = false
      drawPoints.renderOrder = 1000
      this.#previewObjects.set(id, drawPoints)
      this.#previewScene.add(drawPoints)
    }
    const values = []
    ;(pointCloud.points || []).forEach(point => {
      const x = Number(Array.isArray(point) ? point[0] : point?.x)
      const y = Number(Array.isArray(point) ? point[1] : point?.y)
      const z = Number(Array.isArray(point) ? point[2] : point?.z)
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) values.push(x, y, z)
    })
    drawPoints.geometry.dispose()
    drawPoints.geometry = new THREE.BufferGeometry()
    drawPoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3))
    drawPoints.geometry.computeBoundingSphere()
    drawPoints.visible = pointCloud.visible !== false
    delete drawPoints.material.userData.graphPreviewBaseColor
    drawPoints.material.color.set(pointCloud.color || '#31ccec')
    drawPoints.material.needsUpdate = true
    this.applyGraphPreviewMetadata(drawPoints, id, pointCloud)
    this.#services.setDirtyFlag()
  }

  setGraphPointSize (size) {
    setPointDisplaySettings({ size })
    this.#services.setDirtyFlag()
  }

  getGraphObjectsBoundingBox () {
    const bounds = new THREE.Box3()
    expandVisibleSceneBounds(this.#previewScene, bounds)
    return bounds.isEmpty() ? null : bounds
  }

  zoomGraphPreview (marker, fallbackBounds, sources = []) {
    if (marker?.nodeId == null || !Number.isInteger(marker.portIndex)) return false
    const bounds = new THREE.Box3()
    const expand = target => {
      if (target?.nodeId == null || !Number.isInteger(target.portIndex)) return
      this.#previewObjects.forEach(object => {
        if (String(object.userData.nodeId) === String(target.nodeId) && object.userData.portIndex === target.portIndex) expandVisibleSceneBounds(object, bounds, true)
      })
    }
    expand(marker)
    if (bounds.isEmpty() && Array.isArray(fallbackBounds) && fallbackBounds.length === 6 && fallbackBounds.every(Number.isFinite)) {
      bounds.min.fromArray(fallbackBounds)
      bounds.max.fromArray(fallbackBounds, 3)
    }
    if (bounds.isEmpty() && Array.isArray(sources)) sources.forEach(expand)
    if (bounds.isEmpty()) return false
    this.#services.zoomExtentsWithoutRhino(true, bounds)
    this.#services.setDirtyFlag()
    return true
  }

  captureScenePreview (references) {
    if (!Array.isArray(references) || references.length === 0) return null
    const model = this.#services.getActiveModel()
    const incompleteIds = new Set()
    if (model?.loadedChunkFiles) {
      for (const chunk of model.chunks || []) {
        if ((chunk.parts || [chunk]).some(part => !model.loadedChunkFiles.has(part.file))) incompleteIds.add(chunk.geometryId)
      }
    }
    const result = []
    for (const reference of references) {
      if (reference?.kind !== 'geometryRef' || !/brep|surface|curve|mesh/i.test(reference.geometryType || '') ||
          (reference.pickType && !['geometry', 'brep', 'surface', 'curve', 'mesh'].includes(reference.pickType))) return null
      const subobject = reference.subobject
      const matches = []
      let incompatibleTransform = false
      const collect = root => root?.traverse(object => {
        const data = object.userData
        if (!object.geometry?.isBufferGeometry || (!object.isMesh && !object.isLine) || object.isInstancedMesh || object.isSkinnedMesh ||
            Object.keys(object.geometry.morphAttributes || {}).length > 0 ||
            data?.meshGeometryEdges || data?.isPlaceholder || data?.selectionHighlight || data?.parameterPickAmbiguous) return
        const sameObject = data?.documentId === reference.documentId && data?.geometryId === reference.geometryId && Number(data.revision) === Number(reference.revision)
        const samePreview = !reference.subobject && !reference.pickTransform && reference.previewId && data?.previewId === reference.previewId
        if (!sameObject && !samePreview) return
        if (!object.geometry.getAttribute('position')?.count || object.geometry.drawRange.count === 0) return
        for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
          if (ancestor.userData?.parameterPickAmbiguous) return
          if (ancestor.userData?.poolGeneration && reference.poolGeneration && ancestor.userData.poolGeneration !== reference.poolGeneration) return
        }
        let candidate = object
        if (subobject) {
          const ranges = subobject.type === 'brepEdge' ? data.edgeRanges : data.faceRanges
          if (ranges) {
            const range = ranges.find(range => (subobject.type === 'brepEdge' ? range.edgeIndex : range.faceIndex) === subobject.index)
            if (!range) return
            candidate = createBrepSelection(object, { ...subobject, range })
          } else if (subobject.type === 'brepEdge' ? !object.isLine || data.edgeIndex !== subobject.index : data.faceIndex !== subobject.index) return
        }
        if (reference.pickTransform) {
          object.updateWorldMatrix(true, false)
          if (object.matrixWorld.elements.some((value, index) => Math.abs(value - reference.pickTransform[index]) > 1e-9)) {
            incompatibleTransform = true
            if (candidate !== object) releaseBrepSelection(candidate)
            return
          }
        }
        matches.push(candidate)
      })
      if (model?.documentId === reference.documentId && incompleteIds.has(reference.geometryId)) return null
      collect(model?.documentId === reference.documentId
        ? model.objectsByGeometryId?.get(reference.geometryId) || model?.three?.middleground
        : model?.three?.middleground)
      if (!matches.length) {
        const exact = Array.from(this.#previewObjects.values()).filter(object => object.userData.geometryId === reference.geometryId && object.userData.documentId === reference.documentId)
        if (exact.length) exact.forEach(collect)
        else {
          const alias = Array.from(this.#previewObjects.values()).find(object => reference.previewId && object.userData.previewId === reference.previewId)
          if (alias) {
            this.#previewObjects.forEach(object => {
              if (object.userData.geometryId === alias.userData.geometryId && object.userData.documentId === alias.userData.documentId) collect(object)
            })
          }
        }
      }
      const requiresMesh = subobject?.type !== 'brepEdge' && /brep|surface|mesh/i.test(reference.geometryType)
      const requiresEdges = subobject?.type === 'brepEdge' || (!subobject && /brep|surface|curve/i.test(reference.geometryType))
      if (incompatibleTransform || !matches.length || (requiresMesh && !matches.some(object => object.isMesh)) ||
          (requiresEdges && !matches.some(object => object.isLine))) return null
      const snapshots = matches.map(captureGeometry)
      matches.forEach(releaseBrepSelection)
      if (snapshots.some(snapshot => !snapshot)) return null
      result.push(snapshots)
    }
    return result
  }

  setGraphGeometry (id, raw, displayInfo) {
    const geometryRef = raw?.geometryRef || (raw?.kind === 'geometryRef' ? raw : null)
    const converterPayload = geometryRef != null
      ? { __geo: this.rhinoGeometryType(geometryRef.geometryType), preview: raw?.preview, renderParts: raw?.renderParts }
      : raw
    console.log('[DisplayPipeline] setGraphGeometry id=' + id + ', geometryId=' + (geometryRef?.geometryId || 'legacy') + ', displayInfo.type=' + displayInfo?.type)
    let existing = this.#previewObjects.get(id)

    // Try synchronous build first (RhinoGeometryConverter may already be loaded)
    let obj = raw?.sceneGeometry ? restoreGeometryPreview(raw.sceneGeometry, displayInfo?.previewRole, displayInfo) : null
    try {
      if (typeof RhinoGeometryConverter !== 'undefined' && RhinoGeometryConverter.build && (!obj || raw?.preview || raw?.renderParts?.length)) {
        const converted = RhinoGeometryConverter.build(converterPayload, displayInfo || {})
        if (obj && converted) obj.add(...converted.children.slice())
        else obj = obj || converted
        console.log('[DisplayPipeline] RhinoGeometryConverter.build returned:', obj ? 'Group with ' + obj.children.length + ' children' : 'null')
      } else if (!obj) {
        console.warn('[DisplayPipeline] RhinoGeometryConverter not loaded yet')
      }
    } catch (e) {
      console.warn('[DisplayPipeline] Geometry conversion failed:', e)
    }

    // Fallback: simple representation
    if (!obj) {
      obj = this.createFallbackGeometry(converterPayload, displayInfo)
      console.log('[DisplayPipeline] using fallback geometry:', obj ? 'OK' : 'null')
    }

    if (!obj && existing != null) {
      this.#services.setDirtyFlag()
      return existing
    }

    if (obj) {
      if (raw?.__geo) obj.traverse(child => { child.userData.originalType = raw.__geo.replace(/^(?:panda|rhino)\./, '') })
      if (raw?.pickValues?.length) obj.userData.parameterPickValues = raw.pickValues
      if (raw?.pickAmbiguous) obj.userData.parameterPickAmbiguous = true
      if (raw?.__geo && raw.data != null) {
        obj.userData.parameterPickValue = raw
      }
      if (existing != null) {
        this.disposeGraphObject(existing)
        this.#previewScene.remove(existing)
      }
      if (geometryRef != null) this.applyGeometryReference(obj, geometryRef)
      this.applyGraphPreviewMetadata(obj, id, displayInfo)
      this.#previewObjects.set(id, obj)
      this.#previewScene.add(obj)
      obj.renderOrder = 100

      console.log('[DisplayPipeline] added to preview scene, total objects: ' + this.#previewObjects.size)
      this.#services.applyDisplaySettings(this.#services.getShadingSettings(), this.#services.getRenderSettings(), this.#services.isRenderEnabled())
    }

    this.#services.setDirtyFlag()

    let hasPlaceholder = false
    obj?.traverse(child => { if (child.userData.isPlaceholder) hasPlaceholder = true })
    if (geometryRef == null && hasPlaceholder) this.tryAsyncGeometryConversion(id, raw, displayInfo, obj)

    return obj
  }

  applyGraphPreviewMetadata (object, id, displayInfo = {}) {
    if (object == null) return
    object.userData.nodePreview = true
    const opacity = displayInfo.opacity ?? displayInfo.previewOpacity
    if (opacity != null && Number.isFinite(Number(opacity))) {
      object.userData.previewOpacity = THREE.MathUtils.clamp(Number(opacity), 0, 1)
      object.traverse(child => {
        const variants = child.userData.displayMaterials
        const materials = new Set([child.material, variants?.shading, variants?.render].flat().filter(Boolean))
        materials.forEach(material => {
          material.opacity = object.userData.previewOpacity
          material.transparent = material.opacity < 1
          material.depthWrite = !material.transparent && !child.isPoints
          if (child.isPoints) material.alphaTest = Math.max(0.000001, material.opacity * 0.5)
          material.needsUpdate = true
        })
      })
    }
    const previewVisibility = {
      visible: displayInfo.previewVisibility?.visible !== false,
      meshVisible: displayInfo.previewVisibility?.meshVisible !== false,
      wireVisible: displayInfo.previewVisibility?.wireVisible !== false
    }
    object.userData.graphId = String(id)
    object.userData.nodeId = displayInfo.nodeId == null ? null : String(displayInfo.nodeId)
    object.userData.portIndex = Number.isInteger(displayInfo.portIndex) ? displayInfo.portIndex : Number(displayInfo.portIndex)
    object.userData.portName = displayInfo.portName || ''
    object.userData.previewCollectionRole = displayInfo.previewRole || null
    object.userData.previewVisibility = previewVisibility
    object.traverse(child => {
      child.userData.graphId = String(id)
      if (child.isMesh) {
        child.userData.nodePreview = true
        child.onBeforeRender = renderPreviewSurfaceDepth
      }
      child.userData.nodeId = object.userData.nodeId
      child.userData.portIndex = object.userData.portIndex
      child.userData.portName = object.userData.portName
      const role = child.isMesh ? 'mesh' : ((child.isLine || child.isLineSegments || child.isPoints) ? 'wire' : null)
      if (role == null) return
      child.userData.pandauiPreviewRole = role
      if (child.userData.pandauiPreviewBaseVisible == null) child.userData.pandauiPreviewBaseVisible = child.visible !== false
      child.visible = child.userData.pandauiPreviewBaseVisible && (role === 'mesh' ? previewVisibility.meshVisible : previewVisibility.wireVisible)
    })
    const rootRole = object.userData.pandauiPreviewRole
    object.visible = rootRole == null
      ? previewVisibility.visible
      : object.userData.pandauiPreviewBaseVisible && previewVisibility.visible && (rootRole === 'mesh' ? previewVisibility.meshVisible : previewVisibility.wireVisible)
    object.visible = object.visible && this.#nodeState.visibility.get(String(object.userData.nodeId)) !== false
    object.userData.documentTreeBaseVisible = object.visible
    object.visible = object.visible && documentGeometryVisible(object.userData)
    this.applyGraphNodeHighlight(object)
  }

  setGraphNodePreviewVisibility (nodeId, visible) {
    this.#nodeState.visibility.set(String(nodeId), visible !== false)
    this.#services.clippingDisplay.setPreviewVisible(nodeId, visible)
    this.#previewObjects.forEach(object => {
      if (String(object.userData.nodeId) !== String(nodeId)) return
      this.applyGraphPreviewMetadata(object, object.userData.graphId, object.userData)
    })
    this.#services.setDirtyFlag()
  }

  setGraphNodeSelection (nodeIds) {
    this.#nodeState.selected = new Set((Array.isArray(nodeIds) ? nodeIds : []).map(String))
    this.#previewObjects.forEach(object => this.applyGraphNodeHighlight(object))
    this.#services.applyDisplaySettings(this.#services.getShadingSettings(), this.#services.getRenderSettings(), this.#services.isRenderEnabled())
  }

  applyGraphNodeHighlight (object) {
    const selected = this.#nodeState.selected.has(String(object.userData.nodeId))
    object.traverse(child => {
      if (child.material != null) {
        if (selected) {
          if (child.userData.graphPreviewBaseRenderOrder == null) child.userData.graphPreviewBaseRenderOrder = child.renderOrder
          child.renderOrder = Math.max(1100, child.userData.graphPreviewBaseRenderOrder)
        } else if (child.userData.graphPreviewBaseRenderOrder != null) {
          child.renderOrder = child.userData.graphPreviewBaseRenderOrder
          delete child.userData.graphPreviewBaseRenderOrder
        }
      }
      const displayMaterials = child.userData.displayMaterials
      const materials = new Set([child.material, displayMaterials?.shading, displayMaterials?.render].flat().filter(Boolean))
      materials.forEach(material => {
        if (material.color == null) return
        if (selected) {
          if (material.userData.graphPreviewBaseColor == null) material.userData.graphPreviewBaseColor = material.color.clone()
          material.color.setHex(0xffff00)
          if (child.isLine || child.isPoints) {
            if (material.userData.graphPreviewDepth == null) material.userData.graphPreviewDepth = [material.depthTest, material.depthWrite]
            material.depthTest = false
            material.depthWrite = false
          }
        } else if (material.userData.graphPreviewBaseColor != null) {
          material.color.copy(material.userData.graphPreviewBaseColor)
          delete material.userData.graphPreviewBaseColor
          if (material.userData.graphPreviewDepth != null) {
            [material.depthTest, material.depthWrite] = material.userData.graphPreviewDepth
            delete material.userData.graphPreviewDepth
          }
        }
      })
    })
  }

  setGraphPreviewVisibility (marker, role, visible, attributes = {}) {
    if (marker == null) return 0
    const nodeId = marker.nodeId == null ? null : String(marker.nodeId)
    const portIndex = Number(marker.portIndex)
    let changed = 0
    this.#previewObjects.forEach(object => {
      if (object == null) return
      if (nodeId != null && String(object.userData.nodeId) !== nodeId) return
      if (Number.isFinite(portIndex) && Number(object.userData.portIndex) !== portIndex) return
      const settings = {
        visible: attributes.visible == null ? object.userData.previewVisibility?.visible !== false : attributes.visible !== false,
        meshVisible: attributes.meshVisible == null ? object.userData.previewVisibility?.meshVisible !== false : attributes.meshVisible !== false,
        wireVisible: attributes.wireVisible == null ? object.userData.previewVisibility?.wireVisible !== false : attributes.wireVisible !== false
      }
      if (role === 'mesh') settings.meshVisible = visible !== false
      if (role === 'wire') settings.wireVisible = visible !== false
      object.userData.previewVisibility = settings
      object.traverse(child => {
        const previewRole = child.userData.pandauiPreviewRole || (child.isMesh ? 'mesh' : ((child.isLine || child.isLineSegments || child.isPoints) ? 'wire' : null))
        if (previewRole == null) return
        if (child.userData.pandauiPreviewBaseVisible == null) child.userData.pandauiPreviewBaseVisible = child.visible !== false
        child.visible = child.userData.pandauiPreviewBaseVisible && (previewRole === 'mesh' ? settings.meshVisible : settings.wireVisible)
      })
      const rootRole = object.userData.pandauiPreviewRole
      object.visible = rootRole == null
        ? settings.visible
        : object.userData.pandauiPreviewBaseVisible && settings.visible && (rootRole === 'mesh' ? settings.meshVisible : settings.wireVisible)
      object.visible = object.visible && this.#nodeState.visibility.get(String(object.userData.nodeId)) !== false
      object.userData.documentTreeBaseVisible = object.visible
      object.visible = object.visible && documentGeometryVisible(object.userData)
      changed++
    })
    if (changed > 0) this.#services.setDirtyFlag()
    return changed
  }

  clearGraphPreview (marker, role) {
    if (marker == null) return 0
    const nodeId = marker.nodeId == null ? null : String(marker.nodeId)
    const portIndex = Number(marker.portIndex)
    const removals = []
    this.#previewObjects.forEach((object, id) => {
      if (object == null) return
      if (nodeId != null && String(object.userData.nodeId) !== nodeId) return
      if (Number.isFinite(portIndex) && Number(object.userData.portIndex) !== portIndex) return
      if (role != null && (object.userData.previewCollectionRole || object.userData.pandauiPreviewRole) !== role) return
      removals.push([id, object])
    })
    removals.forEach(([id, object]) => {
      this.disposeGraphObject(object)
      this.#previewScene.remove(object)
      this.#previewObjects.delete(id)
    })
    if (removals.length > 0) this.#services.setDirtyFlag()
    return removals.length
  }

  bakePreview (marker) {
    if (marker?.direction !== 'output' || marker.nodeId == null) return 0
    const nodeId = String(marker.nodeId)
    const portIndex = Number(marker.portIndex)
    if (!Number.isInteger(portIndex)) return 0
    const matches = []
    this.#previewObjects.forEach((object, id) => {
      if (String(object.userData?.nodeId) !== nodeId || Number(object.userData?.portIndex) !== portIndex) return
      matches.push([id, object])
    })
    if (!matches.length) return 0

    const materialCopies = new Map()
    const copyMaterial = (material, isLine) => {
      if (material == null || typeof material.clone !== 'function') return material
      if (!materialCopies.has(material)) {
        const copy = material.clone()
        if (material.userData.graphPreviewBaseColor != null) copy.color?.copy(material.userData.graphPreviewBaseColor)
        delete copy.userData.graphPreviewBaseColor
        delete copy.userData.graphPreviewDepth
        copy.opacity = 1
        copy.transparent = false
        copy.depthTest = true
        copy.depthWrite = !isLine
        if (!isLine) {
          copy.polygonOffset = true
          copy.polygonOffsetFactor = 1
          copy.polygonOffsetUnits = 1
        }
        copy.needsUpdate = true
        materialCopies.set(material, copy)
      }
      return materialCopies.get(material)
    }
    const previewFields = ['nodePreview', 'nonselectable', 'graphId', 'nodeId', 'portIndex', 'portName', 'previewCollectionRole', 'previewVisibility', 'previewOpacity', 'documentTreeBaseVisible', 'pandauiPreviewRole', 'pandauiPreviewBaseVisible', 'graphPreviewBaseRenderOrder', 'documentId', 'geometryId', 'previewId', 'poolGeneration', 'pandauiObjectId', 'revision']
    const promote = object => {
      previewFields.forEach(key => { delete object.userData[key] })
      object.renderOrder = object.isLine ? 20 : 0
      if (object.onBeforeRender === renderPreviewSurfaceDepth) delete object.onBeforeRender
      if (object.isLine) object.userData.edgeLines = true
      if (object.isMesh || object.isLine || object.isLineSegments || object.isPoints) {
        if (Array.isArray(object.material)) object.material = object.material.map(material => copyMaterial(material, !object.isMesh))
        else object.material = copyMaterial(object.material, !object.isMesh)
        if (object.userData.displayMaterials) {
          object.userData.displayMaterials = Object.fromEntries(Object.entries(object.userData.displayMaterials).map(([mode, material]) => [mode, Array.isArray(material) ? material.map(value => copyMaterial(value, !object.isMesh)) : copyMaterial(material, !object.isMesh)]))
        }
        delete object.raycast
        object.visible = true
      }
      object.children.forEach(promote)
    }
    matches.forEach(([id, root]) => {
      this.#previewObjects.delete(id)
      promote(root)
      root.name = marker.portName || 'Output'
      root.userData.pandauiObjectId = THREE.MathUtils.generateUUID()
      root.visible = true
      this.#documentObjects.add(root)
    })
    const retainedMaterials = new Set()
    this.#previewScene.traverse(object => {
      ;[object.material, ...Object.values(object.userData?.displayMaterials || {})].flat().filter(Boolean).forEach(material => retainedMaterials.add(material))
    })
    materialCopies.forEach((copy, material) => { if (!retainedMaterials.has(material)) material.dispose() })
    this.#services.applyDisplaySettings(this.#services.getShadingSettings(), this.#services.getRenderSettings(), this.#services.isRenderEnabled())
    this.#services.setDirtyFlag()
    return matches.length
  }

  rhinoGeometryType (geometryType) {
    const value = String(geometryType || 'geometry').replace(/^GH_/, '').toLowerCase().replace(/^(?:panda|rhino)\./, '')
    const aliases = { nurbscurve: 'curve', polycurve: 'curve', linecurve: 'curve', point3d: 'point' }
    return `panda.${aliases[value] || value}`
  }

  applyGeometryReference (object, geometryRef) {
    object.userData.documentId = geometryRef.documentId
    object.userData.geometryId = geometryRef.geometryId
    object.userData.previewId = geometryRef.previewId || null
    object.userData.geometryType = geometryRef.geometryType
    object.userData.originalName = geometryRef.name || 'unnamed'
    object.userData.originalType = String(geometryRef.originalType || geometryRef.geometryType || 'geometry').toLowerCase()
    object.userData.revision = geometryRef.revision
    object.userData.poolGeneration = geometryRef.poolGeneration
    object.userData.selectionRole = 'whole'
    object.userData.pandauiObjectId = geometryRef.geometryId
    object.traverse(child => {
      child.userData.documentId = geometryRef.documentId
      child.userData.geometryId = geometryRef.geometryId
      child.userData.previewId = geometryRef.previewId || null
      child.userData.geometryType = geometryRef.geometryType
      child.userData.originalName = geometryRef.name || 'unnamed'
      child.userData.originalType = String(geometryRef.originalType || geometryRef.geometryType || 'geometry').toLowerCase()
      child.userData.revision = geometryRef.revision
      child.userData.selectionRole = child.userData.selectionRole || (child.isLine || child.isLineSegments ? 'edge' : 'surface')
    })
  }

  async tryAsyncGeometryConversion (id, raw, displayInfo, expectedObject) {
    // 延迟重试（等待 Rhino3d.js WASM 初始化完成后替换为完整模型）
    await new Promise(resolve => setTimeout(resolve, 500))
    if (this.#previewObjects.get(id) !== expectedObject) return
    try {
      const obj = RhinoGeometryConverter.build(raw, displayInfo || {})
      if (obj) {
        const existing = this.#previewObjects.get(id)
        if (existing) {
          this.disposeGraphObject(existing)
          this.#previewScene.remove(existing)
        }
        this.#previewObjects.set(id, obj)
        this.#previewScene.add(obj)
        this.applyGraphPreviewMetadata(obj, id, displayInfo)
        obj.renderOrder = 100
        this.#services.setDirtyFlag()
      }
    } catch (e) { /* keep fallback representation */ }
  }

  disposeGraphObject (obj) {
    if (obj == null) return
    obj.traverse(child => {
      if (child.releaseGeometryResource) child.releaseGeometryResource()
      else if (child.geometry != null) child.geometry.dispose()
      const materials = new Set([child.material, ...Object.values(child.userData?.displayMaterials || {})].flat().filter(Boolean))
      materials.forEach(material => material.dispose())
    })
  }

  createFallbackGeometry () {
    // Placeholder for simple synchronous fallback geometry creation.
    // Subclasses or future implementations can build basic Three.js
    // objects (e.g. points, simple meshes) without RhinoGeometryConverter.
    return null
  }

  updateGraphKukaDisplay () {
    // Intentionally empty: KUKA visualization was removed; maintain
    // compatibility with legacy call sites.
  }

  getTransformTarget (object) {
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (ancestor.userData?.sharedObject) return ancestor
    if (object?.userData?.selectionRole === 'brepFace' || object?.userData?.selectionRole === 'brepEdge') return object
    const editGroup = this.#services.getCurrentGroupEditContext()
    if (editGroup != null && this.#services.isDescendantOf(object, editGroup)) {
      return this.#services.directChildUnder(editGroup, object) || object
    }
    // Display parts keep their own model IDs for remeshing, but ordinary
    // selection and editing belong to the outermost placed block instance.
    let instance = null
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) {
      if (ancestor.userData?.importedBlockInstance) instance = ancestor
    }
    if (instance) return instance
    for (let ancestor = object; ancestor; ancestor = ancestor.parent) if (ancestor.userData?.importedModelObject) return ancestor
    let target = object
    if (object?.userData?.geometryId != null) {
      let current = object.parent
      while (current != null) {
        if (current.userData?.geometryId === object.userData.geometryId) target = current
        current = current.parent
      }
    }
    this.#previewObjects.forEach(root => {
      if (root === object || root.getObjectByProperty('uuid', object.uuid) != null) target = root
    })
    this.#documentObjects.forEach(root => {
      if (root === object || root.getObjectByProperty('uuid', object.uuid) != null) target = root
    })
    return target
  }

  createSceneObjectMarker (object) {
    if (object == null) return null
    let sharedRoot = object
    while (sharedRoot && !sharedRoot.userData?.sharedObject && !sharedRoot.userData?.sharedDocument) sharedRoot = sharedRoot.parent
    const shared = sharedRoot?.userData.sharedObject || sharedRoot?.userData.sharedDocument
    let source = shared ? 'shared' : 'model'
    let id = shared?.objectId || object.uuid
    this.#previewObjects.forEach((root, graphId) => {
      if (root === object) {
        source = 'graph'
        id = String(graphId)
      }
    })
    if (source === 'model' && Number.isInteger(object.userData?.sourceObject)) {
      source = 'model-source'
      id = String(object.userData.sourceObject)
    } else if (source === 'model' && typeof object.userData?.pandauiObjectId === 'string') {
      source = 'model-object'
      id = object.userData.pandauiObjectId
    }
    // Shared display children carry face/edge metadata, while the root holds
    // the source document reference. Never substitute the active local document.
    const documentId = shared ? shared.nativeDocumentId || null : object.userData?.documentId || (source === 'graph' ? null : this.#services.getActiveModel()?.documentId) || null
    const geometryId = shared ? shared.geometryId || null : object.userData?.geometryId || null
    const geometryType = object.userData?.definitionObjectType || object.userData?.geometryType || object.userData?.originalType || sharedRoot?.userData?.geometryType || sharedRoot?.userData?.originalType || null
    const poolGeneration = shared ? shared.poolGeneration : object.userData?.poolGeneration
    const marker = {

      __pandauiSceneObject: true,
      documentId,
      id,
      source,
      name: object.name || object.userData?.pandauiObjectId || object.type || 'Object',
      objectType: object.type || 'Object',
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [
        THREE.MathUtils.radToDeg(object.rotation.x),
        THREE.MathUtils.radToDeg(object.rotation.y),
        THREE.MathUtils.radToDeg(object.rotation.z)
      ],
      scale: [object.scale.x, object.scale.y, object.scale.z]
    }
    const target = this.getTransformTarget(object)
    const targetId = target?.userData?.pandauiObjectId || target?.userData?.geometryId
    const localId = target?.userData?.localDocumentId || target?.userData?.documentId || documentId
    if (shared) marker.sceneObject = { documentId: shared.publicDocumentId, objectId: shared.objectId, name: sharedRoot.name }
    else if (targetId && localId) marker.sceneObject = { documentId: localId, objectId: targetId, name: target.name }
    if (documentId != null && geometryId != null) {
      marker.documentId = documentId
      marker.geometryId = geometryId
      marker.geometryType = geometryType
      marker.revision = shared?.geometryRevision ?? object.userData?.revision
      marker.poolGeneration = poolGeneration
      marker.selectionRole = object.userData?.selectionRole || 'whole'
      marker.definitionObjectId = object.userData.definitionObjectId
      marker.instancePathKey = object.userData.instancePathKey
      if (Number.isInteger(object.userData?.faceIndex)) {
        marker.faceIndex = object.userData.faceIndex
        marker.subobject = { type: 'brepFace', index: object.userData.faceIndex }
      }
      if (Number.isInteger(object.userData?.edgeIndex)) {
        marker.edgeIndex = object.userData.edgeIndex
        marker.subobject = { type: 'brepEdge', index: object.userData.edgeIndex }
      }
      marker.geometryRef = {
        kind: 'geometryRef',
        documentId,
        geometryId,
        geometryType,
        revision: shared?.geometryRevision ?? object.userData?.revision,
        geometrySpace: shared?.geometryArchiveId ? 'world' : undefined,
        poolGeneration
      }
      if (marker.subobject != null) marker.geometryRef.subobject = marker.subobject
    }
    return marker
  }

  resolveSceneObjects (marker) {
    if (marker == null || marker.__pandauiSceneObject !== true) return []
    if (marker.source === 'shared') {
      const matches = new Set()
      const inspect = root => root?.traverse(object => { if ((object.userData?.sharedObject || object.userData?.sharedDocument)?.objectId === marker.id) matches.add(object) })
      inspect(this.#previewScene)
      const documents = this.#services.getModelDocuments?.() || [this.#services.getActiveModel()]
      documents.forEach(document => inspect(document?.three?.middleground))
      return [...matches]
    }
    if (marker.documentId != null && marker.geometryId != null) {
      const matches = []
      const collect = root => root?.traverse(object => {
        if (object.userData?.documentId === marker.documentId && object.userData?.geometryId === marker.geometryId) matches.push(object)
      })
      collect(this.#services.getActiveModel()?.three?.middleground)
      collect(this.#previewScene)
      if (marker.subobject) {
        const key = marker.subobject.type === 'brepFace' ? 'faceIndex' : 'edgeIndex'
        const object = matches.find(object => object.userData?.[key] === marker.subobject.index && (!marker.definitionObjectId || object.userData.definitionObjectId === marker.definitionObjectId) && (!marker.instancePathKey || object.userData.instancePathKey === marker.instancePathKey))
        return object == null ? [] : [object]
      }
      const whole = matches.find(object => object.userData?.selectionRole === 'whole')
      return whole == null ? matches.slice(0, 1) : [whole]
    }
    if (marker.source === 'graph') {
      let graphObject = null
      this.#previewObjects.forEach((object, id) => {
        if (String(id) === String(marker.id)) graphObject = object
      })
      return graphObject == null ? [] : [graphObject]
    }
    if (marker.source === 'model' || marker.source === 'model-object') {
      const object = [...this.#documentObjects].find(root => root.uuid === marker.id || root.userData?.pandauiObjectId === marker.id)
      if (object) return [object]
    }
    const activeModel = this.#services.getActiveModel()
    if (activeModel == null) return []
    if (marker.documentId && marker.documentId !== activeModel.documentId) return []
    const objects = []
    activeModel.three.middleground.traverse(object => {
      if (marker.source === 'model-source' && String(object.userData?.sourceObject) === String(marker.id)) objects.push(object)
      else if (marker.source === 'model-object' && object.userData?.pandauiObjectId === marker.id) objects.push(object)
      else if (marker.source === 'model' && object.uuid === marker.id) objects.push(object)
    })
    return objects
  }

  transformSceneObject (marker, operation, values, relative) {
    const objects = this.resolveSceneObjects(marker)
    if (objects.some(object => object.userData?.readOnly)) return null
    if (objects.length === 0) return null
    const vector = Array.isArray(values) ? values.slice(0, 3).map(Number) : []
    if (vector.length !== 3 || vector.some(value => !Number.isFinite(value))) return null
    const before = { objects: objects.map(object => ({ marker: this.createSceneObjectMarker(object), matrix: object.matrix.toArray() })) }

    objects.forEach(object => {
      if (operation === 'move') {
        if (relative === true) object.position.add(new THREE.Vector3(vector[0], vector[1], vector[2]))
        else object.position.set(vector[0], vector[1], vector[2])
      } else if (operation === 'rotate') {
        const rotation = vector.map(THREE.MathUtils.degToRad)
        if (relative === true) {
          object.rotation.x += rotation[0]
          object.rotation.y += rotation[1]
          object.rotation.z += rotation[2]
        } else {
          object.rotation.set(rotation[0], rotation[1], rotation[2])
        }
      } else if (operation === 'scale') {
        if (relative === true) {
          object.scale.multiply(new THREE.Vector3(vector[0], vector[1], vector[2]))
        } else {
          object.scale.set(vector[0], vector[1], vector[2])
        }
      } else {
        return
      }
      object.updateMatrix()
      object.updateMatrixWorld(true)
    })
    if (operation !== 'move' && operation !== 'rotate' && operation !== 'scale') return null
    const after = { objects: objects.map(object => ({ marker: this.createSceneObjectMarker(object), matrix: object.matrix.toArray() })) }
    this.#services.getOperations().recordState('scene.transform', before, after, 'Transform object')
    this.#services.setDirtyFlag()
    return this.createSceneObjectMarker(objects[0])
  }

  transformGraphDisplayBuffers (marker, translation, rotation, scale, relative) {
    if (marker?.__pandauiDisplayBufferMarker !== true || !Array.isArray(marker.ids)) return 0
    const move = Array.isArray(translation) ? translation.slice(0, 3).map(Number) : []
    const rotate = Array.isArray(rotation) ? rotation.slice(0, 3).map(Number) : []
    const resize = Array.isArray(scale) ? scale.slice(0, 3).map(Number) : []
    if ([move, rotate, resize].some(vector => vector.length !== 3 || vector.some(value => !Number.isFinite(value)))) return 0

    const objects = []
    const visited = new Set()
    marker.ids.forEach(id => {
      const object = this.#previewObjects.get(String(id)) || this.#previewObjects.get(id)
      if (object == null || visited.has(object)) return
      visited.add(object)
      objects.push(object)
    })
    if (objects.length === 0) return 0

    const translationVector = new THREE.Vector3(move[0], move[1], move[2])
    const rotationVector = rotate.map(THREE.MathUtils.degToRad)
    const scaleVector = new THREE.Vector3(resize[0], resize[1], resize[2])
    objects.forEach(object => {
      if (relative === true) {
        object.position.add(translationVector)
        object.rotation.x += rotationVector[0]
        object.rotation.y += rotationVector[1]
        object.rotation.z += rotationVector[2]
        object.scale.multiply(scaleVector)
      } else {
        object.position.set(move[0], move[1], move[2])
        object.rotation.set(rotationVector[0], rotationVector[1], rotationVector[2])
        object.scale.set(resize[0], resize[1], resize[2])
      }
      object.updateMatrix()
      object.updateMatrixWorld(true)
    })
    this.#services.setDirtyFlag()
    return objects.length
  }

  transformGraphDisplayBufferMatrix (marker, transform, relative) {
    if (marker?.__pandauiDisplayBufferMarker !== true || !Array.isArray(marker.ids)) return 0
    const values = Array.isArray(transform?.elements) ? transform.elements.slice(0, 16).map(Number) : []
    if (values.length !== 16 || values.some(value => !Number.isFinite(value))) return 0
    const transformMatrix = new THREE.Matrix4().set(...values)
    const objects = []
    const visited = new Set()
    marker.ids.forEach(id => {
      const object = this.#previewObjects.get(String(id)) || this.#previewObjects.get(id)
      if (object == null || visited.has(object)) return
      visited.add(object)
      objects.push(object)
    })
    if (objects.length === 0) return 0

    objects.forEach(object => {
      if (!Array.isArray(object.userData.pandauiDisplayBufferBaseMatrix)) {
        object.updateMatrix()
        object.userData.pandauiDisplayBufferBaseMatrix = object.matrix.toArray()
      }
      const baseMatrix = new THREE.Matrix4().fromArray(object.userData.pandauiDisplayBufferBaseMatrix)
      const targetMatrix = relative === true
        ? new THREE.Matrix4().multiplyMatrices(transformMatrix, object.matrix)
        : new THREE.Matrix4().multiplyMatrices(transformMatrix, baseMatrix)
      object.matrixAutoUpdate = false
      object.matrix.copy(targetMatrix)
      object.matrix.decompose(object.position, object.quaternion, object.scale)
      object.updateMatrixWorld(true)
    })
    this.#services.setDirtyFlag()
    return objects.length
  }

  createModelTransformMatrix (marker, operation, values, relative) {
    const vector = Array.isArray(values) ? values.slice(0, 3).map(Number) : []
    if (vector.length !== 3 || vector.some(value => !Number.isFinite(value))) return null
    const position = new THREE.Vector3(...(marker.position || [0, 0, 0]).map(Number))
    const rotation = new THREE.Euler(...(marker.rotation || [0, 0, 0]).map(value => THREE.MathUtils.degToRad(Number(value))))
    const scale = new THREE.Vector3(...(marker.scale || [1, 1, 1]).map(Number))
    const nextPosition = position.clone()
    const nextRotation = rotation.clone()

    const nextScale = scale.clone()
    if (operation === 'move') {
      if (relative === true) nextPosition.add(new THREE.Vector3(...vector))
      else nextPosition.set(...vector)
    } else if (operation === 'rotate') {
      const radians = vector.map(THREE.MathUtils.degToRad)
      if (relative === true) {
        nextRotation.x += radians[0]
        nextRotation.y += radians[1]
        nextRotation.z += radians[2]
      } else nextRotation.set(...radians)
    } else if (operation === 'scale') {
      if (relative === true) nextScale.multiply(new THREE.Vector3(...vector))
      else nextScale.set(...vector)
    } else return null
    if ([nextScale.x, nextScale.y, nextScale.z].some(value => Math.abs(value) < 1e-12)) return null

    const current = new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(rotation), scale)
    const next = new THREE.Matrix4().compose(nextPosition, new THREE.Quaternion().setFromEuler(nextRotation), nextScale)
    const inverse = new THREE.Matrix4().getInverse(current)
    const delta = new THREE.Matrix4().multiplyMatrices(next, inverse)
    const elements = delta.elements
    return [
      elements[0], elements[4], elements[8], elements[12],
      elements[1], elements[5], elements[9], elements[13],
      elements[2], elements[6], elements[10], elements[14],
      elements[3], elements[7], elements[11], elements[15]
    ]
  }

  replaceSceneGeometry (marker, geometryRef, preview, renderParts) {
    const targets = this.resolveSceneObjects(marker)
    targets.forEach(object => {
      object.parent?.remove(object)
      this.disposeGraphObject(object)
    })
    const activeModel = this.#services.getActiveModel()
    if (activeModel?.objectsByGeometryId != null && marker.geometryId != null) activeModel.objectsByGeometryId.delete(marker.geometryId)
    let replacementId = null
    this.#previewObjects.forEach((object, id) => {
      if (object.userData?.documentId === marker.documentId && object.userData?.geometryId === marker.geometryId) {
        replacementId = id
        this.#previewObjects.delete(id)
      }
    })
    const id = replacementId || `${geometryRef.documentId}:${geometryRef.geometryId}`
    const object = this.setGraphGeometry(id, { geometryRef, preview, renderParts }, { type: geometryRef.geometryType })
    if (object == null) return null
    const result = this.createSceneObjectMarker(object)
    return result
  }

  releaseGeometry (documentId, geometryId) {
    const targets = []
    this.#previewObjects.forEach((object, id) => {
      if (object.userData?.documentId === documentId && object.userData?.geometryId === geometryId) {
        targets.push(object)
        this.#previewObjects.delete(id)
      }
    })
    targets.forEach(object => {
      object.parent?.remove(object)
      this.disposeGraphObject(object)
    })
    if (targets.length > 0) this.#services.setDirtyFlag()
    return targets.length
  }

  applyObjectTransformState (state) {
    const states = state.objects || [state]
    const targets = states.map(item => ({ item, objects: this.resolveSceneObjects(item.marker) }))
    if (targets.some(({ item, objects }) => !objects.length || !Array.isArray(item.matrix) || item.matrix.length !== 16 || !item.matrix.every(Number.isFinite))) return false
    targets.forEach(({ item, objects }) => objects.forEach(object => {
      materializeBrepSelection(object)
      object.matrix.fromArray(item.matrix)
      object.matrix.decompose(object.position, object.quaternion, object.scale)
      object.updateMatrixWorld(true)
    }))
    this.#services.refreshSelectionHighlight()
    this.#services.setDirtyFlag()
    return true
  }

  captureTransformDisplay (marker, matrix) {
    const objects = this.resolveSceneObjects(marker)
    if (!objects.length) throw new Error('Transform target is no longer available.')
    const delta = new THREE.Matrix4().fromArray(matrix).transpose()
    const before = []; const after = []
    objects.forEach(object => {
      object.updateWorldMatrix(true, false)
      const reference = this.createSceneObjectMarker(object)
      before.push({ marker: reference, matrix: object.matrix.toArray() })
      const parentInverse = new THREE.Matrix4().getInverse(object.parent?.matrixWorld || new THREE.Matrix4())
      after.push({ marker: reference, matrix: parentInverse.multiply(delta).multiply(object.matrixWorld).toArray() })
    })
    return { before: { objects: before }, after: { objects: after } }
  }

  updateObjectGeometryReference (marker, reference) {
    if (reference) this.resolveSceneObjects(marker).forEach(object => this.applyGeometryReference(object, reference))
  }
  get scene () { return this.#previewScene }
  get entries () { return this.#previewObjects.entries() }
  get size () { return this.#previewObjects.size }
  isNodeVisible (id) { return this.#nodeState.visibility.get(String(id)) !== false }
  dispose () {
    this.#previewObjects.forEach(object => { object.parent?.remove(object); this.disposeGraphObject(object) })
    this.#previewObjects.clear()
    this.#documentObjects.forEach(object => { object.parent?.remove(object); this.disposeGraphObject(object) })
    this.#documentObjects.clear()
    this.#nodeState.visibility.clear()
    this.#nodeState.selected.clear()
  }
}
