# OpenNURBS-first progressive STEP import

Updated: 2026-11-14.

Normal frontend STEP/STP imports convert each supported body into a valid native
OpenNURBS Brep **before** producing any display geometry. The resulting records
use the existing 3DM edge, mesh-worker, selection, document and remeshing pipeline.
A failed conversion is reported; it is not replaced with display triangles or a
mesh wrapped in a Brep.

## Pipeline

1. `StepPart21.js` scans `Blob.slice()` windows and indexes entity IDs, offsets
   and references. It retains original source bytes and makes dependency-complete
   jobs, preserving units, placement, styles and repeated assembly occurrences.
   Indexing must finish before conversion can start; it does not retain the whole
   file as a JavaScript string.
2. For partitioned files, the importer emits a native metadata packet once.
   Product/assembly occurrences, units, visibility, layer and appearance records
   are decoded into one shared entity namespace. Geometry jobs then include only
   their dependency closure and resolve common metadata through that namespace;
   they do not reread or rewalk the same product/style/unit graph. Nearby source
   entity rows are coalesced into bounded reads, reducing small `Blob.slice()`
   operations while keeping each job's memory bounded. Files without a safe
   partition plan keep the compatibility path.
   Auxiliary `GEOMETRIC_SET` / `GEOMETRIC_CURVE_SET` roots participate in
   dependency grouping and travel with their associated topology bodies. They
   do not become independent meshing jobs. A set that cannot be associated
   safely still triggers whole-file fallback; merely containing a datum curve
   beside a solid no longer forces an entire assembly into one decode.
3. `StepBrep.js` reads the source curves, surfaces and topology. NURBS degrees,
   knots, multiplicities, control points and weights go into a native descriptor.
   This stage never calls the separate JavaScript body tessellator.
4. `StepOpenNurbsImport.js` calls NodeC WASM `nodecCreateBrep`. It builds vertices,
   shared edges, faces, loops and trims; reconstructs missing UV curves against
   the original surfaces; validates the Brep and checks declared closed shells
   for solidity. `BREP_WITH_VOIDS` keeps its outer shell and oriented inner
   shells, including the EXPRESS `.T.`/`.F.` orientation rule. Exact rational
   sphere and torus charts use pullback recovery because their NURBS parameters
   are not STEP angular parameters. A valid open result may be retained with an
   explicit warning (see partial recovery below). Seam reparameterization preserves
   geometry. Display quality does not change topology-conversion accuracy.
5. Units and assembly placement are applied once to the Brep. Names, whole-body
   visibility, colors and hierarchical layer assignments become OpenNURBS
   attributes. The importer emits an ordinary binary object record, edge preview,
   exact source archive and cumulative metadata header. Metadata headers contain
   layers but no retained geometry. Native working handles are released before
   yielding each record.
6. `LocalImport.worker.js` and `LocalImportClient.js` deliver bounded batches.
   `PandaUIApp.js` mounts edges immediately. The same object record is transferred
   to `ImportMeshFeed.js`, which schedules the existing mesh workers concurrently.
   There is no second STEP parse/conversion pass to generate display meshes.
   Each job carries its matching metadata header, so later layer additions cannot
   invalidate an earlier job. Feed capacity follows the active worker limit and
   buffered bytes, applying backpressure instead of retaining an unlimited queue.
7. `PandaUIDoc.js` registers one native source archive and selection root per
   occurrence. `remeshLocalDocument.js` fills/replaces display meshes under that
   root, preserving object identity, attributes, layers and visibility. Quality
   changes remesh from the retained Brep, never from display triangles.
8. EOF releases the source index and converter. Import completion waits for the
   mesh feed. Cancel/close terminates workers, drains pending consumers and clears
   geometry archives; late packets cannot repopulate the disposed document.

Meshes remain necessary for GPU display. Their presence does not mean the imported
source geometry is a Mesh: `PandaUIDoc.importedGeometrySources` holds native Breps
used for control points, remeshing and publication.

## Accuracy and source repair

Declared STEP distance uncertainty is read in the applicable representation's
length units and kept separate from display tolerance. An internal
`topologyTolerance` override can specify the fitting target in millimeters.
Missing pcurves are recovered by analytic inversion or bounded numerical surface
projection followed by adaptive UV interpolation. Sampled error checks compare
those trims against the original 3D edge and the projected curve. This is sampled
error control, **not a certified global Hausdorff bound**.

