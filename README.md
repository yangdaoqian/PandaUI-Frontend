# PandaUI Frontend

Browser-based 3D workspace and visual node editor, with local geometry processing through a prebuilt NodeC WebAssembly runtime.

This repository contains the standalone frontend. Backend source, account data, shared-document storage, native geometry C++ sources, SDK binaries, sample models, cubemaps and PBR textures are not included.

## Run

Use Node.js 22 and Yarn Classic 1.22.x (Node.js 20 is also supported).

```sh
yarn install --frozen-lockfile --ignore-scripts
yarn dev
```

The default address is http://localhost:9002. The development server does not connect to the original backend automatically. Set PANDAUI_BACKEND_URL in the process environment only when you want to connect to a separately operated service. The .env.example file documents variables; it is not automatically loaded by the configuration.

```sh
yarn test
yarn build
yarn check:release
```

## Current limits

- Prebuilt NodeC.js and NodeC.wasm are included with their Worker/client modules and license files. Local file import and geometry processing run without a backend. The geometry C++ sources and native build tools are not included.
- The extracted third-party catalog and generated placeholder catalog are empty. Native source-defined nodes and editor operations remain available.
- The bundled robot node is not registered. Robot assets, sample models, environment maps and texture presets are not supplied.
- Account, shared-document, script execution and backend geometry operations require a separately operated backend. Existing compatibility client code is retained for review.
- STEP, IGES and BREP import uses the pinned OCCT dependency. The build stages its JS/WASM and notices in public/vendor/occt (ignored by Git). See [source and replacement instructions](docs/OCCT_RUNTIME.md) before redistributing a compiled site.

## Local file import

Open the **Files** node, keep **Frontend · Local / WASM** selected, then choose **Open file**, or drop a model onto the viewport. 3DM and STL imports have been tested without a backend, including uncached Brep meshing. The importer also has paths for STEP/IGES/BREP, DXF, OBJ, PLY, Draco, glTF and additional scene formats; the full format matrix has not been independently validated for this release. DWG and SKP require the separate backend.

To use glTF or OBJ with external resources, select the model and its related files together. Serve production output from `dist/spa` over HTTP(S) at the site root; opening `index.html` with `file://` will not work. A disconnected backend should return HTTP 503 with `{ "code": "BACKEND_UNAVAILABLE" }` for `/api/` requests so the frontend can enter local mode, as the included development proxy does.

## Layout

- `src/`: Vue UI, Three.js scene, import Workers and display logic.
- `public/editor/`: node editor and browser plugins.
- `public/nodec/`: prebuilt geometry runtime and its JavaScript integration.
- `public/legal/`, `licenses/`: dependency inventory and license notices.
- `scripts/`: tests, build asset preparation and release checks.

## License and provenance

Frontend contributions use MIT; the original upstream copyright notice is preserved. Third-party code and binaries retain their own terms. See [license scope](LICENSE_SCOPE.md), [third-party notices](THIRD_PARTY_NOTICES.md) and [release review](docs/RELEASE_REVIEW.md).


`yarn licenses:collect` regenerates the installed-dependency inventory. `yarn check:release` checks candidate Git files for excluded artifacts, common credential patterns, required notices and recorded export hashes.The npm package stays `private: true` to avoid accidental npm publication; this does not restrict GitHub visibility.
