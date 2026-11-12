<template>
  <section class="backend-documents" aria-label="Backend collaboration documents">
    <div class="backend-documents__heading">
      <span>Backend documents</span>
      <q-btn flat round dense size="sm" icon="refresh" :loading="loading" aria-label="Refresh backend documents" @click="$emit('refresh')" />
    </div>
    <div v-if="error" class="backend-documents__message is-error">{{ error }}</div>
    <div v-else-if="loading && !documents.length" class="backend-documents__message">Loading backend documents…</div>
    <div v-else-if="!documents.length" class="backend-documents__message">No backend documents</div>
    <div v-else class="backend-documents__list" role="list">
      <button
        v-for="document in documents"
        :key="document.documentId"
        class="backend-documents__item"
        :class="{ 'is-active': activeDocumentId === document.documentId }"
        :disabled="busy || activeDocumentId === document.documentId"
        :title="document.documentId"
        @click="$emit('select', document)"
      >
        <q-icon :name="activeDocumentId === document.documentId ? 'cloud_done' : 'cloud'" size="16px" />
        <span class="backend-documents__name">{{ document.documentId }}</span>
        <small>{{ document.objects }} objects · {{ document.clients }} online</small>
      </button>
    </div>
  </section>
</template>

<script>
export default {
  name: 'BackendDocumentPicker',
  emits: ['refresh', 'select'],
  props: {
    documents: { type: Array, default: () => [] },
    activeDocumentId: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    busy: { type: Boolean, default: false },
    error: { type: String, default: '' }
  }
}
</script>

<style scoped>
.backend-documents { padding: 8px 12px 10px; color: #29475a; }
.backend-documents__heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-weight: 600; }
.backend-documents__list { display: grid; gap: 3px; max-height: 180px; overflow: auto; }
.backend-documents__item { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 3px 7px; padding: 7px 6px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: inherit; text-align: left; font: inherit; cursor: pointer; }
.backend-documents__item:hover { background: rgba(225, 236, 241, 0.35); }
.backend-documents__item.is-active { border-color: #267c87; background: rgba(210, 236, 237, 0.3); }
.backend-documents__item:disabled { cursor: default; opacity: 0.7; }
.backend-documents__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.backend-documents__item small { grid-column: 2; color: #607b88; font-size: 10px; }
.backend-documents__message { padding: 5px 0; color: #607b88; font-size: 11px; }
.backend-documents__message.is-error { color: #a33137; }
</style>
