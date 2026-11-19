# Browser SketchUp import

Select **File processing → Frontend · NodeC WASM**, then open a `.skp` file.
The shared frontend file-processing mode also routes SKP files to a JavaScript
decoder in a dedicated Web Worker; SKP decoding itself does not use NodeC WASM,
Rhino, SketchUp SDK, or an HTTP conversion service. Backend · Native remains
available. Imported SKP faces are editable display meshes, not NURBS/Breps.

## Implementation

- `src/import/ModelFileFormats.js`: shared file dialog/drop/dispatch catalog.
- `src/import/LocalImport.worker.js`: lazy runtime loading, parse progress,
  bounded pull batches, transferable buffers, completion and failure cleanup.
- `src/import/SketchUpImport.js`: face-loop triangulation with holes, face
  winding, smooth-corner adjacency, source edges, material buckets, hierarchy,
  instance transforms, visibility, warnings and progressive display packets.
- `src/import/DisplayObjectImport.js`: shared editable scene mounting,
  SketchUp material/edge policy, hidden wrappers and occurrence ownership.
- `src/PandaUIDoc.js`: initial mesh topology visibility follows Display settings.
- `src/PandaUIApp.js`: first-batch and throttled progressive SKP redraws.
- `src/render/ImportedMaterialEditor.js`: propagate material edits to the
  import-time shared library, so later batches keep the edited appearance.
- `public/shared/skp/PandaSkp.js`: pinned, browser-only parser bundle (~79 KB
  uncompressed), loaded only for SKP. Licenses are in `NOTICES.txt`.

The parser reads the source once, preserving definitions and placements. Display
generation happens during bounded worker pulls. Source edges are sent before
smooth-normal calculation and triangulation, with an explicit batch boundary
so they can become visible immediately. Mesh buckets flush at about 12,000
vertices or 40 ms between faces; source edge packets flush at about 6,000 segments. A single
large face is triangulated as a whole. The existing importer bounds each batch
by elapsed time, record count and bytes, yields while mounting, and terminates
the worker on cancellation/completion. Transfer buffers never alias a later
instance's mutable data. Unused definitions are released before display
generation; each referenced image is transferred/decoded once, its encoded bytes
released, and its GPU texture owned by the document. Raw geometry/indexes and
the import-time material lookup are released at EOF or cancel.

The first available batch triggers a redraw; subsequent SKP redraws run at up
to 4 Hz even below the general 30 MiB redraw threshold. New batches configure
only their new subtree, avoiding repeated traversal of a growing instance.
All batches remain attached to one editable occurrence; live transforms and
hidden state are preserved when later geometry arrives.

For modern VFF files this is **progressive scene construction after container
decompression and metadata decoding**. Component geometry is decoded on demand;
individual vertex/edge/face TLV records are consumed without retaining their
complete nested syntax tree. A shared definition is decoded once and released
after its last occurrence. Legacy files still decode their entity graph upfront.
This is not a range-reading/constant-memory SKP decoder: the decompressed
container and the largest component must still fit browser memory. The import
has no artificial file-size limit; browser memory limits still apply.
Definition lookup/normal indexing is reused
for consecutive placements; arbitrary repeated placements are not a GPU
instancing implementation.

## Display contract

Geometry/edge rules follow the existing PandaUI native SKP importer. The
frontend additionally integrates the same editable material library used by
3DM, including embedded diffuse textures and inherited component materials:

