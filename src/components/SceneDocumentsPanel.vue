<template>
  <section class="scene-documents" aria-label="Scene documents" @keydown.stop>
    <div class="scene-documents__header">
      <strong>Scene workspace</strong>
      <span :class="{ online: state.connected }">{{ state.localMode ? 'Local mode' : state.connected ? 'Live' : state.publicDocumentId ? 'Connecting' : 'No public document' }}</span>
      <q-btn flat round dense icon="refresh" size="sm" aria-label="Refresh scene documents" :disable="state.localMode" @click="run(() => workspace.refresh())" />
    </div>
    <div v-if="state.localMode" class="scene-documents__caption">Local files and node graphs are available. Connect and sign in to use shared documents.</div>
    <div v-if="state.displayLoading?.total" class="scene-documents__caption" role="status">
      Shared display · {{ state.displayLoading.loaded }} / {{ state.displayLoading.total }} objects loaded
      <div>Counts cover objects received by the server. Source uploads may still be in progress.</div>
      <div>{{ state.displayLoading.shown || 0 }} shown · {{ state.displayLoading.hidden || 0 }} hidden</div>
      <div v-if="state.displayLoading.hidden">Loaded objects may be hidden by source visibility or this window's tree filters.</div>
      <q-btn v-if="state.displayLoading.hidden" flat dense no-caps icon="visibility" label="Show all objects (local)" @click="workspace.showAllSharedObjects()" />
      <span v-if="state.displayLoading.failed"> · {{ state.displayLoading.failed }} pending retry</span>
      <q-btn v-if="state.displayLoading.failed" flat dense no-caps label="Retry downloads" :disable="!state.connected" @click="workspace.retryDisplayDownloads()" />
    </div>
    <q-select dense outlined emit-value map-options :model-value="state.publicDocumentId" :options="publicOptions" label="Public document" :disable="state.localMode || busy || state.busy" @update:model-value="id => run(() => workspace.selectPublic(id))" />
    <div class="scene-documents__actions">
      <q-btn flat dense no-caps icon="public" label="New public document" size="sm" :disable="state.localMode || busy || state.busy" @click="creating = creating === 'public' ? '' : 'public'" />
      <q-btn v-if="selectedPublic" flat dense no-caps icon="group" label="Members" size="sm" @click="openMembers" />
    </div>
    <div class="scene-documents__private">
      <div class="scene-documents__heading"><strong>Private documents</strong><span>{{ openedCount }} open</span></div>
      <q-select v-if="localOptions.length" dense outlined emit-value map-options :model-value="localSelection" :options="localOptions" label="Local document" @update:model-value="selectLocal" />
      <div class="scene-documents__private-actions">
        <q-btn flat dense no-caps icon="folder_open" label="Open folder" :disable="busy || importing || state.localFolderBusy" @click="openFolder" />
        <q-btn flat dense no-caps icon="file_upload" label="Import source file" :disable="busy || importing" @click="$emit('import')" />
        <q-btn flat dense no-caps icon="add" label="New" :disable="busy || importing" @click="creating = creating === 'private' ? '' : 'private'" />
        <q-btn flat dense no-caps icon="save" label="Save locally" :disable="busy || importing || state.localFolderBusy || !localSelection" @click="saveFolder(false)" />
        <q-btn flat dense no-caps icon="save_as" label="Save as" :disable="busy || importing || state.localFolderBusy || !localSelection" @click="saveFolder(true)" />
        <q-btn flat dense no-caps icon="image" label="Save render data" :loading="busy" :disable="busy || importing || state.localFolderBusy || !localOptions.length" @click="saveRenderFolder" />
        <q-btn flat dense no-caps icon="image_search" label="Import render data" :disable="busy || importing || state.localFolderBusy" @click="openRenderFolder" />
        <q-btn flat dense no-caps icon="cloud" label="Server library" :disable="busy || state.busy || !state.publicDocumentId || state.localMode" @click="openLibrary('open')" />
        <q-btn flat dense no-caps icon="cloud_upload" label="Save to server" :disable="!canCreatePrivate || importing || !state.privateDocumentId" @click="run(() => workspace.saveDocument())" />
        <q-btn flat dense no-caps icon="delete_outline" label="Delete on server" :disable="!canCreatePrivate" @click="openLibrary('delete')" />
      </div>
      <div class="scene-documents__caption">Save locally keeps original geometry; Save render data keeps display data, materials and render settings.</div>
      <div v-if="!localOptions.length" class="scene-documents__caption">Open, import or create a private document before saving render data.</div>
      <div v-if="localProgress" class="scene-documents__caption" role="status">{{ localProgress }} <q-btn v-if="busy" flat dense no-caps label="Cancel" @click="workspace.app.localFolderController?.abort()" /></div>
    </div>
    <form v-if="creating" class="scene-documents__create" @submit.prevent="create">
      <q-input v-model="name" dense outlined autofocus :label="creating === 'public' ? 'Public document name' : 'Private document name'" maxlength="128" />
      <q-btn flat dense icon="check" type="submit" :disable="busy || !name.trim()" :aria-label="creating === 'public' ? 'Create public document' : 'Create private document'" />
    </form>
    <div class="scene-documents__caption">Public objects are editable by document editors. Private geometry belongs to its owner account. Node graphs stay private. Right-click documents to save, publish or delete.</div>
    <div v-if="state.publicationProgress != null" class="scene-documents__caption" role="status">
      {{ state.publicationCommitting ? 'Finalizing publication' : 'Publishing geometry' }} · {{ state.publicationProgress }} parts uploaded
      <q-btn v-if="!state.publicationCommitting" flat dense no-caps label="Cancel upload" @click="workspace.cancelPublication()" />
    </div>
    <div v-if="error || state.error" class="scene-documents__error" role="alert">{{ error || state.error }}</div>
    <q-dialog v-model="libraryDialog">
      <q-card class="scene-documents__library">
        <q-card-section><div class="text-h6">{{ libraryMode === 'delete' ? 'Delete private document' : 'Open private document' }}</div><div class="text-caption">{{ libraryMode === 'delete' ? 'Private documents' : 'Saved documents' }} in {{ selectedPublic?.name }}</div></q-card-section>
        <q-card-section class="q-pt-none">
          <q-input v-model="documentSearch" dense outlined clearable placeholder="Search saved documents"><template #prepend><q-icon name="search" /></template></q-input>
          <q-list separator class="scene-documents__library-list">
            <q-item v-for="entry in savedPrivateDocuments" :key="entry.documentId" clickable :active="selectedDocumentId === entry.documentId" @click="selectedDocumentId = entry.documentId">
              <q-item-section avatar><q-icon :name="isOpen(entry.documentId) ? 'folder_open' : 'folder'" /></q-item-section>
              <q-item-section><q-item-label>{{ entry.name }}</q-item-label><q-item-label caption>{{ entry.documentId }}</q-item-label></q-item-section>
              <q-item-section side>{{ entry.savedAt ? 'Saved' : 'Unsaved' }}{{ isOpen(entry.documentId) ? ' · Open' : '' }}</q-item-section>
            </q-item>
          </q-list>
          <div v-if="!savedPrivateDocuments.length" class="text-caption q-pa-sm">No saved private documents found.</div>
          <div v-if="error" class="scene-documents__error" role="alert">{{ error }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancel" v-close-popup />
          <q-btn v-if="libraryMode === 'open'" color="primary" no-caps label="Open" :disable="busy || !selectedSavedDocument" @click="openSavedDocument" />
          <q-btn v-else color="negative" no-caps label="Delete" :disable="busy || state.busy || !selectedSavedDocument?.canDelete" @click="pendingDelete = selectedSavedDocument" />
        </q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog :model-value="!!pendingDelete" persistent @update:model-value="value => { if (!value) pendingDelete = null }">
      <q-card style="width: 390px; max-width: 90vw">
        <q-card-section><strong>Delete {{ pendingDelete?.name }}?</strong><div class="q-mt-sm">This document and its scene objects will be deleted from all connected workspaces.</div><div v-if="error" class="scene-documents__error" role="alert">{{ error }}</div></q-card-section>
        <q-card-actions align="right"><q-btn flat no-caps label="Cancel" :disable="busy" @click="pendingDelete = null" /><q-btn flat no-caps color="negative" label="Delete" :loading="busy" @click="deleteSavedDocument" /></q-card-actions>
      </q-card>
    </q-dialog>
    <q-dialog v-model="membersDialog">
      <q-card style="width: 440px; max-width: 95vw">
        <q-card-section><div class="text-h6">Document members</div><div class="text-caption">{{ selectedPublic?.name }} · {{ selectedPublic?.role }}</div></q-card-section>
        <q-card-section>
          <q-list separator>
            <q-item v-for="member in members" :key="member.userId">
              <q-item-section><q-item-label>{{ member.username }}</q-item-label><q-item-label caption>{{ member.role }}</q-item-label></q-item-section>
              <q-item-section v-if="selectedPublic?.role === 'owner' && member.role !== 'owner'" side>
                <q-btn flat dense no-caps :label="member.role === 'editor' ? 'Make viewer' : 'Make editor'" :disable="busy" @click="updateMember(member.username, member.role === 'editor' ? 'viewer' : 'editor')" />
                <q-btn flat dense no-caps label="Remove" color="negative" :disable="busy" @click="updateMember(member.username, null)" />
              </q-item-section>
            </q-item>
          </q-list>
          <form v-if="selectedPublic?.role === 'owner'" class="scene-members-form" @submit.prevent="updateMember(memberName, memberRole)">
            <q-select v-model="memberName" dense outlined use-input fill-input hide-selected emit-value map-options clearable :input-debounce="250" :options="accountOptions" label="Account username" hint="Search registered accounts to share this document" @filter="searchAccounts">
              <template #no-option><q-item><q-item-section class="text-grey">No matching accounts</q-item-section></q-item></template>
            </q-select>
            <q-select v-model="memberRole" dense outlined :options="['editor', 'viewer']" label="Document role" />
            <q-btn color="primary" no-caps label="Add member" type="submit" :disable="busy || !memberName" />
          </form>
          <div v-if="error" class="scene-documents__error" role="alert">{{ error }}</div>
        </q-card-section>
        <q-card-actions align="right"><q-btn flat label="Close" v-close-popup /></q-card-actions>
      </q-card>
    </q-dialog>
  </section>
</template>

<script>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ownsWorkspaceDocument } from '../DocumentHierarchy'

