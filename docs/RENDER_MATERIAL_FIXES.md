# Material sharing, transmission and idle rendering — 2026-11-18

## 2026-11-19 — Preserve foreground frosting in the final draw

Two reproduced errors survived the earlier layer-count checks. The transmission
prepass sorted by geometry bounds, but Three's transparent beauty draw sorts by
object origin/renderOrder. Imported CAD meshes with baked vertex positions can
all have the same origin, letting a sharp rear pane overwrite the filtered front
pane. In addition, first-free-band allocation could skip a middle pane in a
partial-overlap chain (far left, wide middle, near right).

The correct accumulation is background, farthest pane, successive nearer panes,
then the nearest pane and final display. Bound transmission copies already
contain the rear composition and output alpha one. They now write depth in the
beauty pass so the nearest pane survives arbitrary draw order. Depth writes stay
disabled during layer captures to protect the shared opaque depth attachment;
source materials are restored unchanged. Band allocation places each pane after
all overlapping farther dependencies, retaining the eight-band cost limit.

Changed runtime: `src/render/MaterialRefractionPass.js` in PandaUI and Preview;
exported through the source synchronization script. Source-only regressions:
`scripts/test-render-raster-fixture.js`, `scripts/test-render-raster-browser.js`.
WebGL1 and WebGL2 each pass 114 pixel/lifecycle checks. The new coincident-origin
and partial-overlap tests failed before their respective fixes. Five-pane detail
contrast falls from 45352 to 4160 when only the front pane changes from clear to
roughness 0.8. Repeated frames, authored renderOrder and source depth-state
restoration pass. Comparison images: clear front / frosted front / baked-origin
frosted front in `docs/performance/realtime-optics-20261118/stack-webgl*.png`.

This synthetic validation does not establish that the user's full vehicle is
correct at every view. Intersecting surfaces, several panes within one mesh,
off-screen refraction and more than eight bands remain limitations of the
object-band screen-space approximation. No roughness-strength increase was
used to hide the ordering error.

Final validation: targeted runtime ESLint passed; PandaUI, Preview and standalone
Frontend production builds passed. Preview's production browser integration
passed material/UV edits, HDR, path tracing, idle convergence, mode restoration,
archive round trips and GPU cleanup. Frontend release check passed (469 files).
Port 9009 serves HTTP 200; its actual app.js contains both ordering fixes.
Regression fixtures and images remain in the development source; no GitHub push.

## Follow-up — keep overlapping glass panes in separate transmission bands

The previous bounded compositor divided all transmissive meshes by object
count. In a large vehicle this could put an outer frosted pane and a rear
black pane in the same band. That band had only one captured background, so
the rear pane was skipped while the opaque interior remained visible through
the front pane.

Transmission bands now use camera-projected bounding-box overlap. Overlapping
glass panes are assigned to different depth-ordered bands; panes that cannot
overlap on screen still share a band to preserve the eight-band performance
bound. More than eight panes at one pixel retain the bounded fallback.

Changed files: `src/render/MaterialRefractionPass.js` in PandaUI and Preview,
plus the synchronized PandaUI-Frontend export.

Validation: WebGL2 and WebGL1 raster regressions each passed 106 checks;
Preview integration and all three production builds passed.

## Follow-up — prevent captured transmission from being alpha-blended twice

Cause: the screen-space transmission pass samples a background that already
contains the scene behind the glass, but the bound glass material still wrote
its authored `diffuseColor.a`. WebGL then blended that captured background a
second time, which made low-opacity imported glass expose the vehicle interior
and made layered frosted surfaces look like they were leaking.

Fix: captured transmission layers now write alpha 1 while their background
capture is active. Ordinary materials and unbound material previews keep their
original alpha behavior. Reflection and transmission shader hooks now match
the physical shader output robustly when both hooks are installed on one
material.

Changed files: `src/render/MaterialSurface.js` in PandaUI and Preview, plus
the synchronized PandaUI-Frontend export.

Validation: WebGL2 and WebGL1 raster regressions each passed 106 checks;
Preview browser integration passed; PandaUI, Preview and PandaUI-Frontend
production builds passed.

