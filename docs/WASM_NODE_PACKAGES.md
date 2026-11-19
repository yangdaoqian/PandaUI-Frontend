# Frontend WASM node packages — registration stage

Implemented 2026-11-16. The editor discovers seven local packages without a
backend, validates and instantiates their binaries in a module Worker, and adds
their nodes to Add Node and the existing Plugins node. Package enable/disable
uses the existing plugin settings. Existing native/adapter nodes remain separate.

## Add Node organization

The Add Node menu now uses functional display paths independently of registered
type identifiers. Root order is Panels, Parameters, Data, Math, Geometry,
Transform, Display, Render, Robotics, Scripting, AI, then Extensions when custom
packages are present. Empty categories are omitted. Labels use consistent English
capitalization; AI, UV, NURBS, SubD and WASM retain their standard spelling.

| Previous paths | Menu location |
| --- | --- |
| `display`, `Display` | Display |
| `input`, `Input`, `widget` | Parameters / Input |
| `Params` | Parameters |
| `math`, `Maths`; `math3d`; `logic` | Math; Math / 3D; Math / Logic |
| `transform`, `Transform` | Transform |
| `basic`, `convert`, `list`, `Sets`, `string`, `pandaui` | Data / Basic, Conversion, Lists, Sets, Text, Trees |
| `Curve`, `Surface`, `Mesh`, `Vector`, `Intersect`, `MNurbs` | Geometry / Curves, Surfaces, Meshes, Vectors, Intersection, SubD |
| `NodeC/Edit` | Geometry / Control Points |
| `robot`, `KUKA\|prc` | Robotics |
| `graph`, `events`, `Mantis` | Scripting / Graph, Events, Mantis |
| Unknown plugin categories | Extensions / plugin name |

WASM packages appear under the matching function with a WASM submenu: for
example **Geometry / Curves / WASM / Analysis / Closed · Pending**, or
**Math / WASM** and **Transform / WASM**. Package enable/disable remains in the
Plugins node. Menus and search results use the same paths and category colors.
Original identifiers are still searchable and available as hover text.

This changes presentation only: registered type strings, GUIDs, saved graphs,
execution routing and node algorithms are unchanged. Source:
`public/editor/src/PandaUI/GraphCanvas.js`. Regression coverage in
`scripts/test-editor-pandaui-runtime.js` and `scripts/test-node-packages-browser.cjs`
checks mixed-case category merging, actual menu selection, searchable WASM
locations, pending labels, stable type identifiers and graph round trips.

| Source project | Registered nodes |
| --- | ---: |
| NodeCurveC | 123 |
| NodePointC | 97 |
| NodeMeshC | 18 |
| NodeSurfaceC | 139 |
| NodeMathC | 178 |
| NodeXformC | 57 |
| NodeTriangleC | 18 |
| Total | 630 |

## Scope and honest execution status

These are **registration-only WASM packages**, not a complete browser compilation
of the Windows node framework or the existing component implementations.
`SolveInstance()` implementations are deferred, even for components whose native
source already contains an implementation. Each execution calls the loaded WASM
entry and reports `SolveInstance is not implemented yet`. Outputs are cleared
and the node displays a warning. There is no backend fallback or input passthrough.

The generator reads each project's explicit `Node_ComponentNameRegistrar` list,
then extracts its existing constructor, GUID and input/output declarations.
Unrecognized parameter code stops the build instead of silently losing ports.
Unregistered classes and utility libraries are not advertised as usable nodes.
Each package binary embeds its complete manifest; loading checks all fields
against the external JSON. These checks detect mismatch, not publisher authenticity.
Only install packages supplied by a trusted project/deployment maintainer.

The node type includes package name, category and GUID, so it does not replace
existing node types. Keep those identifiers stable when implementing a node.

## Files and build

Run in the original PandaUI development directory:

```powershell
node scripts/build-node-packages.cjs
node scripts/test-node-packages.cjs
node scripts/test-node-packages-browser.cjs
```

