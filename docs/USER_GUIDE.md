# PandaUI Frontend Features and User Guide

This guide covers **PandaUI Frontend** in this repository. It includes the node editor and browser geometry runtime. The backend and the separate PandaUI Preview application's Materials sidebar, built-in case list and saved-directory bindings are not included.

## 1. Installation and startup

Use Node.js 22, Yarn Classic 1.22.x, and a recent desktop Chrome or Edge with hardware acceleration enabled.

```sh
git clone https://github.com/yangdaoqian/PandaUI-Frontend.git
cd PandaUI-Frontend
yarn install --frozen-lockfile --ignore-scripts
yarn dev --port 9002
```

Open <http://localhost:9002/>. Without `--port`, the current configuration uses port 9000. Implemented local import, node editing and rendering features do not require Rhino or a running backend. The development `/api` proxy targets localhost port 9001; the application enters Local mode when the backend is unavailable. `.env.example` is not loaded automatically, and its legacy port/backend URL variables are not currently wired into the configuration.

Install dependencies before the first build. Local operation does not mean a new machine can prepare its dependencies without network access. At runtime, the application uses locally served Worker/WASM resources rather than a cloud conversion service for local models.

## 2. Workspace and documents

The workspace contains the 3D viewport, node editor and control nodes for files, documents and display settings. Use the context menu to add nodes and search by English name. Categories include Panels, Parameters, Data, Math, Geometry, Transform, Display and Render; empty categories may be omitted.

- **Files**: choose the processing mode and source model.
- **Document Manager**: select, open, import, create, save and manage documents.
- **Display**: configure display modes, edges, mesh quality and related options.
- **Render**: create environment, lighting, material, camera, quality and effect descriptors, then connect them to Render Output.

Models imported in the frontend appear under Private documents; selecting a public document is not required. Accounts, public documents, shared display, server storage and geometry publication require a separately deployed compatible backend. This repository does not contain that service. Saving locally does not publish a document to a server.

## 3. Opening models

1. In Files, set **File processing** to **Frontend · NodeC WASM**.
2. Use **Open file** or drag a model into the viewport. Select related resources together when needed, such as `.gltf + .bin + images` or `.obj + .mtl + images`.
3. Wait for scanning and decoding. Import routes that support progressive display show edges or partial objects before completing the meshes. Not every format can display geometry as soon as reading begins.
4. Inspect layers, instances and visibility in the tree. An object missing from the viewport is not necessarily absent from the source file.
5. Read import warnings. A partially displayed model does not establish a complete, lossless conversion.

| Format | Processing and limitations |
| --- | --- |
| 3DM | NodeC reads geometry, attributes and available cached meshes. Objects without usable caches receive generated display meshes. Custom plug-in data is not universally supported. |
| STEP/STP | Indexes entities, converts supported curves, surfaces and topology into OpenNURBS, then uses the shared display pipeline. Triangle meshes are not presented as original Breps. Initial indexing and individual complex bodies can still take time. |
| IGES/BREP | OCCT WASM display import. Do not assume the same retained editable Brep representation as the STEP route. |
| DWG/DXF | Browser parsing of supported CAD entities. Text, dimensions, proxy entities and particular format versions still have compatibility limits. |
| SKP | Worker decoding retains supported instances, edges, meshes and materials, not NURBS. Progressive scene construction follows container parsing. |
| OBJ/STL/PLY/DRC | Mesh import. Display meshes cannot reconstruct original CAD parameters or topology. |
| GLB/glTF/FBX/3DS/DAE/3MF/AMF/VRML | Scene/mesh import routes; texture and material results depend on the format and accompanying resources. |
| VTK/VTP/PCD/XYZ/OFF | Supported variants of these geometry and point-cloud formats. |

