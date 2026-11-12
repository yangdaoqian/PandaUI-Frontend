<template>
  <div class="display-settings">
    <div class="display-settings__heading">Display mode</div>
    <q-btn-toggle v-model="settings.model1.displayMode" spread no-caps unelevated toggle-color="primary"
      :options="modes" @update:model-value="$emit('visibility')" />

    <section v-if="mode !== 'wires'" class="display-settings__section">
      <div class="display-settings__heading">{{ mode === 'render' ? 'Render lighting' : 'Shading environment' }}</div>
      <div v-for="control in lighting" :key="control.key" class="display-settings__control">
        <label>{{ control.label }}<span>{{ modeSettings[control.key] }}</span></label>
        <q-slider v-model="modeSettings[control.key]" :min="control.min" :max="control.max" :step="control.step"
          :aria-label="control.label" @update:model-value="updateModeSettings" />
      </div>
      <div class="display-settings__actions">
        <q-btn flat dense no-caps icon="image" label="Environment map" @click="$emit('environment', mode, false)" />
        <q-btn flat dense icon="delete_outline" aria-label="Clear environment" @click="$emit('environment', mode, true)" />
      </div>
      <q-expansion-item v-if="mode === 'render'" dense label="Physical material">
        <div v-for="control in physical" :key="control.key" class="display-settings__control">
          <label>{{ control.label }}<span>{{ settings.renderSettings[control.key] }}</span></label>
          <q-slider v-model="settings.renderSettings[control.key]" :min="control.min" :max="control.max" :step="control.step"
            :aria-label="control.label" @update:model-value="$emit('render')" />
        </div>
      </q-expansion-item>
    </section>
    <section v-else class="display-settings__section display-settings__hint">Wireframe displays curves and edges without surface shading.</section>

    <section class="display-settings__section">
      <div class="display-settings__heading">Edges</div>
      <q-toggle v-model="settings.model1.edgesVisible" label="Surface edges" @update:model-value="$emit('visibility')" />
      <q-toggle v-model="settings.model1.nonSharpEdgesVisible" :disable="!settings.model1.edgesVisible"
        label="Smooth manifold edges" @update:model-value="$emit('visibility')" />
      <q-toggle v-model="settings.model1.meshEdgesVisible" label="Mesh geometry edges" @update:model-value="$emit('visibility')" />
      <q-toggle v-model="settings.model1.meshFaceEdgesVisible" label="Mesh triangle edges" @update:model-value="$emit('visibility')" />
      <div class="display-settings__control">
        <label>Edge width<span>{{ settings.edgeWidth }} px</span></label>
        <q-slider v-model="settings.edgeWidth" :min="1" :max="6" :step="1" aria-label="Edge width" @update:model-value="$emit('viewport')" />
      </div>
      <q-expansion-item dense label="Edge classification">
        <div class="display-settings__control">
          <label>Sharp edge threshold<span>{{ settings.sharpEdgeThreshold }}</span></label>
          <q-slider v-model="settings.sharpEdgeThreshold" :min="0" :max="1" :step="0.01" aria-label="Sharp edge threshold" @update:model-value="$emit('visibility')" />
        </div>
      </q-expansion-item>
    </section>

    <q-expansion-item class="display-settings__section" dense label="Points and grid">
      <div class="display-settings__control">
        <label>Point size<span>{{ settings.pointSize }} px</span></label>
        <q-slider v-model="settings.pointSize" :min="1" :max="64" :step="1" aria-label="Point size" @update:model-value="$emit('points')" />
      </div>
      <q-select v-model="settings.pointShape" dense outlined emit-value map-options label="Point shape" :options="pointShapes" @update:model-value="$emit('points')" />
      <q-toggle v-model="settings.showGrid" label="Grid" @update:model-value="$emit('viewport')" />
    </q-expansion-item>

    <q-expansion-item class="display-settings__section" dense label="Resolution and performance" default-opened>
      <q-toggle v-model="settings.viewportSettings.adaptive" label="Adaptive resolution" @update:model-value="$emit('viewport')" />
      <div class="display-settings__hint">Targets about 100 ms GPU time. Resolution adjusts between 60% and 100%, stays steady at 96–100 ms, and returns to full clarity when idle.</div>
      <div v-if="quality.width" class="display-settings__metrics">
        {{ quality.width }} × {{ quality.height }} px · {{ quality.pixelRatio.toFixed(2) }}×
        <span v-if="quality.milliseconds > 0">{{ quality.source === 'GPU' ? 'GPU render time' : 'CPU render time' }} · {{ quality.milliseconds.toFixed(1) }} ms</span>
        <span v-if="quality.drawCalls != null">{{ quality.drawCalls.toLocaleString() }} draw calls · {{ quality.triangles.toLocaleString() }} triangles</span>
        <span v-if="quality.callbackMs > 0">Browser frame interval · {{ quality.callbackMs.toFixed(1) }} ms</span>
      </div>
    </q-expansion-item>

    <q-expansion-item class="display-settings__section" dense label="Import and meshing">
      <div class="display-settings__hint">Mesh quality also controls curve and edge sampling. Changing quality regenerates both for open frontend 3DM files. Objects remain visible while processing.</div>
      <div class="display-settings__control">
        <q-select v-model="settings.meshPrecision" dense outlined emit-value map-options label="Mesh quality" :options="meshQualities" :loading="meshingBusy" />
      </div>
      <q-select v-model="settings.workerCount" dense outlined emit-value map-options label="Mesh workers"
        :options="[{ label: 'Automatic · CPU and memory', value: 0 }, { label: 'Single worker', value: 1 }, { label: 'Dual workers', value: 2 }, { label: '4 workers', value: 4 }, { label: '6 workers', value: 6 }, { label: '8 workers', value: 8 }]" />
    </q-expansion-item>

    <div class="display-settings__section display-settings__actions">
      <q-btn outline dense no-caps icon="save" label="Save local" @click="$emit('save')" />
      <q-btn outline dense no-caps icon="folder_open" label="Load local" @click="$emit('load')" />
      <q-btn flat dense no-caps icon="restart_alt" label="Reset" @click="$emit('reset')" />
    </div>
    <div v-if="message" class="display-settings__hint" role="status">{{ message }}</div>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { MESH_QUALITY_OPTIONS } from '../import/MeshQuality'

