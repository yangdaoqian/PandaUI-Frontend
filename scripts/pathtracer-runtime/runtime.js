// Isolated Three r170 / three-gpu-pathtracer 0.0.23 boundary. Never accept live
// objects from the application's older Three renderer. All colors are linear
// RGB arrays except CSS colors in environment/effects configuration.
import * as THREE from 'three'
import { WebGLPathTracer, DenoiseMaterial } from 'three-gpu-pathtracer'
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js'
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { CubeToEquirectGenerator } from 'three-gpu-pathtracer/src/utils/CubeToEquirectGenerator.js'
import { RenderTarget2DArray } from 'three-gpu-pathtracer/src/uniforms/RenderTarget2DArray.js'

const DEFAULTS = { samples: 128, bounces: 8, resolutionScale: 1, exposure: 1, denoise: true, denoiseStrength: 0.5 }
const MAPS = ['map', 'alphaMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'transmissionMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'specularColorMap', 'specularIntensityMap', 'sheenColorMap', 'sheenRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap']
const SCALARS = ['metalness', 'roughness', 'opacity', 'alphaTest', 'transmission', 'ior', 'clearcoat', 'clearcoatRoughness', 'sheen', 'sheenRoughness', 'specularIntensity', 'emissiveIntensity', 'thickness', 'attenuationDistance', 'iridescence', 'iridescenceIOR']
const COLORS = ['color', 'emissive', 'attenuationColor', 'specularColor', 'sheenColor']
const pause = () => new Promise(resolve => setTimeout(resolve, 0))
const cancelled = () => Object.assign(new Error('Path-tracing scene was superseded or disposed.'), { name: 'AbortError' })
function number (v, fallback, min = -Infinity, max = Infinity) {
  v = v == null ? fallback : v
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`Invalid numeric path-tracing value: ${v}`)
  return v
}
function values (v, count, name) {
  if ((!Array.isArray(v) && !ArrayBuffer.isView(v)) || (count != null && v.length !== count)) throw new Error(`Invalid ${name} array`)
  for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) throw new Error(`Nonfinite ${name}`)
  return v
}
function color (v, fallback = [1, 1, 1]) {
  if (typeof v === 'string' || typeof v === 'number') return new THREE.Color(v)
  return new THREE.Color().fromArray(values(v ?? fallback, 3, 'linear color'))
}
function disposeAll (items) { for (const item of items) item?.dispose?.() }
function scope () {
  const items = new Set()
  return { own (v) { items.add(v); return v }, dispose () { disposeAll(items); items.clear() } }
}
function warnOnce (warnings, message) { if (!warnings.includes(message)) warnings.push(message) }

function makeCamera (d = {}) {
  const near = number(d.near, 0.001, 0), far = number(d.far, 1e9, near + Number.EPSILON)
  let camera
  if ((d.type || 'perspective') === 'perspective') {
    camera = new THREE.PerspectiveCamera(number(d.fov, 45, 0.01, 179), number(d.aspect, 1, 1e-8), near, far)
  } else if (d.type === 'orthographic') {
    const left = number(d.left, -1), right = number(d.right, 1), bottom = number(d.bottom, -1), top = number(d.top, 1)
    if (right <= left || top <= bottom) throw new Error('Invalid orthographic bounds')
    camera = new THREE.OrthographicCamera(left, right, top, bottom, near, far)
  } else throw new Error(`Unsupported camera: ${d.type}`)
  camera.position.fromArray(values(d.position ?? [4, -6, 4], 3, 'camera position'))
  camera.up.fromArray(values(d.up ?? [0, 0, 1], 3, 'camera up'))
  const target = new THREE.Vector3().fromArray(values(d.target ?? [0, 0, 0], 3, 'camera target'))
  const direction = target.clone().sub(camera.position)
  if (!direction.lengthSq() || !camera.up.lengthSq() || !direction.clone().cross(camera.up).lengthSq()) throw new Error('Degenerate camera basis')
  camera.lookAt(target); camera.updateMatrixWorld(true)
  return camera
}

// Shader copy and DenoiseMaterial both consume LINEAR accumulation, then apply
// ACES and sRGB exactly once on the default framebuffer. Never tonemap the
// accumulation target or feed an already tonemapped canvas to the denoiser.
function copyMaterial () {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform sampler2D map; varying vec2 vUv;
      void main(){gl_FragColor=texture2D(map,vUv);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
  })
}

// 0.0.23 cleanup audit: WebGLPathTracer.dispose refers to nonexistent
// _renderQuad, leaks low-res renderer, uniforms, generator and fullscreen
// materials. RenderTarget2DArray.texture hides its owning render target. Replace
// those targets before first nonempty scene upload, retain the owners explicitly.
function prepareTracer (renderer, onError) {
  // SobolNumberMapGenerator also omits its one-shot shader material disposal.
  // Capture only those private constructor draws on this owned renderer.
  const render = renderer.render
  renderer.render = function (object, ...args) {
    try { return render.call(this, object, ...args) } finally {
      // Match the shader, not constructor.name (production minification renames it).
      if (object.material?.fragmentShader?.includes('generateSobolPoint( index )')) object.material.dispose()
    }
  }
  let tracer
  try { tracer = new WebGLPathTracer(renderer) } finally { renderer.render = render }
  tracer.renderToCanvas = false; tracer.rasterizeScene = false
  tracer.dynamicLowRes = false; tracer.renderDelay = 0; tracer.fadeDuration = 0; tracer.minSamples = 0
  tracer.renderScale = 1; tracer.lowResScale = 1
  tracer.multipleImportanceSampling = true
  tracer._ownedArrays = []
  for (const pass of [tracer._pathTracer, tracer._lowResPathTracer]) {
    // Match Three's alphaMap green-channel convention. Upstream 0.0.23
    // incorrectly reads red; patch this pinned shader instance, not node_modules.
    const alphaSample = 'albedo.a *= texture2D( textures, vec3( uv, material.alphaMap ) ).x;'
    if (!pass.material.fragmentShader.includes(alphaSample)) throw new Error('Pinned path tracer alphaMap shader signature changed; review compatibility patch.')
    pass.material.fragmentShader = pass.material.fragmentShader.replace(alphaSample, alphaSample.replace(').x;', ').g;'))
    for (const key of ['textures', 'iesProfiles']) {
      // Empty constructor scene never uploads a layer or allocates these target
      // framebuffers. The unreachable empty target is then collectable.
      pass.material[key].dispose()
      const target = key === 'textures' ? new RenderTarget2DArray(1, 1) : new RenderTarget2DArray(360, 180, { type: THREE.HalfFloatType, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping })
      pass.material[key] = target.texture; tracer._ownedArrays.push(target)
    }
    pass.material.removeEventListener('recompilation', pass._compileFunction)
    pass._compileFunction = () => {
      const promise = Promise.resolve().then(() => pass._runtimeDisposed ? null : pass.compileMaterial())
      pass._compilePromise = promise
      promise.then(() => { if (pass._compilePromise === promise) pass._compilePromise = null }, error => {
        if (pass._compilePromise === promise) pass._compilePromise = null
        if (!pass._runtimeDisposed) onError(error)
      })
    }
    pass.material.addEventListener('recompilation', pass._compileFunction)
  }
  return tracer
}

