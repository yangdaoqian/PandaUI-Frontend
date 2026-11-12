<template>
  <div class="editor-settings">
    <q-tabs v-model="tab" dense no-caps align="justify" class="editor-settings__tabs" active-color="primary" indicator-color="primary">
      <q-tab name="appearance" label="Appearance" />
      <q-tab name="canvas" label="Canvas" />
      <q-tab name="documents" label="Documents" />
    </q-tabs>
    <node-appearance-panel v-show="tab === 'appearance'" :settings="appearance" :storage-error="storageError"
      @update="(key, value) => $emit('appearance', key, value)" @reset="$emit('reset-appearance')" />
    <div v-show="tab === 'canvas'" class="editor-settings__canvas">
      <h3>Execution</h3>
      <p>{{ executionState.stepMode ? 'Recompute when graph inputs change.' : 'Run the graph manually when ready.' }}</p>
      <div class="editor-settings__actions">
        <q-btn no-caps unelevated :outline="!executionState.stepMode" color="primary" icon="bolt"
          :label="executionState.stepMode ? 'Step ON' : 'Step OFF'" @click="$emit('command', 'step-mode-toggle')" />
        <q-btn no-caps outline icon="play_arrow" label="Run Once" @click="$emit('command', 'step')" />
      </div>
      <h3>Navigation</h3>
      <div class="editor-settings__actions">
        <q-btn v-for="action in actions" :key="action.command" no-caps flat :icon="action.icon" :label="action.label"
          @click="$emit('command', action.command)" />
      </div>
    </div>
    <div v-show="tab === 'documents'"><slot name="documents" /></div>
  </div>
</template>

<script>
import { ref } from 'vue'
import NodeAppearancePanel from './NodeAppearancePanel.vue'

export default {
  name: 'EditorSettingsPanel',
  components: { NodeAppearancePanel },
  props: { appearance: { type: Object, required: true }, executionState: { type: Object, required: true }, storageError: Boolean },
  emits: ['appearance', 'reset-appearance', 'command'],
  setup () {
    return { tab: ref('appearance'),
      actions: [
        { command: 'select-all', label: 'Select All', icon: 'select_all' },
        { command: 'fit-view', label: 'Fit View', icon: 'fit_screen' },
        { command: 'reset-view', label: 'Reset View', icon: 'center_focus_strong' },
        { command: 'snap-to-grid', label: 'Snap to Grid', icon: 'grid_on' }
      ] }
  }
}
</script>

<style scoped>
.editor-settings__tabs { border-bottom: 1px solid #78909c40; }
.editor-settings__tabs :deep(.q-tab) { min-width: 0; padding: 0 8px; }
.editor-settings__tabs :deep(.q-tab__label) { font-size: 12px; }
.editor-settings__canvas { padding: 16px; }
.editor-settings__canvas h3 { font-size: 13px; line-height: 1.5; margin: 8px 0; font-weight: 600; }
.editor-settings__canvas p { font-size: 12px; opacity: 0.75; margin: 0 0 12px; }
.editor-settings__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 20px; }
.editor-settings__actions .q-btn { font-size: 12px; min-height: 36px; border-radius: 6px; }
</style>
