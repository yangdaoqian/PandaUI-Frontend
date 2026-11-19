# Frontend update notes

## 2026-11-19 — Browser import, rendering, materials and documentation update

This update publishes the accumulated standalone frontend changes since the initial export. It does not publish the backend, geometry C++ sources, private models, analysis evidence, or the separate PandaUI Preview application.

### Included behavior

- Progressive STEP/OpenNURBS conversion, browser SKP and DWG import routes, geometry/display handling and mesh-worker improvements.
- Document hierarchy and instance interaction improvements, visibility/selection handling and supported control-point integration.
- Packed local document and render-only archives, material/texture/render-setting persistence and integrity checks.
- Imported material sharing that includes names in identity; live editing and UV operations.
- Layered real-time transmission, per-pixel distance frosting, planar/scene-reflection changes, shadow/SSAO integration and resource management.
- Isolated three-gpu-pathtracer runtime, supported material/texture/light adaptation, progressive sampling and spatial denoising.
- WASM node-package discovery and registration, with pending calculation implementations explicitly identified.

### Documentation and synchronization

- Replaced the early README with a feature matrix, current import routes, quick start, rendering/storage boundaries and deployment instructions.
- Added `docs/USER_GUIDE.zh-CN.md` covering installation, document workflow, scene editing, nodes, materials/UV, rendering, archive structure and troubleshooting.
- Added this release record. The README and user guide are standalone-export documentation; the original development README is not overwritten.
- Synchronized `scripts/test-render-raster-browser.js` through the source export tool. This adds layered-glass screenshot output; shared runtime source changes were already recorded in `docs/FRONTEND_CHANGELOG.md`.
- Retained the upstream README update in Git history before preparing this publication.

### Validation for this publication

- `npm test`: passed the node runtime and 16 graph-operation cases.
- `node scripts/test-imported-material-editor.js`: passed.
- `node scripts/test-render-nodes.js`: passed.
- `node scripts/test-folder-document-store.cjs`: passed transaction, recovery, integrity and cleanup checks.
- `npm run build`: passed; production output generated in `dist/spa` (not committed).
- `npm run check:release`: passed after documentation completion; checked candidate file boundaries, notices, credential patterns and manifest hashes.
- Local documentation links checked. Runtime optical tests from earlier development are documented separately in `docs/RENDER_MATERIAL_FIXES.md`; they were not rerun as part of this documentation/publication pass.

### Explicit boundaries

Preview's standalone Materials/menu interface and case-directory/save-permission handling are not transplanted into this repository. Frontend Document Manager still invokes the system directory picker for saves. The current dev configuration defaults to port 9000 with a localhost:9001 API proxy; the guide uses an explicit port 9002 to avoid collisions. Historical `.env.example` port/backend settings are not currently wired into this configuration.

The WASM package node count is not a claim of implemented solvers. CAD format coverage and real-time multi-layer optics remain partial. Third-party licenses and the previously documented provenance-review status remain in their respective notice/review files.