Some source edge curves do not lie on their declared surfaces, even at endpoints.
Recovery permits a separate bounded source-gap budget (`stepRepairTolerance`,
2.6 mm by default, at least the declared model uncertainty). It preserves original
3D curves/surfaces and stores measured edge/vertex/trim tolerances. When this
explicit recovery budget is larger than the fitting target, it does **not**
relax adaptive fitting. Recovery first projects knot/uniform anchors with a
multi-start search when the local result is inaccurate. Both endpoint sewing
corrections are established before fitting, tapered over their adjacent anchor
intervals and retained for independent final validation. The fitting error is
measured against this explicit sewn target; source and sewing discrepancies
are recorded separately. Refinement uses world-space errors, so a genuine pole
is not rejected simply for having nonunique UV coordinates.

Periodic chart relocation clamps numerical overshoot only after a world-space
check. Shared seam uses are normalized to actual parameter-domain boundaries,
including neighboring trim endpoints. This changes the UV geometry, not just
its classification flags. Independent samples after chart changes must satisfy
the original fitting tolerance and the total repair envelope. Source curves,
control nets and weights are not fitted to these UV changes. Strict descriptor
calls without `repairTolerance` retain their original admission policy.

The Brep user string `nodec.step.pullback` retains conversion diagnostics,
including measured source gaps, fitted deviations, repaired entities, projection
work, seam changes and singular trims. Imported repaired objects produce a visible
warning with count, maximum sampled source gap, endpoint sewing, UV fitting
error and repair limit. A value exceeding
the admitted budget remains a conversion failure; missing faces are not silently
removed to make a body valid. Partial recovery, when enabled, is separately
identified and never claims that all source faces survived.

Recovered periodic NURBS boundaries spanning more than one chart can be split
into two connected patches. The new shared boundary is an exact surface
isocurve. Source edge intersections are stored by their original parameter;
all incident faces receive the same exact 3D edge subdivisions, including
faces visited before the split was discovered. Each patch then receives an
exact surface seam relocation when necessary. A seam endpoint adjustment
refits neighboring recovered trims instead of stretching an old UV segment.
An adaptive fitting failure can retry that trim with multistart projection;
this does not increase its fitting tolerance. Diagnostics retain `chartSplits`
and `robustRetries`, and display face counts describe the resulting native Brep.
Detailed `trimRepairs` identify source face indices and working edge indices
before topology compaction; they are not indices into the final archive.
`edgeRepairs` and `vertexRepairs` are collected from the final compacted Brep.

## Scope and limitations

Supported descriptors include planes, rational/nonrational NURBS patches,
bounded cylinders/cones, exact rational spheres/tori, oriented/shared edges, outer loops and holes,
open/closed shells and single-shell surface models. Missing UV curves, supported
periodic charts and genuine singular surface boundaries have native recovery.
The converter is not a complete AP203/AP214/AP242 implementation or a general CAD
healing service. Unsupported surface forms, ambiguous seams, invalid topology,
external references and unsupported representation structures remain explicit
failures. Whole-body colors/visibility are carried through; arbitrary per-face
materials, scoped style overrides and transparency do not yet have complete parity.

The new periodic chart split requires one outer loop and one connected boundary
chain per half, with recovered UV curves aligned to source edge parameters.
Multi-hole/disconnected chart splits, more than two windings, and arbitrary
supplied pcurves without edge parameter correspondence are explicit failures.
Ordinary holes contained in a supported chart remain supported. An unsupported
split remains an error; only an error carrying an unambiguous source-face index
can enter the bounded partial-recovery policy described below.

## Mapped assemblies and parser diagnostics

`MAPPED_ITEM` and `REPRESENTATION_MAP` now share the assembly hierarchy used by
product relationships. Simple and complex 3D Cartesian mapping operators support
orthogonal bases, positive uniform/nonuniform scales, explicit mirrored axes,
source-frame offsets and nested placements. Geometry and frame origins are
normalized to millimeters once. Repeated occurrences reuse one definition solve,
and retain separate source archives/IDs. Mapped-item invisibility is inherited by
its subtree without hiding other uses of the same definition.

