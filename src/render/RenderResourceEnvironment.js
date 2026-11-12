import * as THREE from 'three'
import RenderResourceScope from './RenderResourceScope'

function captureRenderer (renderer) {
  if (!renderer.getRenderTarget) return () => {} // Headless adapter boundary.
  const properties = {}
  for (const key of ['autoClear', 'autoClearColor', 'autoClearDepth', 'autoClearStencil', 'toneMapping', 'toneMappingExposure', 'outputEncoding', 'clippingPlanes', 'localClippingEnabled']) properties[key] = renderer[key]
  const target = renderer.getRenderTarget()
  const face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel()
  const viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4())
  const scissorTest = renderer.getScissorTest()
  const color = renderer.getClearColor().clone(), alpha = renderer.getClearAlpha()
  const renderList = renderer.getRenderList(), renderState = renderer.getRenderState()
  const xr = renderer.xr.enabled
  renderer.xr.enabled = false
  renderer.autoClear = renderer.autoClearColor = renderer.autoClearDepth = renderer.autoClearStencil = true
  renderer.toneMapping = THREE.NoToneMapping
  renderer.outputEncoding = THREE.LinearEncoding
  renderer.clippingPlanes = []
  renderer.localClippingEnabled = false
  renderer.setScissorTest(false)
  return () => {
    Object.assign(renderer, properties)
    renderer.xr.enabled = xr
    renderer.setClearColor(color, alpha)
    renderer.setViewport(viewport)
    renderer.setScissor(scissor)
    renderer.setScissorTest(scissorTest)
    renderer.setRenderTarget(target, face, mip)
    renderer.setRenderList(renderList)
    renderer.setRenderState(renderState)
  }
}

// Z-up, linear radiance. The same scene supplies lighting and the PMREM backdrop.
export function createResourceEnvironmentScene (settings, scope) {
  const studio = settings.preset === 'studio'
  const scene = new THREE.Scene()
  const material = scope.own(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(settings.topColor ?? (studio ? '#c4ccda' : '#8bc6ff')).convertSRGBToLinear() },
      bottomColor: { value: new THREE.Color(settings.bottomColor ?? (studio ? '#535866' : '#515445')).convertSRGBToLinear() }
    },
    vertexShader: 'varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // PMREM.fromScene in r120 captures into RGBE8, not a linear float target.
    // Encode radiance with the active target encoding before PMREM decodes it.
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 direction;
      void main() {
        float h = smoothstep(-0.5, 0.9, normalize(direction).z);
        gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        #include <encodings_fragment>
      }`
  }))
  scene.add(new THREE.Mesh(scope.own(new THREE.SphereBufferGeometry(40, 32, 16)), material))
  if (studio) {
    const geometry = scope.own(new THREE.PlaneBufferGeometry(1, 1))
    for (const [position, size, brightness] of [
      [[-8, -4, 10], [8, 12], 8], [[9, 3, 6], [5, 9], 5], [[0, 8, 14], [10, 5], 6]
    ]) {
      const panel = new THREE.Mesh(geometry, scope.own(new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(brightness), side: THREE.DoubleSide })))
      panel.position.fromArray(position)
      panel.scale.set(size[0], size[1], 1)
      panel.lookAt(0, 0, 0)
      scene.add(panel)
    }
  }
  return scene
}

export function createResourceSkyTexture (settings) {
  const width = 256, height = 128
  const pixels = new Uint8Array(width * height * 4)
  const top = new THREE.Color(settings.topColor ?? '#8bc6ff').convertSRGBToLinear()
  const bottom = new THREE.Color(settings.bottomColor ?? '#515445').convertSRGBToLinear()
  const color = new THREE.Color()
  for (let y = 0; y < height; y++) {
    const latitude = ((y + 0.5) / height - 0.5) * Math.PI
    for (let x = 0; x < width; x++) {
      const longitude = ((x + 0.5) / width - 0.5) * 2 * Math.PI
      const z = Math.cos(latitude) * Math.sin(longitude)
      const h = THREE.MathUtils.smoothstep(z, -0.5, 0.9)
      color.copy(bottom).lerp(top, h)
      const index = (y * width + x) * 4
      pixels[index] = Math.round(color.r * 255)
      pixels[index + 1] = Math.round(color.g * 255)
      pixels[index + 2] = Math.round(color.b * 255)
      pixels[index + 3] = 255
    }
  }
  // DataTexture provides an equirectangular image without a DOM/canvas dependency.
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.encoding = THREE.LinearEncoding
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export async function loadResourceEnvironment (settings, scope, { renderer, rgbeLoader, createPMREM, createCubeTarget }) {
  if (!settings) return { texture: null, background: null }
  if (!['studio', 'sky', 'hdri'].includes(settings.preset)) throw new Error(`Unknown environment preset: ${settings.preset}`)
  if (!renderer) throw new Error('An environment requires a WebGLRenderer')
  const temporary = new RenderResourceScope()
  let source
  let generator
  let restore = () => {}
  try {
    if (settings.preset === 'hdri') source = await scope.load(rgbeLoader, settings.url)
    if (scope.closed) return { texture: null, background: null }
    restore = captureRenderer(renderer)
    generator = createPMREM(renderer)
    let target
    if (source) {
      source.mapping = THREE.EquirectangularReflectionMapping
      target = generator.fromEquirectangular(source)
    } else {
      target = generator.fromScene(createResourceEnvironmentScene(settings, temporary), 0.04, 0.1, 100)
    }
    scope.own(target)
    let background = null
    if (settings.background) {
      if (settings.preset === 'studio') {
        background = new THREE.Color(settings.bottomColor ?? '#535866').convertSRGBToLinear()
      } else {
        if (!source) source = scope.own(createResourceSkyTexture(settings))
        source.mapping = THREE.EquirectangularReflectionMapping
        const cube = scope.own(createCubeTarget(Math.min(512, Math.max(16, Math.floor((source.image?.height || 256) / 2)))))
        cube.fromEquirectangularTexture(renderer, source)
        cube.texture.mapping = THREE.CubeReflectionMapping
        background = cube.texture
      }
    }
    // IBL always uses PMREM; the visible backdrop is never the packed atlas.
    return { texture: target.texture, background }
  } finally {
    generator?.dispose()
    temporary.dispose()
    if (source && !settings.background) scope.release(source)
    restore()
  }
}
