<template>
  <div class="document-manager" @keydown.stop @contextmenu.prevent>
    <div class="document-manager__toolbar">
      <q-icon name="account_tree" size="18px" /><strong>Document tree</strong>
      <span class="document-manager__count">{{ documentCount }}</span>
      <q-btn v-if="isolationActive" flat round dense icon="filter_center_focus" aria-label="End isolation" @click="treeAction(null, 'end-isolation')"><q-tooltip>End isolation</q-tooltip></q-btn>
      <q-btn flat round dense icon="refresh" aria-label="Refresh documents" :loading="refreshing" @click="refresh(true)"><q-tooltip>Refresh</q-tooltip></q-btn>
      <q-btn flat round dense icon="unfold_less" aria-label="Collapse all" @click="expanded = new Set()"><q-tooltip>Collapse all</q-tooltip></q-btn>
      <q-btn flat round dense icon="center_focus_strong" aria-label="Zoom to selected item" :disable="!selected" @click="zoom(selected)"><q-tooltip>Zoom extents</q-tooltip></q-btn>
    </div>
    <q-input v-model="search" dense outlined clearable maxlength="128" placeholder="Search objects" aria-label="Search objects" class="document-manager__search">
      <template #prepend><q-icon name="search" size="18px" /></template>
    </q-input>
    <div v-if="error" class="document-manager__message is-error" role="alert">{{ error }}</div>
    <div v-else-if="notice" class="document-manager__message" role="status">{{ notice }}</div>
    <q-virtual-scroll class="document-manager__tree" :items="rows" :virtual-scroll-item-size="30" role="tree" aria-label="Geometry document pool">
      <template #default="{ item }">
        <div :key="item.key" class="document-manager__row" :class="{ 'is-selected': selected?.key === item.key, 'is-hidden': isHidden(item), 'is-drop-target': dropKey === item.key }"
          role="treeitem" :aria-level="item.depth + 1" :aria-selected="selected?.key === item.key"
          :aria-expanded="item.branch ? expanded.has(item.key) : undefined" :data-tree-key="item.key" :data-geometry-id="item.geometryId"
          :style="{ paddingLeft: (item.depth * 16 + 2) + 'px' }" tabindex="0"
          :draggable="item.writable && !state.busy && !isLocked(item)" @dragstart.stop="startDrag($event, item)" @dragover.stop="dragOver($event, item)" @drop.stop="drop($event, item)" @dragend="endDrag" @dragleave="dropKey = ''"
          @click="select(item)" @dblclick.stop="item.branch ? toggle(item) : zoom(item)" @keydown="navigate($event, item)">
          <q-menu v-if="canControl(item)" context-menu touch-position>
            <q-list dense style="min-width: 150px">
              <q-item clickable v-close-popup @click="treeAction(item, 'visibility')"><q-item-section avatar><q-icon :name="isHidden(item) ? 'visibility' : 'visibility_off'" /></q-item-section><q-item-section>{{ isHidden(item) ? 'Show' : 'Hide' }}</q-item-section></q-item>
              <q-item v-if="item.branch" clickable v-close-popup @click="treeAction(item, 'show-children')"><q-item-section avatar><q-icon name="visibility" /></q-item-section><q-item-section>Show all children</q-item-section></q-item>
              <q-item clickable v-close-popup @click="treeAction(item, 'isolate')"><q-item-section avatar><q-icon name="filter_center_focus" /></q-item-section><q-item-section>Isolate</q-item-section></q-item>
              <q-item clickable v-close-popup :disable="!isolationActive" @click="treeAction(item, 'end-isolation')"><q-item-section avatar><q-icon name="visibility" /></q-item-section><q-item-section>End isolation</q-item-section></q-item>
              <q-separator />
              <q-item clickable v-close-popup @click="treeAction(item, 'lock')"><q-item-section avatar><q-icon :name="isLocked(item) ? 'lock_open' : 'lock'" /></q-item-section><q-item-section>{{ isLocked(item) ? 'Unlock' : 'Lock' }}</q-item-section></q-item>
              <q-item v-if="item.branch" clickable v-close-popup @click="treeAction(item, 'unlock-children')"><q-item-section avatar><q-icon name="lock_open" /></q-item-section><q-item-section>Unlock all children</q-item-section></q-item>
              <q-item clickable v-close-popup @click="zoom(item)"><q-item-section avatar><q-icon name="center_focus_strong" /></q-item-section><q-item-section>Zoom extents</q-item-section></q-item>
              <template v-if="isDocumentRow(item)">
              <q-separator />
              <q-item v-if="item.localDocument" clickable v-close-popup :disable="state.localFolderBusy" @click="saveLocal(item)"><q-item-section avatar><q-icon name="save" /></q-item-section><q-item-section>Save locally</q-item-section></q-item>
              <q-item v-if="item.localDocument" clickable v-close-popup :disable="state.localFolderBusy" @click="saveLocal(item, true)"><q-item-section avatar><q-icon name="save_as" /></q-item-section><q-item-section>Save as...</q-item-section></q-item>
              <q-item v-if="item.writable && serverDocument(item)" clickable v-close-popup :disable="state.busy" @click="save(item)"><q-item-section avatar><q-icon name="cloud_upload" /></q-item-section><q-item-section>Save to server</q-item-section></q-item>
              <q-item v-if="item.writable && serverDocument(item)" clickable v-close-popup :disable="state.busy" @click="publish(item)"><q-item-section avatar><q-icon name="public" /></q-item-section><q-item-section>Public</q-item-section></q-item>
              <q-item v-if="item.localDocument" clickable v-close-popup :disable="state.localFolderBusy" @click="closeLocal(item)"><q-item-section avatar><q-icon name="close" /></q-item-section><q-item-section>Close local document</q-item-section></q-item>
              <q-item v-if="item.deletable && serverDocument(item)" clickable v-close-popup :disable="state.busy" @click="pendingDelete = item"><q-item-section avatar><q-icon name="delete_outline" /></q-item-section><q-item-section>Delete on server</q-item-section></q-item>
              </template>
            </q-list>
          </q-menu>
          <button class="document-manager__expand" :disabled="!item.branch" :aria-label="(expanded.has(item.key) ? 'Collapse ' : 'Expand ') + item.label" @click.stop="toggle(item)">
            <q-icon v-if="item.branch" :name="expanded.has(item.key) ? 'arrow_drop_down' : 'arrow_right'" size="20px" />
          </button>
          <button v-if="canControl(item)" class="document-manager__visibility" :aria-label="(isHidden(item) ? 'Show ' : 'Hide ') + item.label" @click.stop="toggleVisibility(item)">
            <q-icon :name="isHidden(item) ? 'visibility_off' : 'visibility'" size="16px" /><q-tooltip>{{ isHidden(item) ? 'Show' : 'Hide' }}</q-tooltip>
          </button>
          <span v-else class="document-manager__visibility-space" />
          <q-icon :name="item.icon" size="17px" class="document-manager__type" />
          <span class="document-manager__label" :title="item.label">{{ item.label }}</span>
          <q-icon v-if="isLocked(item)" name="lock" size="14px" aria-label="Locked"><q-tooltip>Locked by this item or a parent</q-tooltip></q-icon>
          <span v-if="ownerLabel(item)" class="document-manager__owner" :title="'Private owner: ' + ownerLabel(item)">Owner: {{ ownerLabel(item) }}</span>
          <span v-if="item.count != null" class="document-manager__count">{{ item.count }}</span>
          <q-spinner v-if="item.loading" size="14px" />
          <button v-if="item.more" class="document-manager__more" aria-label="Load more objects" :disabled="item.loading" @click.stop="load(item.document, true)">Load more</button>
        </div>
      </template>
    </q-virtual-scroll>
    <div v-if="selected" class="document-manager__details">
      <div class="document-manager__detail-title"><strong :title="selected.label">{{ selected.label }}</strong>
        <q-btn v-if="selected.nodeInstanceId" flat round dense size="sm" icon="my_location" aria-label="Locate source node" @click="locateNode(selected)"><q-tooltip>Locate source node</q-tooltip></q-btn>
        <q-btn v-if="selected.documentId" flat round dense size="sm" icon="content_copy" aria-label="Copy reference" @click="copyReference"><q-tooltip>Copy reference</q-tooltip></q-btn>
      </div>
      <div v-if="selected.geometryType">{{ selected.geometryType }} <span class="document-manager__muted">Revision {{ selected.revision }}</span></div>
      <div v-if="ownerLabel(selected)">Owner: <strong>{{ ownerLabel(selected) }}</strong></div>
      <div v-if="selected.ownerUsername && !selected.writable && selected.editable === false && selected.ownerUserId !== state.userId" class="document-manager__muted">Sign in as {{ selected.ownerUsername }} to edit this private geometry.</div>
      <div class="document-manager__identifier" :title="selected.geometryId || selected.documentId">{{ selected.geometryId || selected.documentId }}</div>
      <div v-if="selected.origin?.portName" class="document-manager__identifier">{{ selected.origin.portName }} {{ selected.origin.path }} [{{ selected.origin.itemIndex }}]</div>
      <div v-if="selected.sourcePath" class="document-manager__identifier" :title="selected.sourcePath">{{ selected.sourcePath }}</div>
    </div>
    <q-dialog :model-value="!!pendingDelete" persistent @update:model-value="value => { if (!value) pendingDelete = null }">
      <q-card style="width: 390px; max-width: 90vw">
        <q-card-section><strong>Delete {{ pendingDelete?.label }}?</strong><div class="q-mt-sm">{{ pendingDelete?.kind === 'public' ? 'All child documents and scene objects, including other workspaces’ documents, will be deleted.' : 'This document and its scene objects will be deleted from all connected workspaces.' }}</div></q-card-section>
        <q-card-actions align="right"><q-btn flat label="Cancel" :disable="state.busy" @click="pendingDelete = null" /><q-btn flat color="negative" label="Delete" :loading="state.busy" @click="removeDocument" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script>
