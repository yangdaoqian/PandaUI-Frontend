import * as THREE from 'three'
import { DEFAULT_SHADING_SETTINGS } from './DisplayMaterialSettings'

export function ensureShadingHeadlight (scene, camera, color, intensity) {
  let light = camera.getObjectByName('Shading headlight')
  if (!light) {
    light = new THREE.DirectionalLight(color, intensity)
    light.name = 'Shading headlight'
    light.position.set(0, 0, 1)
    camera.add(light)
    camera.add(light.target)
  }
  light.color.set(color)
  light.intensity = intensity
  if (camera.parent !== scene) scene.add(camera)
  return light
}

// Render uses a dedicated studio rig. Shading continues to use the original
// viewport headlight managed by DisplayPipeline.
export function createDisplayLighting () {
  const shading = new THREE.Group()
  shading.name = 'Shading lights'
  const shadingSky = new THREE.HemisphereLight(0xffffff, 0x8f969c, DEFAULT_SHADING_SETTINGS.skyLight)
  shadingSky.name = 'Shading sky light'
  shading.add(shadingSky)

  const render = new THREE.Group()
  render.name = 'Render lights'
  render.visible = false
  const renderAmbient = new THREE.HemisphereLight(0xe7f0ff, 0x17202a, 0.35)
  renderAmbient.name = 'Render ambient light'
  render.add(renderAmbient)
  const renderKey = new THREE.DirectionalLight(0xffffff, 0.85)
  renderKey.name = 'Render key light'
  renderKey.position.set(0.3, -0.5, 1)
  renderKey.target.name = 'Render key target'
  render.add(renderKey.target)
  render.add(renderKey)
  const renderFill = new THREE.DirectionalLight(0x9fc4ff, 0.2)
  renderFill.name = 'Render fill light'
  renderFill.position.set(-0.8, 0.4, 0.35)
  render.add(renderFill)

  return { shading, render }
}
