# Studio rendering (2026-11-17)

Purpose: improve interactive product rendering in PandaUI and PandaUI Preview using procedural studio panels, planar ground reflections, model-scaled contact detail and bounded cached render passes. The SU7 reference informed the technique selection; no external models, textures or source were copied.

## Controls

PandaUI: connect Environment, Area Light / Sun Light, and Effects descriptors to Render Output. Existing graph port indices are retained; new controls are appended. Environment adds the automotive preset, Studio rotation (degrees), Studio panel intensity and Studio panel width. Light nodes add Studio placement: manual/key/fill/rim. Automatic placements and area dimensions follow model bounds when geometry changes. Area lights provide highlights; r120 area lights do not cast shadows. Use a Sun Light for shadows.

Effects adds Studio floor, Floor auto height, Floor height (world Z), Floor size / model size, Floor color, Floor roughness, Floor reflection and Reflection resolution (128–2048). Also adds AO radius / model size (default 0.02), Bloom threshold (1) and Bloom radius (0.4). The floor is off by default so authored ground is not covered. Studio floor and automotive environment explicitly use the real-time renderer when path tracing is requested.

Preview: Render > Apply automotive studio preset enables automotive environment, three area lights, a fitted shadow sun, a reflective ground receiver, modest AO and highlight bloom. The preset replaces light settings only when explicitly clicked. Individual settings remain editable in Environment, Lights, Studio floor and reflections, and Quality and effects. Settings are included in existing render archive persistence; older saved configurations receive new field defaults.

## Rendering and lifetime

StudioFloor owns an auxiliary Z-up plane, an antialiased mirror capture, a resolved image, a reusable blur scratch target and near/far filtered images. Roughness controls near blur; planar camera distance blends toward the far blur level. View angle controls Fresnel reflection strength. World clipping handles perspective and orthographic views. The plane is temporarily borrowed by the raster proxy and never inserted into document geometry or picking roots. It is not an editable document object.

Reflection targets are bounded independently of viewport resolution (512 by default). A camera/scene/settings revision invalidates the capture. Progressive AA samples share one unjittered reflection and one shadow-map update. Direct raster callers without a revision recapture to avoid stale geometry. Targets are released on disable, below-floor views, resolution changes, render-mode teardown and disposal. Renderer/clipping state is restored even when a source draw callback throws.

AO radius and distance rejection scale to model bounds rather than a fixed eight model units. Depth/normal-aware bilateral filtering avoids mixing foreground occlusion into distant background. A weighted bilinear-comparison PCF kernel smooths shadow edges without filtering packed depth values. This remains filtered shadow mapping, not ray-traced soft area shadows.

## Limits

Planar reflection captures the scene an additional time when dirty; large draw-call counts still cost time. Use 256–512 for large models. Reflection blur approximates rough surfaces; it is not multi-bounce reflection, SSR or global illumination. Reflection capture does not run the screen-space glass refraction prepass. Procedural studio rotation/width apply to studio presets, not imported HDR panoramas. Existing user presets/materials are not silently replaced.

## Files and verification

Shared implementation: StudioFloor.js, RasterRenderer.js, RasterSSAOPass.js, RenderShadowFilter.js, RenderResourceEnvironment.js, RenderResourceLighting.js, RenderResources.js, RenderEngine.js, RenderConfiguration.js and RenderSceneAdapter.js. Node controls: public/editor/plugins/Render_Nodes.js. Preview-specific UI/persistence: PreviewRenderPanel.vue and PreviewRenderState.js. Preview ambient-light and material adaptations are retained.

Source regression scripts: test-render-raster-fixture.js / test-render-raster-browser.js (real pixels, both projections, reflection/shadow caching, exceptions and GPU disposal), test-render-resources.js (studio light fitting), test-render-resources-browser.js (real HDR/PMREM and light shaders), test-render-nodes.js (appended ports, archive compatibility and typed values). The standalone browser resource harness now adapts the shared UMD material schema to ESM for its direct-module test server. These internal source tests and generated fixture screenshots remain in the development project; they are outside the existing frontend export allowlist. Preview's test-preview-render.cjs verifies panel behavior and saved render settings. Shared runtime, node plugin and this document are synchronized explicitly through the source export script.

