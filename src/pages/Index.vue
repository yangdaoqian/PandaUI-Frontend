<template>
  <q-page class="flex flex-center">
    <div id="canvasParent" class="absolute-full" />
    <ViewportFps />
  </q-page>
</template>

<script>
import PandaUIApp from '../PandaUIApp'
import ViewportFps from '../components/ViewportFps.vue'
import { ref, onMounted, onBeforeMount, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
export default {
  components: { ViewportFps },
  setup () {
    const viewmodel = ref(PandaUIApp._viewmodel)

    const route = useRoute()

    const docExists = computed(() => {
      // does not recompute
      return viewmodel.value.model1.exists
    })

    onBeforeMount(() => {
      PandaUIApp.registerWebGlElement('canvasParent')
    })

    onMounted(() => {
      PandaUIApp.initializeThreeScene()
      if (route.query && route.query['url']) {
        openURL(route.query['url'])
      }
    })

    function openURL (url) {
      fetch(url).then(async res => {
        if (res.status === 200) {
          const buffer = await res.arrayBuffer()
          PandaUIApp.openFile(url, new Uint8Array(buffer))
        } else {
          alert(`Error retrieving resource.\n${res.status}`)
        }
      }).catch(e => alert(`Error:\n${e}`))
    }

    watch(route, (to, from) => {
      if (to.query['url']) {
        openURL(to.query['url'])
      }
    })

    onUnmounted(() => {
      // 组件卸载时的清理工作
      // 注意：Node Editor相关资源现在由MainLayout.vue管理
    })

    return {
      viewmodel,
      docExists,
      openURL
    }
  }
}
</script>

<style scoped>
  .zoom-controls {
    position: absolute;
    bottom: 20px;
    right: 20px;
    z-index: 10;
  }
  .node-editor-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.58);
    backdrop-filter: blur(10px);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }
  .node-editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 20px;
    background: rgba(34, 34, 34, 0.68);
    backdrop-filter: blur(10px);
    color: white;
  }
  .node-editor-title {
    font-size: 18px;
    font-weight: bold;
  }
  .node-editor-close {
    background: none;
    border: none;
    color: white;
    font-size: 24px;
    cursor: pointer;
    padding: 5px;
  }
  .node-editor-close:hover {
    color: #f00;
  }
  .node-editor-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }
  .node-editor-content canvas {
    width: 100% !important;
    height: 100% !important;
  }
</style>