function releaseTracer (tracer) {
  if (!tracer) return
  const disposed = new Set()
  const release = item => { if (item && !disposed.has(item)) { disposed.add(item); item.dispose?.() } }
  for (const pass of [tracer._pathTracer, tracer._lowResPathTracer]) {
    const material = pass.material
    pass._runtimeDisposed = true
    material.removeEventListener('recompilation', pass._compileFunction)
    for (const name of ['bvh', 'attributesArray', 'materialIndexAttribute', 'materials', 'envMapInfo', 'stratifiedTexture', 'stratifiedOffsetTexture']) release(material[name])
    release(material.lights?.tex)
    release(pass._blendQuad.material); release(material)
    pass.dispose() // targets, Sobol target, fullscreen geometry, render generator
  }
  for (const target of tracer._ownedArrays || []) { release(target.fsQuad.material); release(target) }
  release(tracer._quad.material); release(tracer._quad)
  for (const key of ['_internalBackground', '_colorBackground']) release(tracer[key])
  const generator = tracer._generator, staticGenerator = generator.staticGeometryGenerator
  release(generator.geometry)
  for (const geometry of staticGenerator._intermediateGeometry.values()) release(geometry)
  staticGenerator._intermediateGeometry.clear()
  release(staticGenerator._dummyMesh?.geometry); release(staticGenerator._dummyMesh?.material)
  staticGenerator.objects = []; staticGenerator._mergeOrder = []
  generator.bvh = null; tracer.scene = tracer._previousScene = tracer._materials = null
  tracer._previousEnvironment = tracer._previousBackground = null
}

// Avoid WorkerBase.generate's ignored .finally() rejection promise (0.8.3).
// Also make termination settle runTask, which otherwise leaves its promise pending.
function createWorker () {
  const worker = new GenerateMeshBVHWorker()
  worker.generate = function (...args) {
    if (this.running || !this.worker) return Promise.reject(new Error('BVH worker unavailable or busy'))
    this.running = true
    const promise = this.runTask(this.worker, ...args)
    return promise.then(value => { this.running = false; return value }, error => { this.running = false; throw error })
  }
  worker.stop = function () {
    if (!this.worker) return
    if (this.running) this.worker.onerror?.({ message: 'BVH generation cancelled.' })
    this.worker.onmessage = this.worker.onerror = this.worker.onmessageerror = null
    this.dispose()
  }
  return worker
}

async function loadTexture (d, owner, signal, maxSize) {
  if (!d || d.isCubeTexture) throw new Error('A material texture must be a 2D image, not a cubemap or PMREM atlas')
  if (d.channel > 0) throw new Error('Path tracer 0.0.23 supports material maps on UV0 only; UV1 maps require real-time rendering.')
  if (d.encoding != null && ![3000, 3001].includes(d.encoding)) throw new Error(`Unsupported legacy texture encoding ${d.encoding}`)
  let image = d.image, texture
  const data = d.data ?? image?.data
  if (data) {
    const width = d.width ?? image.width, height = d.height ?? image.height
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > maxSize || height > maxSize) throw new Error('Texture dimensions exceed GPU limits')
    let pixels = data.slice(), format = d.format ?? THREE.RGBAFormat
    // r120 RGBFormat (1022) no longer exists in r170: expand without mutating
    // the borrowed snapshot data. Float/half float retain their data type.
    if (format === 1022 || pixels.length === width * height * 3) {
      const expanded = new pixels.constructor(width * height * 4)
      const alpha = d.type === THREE.HalfFloatType ? THREE.DataUtils.toHalfFloat(1) : pixels instanceof Float32Array ? 1 : 255
      for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) { expanded[j] = pixels[i]; expanded[j + 1] = pixels[i + 1]; expanded[j + 2] = pixels[i + 2]; expanded[j + 3] = alpha }
      pixels = expanded; format = THREE.RGBAFormat
    }
    texture = owner.own(new THREE.DataTexture(pixels, width, height, format, d.type ?? (pixels instanceof Float32Array ? THREE.FloatType : THREE.UnsignedByteType)))
  } else {
    const url = d.url ?? (typeof image === 'string' ? image : null)
    if (url) {
      const response = await fetch(url, { signal }); if (!response.ok) throw new Error(`Texture request failed: HTTP ${response.status}`)
      image = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: d.flipY === false ? 'none' : 'flipY' })
      owner.own({ dispose: () => image.close() })
    }
    if (!image || !(image.width || image.videoWidth)) throw new Error('Texture has no readable source pixels; GPU-only textures cannot cross contexts.')
    if (image.width > maxSize || image.height > maxSize) throw new Error('Source texture exceeds GPU dimension limit')
    texture = owner.own(new THREE.Texture(image))
  }
  for (const key of ['wrapS', 'wrapT', 'magFilter', 'minFilter', 'flipY', 'generateMipmaps', 'premultiplyAlpha', 'unpackAlignment']) if (d[key] != null) texture[key] = d[key]
  texture.colorSpace = d.colorSpace || (d.encoding === 3001 ? THREE.SRGBColorSpace : THREE.NoColorSpace)
  for (const key of ['repeat', 'offset', 'center']) if (d[key]) texture[key].fromArray(values(d[key], 2, key))
  texture.rotation = d.rotation || 0
  if (d.matrix) {
    texture.matrix.fromArray(values(d.matrix, 9, 'texture matrix'))
    texture.matrixAutoUpdate = false
    // The pinned atlas generator forcibly calls updateMatrix after capture.
    // Preserve authored UV transforms, including shear, when that occurs.
    texture.updateMatrix = function () {}
  } else texture.updateMatrix()
  texture.needsUpdate = true
  if (signal.aborted) throw cancelled()
  return texture
}

