# PandaUI Frontend

A browser-based 3D workspace combining CAD/model import, a visual node editor, editable scene materials, real-time rendering and progressive path tracing. Local geometry processing uses the bundled **NodeC WebAssembly** runtime and format-specific browser importers.

**[详细功能介绍与使用说明（中文）](docs/USER_GUIDE.zh-CN.md)** · [Storage format](docs/LOCAL_DOCUMENT_STORAGE.md) · [Rendering architecture](docs/PATH_TRACER_MIGRATION.md) · [Update notes](docs/RELEASE_NOTES.md)

This repository is the standalone frontend export of PandaUI. It does not include the backend, account/shared-document data, native geometry C++ sources, proprietary SDK/plugin binaries, private models, or the separate PandaUI Preview application. Prebuilt browser geometry and rendering runtimes are included.

## Features

| Area | Functionality |
| --- | --- |
| Local import | 3DM, STEP/STP, IGES/BREP, DWG/DXF, SKP, common mesh, scene and point-cloud formats; see the format matrix below. |
| Progressive display | Worker-based import, early edge display where supported, incremental mesh mounting, mesh-worker scheduling and shared instance geometry. Some formats require indexing/parsing before display. |
| Scene editing | Document/layer/instance hierarchy, selection, Gumball transforms, nested instance editing, visibility, isolation, locking and clipping planes. Editing depends on retained geometry. |
| Geometry display | Six mesh/curve quality levels, adaptive curve sampling, cached meshes, remeshing from retained geometry, and supported curve/surface/SubD control-point tools. |
| Visual programming | Searchable node categories, typed input/output connections, lists/data trees, groups and node previews. Parameter Geometry nodes provide scene-object inputs. |
| Materials and UV | Editable imported material library, material previews, physical/glass parameters, texture maps, UV Edit/UV Match and repeat controls. Material merging requires matching names and appearance. |
| Real-time rendering | Environment/lights, filtered shadows, progressive antialiasing, SSAO, studio floor/planar reflections, screen-space reflections and layered rough transmission. |
| Path tracing | Integrated three-gpu-pathtracer WebGL2 runtime: progressive accumulation, glass/IOR, supported PBR textures, HDR lighting and optional spatial denoising. |
| Local storage | Full `.panda` folders retain supported original geometry and display caches; `.panda-render` folders retain display buffers, materials, supported textures and settings. |
| Optional services | Compatibility clients for authentication, shared documents and backend operations; requires a separately operated compatible backend. |

This is an evolving implementation, not full compatibility with every CAD feature or every node in another application. The **630 nodes in seven WASM packages are registration-only**: their `SolveInstance()` methods report a pending implementation. Existing implemented frontend nodes are separate. See [WASM node packages](docs/WASM_NODE_PACKAGES.md).

## Quick start

Use **Node.js 22** (20 is also supported), **Yarn Classic 1.22.x**, and a recent desktop Chrome or Edge with hardware acceleration enabled.

```sh
git clone https://github.com/yangdaoqian/PandaUI-Frontend.git
cd PandaUI-Frontend
yarn install --frozen-lockfile --ignore-scripts
yarn dev --port 9002
```

