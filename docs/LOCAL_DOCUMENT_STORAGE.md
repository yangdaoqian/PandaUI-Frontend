# Local private document folders

Frontend imports appear under **Document Manager → Private documents**, including
when no backend is running and no public document is selected. The tree includes
layers and instance descendants. Selecting a public workspace can still register
and share their display through the existing collaboration service; saving a local
folder does not publish geometry or change server permissions.

## Commands

- **Import** opens a source model using the existing File processing selection.
- **New** creates an empty local private document.
- **Save locally** saves the selected local document. On its first save, select a
  parent directory; PandaUI creates `<name>-<full-document-uuid>.panda/` inside it.
- **Save as** chooses another parent directory and writes a separate folder copy.
- **Open folder** selects that `.panda` directory and appends it to the workspace.
  Opening the same document UUID twice in one window is rejected.
- The document tree also offers **Save locally**, **Save as...** and **Close local
  document**. Closing removes local display without deleting shared server objects
  or the saved folder. Changes made since saving are not automatically saved.
- **Server library**, **Save to server**, publication and server deletion remain
  separate operations with their existing account/member permissions.

Folder access currently requires the File System Access API: desktop Edge or
Chrome on HTTPS or localhost. The browser's directory permission applies. A
browser lacking this API receives a clear message; this release does not provide
a mobile ZIP export fallback. The directory handle is retained while the document
is open, so subsequent saves do not ask for a new destination.

## Format version 1

```text
<name>-<documentId>.panda/
  document.json                       Human-readable identity, not the commit pointer
  current-0.json                      Alternating complete-commit pointer
  current-1.json
  commits/<sha256>.json               Version, sequence, index references and document settings
  indexes/<sha256>.json               Paged record-location index (up to 2048 records/page)
  packs/geometry-<sha256>.bin          Geometry archives and OpenNURBS table header
  packs/display-<sha256>.bin           Mesh/line/point buffers and material library
  packs/metadata-<sha256>.bin          Paged object/instance tree (up to 512 nodes/record)
```

Packs are immutable concatenations. Their external record index maps a content
SHA-256 to `{path, offset, bytes}`; no per-object filesystem entry is necessary.
The current commit references its complete record-index pages. Record checksums
are verified on read; index and commit checksums are verified on opening. Paths
are restricted to the generated namespaces and format versions are checked.

Small records share approximately **10 MiB** packs. A single larger record remains
whole in its own pack. Display packets and original geometry are separate. Object
IDs and hierarchy/placement matrices remain stable across saving and reopening.
Identical display templates and original definition archives deduplicate by
content. Restored display templates share geometry buffers between placements;
each placement retains independent identity, visibility and transforms.

Object rows retain name, parent, scene, layer path, transform, intrinsic visibility,
selection/subobject metadata, bounds and references to geometry, display and any
placement-specific geometry edit. Unbaked node previews, lights, cameras, selection
helpers, generated triangle-edge overlays and render batches are excluded.

Native analytic geometry uses the existing encoded OpenNURBS archive and encoded
attributes, with the necessary document table header. A saved 3DM needs a bounded
streaming source scan on its first save; later saves reuse unchanged archives.
STEP/DXF exact archives and retained SubD sources use their existing archives.
For primitives whose original representation is already a mesh/line/point buffer,
the row identifies `geometryFormat: "display-buffer"` and shares the exact buffer
record with display instead of duplicating it or inventing a NURBS conversion.

Materials and their supported CPU-accessible images are serialized once into a
shared library, preserving physical parameters, maps, UV buffers and editable
material references. Renderer-owned GPU environment targets are not portable image
sources; they continue to be managed by the renderer. Camera, display settings,
render/shading parameters, layer tree and clipping planes are saved. This does not
serialize a nodegraph or GPU caches. The active renderer configuration and its source images/HDR are persisted separately as described below.

Source conversion warnings remain in the document metadata. Saving does not repair
unsupported or omitted source faces. Cached output is a snapshot of the current
mesh precision; editing geometry or explicitly changing precision uses the original
archives and the existing remeshing pipeline.

## Loading and memory

The complete object index creates the tree and placeholder hierarchy before display
buffers load. Edge records receive priority. Mesh records then mount incrementally
with frame yields; no STEP conversion or mesher runs during a cached open.
Original Breps are read/decompressed only when an editing, remesh or publication
operation needs them. Merely selecting or zooming a displayed object uses the
cached object identity and geometry.

Display reads cache at most two normal packs (20 MiB), release that cache after
loading, and keep each record's buffers independent of the pack allocation. Typed
render buffers are reused directly after checksum verification, avoiding an extra
Blob-to-ArrayBuffer round trip. Large individual records are read directly. The
geometry editing subsystem retains its own current edit/history data as before.

## Save integrity and cleanup

Saving writes new content-addressed packs, index pages and a commit before replacing
the inactive pointer. The previous complete pointer stays intact. An interrupted
pointer/index write can fall back to the previous complete indexed snapshot.
Corrupt record content produces a checksum error rather than silently loading it.

The saver checks that the scene has not changed during its asynchronous write;
if it has, it aborts publication and asks the user to save again. Browser Web Locks
serialize saves of the same UUID within an origin. An opened folder's commit is
checked against subsequent saves, and stale commits are rejected. There is no
claim of a cross-process filesystem transaction for arbitrary external writers.

Only successful saves collect unreferenced generated files. Two complete commits
are retained for crash recovery, not an unlimited hidden history. Unreferenced
packs leave storage once neither recovery commit needs them. Files outside the
strict generated filename pattern are never removed. Backend data and cache
cleanup are unaffected by local folder saves.

