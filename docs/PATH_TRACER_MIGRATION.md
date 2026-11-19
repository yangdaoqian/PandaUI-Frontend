# Path tracer migration

PandaUI uses **three-gpu-pathtracer 0.0.23**, **Three 0.170.0** and **three-mesh-bvh 0.8.3** in an isolated WebGL2 runtime. Denoising uses upstream **DenoiseMaterial / glslSmartDeNoise**, a spatial bilateral-style filter. The existing Three r120 editor and raster renderer remain independent. OIDN and the upstream WebGPU renderer are not included.

## Architecture

```text
r120 document / material library / camera
  -> RenderSceneAdapter: geometry, instances, materials, textures, lights
  -> pathtrace/PathTracer.js: lazy runtime loader and lifecycle wrapper
  -> isolated r170 scene + merged geometry + worker-built BVH
  -> WebGLPathTracer: physical materials, light transport, tiled accumulation
  -> DenoiseMaterial or unfiltered copy: linear HDR -> ACES -> sRGB
  -> persistent canvas -> host compositor
```

The wrapper loads `/shared/pathtracer/runtime.js`, which exposes `window.PandaPathTracerRuntime`. The build source is `scripts/pathtracer-runtime/runtime.js`; `scripts/build-pathtracer-runtime.cjs` produces the runtime, worker assets, manifest and notices in `public/shared/pathtracer/`. The separate package and lockfile pin the dependencies. `xatlas-web 0.1.0` satisfies an upstream peer dependency; the runtime does not use its UV-unwrapping API.

The boundary passes descriptors, typed arrays and image data, not live Three objects or context-owned GPU textures. Geometry/material sharing is preserved during scene conversion, but upstream's WebGL path ultimately merges geometry: repeated instances can increase BVH and attribute memory. Picking, gumball, document ownership and editing remain with the original scene.

See [the wrapper contract](../src/render/pathtrace/README.md) for methods, snapshots and scheduling. The former `scene.js`, `shaders.js` and `PathScene.worker.js` are inactive archival implementation files, not the current rendering path.

## Materials and rendering

The new adapter retains UVs, texture transforms, physical material fields, shared material indices, instance transforms and lights. The runtime supports glass transmission/IOR, opacity, roughness, PBR textures, tangent-space normals, emission, clearcoat, HDR/studio environments and physical ground reflections. It converts supported height bump data to normal maps; this does not displace geometry.

The runtime maps independent `refractionRoughness` to `max(roughness, refractionRoughness)`, so reflection and transmission share the resulting physical roughness. This is an approximation, not separate reflection/refraction lobes. The legacy reflection slider maps to specular intensity. Material descriptors remain the persistence authority.

Denoising is independent of material roughness. The selected filter uses spatial and color-distance weights, with no neural model, temporal history or normal/depth guides. It can soften fine texture and glass detail; compare against denoising disabled. The runtime filters linear accumulation and performs ACES/output conversion once, with straight-alpha handling before nonlinear conversion. The host must not apply a second tone map or gamma transform.

## Compatibility fixes and remaining limits

- The runtime owns cleanup instead of calling the defective upstream .23 disposal method, which references `_renderQuad` although construction creates `_quad`. It also tracks generated resources, low-resolution targets and pending compilation.
- Scene builds are serialized/coalesced to avoid upstream's problematic concurrent generation branch. Stale preparation is cancelled and superseded builds cannot publish current results.
- The runtime contains an alpha-map channel compatibility patch for Three's green-channel convention. Transformed standalone alpha maps are explicitly rejected; transformed base-color maps with alpha are supported. Do not infer full camera/shadow alpha parity from a scalar-opacity test alone.
- UV channels other than UV0, object-space normal maps, displacement/thickness/anisotropy maps and anisotropic BSDFs are rejected with a reason. AO/light maps are treated as baked raster effects with a warning. Unsupported content requests raster fallback instead of silently vanishing.
- Rough transmission is approximate. In .23's active `transmissionDirection`, the normal is perturbed using a sphere sample; `transmissionEval` returns a Fresnel-based expression rather than the matching directional PDF. Upstream explicitly marks this PDF incorrect. The inactive GGX block was reverted after black pixels; uncommenting it is not a validated fix.
- Sampled-normal total internal reflection can yield a zero refraction vector before normalization, even when the macro-normal test permits transmission. For example, exiting IOR 1.5 at 40 degrees passes the macro test, while a half-normal tilted away by 5 degrees gives a refraction discriminant of -0.125. This is a source-level numerical edge case, not a reproduced GPU failure. Any defensive fix must guard before normalization and propagate an invalid sample through BSDF sampling; substituting reflection while keeping transmission probability/color is incorrect. No complete physical BSDF correction is claimed by this migration.
- Glass thickness does not create missing walls. Closed geometry, normals, units and attenuation distance matter. Arbitrary overlapping dielectric media and accurate caustics are not guaranteed.
- Output resolution is bounded by GPU dimensions and an 8-megapixel budget. Texture-array sizing uses a memory budget and emits warnings when reduced. Large merged geometry can exceed GPU limits and request fallback. No large-scene performance multiplier is claimed.

The upstream roughness path already squares perceptual roughness. At 0.05 it starts at 0.0025 before glossy filtering. Diagnose excessive blur by comparing raw output, glossy filtering and denoise separately; do not add the old raster frost remapping to the physical BSDF.

## Scheduling and lifecycle

