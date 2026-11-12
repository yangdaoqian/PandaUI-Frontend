<template>
  <div class="node-documents" @keydown.stop>
    <div class="node-documents__title">Node Documents</div>
    <div class="node-documents__actions">
      <q-btn flat dense no-caps icon="note_add" label="New" :disable="state.busy" @click="workspace.newDocument()" />
      <q-btn flat dense no-caps icon="folder_open" label="Open" :disable="state.busy" @click="open()" />
      <q-btn flat dense no-caps icon="save" label="Save" :disable="state.busy" @click="save()" />
      <q-btn flat dense no-caps icon="save_as" label="Save As" :disable="state.busy" @click="save(true)" />
      <q-btn flat dense icon="more_horiz" aria-label="Local file options" :disable="state.busy">
        <q-menu><q-list dense>
          <q-item clickable v-close-popup @click="open(true)"><q-item-section>Open by path…</q-item-section></q-item>
          <q-item clickable v-close-popup @click="save(true, true)"><q-item-section>Save As by path…</q-item-section></q-item>
        </q-list></q-menu>
      </q-btn>
    </div>
    <div v-if="state.message || state.busy" class="node-documents__message" :class="{ 'is-error': state.error }" role="status">
      {{ state.busy ? 'Updating node document…' : state.message }}
    </div>
    <div class="node-documents__heading">Open documents <span>{{ state.documents.length }}</span></div>
    <div class="node-documents__list" role="list" aria-label="Open node documents">
      <div v-for="entry in state.documents" :key="entry.id" class="node-documents__entry" :class="{ 'is-active': state.activeId === entry.id }" role="listitem">
        <button class="node-documents__file" :disabled="state.busy" :title="entry.path || entry.name" @click="workspace.switchTo(entry.id)">
          <q-icon :name="state.activeId === entry.id ? 'description' : 'insert_drive_file'" size="17px" />
          <span>{{ entry.name }}{{ entry.dirty ? ' *' : '' }}</span>
        </button>
        <q-btn flat round dense size="sm" icon="close" :aria-label="'Close ' + entry.name" :disable="state.busy" @click="close(entry)" />
      </div>
    </div>
    <div class="node-documents__heading">Recent documents <span>{{ state.recent.length }}/20</span></div>
    <div class="node-documents__list" aria-label="Recent node documents">
      <div v-if="!state.recent.length" class="node-documents__empty">No recent node documents</div>
      <div v-for="entry in state.recent" :key="entry.id" class="node-documents__entry">
        <button class="node-documents__file" :disabled="state.busy" :title="entry.path" @click="workspace.openRecent(entry.id)">
          <q-icon name="history" size="17px" /><span>{{ entry.name }}<small>{{ entry.path }}</small></span>
        </button>
        <q-btn flat round dense size="sm" icon="close" :aria-label="'Remove recent ' + entry.name" :disable="state.busy" @click="workspace.forgetRecent(entry.id)" />
      </div>
    </div>
    <q-dialog v-model="pathDialog" @hide="cancelPath">
      <q-card class="node-documents__dialog">
        <q-card-section><div class="text-h6">{{ pathMode === 'open' ? 'Open node document' : 'Save node document as' }}</div></q-card-section>
        <q-card-section class="q-pt-none">
          <q-input v-model="filePath" autofocus outlined label="Full file path (.json)" placeholder="C:\Models\nodes.pandaui.json" @keyup.enter="acceptPath" />
        </q-card-section>
        <q-card-actions align="right"><q-btn flat label="Cancel" v-close-popup /><q-btn flat :label="pathMode === 'open' ? 'Open' : 'Save'" color="primary" :disable="!filePath.trim()" @click="acceptPath" /></q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="closeDialog">
      <q-card class="node-documents__dialog">
        <q-card-section><div class="text-h6">Unsaved changes</div><div>Save {{ pendingClose?.name }} before closing?</div></q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancel" v-close-popup /><q-btn flat label="Discard" @click="discardClose" /><q-btn flat label="Save" color="primary" @click="saveClose" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script>
import { ref, onMounted, onUnmounted } from 'vue'