export default {
  props: { workspace: { type: Object, required: true }, state: { type: Object, required: true }, importing: Boolean },
  emits: ['import'],
  setup (props) {
    const busy = ref(false)
    const error = ref('')
    const creating = ref('')
    const name = ref('')
    const libraryDialog = ref(false)
    const libraryMode = ref('open')
    const documentSearch = ref('')
    const selectedDocumentId = ref('')
    const pendingDelete = ref(null)
    const membersDialog = ref(false)
    const members = ref([])
    const memberName = ref('')
    const memberRole = ref('viewer')
    const accountOptions = ref([])
    const localProgress = ref('')
    const localOptions = computed(() => (props.state.localDocuments || []).map(doc => ({ label: doc.name, value: doc.documentId })))
    const localSelection = computed(() => {
      const selected = props.state.localPrivateDocumentId
      return selected && localOptions.value.some(option => option.value === selected) ? selected : localOptions.value.at(-1)?.value || ''
    })
    const selectLocal = id => props.workspace.selectLocalPrivate(id)
    const progress = state => { localProgress.value = `${state.phase} · ${state.completed || 0}${state.total ? ' / ' + state.total : ''}` }
    let folderPickerActive = false
    const chooseFolder = () => {
      if (!window.showDirectoryPicker) throw new Error('Folder access requires Edge or Chrome on HTTPS or localhost.')
      if (folderPickerActive) return Promise.reject(new DOMException('A folder picker is already open.', 'InvalidStateError'))
      folderPickerActive = true
      return window.showDirectoryPicker({ mode: 'readwrite' }).finally(() => { folderPickerActive = false })
    }
    const pickerError = failure => {
      error.value = failure.name === 'AbortError' ? 'Folder selection was cancelled or closed.' : failure.message || 'Unable to access the selected folder.'
      localProgress.value = ''
    }
    const ensureFolderWritePermission = async directory => {
      if (!directory?.requestPermission) return
      const permission = await directory.requestPermission({ mode: 'readwrite' })
      if (permission !== 'granted') throw new DOMException('Write permission was not granted for the selected folder.', 'AbortError')
    }
    const projectDirectory = async (parent, id, suffix) => {
      const doc = props.workspace.app.modelDocuments?.().find(candidate => candidate.documentId === id || candidate.workspaceDocumentId === id)
      if (!doc) throw new Error('Select an opened frontend private document.')
      const name = Array.from(doc.name).filter(character => character.charCodeAt(0) >= 32).join('').replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*]/g, '_').slice(0, 80) || 'Document'
      return parent.getDirectoryHandle(`${name}-${doc.documentId}.${suffix}`, { create: true })
    }
    const openFolder = async () => {
      if (busy.value || folderPickerActive) return
      let directory
      try { directory = await chooseFolder() } catch (failure) { pickerError(failure); return }
      await run(async () => { localProgress.value = 'Opening folder...'; await props.workspace.app.openLocalDocumentFolder({ directory, onProgress: progress }); localProgress.value = 'Document opened.' })
    }
    const saveFolder = async saveAs => {
      if (busy.value || folderPickerActive) return
      let directory
      try {
        const parent = await chooseFolder()
        await ensureFolderWritePermission(parent)
        directory = await projectDirectory(parent, localSelection.value, 'panda')
      } catch (failure) { pickerError(failure); return }
      await run(async () => { localProgress.value = 'Saving document...'; await props.workspace.app.saveLocalDocumentFolder(localSelection.value, { directory, saveAs: false, onProgress: progress }); localProgress.value = 'Document saved locally.' })
    }
    const saveRenderFolder = async () => {
      if (busy.value || folderPickerActive) return
      let directory
      try {
        const parent = await chooseFolder()
        await ensureFolderWritePermission(parent)
        directory = await projectDirectory(parent, localSelection.value, 'panda-render')
      } catch (failure) { pickerError(failure); return }
      await run(async () => { localProgress.value = 'Saving render data...'; await props.workspace.app.saveLocalRenderDataFolder(localSelection.value, { directory, permissionChecked: true, onProgress: progress }); localProgress.value = 'Render data saved.' })
    }
    const openRenderFolder = async () => {
      if (busy.value || folderPickerActive) return
      let directory
      try { directory = await chooseFolder() } catch (failure) { pickerError(failure); return }
      await run(async () => { localProgress.value = 'Opening render data...'; await props.workspace.app.openLocalRenderDataFolder({ directory, onProgress: progress }); localProgress.value = 'Render data opened.' })
    }
    let accountSearch = 0
    const selectedPublic = computed(() => props.state.documents.find(entry => entry.documentId === props.state.publicDocumentId))
    const canCreatePrivate = computed(() => !props.state.localMode && !busy.value && !props.state.busy && ['owner', 'editor'].includes(selectedPublic.value?.role))
    const isOpen = id => (props.state.openedPrivateDocumentIds || []).includes(id)
    const privateDocuments = computed(() => props.state.documents.filter(entry => entry.kind === 'private' && !entry.publishedAt && entry.publicDocumentId === props.state.publicDocumentId && ownsWorkspaceDocument(entry, props.state)))
    const openedCount = computed(() => (props.state.localDocuments || []).length + privateDocuments.value.filter(entry => isOpen(entry.documentId) && !(props.state.localDocuments || []).some(local => local.workspaceDocumentId === entry.documentId)).length)
    const savedPrivateDocuments = computed(() => privateDocuments.value.filter(entry => (libraryMode.value === 'delete' || entry.savedAt) && (entry.name + ' ' + entry.documentId).toLowerCase().includes((documentSearch.value || '').trim().toLowerCase())))
    const selectedSavedDocument = computed(() => savedPrivateDocuments.value.find(entry => entry.documentId === selectedDocumentId.value))
    watch(() => props.state.publicDocumentId, () => { libraryDialog.value = false; pendingDelete.value = null; creating.value = ''; selectedDocumentId.value = '' })
    watch(() => props.state.publicDocumentId, () => { membersDialog.value = false; members.value = []; memberName.value = ''; accountOptions.value = []; accountSearch++ })
    watch(membersDialog, () => { accountSearch++ })
    onBeforeUnmount(() => { accountSearch++ })
    const membersUrl = () => '/api/collaboration/documents/' + encodeURIComponent(props.state.publicDocumentId) + '/members'
    async function searchAccounts (query, update, abort) {
      const searchId = ++accountSearch
      try {
        const result = await props.workspace.request('/api/collaboration/documents/' + encodeURIComponent(props.state.publicDocumentId) + '/shareable-accounts?query=' + encodeURIComponent(query))
        if (searchId !== accountSearch) { abort(); return }
        update(() => { accountOptions.value = result.accounts.map(account => ({ label: account.username, value: account.username })) })
      } catch (failure) { if (searchId === accountSearch) error.value = failure.message; abort() }
    }
    async function openMembers () {
      membersDialog.value = true
      await run(async () => { members.value = (await props.workspace.request(membersUrl())).members })
    }
    async function updateMember (username, role) {
      await run(async () => {
        members.value = (await props.workspace.request(membersUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, role }) })).members
        memberName.value = ''
        accountOptions.value = []
      })
    }
    const publicOptions = computed(() => props.state.documents.filter(entry => entry.kind === 'public').map(entry => ({ value: entry.documentId, label: entry.name })))
    async function run (action) {
      if (busy.value) return
      busy.value = true
      error.value = ''
      try { await action() } catch (failure) { localProgress.value = ''; if (failure.name !== 'AbortError') error.value = failure.message } finally { busy.value = false }
    }
    async function create () {
      await run(() => creating.value === 'public' ? props.workspace.createPublic(name.value.trim()) : props.workspace.app.createLocalPrivateDocument(name.value.trim()))
      if (!error.value) { creating.value = ''; name.value = '' }
    }
    async function openLibrary (mode) {
      libraryMode.value = mode
      documentSearch.value = ''
      selectedDocumentId.value = props.state.privateDocumentId || ''
      libraryDialog.value = true
      await run(() => props.workspace.refresh())
    }
    async function openSavedDocument () {
      if (!selectedSavedDocument.value) return
      await run(async () => {
        const id = selectedSavedDocument.value.documentId
        await props.workspace.app.prepareForDocumentReplacement()
        props.workspace.selectPrivate(id)
      })
      if (!error.value) libraryDialog.value = false
    }
    async function deleteSavedDocument () {
      if (!pendingDelete.value) return
      await run(() => props.workspace.deleteDocument(pendingDelete.value.documentId))
      if (!error.value) { pendingDelete.value = null; selectedDocumentId.value = '' }
    }
    return { busy, error, creating, name, publicOptions, run, create, selectedPublic, membersDialog, members, memberName, memberRole, accountOptions, searchAccounts, openMembers, updateMember, canCreatePrivate, openedCount, isOpen, libraryDialog, libraryMode, documentSearch, selectedDocumentId, selectedSavedDocument, savedPrivateDocuments, openLibrary, openSavedDocument, pendingDelete, deleteSavedDocument, localOptions, localSelection, selectLocal, localProgress, openFolder, saveFolder, saveRenderFolder, openRenderFolder }
  }
}
</script>

