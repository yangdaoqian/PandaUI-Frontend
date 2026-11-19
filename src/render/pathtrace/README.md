# Isolated WebGL2 path tracer

The public entry point exports `PathTracer` from `index.js`. It is a small loader/delegation wrapper around the bundled **three-gpu-pathtracer 0.0.23 / Three r170 / three-mesh-bvh 0.8.3** runtime. The application's r120 renderer remains separate. Denoising uses upstream `DenoiseMaterial` (spatial bilateral-style filtering), not OIDN or the former custom WebGPU shaders.

## Files and build

| File | Role |
| --- | --- |
| `PathTracer.js`, `index.js` | Lazy-load `/shared/pathtracer/runtime.js`; delegate to `window.PandaPathTracerRuntime.PathTracer` |
| `scripts/pathtracer-runtime/runtime.js` | Isolated scene conversion, upstream tracing, worker build, presentation and cleanup |
| `scripts/pathtracer-runtime/package.json`, `package-lock.json` | Exact dependency pins in an independent install |
| `scripts/build-pathtracer-runtime.cjs` | Build runtime/worker assets, manifest and license notices |
| `public/shared/pathtracer/` | Deployable browser bundle and associated assets |
| `scene.js`, `shaders.js`, `PathScene.worker.js` in this folder | **Inactive archival code** from the former custom WebGPU implementation; not imported by the current wrapper/runtime |

Build from the development repository using `node scripts/build-pathtracer-runtime.cjs` after installing the isolated package's locked dependencies. Serve all generated worker chunks and notices with the runtime; serving only this source directory is insufficient. No public CDN import is needed at runtime. See [migration architecture and limitations](../../../docs/PATH_TRACER_MIGRATION.md).

## Wrapper contract

```js
import PathTracer from './pathtrace/index.js'

const tracer = new PathTracer({
  onStatus: status => { /* update UI; do not mutate the scene */ },
  invalidate: () => { /* request a host frame */ }
})
const capability = await tracer.initialize()
if (capability.supported) {
  tracer.configure({ samples: 128, bounces: 8, denoise: true, denoiseStrength: 0.5 })
  tracer.setCamera(cameraDescriptor)
  const result = await tracer.setScene(snapshot)
  if (!result.superseded) {
    // Repeat from the host scheduler until done; do not busy-loop.
    const progress = tracer.step(width, height)
    if (progress.samples > 0 && !progress.pending) {
      const canvas = await tracer.copyToCanvas()
      // Present canvas. Continue scheduling until progress.done.
    }
  }
}
// On teardown:
await tracer.dispose()
```

- **initialize():** loads the local bundle once and creates the isolated implementation; repeated calls reuse initialization. Successful capability includes `supported:true`, `backend:'webgl2'`, library and version. WebGL2, `EXT_color_buffer_float` and sufficient fragment texture units are required. Script-loading errors reject; capability failures return a reason. The parent retains raster fallback.
- **setScene(snapshot):** initializes if needed and queues conversion/BVH construction. Jobs are serialized and coalesced; superseded calls resolve `{superseded:true}`. Success returns scene statistics and `supported:true`. The wrapper converts a runtime `{supported:false, reason}` into a rejected error. There is no concurrent whole-scene upload promise contract from the retired tracer.
- **setCamera(descriptor), configure(settings), step(width,height):** call after initialization. `step` advances one tile, so sample counts can be fractional; building/compiling states do not represent finished samples. No autonomous perpetual render loop is created.
- **progress:** includes `state`, `supported`, `samples`, `targetSamples`, `progress`, `done`, `pending`, `building`, dimensions, warnings and optional failure reason. `ready` alone is not completion: inspect `done`. `pending` covers building or shader compilation, not an old WebGPU dispatch fence.
- **canvas / copyToCanvas(target?):** the runtime owns a persistent 2D display canvas. `copyToCanvas` renders the latest accumulation through denoise or an unfiltered copy, applies ACES/sRGB once, and copies synchronously from the WebGL drawing buffer. The wrapper rejects when no image is available. It does not wait for the requested sample target; use `progress.done` when a fully sampled export is required. A supplied target must be a 2D canvas.
- **dispose():** marks the wrapper disposed and delegates asynchronous teardown. The runtime cancels preparation, stops the BVH worker, waits for pending compilation/build cleanup and releases its context/resources. Context loss reports fallback and requires a new runtime. It never disposes the editor's live scene objects.

Only the methods above are exposed by the wrapper. Old `detectSupport`, `render`, `reset`, validation helpers and CPU tracing exports are not public exports of the new `index.js`. The runtime itself has internal reset/diagnostic facilities; callers should not rely on `impl` internals.

## Snapshot contract

Prefer `createRenderSnapshot` from `RenderSceneAdapter.js`; it handles visibility, material groups, draw ranges, legacy/interleaved geometry and editor-helper exclusion. No live r120 Scene, Material, Texture or GPU resource crosses the boundary.

