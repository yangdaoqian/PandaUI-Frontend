# RenderEngine integration contract (Three r120)

```js
const resources = new RenderResources({
  renderer,
  invalidate: ({ reason, objects }) => {
    // Invalidate/materialize/rebuild affected display batches and request redraw.
    // Include restored objects: they may no longer have any binding.
  },
  onStatus: ({ state, generation, issues }) => { /* publish render status */ }
})
await resources.apply({ environment, lights, bindings }, {
  scenes: [modelScene, previewScene],
  resolveTargets: ids => ids.flatMap(id => lookupStableObjectId(id))
})
resources.attach(modelScene)
renderer.render(modelScene, camera)
resources.detach()
// On import/visibility/scene revision; no texture loads or PMREM regeneration:
resources.refreshTargets({ scenes: [modelScene, previewScene], resolveTargets })
// On render-mode exit or engine teardown:
resources.dispose()
```

- `apply` is a full replacement snapshot, returning `{ applied, generation, issues }`. Only the newest generation commits. A failed load leaves the previously committed state intact and returns `applied: false` with `resource-error`; superseded/disposed generations return `applied: false` without publishing stale status. Applying after disposal rejects. An empty snapshot clears material/environment overrides and selects default lighting.
- `refreshTargets(context)` and its alias `updateScene(context)` are synchronous and return `{ applied, generation, issues }`. They reuse loaded textures, PMREM, the lighting group and unchanged materials, resolve newly imported targets, refit shadows, and reassert overrides after `updateVisibility`/display-mode resets. Omit context to reuse the last one. Before the first commit they update the pending context and return `applied: false`. Identical descriptor JSON passed to `apply` also takes this fast path; identical pending descriptors share loading. Blob identity is included in the key. Pass only resource descriptors, not scene objects, in the snapshot. In-place source material changes marked `needsUpdate` recreate only the affected clone.
- `environment` is a read-only PMREM texture getter; `background` is a separate cube texture, a studio Color, or null. All supplied scenes (including preview scenes) receive environment/background changes. With an environment, `background: false` clears the scene background; removal/disposal restores its baseline. Studio/sky use procedural Z-up radiance; HDRI uses `RGBELoader` with half floats. Sky uses a generated equirectangular DataTexture (no canvas dependency) as its panorama; sky/HDRI convert to explicitly owned cube targets for the visible background, never the PMREM atlas. Original panorama sources are retained with those backgrounds. Intensity controls local material `envMapIntensity`, since r120 lacks scene environment intensity. It does not change backdrop brightness. Environment capture saves/restores shared renderer settings and disables document clipping during generation.
- `lightScene === rig` is a **Group**, not a separately rendered Scene. The rig must be a descendant of the actual scene passed to `renderer.render`. `attach(scene)` reparents the rig and fits its shadow cameras; call it per pass, especially if scene transforms change. It cancels scene-root transforms to preserve world-space positions. One rig cannot illuminate multiple scenes simultaneously: attach it before each scene's pass. Geometry from all supplied scenes contributes to shadow bounds.
- All positions/targets are world XYZ, Z up; spot angles are **radians**, area width/height use model units. Empty/missing lights select ambient + directional defaults. Any nonempty authored list suppresses defaults, including a zero-intensity light. Unsupported area shadows report an issue and stay disabled. RenderEngine scopes shadow-map enablement and PCF filtering to its draw and restores the viewport's settings afterward.

### Shadow and wire controls

`Render Effects` appends `showEdges` (false), `showCurves` (true), and `shadows` (true). Visibility overrides apply after render batches are prepared and are restored even when drawing fails. Analytic CAD edges and triangle-edge overlays are distinct from standalone curves. Triangle-based thick-line shaders are excluded from material conversion and shadow-caster meshes. Path tracing falls back to raster when visible edges or disabled shadows are requested.

Light nodes append these fields without changing existing port indices:

