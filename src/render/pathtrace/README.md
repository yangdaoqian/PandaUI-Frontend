# Standalone WebGPU path tracer

No THREE imports and no changes to the application's Three r120 renderer. The parent owns extraction, scheduling, camera synchronization and fallback rendering.

```js
import PathTracer from './pathtrace/index.js'
const tracer = new PathTracer({ onStatus: status => {}, invalidate: () => {} })
const capability = await tracer.initialize() // { supported, reason?, adapterInfo? }
if (!capability.supported) { /* parent uses its existing raster renderer */ }
await tracer.setScene({
  geometries: [{ id: 'part', positions: [0,0,0, 1,0,0, 0,1,0], indices: [0,1,2] }],
  instances: [{ geometryId: 'part', matrix: [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    material: { color: [0.7,0.7,0.7], metallic: 0, roughness: 0.5, emissive: [0,0,0] } }],
  lights: [{ type: 'sun', direction: [0,-1,-1], color: [1,1,1], intensity: 2 }],
  environment: { topColor: [0.4,0.6,1], bottomColor: [0.08,0.08,0.08], intensity: 1, up: [0,0,1] }
})
tracer.setCamera({ position: [0,0,3], target: [0,0,0], up: [0,1,0], fov: 45 })
tracer.configure({ samples: 128, bounces: 4, resolutionScale: 0.75, exposure: 1 })
const progress = tracer.step(800, 600) // dimensions in desired output pixels; scale applied here
// Schedule another step on invalidate(); pending means the previous dispatch is in flight.
// Append tracer.canvas, or copy it to the parent's 2D canvas.
const exportCanvas = await tracer.copyToCanvas() // waits, copies persistent output
tracer.dispose()
```

## Contract

- `initialize()` is idempotent; returns capability, never claims support before shader/pipeline validation. `PathTracer.detectSupport()` probes adapter availability without creating a device. Failure emits `{state:'fallback', supported:false, reason}`; no fake raster/backend output is substituted. Do not retry the same disposed/lost renderer; construct another.
- `setScene(snapshot)` builds in a module Worker in browsers and atomically uploads a complete replacement. It can be called before initialization. Invalid/unsupported snapshots or resource limits reject and report fallback; geometry is never truncated. A later valid scene can recover a scene validation failure while its device remains live. New calls supersede old results/errors; superseded promises resolve `{superseded:true}`. Successful calls resolve `{geometries,triangles,instances,nodes,bytes}` statistics. `progress.building` is true while the Worker is building. Inputs are structured-cloned without transfer, so caller buffers are never detached. The compiled buffer is transferred back. Serve/bundle the module Worker; a blocked/missing Worker reports explicit fallback, never a large synchronous browser rebuild.
- `geometries`: `{id, positions, normals?, indices?}` (`geometryId` is an alias for `id`); arrays or typed arrays, tightly packed xyz. Omitted indices mean triangle soup. `instances`: `{geometryId, matrix?, material?}`. `meshes` is shorthand for inline `{geometryId?, positions?, normals?, indices?, matrix?, material?}`: the first occurrence defines a geometry; subsequent mesh references may omit vertex arrays. Duplicate definitions must be identical. All visible instances supplied are rendered. Extract visibility, draw ranges, material groups and deformation in the parent. One material per instance; split groups into separate geometry snapshots.
- Matrices are invertible, affine, column-major, world transforms, identity by default. Rays retain their world-space distance parameter through nonuniform scales. Normals use the inverse transpose. Missing normals use flat triangle normals. Empty geometry is accepted; malformed arrays, invalid indices, nonfinite values and singular matrices are rejected.
- Material: linear `color` (alias `baseColor`), `emissive`, nonnegative `emissiveIntensity`, `metallic` (alias `metalness`) and `roughness` in [0,1]. All surfaces are opaque and double-sided. Explicit transparency/transmission/texture inputs are rejected. Unsupported source effects must be removed or baked explicitly by the parent's adapter.
- Lights: `sun` with `direction` pointing FROM light toward scene, or `point` with world `position`. Both use linear `color` and nonnegative `intensity`. Sun intensity is irradiance; point intensity is radiant intensity with inverse-square attenuation. Hard shadows. All supplied lights are evaluated; no silent light count cap. `environment: {topColor,bottomColor,intensity,up}` configures the gradient; `sky: {top,bottom,intensity,up}` is an alias. Up defaults to world Y; use `[0,0,1]` for world Z. Set intensity 0 for black.
- Perspective camera: `{position,target,up?,fov?,aspect?,near?,far?}`; vertical `fov` in degrees, aspect defaults to output ratio. Orthographic: `{type:'orthographic',position,target,up?,left,right,top,bottom,near?,far?}`. near/far clip the primary ray along the camera forward axis. Defaults: near 0.001, far 1e30. No THREE objects are accepted.
- `configure({samples,bounces,resolutionScale,exposure,seed,rayEpsilon})`: samples 1..16777216, bounces 1..32, scale (0,2], positive exposure/epsilon, uint32 seed. Unknown options reject. One sample/pixel per dispatch; no multiple GPU submissions in flight. Progress: `{state,supported,samples,targetSamples,progress,done,pending,width,height,reason?}`. Counts reflect completed GPU submissions. `render` aliases `step`.
- Every accepted camera, scene, settings or size change resets accumulation. Identical camera/configure values are no-ops so a parent may synchronize each frame. `reset()` invalidates accumulation. `invalidate()` requests another parent frame after reset and GPU completion. `onStatus()` reports capability/state/progress. `canvas` is an owned persistent 2D HTML canvas (null outside a DOM), copied from the internal WebGPU presentation canvas in the submitting task without CPU pixel readback. It remains valid for delayed WebGL/Three r120 `CanvasTexture` uploads after browser presentation. Mark that texture dirty when completed `samples` advances. resolutionScale controls actual canvas dimensions. `copyToCanvas(target?)` waits for GPU completion and copies to a 2D canvas for export/compositing. Dispose terminates the Worker, destroys buffers/textures/device and unconfigures the WebGPU context. Device loss does the same and reports fallback.
- Canvas pixels are already tone-mapped, display-referred sRGB. The parent compositor must avoid double tone mapping/encoding. For a color-managed Three material, identify the CanvasTexture as sRGB and disable that material's tone mapping; a raw fullscreen copy shader can preserve the values directly. `invalidate` should schedule a frame, not busy-loop until a sample finishes.

