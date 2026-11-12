import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import RasterRenderer, { saveState, restoreState } from './RasterRenderer'
import { applyMaterialSurface } from './MaterialSurface'

// Borrow the viewport's renderer and GPU textures. Only the small preview
// scene, targets and CPU thumbnail are owned here; never allocate a context.
export default class MaterialPreview {
  constructor (renderer) {
    this.renderer = renderer
    this.canvas = document.createElement('canvas'); this.canvas.width = 320; this.canvas.height = 240
    this.pixels = new Uint8Array(320 * 240 * 4)
    this.raster = new RasterRenderer(renderer)
    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 320 / 240, 0.1, 100)
    this.camera.up.set(0, 1, 0); this.camera.position.set(3.3, 1.7, 4.5); this.camera.lookAt(0, 0, 0)
    this.sphere = new THREE.Mesh(new THREE.SphereBufferGeometry(1, 64, 40), new THREE.MeshPhysicalMaterial())
    this.sphere.rotation.y = 0.6; this.scene.add(this.sphere)
    const pixels = new Uint8Array([230, 230, 230, 255, 40, 70, 100, 255, 40, 70, 100, 255, 230, 230, 230, 255])
    this.checker = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat)
    this.checker.wrapS = this.checker.wrapT = THREE.RepeatWrapping; this.checker.repeat.set(8, 8)
    this.checker.encoding = THREE.sRGBEncoding; this.checker.needsUpdate = true
    this.floor = new THREE.Mesh(new THREE.PlaneBufferGeometry(20, 20), new THREE.MeshStandardMaterial({ map: this.checker, roughness: 0.65 }))
    this.floor.rotation.x = -Math.PI / 2; this.floor.position.y = -1.05; this.scene.add(this.floor)
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(3, 5, 4); this.scene.add(light)
    this.scene.add(new THREE.HemisphereLight(0xeaf1ff, 0x38342b, 0.6))
    const state = saveState(renderer), room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer)
    try {
      renderer.clippingPlanes = []; renderer.setScissorTest(false)
      this.environment = pmrem.fromScene(room)
    } finally {
      const resources = new Set()
      room.traverse(object => { resources.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => resources.add(material)) })
      resources.forEach(resource => resource?.dispose()); pmrem.dispose(); restoreState(renderer, state)
    }
  }

  render (source) {
    const previous = this.sphere.material
    const reusable = previous.type === source.type && !!previous.userData.pandaSurface === !!source.userData.pandaSurface
    const material = this.sphere.material = reusable ? previous.copy(source) : source.clone()
    material.needsUpdate = true
    // Sphere radius is one unit. Thickness remains the actual model-unit value.
    material.envMap = this.environment.texture; material.envMapIntensity = 1
    material.vertexColors = false; material.clippingPlanes = null
    applyMaterialSurface(material)
    const state = saveState(this.renderer)
    try {
      this.renderer.clippingPlanes = []; this.renderer.outputEncoding = THREE.sRGBEncoding
      const output = this.raster.render({ scenes: [this.scene],
        camera: this.camera,
        width: 320,
        height: 240,
        background: new THREE.Color('#354052'),
        environment: this.environment.texture,
        effects: { exposure: 1 },
        quality: 'high' })
      if (!output.texture) throw new Error(output.status.reason || 'Material preview is unavailable.')
      this.renderer.readRenderTargetPixels(output.target, 0, 0, 320, 240, this.pixels)
      const context = this.canvas.getContext('2d'), pixels = context.createImageData(320, 240)
      for (let y = 0; y < 240; y++) pixels.data.set(this.pixels.subarray((239 - y) * 1280, (240 - y) * 1280), y * 1280)
      context.putImageData(pixels, 0, 0)
      return this.canvas.toDataURL('image/png')
    } finally { if (!reusable) previous.dispose(); restoreState(this.renderer, state) }
  }

  dispose () {
    this.raster.dispose(); this.environment.dispose(); this.checker.dispose()
    for (const object of [this.sphere, this.floor]) { object.geometry.dispose(); object.material.dispose() }
    this.canvas.width = this.canvas.height = 1; this.pixels = null
  }
}