Assembly cycles, zero/nonfinite scales, unsupported nonorthogonal operator axes,
conflicting units and overflowing conversion-based units produce errors. An
assembly containing only mapped children does not need its own geometry or
product declaration to become a root.

The byte scanner validates parameter separators and complex-component duplicates.
The entity decoder reads STEP Unicode/hex/shift escapes and binary literals;
malformed escapes and unsupported legacy code pages fail explicitly. File schema
names and unknown-schema diagnostics are preserved. Recognizing a schema is not
complete EXPRESS validation. Complete-file imports check dangling references;
partition packets resolve against the shared metadata namespace and the full
file's already-validated byte index. Unsupported edition-3 sections and multiple
or parameterized DATA sections remain explicit errors.

## Bounded partial recovery and native validation

Partial recovery defaults on. Native bridge errors beginning with `STEP face N`
identify the **current descriptor's source face**, even if it later splits into
multiple periodic patches. The importer keeps the original source entity ID and
maps indices across retries. It may remove at most
`max(1, min(64, floor(sourceFaceCount * 0.25)))` faces and must retain at least
one. Every result must still pass native validity. A small or malformed source
shell may remain valid but non-manifold; that state is recorded as
`nonManifoldRecovery` instead of rejecting the entire object. An incorrectly
declared closed shell may remain an explicitly reported open Brep.
`allowPartialRecovery: false` disables native and JavaScript retry recovery for
internal strict callers. Descriptor-level unsupported faces remain a separately
reported limitation.

Generic native `m_L`/`m_F` validator indices **cannot identify source faces in
JavaScript** and never trigger JavaScript face deletion. The native builder can
remove invalid emitted faces using its retained source-index mapping. Skipped
face IDs, original indices and error messages
are retained in `stepGeometryDiagnostics.skippedFaceDetails` and the serialized
Brep user string `PandaUI.STEP.Recovery`; omitted faces are absent from the Brep.
Object failures also report conversion stage and error code. This does not yet
offer the omitted face as a separate editable untrimmed-surface object.

Supplied-pcurve validation now includes witnesses inside every nonzero curve
span, avoiding a global grid that misses short knot intervals. Curve-distance
checks search multiple sampled local minima across spans rather than refining
only one coarse winner. Both searches have bounded sampling and still provide
sampled evidence, not a certified continuous error bound or full sewing algorithm.

Regression coverage: `test-step-part21.cjs`, `test-step-native.cjs`,
`test-step-brep.cjs`, `test-step-opennurbs.cjs`, `test-step-poles.cjs`,
`test-step-instances.cjs` and `test-step-progressive-browser.cjs`. Owned mapped
fixtures cover nested mixed units, source origins, mirrors, nonuniform scale,
visibility, shared definitions and progressive native records. Native kernel
tests additionally cover narrow deviations and folded nearest-point candidates.

Remaining kernel work includes general geometric sewing of separately represented
edges (including partial overlaps), cavity-shell containment, degenerate-torus
branch selection, arbitrary revolved / offset-surface conversion, general trim-region intersection graphs,
metric-aware supplied-pcurve UV tolerances and external document resolution.
Existing support for cylinders/cones does not imply support for arbitrary
`SURFACE_OF_REVOLUTION`. These are algorithmic gaps, not meshing-quality options.

`nativeStep: false` is an internal compatibility/differential-test switch using
OCCT display meshes. Normal File-node frontend imports use the OpenNURBS-first
path and never silently switch to that display-only implementation. The legacy
`parseNativeStep` evaluator is retained for differential tests and explicit callers.
Partition fallback means a larger dependency job; it does not bypass native
geometry validation or imply early display of one huge body.

Memory scales with the index, largest active conversion job, retained native source
archives and bounded mesh-worker queue. One huge body is still an atomic conversion;
this importer does not promise face-by-face display before that Brep is validated.

## Diagnostics and validation

Progress exposes source bytes, indexed entities, job counts, native object counts,
failed objects/jobs, repaired objects, sampled source gaps, sewing and fitting
errors, and repair limits.
`stepTimings` separates indexing, dependency extraction, native conversion, packet
work and first packet. The final warnings summarize failures and repairs.

