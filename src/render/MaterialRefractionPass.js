import * as THREE from 'three'
import { applyMaterialSurface } from './MaterialSurface'

export default class MaterialRefractionPass {
  constructor () { this.target = null }

  prepare (renderer, scene, camera, width, height, type) {
    const materials = new Set()
    scene.traverseVisible(object => {
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (material?.isMeshPhysicalMaterial && material.visible && material.userData.pandaSurface && material.transmission > 0) materials.add(material)
      }
    })
    if (!materials.size) { this.target?.dispose(); this.target = null; return }
    if (!this.target) this.target = new THREE.WebGLRenderTarget(width, height, { type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat })
    this.target.setSize(width, height)
    const previous = renderer.getRenderTarget()
    try {
      // Exclude glass only from the background pass; preserve opaque array slots.
      for (const material of materials) material.visible = false
      renderer.setRenderTarget(this.target); renderer.clear(); renderer.render(scene, camera)
    } finally {
      for (const material of materials) material.visible = true
      renderer.setRenderTarget(previous)
    }
    for (const material of materials) {
      const uniforms = applyMaterialSurface(material)
      uniforms.pandaScene.value = this.target.texture
      uniforms.pandaSceneReady.value = 1
      uniforms.pandaProjection.value.copy(camera.projectionMatrix)
    }
    this.active = materials
  }

  finish () {
    for (const material of this.active || []) {
      const uniforms = applyMaterialSurface(material)
      uniforms.pandaSceneReady.value = 0; uniforms.pandaScene.value = null
    }
    this.active = null
  }

  dispose () { this.finish(); this.target?.dispose(); this.target = null }
}
