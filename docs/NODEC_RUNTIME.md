# Prebuilt NodeC runtime

Updated: 2026-11-12.

The standalone frontend includes the working NodeC JS/WASM pair plus the existing Worker, import, meshing, control-point and client modules. No .NET runtime, native DLL, RhinoInside worker or geometry C++ source is included.

| File | SHA-256 |
| --- | --- |
| public/nodec/NodeC.js | abad61331f669e64b08b264d7e03cc2921058a67214c2bc9e6f55ffeb4f46419 |
| public/nodec/NodeC.wasm | 6dc6cb79c425ed3b3e9333eae44fe65d2ddc7c80f52e984c452d739474cf8294 |

Existing licenses are preserved under public/nodec/licenses. These are the original project's prebuilt artifacts, not a fresh native rebuild or a completed legal clearance. At the maintainer's explicit request, meshing and curve-sampling provenance review is deferred while preparing this repository for publication. The browser receives these binaries; excluding C++ source does not remove applicable distribution obligations.

The generated third-party node catalog remains excluded. This does not prevent file import. The original application and its backend are unchanged.
