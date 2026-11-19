/* Owned synthetic STEP cases plus differential validation using installed OCCT
 * fixtures (read as data, not copied). Run: node scripts/test-step-part21.cjs
 * --synthetic skips OCCT. --file PATH indexes a real file through bounded disk
 * reads, then extracts metadata and one job (never reads the whole fallback).
 * --output-dir DIR with --file saves metadata/first-job STEP and hierarchy JSON.
 * --export-jobs 10 additionally exports reader jobs 1..10 and up to three small
 * MANIFOLD_SOLID_BREP-only candidates; profile.json records timings/memory/paths.
 * --native-first verifies the first supported candidate with the existing NodeC
 * runtime. --profile-snippet PATH --output-dir DIR reruns that native check alone.
 * No files are generated otherwise, and no network is required. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Blob } = require('node:buffer')

const source = fs.readFileSync(path.join(__dirname, '../src/import/StepPart21.js'))
const loadReader = () => import('data:text/javascript;base64,' + source.toString('base64'))
const loadEntityModel = () => import('data:text/javascript;base64,' + fs.readFileSync(path.join(__dirname, '../src/import/StepEntityModel.js')).toString('base64'))
const header = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('owned; #987 /*literal*/ ''quote'' \\X2\\4E2D\\X0\\'),'2;1');\nFILE_NAME('测试','',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;"
const wrap = data => `${header}\nDATA;\n${data}\nENDSEC;\nEND-ISO-10303-21;\n/* trailing #765 ; ' */\n`
const bodies = `
/* forward refs; #8888 ' */
#1 = MANIFOLD_SOLID_BREP('a;#555 ''escaped quote''',#3);
#2 = BREP_WITH_VOIDS('b',#4,());
#3 = CLOSED_SHELL('',());
#4 = CLOSED_SHELL('',());
#10 = ADVANCED_BREP_SHAPE_REPRESENTATION('a',(#1),#20);
#11 = ADVANCED_BREP_SHAPE_REPRESENTATION('b',(#2),#20);
#20 = (GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#21,#22,#23)) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#24)) REPRESENTATION_CONTEXT('shared',''));
#21 = (LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));
#22 = (NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));
#23 = (NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());
#24 = UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-7),#21,'','');
#30 = STYLED_ITEM('',(#32),#1);
#31 = STYLED_ITEM('',(#32),#2);
#32 = PRESENTATION_STYLE_ASSIGNMENT((#33));
#33 = SURFACE_STYLE_USAGE(.BOTH.,#34);
#34 = SURFACE_SIDE_STYLE('',(#35));
#35 = SURFACE_STYLE_FILL_AREA(#36);
#36 = FILL_AREA_STYLE('',(#37));
#37 = FILL_AREA_STYLE_COLOUR('',#38);
#38 = COLOUR_RGB('',0.1,0.2,0.3);
#39 = MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',(#30,#31),#20);
#40 = PRESENTATION_LAYER_ASSIGNMENT('parts','visible',(#1,#2));
`

// Fail if implementation ever calls source.text()/arrayBuffer(), and record the
// largest slice including rereads. Browser Blob.slice() is the only read gateway.
function guarded (text) {
  const blob = new Blob([text]), reads = []
  return {
    size: blob.size,
    reads,
    slice (start, end) { reads.push([start, end]); return blob.slice(start, end) },
    text () { throw new Error('whole source text forbidden') },
    arrayBuffer () { throw new Error('whole source arrayBuffer forbidden') }
  }
}

