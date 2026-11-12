<template>
  <section v-if="visible" class="gpu-notice" role="dialog" aria-label="Graphics performance" @pointerdown.stop @contextmenu.prevent>
    <strong>{{ help ? 'Choose a high-performance GPU' : 'Use a high-performance GPU?' }}</strong>
    <p>Current adapter: {{ gpu.renderer }}</p>
    <p v-if="!help">This viewport is using {{ gpu.kind === 'software' ? 'software rendering' : 'integrated graphics' }}. A dedicated GPU may improve large-scene rendering.</p>
    <template v-else>
      <p>Windows: Settings → System → Display → Graphics. Add your browser, select Options → High performance, then save.</p>
      <p>Save your work and fully restart the browser. This website cannot switch the system GPU directly. On other systems, use your graphics or browser settings.</p>
      <a href="ms-settings:display-advancedgraphics">Open Windows graphics settings</a>
    </template>
    <div><button v-if="!help" type="button" @click="help = true">Choose high performance</button><button type="button" @click="dismiss">{{ help ? 'Close' : 'Keep current GPU' }}</button></div>
  </section>
</template>
<script>
import { computed, ref } from 'vue'
export default {
  props: { gpu: { type: Object, default: null } },
  setup (props) {
    const dismissed = ref(''), help = ref(false)
    const visible = computed(() => props.gpu && ['integrated', 'software'].includes(props.gpu.kind) && dismissed.value !== props.gpu.renderer)
    const dismiss = () => { dismissed.value = props.gpu.renderer; help.value = false }
    return { visible, help, dismiss }
  }
}
</script>
<style scoped>
.gpu-notice { position: absolute; right: 20px; top: 52px; width: min(390px, calc(100vw - 40px)); padding: 18px; border: 1px solid #ffffff40; border-radius: 12px; color: #eef4fa; background: #18222ee8; backdrop-filter: blur(14px); pointer-events: auto; box-shadow: 0 12px 40px #0005; }
.gpu-notice p { margin: 10px 0; overflow-wrap: anywhere; }
.gpu-notice div { display: flex; gap: 8px; margin-top: 14px; }
.gpu-notice button { color: inherit; background: #226a8c; border: 1px solid #ffffff40; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
.gpu-notice a { color: #7edbff; }
</style>
