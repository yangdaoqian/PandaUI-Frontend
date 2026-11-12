<template>
  <div class="node-appearance">
    <div class="node-appearance__intro">
      <div><strong>Node appearance</strong><span>{{ storageError ? 'Applied · local save unavailable' : 'Live preview · saved on this browser' }}</span></div>
      <q-btn flat dense no-caps icon="restart_alt" label="Reset" aria-label="Reset node appearance" @click="$emit('reset')" />
    </div>
    <div class="node-appearance__preview">
      <svg viewBox="0 0 360 104" role="img" aria-label="Node style preview">
        <path :d="settings.linkShape === 'straight' ? 'M8 66 L72 54' : 'M8 66 C54 66 32 54 72 54'" fill="none" :stroke="connectionColor" :stroke-width="settings.linkWidth" :opacity="settings.linkOpacity" />
        <path :d="settings.linkShape === 'straight' ? 'M288 70 L352 42' : 'M288 70 C324 70 308 42 352 42'" fill="none" :stroke="connectionColor" :stroke-width="settings.linkWidth" :opacity="settings.linkOpacity" />
        <defs><clipPath :id="controlId('clip')"><rect x="72" y="12" width="216" height="82" :rx="settings.cornerRadius" /></clipPath></defs>
        <g :clip-path="`url(#${controlId('clip')})`">
          <rect x="72" y="12" width="216" height="28" :fill="settings.titleBackgroundColor" :fill-opacity="settings.titleOpacity" />
          <rect x="72" y="40" width="216" height="54" :fill="settings.backgroundColor" :fill-opacity="settings.backgroundOpacity" />
        </g>
        <rect x="72" y="12" width="216" height="82" :rx="settings.cornerRadius" fill="none" :stroke="settings.borderColor" :stroke-width="settings.borderWidth" />
        <path v-if="settings.showStatusLine" d="M73 40 H287" stroke="#49b675" />
        <circle v-if="settings.showStatusBadge" cx="276" cy="26" r="4" fill="#49b675" />
        <path v-if="settings.showResizeHandle" d="M277 91 L285 83 M281 91 L285 87" :stroke="settings.borderColor" />
        <text x="86" y="31" :fill="settings.titleColor" :font-family="settings.fontFamily" :font-size="settings.titleFontSize" font-weight="600">Transform</text>
        <g :fill="settings.textColor" :font-family="settings.fontFamily" :font-size="settings.fontSize">
          <text x="86" y="58">Geometry</text><text x="274" y="75" text-anchor="end">Result</text>
        </g>
        <circle cx="72" cy="54" :r="settings.portRadius" :fill="portColor" />
        <circle cx="288" cy="70" :r="settings.portRadius" :fill="portColor" />
      </svg>
    </div>
    <q-expansion-item v-for="(group, index) in groups" :key="group.title" :default-opened="index === 0"
      :label="group.title" :icon="group.icon" class="node-appearance__section" dense expand-separator>
      <div class="node-appearance__fields" :class="{ 'node-appearance__fields--paired': index === 0 }">
        <div v-for="control in group.controls" :key="control.key" class="node-appearance__field">
          <template v-if="control.type === 'color'">
            <label :for="controlId(control.key)">{{ control.label }}</label>
            <div class="node-appearance__swatch">
              <input :id="controlId(control.key)" type="color" :aria-label="control.label" :value="settings[control.key]"
                @input="update(control.key, $event.target.value)" />
              <code>{{ settings[control.key].toUpperCase() }}</code>
            </div>
          </template>
          <template v-else-if="control.type === 'select'">
            <q-select :model-value="settings[control.key]" :options="control.options" :label="control.label"
              :aria-label="control.label" dense outlined emit-value map-options options-dense
              @update:model-value="update(control.key, $event)" />
          </template>
          <template v-else-if="control.type === 'toggle'">
            <q-toggle :model-value="settings[control.key]" :label="control.label" dense
              @update:model-value="update(control.key, $event)" />
          </template>
          <template v-else>
            <label>{{ control.label }}<output>{{ displayValue(control) }}</output></label>
            <q-slider :model-value="settings[control.key]" :min="control.min" :max="control.max" :step="control.step || 1"
              :aria-label="control.label" @update:model-value="update(control.key, $event)" />
          </template>
        </div>
      </div>
    </q-expansion-item>
  </div>
</template>

<script>
import { computed, getCurrentInstance } from 'vue'