import { computed, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { Box3 } from 'three'
import PandaUIApp from '../PandaUIApp'
import { documentGeometryVisible, sharedDocumentGeometryVisible, documentGeometryLocked, documentIsolationActive } from '../GeometryDocumentViewState'
import { documentHierarchy, documentMovePayload, visibleWorkspaceDocuments, sharedSceneDocument } from '../DocumentHierarchy'

export default {
  name: 'GeometryDocumentTree',
  props: { active: Boolean, workspace: { type: Object, required: true }, state: { type: Object, required: true } },
  setup (props) {
    const documents = shallowRef([])
    const pages = reactive({})
    const expanded = ref(new Set(['scene:public', 'scene:private']))
    const dropKey = ref('')
    let dragging = null
    const selected = shallowRef(null)
    const pendingDelete = shallowRef(null)
    const search = ref('')
    const error = ref('')
    const notice = ref('')
    const refreshing = ref(false)
    const viewRevision = ref(0)
    let generation = ''
    let timer = null
    let searchTimer = null
    let disposed = false
    let sequence = 0
    let pendingRefresh = false
    const controllers = new Set()
    const requests = new Map()
    const autoExpandedPublicKeys = new Set()
    const pipeline = () => PandaUIApp.getDisplayPipeline()
    const editor = () => document.getElementById('editorFrame')?.contentWindow
    const documentKey = document => 'document:' + document.documentId
    const geometryKey = item => item.documentId + ':' + (item.sharedObjectId || item.geometryId)
    const reference = item => ({ kind: item.sharedObjectId ? 'sceneObjectRef' : item.geometryId ? item.kind || 'geometryRef' : 'documentRef', objectId: item.sharedObjectId, documentId: item.documentId, geometryId: item.geometryId, layerPath: item.layerPath, poolGeneration: item.poolGeneration || item.document?.poolGeneration, revision: item.revision, geometryType: item.geometryType, visible: item.visible !== false, localDocument: !!(item.localDocument || item.document?.localDocument), localObjectId: item.localObjectId, ancestorReferences: item.ancestorReferences, nodeInstanceId: item.nodeInstanceId })
    const canControl = item => !!item.documentId && !item.message
    const isDocumentRow = item => !item.group && !item.geometryId && !item.sharedObjectId
    const isolationActive = computed(() => { void viewRevision.value; return documentIsolationActive() })
    function isLocked (item) {
      void viewRevision.value
      const shared = item.sharedObjectId ? props.workspace.objects.get(item.sharedObjectId) : null
      return documentGeometryLocked({ ...reference(item), ...shared, ...(shared ? { publicDocumentId: props.state.publicDocumentId } : {}) })
    }
    function treeAction (item, action) {
      error.value = ''; notice.value = ''
      try {
        if (action === 'visibility') toggleVisibility(item)
        else if (action === 'show-children') pipeline().showDocumentTreeChildren(reference(item))
        else if (action === 'isolate') pipeline().isolateDocumentTreeItem(reference(item))
        else if (action === 'end-isolation') pipeline().isolateDocumentTreeItem(null)
        else if (action === 'lock') {
          const locked = isLocked(item)
          pipeline().setDocumentTreeLocked(reference(item), !locked)
          if (locked && isLocked(item)) notice.value = 'A parent is locked. Unlock the parent first.'
        } else if (action === 'unlock-children') {
          pipeline().setDocumentTreeLocked(reference(item), false, true)
          if (isLocked(item)) notice.value = 'A parent is locked. Unlock the parent first.'
        }
      } catch (failure) { error.value = failure.message }
    }
    const serverDocument = item => props.state.connected && props.state.documents.some(doc => doc.documentId === item.workspaceDocumentId)
    async function saveLocal (item, saveAs = false) {
      error.value = ''; notice.value = 'Saving document...'
      try { await PandaUIApp.saveLocalDocumentFolder(item.localDocumentId || item.documentId, { saveAs, onProgress: state => { notice.value = `${state.phase} · ${state.completed || 0}${state.total ? ' / ' + state.total : ''}` } }); notice.value = item.label + ' saved locally.' } catch (failure) { notice.value = ''; if (failure.name !== 'AbortError') error.value = failure.message }
    }
    async function closeLocal (item) {
      try { await props.workspace.closeLocalPrivate(item.localDocumentId || item.documentId); selected.value = null } catch (failure) { error.value = failure.message }
    }
    async function request (url) {
      const controller = new AbortController()
      controllers.add(controller)
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to read geometry documents.')
        return result
      } finally { controllers.delete(controller) }
    }
    async function load (document, append = false) {
      if (disposed || !props.active) return
      if (document.localDocument) return
      const id = document.documentId
      if (!documents.value.some(entry => entry.documentId === id)) { pages[id] = { items: [], revision: 0 }; return }
      const token = ++sequence
      requests.set(id, token)
      const previous = pages[id]
      pages[id] = { ...previous, loading: true }
      const searchValue = search.value || ''
      const query = new URLSearchParams({ poolGeneration: generation, offset: String(append ? previous?.nextOffset || 0 : 0), limit: '200', search: searchValue })
      try {
        const result = await request('/api/documents/' + id + '/tree?' + query)
        if (disposed || requests.get(id) !== token || result.page.document.poolGeneration !== generation || (search.value || '') !== searchValue) return
        if (append && previous?.revision !== result.page.document.revision) return load(result.page.document)
        const page = result.page
        pages[id] = { items: [...(append ? previous.items : []), ...page.objects], revision: page.document.revision, search: searchValue, total: page.total, nextOffset: page.nextOffset, hasMore: page.hasMore, loading: false }
        if (selected.value?.documentId === id && selected.value.geometryId) {
          const refreshed = page.objects.find(item => item.geometryId === selected.value.geometryId)
          if (refreshed) selected.value = geometryRow(refreshed)
          else if (!append && previous?.revision !== page.document.revision) selected.value = null
        }
      } catch (failure) {
        if (failure.name !== 'AbortError' && !disposed && requests.get(id) === token) error.value = failure.message
      } finally {
        if (requests.get(id) === token && pages[id]) pages[id].loading = false
      }
    }
    async function refresh (force = false) {
      if (disposed || !props.active) return
      if (refreshing.value) { pendingRefresh = pendingRefresh || force; return }
      refreshing.value = true
      try {
        props.workspace.notify(true)
        if (props.state.localMode || !props.state.connected) { error.value = ''; return }
        const result = await request('/api/documents')
        if (disposed) return
        error.value = ''
        if (generation && generation !== result.poolGeneration) {
          Object.keys(pages).forEach(key => { delete pages[key] })
          selected.value = null
          notice.value = 'Backend restarted. References refreshed.'
        }
        generation = result.poolGeneration
        documents.value = result.documents
        await props.workspace.syncNativeDocuments()
        if (selected.value?.document && !selected.value.geometryId) {
          const refreshed = result.documents.find(document => document.documentId === selected.value.documentId)
          if (refreshed) selected.value = { ...selected.value, ...refreshed, document: refreshed, label: refreshed.name || 'Workspace' }
        }
        const live = new Set(result.documents.map(document => document.documentId))
        Object.keys(pages).forEach(id => { if (!live.has(id)) { requests.delete(id); delete pages[id] } })
        if (selected.value?.documentId && !selected.value.localDocument && !live.has(selected.value.documentId)) selected.value = null
        for (const document of result.documents) {
          if (expanded.value.has(documentKey(document)) && (force || pages[document.documentId]?.revision !== document.revision || pages[document.documentId]?.search !== (search.value || ''))) await load(document)
        }
      } catch (failure) {
        if (failure.name !== 'AbortError' && !disposed) error.value = failure.message
      } finally {
        refreshing.value = false
        if (pendingRefresh) { pendingRefresh = false; refresh(true) }
      }
    }
    function nodeTitle (id) { return editor()?.graph?.getNodeById(id)?.title || 'Node ' + id }
    function geometryRow (item) {
      return { ...item, key: geometryKey(item), depth: 2, label: item.name || ((item.geometryType || 'Object') + ' ' + (item.sourceObject || ((item.origin?.itemIndex || 0) + 1))), nodeInstanceId: item.origin?.nodeInstanceId, icon: iconFor(item.geometryType) }
    }
    function ownerLabel (item) {
      if (!item || item.kind === 'public' || item.publishedAt) return ''
      return item.ownerUsername || (item.ownerId ? 'Unknown account (' + item.ownerId.slice(0, 8) + ')' : '')
    }
    const documentCount = computed(() => visibleWorkspaceDocuments(props.state).length)
    const rows = computed(() => {
      const query = (search.value || '').toLowerCase()
      const workspace = query ? { ...props.state, localDocuments: (props.state.localDocuments || []).map(doc => ({ ...doc, localObjects: doc.localObjects.filter(item => (item.name + ' ' + item.layerPath).toLowerCase().includes(query)) })) } : props.state
      return documentHierarchy({ documents: documents.value, workspace, pages, expanded: expanded.value, geometryRow, nodeTitle })
    })
    function expandPublishedSharedBranches () {
      if (!props.state.publicDocumentId) return
      let changed = false
      const publicKey = 'public:' + props.state.publicDocumentId
      if (!autoExpandedPublicKeys.has(publicKey)) { autoExpandedPublicKeys.add(publicKey); expanded.value.add('scene:public'); changed = true }
      const branches = visibleWorkspaceDocuments(props.state).filter(document => document.publishedAt)
      const shared = sharedSceneDocument(props.state)
      if (shared) branches.push(shared)
      branches.forEach(document => {
        const documentKeyValue = document.treeKey || documentKey(document)
        if (!autoExpandedPublicKeys.has(documentKeyValue)) {
          autoExpandedPublicKeys.add(documentKeyValue)
          expanded.value.add(documentKeyValue)
          changed = true
        }
        const objects = document.sceneObjects || (props.state.sceneObjects || []).filter(object => object.privateDocumentId === document.documentId)
        const displayKey = documentKeyValue + ':display'
        if (objects.some(object => !object.layerPath) && !autoExpandedPublicKeys.has(displayKey)) { autoExpandedPublicKeys.add(displayKey); expanded.value.add(displayKey); changed = true }
        const paths = new Set(objects.filter(object => object.layerPath).map(object => object.layerPath))
        paths.forEach(path => {
          const parts = path.split('::')
          for (let index = 1; index <= parts.length; index++) {
            const layerPath = parts.slice(0, index).join('::')
            const layerKey = documentKeyValue + ':layer:' + layerPath
            if (!autoExpandedPublicKeys.has(layerKey)) {
              autoExpandedPublicKeys.add(layerKey)
              expanded.value.add(layerKey)
              changed = true
            }
          }
        })
      })
      if (changed) expanded.value = new Set(expanded.value)
    }
    async function save (item) {
      try {
        error.value = ''
        await props.workspace.saveDocument(item.workspaceDocumentId)
        notice.value = item.label + ' saved.'
      } catch (failure) { error.value = failure.message }
    }
    async function publish (item) {
      try {
        error.value = ''
        await props.workspace.publish(item.workspaceDocumentId)
        expanded.value.add('scene:public')
        notice.value = item.label + ' is now in the public document.'
      } catch (failure) { error.value = failure.message }
    }
    async function removeDocument () {
      const item = pendingDelete.value
      if (!item) return
      try {
        error.value = ''
        await props.workspace.deleteDocument(item.workspaceDocumentId)
        pendingDelete.value = null
        selected.value = null
        notice.value = item.label + ' deleted.'
        await refresh(true)
      } catch (failure) { error.value = failure.message; pendingDelete.value = null }
    }
    function startDrag (event, item) {
      if (!item.writable || isLocked(item) || item.localDocument || item.document?.localDocument || props.state.busy) { event.preventDefault(); return }
      dragging = item
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('application/x-pandaui-document-item', item.key)
    }
    function dragOver (event, item) {
      if (!documentMovePayload(dragging, item, generation) || isLocked(item) || (dragging && isLocked(dragging)) || props.state.busy) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      dropKey.value = item.key
    }
    function endDrag () { dragging = null; dropKey.value = '' }
    async function drop (event, item) {
      event.preventDefault()
      if (isLocked(item) || (dragging && isLocked(dragging))) { endDrag(); return }
      const payload = documentMovePayload(dragging, item, generation)
      endDrag()
      if (!payload) return
      try {
        error.value = ''
        await props.workspace.move(payload)
        expanded.value.add('document:' + item.workspaceDocumentId)
        await refresh(true)
        notice.value = 'Moved to ' + item.label + '.'
      } catch (failure) { error.value = failure.message }
    }
    function iconFor (type) {
      const name = String(type || '').toLowerCase()
      if (/brep|surface|extrusion/.test(name)) return 'view_in_ar'
      if (/mesh/.test(name)) return 'grid_on'
      if (/curve|line|arc|circle/.test(name)) return 'timeline'
      if (/point/.test(name)) return 'fiber_manual_record'
      if (/instance/.test(name)) return 'widgets'
      return 'data_object'
    }
    async function toggle (item) {
      if (!item.branch) return
      if (expanded.value.has(item.key)) expanded.value.delete(item.key)
      else {
        expanded.value.add(item.key)
        if (item.document && !item.group && (!pages[item.documentId] || pages[item.documentId].revision !== item.revision || pages[item.documentId].search !== (search.value || ''))) await load(item.document)
      }
    }
    function select (item) {
      if (item.message) return
      selected.value = item
      if (item.localDocument && !item.geometryId && !item.group) { props.workspace.selectLocalPrivate(item.localDocumentId || item.documentId) } else if (item.writable && !item.geometryId && !item.sharedObjectId && !item.group) props.workspace.selectPrivate(item.workspaceDocumentId)
      notice.value = ''
      if (isLocked(item)) notice.value = 'This item or a parent is locked.'
      else if ((item.geometryId || item.sharedObjectId) && !isHidden(item) && !pipeline().selectDocumentTreeItem(reference(item))) notice.value = 'Object is in the pool; no selectable scene geometry is loaded.'
    }
    function zoom (item) {
      if (item?.sharedObjectId) {
        const root = props.workspace.sceneRoot(item.sharedObjectId)
        if (root) pipeline().zoomExtentsWithoutRhino(true, new Box3().setFromObject(root))
        return
      }
      if (item?.documentId && !pipeline().zoomDocumentTreeItem(reference(item))) notice.value = 'No visible preview available for this item.'
    }
    function isHidden (item) {
      void viewRevision.value
      if (item.sharedObjectId) {
        const object = props.workspace.objects.get(item.sharedObjectId)
        return !sharedDocumentGeometryVisible({ ...object, objectId: item.sharedObjectId, publicDocumentId: props.state.publicDocumentId })
      }
      return item.documentId && !documentGeometryVisible(reference(item))
    }
    function toggleVisibility (item) {
      pipeline().setDocumentTreeVisibility(reference(item), isHidden(item))
      if (item.geometryId && isHidden(item) && !documentGeometryVisible({ ...reference(item), geometryId: null, visible: true })) notice.value = 'The parent document is hidden.'
    }
    function locateNode (item) {
      const frame = editor()
      const node = frame?.graph?.getNodeById(item.nodeInstanceId)
      if (!node) { notice.value = 'Source node belongs to another graph or is no longer loaded.'; return }
      frame.graphcanvas.selectNode(node)
      frame.graphcanvas.fitView([node])
    }
    async function copyReference () {
      try { await navigator.clipboard.writeText(JSON.stringify(reference(selected.value), null, 2)); notice.value = 'Reference copied.' } catch (_) { error.value = 'Clipboard access is unavailable.' }
    }
    function navigate (event, item) {
      if (event.key === 'Enter') { event.preventDefault(); select(item) } else if (event.key === ' ' && item.documentId && !item.group && !item.message) { event.preventDefault(); toggleVisibility(item) } else if (event.key === 'ArrowRight' && item.branch && !expanded.value.has(item.key)) { event.preventDefault(); toggle(item) } else if (event.key === 'ArrowLeft' && item.branch && expanded.value.has(item.key)) { event.preventDefault(); toggle(item) }
    }
    const onViewChanged = () => { viewRevision.value++ }
    window.addEventListener('pandaui-document-view-changed', onViewChanged)
    const onMove = () => refresh(true)
    window.addEventListener('pandaui-document-moved', onMove)
    const onDelete = event => {
      const ids = new Set([...event.detail.deletedDocumentIds, ...event.detail.nativeDocumentIds])
      ids.forEach(id => { requests.delete(id); delete pages[id]; expanded.value.delete('document:' + id) })
      if (ids.has(selected.value?.documentId)) selected.value = null
      refresh(true)
    }
    window.addEventListener('pandaui-document-deleted', onDelete)
    const unsubscribe = PandaUIApp.onSelectionChanged(() => {
      const marker = pipeline().documentTreeSelection()
      if (!marker) return
      const item = rows.value.find(row => (marker.objectId && row.sharedObjectId === marker.objectId) || (marker.geometryId && row.documentId === marker.documentId && row.geometryId === marker.geometryId))
      if (item) selected.value = item
    })
    watch(search, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => refresh(true), 300) })
    watch([() => props.state.publicDocumentId, () => props.state.documents, () => props.state.sceneObjects], expandPublishedSharedBranches, { immediate: true })
    watch(() => props.active, active => {
      clearInterval(timer)
      if (active) { refresh(); timer = setInterval(() => refresh(), 5000) } else controllers.forEach(controller => controller.abort())
    }, { immediate: true })
    onUnmounted(() => {
      disposed = true
      clearInterval(timer)
      clearTimeout(searchTimer)
      controllers.forEach(controller => controller.abort())
      window.removeEventListener('pandaui-document-view-changed', onViewChanged)
      window.removeEventListener('pandaui-document-moved', onMove)
      window.removeEventListener('pandaui-document-deleted', onDelete)
      unsubscribe()
    })
    return { documentCount, rows, expanded, selected, pendingDelete, removeDocument, search, error, notice, refreshing, refresh, load, toggle, select, zoom, isHidden, toggleVisibility, locateNode, copyReference, navigate, save, saveLocal, closeLocal, serverDocument, publish, startDrag, dragOver, drop, endDrag, dropKey, ownerLabel, canControl, isDocumentRow, isLocked, isolationActive, treeAction }
  }
}
</script>