async function parserCorrectness (Reader) {
  const { decodeStepEntities, validateStepReferences, StepUnsupported } = await loadEntityModel()
  const decode = text => decodeStepEntities(Buffer.from(text), { validateReferences: true })
  const input = wrap(String.raw`#0001=OWNED(TYPED((#900719925474099312345,$,*,.U.,-1.25D+2,+.5,1.E-7)),
    'quote'';#5', '\\X2\\0041\\X0\\', '\X2\4E2DD83DDE00\X0\', '\X4\0001F600\X0\', '\X\E9', '\PA\\S\D', "0", "3A8");
    #900719925474099312345=(A() B(#1));`)
  const model = decode('\uFEFF' + input), values = model.get('1').parts.OWNED
  assert.deepEqual(values[0], { type: 'TYPED', values: [[{ ref: '900719925474099312345' }, null, null, '.U.', -125, 0.5, 1e-7]] })
  assert.deepEqual(values.slice(1), ["quote';#5", '\\X2\\0041\\X0\\', '中😀', '😀', 'é', 'Ä', { binary: '', unusedBits: 0 }, { binary: 'A8', unusedBits: 3 }])
  assert.deepEqual(model.schemas, ['AUTOMOTIVE_DESIGN'])
  assert.deepEqual(model.diagnostics, [])
  assert.equal(model.header[0].type, 'FILE_DESCRIPTION')
  assert.equal(model.get('900719925474099312345').complex, true)
  const unknown = decode(wrap('#1=FUTURE_ENTITY();').replace('AUTOMOTIVE_DESIGN', 'FUTURE_SCHEMA'))
  assert.equal(unknown.diagnostics[0].code, 'UNKNOWN_SCHEMA')
  assert(unknown.get('1').parts.FUTURE_ENTITY)
  assert.equal(decode(wrap('').replace("FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));", '')).diagnostics[0].code, 'MISSING_SCHEMA')
  for (const declaration of ["FILE_SCHEMA(());", "FILE_SCHEMA('X');", "FILE_SCHEMA((1));", "FILE_SCHEMA(('X'),());", "FILE_SCHEMA(('X'));FILE_SCHEMA(('Y'));"]) {
    assert.throws(() => decode(wrap('').replace("FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));", declaration)), /FILE_SCHEMA/)
  }
  for (const [data, reason] of [
    ['#1=A(T((#2)));', /Missing STEP entity #2 referenced by #1/],
    ['#1=A();#01=B();', /Duplicate #1/],
    ['#1=(A() A());', /Duplicate complex/],
    ['#1=A(1,,2);', /Expected/], ['#1=A(1 2);', /Expected/],
    ['#1=A(#oops);', /entity ID/], ['#1=A(1.E+);', /Expected/],
    ['#1=A(1.E999);', /Non-finite/], ['#1=A(@4);', /external/],
    ['#1=A("4FF");', /binary/], ['#1=A("3AB");', /binary/],
    [String.raw`#1=A('\X2\D800\X0\');`, /surrogate/],
    [String.raw`#1=A('\X4\00110000\X0\');`, /code point/],
    [String.raw`#1=A('\X2\123\X0\');`, /Unicode/],
    [String.raw`#1=A('\X\ZZ');`, /hex escape/],
    [String.raw`#1=A('\PB\\S\D');`, /legacy code page/],
    ['#1=A(' + '('.repeat(66) + '1' + ')'.repeat(66) + ');', /nested/],
    ['#1=A();\uFEFF#2=A();', /BOM/]
  ]) assert.throws(() => decode(wrap(data)), error => error instanceof StepUnsupported && reason.test(error.message), data)

  const malformed = [
    ['#1=A(1 2);', /Malformed entity #1/], ['#1=A(,);', /Malformed entity/],
    ["#1=A('a' 'b');", /Malformed entity/], ['#1=A(#2x);#2=B();', /Malformed entity/],
    ['#1=A() B();', /Malformed entity/], ['#1=(A() A());', /Duplicate complex/],
    ['#1=A("3AB");', /binary/], ['#1=A();\uFEFF#2=B();', /BOM/]
  ].map(([data, reason]) => [wrap(data), reason])
  malformed.push([wrap('').replace('FILE_DESCRIPTION(', 'GARBAGE '), /Malformed HEADER/])
  for (const section of ['ANCHOR', 'REFERENCE', 'SIGNATURE', 'DATA']) {
    const text = wrap('').replace('END-ISO-10303-21;', `${section};ENDSEC;END-ISO-10303-21;`)
    malformed.push([text, new RegExp(section)])
    assert.throws(() => decode(text), new RegExp(section))
  }
  assert.throws(() => decode(wrap('').replace('DATA;', "DATA('named');")), /parameterized DATA/)
  for (const [text, reason] of malformed) {
    const reader = await Reader.open(guarded(text), { chunkSize: 3 })
    assert.equal(reader.mode, 'whole'); assert.match(reader.fallbackReason, reason)
    assert.deepEqual(Buffer.from(await reader.readJob(reader.jobs[0])), Buffer.from(text))
    reader.dispose()
  }

  // Mapping records remain shared metadata; both standalone snippets and the
  // native metadata/body union must keep all map/operator dependency edges.
  const mapped = bodies + `
    #60=CARTESIAN_POINT('',(0.,0.,0.));#61=AXIS2_PLACEMENT_3D('',#60,$,$);
    #62=REPRESENTATION_MAP(#61,#10);
    #63=CARTESIAN_TRANSFORMATION_OPERATOR_3DNON_UNIFORM('',$,$,#60,2.,$,3.,4.);
    #64=MAPPED_ITEM('',#62,#63);
    #65=SHAPE_REPRESENTATION('mapped',(#64),#20);`
  const file = guarded('\uFEFF' + wrap(mapped)), reader = await Reader.open(file, { chunkSize: 17 })
  assert.equal(reader.mode, 'partitioned', reader.fallbackReason)
  const metadata = decode(await reader.readMetadata())
  for (const id of ['60', '61', '62', '63', '64', '65']) assert(metadata.has(id), id)
  const shared = decodeStepEntities(await reader.readNativeMetadata())
  assert(shared.has('64'))
  assert.throws(() => validateStepReferences(shared), /Missing STEP entity/, 'partial native metadata must remain decodable')
  for (const job of reader.jobs) {
    const complete = decode(await reader.readJob(job))
    for (const id of ['60', '61', '62', '63', '64', '65']) assert(complete.has(id), id)
    const packet = decodeStepEntities(await reader.readNativeJob(job))
    for (const [id, value] of packet) shared.set(id, value)
  }
  validateStepReferences(shared)
  assert.deepEqual(shared.get('64').parts.MAPPED_ITEM, ['', { ref: '62' }, { ref: '63' }])
  assert(file.reads.every(([a, b]) => b - a <= 17))
  reader.dispose()
  console.log('PASS parser correctness: tokens/Unicode/binary/schema, malformed sections, complete/partial refs, mapped shared metadata')
}

async function synthetic (Reader) {
  const text = wrap(bodies)
  const fast = await Reader.open(guarded(text), { fastIndex: true, chunkSize: 17 })
  assert.equal(fast.mode, 'partitioned', fast.fallbackReason)
  assert.equal(fast.jobs.length, 2)
  assert.equal(fast._index.get('20').types.length, 4, 'fast index preserves complex component types')
  assert.deepEqual(fast._index.get('1').refs, ['3'], 'fast index ignores refs inside strings/comments')
  fast.dispose()
  for (const chunkSize of [1, 2, 3, 7, 13, 64, 257, 1024]) {
    const file = guarded(text), progress = []
    const reader = await Reader.open(file, { chunkSize, onProgress: p => progress.push(p) })
    assert.equal(reader.mode, 'partitioned', reader.fallbackReason)
    assert.equal(reader.jobs.length, 2)
    assert.equal(reader.fallbackReason, null)
    assert.deepEqual(reader.warnings, [])
    assert.equal(reader._index.get('1').start, Buffer.from(text).indexOf(Buffer.from('\nDATA;')) + 6)
    assert.deepEqual(reader._index.get('1').refs, ['3'], 'comments/escaped strings cannot invent refs')
    assert.equal(reader._index.get('20').types.length, 4, 'complex entity components indexed')
    assert.equal(reader._index.get('1').raw, undefined, 'raw entity text is not retained')
    const indexedReads = file.reads.length
    for (let i = 0; i < 2; i++) {
      const bytes = await reader.readJob(reader.jobs[i]), value = Buffer.from(bytes).toString()
      assert(bytes instanceof Uint8Array)
      assert(value.startsWith(header + '\nDATA;'), 'HEADER including UTF-8 stays byte exact')
      assert(value.endsWith('ENDSEC;\nEND-ISO-10303-21;\n'))
      assert(value.includes('SI_UNIT(.MILLI.,.METRE.)'))
      assert(value.includes('LENGTH_MEASURE(1.E-7)'))
      assert(value.includes('#38 = COLOUR_RGB'))
      assert.match(value, new RegExp(`#${i + 1} = (?:MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS)`))
      assert.doesNotMatch(value, new RegExp(`#${2 - i} = (?:MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS)`))
      assert(value.includes(`#${30 + i} = STYLED_ITEM`))
      assert(!value.includes(`#${31 - i} = STYLED_ITEM`))
      assert.match(value, new RegExp(`PRESENTATION_LAYER_ASSIGNMENT\\('parts','visible',\\(#${i + 1}\\)\\)`))
      assert(value.includes('SHAPE_REPRESENTATION'), 'empty sibling has a non-meshing assembly placeholder')
      const roundtrip = await Reader.open(new Blob([bytes]), { chunkSize: 41 })
      assert(!/Missing|Duplicate|Truncated|Unbalanced|Unsupported Part21/.test(roundtrip.fallbackReason || ''), roundtrip.fallbackReason)
      roundtrip.dispose()
    }
    assert(file.reads.length > indexedReads, 'jobs reread source byte ranges')
    assert(file.reads.every(([a, b]) => b - a <= chunkSize), 'all I/O is bounded')
    const indexed = progress.filter(p => p.phase === 'indexing')
    assert.equal(indexed.at(-1).loaded, file.size)
    assert(indexed.every((p, i) => !i || p.loaded >= indexed[i - 1].loaded))
    await assert.rejects(reader.readJob({ ...reader.jobs[0] }), /handle/)
    const job = reader.jobs[0]
    reader.dispose(); reader.dispose()
    await assert.rejects(reader.readJob(job), /disposed/)
    assert.equal(reader._index.size, 0)
  }

  const fallback = async (text, reason) => {
    const file = guarded(text), reader = await Reader.open(file, { chunkSize: 37 })
    assert.equal(reader.mode, 'whole')
    assert.match(reader.fallbackReason, reason)
    assert(reader.warnings.length)
    assert.equal(reader._index.size, 0, 'whole fallback releases index')
    assert.equal(reader._geometry, null, 'whole fallback releases partition metadata')
    assert.deepEqual(Buffer.from(await reader.readJob(reader.jobs[0])), Buffer.from(text), 'fallback is byte-identical')
    reader.dispose()
  }
  await fallback(wrap(bodies.replace('#3 = CLOSED_SHELL', '#300 = CLOSED_SHELL')), /Missing reference #3/)
  await fallback(wrap(bodies + '\n#01=CLOSED_SHELL(\'\',());'), /Duplicate entity #1/)
  await fallback(wrap(bodies).replace('DATA;', 'DATA(\'named\');'), /structure/)
  await fallback(wrap(bodies).replace('END-ISO-10303-21;', 'DATA; ENDSEC; END-ISO-10303-21;'), /structure/)
  await fallback(wrap(bodies) + '/* not closed', /unterminated/)
  await fallback(wrap(bodies).replace("#1 = MANIFOLD_SOLID_BREP('a;#555 ''escaped quote''',#3);", "#1 = MANIFOLD_SOLID_BREP('unterminated,#3);"), /unterminated/)
  await fallback(wrap(bodies + '\n#99=UNKNOWN_APPEARANCE(#1);'), /inverse geometry/)
  await fallback(wrap(bodies + '\n#99=TESSELLATED_SHAPE_REPRESENTATION(\'\',(),#20);'), /Unsupported shape/)
  await fallback(wrap(bodies + '\n#99=REFERENCE_TO_EXTERNAL(@123);'), /External/)
  await fallback(wrap("#1=MANIFOLD_SOLID_BREP('',#2); #2=CLOSED_SHELL('',());"), /Only one/)

  // Separate surface models and strings containing STEP backslash encodings.
  const surface = await Reader.open(new Blob([wrap(bodies.replace('MANIFOLD_SOLID_BREP', 'SHELL_BASED_SURFACE_MODEL').replace('BREP_WITH_VOIDS', 'FACE_BASED_SURFACE_MODEL'))]))
  assert.equal(surface.jobs.length, 2)
  surface.dispose()
  // Canonical IDs must never round at Number.MAX_SAFE_INTEGER.
  const huge = wrap(bodies.replace(/#1\b/g, '#900719925474099312345').replace(/#2\b/g, '#900719925474099312346'))
  const big = await Reader.open(new Blob([huge]))
  assert.equal(big.jobs.length, 2)
  assert.equal(big.jobs[0].rootIds[0], '900719925474099312345')
  const bigRead = await Reader.open(new Blob([await big.readJob(big.jobs[0])]))
  assert(!/Missing|Duplicate/.test(bigRead.fallbackReason))
  bigRead.dispose(); big.dispose()

  // A style on a shared geometric dependency belongs in both body snippets.
  const sharedText = wrap(bodies.replace("#4 = CLOSED_SHELL('',());", "#4 = CLOSED_SHELL('',(#3));") + '\n#50=STYLED_ITEM(\'\',(#32),#3);')
  const shared = await Reader.open(new Blob([sharedText]))
  for (const job of shared.jobs) assert(Buffer.from(await shared.readJob(job)).toString().includes('#50=STYLED_ITEM'))
  shared.dispose()
  // Cycles are bounded, including forward-reference cycles.
  const cyclic = await Reader.open(new Blob([wrap(bodies + '\n#90=OWNED_METADATA(#91);#91=OWNED_METADATA(#90);')]))
  assert.equal(cyclic.jobs.length, 2)
  await cyclic.readJob(cyclic.jobs[0]); cyclic.dispose()

  const aborted = new AbortController(); aborted.abort()
  await assert.rejects(Reader.open(new Blob([text]), { signal: aborted.signal }), { name: 'AbortError' })
  const midAbort = new AbortController()
  await assert.rejects(Reader.open(new Blob([text]), { chunkSize: 7, signal: midAbort.signal, onProgress: p => { if (p.loaded > 20) midAbort.abort() } }), { name: 'AbortError' })
  await assert.rejects(Reader.open(new Blob([text]), { chunkSize: 0 }), /chunkSize/)
  await assert.rejects(Reader.open(new Blob([text]), { onProgress: () => { throw new Error('callback failure') } }), /callback failure/)
  await assert.rejects(Reader.open({ size: 10, slice: () => ({ arrayBuffer: async () => { throw new Error('I/O failure') } }) }), /I\/O failure/)

  // Regression for Math.max(...ids) / argument-count limits above 100k entities.
  let large = bodies
  for (let i = 100; i < 130100; i++) large += `\n#${i}=OWNED_METADATA();`
  const largeReader = await Reader.open(new Blob([wrap(large)]), { chunkSize: 65536 })
  assert.equal(largeReader.mode, 'partitioned', largeReader.fallbackReason)
  assert((await largeReader.readJob(largeReader.jobs[0])).length > 1000000)
  largeReader.dispose()
  console.log('PASS synthetic: byte boundaries, strings/comments, complex/forward refs, units/styles/layers, fallbacks, cancellation, 130k index')
}

async function visibility (Reader) {
  for (const target of ['#1', '#30']) {
    const reader = await Reader.open(new Blob([wrap(bodies + `\n#99=INVISIBILITY((${target}));`)]), { chunkSize: 7 })
    assert.equal(reader.mode, 'partitioned', reader.fallbackReason)
    assert.deepEqual(reader.jobs.map(job => job.visible), [false, true], 'hide only targeted body; retain sibling')
    assert.deepEqual(reader.warnings, [])
    const reread = await Reader.open(new Blob([await reader.readJob(reader.jobs[0])]))
    assert.equal(reread.mode, 'whole')
    assert.equal(reread.jobs[0].visible, false, 'single-body fallback retains visibility before clearing index')
    assert.equal(reread._index.size, 0)
    assert.equal(reread._visibilityInfo, null)
    reread.dispose(); reader.dispose()
  }
  for (const extra of [
    "#50=STYLED_ITEM('',(#32),#3);#99=INVISIBILITY((#50));", // shell/face subset
    '#99=INVISIBILITY((#10));', // representation/occurrence scope
    "#50=CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM('',(#32),#1,#30,(#10));#99=INVISIBILITY((#50));",
    "#50=STYLED_ITEM('',(#51),#1);#51=PRESENTATION_STYLE_BY_CONTEXT((#33),#10);#99=INVISIBILITY((#50));",
    '#99=CONTEXT_DEPENDENT_INVISIBILITY((#30),#10);'
  ]) {
    const reader = await Reader.open(new Blob([wrap(bodies + extra)]))
    assert(reader.jobs.every(job => job.visible === true), extra)
    assert(reader.warnings.some(warning => warning.startsWith('Visibility limitation:') && /occurrence-scoped/.test(warning)), extra)
    reader.dispose()
  }
  const withSet = bodies.replace("('a',(#1),#20)", "('a',(#1,#51),#20)") + "#51=GEOMETRIC_SET('',());#99=INVISIBILITY((#30));"
  const auxiliary = await Reader.open(new Blob([wrap(withSet)]))
  assert.equal(auxiliary.mode, 'partitioned', auxiliary.fallbackReason)
  assert(auxiliary.jobs[0].rootIds.includes('51'))
  assert.equal(auxiliary.jobs[0].visible, false, 'visible auxiliary set cannot override hidden mesh root')
  auxiliary.dispose()
  const mixed = withSet.replace('(#1,#51)', '(#1,#2,#51)')
  const mixedReader = await Reader.open(new Blob([wrap(mixed)]))
  assert.equal(mixedReader.mode, 'whole')
  assert.equal(mixedReader.jobs[0].visible, true, 'inseparable visible sibling must not be hidden')
  assert(mixedReader.warnings.some(warning => /Visibility limitation: mixed/.test(warning)))
  mixedReader.dispose()
  const allHidden = await Reader.open(new Blob([wrap(mixed.replace('INVISIBILITY((#30))', 'INVISIBILITY((#30,#31))'))]))
  assert.equal(allHidden.jobs[0].visible, false, 'all mesh roots hidden even with auxiliary sets')
  allHidden.dispose()
  console.log('PASS visibility: direct/styled roots, single-body fallback, auxiliary sets, mixed and scoped warnings')
}

async function lazyMetadata (Reader) {
  let selections = 0
  const select = Reader.prototype._select
  Reader.prototype._select = function (...args) { selections++; return select.apply(this, args) }
  let reader
  try {
    let data = bodies
    for (let i = 0; i < 2000; i++) data += `\n#${1000 + i}=MANIFOLD_SOLID_BREP('shared geometry',#3);#${20000 + i}=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${1000 + i}),#20);`
    data += "#100000=PRODUCT('assembly','','',());#100001=OWNED_METADATA(#100000,#10,#11);"
    reader = await Reader.open(guarded(wrap(data)), { chunkSize: 32768 })
    assert.equal(reader.mode, 'partitioned', reader.fallbackReason)
    assert.equal(reader.jobs.length, 2002)
    assert.equal(selections, 1, 'open performs one omission preflight, never per-body selections')
    assert(reader.jobs.every(job => job.entityCount === null && job.estimatedBytes === null), 'lazy counts are explicitly unknown')
    assert(reader._index.byteLength < 4 * 1024 * 1024, 'small compact index stays bounded by a few typed-array pages')
    // No full-index iteration is needed for metadata or a selected body.
    reader._index.values = reader._index.keys = () => { throw new Error('unexpected whole-index materialization') }
    const metadata = await reader.readMetadata(), text = Buffer.from(metadata).toString()
    assert.equal(selections, 1)
    assert(text.startsWith(header))
    assert(text.includes("#100000=PRODUCT('assembly','','',());"))
    assert(text.includes('#100001=OWNED_METADATA(#100000,#10,#11);'))
    assert(text.includes('LENGTH_MEASURE(1.E-7)'))
    assert(!/MANIFOLD_SOLID_BREP|BREP_WITH_VOIDS|CLOSED_SHELL|ADVANCED_BREP_SHAPE_REPRESENTATION|STYLED_ITEM/.test(text), 'metadata strips body topology and target styles')
    assert(text.includes('AXIS2_PLACEMENT_3D'))
    const check = await Reader.open(new Blob([metadata]))
    assert.equal(check.fallbackReason, 'No supported BREP/surface-model roots', 'metadata is syntactically valid and dependency complete')
    assert.equal(await check.readMetadata(), null, 'whole fallback is never exposed as hierarchy-only input')
    check.dispose()
    const job = await reader.readJob(reader.jobs[1])
    assert.equal(selections, 2)
    assert(Buffer.from(job).toString().includes("#2 = BREP_WITH_VOIDS('b',#4,());"))
    assert.deepEqual(await reader.readMetadata(), metadata, 'job extraction cannot mutate cached metadata selection')
    reader.dispose()
    await assert.rejects(reader.readMetadata(), /disposed/)
  } finally { Reader.prototype._select = select; reader?.dispose() }

  // Compact slots must not conflate sparse uint32 IDs, zero, or large strings.
  for (const [a, b] of [['0', '4294967295'], ['4294967296', '999999999999999999999999']]) {
    const text = wrap(bodies.replace(/#1\b/g, '#' + a).replace(/#2\b/g, '#' + b))
    const sparse = await Reader.open(new Blob([text]))
    assert.deepEqual(sparse.jobs.map(job => job.rootIds[0]), [a, b])
    const bytes = await sparse.readMetadata()
    const check = await Reader.open(new Blob([bytes]))
    assert.equal(check.fallbackReason, 'No supported BREP/surface-model roots')
    check.dispose(); sparse.dispose()
  }
  const unsafeText = wrap(bodies + '#99=OWNED_METADATA(#30);')
  const unsafe = await Reader.open(new Blob([unsafeText]))
  assert.equal(unsafe.mode, 'whole', 'unsafe inverse style dependencies fail before lazy handles escape')
  assert.match(unsafe.fallbackReason, /Cannot safely filter inverse style/)
  assert.equal(await unsafe.readMetadata(), null)
  assert.equal(Buffer.from(await unsafe.readJob(unsafe.jobs[0])).toString(), unsafeText)
  unsafe.dispose()
  for (const text of [
    wrap(bodies + "#99=STYLED_ITEM('',(#2),#1);"),
    wrap(bodies.replace("('a',(#1),#20)", "('a',(#1),#1)"))
  ]) {
    const unsafe = await Reader.open(new Blob([text]))
    assert.equal(unsafe.mode, 'whole', 'hidden non-target/non-item geometry dependencies must fail before any job escapes')
    assert.equal(await unsafe.readMetadata(), null)
    assert.equal(Buffer.from(await unsafe.readJob(unsafe.jobs[0])).toString(), text)
    unsafe.dispose()
  }

  const signal = new AbortController()
  await assert.rejects(Reader.open(new Blob([wrap(bodies)]), { signal: signal.signal, onProgress: p => { if (p.phase === 'planning') signal.abort() } }), { name: 'AbortError' })
  const duringMetadata = new AbortController()
  const cancellable = await Reader.open(new Blob([wrap(bodies)]), { signal: duringMetadata.signal })
  setTimeout(() => duringMetadata.abort(), 0)
  await assert.rejects(cancellable.readMetadata(), { name: 'AbortError' })
  cancellable.dispose()
  const emptyAbort = new AbortController()
  await assert.rejects(Reader.open(new Blob([wrap('')]), { signal: emptyAbort.signal, onProgress: p => { if (p.loaded === p.total) emptyAbort.abort() } }), { name: 'AbortError' })
  const readingAbort = new AbortController()
  const reading = await Reader.open(new Blob([wrap(bodies)]), { signal: readingAbort.signal, onProgress: p => { if (p.phase === 'reading') readingAbort.abort() } })
  await assert.rejects(reading.readMetadata(), { name: 'AbortError' })
  reading.dispose()
  console.log('PASS lazy metadata: 2002 bodies, one preflight, no full-index job scan, complete metadata, sparse/string IDs, safe fallback, cancellation')
}

function nativeTools () {
  const Module = require('node:module'), babel = require('@babel/core'), original = Module._extensions['.js']
  Module._extensions['.js'] = function (module, filename) {
    if (!filename.startsWith(path.resolve(__dirname, '../src/import') + path.sep)) return original(module, filename)
    module._compile(babel.transformSync(fs.readFileSync(filename, 'utf8'), { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, filename)
  }
  try {
    const { metadata } = require('../src/import/StepNativeImport')
    const { decodeStepEntities } = require('../src/import/StepEntityModel')
    const Geometry = require('../src/import/StepGeometry').default
    const { parseOpenNurbsStep, StepOpenNurbsContext } = require('../src/import/StepOpenNurbsImport')
    return {
      hierarchy: bytes => { const entities = decodeStepEntities(bytes); return metadata(entities, new Geometry(entities), { hierarchyOnly: true, allowAppearanceFallback: true }) },
      parseOpenNurbsStep,
      StepOpenNurbsContext
    }
  } finally { Module._extensions['.js'] = original }
}

function modestSolidCandidates (reader) {
  const candidates = []
  for (let jobIndex = 0; jobIndex < reader.jobs.length; jobIndex++) {
    const job = reader.jobs[jobIndex]
    if (!job.rootIds.every(id => reader._index.get(id).types.includes('MANIFOLD_SOLID_BREP'))) continue
    const visited = new Set(), stack = [...job.rootIds], surfaceTypes = {}, rootTypes = job.rootIds.map(id => ({ id, types: reader._index.get(id).types }))
    let sourceBytes = 0, faces = 0
    while (stack.length && sourceBytes <= 256 * 1024) {
      const id = stack.pop()
      if (visited.has(id)) continue
      visited.add(id)
      const row = reader._index.get(id)
      sourceBytes += row.end - row.start
      if (row.types.includes('ADVANCED_FACE') || row.types.includes('FACE_SURFACE')) faces++
      for (const type of row.types) if (type === 'PLANE' || type.endsWith('_SURFACE') || type === 'B_SPLINE_SURFACE_WITH_KNOTS') surfaceTypes[type] = (surfaceTypes[type] || 0) + 1
      for (const ref of row.refs) stack.push(ref)
    }
    if (stack.length) continue
    const allPlanar = Object.keys(surfaceTypes).length === 1 && !!surfaceTypes.PLANE
    candidates.push({ jobIndex, jobId: job.id, rootIds: job.rootIds, rootTypes, geometrySourceBytes: sourceBytes, geometryEntities: visited.size, faces, surfaceTypes, allPlanar })
  }
  return candidates.sort((a, b) => Number(b.allPlanar) - Number(a.allPlanar) || Number(!!(a.surfaceTypes.SPHERICAL_SURFACE || a.surfaceTypes.TOROIDAL_SURFACE)) - Number(!!(b.surfaceTypes.SPHERICAL_SURFACE || b.surfaceTypes.TOROIDAL_SURFACE)) || a.geometrySourceBytes - b.geometrySourceBytes)
}

async function profileNativeSnippet (filename, outputDir) {
  const { parseOpenNurbsStep, StepOpenNurbsContext } = nativeTools()
  const runtimePath = path.resolve(process.env.NODEC_TEST_RUNTIME || 'public/nodec', 'NodeC.js')
  const started = performance.now(), module = await require(runtimePath)(), runtimeMs = performance.now() - started
  const context = new StepOpenNurbsContext(module)
  const report = { source: path.resolve(filename), runtimePath, runtimeMs, rssBefore: process.memoryUsage().rss, failures: [] }
  let parsed
  try {
    const parseStarted = performance.now()
    parsed = parseOpenNurbsStep(fs.readFileSync(filename), {}, context)
    report.parseMs = performance.now() - parseStarted
    report.totalObjects = parsed.totalObjects; report.instances = parsed.instances.length; report.warnings = parsed.warnings
    const firstStarted = performance.now()
    for (const record of parsed.records) {
      if (record.conversionFailure) { report.failures.push(record.conversionFailure); continue }
      assert(record.objectRecord?.byteLength > 0 && record.displayInfo?.type === 'Brep' && record.displayInfo.faceCount > 0, 'native success must serialize actual Brep geometry')
      const geometry = module.CommonObject.decode(record.exactSource.geometry)
      try {
        assert(geometry instanceof module.Brep && geometry.isValid, 'native archive must decode to a valid Brep')
        report.firstSuccess = {
          entityId: record.stepEntityId,
          instanceId: record.stepInstanceId,
          faces: record.displayInfo.faceCount,
          valid: geometry.isValid,
          solid: geometry.isSolid,
          objectRecordBytes: record.objectRecord.byteLength,
          headerBytes: record.sourceHeader.byteLength,
          elapsedMs: performance.now() - firstStarted,
          conversionMs: record.stepConversionMs,
          timings: record.stepConversionTimings,
          bounds: { min: record.displayInfo.min, max: record.displayInfo.max }
        }
        if (outputDir) {
          const prefix = path.basename(filename, path.extname(filename))
          const geometryPath = path.join(outputDir, `${prefix}-first-geometry.json`)
          await fs.promises.writeFile(geometryPath, JSON.stringify(record.exactSource))
          await fs.promises.writeFile(path.join(outputDir, `${prefix}-first-object.bin`), record.objectRecord)
          report.firstSuccess.geometryPath = geometryPath
        }
      } finally { geometry?.delete() }
      break
    }
  } catch (error) { report.error = error.message } finally {
    parsed?.records.return(); context.dispose()
    report.rssAfter = process.memoryUsage().rss
    report.totalMs = performance.now() - started
    if (outputDir) await fs.promises.writeFile(path.join(outputDir, `${path.basename(filename, path.extname(filename))}-native-profile.json`), JSON.stringify(report, null, 2))
  }
  console.log(JSON.stringify({ phase: 'native-first-geometry', ...report }))
  return report
}

function digest (value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') }
function signatures (result) {
  const items = []
  function visit (node, parents) {
    const names = [...parents, node.name]
    for (const index of node.meshes || []) {
      const mesh = result.meshes[index]
      items.push(digest({ names, name: mesh.name, positions: mesh.attributes.position.array, normals: mesh.attributes.normal?.array, indices: mesh.index.array, color: mesh.color, faces: mesh.brep_faces }))
    }
    for (const child of node.children || []) visit(child, names)
  }
  visit(result.root, [])
  return items.sort()
}

async function real (Reader) {
  const { decodeStepEntities } = await loadEntityModel()
  const runtime = await require('occt-import-js')()
  const options = { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.05, angularDeflection: Math.PI / 16 }
  const base = path.join(path.dirname(require.resolve('occt-import-js')), '../test/testfiles')
  for (const [name, expected] of [['cax-if/as1_pe_203.stp', 18], ['cax-if/as1-oc-214.stp', 18], ['cax-if/dm1-pe-214.stp', 7]]) {
    const bytes = fs.readFileSync(path.join(base, name))
    const entities = decodeStepEntities(bytes, { validateReferences: true })
    assert(entities.size > 0 && entities.schemas.length > 0, `${name}: complete entity graph and schema`)
    const baseline = runtime.ReadStepFile(bytes, options)
    assert(baseline.success)
    assert.equal(baseline.meshes.length, expected)
    const reader = await Reader.open(guarded(bytes), { chunkSize: 8191 })
    assert.equal(reader.mode, 'partitioned', `${name}: ${reader.fallbackReason}`)
    assert(reader.jobs.length > 1)
    const actual = []
    let conversions = 0, firstCount = 0
    for (const job of reader.jobs) {
      const partBytes = await reader.readJob(job)
      const check = await Reader.open(new Blob([partBytes]))
      assert(!/Missing|Duplicate|Unbalanced|Truncated/.test(check.fallbackReason || ''), check.fallbackReason)
      check.dispose()
      const result = runtime.ReadStepFile(partBytes, options)
      conversions++
      assert(result.success && result.meshes.length, `${name}: job ${job.id} produces actual mesh`)
      if (conversions === 1) { firstCount = result.meshes.length; assert(conversions < reader.jobs.length) }
      actual.push(...signatures(result))
    }
    assert.deepEqual(actual.sort(), signatures(baseline), `${name}: exact positions, normals, indices, colors, face styles, names and hierarchy paths`)
    console.log(`PASS OCCT ${name}: ${reader.jobs.length} jobs, ${expected} exact mesh instances; first ${firstCount} before remaining jobs`)
    reader.dispose()
    if (name === 'cax-if/as1-oc-214.stp') {
      const injected = bytes.toString().replace(/ENDSEC;\s*END-ISO-10303-21;/, '#999999=INVISIBILITY((#6247));\nENDSEC;\nEND-ISO-10303-21;')
      const hiddenReader = await Reader.open(new Blob([injected]))
      assert.equal(hiddenReader.mode, 'partitioned', hiddenReader.fallbackReason)
      assert.deepEqual(hiddenReader.jobs.filter(job => !job.visible).map(job => job.rootIds), [['63']])
      assert.deepEqual(hiddenReader.warnings, [])
      let hiddenCount = 0, visibleCount = 0
      const actual = []
      for (const job of hiddenReader.jobs) {
        const result = runtime.ReadStepFile(await hiddenReader.readJob(job), options)
        assert(result.success)
        const instances = signatures(result)
        actual.push(...instances)
        if (job.visible) visibleCount += instances.length
        else hiddenCount += instances.length
      }
      assert.equal(hiddenCount, 8, 'all eight instances of styled root #63 are hidden')
      assert.equal(visibleCount, 10, 'ten unrelated instances remain visible')
      assert.deepEqual(actual.sort(), signatures(baseline), 'visibility metadata preserves exact geometry/color/hierarchy')
      hiddenReader.dispose()
      console.log('PASS OCCT injected AP214 INVISIBILITY: 8 hidden, 10 visible, exact geometry/color/hierarchy')
    }
  }
  // All source unit spellings preserved; single-body files intentionally fall back.
  for (const unit of ['mm', 'm', 'in']) {
    const bytes = fs.readFileSync(path.join(base, `cube-units/cube-${unit}.step`))
    decodeStepEntities(bytes, { validateReferences: true })
    const reader = await Reader.open(guarded(bytes), { chunkSize: 61 })
    assert.deepEqual(Buffer.from(await reader.readJob(reader.jobs[0])), bytes)
    reader.dispose()
  }
}

async function inspectFile (Reader, filename) {
  const outputArg = process.argv.indexOf('--output-dir')
  if (outputArg >= 0) assert(process.argv[outputArg + 1] && !process.argv[outputArg + 1].startsWith('--'), '--output-dir requires a path')
  const outputDir = outputArg < 0 ? null : path.resolve(process.argv[outputArg + 1])
  const exportArg = process.argv.indexOf('--export-jobs'), exportCount = exportArg < 0 ? 0 : Number(process.argv[exportArg + 1])
  assert(Number.isSafeInteger(exportCount) && exportCount >= 0 && exportCount <= 100, '--export-jobs must be between 0 and 100')
  if (process.argv.includes('--native-first')) assert(exportCount > 0, '--native-first requires --export-jobs so candidates are saved before conversion')
  if (exportCount || process.argv.includes('--native-first')) assert(outputDir, 'exports/native profiles require --output-dir')
  if (outputDir) await fs.promises.mkdir(outputDir, { recursive: true })
  const profile = { source: path.resolve(filename), script: __filename, arguments: process.argv.slice(2), node: process.version, startedAt: new Date().toISOString(), indexingSamples: [], exports: [] }
  const saveProfile = async () => { if (outputDir) await fs.promises.writeFile(path.join(outputDir, 'profile.json'), JSON.stringify(profile, null, 2)) }
  const handle = await fs.promises.open(filename, 'r')
  const size = (await handle.stat()).size
  let bytesRead = 0, largestRead = 0, lastLog = 0, peakRss = 0
  const file = {
    size,
    slice (start, end) {
      return { async arrayBuffer () {
        assert(end - start <= 1024 * 1024, 'disk reads must stay bounded')
        const buffer = Buffer.allocUnsafe(end - start)
        let offset = 0
        while (offset < buffer.length) {
          const result = await handle.read(buffer, offset, buffer.length - offset, start + offset)
          if (!result.bytesRead) throw new Error('Short fixture read')
          offset += result.bytesRead
        }
        bytesRead += buffer.length; largestRead = Math.max(largestRead, buffer.length)
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.length)
      } }
    }
  }
  let reader
  const started = performance.now()
  try {
    reader = await Reader.open(file, { onProgress (state) {
      if (state.phase === 'indexing' && state.loaded - lastLog >= 128 * 1024 * 1024) {
        lastLog = state.loaded
        const memory = process.memoryUsage()
        peakRss = Math.max(peakRss, memory.rss)
        const sample = { phase: state.phase, bytes: state.loaded, entities: state.entityCount, seconds: (performance.now() - started) / 1000, memory }
        profile.indexingSamples.push(sample)
        console.log(JSON.stringify({ ...sample, memory: undefined, rssMiB: memory.rss / 1048576 }))
      }
    } })
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
    profile.index = { mode: reader.mode,
      reason: reader.fallbackReason,
      sourceBytes: size,
      entities: reader._entityCount ?? reader._index.size,
      jobs: reader.jobs.length,
      indexSeconds: (performance.now() - started) / 1000,
      compactBytes: reader._index.byteLength,
      peakSampledRss: peakRss,
      memory: process.memoryUsage(),
      warnings: reader.warnings.slice(0, 10) }
    console.log(JSON.stringify(profile.index))
    await saveProfile()
    if (reader.mode !== 'partitioned') { assert.equal(await reader.readMetadata(), null); return }
    const assemblyUses = [...reader._index.matching(types => types.includes('NEXT_ASSEMBLY_USAGE_OCCURRENCE'))].length
    const beforeMetadata = bytesRead, metadataStart = performance.now()
    const metadata = await reader.readMetadata()
    const metadataReadSeconds = (performance.now() - metadataStart) / 1000, metadataMemory = process.memoryUsage()
    if (outputDir) { await fs.promises.mkdir(outputDir, { recursive: true }); await fs.promises.writeFile(path.join(outputDir, 'metadata.stp'), metadata) }
    const metadataCheck = await Reader.open(new Blob([metadata]))
    assert.equal(metadataCheck.fallbackReason, 'No supported BREP/surface-model roots')
    metadataCheck.dispose()
    profile.metadata = { phase: 'metadata', assemblyUses, bodyRoots: reader._rootIds.size, bytes: metadata.length, diskBytes: bytesRead - beforeMetadata, readSeconds: metadataReadSeconds, readAndValidationSeconds: (performance.now() - metadataStart) / 1000, memory: metadataMemory }
    console.log(JSON.stringify(profile.metadata))
    await saveProfile()
    const beforeJob = bytesRead, jobStart = performance.now()
    const job = reader.jobs[0], bytes = await reader.readJob(job)
    if (outputDir) {
      await fs.promises.writeFile(path.join(outputDir, 'first-job.stp'), bytes)
      await fs.promises.writeFile(path.join(outputDir, 'first-job.json'), JSON.stringify({ source: filename, sourceBytes: size, entityCount: reader._index.size, jobs: reader.jobs.length, assemblyUses, job, rootTypes: job.rootIds.map(id => ({ id, types: reader._index.get(id).types })) }, null, 2))
      console.log(JSON.stringify({ outputDir }))
    }
    const check = await Reader.open(new Blob([bytes]))
    assert(!/Missing|Duplicate|Unbalanced|Truncated/.test(check.fallbackReason || ''), check.fallbackReason)
    check.dispose()
    console.log(JSON.stringify({ phase: 'first-job', rootIds: job.rootIds, bytes: bytes.length, diskBytes: bytesRead - beforeJob, seconds: (performance.now() - jobStart) / 1000, largestRead, rssMiB: process.memoryUsage().rss / 1048576 }))
    const parseHierarchy = nativeTools().hierarchy
    const hierarchy = parseHierarchy(metadata), jobHierarchy = parseHierarchy(bytes)
    assert.equal(hierarchy.length, 0, 'hierarchy metadata has no geometry occurrences')
    assert(hierarchy.instances.length > 0, 'actual metadata creates assembly instances before any conversion')
    assert.deepEqual(jobHierarchy.instances, hierarchy.instances, 'metadata and job retain identical hierarchy IDs, parent IDs and world transforms')
    assert.equal(new Set(hierarchy.instances.map(item => item.id)).size, hierarchy.instances.length, 'instance identities are unique')
    if (outputDir) await fs.promises.writeFile(path.join(outputDir, 'hierarchy.json'), JSON.stringify(hierarchy.instances, null, 2))
    console.log(JSON.stringify({ phase: 'native-hierarchy', instances: hierarchy.instances.length, firstJobOccurrences: jobHierarchy.length, warnings: jobHierarchy.warnings, roots: hierarchy.instances.filter(item => !item.parentId).map(item => ({ id: item.id, name: item.name })) }))
    profile.hierarchy = { instances: hierarchy.instances.length, firstJobOccurrences: jobHierarchy.length, metadataMatchesJob: true }
    if (exportCount) {
      const candidateStarted = performance.now()
      profile.candidates = modestSolidCandidates(reader)
      profile.candidateSelectionSeconds = (performance.now() - candidateStarted) / 1000
      console.log(JSON.stringify({ phase: 'candidate-selection', count: profile.candidates.length, seconds: profile.candidateSelectionSeconds, top: profile.candidates.slice(0, 3) }))
      const exports = new Map()
      for (let i = 1; i <= exportCount && i < reader.jobs.length; i++) exports.set(i, `job-${String(i).padStart(3, '0')}.stp`)
      for (const candidate of profile.candidates.slice(0, 3)) exports.set(candidate.jobIndex, `candidate-job-${String(candidate.jobIndex).padStart(3, '0')}.stp`)
      for (const [jobIndex, basename] of exports) {
        const selected = reader.jobs[jobIndex], started = performance.now(), before = bytesRead
        const bytes = await reader.readJob(selected), readMs = performance.now() - started
        const filename = path.join(outputDir, basename)
        await fs.promises.writeFile(filename, bytes)
        const check = await Reader.open(new Blob([bytes]))
        assert(!/Missing|Duplicate|Unbalanced|Truncated/.test(check.fallbackReason || ''), check.fallbackReason)
        check.dispose()
        const result = { jobIndex, jobId: selected.id, path: filename, rootIds: selected.rootIds, rootTypes: selected.rootIds.map(id => ({ id, types: reader._index.get(id).types })), bytes: bytes.length, readMs, readAndValidationMs: performance.now() - started, diskBytes: bytesRead - before, memory: process.memoryUsage() }
        profile.exports.push(result)
        await fs.promises.writeFile(path.join(outputDir, basename.replace(/\.stp$/, '.json')), JSON.stringify(result, null, 2))
        await saveProfile()
        console.log(JSON.stringify({ phase: 'export-job', jobIndex, path: filename, bytes: bytes.length, readMs }))
      }
      if (process.argv.includes('--native-first')) {
        // Release the large index before native profiling so RSS phases are not
        // confused with retained compact storage. Each saved snippet is standalone.
        reader.dispose()
        profile.native = []
        for (const candidate of profile.candidates.slice(0, 3)) {
          const exported = profile.exports.find(item => item.jobIndex === candidate.jobIndex)
          const result = await profileNativeSnippet(exported.path, outputDir)
          profile.native.push(result)
          await saveProfile()
          if (result.firstSuccess) break
        }
        assert(profile.native.some(item => item.firstSuccess), 'No exported candidate produced valid native geometry; see profile.json')
      }
    }
    profile.completedAt = new Date().toISOString()
    profile.totalSeconds = (performance.now() - started) / 1000
    profile.largestRead = largestRead
    await saveProfile()
  } catch (error) { profile.error = error.stack; await saveProfile(); throw error } finally { reader?.dispose(); await handle.close() }
}

;(async () => {
  const { default: Reader, StepPart21Reader } = await loadReader()
  assert.equal(Reader, StepPart21Reader)
  const snippetArg = process.argv.indexOf('--profile-snippet')
  if (snippetArg !== -1) {
    assert(process.argv[snippetArg + 1], '--profile-snippet requires a path')
    const outputArg = process.argv.indexOf('--output-dir'), outputDir = outputArg < 0 ? null : path.resolve(process.argv[outputArg + 1])
    if (outputDir) await fs.promises.mkdir(outputDir, { recursive: true })
    const result = await profileNativeSnippet(process.argv[snippetArg + 1], outputDir)
    assert(result.firstSuccess, 'No valid native geometry; inspect the native profile')
    return
  }
  const fileArg = process.argv.indexOf('--file')
  if (fileArg !== -1) { assert(process.argv[fileArg + 1], '--file requires a path'); await inspectFile(Reader, process.argv[fileArg + 1]); return }
  await synthetic(Reader)
  await parserCorrectness(Reader)
  await visibility(Reader)
  await lazyMetadata(Reader)
  if (!process.argv.includes('--synthetic')) await real(Reader)
})().catch(error => { console.error(error); process.exitCode = 1 })
