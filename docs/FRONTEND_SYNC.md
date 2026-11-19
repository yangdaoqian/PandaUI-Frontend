# Selective frontend synchronization

Run this tool from the original **PandaUI** checkout. It exports only explicitly
named files to the sibling **PandaUI-Frontend** directory. Source and target roots
are resolved from the script location, independently of the working directory.
Requires Node.js 18 or newer; uses built-in modules only. No package changes,
Git operations, automatic push, filesystem watcher, or recursive exports.

## CLI API

```text
node scripts/sync-frontend-export.cjs --message "reason" [--check] [--allow-adapted] [--] <relative-file>...
node scripts/sync-frontend-export.cjs --help
node --test scripts/test-sync-frontend-export.cjs
```

| Argument | Behavior |
| --- | --- |
| `relative-file` | One or more exact file paths relative to the original root. Forward slashes or Windows backslashes are accepted. Duplicate identical paths collapse. |
| `--message "reason"` | Required, including in check mode. Describe the change; blank messages are rejected. |
| `--check` | Perform the same validation and conflict checks and print the pending files/hashes, without writing files, directories, locks, or logs. |
| `--allow-adapted` | Explicitly allow replacement of selected frontend adaptations. Does not bypass the blacklist, path checks, or recorded target hash checks. |
| `--` | End option parsing. |
| `--help`, `-h` | Print usage; use alone. |

Exit status is **0** for a successful sync or an unchanged selection, **2** when
`--check` finds pending changes, and **1** for invalid arguments, conflicts, or I/O
errors. Successful output is JSON with `status` (`synced`, `pending`, `unchanged`)
and a sorted `files` array containing `path`, `previousExportSha256`,
`sourceSha256`, and `exportSha256`. Refusals go to stderr.

For every frontend change, explicitly select all changed files and supply a
meaningful message. First check, resolve any conflicts, then run the same command
without `--check`. For example:

```powershell
node scripts/sync-frontend-export.cjs --check --message "Update geometry controls" src/CameraFraming.js public/nodec/GeometryControlPoints.js
node scripts/sync-frontend-export.cjs --message "Update geometry controls" src/CameraFraming.js public/nodec/GeometryControlPoints.js
```

To export the synchronization tooling and its documentation:

```powershell
node scripts/sync-frontend-export.cjs --check --message "Add selective frontend sync and audit log" scripts/sync-frontend-export.cjs scripts/test-sync-frontend-export.cjs docs/FRONTEND_SYNC.md
node scripts/sync-frontend-export.cjs --message "Add selective frontend sync and audit log" scripts/sync-frontend-export.cjs scripts/test-sync-frontend-export.cjs docs/FRONTEND_SYNC.md
```

The script cannot discover omitted changes: recording and syncing every change
requires running it with every changed exportable file. Unselected paths are
untouched. Direct target edits, deletions, renames, directories, globs, and arbitrary
source-to-destination mappings are not synchronization operations. A missing
source is an error, never a request to delete a frontend file.

## Export boundary

Allowed trees: `src/`, `public/editor/`, `public/nodec/`, `public/shared/`.
The reviewed exact paths outside those trees are:

- `scripts/backend-dev-proxy.js`
- `scripts/SceneFileWebpack.js`
- `scripts/editor-test-kernel.js`
- `scripts/test-editor-pandaui-runtime.js`
- `scripts/test-graph-operations.js`
- `scripts/sync-frontend-import-assets.js`
- `scripts/sync-frontend-export.cjs`
- `scripts/test-sync-frontend-export.cjs`
- `scripts/test-imported-material-editor.js`, `scripts/test-render-raster-browser.js`,
  `scripts/test-render-raster-fixture.js`, `scripts/test-render-idle-loop.cjs`,
  `scripts/test-viewport-display-settings.js` (owned synthetic material/render regressions)
- `docs/RENDER_MATERIAL_FIXES.md` (render behavior and validation; no private models)
- `docs/PATH_TRACER_MIGRATION.md`, `scripts/build-pathtracer-runtime.cjs`
- `scripts/pathtracer-runtime/runtime.js`, `package.json`, `package-lock.json`,
  `glslSmartDeNoise-LICENSE.txt` within that directory (isolated MIT/BSD runtime;
  its `node_modules` is excluded)