// The upstream BSDF has no bumpMap. Convert scalar height to a tangent-space
// normal map using UV-space central differences. This is an explicit approximate
// height->normal conversion, not a world-space displacement/tessellation feature.
function bumpNormal (renderer, source, scale, owner) {
  const width = source.image.width, height = source.image.height
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: source }, texel: { value: new THREE.Vector2(1 / width, 1 / height) }, strength: { value: scale } },
    depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `uniform sampler2D map;uniform vec2 texel;uniform float strength;varying vec2 vUv;
      void main(){float dx=(texture2D(map,vUv+vec2(texel.x,0.)).r-texture2D(map,vUv-vec2(texel.x,0.)).r)/(2.*texel.x);
      float dy=(texture2D(map,vUv+vec2(0.,texel.y)).r-texture2D(map,vUv-vec2(0.,texel.y)).r)/(2.*texel.y);
      gl_FragColor=vec4(normalize(vec3(-dx*strength,-dy*strength,1.))*.5+.5,1.);}`
  })
  const quad = new FullScreenQuad(material), target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false })
  const previous = renderer.getRenderTarget(), previousTone = renderer.toneMapping
  try {
    renderer.toneMapping = THREE.NoToneMapping; renderer.setRenderTarget(target); quad.render(renderer)
    const pixels = new Uint8Array(width * height * 4)
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels)
    const texture = owner.own(new THREE.DataTexture(pixels, width, height))
    texture.wrapS = source.wrapS; texture.wrapT = source.wrapT
    texture.minFilter = texture.magFilter = THREE.LinearFilter
    texture.matrix.copy(source.matrix); texture.matrixAutoUpdate = false; texture.updateMatrix = function () {}
    texture.needsUpdate = true
    return texture
  } finally { renderer.setRenderTarget(previous); renderer.toneMapping = previousTone; target.dispose(); material.dispose(); quad.dispose() }
}

async function environmentTexture (settings, renderer, owner, signal, maxSize) {
  if (!settings || settings.preset === 'none') return null
  if (settings.preset === 'hdri' || settings.type === 'hdr') {
    const response = await fetch(settings.url, { signal }); if (!response.ok) throw new Error(`HDR environment request failed: HTTP ${response.status}`)
    const result = new RGBELoader().setDataType(THREE.FloatType).parse(await response.arrayBuffer())
    if (signal.aborted) throw cancelled()
    if (result.width > maxSize || result.height > maxSize) throw new Error('HDR environment exceeds GPU dimension limit')
    const texture = owner.own(new THREE.DataTexture(result.data, result.width, result.height, THREE.RGBAFormat, THREE.FloatType))
    texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.LinearSRGBColorSpace
    texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true
    return texture
  }
  const preset = settings.preset || 'studio'
  if (!['studio', 'automotive', 'sky'].includes(preset)) throw new Error(`Unsupported environment preset: ${preset}`)
  // Recreate PandaUI's Z-up studio room, then capture linear cubemap radiance;
  // never transfer the legacy renderer's PMREM GPU texture into this context.
  const temporary = scope(), room = new THREE.Scene(), automotive = preset === 'automotive'
  const top = color(settings.topColor ?? (automotive ? '#343945' : preset === 'studio' ? '#c4ccda' : '#8bc6ff'))
  const bottom = color(settings.bottomColor ?? (automotive ? '#11151c' : preset === 'studio' ? '#535866' : '#515445'))
  const background = temporary.own(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { topColor: { value: top }, bottomColor: { value: bottom } },
    vertexShader: 'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 topColor,bottomColor;varying vec3 direction;void main(){float h=smoothstep(-.5,.9,normalize(direction).z);gl_FragColor=vec4(mix(bottomColor,topColor,h),1.);}' }))
  room.add(new THREE.Mesh(temporary.own(new THREE.SphereGeometry(40, 32, 16)), background))
  if (preset !== 'sky') {
    const geometry = temporary.own(new THREE.PlaneGeometry(1, 1))
    const panels = automotive ? [[[-8, -4, 9], [3, 18], 10], [[8, 3, 6], [2, 16], 7], [[0, 0, 14], [18, 3], 9], [[-2, 9, 4], [12, 2], 4]] : [[[-8, -4, 10], [8, 12], 8], [[9, 3, 6], [5, 9], 5], [[0, 8, 14], [10, 5], 6]]
    for (const [position, size, brightness] of panels) {
      const panel = new THREE.Mesh(geometry, temporary.own(new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(brightness * number(settings.panelIntensity, 1, 0, 10)), side: THREE.DoubleSide, toneMapped: false })))
      panel.position.fromArray(position).applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(number(settings.studioRotation, 0)))
      panel.scale.set(size[0] * number(settings.panelWidth, 1, 0.1, 4), size[1], 1); panel.lookAt(0, 0, 0); room.add(panel)
    }
  }
  const cube = temporary.own(new THREE.WebGLCubeRenderTarget(Math.min(256, maxSize), { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, generateMipmaps: false }))
  const generator = new CubeToEquirectGenerator(renderer), previousTone = renderer.toneMapping
  try {
    renderer.toneMapping = THREE.NoToneMapping
    new THREE.CubeCamera(0.1, 100, cube).update(renderer, room)
    const texture = owner.own(generator.generate(cube.texture, Math.min(1024, maxSize), Math.min(512, maxSize)))
    texture.colorSpace = THREE.LinearSRGBColorSpace
    return texture
  } finally {
    renderer.toneMapping = previousTone
    generator._quad.material.dispose(); generator.dispose(); temporary.dispose()
  }
}