Each native record also has `stepConversionTimings`: descriptor construction,
native Brep creation, placement/attributes, archive serialization, edge preview
and header serialization. Native `nodec.step.pullback.timings` further separates
source topology, UV pullback, periodic chart splitting, chart/error validation,
and final topology validation. These coarse clocks do not run per sample.
`detailTimings` splits these stages into trim recovery, surface preparation,
chart normalization, trim validation, topology emission and validity/manifold
checks. `projectionWork` reports recovery and cumulative local solves, derivative
and point evaluations, line-search trials, seed grids and final validation
witnesses. The detail stages are nested inside `timings`, not additional costs.

Hot-path validation formats detailed messages only on failure and uses literal
messages without temporary string allocation. Exact consecutive surface-point
queries reuse one cached result per surface; domain changes invalidate it.
Projection line searches skip steps that clamp/round to the current UV exactly.
There is no approximate-coordinate cache or relaxed tolerance. Accepted UV
intervals retain all seven fitting probes and independent final validation.
`evaluationCacheHits` and `stationaryTrials` describe the avoided repeated work.
Point evaluation uses a surface-local knot-span hint, reset with chart domains.
Adjacent validation segments may reuse an exactly identical successful endpoint
witness on the same unchanged trim. Near-equal parameters are still evaluated
separately; all witness positions, tolerances and measured error maxima remain.
`projectionWork.reusedValidationSamples` records this exact endpoint reuse.

Simple validation has analytic fast paths. Exact line trims use a clamped point to
segment distance, and circular trims use the source plane, radius and bounded angle
interval. The general 3D curve search remains available for ellipses and NURBS, so
the optimization does not weaken validation for unsupported or ambiguous curves.
Spherical surfaces use an exact rational quadratic sphere descriptor and an analytic
pullback that preserves the incident longitude at the two singular poles. This
avoids treating rational NURBS parameters as angles and prevents pole connectors
from changing face orientation.
Repeated UV point evaluations and domain-roundoff calculations are hoisted out
of individual validation checks.

The native build optimizes STEP/NURBS numerical translation units with `-O3`,
without fast-math, while retaining size optimization for the other runtime code.
`NODEC_FAST_NUMERICS=OFF` retains the size-oriented compile configuration for
controlled comparisons. The browser regression also records per-object mesh
dispatch-to-reply durations (`meshJobs`), including startup/transfer/delivery;
their sum is not wall time or exclusive CPU time because jobs run concurrently.

```sh
node scripts/test-step-part21.cjs
node scripts/test-step-native.cjs
node scripts/test-step-brep.cjs
node scripts/test-step-opennurbs.cjs
node scripts/test-step-progressive.cjs
node scripts/test-cad-frontend-import.js
npm run build
node scripts/test-step-progressive-browser.cjs dist/spa
```

The browser regression uses separately installed Playwright (optionally selected
with `PANDAUI_PLAYWRIGHT_PATH`). It runs the actual production application with
backend requests unavailable and OCCT assets blocked. It checks native source
archives, layers/IDs, progressive edge and mesh display, hidden objects,
remeshing after reader disposal and cancellation without late scene updates.
An optional local model path and expected count can follow `dist/spa`; the browser
receives a real File through an input rather than a JSON copy of its bytes.

Synthetic native tests include nonlinear UV recovery on nonuniform planar
NURBS with/without displaced 3D boundaries and slightly oblique shared seams.
An owned capped rational NURBS cylinder also checks a slanted seam requiring
two charts, shared cuts propagated to earlier caps, opposite edge uses, exact
source surface/curve samples and a valid solid after archive roundtrip.
They distinguish strict rejection from bounded source repair,
verify retained original geometry, missing-pcurve recovery, rational weights,
analytic seams, topology, archive roundtrips, units and native publication.
Installed dependency fixtures are read in place. User models and private plugin
analysis are never copied into the frontend export. Static reference analysis and
independent tests do not establish numerical equivalence to Rhino's importer.

The 2026-11-13 native validation of the supplied local STEP model now converts
70/70 objects into valid native Breps: 8,830 faces, 48 solids and 22 open Breps.
Eight additional exact chart patches account for the difference from 8,822
source faces; no source faces were discarded. The four previously failing
bodies now pass. All archives decode and metadata/layer checks pass. Maximum
sampled UV fitting error is 0.000784374 mm, below this model's 0.001 mm target.
One trim required multistart projection retry. The largest sampled source gap
is 0.702119 mm and remains explicitly reported under the separate repair policy.