const color = (key, label) => ({ key, label, type: 'color' })
const range = (key, label, min, max, step = 1, unit = 'px') => ({ key, label, min, max, step, unit })
const select = (key, label, options) => ({ key, label, type: 'select', options })
const colorModes = [{ label: 'By data type', value: 'type' }, { label: 'Custom color', value: 'custom' }]
const groups = [
  { title: 'Backgrounds',
    icon: 'layers',
    controls: [
      color('backgroundColor', 'Body color'), range('backgroundOpacity', 'Body opacity', 0, 1, 0.01, '%'),
      color('titleBackgroundColor', 'Header color'), range('titleOpacity', 'Header opacity', 0, 1, 0.01, '%'),
      color('controlBackgroundColor', 'Control fill'), range('controlOpacity', 'Control opacity', 0, 1, 0.01, '%')
    ] },
  { title: 'Borders & selection',
    icon: 'crop_square',
    controls: [
      color('borderColor', 'Border color'), range('borderWidth', 'Border width', 0, 4, 0.5),
      color('selectedBorderColor', 'Selection color'), range('selectedBorderWidth', 'Selection width', 1, 6, 0.5),
      range('cornerRadius', 'Corner radius', 0, 20)
    ] },
  { title: 'Typography',
    icon: 'text_fields',
    controls: [
      color('textColor', 'Text color'), color('titleColor', 'Title color'),
      select('fontFamily', 'Font family', ['Arial', 'Segoe UI', 'sans-serif', 'monospace']),
      range('fontSize', 'Text size', 10, 18), range('titleFontSize', 'Title size', 11, 20)
    ] },
  { title: 'Connections & ports',
    icon: 'timeline',
    controls: [
      select('linkColorMode', 'Connection colors', colorModes), color('linkColor', 'Custom connection color'),
      range('linkWidth', 'Connection width', 0.5, 5, 0.25), range('linkOpacity', 'Connection opacity', 0.1, 1, 0.01, '%'),
      select('linkShape', 'Connection shape', [{ label: 'Curve', value: 'curve' }, { label: 'Straight', value: 'straight' }]),
      select('portColorMode', 'Port colors', colorModes), color('portColor', 'Custom port color'), range('portRadius', 'Port radius', 3, 8)
    ] },
  { title: 'Indicators',
    icon: 'tune',
    controls: [
      { key: 'showStatusLine', label: 'Execution status line', type: 'toggle' },
      { key: 'showStatusBadge', label: 'Execution status badge', type: 'toggle' },
      { key: 'showResizeHandle', label: 'Resize handle', type: 'toggle' }
    ] }
]

export default {
  name: 'NodeAppearancePanel',
  props: { settings: { type: Object, required: true }, storageError: Boolean },
  emits: ['update', 'reset'],
  setup (props, { emit }) {
    const instanceId = getCurrentInstance().uid
    const update = (key, value) => {
      emit('update', key, value)
      if (key === 'linkColor') emit('update', 'linkColorMode', 'custom')
      if (key === 'portColor') emit('update', 'portColorMode', 'custom')
    }
    return {
      groups,
      update,
      controlId: key => `node-appearance-${instanceId}-${key}`,
      displayValue: control => control.unit === '%' ? `${Math.round(props.settings[control.key] * 100)}%` : `${props.settings[control.key]} ${control.unit}`,
      connectionColor: computed(() => props.settings.linkColorMode === 'custom' ? props.settings.linkColor : '#566477'),
      portColor: computed(() => props.settings.portColorMode === 'custom' ? props.settings.portColor : '#566477')
    }
  }
}
</script>

<style scoped>
.node-appearance { padding: 12px; }
.node-appearance__intro { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.node-appearance__intro strong { display: block; font-size: 14px; }
.node-appearance__intro span { display: block; font-size: 11px; opacity: 0.75; margin-top: 3px; }
.node-appearance__preview { border: 1px solid #78909c40; border-radius: 10px; margin-bottom: 12px; background: linear-gradient(135deg, #dbe7ed80, #b0c6d340); }
.node-appearance__preview svg { display: block; width: 100%; }
.node-appearance__section { border: 1px solid #78909c40; border-radius: 8px; margin-bottom: 8px; overflow: hidden; }
.node-appearance__section :deep(.q-item) { padding: 10px 12px; }
.node-appearance__section :deep(.q-item__section--avatar) { min-width: 28px; padding-right: 8px; }
.node-appearance__section :deep(.q-icon) { font-size: 18px; }
.node-appearance__fields { padding: 4px 14px 14px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
.node-appearance__fields--paired { grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 16px; row-gap: 16px; }
.node-appearance__fields--paired .node-appearance__field:has(.node-appearance__swatch) { display: block; }
.node-appearance__field { min-width: 0; }
.node-appearance__field > label { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; margin-bottom: 4px; }
.node-appearance__field:has(.node-appearance__swatch) { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.node-appearance__field output { font-size: 11px; font-variant-numeric: tabular-nums; opacity: 0.8; }
.node-appearance__field :deep(.q-slider) { display: block; margin-top: -3px; margin-bottom: -5px; color: var(--node-accent, #3984c6); }
.node-appearance__swatch { display: flex; align-items: center; gap: 8px; }
.node-appearance__swatch input { width: 30px; height: 25px; min-width: 30px; border: 1px solid #78909c66; border-radius: 5px; background: transparent; padding: 2px; cursor: pointer; }
.node-appearance__swatch code { font-size: 11px; opacity: 0.8; min-width: 53px; }
</style>
