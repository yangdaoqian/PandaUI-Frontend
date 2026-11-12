# Export validation — 2026-11-12

## Initial export (before prebuilt-runtime inclusion)

- 314 copied files checked against the recorded export SHA-256 values; no mismatches.
- Excluded backend, SDK, sample, storage and NodeC WASM paths absent.
- Targeted credential-pattern scan of exported frontend sources and scripts found no matches. This is not proof that every possible secret format is absent.
- Dependencies installed independently with Yarn Classic using `--frozen-lockfile --ignore-scripts`; no symlink to the original project's dependencies.
- `yarn build`: production compilation passed using this project's own dependency installation.
- Node runtime test suite and all 16 graph operation cases passed.
- Isolated headless Microsoft Edge served this project's `dist/spa`, with API endpoints returning BACKEND_UNAVAILABLE. Local mode, scene canvas, node editor, 190 registered native node types, node creation/removal/undo and the visible runtime-exclusion notice were verified. No page exceptions or HTTP 404 responses were observed during the check.
- No geometry import test was performed: the NodeC runtime is deliberately unavailable in this export.
- `node_modules`, `dist`, staged OCCT vendor files and validation logs are local generated files covered by `.gitignore`.

No source provenance clearance, GitHub publication, credential revocation or full dependency-license clearance is implied by these checks. `yarn check:release` remains an intentional release hold.

## Prebuilt runtime update — 2026-11-12

This update supersedes the runtime-exclusion statements above. NodeC.js, NodeC.wasm and their existing license notices are now included; no native geometry source or native SDK was copied.

- `yarn build` passed with the included runtime (22.84 seconds).
- Served the independent production build to headless Microsoft Edge. All backend API requests received HTTP 503 `BACKEND_UNAVAILABLE`; the frontend entered local mode.
- Generated a new 3DM fixture containing an uncached sphere Brep and a line using the included runtime. Dropped it through the actual frontend file-drop handler: one document, two imported object roots, one generated surface mesh and two line objects were observed in the scene.
- Dropped a generated ASCII STL through the same handler: one document and a triangle mesh were observed in the scene.
- Both imports completed without page exceptions, missing assets, error dialogs or backend write/upload requests.
- Scanned the exported project (excluding installed dependencies and generated build files): no `.c`, `.cpp`, `.h`, `.hpp`, `.cs`, `.dll` or `.exe` files were found.
- Updated manifest hashes for the runtime update. The JS/WASM pair matches the original working project's binaries.

These are small-fixture import checks; they do not establish performance on large models or verify every supported file format. Public-release provenance review remains pending.

## Public repository preparation — 2026-11-12

- Maintainer authorized a public GitHub repository and explicitly deferred meshing/curve-sampling provenance review. Other notice and technical checks were addressed as recorded in RELEASE_REVIEW.md.
- Added the version-matched CodeMirror notice, OCCT LGPL exception and source/replacement instructions, and NodeC toolchain/runtime notices. Inventoried 883 installed dependency versions with declared license expressions. Production dependency notice coverage passes; the two build-only packages without standalone notice text are documented in THIRD_PARTY_NOTICES.md.
- `yarn check:release` passed for the candidate Git files: excluded artifacts, common credential patterns, required notices, production license coverage and copied-file hashes. Additional credential-related matches were inspected and were login UI / browser credential-manager code, not embedded credentials.
- `yarn test` passed (editor runtime and all 16 graph operation cases).
- `yarn build` passed after the license asset and replaceable OCCT runtime changes.
- Repeated the real Edge production-build import check with every backend endpoint unavailable: generated 3DM sphere/line and STL imports passed, with no page errors, missing assets, dialogs or backend writes.
- Preserved the maintainer's removal of the on-screen release-review notice. Git attributes preserve exported bytes so provenance hashes remain stable across operating systems.
- GitHub Actions runs tests, release checks and compilation on Node.js 22. Its remote result is not implied by these local checks.

No comprehensive legal clearance or large-model performance guarantee is claimed. The deferred algorithm review remains explicit in LICENSE_SCOPE.md.