async function convertScene (snapshot, runtime, signal) {
  const owner = scope(), scene = new THREE.Scene(), warnings = []
  const check = () => { if (signal.aborted || runtime._disposed || runtime._contextLost) throw cancelled() }
  const { renderer, limits } = runtime
  try {
    const textureCache = new Map(), textures = snapshot.textures || []
    const getTexture = async index => {
      if (!Number.isInteger(index) || !textures[index]) throw new Error(`Missing texture index ${index}`)
      if (!textureCache.has(index)) textureCache.set(index, loadTexture(textures[index], owner, signal, limits.maxTextureSize))
      return textureCache.get(index)
    }
    const materials = []
    for (const descriptor of snapshot.materials || []) {
      check()
      const d = { ...descriptor.pandaSurface, ...descriptor }, material = owner.own(new THREE.MeshPhysicalMaterial())
      material.name = d.name || ''
      for (const key of SCALARS) if (d[key] != null) {
        if (key === 'attenuationDistance' && d[key] === Infinity) material[key] = Infinity
        else material[key] = number(d[key], material[key], key === 'ior' ? 1 : 0)
      }
      for (const key of COLORS) if (d[key] != null) material[key].copy(color(d[key]))
      if (d.refractionColor) material.attenuationColor.copy(color(d.refractionColor))
      material.roughness = Math.max(material.roughness, number(d.refractionRoughness, 0, 0, 1))
      if (d.reflection != null) material.specularIntensity = number(d.reflection, 1, 0, 1)
      material.side = d.side ?? THREE.DoubleSide
      material.transparent = !!d.alphaHash || (d.transparent ?? material.opacity < 1)
      material.vertexColors = !!d.vertexColors; material.flatShading = !!d.flatShading
      if (d.iridescenceThicknessRange) material.iridescenceThicknessRange = Array.from(values(d.iridescenceThicknessRange, 2, 'iridescence thickness'))
      for (const key of ['normalScale', 'clearcoatNormalScale']) if (d[key]) material[key].fromArray(values(d[key], 2, key))
      for (const slot of MAPS) if (d[slot] != null) material[slot] = await getTexture(d[slot])
      if (material.alphaMap && !material.alphaMap.matrix.equals(new THREE.Matrix3())) throw new Error('Transformed alphaMap UVs are unsupported by path tracer 0.0.23; use real-time rendering. Base-color alpha with a transformed map is supported.')
      if (d.normalMapType === THREE.ObjectSpaceNormalMap && material.normalMap) throw new Error('Object-space normal maps need real-time rendering; path tracer requires tangent-space normal maps.')
      if (d.bumpMap != null && !material.normalMap) {
        material.normalMap = bumpNormal(renderer, await getTexture(d.bumpMap), number(d.bumpScale, 1), owner)
        warnOnce(warnings, 'Bump maps are converted to tangent-space normals using UV-space height differences; they do not displace geometry.')
      }
      // envMap is deliberately ignored: it is a raster PMREM atlas in another
      // WebGL context. Global HDR/studio lighting is rebuilt from environment.
      for (const slot of ['displacementMap', 'thicknessMap', 'anisotropyMap']) if (d[slot] != null) throw new Error(`${slot} is unsupported by three-gpu-pathtracer 0.0.23; use real-time rendering.`)
      if (d.anisotropy > 0) throw new Error('Anisotropic BSDF is unsupported by path tracer 0.0.23; use real-time rendering.')
      for (const slot of ['aoMap', 'lightMap']) if (d[slot] != null) warnOnce(warnings, `${slot} is a baked raster-lighting effect; path tracing computes occlusion/indirect light physically.`)
      if (d.specularMap != null) throw new Error('Legacy specularMap must be converted to specularIntensityMap before path tracing.')
      materials.push(material)
      if (materials.length % 16 === 0) { await pause(); check() }
    }
    if (materials.length > 65535) throw new Error('Path tracer material indices exceed uint16 capacity')
    const geometries = new Map()
    for (const [index, d] of (snapshot.geometries || []).entries()) {
      check()
      const geometry = owner.own(new THREE.BufferGeometry()), positions = values(d.positions, undefined, 'positions')
      if (!positions.length || positions.length % 3) throw new Error('Geometry positions must contain xyz triples')
      const count = positions.length / 3
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      for (const [field, attribute, size] of [['normals', 'normal', 3], ['uv', 'uv', 2], ['uvs', 'uv', 2], ['uv2', 'uv1', 2], ['tangents', 'tangent', 4]]) if (d[field]) geometry.setAttribute(attribute, new THREE.Float32BufferAttribute(values(d[field], count * size, field), size))
      if (d.colors) {
        const size = d.colors.length / count
        if (size !== 3 && size !== 4) throw new Error('Invalid vertex color component count')
        values(d.colors, count * size, 'colors')
        // Upstream fills missing vertex colors with RGBA; merging RGB and RGBA
        // attributes otherwise fails. Preserve alpha and normalize to RGBA.
        const rgba = new Float32Array(count * 4)
        for (let i = 0; i < count; i++) { rgba[i * 4] = d.colors[i * size]; rgba[i * 4 + 1] = d.colors[i * size + 1]; rgba[i * 4 + 2] = d.colors[i * size + 2]; rgba[i * 4 + 3] = size === 4 ? d.colors[i * size + 3] : 1 }
        geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4))
      }
      if (d.indices) {
        if (d.indices.length % 3) throw new Error('Indices must describe triangles')
        for (const i of d.indices) if (!Number.isInteger(i) || i < 0 || i >= count) throw new Error('Invalid triangle index')
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(d.indices), 1))
      } else if (count % 3) throw new Error('Unindexed triangle geometry must have a multiple of three vertices')
      if (!geometry.attributes.normal) geometry.computeVertexNormals()
      geometries.set(d.geometryId ?? index, geometry)
      await pause(); check()
    }
    let triangles = 0, vertices = 0
    for (const [index, instance] of (snapshot.instances || []).entries()) {
      const geometry = geometries.get(instance.geometryId ?? instance.geometry), material = materials[instance.material]
      if (!geometry || !material) throw new Error(`Missing geometry/material for instance ${index}`)
      const mesh = new THREE.Mesh(geometry, material)
      if (instance.matrix) mesh.matrix.fromArray(values(instance.matrix, 16, 'instance matrix'))
      if (Math.abs(mesh.matrix.determinant()) < 1e-30) throw new Error('Singular instance transform')
      mesh.matrixAutoUpdate = false; scene.add(mesh)
      triangles += (geometry.index?.count ?? geometry.attributes.position.count) / 3
      vertices += geometry.attributes.position.count
      if (vertices > limits.maxTextureSize ** 2 || 2 * Math.ceil(Math.sqrt(Math.max(1, triangles * 2 - 1) / 2)) > limits.maxTextureSize) throw new Error('Flattened BVH/attribute textures exceed GPU dimension limits')
      if (index % 256 === 0) { await pause(); check() }
    }
    for (const d of snapshot.lights || []) {
      if (!(number(d.intensity, 1, 0) > 0)) continue
      let light
      const c = color(d.color), intensity = number(d.intensity, 1, 0)
      switch (d.type) {
        case 'sun': case 'directional': light = new THREE.DirectionalLight(c, intensity); break
        case 'point': light = new THREE.PointLight(c, intensity, d.distance ?? 0, d.decay ?? 2); break
        case 'spot': light = new THREE.SpotLight(c, intensity, d.distance ?? 0, d.angle ?? Math.PI / 3, d.penumbra ?? 0, d.decay ?? 2); break
        case 'area': light = new THREE.RectAreaLight(c, intensity, d.width ?? 1, d.height ?? 1); break
        default: throw new Error(`Path tracing does not implement ${d.type} lights. Use an HDR/studio environment or real-time rendering.`)
      }
      light.position.fromArray(values(d.position ?? [0, 0, 10], 3, 'light position'))
      if (d.matrix) light.matrix.fromArray(values(d.matrix, 16, 'light matrix')).decompose(light.position, light.quaternion, light.scale)
      if (light.target) {
        if (d.target) light.target.position.fromArray(values(d.target, 3, 'light target'))
        else if (d.direction) light.target.position.copy(light.position).add(new THREE.Vector3().fromArray(values(d.direction, 3, 'light direction')))
        scene.add(light.target)
      } else if (d.quaternion) light.quaternion.fromArray(values(d.quaternion, 4, 'light quaternion'))
      else if (d.target) light.lookAt(new THREE.Vector3().fromArray(d.target))
      scene.add(light)
    }
    const effects = snapshot.effects || {}, bounds = snapshot.bounds
    if (effects.ground && bounds) {
      const min = new THREE.Vector3().fromArray(values(bounds.min, 3, 'bounds min')), max = new THREE.Vector3().fromArray(values(bounds.max, 3, 'bounds max'))
      const span = Math.max(...max.clone().sub(min).toArray(), 1)
      const floorMaterial = owner.own(new THREE.MeshPhysicalMaterial({ color: color(effects.groundColor || '#383c43'), roughness: number(effects.groundRoughness, 0.25, 0, 1), specularIntensity: number(effects.groundReflection, 0.5, 0, 1), side: THREE.DoubleSide }))
      const geometry = owner.own(new THREE.PlaneGeometry(span * number(effects.groundSize, 4, 0.01), span * number(effects.groundSize, 4, 0.01)))
      const floor = new THREE.Mesh(geometry, floorMaterial)
      floor.position.copy(min).add(max).multiplyScalar(0.5)
      floor.position.z = effects.groundAutoHeight === false ? number(effects.groundHeight, 0) : min.z - span * 0.0001
      scene.add(floor); triangles += 2; vertices += 4
      if (effects.groundDistanceBlur) warnOnce(warnings, 'Ground reflections use physical roughness; raster distance-blur and reflection-resolution controls do not apply to path tracing.')
    }
    const environment = snapshot.environment
    scene.environment = await environmentTexture(environment, renderer, owner, signal, limits.maxTextureSize)
    scene.environmentIntensity = number(environment?.intensity, 1, 0)
    if (environment?.rotation != null) scene.environmentRotation.set(0, 0, THREE.MathUtils.degToRad(number(environment.rotation, 0)))
    scene.background = environment?.background ? (['studio', 'automotive'].includes(environment.preset) ? color(environment.bottomColor ?? (environment.preset === 'automotive' ? '#11151c' : '#535866')) : scene.environment) : null
    scene.backgroundIntensity = number(environment?.backgroundIntensity, 1, 0)
    scene.backgroundRotation.copy(scene.environmentRotation)
    check(); scene.updateMatrixWorld(true)
    const textureSet = new Set()
    for (const material of materials) for (const slot of MAPS) if (material[slot]) textureSet.add(material[slot])
    if (textureSet.size > limits.maxArrayLayers) throw new Error(`Scene needs ${textureSet.size} texture layers; GPU supports ${limits.maxArrayLayers}`)
    const atlasSize = Math.max(16, Math.min(1024, limits.maxTextureSize, 2 ** Math.floor(Math.log2(Math.sqrt(256 * 1024 ** 2 / (4 * Math.max(1, textureSet.size)))))))
    if (atlasSize < 1024) warnOnce(warnings, `Material textures use a ${atlasSize}px atlas to keep texture-array memory under 256 MiB.`)
    return { scene, owner, warnings, atlasSize, diagnostics: { materials: materials.length, textures: textureSet.size, triangles, instances: snapshot.instances?.length || 0, geometryCount: geometries.size,
      materialDetails: materials.map(m => ({ name: m.name, transmission: m.transmission, ior: m.ior, roughness: m.roughness, opacity: m.opacity, thickness: m.thickness, attenuationColor: m.attenuationColor.toArray(), attenuationDistance: m.attenuationDistance, maps: MAPS.filter(key => !!m[key]) })) } }
  } catch (error) { owner.dispose(); throw error }
}

