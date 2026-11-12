<template>
  <div class="viewport-overlay">
    <gpu-preference-notice :gpu="state.gpu" />
    <div v-if="state.status" class="viewport-status" role="status">{{ state.status }}</div>
    <div v-if="state.selection" ref="selection" class="viewport-selection" :style="position(state.selection)">
      <div v-for="row in state.selection.rows" :key="row[0]"><span>{{ row[0] }}: </span>{{ row[1] }}</div>
    </div>
    <div v-if="state.menu" ref="menu" class="viewport-menu" data-viewport-menu :style="position(state.menu)" @pointerdown.stop @contextmenu.prevent>
      <template v-for="(item, index) in state.menu.items" :key="index">
        <hr v-if="item.separator">
        <div v-else-if="item.heading" class="viewport-menu-heading">{{ item.heading }}</div>
        <button v-else type="button" :disabled="item.disabled" @click="choose(item)">{{ item.label }}</button>
      </template>
    </div>
    <section v-if="state.modeling" class="viewport-modeling" data-viewport-modeling @pointerdown.stop @contextmenu.prevent>
      <strong>Line · Modeling</strong>
      <label>Plane <select :value="state.modeling.plane" @change="action('plane', $event.target.value)"><option>XY</option><option>XZ</option><option>YZ</option></select></label>
      <div class="viewport-modeling-row">
        <label><input type="checkbox" :checked="state.modeling.gridSnap" @change="action('grid', $event.target.checked)">Grid</label>
        <input aria-label="Grid spacing" type="number" min="0.000001" step="any" :value="state.modeling.gridSize" @change="action('grid-size', Number($event.target.value))">
        <label><input type="checkbox" :checked="state.modeling.endpointSnap" @change="action('endpoint', $event.target.checked)">Endpoint</label>
      </div>
      <form class="viewport-modeling-row" @submit.prevent="submitPoint">
        <input v-for="(axis, index) in ['X', 'Y', 'Z']" :key="axis" v-model="coordinates[index]" type="number" step="any" :aria-label="axis + ' coordinate'" :placeholder="axis" required>
        <button type="submit">Set Point</button>
      </form>
      <div>{{ state.pointer || 'Pointer: —' }}</div>
    </section>
  </div>
</template>

<script>
import { ref, watch, nextTick } from 'vue'
import GpuPreferenceNotice from './GpuPreferenceNotice.vue'

export default {
  name: 'ViewportOverlay',
  components: { GpuPreferenceNotice },
  props: { state: { type: Object, required: true } },
  emits: ['action'],
  setup (props, { emit }) {
    const menu = ref(null)
    const selection = ref(null)
    const coordinates = ref(['', '', ''])
    const position = value => ({ left: value.x + 'px', top: value.y + 'px' })
    const clamp = element => {
      if (!element) return
      const rect = element.getBoundingClientRect()
      element.style.left = Math.max(6, Math.min(rect.left, window.innerWidth - rect.width - 6)) + 'px'
      element.style.top = Math.max(6, Math.min(rect.top, window.innerHeight - rect.height - 6)) + 'px'
    }
    watch(() => [props.state.menu, props.state.selection], async () => { await nextTick(); clamp(menu.value); clamp(selection.value) })
    const action = (name, value) => emit('action', { type: 'modeling', name, value })
    const choose = item => { emit('action', item); emit('action', { type: 'hide-menu' }) }
    const submitPoint = () => { action('coordinates', coordinates.value.map(Number)); coordinates.value = ['', '', ''] }
    return { menu, selection, coordinates, position, action, choose, submitPoint }
  }
}
</script>

<style scoped>
.viewport-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 1000; font: 12px/1.4 Arial, sans-serif; color: #eef4f7; }
.viewport-status { position: absolute; top: 30px; left: 12px; color: #f0a45d; }
.viewport-selection { position: absolute; white-space: nowrap; text-shadow: 0 1px 3px #000; }
.viewport-selection span, .viewport-menu-heading { color: #73e8ff; }
.viewport-menu, .viewport-modeling { position: absolute; pointer-events: auto; border: 1px solid #ffffff2e; border-radius: 5px; background: #23282eb8; backdrop-filter: blur(8px); box-shadow: 0 5px 18px #0006; padding: 7px; }
.viewport-menu { min-width: 210px; max-width: 320px; max-height: 360px; overflow-y: auto; }
.viewport-menu button { display: block; width: 100%; border: 0; background: transparent; color: inherit; text-align: left; padding: 7px 9px; cursor: pointer; border-radius: 3px; }
.viewport-menu button:hover:enabled { background: #40c4ff2e; }
.viewport-menu button:disabled { color: #788087; cursor: default; }
.viewport-menu hr { border: 0; border-top: 1px solid #ffffff24; }
.viewport-menu-heading { padding: 4px 9px; text-transform: uppercase; font-size: 11px; }
.viewport-modeling { left: 12px; bottom: 12px; width: 280px; display: grid; gap: 8px; }
.viewport-modeling label, .viewport-modeling-row { display: flex; align-items: center; gap: 6px; }
.viewport-modeling input:not([type=checkbox]), .viewport-modeling select { min-width: 0; width: 56px; flex: 1; background: #0003; color: inherit; border: 1px solid #ffffff2e; border-radius: 3px; padding: 3px; }
.viewport-modeling button { white-space: nowrap; color: #eefcff; background: #31ccec24; border: 1px solid #31ccec8c; border-radius: 3px; padding: 4px; cursor: pointer; }
</style>