## Follow-up — isolate floor reflection captures from optical bindings

Cause: the studio floor mirror pass could capture a physical material while its previous frame's screen-space reflection or transmission uniforms were still ready. When an object received a scene reflection setting, that stale optical result could be captured again and appear as broken/duplicated floor reflection.

Fix: `StudioFloor.prepare` suspends scene reflection and transmission readiness while rendering the mirror capture, then restores every uniform state in a `finally` block. The existing stable mirror camera and depth ordered glass composition remain unchanged.

Validation: 106 WebGL2 raster checks and targeted ESLint passed. PandaUI and Preview builds passed; the change is synchronized to PandaUI-Frontend.

## Follow-up — restore the validated optical-layer boundary

An experimental extension briefly classified every ordinary transparent MeshBasic/MeshStandard material as a glass layer. That changed the established vehicle material composition and could make transparent body parts appear to penetrate again. The implementation now restores the validated boundary: only PhysicalMaterial surfaces with Panda transmission metadata enter the eight-layer optical compositor; ordinary alpha materials retain the normal renderer sorting path. The studio floor separately suspends transient optical bindings during its mirror capture so object reflection settings cannot pollute the floor image.

## 2026-11-18 — Stable reflections and transparent frosted layers

Purpose: remove reflection drift during progressive anti-aliasing and keep transparent surfaces behind frosted glass in the same depth-ordered optical composition.

Changed files: `src/render/MaterialRefractionPass.js`, `src/render/RasterRenderer.js`, `src/render/StudioFloor.js` in PandaUI and Preview. Authored alpha-transparent physical materials now participate in the bounded optical-layer capture, while alpha-test materials remain ordinary geometry. Reflection captures use a stable, unjittered camera and reuse one capture across AA samples; the beauty pass may still use its jittered camera. Studio floor reflections use the shared Z-up mirror-camera calculation and invalidate when the receiver plane moves.

Validation: 106 WebGL2 raster checks passed, including layered transmission, transparent ordering, reflection cache reuse, Z-up perspective/orthographic floor reflections and resource cleanup. Preview integration tests and PandaUI/Preview production builds passed. PandaUI-Frontend was synchronized and its production build plus release check passed (469 candidate files).

Purpose: merge equivalent imported materials into shared references, reduce low-roughness frosting, and stop idle ready/rendering cycles.

## Changes

- `src/render/MaterialSurface.js`: recognize only the engine's own unchanged shader hooks for identity comparison; preserve unknown plugin hook isolation. Replace square-root transmission blur with `4 * roughness^1.5`. Roughness 0.05 now selects level 0.0447 instead of 0.8944. Reflection response is unchanged.
- `src/render/MaterialIdentity.js`: compare shader behavior and full-precision material values, ignoring names, source IDs and edit-history flags. Texture identity and UV state remain distinct.
- `src/render/ImportedMaterialEditor.js`: merge equivalent edited/imported materials, assign the shared reference to all affected mesh slots, and keep document/permission boundaries intact. Repeated catalog reads do not invalidate an already merged scene.
- `src/BackendPandaUIDoc.js`: remove names from appearance signatures; retain optical depth, reflection, refraction, bump and normal settings. Keep deferred textured sources separate until their images can be compared.
- `src/AdaptiveViewport.js`, `src/DisplayPipeline.js`: distinguish explicit invalidation from renderer refinement requests. Idle full resolution remains stable while anti-aliasing converges; edits, navigation and imports resume adaptation.
- Corresponding six runtime files are synchronized to PandaUI_Preview, retaining its schema import paths and status-event integration, and to PandaUI-Frontend with the export script.
- Synthetic regression scripts and the synchronization allowlist/documentation are updated. No model assets or backend/native sources are exported.

## Validation