The complete native validation, including archive/metadata checks, took
712.634 seconds with other checks running concurrently. This is not an isolated
import-speed benchmark or an original-importer equivalence result.

The shared-metadata optimization was checked against `Body-L01.stp` (the local
1,083,624,776-byte test file): one metadata packet decoded 257,529 entities,
1,309 instances and 8,233 occurrences. Sampled jobs retained identical
instance transforms, units, layer names and colors; their dependency packets
used roughly 10--19 ms of source reads and 1--10 ms of local decoding in the
check harness. The one-time metadata pass is bounded but keeps its decoded
entity table until import disposal, so this is not a claim that the complete
model fits in a small memory budget.
The production Edge browser regression also passes for the complete model
with backend unavailable and OCCT blocked: 70 native source archives and scene
roots, 70 edge parts, 85 display mesh objects, 3,102,151 display vertices, zero
missing mesh objects/faces and zero meshing failures. Readers and mesh feeds
release after completion. No page errors, missing assets, backend writes or
OCCT requests occurred. Total browser import elapsed time was 786.997 seconds
(about 13 min 7 s); completeness is verified, but large-model conversion still
needs performance work. Forty-four objects show the measured topology repair
warning rather than silently modifying source geometry.

The standalone frontend production build, release check and small-model
browser regression pass, including visibility, remeshing and cancellation.

Performance update: eliminating eager diagnostic formatting and temporary
strings, reusing exact consecutive surface evaluations and skipping stationary
line-search trials reduced the full native test to 200.401 seconds from
712.634 seconds. All 70 objects still pass, and all prior numerical diagnostic
records agree exactly (excluding new timings/cache counters and evaluation work
counts). UV pullback now totals 92.835 seconds and chart/error validation
87.302 seconds; archive serialization is 6.031 seconds and edge preview sampling
0.373 seconds. These nested stages must not be added twice. Baseline runs had
some concurrent validation work; this is an observed comparison, not an isolated
CPU microbenchmark. Browser timings for the optimized runtime are recorded below.

The optimized production Edge browser test completed the same full model in
321.270 seconds (5 min 21 s), versus the observed baseline of 786.997 seconds:
a 59.2% reduction. Conversion took 265.498 seconds, indexing 5.181 seconds and
dependency extraction 3.595 seconds. The first packet arrived at 5.439 seconds;
the remaining mesh-only tail after object delivery was 31.423 seconds. Meshing
overlaps conversion, so this tail is not the total meshing CPU time.
Within native conversion, UV pullback took 127.989 seconds and chart/error
validation 118.649 seconds; these remain the main performance costs. Archive
serialization took 8.523 seconds and edge previews 0.515 seconds.

Completeness is unchanged: 70 native objects, 8,830 faces, 85 display mesh objects
and 3,102,151 display vertices, with zero missing mesh objects/faces or meshing
failures. Reader/feed cleanup passed. No page errors, missing assets, backend
writes or OCCT requests occurred. The same 44 objects retain source-gap warnings.
This comparison verifies the full browser path as well as the native tests;
it does not imply that conversion is now instantaneous or matches another
importer's undocumented implementation.

A second profiling/optimization pass reduced the complete native validation
from 200.401 to 182.635 seconds (8.9%). All 70 objects and 8,830 faces remain;
all previous numerical diagnostics match exactly, excluding timings and work
counters. Trim recovery takes 82.325 s, final trim validation 76.126 s,
surface preparation 2.298 s, chart normalization 1.646 s, topology emission
0.979 s and validity/manifold checks 0.217 s. Of 7,465,942 requested validation
witnesses, 647,230 exact shared endpoints reuse their successful checks.
There are still 441,908,205 line-search trials, so reducing the numerical solver's
work remains the main future opportunity. The revised WASM is 3,892,841 bytes,
up 149,733 bytes (4.0%) from the previous runtime. Native geometry tests and
226 mesh checks across 13 baseline meshes pass.