Validation completed: targeted ESLint; render-node and input-port regressions; 47 scene-adapter/configuration checks; resource ownership and studio placement tests; real HDR/PMREM/light browser tests; WebGL 1 and WebGL 2 raster pixel tests (63 checks in the final WebGL 2 run); Preview production-browser regression including new settings archive round trips and floor GPU release. PandaUI, PandaUI Preview and PandaUI-Frontend production builds passed. Standalone release check passed for 440 candidate files. The floor fixture screenshot was visually inspected. No large-CAD performance benchmark was run, and no remote publication was requested.

## 2026-11-17 - Reflection aliasing and distant ground blur

Cause: the cached mirror capture had no independent AA, and one fixed blur radius made near/far ground equally sharp. StudioFloor now queries color/depth sample support for up to 4x MSAA. Unsupported/WebGL 1 contexts use a bounded 2x-resolution capture, then resolve with FXAA. Two filtered levels are blended using camera distance over model size; blur radius stays consistent across reflection resolutions. The five owned targets remain cached across progressive samples and are all released on disable/disposal. No extra scene geometry pass is added for the far blur. Final viewport FXAA is retained alongside progressive AA when enabled.

Effects/node inputs append Floor distance blur (default 1; zero disables distance blur) and Floor blur distance / model size (default 4). Preview exposes the same fields under Render > Studio floor and reflections and retains them in saved archives. This affects the auxiliary floor reflection, not depth-of-field on model geometry.

Changed runtime: StudioFloor.js, RasterRenderer.js, RenderConfiguration.js; node schema: public/editor/plugins/Render_Nodes.js. Preview UI/defaults: PreviewRenderPanel.vue, PreviewRenderState.js. Source tests: test-render-raster-fixture.js and test-render-nodes.js; Preview archive regression: test-preview-render.cjs. These internal tests stay in their development projects. Both WebGL 1/2 pixel regressions pass 67 checks, including actual reduction of far-level edge contrast, visible distance-blur differences, supported AA paths and release of all five targets. Fixture images were visually reviewed.

Final verification for this revision: PandaUI, Preview and standalone Frontend builds passed; Preview production-browser tests passed, including persistence of distance-blur strength/range and release of all five targets. Standalone release check passed (440 files).

## 2026-11-17 - Frosted glass transmission

Replaced the five displaced sharp background samples with a shared four-level separable Gaussian blur pyramid. MaterialSurface blends adjacent levels using sqrt(max(surface roughness, refraction roughness)); surface roughness maps participate in the shader. Zero roughness keeps the sharp capture. Refraction roughness remains an independent extra blur control; existing nodes, panels and saved material fields need no schema migration. IOR, thickness, tint, Fresnel and opacity behavior are retained. The material sphere uses the same raster path.

The background is rendered once per raster sample for all glass materials. Blur adds eight reduced-resolution fullscreen passes, with two buffers at each of half, quarter, eighth and sixteenth viewport dimensions (approximately two-thirds of a full-resolution color target in total). No additional scene geometry is rendered for blur. Buffers follow interaction render resolution, resize on demand, and are disposed when all glass becomes clear, no glass remains, or the renderer is disposed. Explicit levels support WebGL1 NPOT/HDR without relying on texture LOD extensions. The capture type is recreated if HDR/LDR changes.

This is screen-space transmission, not a volumetric or multi-layer optical solver: off-screen objects and other transparent glass are absent from the background capture. Blur is a viewport-relative artistic approximation, not distance-to-background scattering. The planar floor mirror still uses environment fallback for glass. Path tracing is unchanged.

Changed files: src/render/MaterialRefractionPass.js and MaterialSurface.js in PandaUI and Preview (Preview keeps its runtime schema import). Source-only regression changes: scripts/test-render-raster-fixture.js and test-render-raster-browser.js. These internal tests and generated comparison images are not exported. Purpose: continuous frosting without cross-shaped ghosting, shared work and explicit GPU resource lifetime.

Validation: WebGL1 and WebGL2 each pass 77 raster checks, including actual transmitted contrast at roughness 0/0.35/0.8, unchanged exposed background, independent refraction roughness, shared capture, NPOT resize, sharp-image recovery and buffer disposal. Generated clear/medium/heavy comparison images were visually inspected. Imported-material editor and render-packet persistence tests pass. Production build and export release results are recorded below after completion.

Final validation: targeted ESLint passes. PandaUI, PandaUI_Preview and PandaUI-Frontend production builds pass. Preview production-browser integration passes, including material sphere/live edits, WebGPU fallback coexistence, render archive/material/map round trips and floor lifecycle. Standalone release check passes for 440 candidate files. Runtime changes and this note are synchronized with the source export tool; no GitHub push. Internal test scripts and fixture images remain source-only under the established export boundary.