<style scoped>
.scene-documents { display: grid; gap: 10px; padding: 12px; color: var(--node-text-color, #29475a); border-bottom: 1px solid rgba(120, 155, 175, .25); }
.scene-documents__header, .scene-documents__heading { display: flex; align-items: center; gap: 8px; }
.scene-documents__header strong, .scene-documents__heading strong { flex: 1; }
.scene-documents__heading { justify-content: space-between; }
.scene-documents__actions { display: flex; gap: 6px; flex-wrap: wrap; }
.scene-documents__private { display: grid; gap: 8px; padding: 10px; border: 1px solid rgba(120, 155, 175, .25); border-radius: 8px; background: rgba(120, 155, 175, .04); }
.scene-documents__private .scene-documents__heading { font-size: 12px; }
.scene-documents__private .scene-documents__heading span { opacity: .65; font-size: 11px; }
.scene-documents__private-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.scene-documents__render-name { grid-column: 1 / -1; min-width: 0; }
.scene-documents__private-actions .q-btn { font-size: 11px; }
.scene-documents__library { width: 500px; max-width: 95vw; }
.scene-documents__library-list { max-height: 45vh; overflow: auto; margin-top: 8px; }
.scene-documents__header span { font-size: 11px; opacity: .65; }
.scene-documents__header span.online { color: #23856c; opacity: 1; }
.scene-documents__caption { font-size: 11px; opacity: .7; line-height: 1.5; }
.scene-documents__create { display: grid; grid-template-columns: 1fr 30px; gap: 4px; }
.scene-members-form { display: grid; gap: 12px; margin-top: 16px; }
.scene-documents__error { font-size: 11px; color: #c0494f; overflow-wrap: anywhere; }
</style>