The second-pass production Edge browser regression, run against the synchronized
standalone build with the complete model, finishes in 268.181 s (4 min 28 s),
versus the previous observed 321.270 s: 16.5% less elapsed time. Conversion is
214.543 s, indexing 5.564 s, dependency extraction 3.491 s and edge preview
generation 0.478 s. Within native conversion, recovery is 102.898 s and final
trim validation 89.963 s. All 70 native objects, 8,830 faces, 85 display meshes
and 3,102,151 display vertices remain, with no missing objects/faces, meshing
failures, page errors, asset errors, backend writes or OCCT requests. Reader and
mesh-feed disposal pass, as do the preceding visibility/remesh/cancellation cases.

The 70 measured mesh jobs reach four concurrent tasks. Their dispatch-to-reply
durations sum to 527.084 s, overlapping both each other and conversion; this
must not be added to browser elapsed time. The final #1997 body starts meshing
at 243.849 s and replies at 267.989 s, accounting for about 24.14 s of the
mesh-only tail. Prioritizing late expensive bodies or safely splitting their
meshing work is a remaining opportunity. Geometry accuracy is unchanged.

## Projection and trim recovery improvements

The next numerical pass fixes solver behavior rather than lowering tolerances:

- Regular NURBS patches use a temporary translated evaluation net to avoid
  cancellation at large coordinates. Original surfaces/control points are not
  changed. The temporary copy is owned by one face projector and is released
  with it; chart changes recreate it and invalidate caches.
- The damped solve scales both derivative columns independently so narrow
  parameter directions are not suppressed by an absolute damping term.
- An arithmetic-scale world-step convergence check stops futile backtracking
  only on regular patches, with a strict fitting-tolerance cap and a small UV
  step. Normal source gaps are not mistaken for a residual that can reach zero.
- When the distance rounds to a plateau, tiny admissible steps must improve
  the projected gradient. Active parameter bounds are respected. Degenerate
  warm starts use the existing multistart search instead of accepting an
  arbitrary point merely inside the source repair envelope.
- Rejected refinement parents evaluate the midpoint first and stop once a
  split is required. Every accepted child still passes all seven fitting
  probes plus independent final validation. Exact consecutive edge points are
  cached within a trim. Distinct accepted witnesses are not removed.
- Pole endpoints inherit their branch from an interior witness instead of
  solving again at an indeterminate longitude. UV seeds follow the current
  periodic branch. Exact agreed loop endpoints are retained. Closed patches
  meeting poles retain conservative local-solver arithmetic and avoid the
  translated evaluation copy while benefiting from these branch fixes.

On the complete local validation model this reduces native test time from
182.635 s to 118.900 s (34.9% observed reduction). Recovery drops from 82.325 s
to 45.443 s; final trim validation drops from 76.126 s to 46.403 s. Line-search
trials fall from 441,908,205 to 132,517,376. The run avoids 896,544 rejected-parent
probes and reuses 6,815,533 exact consecutive edge points. All 70 objects and
8,830 faces remain, including 48 solids. Maximum sampled fitting error remains
0.000784374 mm, below the unchanged 0.001 mm target. Numerical diagnostics and
UV point counts can change; this algorithm change is not bitwise equivalence.

Validation includes independent closest-point oracles for translated, tiny,
anisotropic and stationary planar patches, rational curved patches with normal
gaps and active bounds; archive/source-shape regressions; and three owned sphere
pole cases with seeds and transposed parameters. The seeded sphere exposed a
pre-existing periodic branch failure, now fixed. Error control remains sampled,
not a proof of a global nearest point or certified Hausdorff distance.

Full-model display validation also exposed a Float32 precision failure on one
extremely thin face. Retrying the entire Brep at another origin repeated work
and could make a different face fail. Display recovery now retains successful
faces and retries only precision-failed faces in isolated local coordinates.
Each recovered chunk carries its original face ID and a separate origin; world
coordinates are restored by the display transform, never added to Float32 vertex
buffers. Object-wide mesh budgets still apply, and failures remain explicit.
This changes display meshes only, not the analytic Brep, trim tolerances or strict
geometry mesher. Owned tests cover two distant thin faces, original corners,
triangle orientation, budget accounting and source archive immutability. The
known 70-object browser regression now requires zero missing display faces.