<style scoped>
.document-manager { display: flex; flex-direction: column; height: 100%; min-height: 160px; color: #29475a; font: 12px/1.4 Arial, sans-serif; letter-spacing: 0; }
.document-manager__toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 8px; flex: none; }
.document-manager__toolbar strong { flex: 1; font-size: 14px; }
.document-manager__count { flex: none; font-size: 11px; color: #496779; font-variant-numeric: tabular-nums; }
.document-manager__search { margin: 0 8px 8px; flex: none; }
.document-manager__search :deep(.q-field__control) { background: rgba(238, 243, 245, 0.25); border-radius: 4px; }
.document-manager__tree { flex: 1; min-height: 70px; overflow: auto; }
.document-manager__row { display: flex; align-items: center; gap: 4px; height: 30px; padding-right: 8px; cursor: pointer; outline: none; }
.document-manager__row:hover { background: rgba(217, 231, 238, 0.25); }
.document-manager__row.is-drop-target { outline: 1px solid #328c9b; outline-offset: -1px; background: rgba(80, 154, 168, .25); }
.document-manager__row:focus-visible { outline: 1px solid #267c87; outline-offset: -1px; }
.document-manager__row.is-selected { background: rgba(38, 124, 135, 0.25); }
.document-manager__row.is-selected .document-manager__count { color: #e3f2f3; }
.document-manager__row.is-hidden .document-manager__label { opacity: 0.65; }
.document-manager__expand, .document-manager__visibility { padding: 0; width: 20px; height: 26px; flex: none; background: none; border: 0; color: inherit; cursor: pointer; }
.document-manager__expand:disabled { cursor: default; }
.document-manager__visibility-space { width: 20px; flex: none; }
.document-manager__type { flex: none; }
.document-manager__label { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.document-manager__owner { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; font-size: 10px; color: #496779; }
.document-manager__more { background: rgba(238, 243, 245, 0.25); color: #29475a; border: 1px solid #94a9b4; border-radius: 4px; font: inherit; padding: 2px 8px; }
.document-manager__details { border-top: 1px solid #8396a5; padding: 6px 10px; flex: none; background: rgba(238, 243, 245, 0.25); }
.document-manager__detail-title { display: flex; align-items: center; gap: 4px; min-width: 0; }
.document-manager__detail-title strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.document-manager__identifier { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.document-manager__muted { color: #617782; margin-left: 8px; }
.document-manager__message, .document-manager__empty { padding: 8px 10px; overflow-wrap: anywhere; }
.document-manager__message { background: rgba(226, 237, 241, 0.25); flex: none; }
.document-manager__message.is-error { background: rgba(245, 222, 221, 0.25); color: #822e30; }
</style>