- `node scripts/test-imported-material-editor.js`: shared references, edited archive identities, parameter differences, mixed material slots, unknown shader hooks, permissions and repeated catalog reads passed.
- `node scripts/test-render-raster-browser.js`: real WebGL pixel/shader regression passed. Roughness 0.05 retains at least 90% of clear-glass checkerboard contrast; 0.5 and 0.8 progressively blur. Reflection, layered glass and resource cleanup checks also pass. Run with Playwright available via NODE_PATH if it is not locally installed.
- `node scripts/test-render-idle-loop.cjs` and the same command with `../PandaUI_Preview`: CPU fallback and GPU timing scenarios settle without idle redraws; interaction and loading resume rendering.
- Existing viewport/display and shared-invalidation regressions passed; targeted ESLint passed for the changed rendering/viewport modules.
- PandaUI_Preview production build and `node scripts/test-preview-render.cjs` passed. Browser regression saves two separately identified equal glass materials, reopens them as one shared entry, edits the material, verifies idle drawing stops, and covers archive/texture/HDR restoration, UV, WebGPU, floor reflections and resource cleanup.
- PandaUI-Frontend production build and release check passed.

The regressions use generated models, not the user's full vehicle archive. Equal names alone do not imply equal materials; differing textures, UV settings, colors or optical parameters remain separate. Material edits remain scoped to the current document. Reopen the archive after loading the new application code to rebuild the catalog.

## Follow-up — open reflective surfaces and distance-dependent frosting

Purpose: stop rear objects bleeding through open reflective faces, remove mirror-frustum seams and make frosted transmission retain contact detail while progressively losing distant detail. This supersedes the fixed roughness-only blur mapping described above.

Changes:

- `src/render/MaterialRefractionPass.js`: opaque reflection clones retain the source depth-write state. Mirror cameras reflect their actual local +Y screen basis, including Z-up, roll and parent transforms. Packed depth capability is restored after target resize. Reflective-only scenes no longer allocate unused transmission targets. Rough glass gets separate conventional RGBA depth attachments; the opaque scene is drawn once for depth, and subsequent bands copy color/hardware depth and draw only the preceding glass band. Overlapping panes are separated by projected screen bounds into up to eight ordered bands, while disjoint panes share a band. The sample texture is never the current framebuffer attachment. Clear glass, mode changes, resize and disposal release these targets.
- `src/render/MaterialSurface.js`: correct the RGBA depth byte order; require a depth crossing, bounded intersection error and six refinement steps for screen-space reflection. Missing depth retains native environment lighting. Reflection image borders fade smoothly. Remove the duplicate opaque specular contribution. Transmission radius uses the glass-to-background depth gap, refracted direction, perceptual roughness squared and camera projection, with separate perspective/orthographic handling. Four Gaussian levels at 1/2, 1/8, 1/32 and 1/128 cover contact through distant diffusion without increasing the blur sampler count. Light is spread rather than artificially darkened with background distance. Each bound pane samples the already-composited result from the preceding depth band, so frosted panes do not skip rear transparent panes.
- `scripts/test-render-raster-fixture.js`, `scripts/test-render-raster-browser.js`: add real pixel tests for open-face occlusion, mirrored camera coverage, contact/distant frosting, conventional depth decoding and target disposal. Synthetic near/far images are written to `docs/performance/realtime-optics-20261118/` in the development project.

Validation: 106 real WebGL2 checks and 106 WebGL1 checks passed. At roughness 0.6, contact checker detail retains over 95% of the clear image; distant contrast falls to about 10% in the perspective fixture and below 1% in the orthographic fixture. Opaque open surfaces reject rear-color bleed, and rolled/parented Z-up cameras retain complete planar reflection coverage. Imported material editor/resource tests and targeted ESLint passed. Preview and standalone production/build integration validation is recorded in the synchronization/Preview changelog.

Scope: the changes apply to real-time rendering and its fallback, not the separate path tracer. This remains a bounded screen-space approximation, with at most eight glass bands and screen-visible depth; it cannot recover hidden/off-screen geometry or provide exact multi-medium transport. Each rough-glass band owns an RGBA8 depth image plus depth buffer at the bounded render resolution. One additional opaque depth draw is required when rough transmission is active; later bands reuse it. Browsers without fragment-depth support retain a roughness-only fallback. The user's full vehicle scene was not benchmarked in this change.

Final validation for this follow-up: PandaUI_Preview production build and its full browser integration test passed, including material edits/selection, save/load, HDR, path-traced export, idle convergence and raster restoration. PandaUI-Frontend production build and release check passed. Shared Preview files match the source except for its required schema import adaptation. No backend or native geometry files were changed.

