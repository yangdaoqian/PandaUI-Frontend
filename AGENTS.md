# PandaUI development and frontend export

The original PandaUI directory is the development source. The sibling
`../PandaUI-Frontend` is the standalone frontend export.
If reading this file in PandaUI-Frontend, the development source is
`../PandaUI`; run synchronization with that source project's script, not the
exported copy of the script.

- For each completed change, record its purpose, changed files and validation.
- Sync frontend changes into `PandaUI-Frontend` using
  `scripts/sync-frontend-export.cjs` with explicit file paths and a meaningful
  message. See `docs/FRONTEND_SYNC.md`. Update the export manifest and both
  `docs/FRONTEND_CHANGELOG.md` files through that script.
- Preserve frontend-only configuration and independent user edits. Resolve
  conflicts file by file; never replace the entire export directory.
- Never copy backend source/data, geometry C++ source, proprietary plugin
  binaries, decompiled code or private analysis evidence into the export.
  Prebuilt NodeC.js/NodeC.wasm, associated browser runtime files and notices
  are within the authorized export scope.
- Validate the changed behavior and the standalone build. Run its release
  check after synchronization. Explain any unsynced files or limitations.
- Synchronizing local project directories does not itself request a GitHub
  publication. Push only when the user requests a remote update.

## Geometry algorithm placement

- Implement new geometry algorithms in the corresponding existing NodeC native
  module under `Plugins_Main/NODE_EIDTOR/NODE_EDITOR_C`: curves in `on_curve.cpp`,
  Breps in `on_brep.cpp`, meshes in `on_mesh.cpp`, and the equivalent module for
  other geometry types. Move the actual implementation there, not just a wrapper.
- Do not create separate algorithm source/header files or standalone algorithm
  projects. Put helpers in the corresponding module and reuse existing headers
  for declarations. Keep WASM files as thin bindings to the shared implementation.
- Preserve existing ABI names when moving implementations. Native and WASM
  callers should share the same algorithm; validate both build targets.
