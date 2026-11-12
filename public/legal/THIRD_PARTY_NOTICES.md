# Third-party notices

The upstream McNeel MIT notice in LICENSE is preserved. PandaUI frontend contributions use MIT within the scope described in LICENSE_SCOPE.md. This does not relicense bundled third-party libraries or binaries.

- Installed dependency inventory (production and build tooling): public/legal/dependency-inventory.json. Consolidated notices: public/legal/npm-licenses.txt. Regenerate with `yarn licenses:collect` after dependency changes.
- Available direct dependency notices: licenses/npm/.
- Roboto and Material Icons: licenses/roboto-font.txt, licenses/material-icons.txt, licenses/material-icons-outlined.txt.
- gl-matrix: full MIT notice retained in public/editor/js/libs/gl-matrix-min.js.
- CodeMirror 5.65.16: original headers and the release's full MIT license are retained in public/editor/js/libs/codemirror/LICENSE. Source: https://github.com/codemirror/codemirror5/tree/5.65.16.
- rhino3dm, openNURBS, Draco: original notices retained in public/nodec/licenses/ as provenance records; the combined NodeC binary and its JS loader are now included; geometry C++ source is not. See docs/NODEC_RUNTIME.md for hashes and the outstanding review.
- NodeC toolchain/runtime notices: Emscripten, compiler-rt, libc++, libc++abi, libunwind, musl and android_uuid texts are preserved under public/nodec/licenses/. UUID copyright blocks are included separately. These notices were collected from the original build dependency tree; they do not constitute a verified binary SBOM.
- occt-import-js 0.0.23: LGPL-2.1; OCCT 7.6.1: LGPL-2.1 with the Open CASCADE exception. This software uses facilities provided by Open CASCADE Technology. Build hooks preserve the notices and exception alongside the unmodified runtime. Exact source references and replacement instructions: docs/OCCT_RUNTIME.md.
- Supplemental upstream license texts for packages missing a bundled notice are in licenses/supplemental/. Sources, blob hashes and whether a release tag was available are recorded in licenses/supplemental-sources.json. HEAD-based notices are identified as such; they are not presented as verified historical release texts.
- charcodes 0.2.0 and requireindex 1.2.0 declare MIT in npm metadata, but contain no bundled license text and their upstream repositories expose no license file. Both are build/lint dependencies, not production dependencies; node_modules is not distributed in this repository. This metadata limitation is retained in the inventory.
- Build-time webpack-chain uses MPL-2.0; its source is available from the pinned npm package and https://github.com/neutrinojs/webpack-chain. caniuse-lite data is CC-BY-4.0, with attribution and license in the consolidated notices. Packages offering BSD-3-Clause OR GPL-2.0 are used under the BSD-3-Clause option.

The extracted third-party node catalog, SDK binaries, sample media, robot model assets and backend implementation are excluded. API names, small interoperability mappings and copyright notices are retained; they do not imply affiliation. The deferred NodeC algorithm provenance review is recorded in docs/RELEASE_REVIEW.md.
