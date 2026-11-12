# Release review — 2026-11-12

Status: prepared for the maintainer-requested public GitHub source repository, including the prebuilt NodeC runtime. Meshing and curve-sampling provenance review is deferred at the maintainer's explicit request. This is not a declaration of legal clearance.

## Completed isolation

Frontend source, selected build/test scripts, unchanged upstream license and preliminary notices were copied into an independent directory. Backend/data/cache/model/texture/decompilation directories were not copied. No symlink to the original project is used.

## Changes for publication

1. Frontend contributions follow the existing MIT license; LICENSE_SCOPE.md distinguishes third-party binaries and notices. No third-party copyright holder was renamed.
2. CodeMirror 5.65.16's complete license was added. Installed direct/transitive dependencies and build tools are inventoried with notice texts and supplemental-source records.
3. OCCT was pinned to its published wrapper and submodule commits. LGPL and the OCCT exception are included; upstream source access, rebuild steps and a replaceable runtime path are documented. Generated OCCT binaries and dist are excluded from Git.
4. Node adapters and C# templates were inspected as client-side API integration. The export retains small compatibility identifiers and template interface names, but no extracted full catalog, proprietary SDK implementation, backend DLL or decompilation archive. This inspection does not reconstruct the complete authorship history of every file.
5. Model, robot, texture and environment assets remain excluded. Existing font and icon-library notices are retained; the replacement favicon is project-authored.
6. The candidate Git files are checked for backend/data directories, native source, credential patterns, large files, required licenses and export-hash consistency. No original backend credential is copied or published. Any credential rotation in the original backend remains a separate task.
7. Build and editor tests run before publication. CI repeats the technical checks. No compiled GitHub Release or hosted deployment is included in this publication request.

## Adaptations made only in this copy

- Backend npm scripts removed; npm package kept private to prevent accidental npm publication.
- Default dev port 9002, browser auto-open disabled, backend connection requires explicit environment setting.
- NodeC.js and NodeC.wasm restored from the working application on 2026-11-12. No geometry C++ source was copied. The maintainer subsequently disabled the on-screen review notice.
- Extracted catalogs replaced with empty compatibility interfaces; local empty catalog accepted.
- Robot plugin registration disabled; source adapter retained for review.
- Original app favicon replaced by a simple newly authored SVG.

See EXPORT_MANIFEST.json for copied file hashes and exclusions. Generated dependencies/build directories are ignored and are not release source.

The technical release check no longer unconditionally blocks publication: it enforces the exclusions and notice requirements above and reports the deferred algorithm review explicitly. It must not be interpreted as a warranty of non-infringement.