## 2026-11-19 — Mirror optics and editable retained material library

Purpose: make floor captures evaluate glass from the mirrored camera, and provide
Preview with a standalone material library and predictable folder saving.

Changed shared files:
- `src/render/StudioFloor.js`: owns a separate transmission compositor for the
  mirrored view; disables recursive object reflection while capturing; releases
  its targets with the floor. Requests packed 24-bit depth/stencil (including
  supported MSAA formats), avoiding Three r120's 16-bit depth-only default.
- `src/render/MaterialRefractionPass.js`: optional reflection exclusion for the
  bounded mirror compositor. Existing main-view behavior remains the default.
- `src/render/ImportedMaterialEditor.js`, `src/DisplayPipeline.js`: copy, rename,
  apply-to-selection APIs. Intentional library copies have persistent identity
  and independent texture state. Unused entries can be edited/previewed. Apply
  changes selected mesh slots only; it does not invoke whole-document material
  pool replacement. Selection is unchanged. Cross-document/readonly assignment
  is rejected explicitly; current application is within the material's document.
- `src/storage/LocalDocumentArchive.js`, `src/collaboration/SceneDisplayPacket.js`:
  retain library identities and unused materials in full and render-only archives;
  include library state in concurrent-edit checks and release it at document close.
- `scripts/test-imported-material-editor.js`,
  `scripts/test-render-raster-fixture.js`: regression coverage for these behaviors.

Preview-specific files: `src/layouts/MainLayout.vue`,
`src/components/PreviewRenderPanel.vue`, `PreviewMaterialPanel.vue`,
`PreviewFilePanel.vue`, `src/PandaUIApp.js`, and
`scripts/test-preview-render.cjs`. Materials now has its own dock and context menu.
Save reuses the opened writable render archive; Save as chooses a new destination.
An HTTP case cannot write its server folder from a frontend browser: choosing its
matching local archive binds that writable folder, or a parent creates a copy.
Mismatched archive IDs and stale commits are rejected before overwrite.

Validation: 116 WebGL1 and 116 WebGL2 checks passed, including a previously failing
mirror-frost pixel test, close CAD-shell visibility, cache reuse and GPU cleanup.
The shell test is a precision guard, not proof that 16-bit depth alone explains
all artifacts in the user's screenshot (drivers may promote requested formats).
Material editor tests and PandaUI/Preview production builds passed. Preview's
browser integration passed actual context-menu copy/rename/apply, unused material
persistence, selection independence, save-as, reopening then saving without a
picker or nested archive, texture/HDR/UV round trips, and idle convergence.
Real-time glass remains a bounded eight-band approximation; mirror optics add
capture work on scene/camera changes, not on already-converged idle frames.

Additional authored-ground fix: reflective curved objects no longer disable the
largest planar receiver's mirror. The dominant plane keeps a mirrored capture;
other reflectors use one separate SSR capture. The planar capture excludes only
its own receivers, retaining other reflective objects and evaluating glass from
its own mirrored view. Recursion is disabled. This addresses the reproducible
case where enabling reflection on the body removed that body from the floor
capture. The old code fails the new mixed-reflector regression. The new code
passes it, plus reflected-body pixel changes, authored-floor glass blur and
release of unused glass/SSR buffers. Multiple non-coplanar mirrors still share
only one dominant planar capture; other planes use SSR to bound resource costs.

Final optical regression count: 121 WebGL2 checks (WebGL1/build/export results
recorded in the accompanying synchronization log). The bundled vehicle case
opens without browser errors, but contains 73 source materials with no active
transmission; it is not the exact edited glass setup in the user's screenshot.

Final validation: WebGL1 and WebGL2 each pass 121 checks. PandaUI, Preview and
PandaUI-Frontend production builds pass. The final Preview browser integration
passes, including binding an HTTP-style read-only case to its matching local
archive without nesting. Standalone release check passes for 469 candidate files.
Shared runtime/tests were synchronized by explicit source export; Preview-only
panels/save policy remain in Preview. No GitHub publication was performed.

## 2026-11-19 — Material names participate in deduplication

