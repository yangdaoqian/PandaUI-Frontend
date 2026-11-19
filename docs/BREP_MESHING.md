# Brep display meshing

Imported analytic Breps remain the source geometry. Display meshes are derived
buffers; a failed face does not delete its original curves or surfaces.

## Recovery and convergence

The main display pass preserves successful faces and shared boundary samples.
Failed faces are retried independently. Approximate display recovery monitors
the UV-area-weighted surface-error residual while refining. Three consecutive
rounds with triangle growth and no meaningful reduction from the best prior residual,
after at least eightfold growth from the seed triangulation, stop that face's
recovery. The original failure and the recovery failure both appear in its
diagnostic. This is a display-recovery heuristic, not a proof that the analytic
surface cannot be meshed by another algorithm.

This does not impose a global vertex or triangle limit. Strict meshing remains
atomic and does not use the approximate-recovery heuristic. Other valid faces
and the source geometry remain available when a face is skipped.

Boundary construction also rejects a collapsed UV loop, or an edge-to-trim
mapping that still yields the same fewer-than-three vertices after three
successive sample doublings. This reports a failed face instead of repeatedly
allocating samples that cannot form a polygon. Tiny edge secant angles are not
refined below the configured minimum edge length; chord error still applies,
and closed curves are measured across all samples, not just their endpoints.

UV orientation and incircle decisions use a binary64 floating-point filter and
exact integer arithmetic when the sign is uncertain. Near-collinear and
cocircular inputs retain exact-zero semantics. Builds must not use fast-math.
UV repair uses a compressed adjacency index per refinement topology instead of
scanning every triangle for every vertex being repaired.
Triangle-center and candidate-edge distance checks evaluate surface positions
only. Normal evaluation and balancing run when a candidate is actually inserted;
the original edge traversal direction and refinement decisions are preserved.

## Progress and early display

The mesh Worker reports the current source face, phase, refinement round and
recovery stage. The import status shows the active object's name and face count.
Progress messages do not resolve the Worker task or release its memory budget.

A large Brep with failed faces can publish its completed primary pass before
the isolated retries begin. This happens once, for primary passes with at least
128 completed faces, rather than repeatedly copying a growing mesh after every
face. The final result replaces that preview on the same document objects.
Intermediate results do not increment final object/failure counters. Imports
retain buffer accounting and wait for preview consumers to unwind on cancellation.
The primary preview forces a redraw even below the normal import byte threshold.
A failed intermediate conversion does not mark a successful final result failed.

This is primary-pass/final-result streaming, not arbitrary per-face streaming
or parallel subdivision of one Brep. Worker parallelism continues across objects.

## Validation

The development project contains native and WASM predicate, topology, meshing,
scene replacement and source-immutability tests. In the standalone frontend:

```sh
node scripts/test-mesh-worker-pool.js
npm run build
npm run check:release
```

The Worker-pool tests cover intermediate/final ordering, progress lifetime,
consumer failures, cancellation and buffer/worker scheduling. Prebuilt NodeC
runtime files contain the shared native implementation; native source and
private model fixtures are not part of the frontend export.