Open [http://localhost:9002/](http://localhost:9002/). The explicit port avoids collisions with a separate PandaUI development instance. The current configuration defaults to **9000** when `--port` is omitted.

The current development proxy targets `http://127.0.0.1:9001` for `/api`. A backend is optional for local work; when unavailable, the frontend enters local mode. The legacy `.env.example` is not automatically loaded, and its frontend-port/backend-URL variables are not currently wired into `quasar.conf.js`; use the CLI port option and edit the proxy configuration if needed.

### First model

1. Add/open **Files**. Select **File processing → Frontend · NodeC WASM**.
2. Choose **Open file**, or drop a supported model into the viewport. Select external resources together with a glTF/OBJ file when needed.
3. Inspect the imported private document, layers and instances in **Document Manager** and the document tree. Import may continue after edges first appear.
4. Select objects in the viewport/tree and use Gumball or supported editing nodes. Use **Display** to adjust mesh quality, edges and display mode.
5. Use **Scene Material** to edit imported materials. Connect Environment, lights, Quality and Render Effects descriptors to an enabled **Render Output**; choose `raster` or `pathtrace`.
6. Select the local document in **Document Manager** and use **Save locally** or **Save render data**. Select a parent directory and grant browser write permission; the application creates a document-specific subfolder.

See the [complete guide](docs/USER_GUIDE.zh-CN.md) for rendering, UVs, storage, troubleshooting and performance settings.

## Import formats and boundaries

| Formats | Frontend route | Important limits |
| --- | --- | --- |
| `.3dm` | NodeC/OpenNURBS browser runtime | Uses available cached meshes and generates missing display meshes. Source features and plug-in data are not universally supported. |
| `.stp`, `.step` | Part 21 indexing → supported geometry/topology conversion → OpenNURBS → edge/mesh pipeline | Preserves supported analytic geometry and instances. Unsupported entities or incomplete faces produce diagnostics; not every schema/feature is covered. |
| `.igs`, `.iges`, `.brep` | Pinned OCCT WASM importer | Display conversion; do not assume the same retained editable Brep representation as the STEP route. |
| `.dwg`, `.dxf` | Browser LibreDWG runtime / DXF parser and frontend conversion | Text, dimensions, proxies and specialized entities have incomplete fidelity. LibreDWG runtime has GPL-3.0-only terms. |
| `.skp` | Browser decoder Worker → progressive scene construction | Mesh/edge/material/instance display, not NURBS conversion. Container parsing precedes progressive display generation. |
| `.obj`, `.stl`, `.ply`, `.drc` | Mesh loaders / Draco runtime | Mesh data does not become original analytic CAD geometry. |
| `.glb`, `.gltf`, `.fbx`, `.3ds`, `.dae`, `.3mf`, `.amf`, `.wrl`, `.vrml` | Scene loaders | External resources and material interpretation vary by format. |
| `.vtk`, `.vtp`, `.pcd`, `.xyz`, `.off` | Geometry/point-cloud loaders | Supported variants only. |

These are implemented import routes, not exhaustive certification of all format versions. See [STEP](docs/STEP_IMPORT.md), [SKP](docs/SKP_IMPORT.md) and [meshing](docs/BREP_MESHING.md).

## Rendering

The interactive renderer uses the existing Three.js r120 scene. Path tracing uses an isolated **three-gpu-pathtracer 0.0.23 / Three 0.170.0 / three-mesh-bvh 0.8.3** runtime. It is not Blender Eevee/Cycles and does not use CUDA.

Real-time glass and reflections are bounded screen-space/planar approximations. Off-screen content, intersecting transparent surfaces and deep glass stacks can show artifacts. Frost uses per-pixel background distance; its reference distance is in **model units**, not automatically millimetres. The artistic raster frost curve is not applied to path tracing.

Path tracing needs WebGL2 and supported floating-point targets. It builds a BVH and accumulates samples while stationary. Denoising is a spatial filter, not OIDN/OptiX. Unsupported material features or GPU limits can request raster fallback. See [architecture and limitations](docs/PATH_TRACER_MIGRATION.md).

## Save and reopen

| Command | Result |
| --- | --- |
| Save locally | `.panda` folder with retained original geometry, cached display and materials/settings. Geometry retention depends on the import route. |
| Save as | A full-document copy in the chosen location. |
| Save render data | `.panda-render` with display buffers, hierarchy/transforms, materials, supported images/HDR and render settings; no original CAD geometry. |
| Open folder / Import render data | Reopen the corresponding archive folder with its current pointers, commits, indexes and packs. |

**Current Frontend behavior:** Document Manager's save commands invoke the system directory picker, including repeated saves. Preview's destination-binding and Save/Save As policy are not part of this export. Model archives do not serialize the node graph; save graph work separately through the editor's graph controls.

Folder access requires the File System Access API on **HTTPS or localhost**, typically desktop Chrome/Edge. Ordinary LAN HTTP is not a secure context. Browser permissions cannot be bypassed by the application. Successful saves write into a document-specific subfolder under the selected parent; keep the entire archive folder together.

## Build, deploy and validate

```sh
yarn test
yarn build
yarn check:release
```

Serve `dist/spa` from the site root over HTTP(S); `file://` does not support the Worker/WASM loading model. Deploy all generated runtime assets. The build stages OCCT JS/WASM and notices from the pinned dependency into `public/vendor/occt` (ignored by Git). See [OCCT distribution instructions](docs/OCCT_RUNTIME.md).

For a local-only deployment, respond to `/api/` requests with HTTP 503 and JSON `{ "code": "BACKEND_UNAVAILABLE" }` instead of returning SPA HTML. To enable collaboration, reverse-proxy that route and WebSockets to a compatible backend. Some browser regressions need a separate Playwright/browser environment; `yarn test` runs the portable editor/graph checks.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/` | Vue/Quasar UI, documents, interaction and display |
| `src/import/` | Format adapters, conversion and Worker orchestration |
| `src/storage/` | Folder archives, packed records, integrity and persistence |
| `src/render/` | Materials, raster effects, render descriptors and path tracing |
| `public/editor/` | Node editor, data/parameter plugins and render nodes |
| `public/nodec/` | Prebuilt geometry WASM, bindings and registration packages |
| `public/shared/` | Bundled format/render runtimes and notices |
| `scripts/` | Runtime preparation, tests, export and release checks |
| `docs/` | User guides, implementation contracts and change history |

## License and project scope

Frontend contributions use MIT within [LICENSE_SCOPE.md](LICENSE_SCOPE.md); the original upstream notice is preserved. Third-party runtimes retain their own licenses, including GPL LibreDWG and LGPL/exception OCCT. MIT does not relicense those components. See [third-party notices](THIRD_PARTY_NOTICES.md), [release review](docs/RELEASE_REVIEW.md), and runtime-local notices.

Sample models, environment maps, PBR presets, robot assets and proprietary component catalogs are not provided. `private: true` in `package.json` prevents accidental npm publication; it does not restrict GitHub visibility. Technical release checks verify export boundaries, common credential patterns, notices and recorded hashes; they do not replace the documented provenance review.