## 2026-11-17 - Layered glass transmission and shadow cleanup

Cause of the reported colored blocks: the old screen-space refraction pass removed every transmissive material from its one background capture. A frosted pane therefore sampled only opaque geometry and dropped rear glass. In the normal shadow pass, Three r120 treated transmissive materials as opaque casters, so their silhouettes could also appear as colored/dark blocks.

The refraction pass now captures an opaque base once and composites up to eight camera-depth glass bands from back to front. Each band receives its own sharp/blurred transmission input, while the glass source mesh/material identity is restored after the transient render. Shared glass materials are supported through per-source render copies. A common depth texture prevents rear glass from leaking through opaque geometry when the browser supports depth textures; the bounded fallback hides nearer glass and retains the old full-background path. Blur levels remain per band and are released with their stage. Frosted panes participate in the same ordered composition, so alternating frosted and dark transparent panes are accumulated one layer at a time.

Transmissive materials are excluded from shadow-map casting during the raster frame, including mixed material arrays; ordinary opaque objects continue casting shadows. SSAO likewise excludes transparent/transmissive materials from its normal/depth pass. Renderer clipping, visibility, parent references, materials, shadow callback and render targets are restored on success and exceptions.

This remains a screen-space approximation: up to eight object-depth bands, no true recursive refraction, no volumetric absorption, and no physically exact glass shadows. The 8-band cap bounds cost for CAD scenes; distant/off-screen glass is represented by the captured screen layers. Path tracing is unchanged.

Changed runtime files: src/render/MaterialRefractionPass.js, RasterRenderer.js and RasterSSAOPass.js in PandaUI and Preview. Source-only regression files: scripts/test-render-raster-fixture.js and test-render-raster-browser.js. These tests are not exported. Validation and build results are recorded after completion.

Final validation for this revision: WebGL2 and WebGL1 raster browser regressions pass 108 checks each, including layered rear-glass tint, five-pane alternating composition, source parent/material restoration, shared-material distinct layer inputs, opaque-depth occlusion, bounded eight-band cost, stage/depth cleanup, transparent shadow exclusion, ordinary opaque shadows, blur disposal and exception recovery. Targeted ESLint passes. PandaUI and Preview production builds pass; Preview production browser integration passes on the rerun. Standalone Frontend release check passes after this documentation sync.

## 2026-11-17 - Authored scene-material reflections

The reflection intersection pass now keeps its depth source separate from the
beauty capture. The depth material strips the renderer's logarithmic-depth
chunks before compilation and writes conventional RGB packed depth, which is
decoded with the camera near/far range. This prevents a logarithmic value from
being compared with a linear ray distance and producing repeated forward
ghosts. WebGL1 uses the bounded screen-space fallback when a reliable depth
capture is unavailable.

Cause: Three.js `MeshPhysicalMaterial` samples its `envMap` for ordinary PBR
reflection. It does not automatically render the other document meshes into a
reflection buffer. The render-only studio floor already had a planar capture,
but a user-created reflective floor was therefore limited to the environment
map.

The raster render pass now creates one shared scene capture when a document
material has a `pandaSurface` reflection amount above zero. Reflective and
transmissive source slots are excluded while that capture is produced, which
prevents self-feedback and keeps glass transmission's existing layered capture
unchanged. Thin planar reflective surfaces use a mirrored camera, a world
clipping plane and a direct world-position projection, so a floor receives a
true geometric mirror image. Other reflective surfaces receive a disposable
material clone with a bounded screen-space ray search, conventional depth
testing, roughness blur taps and the camera projection. Rays that leave the
viewport or miss the opaque depth use the normal environment-map PBR result as
the fallback. The capture and cloned materials are released as soon as no
reflective material remains or the render engine is disposed. A stable raster
camera/document revision reuses the capture across progressive antialiasing
samples; a changed view, scene or render setting invalidates it.

This is a single-bounce screen-space approximation for raster real-time mode.
It can reflect visible scene objects, but it cannot show geometry behind the
camera or outside the capture view and it does not provide recursive or global
illumination. Path tracing keeps its existing capability checks and falls back
to WebGL for custom reflection settings.

Validation: the raster browser fixture now changes the color of an object above
an authored reflective ground and verifies a pixel delta in the ground region.
The WebGL2 and WebGL1 suites both pass 89 checks.
