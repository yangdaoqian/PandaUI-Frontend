import { documentGeometryVisible, documentItemVisible, setDocumentItemVisible, applySharedDocumentVisibility } from '../GeometryDocumentViewState'
import { materializeBrepSelection } from '../BrepDisplayRanges'

export default class SceneVisibility {
  #services
  #hiddenObjects = new Set()

  constructor (services) {
    this.#services = services
  }

  setDocumentTreeVisibility (reference, visible, record = true) {
    const objects = this.#services.documentTreeObjects(reference)
    const before = documentItemVisible(reference)
    setDocumentItemVisible(reference, visible)
    objects.forEach(object => {
      if (reference.geometryId && visible && !object.userData.nodePreview) object.userData.pandauiHidden = false
      const objectVisible = object.userData.nodePreview ? object.userData.documentTreeBaseVisible !== false : object.userData.pandauiHidden !== true
      if (object.userData.sharedObject || object.userData.sharedDocument) applySharedDocumentVisibility(object)
      else object.visible = objectVisible && documentGeometryVisible({ ...object.userData, layerPath: object.fullLayerPath || object.userData.layerPath })
      if (object.visible) this.#hiddenObjects.delete(object)
    })
    const selected = this.#services.getSelectedObjectRoot()
    const selectedVisible = selected?.visible !== false
    if (selected && !selectedVisible) this.#services.setSelectedObject(null)
    this.#services.setDirtyFlag(false)
    this.#services.getModelDocuments().forEach(document => document.rebuildRenderBatches?.())
    window.dispatchEvent(new CustomEvent('pandaui-document-view-changed'))
    if (record && before !== visible) this.#services.getOperations().recordState('scene.document_visibility', { reference, visible: before }, { reference, visible }, visible ? 'Show document object' : 'Hide document object')
  }

  contextObjectName (object) {
    return object?.userData?.originalName || object?.name || object?.userData?.originalType || object?.userData?.geometryType || 'unnamed'
  }

  getHiddenObjects () {
    const hidden = new Set()
    const visited = new Set()
    const inspect = object => {
      if (!object || visited.has(object)) return
      visited.add(object)
      const data = object.userData
      if (data.nodePreview || data.nonselectable || data.kukaPreview || data.kukaNonSelectable) return
      if (data.pandauiHidden === true ||
          (data.selectionRole === 'whole' && data.documentId && data.geometryId && !documentItemVisible(data))) hidden.add(object)
      object.children.forEach(inspect)
    }
    this.#services.getModelDocuments().forEach(document => {
      inspect(document.three?.middleground)
      inspect(document.three?.foreground)
    })
    inspect(this.#services.getPreviewScene())
    this.#hiddenObjects = hidden
    return Array.from(hidden)
  }

  showContextMenu (clientX, clientY) {
    const hidden = this.getHiddenObjects()
    const selected = this.#services.getSelectedObjectRoot()
    const disabled = !selected || this.#hiddenObjects.has(selected)
    const items = [
      { type: 'zoom-selected', label: 'Zoom Selected', disabled },
      { type: 'hide-selected', label: 'Hide Selected Object', disabled: disabled || selected?.userData?.readOnly === true },
      { type: 'control-points-on', label: 'Control Points On · F10', disabled: disabled || !this.#services.controlPoints?.canStart(selected) },
      { type: 'control-points-off', label: 'Control Points Off · F11', disabled: !this.#services.controlPoints?.active || this.#services.controlPoints?.busy },
      { separator: true }, { heading: 'Show Hidden Object' }
    ]
    if (!hidden.length) items.push({ label: 'No hidden objects', disabled: true })
    else {
      hidden.slice(0, 12).forEach(object => items.push({ type: 'show-object', label: this.contextObjectName(object), marker: this.#services.createSceneObjectMarker(object) }))
      items.push({ type: 'show-all', label: 'Show All Hidden Objects (' + hidden.length + ')' })
    }
    this.#services.ui.showMenu(items, clientX, clientY)
  }

  hideSelectedObject () {
    if (this.#services.getSelectedObject() == null) return
    const root = this.#services.getTransformTarget(this.#services.getSelectedObject())
    if (root?.userData?.readOnly) return
    if (root.userData.selectionRole === 'brepFace' || root.userData.selectionRole === 'brepEdge') {
      materializeBrepSelection(root)
      const apply = visible => { root.visible = visible; root.userData.pandauiHidden = !visible; this.#services.setDirtyFlag() }
      apply(false)
      this.#services.getOperations().recordState('scene.visibility', { marker: this.#services.createSceneObjectMarker(root), visible: true }, { marker: this.#services.createSceneObjectMarker(root), visible: false }, 'Hide subobject')
      this.#services.setSelectedObject(null)
      return
    }
    if (root.userData.documentId && root.userData.geometryId) {
      this.#hiddenObjects.add(root)
      this.setDocumentTreeVisibility({ documentId: root.userData.documentId, geometryId: root.userData.geometryId, poolGeneration: root.userData.poolGeneration }, false)
      return
    }
    this.#services.getOperations().recordState('scene.visibility',
      { marker: this.#services.createSceneObjectMarker(root), visible: root.visible },
      { marker: this.#services.createSceneObjectMarker(root), visible: false }, 'Hide object')
    this.#services.setSelectedObject(null)
    this.#services.setDirtyFlag()
  }

  showHiddenObject (object) {
    if (object == null) return
    if (object.userData.selectionRole === 'brepFace' || object.userData.selectionRole === 'brepEdge') {
      const apply = visible => { object.visible = visible; object.userData.pandauiHidden = !visible; this.#services.setDirtyFlag() }
      apply(true)
      this.#services.getOperations().recordState('scene.visibility', { marker: this.#services.createSceneObjectMarker(object), visible: false }, { marker: this.#services.createSceneObjectMarker(object), visible: true }, 'Show subobject')
      this.#hiddenObjects.delete(object)
      return
    }
    if (object.userData.documentId && object.userData.geometryId) {
      object.userData.pandauiHidden = false
      this.setDocumentTreeVisibility({ documentId: object.userData.documentId, geometryId: object.userData.geometryId, poolGeneration: object.userData.poolGeneration }, true)
      return
    }
    this.#services.getOperations().recordState('scene.visibility',
      { marker: this.#services.createSceneObjectMarker(object), visible: object.visible },
      { marker: this.#services.createSceneObjectMarker(object), visible: true }, 'Show object')
    this.#services.setDirtyFlag()
  }

  showAllHiddenObjects () {
    this.getHiddenObjects().forEach(object => this.showHiddenObject(object))
  }

  applyObjectVisibilityState (state) {
    const objects = this.#services.resolveSceneObjects(state.marker)
    if (objects.some(object => object.userData?.readOnly)) return false
    if (!objects.length) return false
    objects.forEach(object => {
      materializeBrepSelection(object)
      object.visible = state.visible !== false
      object.userData.pandauiHidden = !object.visible
      if (object.visible) this.#hiddenObjects.delete(object)
      else this.#hiddenObjects.add(object)
    })
    this.#services.setDirtyFlag()
    return true
  }
  reset () { this.#hiddenObjects.clear() }
}