## Implementation and verification

- `src/storage/FolderDocumentStore.mjs`: pack I/O, checksums, commits, recovery, GC.
- `src/storage/LocalDocumentArchive.js`: live document snapshot, geometry extraction,
  shared material/display templates, tree restoration and lazy archive readers.
- `src/PandaUIApp.js`: local folder save/open and empty private document commands.
- `src/components/SceneDocumentsPanel.vue`, `GeometryDocumentTree.vue`,
  `src/DocumentHierarchy.js`: local document commands and hierarchy.
- Existing selection, visibility, geometry-edit, remesh and publisher paths consume
  the restored local references rather than requiring the original source file.

```text
node scripts/test-folder-document-store.cjs
node scripts/test-local-document-folder-browser.cjs dist/spa
```

The store tests use a disposable filesystem adapter and injected failures. Browser
tests use OPFS directories in an independent Edge session and generated STEP/3DM
fixtures: cached display, stable IDs/transforms, hidden objects, editable materials,
lazy original Breps, precision changes, repeat saves and offline Document Manager
commands. No private model or analysis files are included in the frontend export.
Mesh-only OBJ files and new empty documents also have save/reopen coverage.
`src/.gitignore` allows only the two storage source modules through the standalone
export's general runtime-storage ignore rule; saved model data remains excluded.

Validation record (2026-11-15): filesystem transaction/recovery tests and the
production Edge folder round-trip passed, including an affine shear, local close,
native STEP/3DM geometry and remeshing after removing the source document. Existing
document hierarchy, scene packet, geometry publication and control-point tests
also passed. The generated assembly restored five model/instance objects in about
36 ms; this is a small correctness fixture, not a large-model performance claim.
Original-project hierarchy/control-point regression scripts stay in the development
project; the two portable folder tests above are included in the frontend export.


## Render material persistence and Preview saving (2026-11-17)

Both full .panda saves and .panda-render saves always include the shared material library: physical surface type/parameters (including glass), display-mode material references, embedded color/bump/normal and other supported CPU images, texture transforms, geometry UVs and per-object material assignments. There is no material-exclusion toggle. Required material maps that cannot be encoded cause a clear save error before commit publication; the last successful snapshot remains available. Existing incomplete archives cannot reconstruct omitted source images.

The active renderer description is saved in workspace.renderConfiguration. Environment/HDR and binding image sources are copied into content-addressed display packs and replaced with {kind: 'panda-render-asset', ref, mime} references. Reopening reads and verifies these records, creates owned object URLs, and restores rendering inputs without needing the original URL or file. Document-owned URLs are revoked on document close; URLs adopted by the active renderer remain valid until its archived configuration is replaced or the application is disposed. GPU environment maps/shader caches are rebuilt from saved inputs. Legacy archives without renderer configuration still open. Render-only saves now page the object index, check for in-flight scene edits and stale folder commits, and retain the selected save folder for repeated saves. Full and render-only formats cannot overwrite each other through an explicit destination handle.

Validation record (2026-11-17): render-only saves now collect both active object materials and `displayMaterials` variants, so a separate render material can be serialized and restored instead of aborting with `Missing document material.` Save failures also identify the archive phase that failed. The production Edge folder regression now saves and reopens a render-only archive with distinct shading/render materials (`renderMatches: 1`).

PandaUI Preview File adds Save render data and Save render data as.... Select the document when multiple archives are open. The first save of a bundled read-only case chooses a parent directory and creates a local .panda-render copy. Saving an opened local folder requests write access and updates that folder; Save as chooses another parent. Each command saves one document plus the current viewport render settings, not a multi-document merged scene. Preview remains frontend-only and does not write analytic geometry or change the bundled case.

Implementation: src/storage/LocalDocumentArchive.js, src/collaboration/SceneDisplayPacket.js and src/PandaUIApp.js. Preview additionally changes src/components/PreviewFilePanel.vue, src/render/PreviewRenderState.js and src/storage/HttpArchiveDirectory.js. Tests: folder-store transaction tests; scene-display codec strict-map regression; imported-material-editor tests; Preview production Edge test covers full-document physical material/map round trips, File save/repeated save/save-as, render-only reopen with glass/color/bump/normal maps, HDR, lights/exposure, unchanged document identity, and failed-map preservation of the prior commit. Preview regression and the source codec regression remain in their development projects; they are not part of the frontend export allowlist.


## HTTP LAN archive verification (2026-11-17)

Remote built-in cases can be opened over ordinary LAN HTTP, including port 9009. FolderDocumentStore uses Web Crypto SHA-256 when available and otherwise the same SHA-256 digest implemented in src/storage/sha256.mjs. Commits, indexes and record bytes remain checksum-verified; no unverified-load bypass is introduced. The fallback handles typed-array offsets, pads only a 64/128-byte tail, reuses a 64-word schedule, and yields every 256 KiB so large records do not block the UI for the entire checksum. The archive format is unchanged.

Local directory pickers and saving still follow browser secure-context requirements (HTTPS or localhost). The fallback enables HTTP-hosted cases; it does not grant filesystem permissions. Run node scripts/test-folder-document-store.cjs and the same command with --http for both native/fallback transaction and corruption tests. The Preview-only scripts/test-preview-http-case.cjs exercises the actual LAN URL, confirms the lack of Web Crypto, clicks the case Open button and verifies loaded meshes/materials.