The host owns frame scheduling. `step` advances one tile; it does not run a perpetual animation loop. Scene/camera changes invalidate accumulation, while exposure and denoise changes can reuse radiance. Sample refinement and status notifications must not increment scene revisions. Stop requesting frames after the sample target and final presentation; use the persistent canvas for subsequent composition.

Runtime failure reports a reason and leaves the host raster fallback available. WebGL2 and floating-point render targets are required; WebGPU is not. Context loss requires recreation. Teardown stops workers, disposes owned scene/render resources and releases the isolated context without disposing the host's objects.

## Why this version

The selected stable WebGL baseline meets this integration's compatibility needs. Upstream's newer WebGPU README warns:

> The WebGPU path tracer is not yet stable and relies on three-mesh-bvh APIs that may change between releases. Lock the three-mesh-bvh version for now.

A published release or npm `latest` flag is not a stability guarantee. The selected WebGL version has established integration APIs; its documented limitations and compatibility patches remain explicit. The erichlof Three/Babylon renderers were also reviewed, but their scene-specific shader/demo architecture would require a larger application adapter.

## Validation

The integration task reports **passed actual WebGL2 GPU tests** for glass/IOR, rough transmission, alpha transparency, textures, denoising and exposure, plus settling and disposal checks. The browser test requires real runtime initialization, compares rendered pixels after parameter changes, checks non-black output and fails on captured shader/page errors. These checks establish working functionality, not an offline-renderer accuracy benchmark or proof that every grazing-angle/alpha-map case is solved.

Current tests:

```sh
node scripts/test-pathtrace-scene-materials.cjs
node scripts/test-pathtracer-runtime-browser.cjs
```

The first checks the actual r120 adapter's material/texture preservation, sharing, transforms, groups, visibility, lights and cancellation. The second exercises the isolated production bundle in Edge WebGL2. Legacy WebGPU tests are not acceptance evidence for the new runtime. Further qualification should include large assemblies, critical-angle glass, masked shadows, transparent backgrounds and repeated import/close cycles.

## Sources and notices

- [0.0.23 package and peer requirements](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/package.json), [WebGL README](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/README.md).
- [Current upstream README and WebGPU warning](https://github.com/gkjohnson/three-gpu-pathtracer/blob/main/README.md). This is a moving document; the quoted warning was checked during the migration review on 2026-11-18.
- [WebGL lifecycle](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/src/core/WebGLPathTracer.js), [scene generator](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/src/core/PathTracingSceneGenerator.js), [material packing](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/src/uniforms/MaterialsTexture.js), [active BSDF source](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/src/shader/bsdf/bsdf_functions.glsl.js).
- [DenoiseMaterial](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/src/materials/fullscreen/DenoiseMaterial.js), [glslSmartDeNoise BSD-2-Clause license](https://github.com/BrutPitt/glslSmartDeNoise/blob/master/license.txt).
- [Three r170 license](https://cdn.jsdelivr.net/npm/three@0.170.0/LICENSE), [BVH 0.8.3 license](https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.8.3/LICENSE), [path tracer MIT license](https://cdn.jsdelivr.net/npm/three-gpu-pathtracer@0.0.23/LICENSE), [0.0.24 release fixes](https://github.com/gkjohnson/three-gpu-pathtracer/releases/tag/v0.0.24).
- Alternatives: [erichlof Three renderer](https://github.com/erichlof/THREE.js-PathTracing-Renderer), [erichlof Babylon renderer](https://github.com/erichlof/Babylon.js-PathTracing-Renderer). Their repository licenses are CC0; bundled engines/assets require separate consideration.

Distributions must retain the MIT copyright/permission/warranty notices for Three, the path tracer and BVH, plus the BSD-2-Clause notice for Michele Morrone's glslSmartDeNoise. The build emits license files and NOTICE.txt beside the runtime. OIDN and its separately licensed model weights are not shipped. Upstream demo assets are not part of this migration.

## Change record — 2026-11-18

Purpose: replace the limited custom path tracer with a maintained open-source engine that handles physical glass, transparency, textures and denoising while preserving the editor and raster renderer.

Changed files: `src/render/RenderSceneAdapter.js`, `RenderEngine.js`, `RenderConfiguration.js`, `pathtrace/{PathTracer.js,index.js,README.md}`, `public/editor/plugins/Render_Nodes.js`; isolated source/package/build tooling in `scripts/pathtracer-runtime/` and `scripts/build-pathtracer-runtime.cjs`; deployment assets/notices in `public/shared/pathtracer/`; corresponding render regression tests and sync allowlist/documentation. Preview additionally changes `PreviewRenderPanel.vue` and `PreviewRenderState.js` for matching quality controls; its independent test and changelog remain in the Preview project.

Validation: 55 scene/configuration tests, 11 physical material/texture snapshot tests and render-node tests passed. The real Edge/WebGL2 runtime test passed IOR, rough transmission, alpha transparency, color textures, alpha-map channel, denoising and exposure pixel comparisons; queued builds, fallback recovery, convergence and awaited disposal passed. The production Preview test passed actual path-traced PNG export with glass, bump/color textures and local HDR; no scene reupload for exposure/sample/denoise changes; zero idle frames; capability/content fallback, Shade/Render restoration, material archive round trips and teardown. PandaUI, Preview and standalone frontend production builds passed; frontend release validation passed. Large private models were not benchmarked in this change.