export default {
  props: { workspace: { type: Object, required: true }, state: { type: Object, required: true } },
  setup (props) {
    const pathDialog = ref(false)
    const pathMode = ref('open')
    const filePath = ref('')
    const closeDialog = ref(false)
    const pendingClose = ref(null)
    let pathResolver = null
    const types = [{ description: 'PandaUI node document', accept: { 'application/json': ['.json'] } }]

    function choosePath (mode, initial = '') {
      filePath.value = initial
      pathMode.value = mode
      pathDialog.value = true
      return new Promise(resolve => { pathResolver = resolve })
    }
    function cancelPath () { pathResolver?.(null); pathResolver = null }
    function acceptPath () {
      pathResolver?.(filePath.value.trim())
      pathResolver = null
      pathDialog.value = false
    }
    async function chooseLocation (document, byPath = false) {
      if (!byPath && typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({ types, suggestedName: /\.json$/i.test(document.name) ? document.name : `${document.name}.pandaui.json` })
        return { handle, name: handle.name }
      }
      const path = await choosePath('save', document.location?.path || '')
      return path ? { path, name: path.split(/[\\/]/).pop() } : null
    }
    function save (saveAs = false, byPath = false) { return props.workspace.save(document => chooseLocation(document, byPath), saveAs) }
    function open (byPath = false) {
      return props.workspace.open(async () => {
        if (!byPath && typeof window.showOpenFilePicker === 'function') {
          const handles = await window.showOpenFilePicker({ types, multiple: false })
          if (!handles.length) return null
          return props.workspace.files.read({ handle: handles[0], name: handles[0].name })
        }
        const path = await choosePath('open')
        return path ? props.workspace.files.read({ path }) : null
      })
    }
    function close (entry) {
      props.workspace.capture()
      if (props.workspace.documents.find(document => document.id === entry.id)?.dirty) {
        pendingClose.value = entry
        closeDialog.value = true
      } else props.workspace.close(entry.id)
    }
    function discardClose () {
      const id = pendingClose.value.id
      closeDialog.value = false
      props.workspace.close(id, true)
    }
    async function saveClose () {
      const id = pendingClose.value.id
      closeDialog.value = false
      if (props.workspace.activeId !== id && !await props.workspace.switchTo(id)) return
      if (await save() && !props.workspace.documents.find(document => document.id === id)?.dirty) await props.workspace.close(id)
    }
    function command (event) {
      if (event.detail === 'save') save()
      else if (event.detail === 'save-as') save(true)
      else if (event.detail === 'open') open()
      else if (event.detail === 'new') props.workspace.newDocument()
    }
    onMounted(() => window.addEventListener('pandaui-node-document-command', command))
    onUnmounted(() => { window.removeEventListener('pandaui-node-document-command', command); cancelPath() })
    return { pathDialog, pathMode, filePath, closeDialog, pendingClose, cancelPath, acceptPath, save, open, close, discardClose, saveClose }
  }
}
</script>

<style scoped>
.node-documents { color: #29475a; font: 12px/1.4 Arial, sans-serif; padding: 10px; }
.node-documents__title { font-size: 14px; font-weight: 600; }
.node-documents__actions { display: flex; flex-wrap: wrap; gap: 2px; margin: 8px 0; }
.node-documents__actions :deep(.q-btn) { font-size: 11px; padding: 4px 6px; background: rgba(238, 243, 245, 0.25); }
.node-documents__heading { display: flex; justify-content: space-between; margin: 12px 0 4px; font-weight: 600; }
.node-documents__heading span { font-weight: 400; color: #607b88; }
.node-documents__list { max-height: 170px; overflow: auto; }
.node-documents__entry { display: flex; align-items: center; border: 1px solid transparent; border-radius: 4px; }
.node-documents__entry.is-active { border-color: #267c87; background: rgba(210, 236, 237, 0.25); }
.node-documents__file { display: flex; align-items: center; gap: 7px; width: 100%; min-width: 0; padding: 7px 5px; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.node-documents__file:hover { background: rgba(225, 236, 241, 0.25); }
.node-documents__file span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-documents__file small { display: block; overflow: hidden; text-overflow: ellipsis; color: #607b88; }
.node-documents__file:disabled { cursor: wait; opacity: 0.6; }
.node-documents__empty, .node-documents__message { padding: 6px 0; }
.node-documents__message.is-error { color: #a33137; }
.node-documents__dialog { width: 480px; max-width: 90vw; }
</style>
