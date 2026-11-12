# Open CASCADE runtime: sources and replacement

This frontend uses facilities provided by Open CASCADE Technology through **occt-import-js 0.0.23**. The JavaScript wrapper is LGPL-2.1; OCCT 7.6.1 is LGPL-2.1 with the Open CASCADE exception. Complete license texts are in `licenses/npm/occt-import-js/`, `licenses/occt/` and, after a build, `/vendor/occt/`.

## Exact upstream inputs

| Component | Source reference |
| --- | --- |
| occt-import-js 0.0.23 | https://github.com/kovacsv/occt-import-js/tree/c2148e54b456b571238d35cac037d304053d64b2 |
| Published npm package | https://registry.npmjs.org/occt-import-js/-/occt-import-js-0.0.23.tgz |
| OCCT submodule (7.6.1) | https://github.com/Open-Cascade-SAS/OCCT/tree/d2abb6d844231cb8f29be6894440874a4700e4a5 |
| OCCT source archive | https://github.com/Open-Cascade-SAS/OCCT/archive/d2abb6d844231cb8f29be6894440874a4700e4a5.tar.gz |

The npm registry identifies the wrapper commit above. Its Git tree identifies the OCCT submodule commit; `Standard_Version.hxx` at that commit identifies OCCT 7.6.1. The upstream Windows build scripts select Emscripten **3.1.69**, CMake and mingw32-make. PandaUI does not modify these library binaries.

## Rebuild outside this repository

The repository deliberately excludes geometry C++ source. Users can obtain the corresponding upstream source separately:

```sh
git clone https://github.com/kovacsv/occt-import-js.git
cd occt-import-js
git checkout c2148e54b456b571238d35cac037d304053d64b2
git config submodule.occt.url https://github.com/Open-Cascade-SAS/OCCT.git
git submodule update --init occt
```

On Windows, follow the upstream README, install CMake, then run `tools\setup_emscripten_win.bat` and `tools\build_wasm_win_release.bat`. This procedure documents the upstream build; a bit-for-bit local rebuild has not been performed as part of the frontend export.

## Use a modified library

Set `PANDAUI_OCCT_RUNTIME_DIR` to an external folder containing `occt-import-js.js`, `occt-import-js.wasm`, `license.occt-import-js.txt` and `license.occt.txt`, then run `yarn dev` or `yarn build`. Keep the same API as version 0.0.23. If your runtime uses a separate worker script, include `occt-import-js-worker.js` too.

Alternatively, replace these files under `/vendor/occt/` in a deployment. There is no signature check or hash pin that prevents loading a modified library. Library modification and reverse engineering for debugging those modifications are not prohibited by PandaUI.

The public Git repository does not commit the generated OCCT binaries. It pins the npm dependency and includes the source references and replacement mechanism. Anyone distributing a built site or binary archive must also fulfill applicable LGPL source-delivery obligations for that distribution; a pointer to upstream is not a blanket substitute for them. This task publishes the Git repository only, without a compiled release archive or hosted deployment.