Purpose: equal appearance with different names must remain independently editable.
Changed `src/render/MaterialIdentity.js` to include the exact material name, and
`src/BackendPandaUIDoc.js` to include the displayed import material name in its
appearance signature. Both catalog sharing and initial import pooling now require
matching names as well as matching render state. Preview receives both changes.
Updated `scripts/test-imported-material-editor.js` for named identity/isolation;
Preview's browser regression also checks distinct names survive an archive round
trip, then verifies matching names and appearance still merge.
Validation: material editor regression passed; production and browser validation
is recorded below. Existing already-merged data has no recoverable original names;
reopen the original source archive to apply the corrected import rule.

Material-name validation completed: initial import pool distinguishes different
names and shares same-name equivalents; the editor regression and Preview full
browser regression passed, including archive name preservation. Preview and
standalone builds/release check passed. BackendPandaUIDoc has 33 pre-existing
lint findings outside the changed signature; this change does not reformat them.

Preview-only save follow-up (not exported to the standalone PandaUI UI): built-in
cases are HTTP archives, not writable folder handles. `PandaUIApp.js`,
`storage/CaseLocalDirectory.js` and `components/PreviewFilePanel.vue` now retain
an explicitly authorized case destination in IndexedDB after successful commit.
Later case opens read the saved local archive and Save updates it. Revoked read
permission or replaced document IDs produce explicit errors instead of silently
opening an old website version. First-time browser folder authorization remains
necessary. Failed/cancelled save requests now show an error rather than disappear.
`storage/HttpArchiveDirectory.js` fetches mutable commit pointers without cache;
content-addressed packs retain caching. Preview-specific files stay in Preview.

Final save validation: Preview browser integration passed material-name roundtrip,
context menus, local overwrite, and persistent case reopening/saving without a
picker. The bundled vehicle archive (9,958 display entries) saved and reopened in
16.46 seconds in a disposable browser-managed test directory, restoring 2,241
root objects. This verifies serialization/reopen, not the user's OS permission
state. Commit-pointer cache policy test and targeted Preview ESLint passed.

## 2026-11-19 — Separate Preview folder selection from write authorization

Reported: selecting a folder and confirming was followed by the generic AbortError
message. That message did not identify whether selection, authorization or writing
failed; no user cancellation is inferred.
Preview-only changes: `src/PandaUIApp.js` now selects a readable folder first,
then queries/requests readwrite permission separately, preserving the selected
handle when authorization fails so the next Save retries permission without a new
picker. Save errors retain phase, original error name/message and cause; console
context includes secure-context and activation state. `PreviewFilePanel.vue`
shows the original staged error as copyable text instead of masking all aborts.
`scripts/test-preview-render.cjs` simulates a returned folder followed by rejected
write consent, verifies the stage, then retries without another folder selection.
Browser/OS authorization itself remains outside application control.
Preview build and targeted ESLint passed. These are Preview-only UI/save changes;
only this change record is synchronized to PandaUI-Frontend.

Final verification: full Preview browser integration passed, including a synthetic
AbortError at requestPermission after successful folder selection, staged error
reporting, and retry/save with exactly one picker invocation. Subsequent save-as,
case binding, reopened overwrite and material/texture/HDR round trips passed.
Standalone release check passed (469 files); executable frontend export files
are unchanged in this Preview-only follow-up. The user's native permission flow
has not been reproduced, so the original OS/browser cause remains unconfirmed.

## 2026-11-19 — Per-pixel distance frosting through rear glass

Purpose: near parts of a background object remain clear while farther parts blur,
including when another transparent pane sits between the frost and the object.
The existing MaterialSurface shader already samples RGBA depth at the refracted
pixel and derives a pixel blur radius from its gap/projection; object-center depth
is used for band ordering only, never as the object's single blur distance.

Bug: captureTransmissionDepth overwrote the transmitted background depth with the
preceding glass surface. A close clear sheet therefore capped the apparent gap,
keeping a distant object as sharp as a near one (pre-fix perspective contrast:
28928 near and 28928 far).