Final standalone production-browser verification: **268.181 s -> 205.682 s**,
an observed **23.3% reduction**. All 70 native objects and 8,830 faces remain
(48 solids, 22 open Breps), with zero missing display faces, meshing failures,
page/asset errors, backend writes or OCCT requests. The 88 display chunks hold
3,101,960 vertices; extra local-origin chunks do not create extra model objects.
Vertex buffers can differ because of adaptive numerical sampling and precision
recovery; bitwise mesh identity is not claimed. Reader and mesh-feed disposal,
visibility, remeshing and cancellation tests pass.

Browser conversion takes 131.419 s, including 117.564 s inside native Brep
construction. Recovery and final trim validation take 54.110 s and 54.685 s
inside that construction. File indexing takes 5.066 s and extracting object
subsets takes 3.705 s. These stage values overlap mesh-worker execution and
must not be added to worker durations. All records arrive at about 190.5 s;
the independent final mesh tail is about 14.9 s. Timings are local observations,
not repeated statistical benchmarks or hardware-independent guarantees.

## Progressive assembly instances

STEP assemblies now create their instance containers before converting the
contents. Stable IDs use the root product-definition ID and assembly-use chain.
Metadata-only packets do not count as objects or enter the mesh-worker queue.
Each completed native body is returned immediately, so the first body does not
wait behind another synchronous Brep conversion. Edges enter the scene first;
the existing independent mesh feed fills in surfaces as they become available.
A single expensive body still requires its own conversion to finish; this is
instance/content streaming, not face-level streaming.

Geometry archives retain source-world placement. Instance groups start at the
identity transform and hold only user edits, avoiding a second application of
the source placement. Selection treats an assembly as an instance. Hiding or
moving it during import affects later geometry, while deleting it prevents
later packets from recreating it. Repeated definitions are converted once per
dependency job and duplicated for independent occurrences. Only one unplaced
native definition is retained between yields; completion/cancellation releases
that cache and the reader's indexes.

The Part 21 reader uses a paged typed-array index for source spans and references,
and prepares dependency subsets only when requested. It can emit a small
hierarchy-only subset after indexing, preserving assembly IDs, relationships,
placements and units without solving surfaces. A full initial index scan is
still required. Inputs whose relationships cannot be partitioned safely retain
the whole-file fallback; in that case containers are emitted after metadata
decoding and before geometry generation.

Native assembly loading reports unsupported presentation/auxiliary entities
explicitly instead of rejecting every supported Brep in the job. Scoped style
overrides, transparency and ambiguous colors can use base/opaque/default
appearance with a warning. `GEOMETRIC_SET` and `GEOMETRIC_CURVE_SET` roots that
contain Cartesian points are emitted as independent point display records with
their assembly transform, layer, color and visibility. Unsupported
curve members inside those sets remain explicit auxiliary warnings.
Unsupported surface/trim conversions remain failures, never mesh substitutes.
Failed occurrence records mark their instance and leave successful parts intact.

Validation commands:

```text
node scripts/test-step-part21.cjs
node scripts/test-step-opennurbs.cjs
node --test scripts/test-step-instances.cjs
node scripts/test-step-progressive-browser.cjs dist/spa
```

Owned assembly regressions cover hierarchy-before-geometry, independent repeated
placements, one-body packets, transfer ownership, hidden/moved/deleted instances,
late mesh replacement, remeshing and cancellation. Production-browser tests
verify a visible first body while import is still running, followed by the second
body under the same edited instance. Large-model indexing and extracted-body
checks are partial validation, not a claim that every source surface is supported
or that an entire large assembly has been imported successfully.

## Narrow periodic faces (2026-11-14)

Periodic NURBS chart selection first tries a whole-period translation that
contains the complete UV loop, using floating-point roundoff only. The larger
seam repair allowance is used only when no such branch exists. Previously, a
narrow face near the end of a periodic domain could be translated outside the
domain and clamped to a line, producing coincident trim points and rejecting
the Brep. This correction preserves original surface nets, edges and vertices;
it does not enlarge the fitting or source-repair budgets.

Final trim validity errors now retain the source face and edge identifiers.
Owned regressions in `scripts/test-step-brep.cjs` cover narrow cylindrical
strips on both sides of the seam, complete topology, unchanged vertices and
short edges, measured fitting error, and archive roundtrip validity.

## Exact endpoint contacts in holes (2026-11-14)