The browser test needs Playwright and Microsoft Edge. The package build uses
`.tools/emsdk-main/upstream/bin/clang.exe`, or `PANDA_WASM_CLANG` if specified.
No geometry library, OpenNURBS, NodeBase Windows runtime or third-party plugin
binary is linked into the registration modules. No NodeC.js rebuild is required.
The shared registration ABI source is `NodeBase/wasm/NodePackage.c`; generated
metadata build inputs stay in `.runtime-builds/node-packages`.

Runtime layout:

```text
public/nodec/packages/index.json
public/nodec/packages/nodecurvec/manifest.json
public/nodec/packages/nodecurvec/NodeCurveC.wasm
...one directory for each package...
```

The index contains `{ "schemaVersion": 1, "packages": ["./nodecurvec/manifest.json"] }`.
Each manifest has `schemaVersion`, `abiVersion`, `id`, `name`, `version`, `stage`,
`module`, and `nodes`. Node entries contain a stable GUID, name, nickname,
description, category, `status: "pending"` and typed input/output arrays with
`item`, `list` or `tree` access.

To deploy another compatible package, place its manifest and WASM in the same
directory, and add the manifest's relative URL to the index. Browsers cannot
enumerate arbitrary server directories: an index is required. A random `.wasm`
or Windows DLL cannot be recognized as a node package just from its extension.
Refresh the editor after deployment; development tools can also call
`await PandaUIWasmPackages.reload()` in the editor frame. A package version change
with the same id requires a refresh; live replacement is rejected to preserve
graphs and loaded module identity. A missing/broken package does not stop others.

## Load ABI version 1

| WASM export | Contract |
| --- | --- |
| `memory` | Module-local linear memory; not shared with NodeC |
| `panda_abi_version()` | Returns 1 |
| `panda_manifest_ptr()` | UTF-8 manifest byte offset |
| `panda_manifest_size()` | Manifest length, excluding NUL |
| `panda_node_count()` | Number of nodes in manifest order |
| `panda_solve(index)` | Returns 1 (pending), or -1 (invalid index) |

ABI v1 accepts no WASM host imports and has **no geometry/data execution ABI**.
The modules do not share C++ pointers or heaps with NodeC. Future execution must
define versioned data-tree/geometry-handle contracts before implementing compute;
do not pass an `ON_Brep*` between independent module memories. New geometry
algorithms belong in the corresponding existing NodeC native modules, with thin
WASM bindings, per AGENTS.md. True Emscripten side-module linking is not enabled.

One dedicated Worker holds loaded registration modules. Loading has bounded
concurrency (three packages), same-origin URLs, a 16 MiB per-package file limit,
fetch timeouts, and a worker deadline. Cancellation detaches a caller; a stalled
worker is terminated and pending requests rejected, then recreated on demand.
Page exit terminates the worker. There is no localStorage cache of WASM bytes
and no duplicate copy of the geometry kernel. File-import size limits are unrelated.

## Change and verification record

- Added source-side build tooling and registration ABI adapter; generated seven
  browser packages directly from the existing project registrations.
- Added `NodePackageProtocol.mjs`, `NodePackageLoader.mjs`, and
  `NodePackage.worker.mjs` for validation, bounded discovery and worker lifecycle.
- Added `pandaui-wasm-packages.js`; integrated editor boot, plugin state events,
  graph restoration and scheduler-owned warning states.
- Tests verify all 630 WASM pending entries, invalid indices, schema/ABI and
  manifest mismatch, duplicate GUID rejection, URL restrictions, cancellation,
  deadlines, and cleanup. Browser tests use actual Edge, Worker and editor:
  auto-discovery, searchable registrations, ports, pending warnings, graph
  round-trip, enable/disable, repeated load, broken-package isolation and worker
  recovery, with no backend or NodeC geometry-runtime request.
- Export only browser packages, loader/UI files, this documentation and portable
  tests. Native adapter/source build script stay in the development source.
  Synchronization records exact paths and hashes in both frontend changelogs.
- Validation completed in both source and standalone frontend: package ABI tests
  and real Edge editor/Worker tests pass; `npm run build` passes in both projects;
  standalone `npm run check:release` passes. Sync tooling tests: 14 passed, one
  filesystem-symlink capability test skipped by the host. Existing standalone
  editor HTML customization is preserved. No native geometry algorithms or
  Windows node projects were changed; native project rebuild is not required.