See the [README format matrix](../README.md#import-formats-and-boundaries) for extensions. These are implemented import routes, not a guarantee of compatibility with every version or entity.

## 4. Selection and editing

Select objects in the viewport or tree, then use Gumball to manipulate editable objects. Instances retain their parent/child structure. Editing inside an instance distinguishes child-object operations from operations on the enclosing instance. Selection feedback primarily highlights edges; a filled face overlay is not required.

The tree context menu provides show/hide, show descendants, isolate and lock operations. Parent visibility and locks affect descendants. An object marked visible can therefore remain hidden by its parent. Check source visibility, ancestor states, isolation and clipping planes.

Control-point tools depend on retained curve, surface or SubD geometry. Objects containing only display meshes do not have original NURBS control points. Changing precision and remeshing require original geometry; render-only archives do not guarantee these operations.

## 5. Nodes and execution status

Connect compatible input and output types. Inputs may contain constants, lists or data trees; matching rules depend on the node definition. Organize multiple nodes into a Group and use context-menu commands such as Delete.

Use **Parameters → Geometry** to pick scene objects, then connect its output to the target node. Geometry objects and material descriptors are different data types and are not interchangeable.

**Loading a WASM package does not mean all its nodes can calculate results.** The seven registration packages contain 630 nodes whose current scope is primarily discovery, registration and port definitions. Pending `SolveInstance()` implementations report that they are not implemented and clear their outputs. A node appearing on the canvas is not evidence that its algorithm is complete. Existing implemented frontend nodes are separate from these registration packages. See [WASM node-package status](WASM_NODE_PACKAGES.md).

`.panda` and `.panda-render` are model archives and do not store the node graph. Save graphs separately using the editor's graph save/load controls.

## 6. Mesh quality and large models

Display provides six quality levels: Minimal, Very coarse, Coarse, Low, Medium and High. Curves use distance and angle error criteria; straight lines do not need many uniformly spaced segments. Distances use model units. Objects with retained original geometry can regenerate display meshes after a quality change.

For large files, start with a lower quality to check completeness, then increase it as needed. Multiple Mesh Workers can process independent jobs, but scanning, dependency resolution, individual large objects, main-thread scene mounting and GPU uploads can remain bottlenecks. Adding workers can reduce performance when memory is constrained.

Batching small objects reduces draw calls while preserving object identity and selection/editing behavior. It does not eliminate parsing or meshing time. For repeated access to the same model, saving a local archive and reopening its display cache is usually preferable to converting the source file again.

## 7. Materials and UVs

Use **Scene Material** to select an imported material and edit color, metalness, roughness, opacity, transmission, IOR and supported maps. Parameter meanings depend on the material type. The material sphere provides a quick preview; scene appearance still depends on lighting, scale, surroundings and whether the geometry is closed.

Materials can be shared when their names and appearance/texture states match. Different names prevent merging solely because the parameters match. Editing a shared material affects the objects that reference it. Selecting a scene object locates its material; selecting a material itself should not select every object using it.

**UV Edit** adjusts supported mappings, transforms and repeat settings. **UV Match** matches UVs from a source object to target objects. Supply targets through Geometry nodes and check that usable UV data is available. Texture repeat, UV transformations and texture transformations combine, so avoid unintentionally applying the same scale twice.

## 8. Rendering settings

### Connecting nodes

1. Add and enable **Render Output**.
2. Add Environment, light, Quality, Render Effects and camera descriptor nodes as needed.
3. Connect their outputs to the corresponding Environment, Lights, Quality, Effects and Camera ports on Render Output.
4. For explicit material assignments, supply Targets from Geometry and Material from a material descriptor. Connect Material Assignment to Bindings.
5. Select `raster` for real-time rendering or `pathtrace` for path tracing. Connected parameter inputs can override their corresponding widget values.
6. Keep the camera still while samples converge. Use Export Image and its size/sample settings to export an image.

Supply your own HDR environments and textures. Vehicle examples, HDR environments and a complete PBR asset library are not bundled.

### Real-time mode

Features include filtered shadows, antialiasing, SSAO, environment/planar/screen-space reflections, a studio floor and layered glass compositing. Shadow extent should cover the subject without being unnecessarily large; an oversized extent spreads a fixed shadow-map resolution over too much space. Higher shadow/reflection resolutions and more complex glass increase GPU and graphics-memory costs.

Frosting uses per-pixel background distance, so different pixels on the same object can receive different blur. **Frost distance at roughness 0.5** defaults to 1000 model units: this represents one metre in a millimetre model, while a metre-based model should use 1. Around that reference distance, `roughness=0.5` produces strong diffusion. Zero retains sharp transmission; one reaches maximum detail diffusion. Transmission and opacity still control light throughput, so maximum frosting does not mean complete opacity.

This is a screen-space approximation with a bounded number of layers. Overlapping glass, occlusion boundaries, off-screen objects and repeated refractions are not guaranteed to be correct. Environment, planar and screen-space reflections have different coverage; not every curved surface can reflect the entire scene.

### Path tracing

The integration uses three-gpu-pathtracer 0.0.23 with an isolated newer Three/BVH runtime. Supported materials can use reflections, glass transmission/IOR, textures, lights/HDR, progressive sampling and spatial denoising. WebGL2 and floating-point render targets are required. This is not CUDA, Cycles or Eevee.

BVH construction can take time and memory, and instance conversion may expand geometry. Camera or scene changes reset the affected accumulation. Denoising can remove fine texture detail; compare against an unfiltered result. The real-time frost reference-distance function is not applied to path tracing. Complex nested media, accurate caustics and all advanced material features are not guaranteed. See [implementation and limitations](PATH_TRACER_MIGRATION.md).

## 9. Saving and reopening

| Command | Contents |
| --- | --- |
| Save locally | `.panda`: retained original geometry, display caches, materials and settings. |
| Save as | A full-document copy in the selected location. |
| Save render data | `.panda-render`: meshes/lines/points, hierarchy, transforms, materials, supported textures/HDR and render settings, without original CAD geometry. |
| Open folder | Opens a full-document archive directory. |
| Import render data | Reads render data for display and material editing; it is not a full CAD geometry archive. |

**Frontend's current Document Manager save buttons invoke the system directory picker, including on repeated saves.** Preview's directory-binding and save policy have not been ported. Do not assume this application automatically overwrites the previous folder because Preview does so.

After selecting a parent directory, the application creates a project subdirectory:

```text
selected-parent/
  DocumentName-documentId.panda-render/
    document.json
    current-0.json
    current-1.json           # May appear after subsequent commits
    commits/
    indexes/
    packs/
```

Full-document folders use `.panda`. The first save may contain only one current pointer. Records are grouped into approximately 10 MiB packs, while a large individual record remains whole. Alternating commit pointers support recovery after failures. Copy or move the entire archive directory rather than individual pointers or packs.

The material library, encodable textures and supported HDR inputs are saved with the document; GPU caches are rebuilt. Missing materials or images in older archives cannot be reconstructed automatically. Saving also does not repair faces lost during import. See [storage structure](LOCAL_DOCUMENT_STORAGE.md); read its historical notes alongside the current UI behavior described here.

## 10. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Directory API unavailable | Use desktop Chrome/Edge on HTTPS or localhost. Check `window.isSecureContext`; ordinary LAN HTTP does not satisfy the requirement. |
| AbortError or permission failure after selecting a folder | Check site file-editing permissions, directory write access and browser policies. AbortError can occur without an intentional cancellation and does not indicate a successful save. |
| Must be handling a user gesture | Trigger the picker from a real button click. Breakpoints, asynchronous delays or console calls can lose transient user activation. |
| Parent directory appears empty | Look for the document-name/ID project subdirectory and confirm the UI reported success. |
| No complete Panda document | Select the actual archive directory and verify that its current pointers and referenced commits/indexes/packs are complete. |
| Edges appear without meshes | Check whether generation is still running or reports partial failures. Reduce quality and concurrency if necessary. |
| Some objects are missing | Check source visibility, ancestors, isolation, clipping and import warnings. |
| A material only reflects the environment | Check scene-reflection/floor settings and the coverage limits of planar and screen-space reflections. |
| Glass is too blurry | Check model units, Frost distance and both roughness settings. For path tracing, also inspect denoising and sampling. |
| Path tracing falls back or is slow | Read the status reason. Check WebGL2, graphics memory, resolution, texture/geometry size and unsupported materials. |
| A node has no output | Check input types, connections and status. Pending WASM nodes do not yet implement computation. |
| Public documents are unavailable without a backend | This is a deployment limitation. Local import does not require login; collaboration requires a compatible backend. |

## 11. Build and deployment

```sh
yarn test
yarn build
yarn check:release
```

Deploy the entire `dist/spa` directory at the site root, preferably over HTTPS. Opening `index.html` directly through `file://` is not a supported deployment. All Worker/WASM/runtime assets must be accessible. A frontend-only deployment should return explicit HTTP 503 JSON for `/api`, not SPA HTML. When using a backend, configure API and WebSocket reverse proxies.

Browser regression tests require a separate Playwright/browser environment. The default `yarn test` covers editor/graph logic; it does not certify every CAD format or rendering feature. Further reading: [STEP](STEP_IMPORT.md), [SKP](SKP_IMPORT.md), [WASM nodes](WASM_NODE_PACKAGES.md), [rendering](PATH_TRACER_MIGRATION.md) and [synchronization history](FRONTEND_CHANGELOG.md).