| Field / node label | Default | Behavior |
| --- | --- | --- |
| `shadowResolution` / Shadow resolution | 2048 | Rounded down to a power of two, capped by hardware and 4096. Point lights account for their 4×2 atlas. |
| `shadowBias` / Shadow depth bias | -0.0002 | Normalized depth offset, range -0.01 to 0.01. |
| `shadowNormalBias` / Normal bias (-1 = auto) | -1 | Auto uses one quarter of a shadow texel in model units. Nonnegative values supply a model-unit offset. |
| `shadowRadius` / Shadow softness | 1.5 | PCF kernel radius, 0–8. This is a filtered shadow map, not physical area-light penumbra. |
| `shadowExtent` / Shadow extent (0 = auto) | 0 | Sun only: 0 fits visible model bounds; positive values set the width/height around Target in light space. |
| `shadowAutoFocus` / Auto shadow focus | true | Excludes oversized, thin horizontal ground receivers from sun XY fitting, while retaining the full scene depth range and all casters. Manual extent takes precedence. |

Auto focus detects horizontal receivers whose shorter span is at least four times the volumetric model size. Smaller sheets remain in the fitted model. Disable it for unusual scenes, or set a manual extent around Target. A larger resolution cannot compensate for an excessively large projection. Too small an extent clips shadows outside that region. Hidden geometry does not expand the bounds. Projection translation snaps to shadow texels. Node-owned render material clones use a 3×3 bilinear depth-comparison filter (36 depth comparisons) to avoid r120's nearest-sample PCF stair steps, without changing the editor's materials or global ShaderChunk. Shadow softness controls the kernel radius; this is not physical area-light penumbra.
- `resolveTargets(ids)` is synchronous and returns an Object3D, iterable of Object3Ds, or nothing. It runs after loads finish so streamed/replaced meshes resolve fresh. Binding targets need not belong to `scenes`. The parent filters read-only/document permissions here. Last binding wins on overlapping meshes. Call `refreshTargets` when geometry streams in, mode materials reset, or bounds change.
- Overrides affect `mesh.material` and a private shallow copy of `userData.displayMaterials` with replaced `render`. Material arrays retain their slot count; geometry, groups, IDs, selection keys, render material IDs, and document metadata are untouched. Original materials/textures are borrowed and never disposed. Unspecified material fields/textures inherit originals; explicit null/empty texture sources clear that slot. Temporary render settings are intended for render mode; dispose before switching back to document shading/editing. External replacements of material references are not overwritten during restoration.
- Node-preview meshes receive global environment clones, intensity and shadows while remaining excluded from binding assignment. Their tags, geometry and document membership are untouched. Render batches, selection highlights, clipping helpers, shadow ground, and this rig are excluded. This class performs no baking or document writes. The parent must not bake while overrides are installed.
- Material color/emissive and light/gradient colors are authored sRGB. `map`/`emissiveMap` use sRGB encoding; all data maps use linear encoding. Plugin roles map as follows: color→map, normal→normalMap, roughness→roughnessMap, metalness→metalnessMap, emissive→emissiveMap, opacity→alphaMap, ao→aoMap, clearcoat→clearcoatMap. Explicit Three slots take precedence. Alpha maps enable transparency. Existing UV/UV2 attributes are used as-is; no UVs are generated. Sources accept strings or `{kind:'render.texture',url,role}`; the material slot determines encoding. Strings may be HTTP(S), relative, `data:`, or `blob:` URLs. `Blob`/`File` objects are also accepted; only object URLs created internally are revoked. Caller-owned blob URLs remain caller-owned. Sources are cached per generation and encoding. Imported original DataTextures are borrowed and never disposed.
- Legacy untyped transmission requests still report `unsupported-transmission` and stay zero without changing opacity. Typed Scene Material descriptions use `MaterialSurface` and the raster renderer's background-capture pass for screen-space refraction. IOR maps to dielectric Fresnel reflection using r120's reflectivity parameter over [1, 7/3]; out-of-range values report `unsupported-ior` and clamp. Screen-space transmission excludes off-screen geometry, nested glass, caustics and physical transmission shadows. See `docs/architecture/scene-material-nodes.md`. Area lights initialize global Three LTC uniforms once; these lookup textures belong to Three, not an individual resource manager.
- `invalidate({ reason, objects })` fires once per committed apply/refresh/dispose, after restoration/replacement, with the union of old/new affected meshes. Map meshes to roots for `services.invalidate(root)` and deduplicate in the parent if needed. It does not run for failed or stale generations. `onStatus` emits `loading`, `ready`, or `error`, with structured issue codes. Callbacks should be synchronous, nonthrowing, and must not recursively call `apply`/`dispose`.
- Optional constructor adapters `textureLoader`, `rgbeLoader`, `createPMREM(renderer)` and `createCubeTarget(size)` support deterministic headless testing. Production defaults use real r120 loaders/PMREM/cube targets. GPU/loader allocations belong to a generation and are released on replacement, failure, cancellation, or disposal. In-flight browser image requests cannot always be aborted, but their callbacks cannot commit stale state.

