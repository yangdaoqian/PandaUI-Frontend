# Scene file adapter

```js
import { openSceneFile, SCENE_FILE_FORMATS } from './SceneFileImport'
const packet = await openSceneFile(file, { files, signal, onProgress })
```

`files` is an array or FileList containing selected sidecars. Relative directory
paths (`webkitRelativePath`, or `relativePath`) take priority, then an unambiguous
basename. Missing/ambiguous geometry buffers reject the import. File URLs are
never fetched from the network. Callbacks receive `{phase,loaded,total,format}`;
phases are `reading`, `parsing`, `complete`. Byte counts precede record counts.

The result is `{format,layers,records,warnings}`. Layers are `{id,name,path}`.
Each record is `{displayObject}` with:

- `id`: deterministic file/node/material/instance identity; `objectId`: shared
  identity across the material groups or glTF primitives of one logical object.
- `name`, `layerPath`, `hierarchyPath` (array of ancestor names including object).
- `kind`: `mesh`, `lines`, or `points`.
- `positions`: owned Float32Array, `indices`: Uint32Array, optional `normals`,
  RGB `colors`, `uv`, `uv2` and `tangents`: Float32Array. Lines always contain pairs of segment indices.
- `matrix`: 16 column-major world-transform values, not baked into positions.
- `color`: RGB **0–1**, plus `opacity`, `visible`, `side`, optional `pointSize`.

Arrays can be shared between instances. Consumers that support independent edits
must clone arrays when mounting. `SceneFileRecords` exports
`collectSceneFileTransferables(packet)` (deduplicated buffers) and
`releaseSceneFilePacket(packet)` (drops packet references after consumption).
Group records by `objectId` to retain one selectable logical object. Do not apply
their identical world transforms twice. Absent mesh normals must be generated.

## Supported scope

| Extensions | Scope and limitations |
| --- | --- |
| glb, gltf | glTF 2; embedded buffers and selected sidecars; default scene only. Required unsupported extensions, Draco, Meshopt, and EXT GPU instancing reject with actionable errors. Ordinary reused mesh nodes preserve instances. |
| fbx | Three r120 ASCII FBX 7+ and its binary parser. Static pose. Source units/up-axis remain loader coordinates. |
| 3ds | Static mesh chunks and local transforms. Keyframe animation/hierarchy omitted with warning. |
| dae | COLLADA XML; loader applies units to meters and Y-up conversion. External document references rejected. |
| 3mf | Single core model part; mesh/component instances and build transforms, converted to millimeters. Adapter repairs r120 repeated-build-instance loss. Required extensions, multiple model parts, external references and cycles reject. |
| amf | Plain XML or ZIP containing exactly one AMF; triangle objects/materials, millimeters. Constellations, curved edges and textured geometry reject. |
| vtk | Legacy ASCII/binary polygon/triangle-strip POLYDATA; line/vertex cells unsupported, scalar fields omitted. |
| vtp | One XML PolyData Piece, polygons/triangle strips. No appended data or line/vertex cells. |
| pcd | ASCII and Float32 binary positions/normals; r120 binary_compressed path available. Multi-count fields rejected. Invalid positions removed with warning. VIEWPOINT/scientific fields omitted. |
| xyz | Three XYZ columns or six XYZ RGB columns, consistently per file; whitespace/comma/semicolon separated. RGB values 0–1 or 0–255, selected per whole file. |
| off | ASCII OFF/COFF/NOFF; validated polygon indices, concave triangulation, normals/vertex colors. Face colors and vertex alpha omitted with warnings. |
| wrl, vrml | VRML 2.0 static scene; Inline external scenes rejected; behavior/routes omitted. |

GLTF/GLB, FBX, DAE and 3DS retain supported embedded/selected image textures as
RGBA pixel packets with encoding, sampler, UV-transform and flipY metadata.
PBR fields and material slots survive mounting; color/emissive images use sRGB
and data maps use linear encoding. Missing/corrupt optional textures produce
warnings and retain material colors. Three r120 still limits UV-channel and
per-map transform combinations; this is not full support for every material
extension. Document removal disposes mounted texture resources. Skinning
and morph targets are baked into initial-pose positions; animation playback is
not retained. Cameras/lights are omitted with warnings. No decoder packages or
DOM polyfills are added.

PCD, legacy VTK, XYZ, and OFF run in `SceneFile.worker.js` automatically when a
browser Worker exists. Its dedicated worker is terminated on abort and completion;
arrays transfer without copies. Other loaders run on the main thread with native
DOM support. Their synchronous parser cannot be interrupted mid-call; asynchronous
abort returns promptly and cleanup runs after the loader finishes. Parsing and
serialization currently materialize a complete packet, not a streaming iterator.

## Validation

Run `node scripts/test-scene-file-import.js` and
`node scripts/test-scene-file-import-browser.js`. The latter builds only this
module in **production mode** into a temporary webpack directory, serves it on an ephemeral local port,
and runs headless Edge. It accepts `SCENE_FILE_PLAYWRIGHT` (package path) and
`SCENE_FILE_BROWSER_CHANNEL`; it needs no live PandaUI server or dependency edits.

The fixtures cover every advertised extension, embedded and sidecar glTF,
multiple glTF material primitives, missing textures, ASCII FBX, binary 3DS,
COLLADA units, repeated 3MF build instances, XML/ZIP AMF, ASCII/binary VTK/PCD,
ASCII VTP, worker transfers, cancellation, and rejected missing/unsupported inputs.
Binary FBX, compressed PCD and compressed/inline-binary VTP are inherited loader
paths without fixture coverage; they are not claimed as separately verified.

`scripts/SceneFileWebpack.js`, called by Quasar's `extendWebpack`, isolates the
r120 `VRMLLoader.js` grammar into `js/scene-file-vrml-grammar.[contenthash].js`.
Only that asset is excluded from Terser. Chevrotain scans rule function source
and requires the original token variable names; minification otherwise fails
with `Terminal Token name ... not found in rule: version`. Chevrotain itself,
Three, application code, and other loader chunks remain minified. The production
browser test asserts this asset boundary and exercises both WRL and VRML imports.