Changed `src/render/MaterialRefractionPass.js`: carry the per-pixel transmitted
background depth forward across glass bands instead of treating each glass pane
as an opaque depth stop. All rear glass colors remain in the composed color input;
ordinary opaque occlusion is retained. The skipped pane depth draw also avoids
extra geometry work. Existing attachment ownership and cleanup are unchanged.
Same implementation is synchronized to Preview and Frontend.

Changed `scripts/test-render-raster-fixture.js`: perspective/orthographic checks
with a close transparent intervening sheet; a single mesh with a sloped middle
and near/far portions verifies spatially different blur within one object.
Validation: 128 WebGL2 checks passed; perspective near/far contrast is now
28928/2962, orthographic 43392/87. The single-mesh near contrast ratio is 1.000
and far ratio 0.000 at test roughness 0.6. WebGL1 also passes 128 checks.
No global roughness boost or object-level blur constant was introduced.
This is still layered screen-space transmission, not exact multi-interface ray
tracing; the depth represents transmitted background rather than separately
resolving each pane's reflected/diffuse and transmitted contributions.

Final validation for per-pixel frosting: PandaUI, Preview and Frontend production
builds passed; standalone release check passed (469 candidate files). Focused
WebGL1/WebGL2 pixel tests each pass 128 checks, including glass ordering, mirror
captures, same-mesh distance variation and resource disposal. Preview 9009 was
restarted with the synchronized runtime. The user's edited vehicle configuration
was not independently reproduced; validation uses controlled pixel fixtures.

## 2026-11-19 — Calibrated roughness/distance diffusion gradient

User targets: roughness zero stays clear; roughness .5 loses recognizable detail
at a 1000 mm glass/background gap; roughness one reaches fully diffused frosting.
Interpretation: diffuse transmission removes directional detail without setting
opacity/transmission to zero or darkening transmitted light artificially.

`src/render/MaterialSurface.js` retains the projected geometric blur and adds a
smooth diffusion weight per fragment:

    q = (d / D0) * (r / (1-r))^2
    diffusion = 1 - exp(-ln(100) * q^2)

Here d is sampled transmitted-background gap along the refracted direction,
r=max(surface roughness, refraction roughness), D0 is frostDistance. Explicit
endpoints give diffusion(0,d)=0 and diffusion(1,d)=1; exponent input is bounded.
Blend the geometric blur into the broadest Gaussian level using this weight.
This is an artist-calibrated layered raster approximation, not a measured glass
BSDF. D0=1000 MODEL UNITS by default: 1000 mm in millimetre models, set D0=1 in
metre models. There is no implicit unit conversion inferred from object size.

`public/editor/shared/MaterialSchema.js` and Preview's adapted runtime schema
expose/save frostDistance. `public/editor/plugins/Material_Nodes.js` appends its
input after existing texture ports to preserve saved links and gives its widget
a usable range. `src/BackendPandaUIDoc.js` preserves it in appearance conversion,
material settings and deduplication. Preview shares the renderer with its schema
import adaptation. Shader cache identity advances to surface-v5.

`test-render-raster-fixture.js` verifies .05 preserves detail at 1000 mm, .5/1000
and 1 diffuse it, monotonic distance response at 1/100/500/1000 mm, and equivalent
metre/millimetre reference settings. WebGL1/WebGL2 each pass 132 checks. Test
contrast at roughness .5 falls 43392 -> 37915 -> 5572 -> 88 across those gaps;
roughness 1 has zero checker contrast. Existing single-mesh per-pixel, near-contact,
multi-glass, mirror, alpha and GPU-release tests remain passing. Material/editor,
render-node, scene-material-node and append-only input-port tests passed.
Preview browser save/reopen regression now includes nondefault frostDistance=750.
Path tracing retains its separate physically based roughness model; this new
artist calibration applies to real-time rendering and mirrored raster captures.

Gradient final validation: PandaUI, Preview and standalone production builds
passed. Preview's full browser integration passed, including nondefault
frostDistance=750 through save/reopen and existing permission-retry tests.
Standalone release check passed (469 candidate files); shared source files were
selectively synchronized. Preview retains its schema import adaptation and UI.
Port 9009 restarted with the calibrated shader. This is synthetic visual
validation, not a guarantee for every material configuration in the user's model.