Run focused tests: `node scripts/test-render-resources.js`.

Run actual r120 GPU/background/shader checks: `node scripts/test-render-resources-browser.js` (requires Playwright and installed Microsoft Edge; dependencies can be supplied through `NODE_PATH`). The test reads sky/HDR backdrop pixels, runs physical/area/shadow shaders, and checks shared renderer state restoration.


## Progressive real-time AA and configuration updates (2026-11-17)

RenderEngine uses quality.rasterSamples (default 8, range 1-32). During interaction it renders one FXAA frame at interaction scale; after 180 ms idle it accumulates paired Halton-jittered frames. RasterAccumulationPass averages linear radiance before bloom, ACES and output encoding. It is static progressive supersampling, not motion-reprojected TAA or a path-tracing denoiser.

Camera world/projection, viewport size, effect settings, scene/config revisions and clipping changes reset history. The camera matrices are restored after each draw. A completed image is reused without further scene draws. Direct RasterRenderer callers default to one sample and must advance quality.revision for scene, material, environment or visibility changes when enabling accumulation. Both history targets are lazy, have no depth buffers, and are released during single-sample interaction, disable and disposal. Half-float history costs about 16 bytes per pixel for both buffers (about 31.6 MiB at 1920 x 1080), excluding existing raster targets. Set rasterSamples to 1 to disable accumulation; FXAA remains controlled separately.

Exposure/quality/camera-only configuration changes reuse the current environment, lighting and material resources. A ready isolated WebGL2 path-tracing scene is retained when its resource, ground and visibility descriptors are unchanged; camera and sampling changes remain handled by the path tracer. Geometry/material changes still invalidate its scene. Raster image export completes the requested AA budget and honors cancellation.

Selection is one-way: scene object selection/reselection locates its material; library choice never selects an object. Catalog refresh and material edits retain a manual library choice. Selection notifications carry a monotonically increasing selectionRevision for actual object-selection events, separate from material-change notifications.

Changed runtime: RasterAccumulationPass.js, RasterRenderer.js, RenderEngine.js, RenderConfiguration.js, ../PandaUIApp.js, ../display/SceneSelection.js, ../composables/useEditorBridge.js, and public/editor/plugins/{Material_Nodes,Render_Nodes}.js. Source regression scripts test-render-raster-fixture.js, test-render-nodes.js and test-render-input-ports.js cover these changes and stay in the development project (outside the export script allowlist).

The path-tracing backend has been replaced with the isolated three-gpu-pathtracer runtime; see [migration details](../../docs/PATH_TRACER_MIGRATION.md). Current acceptance includes 55 adapter/configuration cases, 11 physical-material snapshot cases, real GPU material/denoise/lifecycle tests and Preview production-browser integration. Prior raster regression coverage remains separate. No full-size scene performance or image-quality benchmark is claimed.