| Aspect | Policy |
| --- | --- |
| Coordinates | Keep Z-up; inches × 0.0254 → metres, including transform translations. |
| Objects | One editable root per drawable group/component occurrence; nested placements have unique hierarchy paths. Mesh/edge batches join that occurrence. |
| Faces | Polygon loops with holes; front RGB and opacity; default RGB 154,167,181. |
| Shaded mode | Opaque, double-sided Phong; render mode uses source opacity. |
| Render material | Roughness 0.72, metalness 0, clearcoat 0. |
| Material library | Named, stable source IDs; shared render references across batches and occurrences. Equal untextured appearances share one entry. Scene Material supports live edits, types, file-picked replacement textures and sphere previews. |
| Textures | Embedded diffuse images, repeat tiling and face UV transforms; group/component material inherited when a face has no explicit front material. Render colour uses the same sRGB-to-linear conversion as 3DM. |
| Normals | Corner-angle weighted normals across source edges marked smooth, verified against the native SDK; retain sharp creases. |
| Source edges | Exclude soft OR smooth edges; retain hidden edge parts structurally. Dashed feature lines, colour #37474f, opacity 0.72. |
| Mesh topology | Separate dashed triangle-topology overlay, colour #607d8b, opacity 0.55; controlled by Mesh edges. |
| Visibility | Explicit hidden flag AND Tag visibility AND ancestor visibility. Hidden faces/lines remain below hidden wrappers through display-mode changes. |
| Failures | Keep successful faces and valid source edges; report skipped faces/missing definitions/cycles instead of silently dropping an entire component. |

The independent triangulator can choose different diagonals or omit collinear
vertices. Equal geometry does not require identical triangle indices/counts.
Tests compare dimensions, surface area, material/visibility policy and transforms
in addition to counts. Backside materials, saved cameras, annotations and
SketchUp scene styles are not applied. Projected textures currently use a
planar UV approximation and emit a warning. The browser decoder must support
the embedded image format; failed image decoding retains the material colour
and reports a warning.

## Decoder and reproducible build

OpenSKP 1.5.0 (MIT) decodes legacy CArchive and modern VFF files. Earcut 3.2.4
(ISC) triangulates polygons; fflate 0.8.3 (MIT) decompresses VFF data. This is an
integration of an open-source file decoder plus PandaUI's own display adapter,
not a claim to have independently reconstructed SketchUp's proprietary decoder.

`scripts/build-skp-runtime.cjs` applies small checked patches to preserve face
and edge Tag IDs in both decoders and expose all Tag visibility entries. Each
replacement must match exactly; unexpected upstream changes stop the build.
Only parse/triangulation/UV helpers are bundled; Node-only exporters, writers and
FlatBuffers exporters are tree-shaken out. Exact package versions and the
upstream source hash are recorded by the script/bundle banner.

```powershell
npm install --prefix .tmp/skp-runtime-build --ignore-scripts openskp@1.5.0 earcut@3.2.4 fflate@0.8.3 esbuild@0.25.12
node scripts/build-skp-runtime.cjs .tmp/skp-runtime-build
node scripts/test-skp-import.cjs
npm run build
node scripts/test-skp-browser.cjs dist/spa path/to/your-model.skp
```

The committed runtime works without installing these build-only dependencies.
The parser is not guaranteed to accept every SKP version or damaged file. The
initial real-file coverage includes SketchUp 15/16 and a modern hidden-face
model, plus native SDK-generated legacy 17.0.1 and modern VFF 22.0.316 fixtures for holes, hidden Tags,
nested mirrored/nonuniform-scale instances, smooth corners and 0.3 opacity.
A decoder error is shown to the user;
there is no silent backend upload/fallback.

## Validation and change record

Purpose: add backend-independent browser SKP opening with the native mesh
display policy. Changed files are the five frontend files above, the runtime
and notices, three build/test scripts, this document and the explicit export
allowlist in `scripts/sync-frontend-export.cjs`.

Initial validation:

- Owned regressions: polygon holes/area, winding, both transform formats,
  per-occurrence ownership, front opacity, hidden Tags/faces/instances,
  smooth/soft edge filtering, edge toggles, render roundtrip, malformed faces,
  recursive definitions and transferable-array independence.
- Real native comparison: TestModel/NewFile surface area 325.572380914664 m²
  in local geometry coordinates, with 261 frontend vs 264 native triangles
  (different triangulation); hidden-face sample has 31,392 triangles in both.
- Production Edge browser, backend returning HTTP 503: TestModel has 3 objects,
  hidden-face sample 1 object; both create meshes/feature edges/tree and survive
  hide/show and render roundtrips. Measured complete imports about 0.22 s and
  1.14 s on this workstation; these are sample timings, not large-file promises.
