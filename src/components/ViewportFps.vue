<template>
  <div class="viewport-fps" :class="{ 'viewport-fps--slow': slow }" aria-label="Scene frame rate">
    <span class="viewport-fps__label">{{ quality.mode === 'on-demand' ? 'Updates/s' : 'FPS' }}</span>
    <span class="viewport-fps__value">{{ fps }}</span>
    <span v-if="quality.idle" class="viewport-fps__detail">Idle</span>
    <span v-else-if="quality.mode === 'on-demand'" class="viewport-fps__detail">On demand</span>
    <span v-if="!quality.idle && quality.scale < 0.995" class="viewport-fps__detail">{{ Math.round(quality.scale * 100) }}% res</span>
    <span v-if="!quality.idle && quality.cpuMs > 0" class="viewport-fps__detail">CPU {{ quality.cpuMs.toFixed(1) }} ms</span>
    <span v-if="!quality.idle && Number.isFinite(quality.gpuMs)" class="viewport-fps__detail">GPU {{ quality.gpuMs.toFixed(1) }} ms</span>
  </div>
</template>

<script>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue'

export default {
  name: 'ViewportFps',
  setup () {
    const quality = shallowRef({ fps: null, idle: true, scale: 1, targetGpuMs: 100 })
    const updateQuality = event => { quality.value = event.detail }
    onMounted(() => window.addEventListener('pandaui-viewport-quality', updateQuality))
    onUnmounted(() => window.removeEventListener('pandaui-viewport-quality', updateQuality))
    return {
      quality,
      fps: computed(() => quality.value.idle ? '—' : (Number.isFinite(quality.value.fps) ? quality.value.fps.toFixed(1) : '…')),
      slow: computed(() => quality.value.mode === 'continuous' && (quality.value.gpuMs ?? quality.value.cpuMs) > (quality.value.targetGpuMs ?? 100))
    }
  }
}
</script>

<style scoped>
.viewport-fps {
  position: absolute;
  bottom: 12px;
  left: 12px;
  z-index: 1001;
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 9px;
  background: transparent;
  color: #b4eddc;
  font: 12px/1.4 system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  user-select: none;
}
.viewport-fps__label, .viewport-fps__detail { color: #c5d3df; font-size: 10px; }
.viewport-fps__value { min-width: 4ch; font-weight: 600; }
.viewport-fps--slow .viewport-fps__value { color: #ffd18a; }
</style>