- `scripts/test-pathtracer-runtime-browser.cjs`, `scripts/test-pathtrace-scene-materials.cjs`,
  `scripts/test-render-pathtrace.js`, `scripts/test-render-pathtrace-browser.js`,
  `scripts/test-render-scene-adapter.js`, `scripts/test-render-nodes.js`
  (owned rendering/node regressions, synthetic scenes only)
- `scripts/test-step-part21.cjs`
- `scripts/test-step-progressive.cjs`
- `scripts/test-step-progressive-browser.cjs`
- `scripts/test-folder-document-store.cjs` (owned folder transaction tests)
- `scripts/test-local-document-folder-browser.cjs` (generated model round trips)
- `scripts/test-step-native.cjs`
- `scripts/test-step-brep.cjs`
- `scripts/test-step-opennurbs.cjs`
- `scripts/test-step-instances.cjs` (owned instance-streaming regressions; no private model data)
- `scripts/test-cad-frontend-import.js`
- `scripts/test-node-packages.cjs` (owned WASM registration ABI validation)
- `scripts/test-node-packages-browser.cjs` (owned offline editor/Worker checks)
- `docs/WASM_NODE_PACKAGES.md` (public package contract; no native source)
- `scripts/test-mesh-worker-pool.js` (owned scheduling/preview/cancellation tests)
- `docs/BREP_MESHING.md` (public display meshing contract; no private model evidence)
- `docs/STEP_IMPORT.md`
- `docs/LOCAL_DOCUMENT_STORAGE.md`
- `docs/FRONTEND_SYNC.md`
- `AGENTS.md` (protected; requires `--allow-adapted`)

Additional scripts or documents require a reviewed change to `EXTRA_FILES` in the
sync script. Merely appearing in the manifest does not grant export permission.
The manifest and change logs are managed metadata, never selectable payloads.
`docs/analysis/step-import` and its private analysis files are not allowed.
The sync script itself is allowed under normal target hash checks. Files such as
`src/PandaUIApp.js` are already covered by the `src/` tree.