## Implementation and limitations

Real WGSL compute traces jittered camera rays using stackless BLAS/TLAS traversal, floating-point running-mean accumulation, Lambert diffuse and GGX metallic BRDF sampling, emissive hits and sky escapes. Analytic sun/point next-event estimation includes visibility rays. Film output uses exposure, Reinhard tone mapping and sRGB encoding. No denoising; emissive triangles/sky are sampled by path continuation only (no area-light importance sampling). No textures, UV maps, alpha, transmission/refraction, volumetrics, displacement, motion blur, depth of field or MIS for emissive lights. GGX uses NDF sampling, so very rough/grazing metals converge slowly.

CPU construction uses balanced median splits and one shared triangle payload/BLAS per geometry; TLAS leaves reference transformed instances. The persistent module Worker reuses unchanged BLAS data on transform/material updates after exact geometry-content comparison; changed geometry rebuilds and removed IDs are evicted. TLAS and the packed GPU upload still rebuild; no refit or incremental GPU upload yet. Statistics expose `blasBuilds` and `blasReuses`. Structured-cloning large inputs and uploading results still cost main-thread time/memory. Stale Worker jobs finish but their results are discarded; there is no preemptive build cancellation. No arbitrary vertex/triangle cap: typed-array allocation, exact GPU buffer/binding sizes, texture dimensions, workgroup limits and WGSL u32 addressing are checked; failures are explicit. Extremely large coordinates/tiny triangles remain limited by GPU float32 precision; rebase CAD scenes near the origin and choose rayEpsilon in scene units (default 0.0001).

## Validation

`node scripts/test-render-pathtrace.js` runs CPU snapshot/BVH/transform/API tests.

`node scripts/test-render-pathtrace-browser.js` serves only this module folder and runs real Edge WebGPU compilation/dispatch/readback, progressive/reset/export/shadow/instance/loss tests. `--software` requests Chromium's unsafe SwiftShader adapter for CI testing only; these flags are never used by the product. An unavailable adapter is a reported SKIP unless `--require-gpu` is supplied.

Validated on Edge 157 / Intel Gen-12LP: CPU tests and real browser compute tests (including Worker generations, Z-up, and a WebGL texture upload after browser presentation). The software flags on this Windows installation return no adapter; this is reported as unavailable, not as a successful compute test.