| Field | Shape |
| --- | --- |
| `geometries` | `{ geometryId, positions, normals?, indices?, uv?, uv2?, tangents?, colors? }`; tightly packed arrays/typed arrays. Positions/normals are xyz, uv is xy, tangents xyzw and colors RGB/RGBA |
| `instances` | `{ geometryId, material, matrix? }`; material is an index into `materials`; matrix is a column-major world transform, identity if absent |
| `materials` | Shared physical descriptors with linear RGB arrays, scalar fields and numeric indices into `textures` for map slots; optional `pandaSurface` custom fields |
| `textures` | Image/pixel descriptors with color space, dimensions/type as applicable, flipY, wrap/filter state and UV transform matrix/repeat/offset/center/rotation |
| `lights` | World-space sun/directional, point, spot or area descriptors; unsupported light kinds report an error |
| `environment`, `effects`, `bounds` | Render configuration and `{min,max}` bounds used for environment/ground conversion |

The adapter deduplicates shared geometry/material/texture descriptors. Conversion creates owned r170 resources and ordinary meshes; upstream merges their geometry for tracing. Document IDs/hierarchy remain in the host. Numeric arrays must be finite, indices valid and transforms nonsingular. The runtime copies geometry into owned attributes before worker generation, rather than detaching live editor buffers. Snapshot images may be DOM image/canvas sources; this is not a claim that the entire descriptor is JSON-serializable or transferable.

Physical material arrays are linear RGB; environment/effect CSS colors are parsed separately. Texture color spaces and matrices must remain explicit. Glass uses transmission/IOR and can retain opacity=1. The runtime maps `refractionRoughness` to a floor on shared roughness, maps reflection to specular intensity and converts supported bump maps to tangent-space normals. These approximations do not add independent BSDF lobes or displacement.

Camera descriptors use `{position,target,up,near,far}` plus perspective `{type:'perspective',fov,aspect?}` or orthographic `{type:'orthographic',left,right,bottom,top}`. Perspective FOV is vertical degrees. Omitted perspective aspect follows the output size; default up is world Z. The host adapter includes zoom in its camera descriptor. The former custom shader's exact primary-ray near/far clipping behavior is not promised for this upstream tracer.

## Settings and scheduling

Defaults: `samples=128`, `bounces=8`, `resolutionScale=1`, `exposure=1`, `denoise=true`, `denoiseStrength=0.5`.

Accepted settings: integer samples 1..16777216, integer bounces 1..32, scale 0.01..2, exposure 0..1000, boolean denoise and strength 0..1. Unknown settings, including the retired `seed` and `rayEpsilon`, reject. Runtime transmission traversal budget is at least 8 and otherwise twice the bounce budget.

Camera, scene, bounce-count and resolution changes reset accumulation. Identical camera/settings values are no-ops. Exposure/denoise changes re-present existing radiance; sample-target changes reuse existing samples. The host must also request presentation when output settings change even if the sample count is unchanged. Do not treat every refinement request/status event as a scene edit.

Spatial denoise uses `sigma=0.75+3.25*strength`, `kSigma=1`, `threshold=0.01+0.14*strength`; false/zero strength bypasses it. This filters pixels, not material roughness. Present only new output revisions; after completion, stop requesting frames. The host compositor must preserve already tone-mapped sRGB pixels without another tone-map/encoding pass.

## Limits and fallback

- Upstream .23 rough transmission uses an acknowledged approximate PDF; physically exact rough-glass transport, overlapping media and caustics are not guaranteed. Small-roughness output should be checked with denoise disabled before attributing blur to the material.
- UV0 material sampling only. Transformed standalone alpha maps, object-space normal maps, anisotropy and displacement/thickness/anisotropy maps request fallback. Transformed base-color alpha is supported. Baked AO/light maps emit warnings.
- Output is limited by GPU dimensions and an 8-megapixel accumulation budget, with warnings. Texture arrays use a memory budget. Merged instance geometry can exceed GPU dimensions; no silent geometry truncation is intended.
- The runtime supplies scoped compatibility/cleanup workarounds for pinned upstream .23. These are not evidence that all upstream numerical or shadow-mask edge cases are solved.
- Unsupported standalone curves/points and editor-only effects remain subject to the scene adapter's fallback policy. Path-traced canvas pixels do not carry a shared r120 depth buffer.

## Current validation

```sh
node scripts/test-pathtrace-scene-materials.cjs
node scripts/test-pathtracer-runtime-browser.cjs
```

The integration task reports both passed, including **actual WebGL2 GPU rendering** of glass/IOR, roughness, alpha transparency, textures, denoise and exposure. The browser test checks pixel changes, non-black output, finite sample settling and captured runtime errors/disposal calls. It does not certify physically exact BSDFs or comprehensive GPU memory reclamation. The scene test covers the real r120 adapter's sharing, transforms, UV/maps, groups, visibility, lights and cancellation.

`test-render-pathtrace.js` and `test-render-pathtrace-browser.js` now forward to these active CPU/GPU suites, preserving existing test-runner entry points.

Rebuild the isolated runtime after dependency/adapter edits:

```sh
cd scripts/pathtracer-runtime
npm ci --ignore-scripts --no-audit --no-fund
cd ../..
node scripts/build-pathtracer-runtime.cjs
```

Normal application builds use the checked-in browser bundle and do not need a second dependency installation. Rebuild and sync the bundle, its Worker, manifest and license notices together.