The blacklist takes precedence, including under `--allow-adapted`: backend/server
and native source directories, native source/binary extensions (including DLL,
EXE, C/C++, C#), model directories and common model formats, catalogs, decompiled
artifacts, archives, dependencies, build output, environment files, editor
`imgs`, `nodes_data`, `plugins/data`, NodeC placeholders, and paths in the manifest's
`excludedWithinAllowedTrees`. Existing backend *client* JavaScript in `src` is
allowed; this is a path boundary, not source-code analysis.
`public/nodec/NodeC.wasm` and NodeC browser JavaScript are allowed. Backend/native
build inputs remain excluded. Other public roots are outside the allowlist.

Absolute paths, traversal/dot segments, empty segments, Windows alternate data
streams/device names, wildcards, trailing dots/spaces, case aliases, symlinks,
and junctions are rejected. Checks cover file paths, their ancestors, repository
roots and metadata paths. Files must be regular files; paths retain their spelling
on disk.

## Manifest and conflict rules

The target's existing `docs/EXPORT_MANIFEST.json` must contain a `copied` array
with `source`, `destination`, `bytes`, `sourceSha256`, and `exportSha256` entries.
The tool does not bootstrap a missing manifest or trust malformed hashes,
duplicate entries, or escaping paths. Existing unrelated entries and metadata
are preserved, including historical export dates. Selected mappings must be
identity mappings. Entries are sorted by destination using locale-independent
string comparison when a batch changes something.

Before updating a tracked file, the current target's SHA-256 **must equal the
recorded `exportSha256`**. A missing tracked target also conflicts. This check
applies even when target content already equals the new source and even with
`--allow-adapted`: it preserves unrecorded target edits. An untracked target file
also conflicts, including when its bytes equal the source. New files with no
target and no entry can be added.

Adaptations require `--allow-adapted` whenever selected. Protected paths include
`src/App.vue`, `quasar.conf.js`, `quasar.config.js`, `quasar.config.ts`,
`package.json`, `package-lock.json`, `yarn.lock`, and
`scripts/sync-frontend-import-assets.js`, `AGENTS.md`, plus every manifest `adaptations` entry
and every entry whose recorded source and export hashes differ. The package and
Quasar paths are explicit protected exceptions to the tree allowlist.

An existing, **untracked protected adaptation**, such as the generated frontend
`package.json`, can be replaced only with `--allow-adapted`; its actual previous
hash is included in the log. A tracked adaptation still must match its recorded
export hash. Resolve conflicts manually by preserving/reconciling frontend work;
there is no force flag for unrecorded tracked edits. Do not replace manifest hashes
merely to suppress a conflict.

Keep a tailored frontend `AGENTS.md` out of the selection unless replacing it with
the original policy is intentional. There is no automatic policy merge. Changes
to original `src/App.vue` still require `--allow-adapted`, even when the current
target matches its recorded export hash; that hash match only confirms no
unrecorded target edit would be lost.

## Change history and determinism

Every successful nonempty batch writes identical `docs/FRONTEND_CHANGELOG.md`
files in **both repositories**, recording the message and sorted file paths with
previous source hash, actual previous export hash, new source/export SHA-256
hashes, and whether adaptation replacement was authorized. New files show an
absent previous hash. Updated `copied` entries describe exact copied bytes.

An entry ID hashes the previous log hash, message, and sorted change records.
It uses no clock, random ID, absolute path, or machine-specific data, so identical
inputs and history produce identical manifest/log bytes. A later revert or
repeated change remains a distinct history event. Unchanged selections neither
append entries nor rewrite files, even if the message changes. A first-ever
unchanged run does not create empty logs.

Both logs must initially be absent or byte-identical. Subsequent runs also check
their hash against `frontendSync.changeLogSha256` in the manifest; divergent,
missing, or manually changed logs are conflicts. `frontendSync.lastChangeId`
identifies the last recorded batch. Generated metadata is not recursively listed
as payload, avoiding self-referential hashes.

## Atomic writes and recovery

All selections, metadata and conflicts are validated before any write. Before
commit, snapshots are checked again. A target lock
(`docs/.frontend-sync.lock`, containing the process ID) serializes cooperating
sync processes. All output is staged in exclusive sibling temporary files,
flushed, then replaced by atomic renames; the manifest is replaced last. Payload
and log paths are rechecked before replacement. Ordinary staging/commit errors
roll back completed replacements without overwriting newly detected user edits.

Atomicity is **per file**, not a crash-atomic transaction spanning repositories.
An OS crash or power loss can interrupt a batch; independent editors are not
locked out, and portable Node filesystem APIs cannot eliminate every concurrent
path-replacement race. Avoid editing selected files during synchronization.

After interruption, inspect the lock's process ID and ensure the sync is no longer
running. Preserve affected files, logs, manifest, and any `.frontend-sync-*.tmp`
files before recovery. Compare both logs and the manifest with the previous
consistent versions and restore a consistent batch boundary; then remove the
stale lock/temporary files and rerun `--check`. An incomplete rollback retains
the lock and reports affected paths. The tool never silently accepts partial
state, merges divergent logs, or automatically removes an existing lock.

## Tests and programmatic entry point

Tests use disposable temporary sibling repositories; they never sync into the
real frontend checkout. Coverage includes deterministic output, no-op behavior,
manifest compatibility, conflict preservation, adaptations, binary WASM, path
and blacklist restrictions, symlinks/junctions, CLI exit statuses, injected I/O
failures/rollback, and edits arriving during staging. A file-symlink test is
explicitly skipped on Windows hosts lacking symlink privileges; junction tests
still run.

The CommonJS export `syncFrontendExport({ paths, message, check = false,
allowAdapted = false, sourceRoot?, targetRoot? })` returns the same result object
as the CLI and throws on refusal. Root overrides exist for isolated fixtures or
embedding; the CLI intentionally exposes no root override. Always run the
original script, not a copy inside the frontend repository.