- Existing display-object import regression passes, including transforms,
  selection, edits, visibility, batching and disposal.
- Native semantic oracle matches 20 triangles (12 visible), all occurrence
  bounds, feature lines, material alpha and 40 sampled normals within 1e-7.
- Both development and standalone production builds pass. Both production
  browser imports pass with the backend unavailable. Standalone release check
  passes with 400 candidate files. Export sync regressions: 14 pass, one
  platform-specific symlink test skipped.

Private models, native-oracle outputs and proprietary plugin analysis stay in
the development workspace; they are not part of the frontend export.

### Progressive instances and editable materials update

Purpose: make large instances visibly progressive and populate the existing
Scene Material node with named editable materials instead of temporary unnamed
per-batch materials. Changes: `SketchUpImport.js`, `LocalImport.worker.js`,
`DisplayObjectImport.js`, `PandaUIDoc.js`, `PandaUIApp.js`,
`ImportedMaterialEditor.js`, the runtime builder/bundle and SKP regressions.

Validation: a generated 10,000-face single textured component imports as one
editable object, with 20,000 triangles, four mesh batches and seven edge batches.
Production Edge (backend unavailable) sees edges before meshes and partial
meshes before completion; all four mesh parts use one named material and UV
texture. The sample completed in about 0.61 seconds on this workstation.
Regression edits the material mid-import, then verifies that all later batches
share the edited reference and retain an in-progress object transform. Existing
display-object and imported-material-editor regressions also pass. No private
fixture is exported.

### Large VFF component memory fix

Purpose: fix a real 168.71 MiB SKP import that exhausted the JavaScript heap.
Its decompressed model data is 632.04 MiB; the largest component contains
938,499 vertices, 2,230,887 edges and 1,220,183 faces. The previous recursive
TLV materialization reached the approximately 4 GiB Node heap limit and aborted.

Changed files: `scripts/build-skp-runtime.cjs`, `public/shared/skp/PandaSkp.js`,
`src/import/SketchUpImport.js`, both SKP test scripts and this document.
The reproducible runtime patches consume large geometry lists one entity at a
time, skip redundant geometry scans for document metadata, defer component
geometry until needed and release consumed builder/definition data. Display-only
parsing omits unused saved-scene/annotation vertex lookup tables. Material,
placement, tag visibility and smooth-normal rules remain in use.

Validation: the original private model now produces 13 scene objects and
2,892,538 triangles in production Edge with the backend unavailable. Metadata
was ready in about 5.2 seconds in the streaming diagnostic; the browser import
and display/material checks completed in about 98 seconds on this workstation.
Seventeen editable material entries and five textured mesh parts were verified,
including live colour/roughness editing and display hide/show roundtrips.
There are 36 faces rejected by the existing triangulation area check; their
edges remain available and a warning is shown. This fix does not claim to
repair those faces. The regression suite also covers shared deferred components
and releasing their source geometry after the final occurrence. A generated
10,000-face textured component still imports without warnings. Private models
and diagnostic logs are not exported.

### Internal member selection highlight

Purpose: fix missing selection feedback after entering an imported instance.
Some progressive mesh packets have only mesh/topology parts and no independent
source-edge child. Selection now uses source edges where available, otherwise
extracts boundary and crease edges (30-degree threshold) from the selected mesh
member. Faces retain their original material; coplanar triangle diagonals are
not highlighted. Face-range selections follow the same edge-only policy.
Only the active draw range is used when geometry buffers contain other material
parts. Derived outlines follow world transforms and are disposed when selection
changes; source geometry is retained. Group isolation does not dim highlights.

Changed files: `src/display/SceneSelection.js`, `src/display/GroupEditContext.js`,
`scripts/test-skp-import.cjs`, `scripts/test-skp-browser.cjs` and this document.
Validation covers a selected holed mesh member (eight boundary edges without
triangulation diagonals), isolation, transforms, selection cleanup, face-only
draw ranges and the existing display-state regression. Browser regressions
exercise imported instance entry, member selection and edge-only overlays.