The display mesher now has a separate triangulation path for inner loops whose
lobes meet at an existing, exactly equal UV endpoint. It separates the lobes,
validates disjoint interiors, joins their contours at the existing contact, and
retains every sampled boundary segment. No points are nudged apart or introduced
on shared Brep edges. Equal UV aliases must also have compatible 3D positions and
normals before canonical indices are used for triangulation and refinement.

Both hole lobes remain empty, even if one is smaller than the display tolerance.
This exact path runs before approximate sliver repair or unnecessary edge
subdivision. Original Breps are unchanged. Crossing curves, overlapping or
nested hole interiors, contacts with the outer loop, contact cycles and junctions
of more than two lobes remain rejected. The original strict triangulation API
continues to reject all touching boundaries.

The end-to-end owned STEP regression checks both windings, a tiny touching hole,
total area, all original boundary segments, paired interior edges and unchanged
source archives. Native UV tests additionally check endpoint contacts at
collinear samples and rejection of unsupported intersections.

Source curve/surface gaps are independent of display triangulation. Measured
topology repair warnings remain visible when the original source geometries
are inconsistent; successful complete meshing does not make such gaps vanish.

## Collapsed-side meshing convergence (2026-11-14)

Near higher-order collapsed surface sides, tiny point-difference stencils can
amplify floating-point noise into false normal discontinuities. Angle refinement
then keeps splitting an otherwise smooth face. The mesher now checks one-sided
derivative normals at three increasing scales, retaining the transverse
parameter and accepting only consistent directions. Surface positions and source
geometry remain unchanged; unresolved normals retain the existing fallback.
This does not introduce a mesh vertex/triangle quota or relax display precision.

Shared-edge refinement also reuses unchanged trim mappings. Newly added edge
samples are solved in trim order, preserving monotonic parameters and the
existing geometric deviation checks. Position-only inverse mapping no longer
calculates shading normals on every trial. These caches live only for the
current meshing operation and are not retained across geometry edits.

Native regression coverage includes an independently generated high-order
collapsed patch, existing degenerate trim and UV precision cases, and analytic
mesher baselines. Conversion omissions remain reported separately: successful
meshing of retained Brep faces does not imply every STEP face was converted.

## Copyable import diagnostics (2026-11-14)

File import warnings and failures use a selectable, scrollable `Import details`
dialog. `Copy` copies the complete message; the readonly text also supports
normal text selection. If clipboard permission is denied or unavailable, the
dialog attempts selection-based copying and otherwise leaves the text selected
with manual-copy instructions. `Close` or Escape dismisses the dialog and
restores focus. Messages arriving while it is open are appended, not lost.
The original measured geometry warnings remain unchanged.

## Source/export workflow

## Large-file reader optimization (2026-11-14)

Files larger than 256 MiB use the bounded `fastIndex` path. It keeps the same
section and record boundaries, but scans ordinary entity IDs, component types
and references directly from bytes instead of allocating a decoded syntax view
for every record. Presentation, style and membership records still use the
complete parser because partitioning needs their item spans and style targets.
Small files and explicit strict callers retain the original full syntax path.

Dependency extraction now reports `closureMs`, `sortMs`, `headerReadMs`,
`rangeReadMs`, `rewriteMs`, `assembleMs`, source/output bytes and bounded read
counts in `stepLastJobTimings.read`. Sparse jobs use exact range reads; a full
source page is prefetched only for a sufficiently large range or when that page
is already warm. This avoids turning a small dependency selection into many
megabytes of unrelated I/O. The final packet assembly also retains safe source
views and avoids copying every record before the single output concatenation.

On the local 1,083,624,776-byte `Body-L01.stp`, the optimized index recognized
11,965,677 entities and 865 jobs in about 44.6 seconds, compared with the prior
observed index time of about 60.5 seconds. The first sampled native job read
about 18.8 KiB of source data in about 0.2 ms after the sparse-read change;
before that change, the same job caused about 44 MiB of page reads. These are
local observations, not hardware-independent guarantees. Native conversion and
meshing remain separate costs and are reported by their existing timings.

Develop in PandaUI and selectively synchronize reviewed frontend paths using
`scripts/sync-frontend-export.cjs` as documented in `FRONTEND_SYNC.md`. Ship compiled
NodeC browser runtime and notices; keep native C++ source, backend data and private
analysis out of the standalone export. Sync updates both change logs and the export
manifest. A local sync does not publish to GitHub.