const shading = [
  ['skyLight', 'Sky light', 0, 1.5, 0.05], ['keyLight', 'Head light', 0, 2, 0.05],
  ['ambientLift', 'Ambient lift', 0, 0.25, 0.005], ['specularIntensity', 'Specular', 0, 1, 0.02],
  ['shininess', 'Sharpness', 1, 128, 1], ['environmentIntensity', 'Environment', 0, 1, 0.05]
]
const rendering = [
  ['environmentIntensity', 'Environment', 0, 2, 0.05], ['ambientLight', 'Ambient light', 0, 2, 0.05],
  ['keyLight', 'Key light', 0, 3, 0.05], ['fillLight', 'Fill light', 0, 2, 0.05]
]
const physical = [
  ['metalnessScale', 'Metalness scale', 0, 2, 0.05], ['roughnessScale', 'Roughness scale', 0.25, 2, 0.05],
  ['clearcoatBoost', 'Clearcoat boost', 0, 0.75, 0.025], ['clearcoatRoughness', 'Clearcoat roughness', 0, 1, 0.025],
  ['reflectivity', 'Reflectivity', 0, 1, 0.025]
]
const controls = definitions => definitions.map(([key, label, min, max, step]) => ({ key, label, min, max, step }))

export default {
  name: 'DisplaySettingsPanel',
  props: { viewmodel: { type: Object, required: true }, message: { type: String, default: '' }, meshingBusy: { type: Boolean, default: false } },
  emits: ['visibility', 'shading', 'render', 'environment', 'points', 'viewport', 'save', 'load', 'reset'],
  setup (props, { emit }) {
    const settings = computed(() => props.viewmodel)
    const mode = computed(() => settings.value.model1.displayMode)
    const quality = shallowRef({})
    const updateQuality = event => { quality.value = event.detail }
    onMounted(() => window.addEventListener('pandaui-viewport-quality', updateQuality))
    onUnmounted(() => window.removeEventListener('pandaui-viewport-quality', updateQuality))
    return {
      settings,
      meshQualities: MESH_QUALITY_OPTIONS,
      mode,
      quality,
      modes: [{ label: 'Wires', value: 'wires' }, { label: 'Shading', value: 'shading' }, { label: 'Render', value: 'render' }],
      pointShapes: ['Square', 'Circle', 'Cross', 'Diamond'].map(label => ({ label, value: label.toLowerCase() })),
      modeSettings: computed(() => mode.value === 'render' ? settings.value.renderSettings : settings.value.shadingSettings),
      lighting: computed(() => controls(mode.value === 'render' ? rendering : shading)),
      physical: controls(physical),
      updateModeSettings: () => emit(mode.value === 'render' ? 'render' : 'shading')
    }
  }
}
</script>

<style scoped>
.display-settings { padding: 12px; font-size: 12px; color: #e2ecf4; }
.display-settings__heading { font-size: 12px; font-weight: 600; letter-spacing: 0.03em; color: #a9d3eb; margin-bottom: 10px; }
.display-settings__section { border-top: 1px solid rgba(158, 195, 222, 0.25); margin-top: 14px; padding-top: 12px; }
.display-settings__control { margin: 10px 4px 0; }
.display-settings__control label { display: flex; justify-content: space-between; gap: 8px; }
.display-settings__control label span { color: #a9d3eb; font-variant-numeric: tabular-nums; }
.display-settings__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.display-settings__hint { color: #b7c8d6; line-height: 1.5; margin: 6px 0 10px; }
.display-settings__metrics { margin-top: 10px; font-variant-numeric: tabular-nums; color: #a9d3eb; }
.display-settings__metrics span { display: block; margin-top: 4px; }
.display-settings :deep(.q-toggle) { display: flex; }
.display-settings :deep(.q-field) { margin: 8px 0; }
.display-settings :deep(.q-expansion-item__content) { padding: 0 4px 4px; }
.display-settings :deep(.q-item) { padding: 4px 0; }
</style>