export class PathTracer {
  constructor ({ onStatus = () => {}, invalidate = () => {} } = {}) {
    this.onStatus = onStatus; this.invalidate = invalidate
    this._canvas = typeof document === 'undefined' ? null : document.createElement('canvas')
    this._gpuCanvas = typeof document === 'undefined' ? null : document.createElement('canvas')
    this._settings = { ...DEFAULTS }; this._camera = makeCamera(); this._cameraKey = ''; this._autoAspect = true
    this._state = 'uninitialized'; this._reason = ''; this._warnings = []; this._disposed = false; this._contextLost = false
    this._serial = 0; this._activeJob = null; this._queued = null; this._draining = null; this._building = false
    this._scene = null; this._samples = 0; this._width = 0; this._height = 0; this._outputVersion = 0; this._copiedVersion = -1
    this._stats = {}; this._lastCompleted = null; this._denoisePasses = 0; this._copyPasses = 0; this.renderer = null
  }
  get canvas () { return this._canvas }
  get progress () {
    const supported = !!this.renderer && !this._disposed && !this._contextLost && this._state !== 'fallback'
    return { supported, state: this._state, samples: this._samples, targetSamples: this._settings.samples, progress: Math.min(1, this._samples / this._settings.samples), done: supported && !this._building && this._samples >= this._settings.samples,
      pending: this._building || !!this._tracer?.isCompiling, building: this._building, width: this._width, height: this._height, ...(this._reason ? { reason: this._reason } : {}), warnings: this._warnings.slice() }
  }
  get diagnostics () {
    return { library: 'three-gpu-pathtracer', version: '0.0.23', three: THREE.REVISION, bvh: '0.8.3', backend: 'webgl2', ...this._stats,
      denoise: this._settings.denoise, denoiseStrength: this._settings.denoiseStrength, denoisePasses: this._denoisePasses, copyPasses: this._copyPasses,
      lastCompleted: this._lastCompleted, limits: this.limits, rendererMemory: this.renderer ? { ...this.renderer.info.memory } : null, ...this.progress }
  }
  _emit () { this.onStatus(this.progress) }
  _fail (error) {
    if (this._disposed) return
    this._state = 'fallback'; this._reason = error?.message || String(error); this._building = false
    this._emit(); this.invalidate()
  }
  async initialize () {
    if (this._disposed) return { supported: false, reason: 'PathTracer is disposed' }
    if (this._initializing) return this._initializing
    this._initializing = this._initialize(); return this._initializing
  }
  async _initialize () {
    this._state = 'initializing'; this._emit()
    try {
      if (!this._gpuCanvas || !this._canvas) throw new Error('Path tracer requires a browser canvas')
      const context = this._gpuCanvas.getContext('webgl2', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
      if (!context) throw new Error('WebGL2 is unavailable')
      if (!context.getExtension('EXT_color_buffer_float')) throw new Error('Path tracing requires WebGL2 EXT_color_buffer_float')
      this.limits = { maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE), maxArrayLayers: context.getParameter(context.MAX_ARRAY_TEXTURE_LAYERS), maxRenderbufferSize: context.getParameter(context.MAX_RENDERBUFFER_SIZE) }
      if (context.getParameter(context.MAX_TEXTURE_IMAGE_UNITS) < 16) throw new Error('Path tracing requires at least 16 fragment texture units')
      this._lostHandler = event => {
        event.preventDefault(); this._contextLost = true; this._serial++
        this._activeJob?.controller.abort(); this._worker?.stop()
        if (this._queued) { this._queued.resolve({ superseded: true }); this._queued = null }
        this._fail(new Error('Path-tracer WebGL context lost. Recreate the runtime to resume; real-time rendering remains available.'))
      }
      this._gpuCanvas.addEventListener('webglcontextlost', this._lostHandler)
      this.renderer = new THREE.WebGLRenderer({ canvas: this._gpuCanvas, context, alpha: true, premultipliedAlpha: false })
      this.renderer.setPixelRatio(1); this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = this._settings.exposure
      this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => this._fail(new Error(`Path tracer shader compilation failed: ${gl.getProgramInfoLog(program) || gl.getShaderInfoLog(fragment) || gl.getShaderInfoLog(vertex)}`))
      this._copyContext = this._canvas.getContext('2d')
      if (!this._copyContext) throw new Error('Cannot create persistent path-tracer display canvas')
      this._worker = createWorker()
      this._tracer = prepareTracer(this.renderer, error => this._fail(error)); this._tracer.setBVHWorker(this._worker)
      this._tracer.bounces = this._settings.bounces; this._tracer.transmissiveBounces = Math.max(8, this._settings.bounces * 2)
      this._denoiseMaterial = new DenoiseMaterial()
      // SmartDeNoise accumulates premultiplied color. Our display context is
      // straight-alpha; unpremultiply before nonlinear tone/color conversion.
      this._denoiseMaterial.fragmentShader = this._denoiseMaterial.fragmentShader.replace('#include <tonemapping_fragment>', 'if (gl_FragColor.a > 1e-6) gl_FragColor.rgb /= gl_FragColor.a;\n#include <tonemapping_fragment>')
      this._copyMaterial = copyMaterial()
      this._quad = new FullScreenQuad(this._copyMaterial)
      this._state = 'ready'; this._emit()
      return { supported: true, backend: 'webgl2', library: 'three-gpu-pathtracer', version: '0.0.23' }
    } catch (error) {
      this._fail(error); await this._releaseGPU()
      return { supported: false, reason: error.message }
    }
  }
  setScene (snapshot) {
    if (this._disposed) return Promise.reject(new Error('PathTracer is disposed'))
    const id = ++this._serial
    if (this._contextLost) return Promise.resolve({ supported: false, reason: this._reason || 'WebGL context lost; recreate the runtime.' })
    if (this._queued) this._queued.resolve({ superseded: true })
    // Abort only preparation/network IO. A running BVH build finishes serially;
    // calling upstream setSceneAsync concurrently triggers a never-settled queue.
    if (this._activeJob?.preparing) this._activeJob.controller.abort()
    this._building = true; this._samples = 0
    const promise = new Promise(resolve => { this._queued = { id, snapshot, resolve } })
    this._emit()
    this._scheduleDrain()
    return promise
  }
  _scheduleDrain () {
    if (this._draining || !this._queued || this._disposed || this._contextLost) return
    this._draining = this._drain().finally(() => {
      this._draining = null
      // A caller may enqueue from a resolved job's .then before this finally.
      this._scheduleDrain()
    })
  }
  async _drain () {
    while (this._queued && !this._disposed && !this._contextLost) {
      const job = this._queued; this._queued = null
      job.controller = new AbortController(); job.preparing = true; this._activeJob = job
      let converted
      try {
        const support = await this.initialize()
        if (!support.supported) throw new Error(support.reason)
        if (this._contextLost) throw new Error('Path tracer WebGL context was lost; recreate the runtime.')
        if (job.id !== this._serial || this._disposed) throw cancelled()
        this._state = 'building'; this._building = true; this._emit()
        converted = await convertScene(job.snapshot, this, job.controller.signal)
        job.snapshot = null
        if (job.id !== this._serial || this._disposed) throw cancelled()
        job.preparing = false
        if (!this._tracer) {
          if (!this._worker?.worker) this._worker = createWorker()
          this._tracer = prepareTracer(this.renderer, error => this._fail(error)); this._tracer.setBVHWorker(this._worker)
          this._tracer.bounces = this._settings.bounces; this._tracer.transmissiveBounces = Math.max(8, this._settings.bounces * 2)
        }
        this._tracer.textureSize.set(converted.atlasSize, converted.atlasSize)
        const timeout = setTimeout(() => this._worker?.stop(), 120000)
        let result
        try { result = await this._tracer.setSceneAsync(converted.scene, this._camera) } finally { clearTimeout(timeout) }
        if (this._disposed || this._contextLost) throw cancelled()
        // Release previous resources only after upstream no longer refers to them.
        this._scene?.owner.dispose(); this._scene = converted; converted = null
        this._tracer.setCamera(this._camera)
        if (job.id !== this._serial) { job.resolve({ superseded: true }); continue }
        this._stats = this._scene.diagnostics; this._warnings = this._scene.warnings
        this._stats.bvhNodes = result.bvh?._roots?.reduce((sum, root) => sum + root.byteLength / 32, 0) || 0
        this._reason = ''; this._building = false; this._state = 'ready'; this.reset()
        job.resolve({ ...this._stats, supported: true })
      } catch (error) {
        converted?.owner.dispose()
        // A rejected generation can leave generator.bvh as a rejected Promise.
        // Retire that generator instead of letting the next job enter its
        // broken pending-generation branch.
        if (!job.preparing && this._tracer && !this._disposed) {
          const failed = this._tracer; this._tracer = null
          await Promise.allSettled([failed._pathTracer._compilePromise, failed._lowResPathTracer._compilePromise].filter(Boolean))
          releaseTracer(failed)
        }
        if (job.id !== this._serial || this._disposed || error.name === 'AbortError') job.resolve({ superseded: true })
        else { this._fail(error); job.resolve({ supported: false, reason: error.message }) }
      } finally { this._activeJob = null; job.snapshot = null }
    }
  }
  setCamera (descriptor = {}) {
    if (this._disposed) return
    const key = JSON.stringify(descriptor)
    if (key === this._cameraKey) return
    this._camera = makeCamera(descriptor); this._cameraKey = key; this._autoAspect = descriptor.aspect == null
    if (this._autoAspect && this._width && this._camera.isPerspectiveCamera) { this._camera.aspect = this._width / this._height; this._camera.updateProjectionMatrix() }
    if (!this._building) this._tracer?.setCamera(this._camera)
    this.reset()
  }
  configure (options = {}) {
    const next = { ...this._settings }
    for (const [key, value] of Object.entries(options)) {
      if (!(key in DEFAULTS)) throw new Error(`Unsupported path tracer option: ${key}`)
      next[key] = value
    }
    for (const key of ['samples', 'bounces']) if (!Number.isInteger(next[key])) throw new Error(`${key} must be an integer`)
    number(next.samples, 128, 1, 16777216); number(next.bounces, 8, 1, 32)
    number(next.resolutionScale, 1, 0.01, 2); number(next.exposure, 1, 0, 1000); number(next.denoiseStrength, 0.5, 0, 1)
    if (typeof next.denoise !== 'boolean') throw new Error('denoise must be boolean')
    const reset = next.bounces !== this._settings.bounces || next.resolutionScale !== this._settings.resolutionScale
    const changed = Object.keys(DEFAULTS).some(key => next[key] !== this._settings[key])
    this._settings = next
    if (this._tracer) { this._tracer.bounces = next.bounces; this._tracer.transmissiveBounces = Math.max(8, next.bounces * 2) }
    if (this.renderer) this.renderer.toneMappingExposure = next.exposure
    if (reset) this.reset()
    else if (changed) { this._outputVersion++; this.invalidate(); this._emit() }
  }
  reset () {
    if (this._disposed) return
    this._tracer?.reset(); this._samples = 0; this._outputVersion++
    this.invalidate(); this._emit()
  }
  step (width, height) {
    if (!this.renderer || !this._tracer || this._disposed || this._contextLost || this._building || this._state === 'fallback' || !this._scene) return this.progress
    try {
      number(width, 1, 1); number(height, 1, 1)
      let w = Math.max(1, Math.floor(width * this._settings.resolutionScale)), h = Math.max(1, Math.floor(height * this._settings.resolutionScale))
      const limit = Math.min(this.limits.maxTextureSize, this.limits.maxRenderbufferSize)
      const reduction = Math.min(1, limit / w, limit / h, Math.sqrt(8 * 1024 ** 2 / (w * h)))
      if (reduction < 1) { w = Math.max(1, Math.floor(w * reduction)); h = Math.max(1, Math.floor(h * reduction)); warnOnce(this._warnings, 'Output resolution limited to GPU dimensions and 8 megapixels for bounded accumulation memory.') }
      if (w !== this._width || h !== this._height) {
        this._width = w; this._height = h; this.renderer.setSize(w, h, false)
        this._tracer.tiles.set(Math.max(1, Math.ceil(w / 256)), Math.max(1, Math.ceil(h / 256)))
        if (this._autoAspect && this._camera.isPerspectiveCamera) { this._camera.aspect = width / height; this._camera.updateProjectionMatrix(); this._tracer.setCamera(this._camera) }
        this.reset()
      }
      if (this._samples < this._settings.samples) {
        this._state = 'rendering'
        this._tracer.renderSample() // exactly one tile, not a whole sample loop
        if (this._state === 'fallback') return this.progress
        this._samples = this._tracer.samples; this._outputVersion++
        if (this._samples >= this._settings.samples) {
          this._state = 'ready'; this._lastCompleted = { ...this._stats, samples: this._samples, width: w, height: h }
        } else this.invalidate()
        this._emit()
      }
      return this.progress
    } catch (error) { this._fail(error); return this.progress }
  }
  async copyToCanvas (target = this._canvas) {
    if (!this.renderer || !this._tracer || this._disposed || this._contextLost || this._building || this._state === 'fallback' || !this._width || !this._samples) return null
    try {
      if (this._copiedVersion !== this._outputVersion) {
        if (this._canvas.width !== this._width || this._canvas.height !== this._height) { this._canvas.width = this._width; this._canvas.height = this._height }
        const denoise = this._settings.denoise && this._settings.denoiseStrength > 0
        if (denoise) {
          const m = this._denoiseMaterial, strength = this._settings.denoiseStrength
          m.map = this._tracer.target.texture; m.sigma = 0.75 + strength * 3.25; m.kSigma = 1; m.threshold = 0.01 + strength * 0.14
          this._quad.material = m; this._denoisePasses++
        } else { this._copyMaterial.uniforms.map.value = this._tracer.target.texture; this._quad.material = this._copyMaterial }
        this.renderer.setRenderTarget(null); this.renderer.setScissorTest(false); this.renderer.setViewport(0, 0, this._width, this._height)
        this._quad.render(this.renderer)
        // Copy synchronously before preserveDrawingBuffer:false is presented.
        this._copyContext.clearRect(0, 0, this._width, this._height)
        this._copyContext.drawImage(this._gpuCanvas, 0, 0)
        this._copiedVersion = this._outputVersion; this._copyPasses++
      }
      if (target !== this._canvas) {
        if (target.width !== this._width) target.width = this._width
        if (target.height !== this._height) target.height = this._height
        const context = target.getContext('2d'); if (!context) throw new Error('copyToCanvas target requires a 2D canvas')
        context.clearRect(0, 0, target.width, target.height); context.drawImage(this._canvas, 0, 0)
      }
      return target
    } catch (error) { this._fail(error); return null }
  }
  async _releaseGPU () {
    this._worker?.stop(); this._worker = null
    const tracer = this._tracer; this._tracer = null
    // Compilations must settle before releasing their materials/programs.
    await Promise.allSettled([tracer?._pathTracer?._compilePromise, tracer?._lowResPathTracer?._compilePromise].filter(Boolean))
    releaseTracer(tracer)
    this._scene?.owner.dispose(); this._scene = null
    this._quad?.dispose(); this._denoiseMaterial?.dispose(); this._copyMaterial?.dispose()
    if (this.renderer) { this.renderer.renderLists.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null }
  }
  dispose () {
    if (this._disposePromise) return this._disposePromise
    this._disposed = true; this._serial++; this._state = 'disposed'; this._building = false
    this._activeJob?.controller.abort(); this._worker?.stop()
    if (this._queued) { this._queued.resolve({ superseded: true }); this._queued = null }
    this._gpuCanvas?.removeEventListener('webglcontextlost', this._lostHandler)
    this._disposePromise = (async () => {
      await this._draining; await this._releaseGPU()
      if (this._canvas) this._canvas.width = this._canvas.height = 1
      if (this._gpuCanvas) this._gpuCanvas.width = this._gpuCanvas.height = 1
      this._stats = {}; this._emit()
    })()
    return this._disposePromise
  }
}
