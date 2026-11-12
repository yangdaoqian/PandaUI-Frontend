<template>
  <div ref="host" class="login-scene" aria-hidden="true" />
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import SceneUtilities from '../SceneUtilities'
import DisplayMode from '../DisplayMode'

export default {
  setup () {
    const host = ref(null)
    let renderer
    let scene
    let camera
    let observer
    let frame
    const viewportSize = new THREE.Vector2()

    function draw () {
      frame = null
      if (!renderer || !host.value) return
      const width = Math.max(1, host.value.clientWidth)
      const height = Math.max(1, host.value.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
      renderer.setSize(width, height)
      renderer.getDrawingBufferSize(viewportSize)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }

    function requestDraw () {
      if (frame == null) frame = requestAnimationFrame(draw)
    }

    function dispose () {
      observer?.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', requestDraw)
      if (scene) {
        scene.traverse(object => {
          object.geometry?.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => material?.dispose())
        })
        while (scene.children.length) scene.remove(scene.children[0])
        scene = null
      }
      if (renderer) {
        renderer.dispose()
        renderer.forceContextLoss()
        renderer.domElement.remove()
        renderer = null
      }
    }

    onMounted(() => {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true })
        host.value.appendChild(renderer.domElement)
        scene = new THREE.Scene()
        scene.background = new THREE.Color(DisplayMode.defaultModes()[1].backgroundColor)
        const grid = SceneUtilities.createGrid()
        // Give the login viewport its own shader viewport size; do not modify
        // the main document renderer's shared uniforms or scene state.
        grid.traverse(object => {
          const uniform = object.material?.uniforms?.viewport_size
          if (uniform) uniform.value = viewportSize
        })
        scene.add(grid)
        camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500)
        camera.up.set(0, 0, 1)
        camera.position.set(30, -42, 32)
        camera.lookAt(0, 0, 0)
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(requestDraw)
          observer.observe(host.value)
        }
        window.addEventListener('resize', requestDraw)
        draw()
      } catch (error) {
        dispose()
        console.warn('The sign-in 3D background is unavailable:', error.message)
      }
    })
    onBeforeUnmount(dispose)
    return { host }
  }
}
</script>

<style scoped>
.login-scene { position: fixed; inset: 0; z-index: 0; pointer-events: none; background: #9da3aa; }
.login-scene :deep(canvas) { display: block; width: 100%; height: 100%; }
.login-scene::after {
  content: ''; position: absolute; inset: 0; opacity: 0.75;
  background: radial-gradient(ellipse at 12% 15%, rgb(112 190 240 / 28%), transparent 60%), radial-gradient(ellipse at 90% 85%, rgb(135 220 187 / 26%), transparent 60%), linear-gradient(135deg, rgb(234 245 255 / 10%), rgb(216 199 246 / 16%) 60%, rgb(235 255 244 / 10%));
  backdrop-filter: blur(4px) saturate(90%); -webkit-backdrop-filter: blur(4px) saturate(90%);
}
</style>
