// Existing production build: File -> STEP worker -> OpenNURBS -> mesh workers.
// Usage: node scripts/test-step-progressive-browser.cjs [dist/spa] [user.step] [expectedObjects]
// The optional user model defaults to the 70-object/8822-face validation target.
// No build, OCCT runtime, backend writes, or generated fixture files are needed.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os')
const fixtureDirectory = path.join(path.dirname(require.resolve('occt-import-js')), '../test/testfiles')
const cubePath = path.join(fixtureDirectory, 'simple-basic-cube/cube.stp')
// Match MeshQuality.js: labels are UI text; precision values are numeric.
const LOW_MESH_PRECISION = 0.6
const HIGH_MESH_PRECISION = 1

function topologyRepairWarning (block, run) {
  const match = /^STEP: (\d+) object\(s\) required topology tolerance repair\. Maximum sampled curve\/surface gap: ([\d.eE+-]+) mm; endpoint sewing: ([\d.eE+-]+) mm; UV fitting error: ([\d.eE+-]+) mm; repair limit: ([\d.eE+-]+) mm\. Original 3D geometry is retained; recovered UV trims are approximate\.$/.exec(block)
  if (!match || !run) return false
  const progress = run.progress.at(-1), count = Number(match[1]), gap = Number(match[2]), sewing = Number(match[3]), fit = Number(match[4]), limit = Number(match[5])
  return Number.isInteger(count) && count > 0 && count <= run.roots && count === progress.stepRepairedObjects &&
    Number.isFinite(gap) && gap >= 0 && Number.isFinite(limit) && limit > 0 &&
    Number.isFinite(progress.stepMaxSourceGapMm) && Number.isFinite(progress.stepMaxRepairToleranceMm) &&
    Number.isFinite(progress.stepMaxSewingErrorMm) && Number.isFinite(progress.stepMaxFitErrorMm) &&
    sewing === Number(progress.stepMaxSewingErrorMm.toPrecision(5)) && fit === Number(progress.stepMaxFitErrorMm.toPrecision(5)) &&
    gap === Number(progress.stepMaxSourceGapMm.toPrecision(5)) && limit === Number(progress.stepMaxRepairToleranceMm.toPrecision(5))
}

function cubeFixture (hidden = false) {
  // Clone this known small planar cube, including metadata. Independent IDs
  // create three topology jobs; translations make them individually visible.
  const source = fs.readFileSync(cubePath, 'utf8'), match = /\bDATA;([\s\S]*?)ENDSEC;/.exec(source)
  assert(match, 'Cube fixture DATA section missing')
  const stride = Math.max(...[...match[1].matchAll(/#(\d+)/g)].map(m => Number(m[1]))) + 1
  const body = /#(\d+)=MANIFOLD_SOLID_BREP\(/.exec(match[1])
  assert(body, 'Cube fixture solid missing')
  const sections = [0, 1, 2].map(copy => match[1]
    .replace(/#(\d+)/g, (_, id) => '#' + (Number(id) + copy * stride))
    .replace(/CARTESIAN_POINT\('([^']*)',\(([^)]+)\)\)/g, (_, name, values) => {
      const point = values.split(',').map(Number)
      assert(point.length === 3 && point.every(Number.isFinite), 'Cube fixture point changed')
      point[0] += copy * 400
      return `CARTESIAN_POINT('${name}',(${point.join(',')}))`
    })
    .replace(/MANIFOLD_SOLID_BREP\('',/, `MANIFOLD_SOLID_BREP('Browser cube ${copy + 1}',`))
  if (hidden) sections.push(`#${stride * 3}=INVISIBILITY((#${Number(body[1]) + stride}));`)
  return Buffer.from(source.slice(0, match.index) + 'DATA;\n' + sections.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n')
}

function playwright () {
  if (process.env.PANDAUI_PLAYWRIGHT_PATH) return require(process.env.PANDAUI_PLAYWRIGHT_PATH)
  try { return require('playwright') } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    return require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))
  }
}

function assemblyFixture () {
  const source = fs.readFileSync(cubePath, 'utf8')
  const rows = [
    "#1000=PRODUCT('Assembly','Assembly','',(#19));", "#1001=PRODUCT_DEFINITION_FORMATION('','',#1000);",
    "#1002=PRODUCT_DEFINITION('','',#1001,#15);", "#1003=PRODUCT_DEFINITION_SHAPE('','',#1002);",
    '#1004=SHAPE_DEFINITION_REPRESENTATION(#1003,#1005);', "#1005=SHAPE_REPRESENTATION('Assembly',(#126),#187);"
  ]
  for (const [n, x] of [[1010, 1000], [1030, -1000]]) {
    rows.push(
      `#${n}=CARTESIAN_POINT('',(${x},500.,0.));`, `#${n + 1}=AXIS2_PLACEMENT_3D('',#${n},#133,#134);`,
      `#${n + 2}=NEXT_ASSEMBLY_USAGE_OCCURRENCE('same name','','',#1002,#14,$);`,
      `#${n + 3}=PRODUCT_DEFINITION_SHAPE('','',#${n + 2});`,
      `#${n + 4}=ITEM_DEFINED_TRANSFORMATION('','',#126,#${n + 1});`,
      `#${n + 5}=(REPRESENTATION_RELATIONSHIP('','',#22,#1005)REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${n + 4})SHAPE_REPRESENTATION_RELATIONSHIP());`,
      `#${n + 6}=CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${n + 5},#${n + 3});`
    )
  }
  return Buffer.from(source.replace(/ENDSEC;\s*END-ISO-10303-21;/, rows.join('\n') + '\nENDSEC;END-ISO-10303-21;'))
}

async function main ({ afterFixtures } = {}) {
  const root = path.resolve(process.argv[2] || 'dist/spa'), userFile = process.argv[3] && path.resolve(process.argv[3])
  const expectedObjects = process.argv[4] == null ? (userFile ? 70 : null) : Number(process.argv[4])
  assert(expectedObjects == null || (userFile && Number.isInteger(expectedObjects) && expectedObjects > 0), 'expectedObjects must be a positive integer after the user STEP path')
  assert(fs.existsSync(path.join(root, 'index.html')), `Production build missing: ${root}`)
  if (userFile) assert(fs.statSync(userFile).isFile(), 'User STEP file missing')
  const assets = new Map([
    ['/__step_test__/cube.step', cubePath],
    ['/__step_test__/conical.step', path.join(fixtureDirectory, 'conical-surface/conical-surface.step')],
    ['/__step_test__/multi.step', cubeFixture()],
    ['/__step_test__/hidden.step', cubeFixture(true)],
    ['/__step_test__/assembly.step', assemblyFixture()]
  ])
  const writes = [], occtRequests = [], errors = [], missing = [], dialogs = [], report = {}
  let actualModel = false
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (/\/occt\//i.test(url.pathname)) {
      occtRequests.push(url.pathname)
      response.writeHead(503); response.end('Exact-only STEP test: OCCT is unavailable'); return
    }
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET') writes.push(url.pathname)
      response.writeHead(503, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ code: 'BACKEND_UNAVAILABLE', error: 'Local import test' })); return
    }
    if (assets.has(url.pathname)) {
      const value = assets.get(url.pathname)
      response.setHeader('Content-Type', 'application/step')
      if (Buffer.isBuffer(value)) response.end(value)
      else fs.createReadStream(value).pipe(response)
      return
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return }
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(response)
  })
  let browser, page
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await playwright().chromium.launch({ channel: 'msedge', headless: true })
    page = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
    const timeout = Number(process.env.PANDAUI_STEP_TEST_TIMEOUT_MS || 600000)
    assert(Number.isFinite(timeout) && timeout > 0, 'Invalid PANDAUI_STEP_TEST_TIMEOUT_MS')
    page.setDefaultTimeout(timeout)
    page.on('pageerror', e => errors.push(e.message))
    page.on('response', r => { if (r.status() === 404) missing.push(new URL(r.url()).pathname) })
    page.on('dialog', async dialog => { dialogs.push({ message: dialog.message(), actualModel }); await dialog.dismiss() })
    await page.exposeFunction('stepImportDialogReport', message => dialogs.push({ message, actualModel }))
    await page.exposeFunction('stepStageReport', event => console.log('STEP_STAGE', JSON.stringify(event)))
    await page.addInitScript(() => {
      // Import diagnostics are now selectable HTML dialogs instead of alert().
      // Keep checking the complete warning text, without blocking test controls.
      window.stepImportDialogReports = []
      const observedDialogs = new WeakSet()
      new MutationObserver(() => {
        const dialog = document.querySelector('dialog#pandaui-import-message[open]')
        if (!dialog || observedDialogs.has(dialog)) return
        observedDialogs.add(dialog)
        window.stepImportDialogReports.push(window.stepImportDialogReport(dialog.querySelector('textarea').value))
        dialog.close()
      }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] })
      const NativeWorker = window.Worker
      window.stepRuns = {}
      window.stepTestGate = false
      window.stepDiagnosticSnapshot = data => data && Object.fromEntries([
        'version', 'method', 'errorControl', 'tolerance', 'repairTolerance', 'lengthScale',
        'sourceGap', 'maxFitError', 'maxSampledDeviation', 'repairedTrims', 'repairedEdges',
        'repairedVertices', 'singularTrims', 'seamRelocations', 'chartSplits', 'robustRetries', 'maxSewingError', 'timings',
        'detailTimings', 'projectionWork'
      ].filter(key => data[key] != null).map(key => [key, data[key]]))
      window.stepProgressSnapshot = data => Object.fromEntries(Object.entries(data).filter(([key, value]) =>
        (value == null || ['string', 'number', 'boolean'].includes(typeof value)) || /^(?:stepTimings|step.*Reasons|importWarnings)$/.test(key)))
      window.Worker = class extends NativeWorker {
        constructor (...args) {
          super(...args)
          this.run = window.stepRun
          this.addEventListener('message', ({ data }) => {
            if (!this.run) return
            if (this.meshMeasurement && data?.id === this.meshMeasurement.id) {
              Object.assign(this.meshMeasurement, {
                endedMs: performance.now() - this.run.started,
                objectId: data.result?.objectId,
                heapBytes: data.heapBytes || 0,
                error: data.error || null
              })
              this.meshMeasurement.elapsedMs = this.meshMeasurement.endedMs - this.meshMeasurement.startedMs
              this.meshMeasurement = null
            }
            const state = data?.progress || data?.result
            if (!state || (!state.phase?.includes('STEP') && state.stepPartsTotal == null)) return
            const event = { ...window.stepProgressSnapshot(state), elapsedMs: performance.now() - this.run.started }
            if (Array.isArray(state.stepInstances)) this.run.instanceMetadata = state.stepInstances
            this.run.workerProgress.push(event)
            const stage = state.phase || 'STEP packet'
            if (this.run.name === 'Body-L01.stp' && state.stepCurrentPart != null && (stage === 'Reading STEP part dependencies' || stage === 'Converting STEP to OpenNURBS')) {
              const jobKey = `${stage}:${state.stepCurrentPart}:${state.stepPartBytes || 0}:${state.stepPartsComplete || 0}`
              if (jobKey !== this.run.lastReportedJobStage) {
                this.run.lastReportedJobStage = jobKey
                window.stepStageReport({ run: this.run.name, phase: 'STEP job timing', stepCurrentPart: state.stepCurrentPart, stepPartBytes: state.stepPartBytes || 0, stepPartsComplete: state.stepPartsComplete, stepPartsTotal: state.stepPartsTotal, workerPhase: stage, elapsedMs: event.elapsedMs })
              }
            }
            if (!this.run.stages.includes(stage)) {
              this.run.stages.push(stage)
              window.stepStageReport({ run: this.run.name, ...event })
            }
            if (!Array.isArray(state.records)) return
            for (const record of state.records) {
              if (record.stepInstances || record.stepInstanceFailure) { this.run.metadataPackets = (this.run.metadataPackets || 0) + 1; continue }
              this.run.records.push({
                id: record.exactSource?.id || null,
                entity: record.stepEntityId,
                instanceId: record.stepInstanceId,
                definitionReused: record.stepDefinitionReused,
                headerRevision: record.sourceHeaderRevision ?? null,
                conversionMs: record.stepConversionMs,
                conversionTimings: record.stepConversionTimings,
                diagnostics: window.stepDiagnosticSnapshot(record.stepGeometryDiagnostics),
                objectBytes: record.objectRecord?.byteLength || 0,
                headerBytes: record.sourceHeader?.byteLength || 0,
                geometry: !!record.exactSource?.geometry?.data,
                attributes: !!record.exactSource?.attributes,
                edgesOnly: record.edgesOnly === true,
                displayObject: !!record.displayObject,
                failure: record.conversionFailure || null
              })
            }
            if (this.run.records.length >= (this.run.lastReportedRecords || 0) + 10 || state.done) {
              this.run.lastReportedRecords = this.run.records.length
              const last = this.run.records.at(-1)
              window.stepStageReport({ run: this.run.name, phase: 'STEP objects received', objects: this.run.records.length, entity: last?.entity, conversionMs: last?.conversionMs, conversionTimings: last?.conversionTimings, elapsedMs: event.elapsedMs })
            }
            if (state.records.some(r => r.objectRecord) && !state.done) this.hasStepPacket = true
          })
        }

        postMessage (...args) {
          // Measure dispatch-to-reply per mesh job, including worker startup,
          // transfer and response delivery. This is NOT exclusive CPU time.
          if (this.run && args[0]?.record instanceof Uint8Array && args[0]?.displayOnly === true) {
            this.meshMeasurement = { id: args[0].id, startedMs: performance.now() - this.run.started, bytes: args[0].record.byteLength }
            ;(this.run.meshJobs ||= []).push(this.meshMeasurement)
          }
          if (window.stepTestGate && this.hasStepPacket && args[0]?.type === 'pull') {
            window.stepTestGate = false
            window.stepGatedWorker = this
            window.stepTestResume = () => { window.stepTestResume = null; return super.postMessage(...args) }
            return
          }
          return super.postMessage(...args)
        }

        terminate () { this.testTerminated = true; return super.terminate() }
      }
    })
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => window.PandaUIBackendMode === 'local' && document.querySelector('#editorFrame')?.contentWindow?.graphcanvas)
    await page.evaluate(() => {
      const key = Object.keys(window).find(k => k.startsWith('webpackChunk'))
      window[key].push([['step-test'], {}, require => {
        for (const [id, factory] of Object.entries(require.m)) {
          if (!factory.toString().includes('modelDocuments()') || !factory.toString().includes('openLocalFile(')) continue
          for (const value of Object.values(require(id))) if (typeof value?.modelDocuments === 'function' && typeof value?.openLocalFile === 'function') window.testApp = value
        }
      }])
      if (!window.testApp) throw new Error('App test hook missing')
      const remeshDocument = window.testApp.remeshDocument.bind(window.testApp)
      window.testApp.remeshDocument = async (doc, quality, options = {}) => {
        const run = window.stepRun
        if (!run) return remeshDocument(doc, quality, options)
        const task = { quality, importFeed: !!options.importTargets, startedMs: performance.now() - run.started, settled: false }
        run.meshTasks.push(task)
        try {
          const result = await remeshDocument(doc, quality, options)
          task.updated = result.updated; task.failures = result.failures
          return result
        } catch (error) { task.error = error.message; task.errorName = error.name; throw error } finally {
          task.settled = true; task.endedMs = performance.now() - run.started
        }
      }
      window.testScene = () => {
        let roots = 0, meshes = 0, vertices = 0, hiddenRoots = 0, edgeParts = 0
        for (const doc of window.testApp.modelDocuments()) {
          doc.three.middleground.traverse(part => {
            if (part.userData.importedModelObject) { roots++; if (part.visible === false && part.userData.pandauiHidden) hiddenRoots++ }
            if (part.isMesh && part.geometry?.attributes?.position) { meshes++; vertices += part.geometry.attributes.position.count }
            if (part.isLine || part.isLineSegments) edgeParts++
          })
        }
        return { documents: window.testApp.modelDocuments().length, roots, hiddenRoots, meshes, vertices, edgeParts, importing: window.testApp.modelDocuments().some(d => d.localImportInProgress) }
      }
      window.testSources = () => window.testApp.modelDocuments().map(doc => {
        const module = window.testApp.getNodeC(), roots = [], entries = [], invalid = []
        doc.three.middleground.traverse(root => {
          if (root.userData.importedModelObject) roots.push({ id: root.userData.sourceGeometryId, type: root.userData.geometryType, hidden: root.visible === false })
        })
        for (const [id, source] of doc.importedGeometrySources) {
          let geometry, faces, edges, attributes
          try {
            geometry = module.CommonObject.decode(source.geometry)
            attributes = module.nodecDecodeAttributes(source.attributes)
            if (!(geometry instanceof module.Brep) || !geometry.isValid) throw new Error('Source is not a valid native Brep')
            if (source.id !== id || attributes.id !== id) throw new Error('Source/archive/attribute IDs disagree')
            faces = geometry.faces(); edges = geometry.edges()
            const diagnosticText = geometry.getUserString('nodec.step.pullback')
            entries.push({ id, type: 'Brep', valid: geometry.isValid, solid: geometry.isSolid, faces: faces.count, edges: edges.count, visible: attributes.visible, diagnostics: window.stepDiagnosticSnapshot(diagnosticText ? JSON.parse(diagnosticText) : null) })
          } catch (error) { invalid.push({ id, message: error.message }) } finally {
            faces?.delete(); edges?.delete(); attributes?.delete(); geometry?.delete()
          }
        }
        return {
          roots,
          entries,
          invalid,
          maps: Object.fromEntries(Object.entries(doc).filter(([key, value]) => value instanceof Map && /source|geometryEdit/i.test(key)).map(([key, value]) => [key, [...value.keys()]])),
          headerBytes: doc.importedGeometryHeader?.byteLength || 0,
          readerReleased: doc.importStream == null,
          mesherReleased: doc.remeshStream == null,
          edits: doc.geometryEdits?.size || 0,
          display: doc.importDisplayProgress()
        }
      })
      window.testBegin = async (name, url, gate = false, fromInput = false) => {
        let file
        if (fromInput) {
          file = document.querySelector('#stepTestFile').files[0]
          if (!file) throw new Error('User STEP file input is empty')
        } else {
          const response = await fetch(url)
          if (!response.ok) throw new Error('Cannot load browser STEP fixture: ' + response.status)
          file = new File([await response.arrayBuffer()], name)
        }
        window.stepTestGate = gate; window.stepTestResume = null; window.stepGatedWorker = null
        const run = window.stepRun = { name, started: performance.now(), progress: [], workerProgress: [], records: [], stages: [], meshTasks: [], settled: false }
        window.stepRuns[name] = run
        window.testController = new AbortController()
        run.lastMeshJobReport = 0
        run.lastMeshBackpressure = false
        let wrappedDocument = null
        const wrapDocumentTimings = () => {
          const doc = window.testApp.modelDocuments()[0]
          if (!doc || doc === wrappedDocument) return
          wrappedDocument = doc
          const append = doc.appendImportRecord.bind(doc)
          doc.appendImportRecord = async record => {
            const started = performance.now()
            try { return await append(record, window.testApp.getNodeC()) } finally {
              const elapsedMs = performance.now() - started
              if (elapsedMs >= 1000) window.stepStageReport({ run: run.name, phase: 'Slow scene append', elapsedMs: performance.now() - run.started, appendMs: elapsedMs, entity: record.stepEntityId, instanceId: record.stepInstanceId, objectBytes: record.objectRecord?.byteLength || 0, headerBytes: record.sourceHeader?.byteLength || 0 })
            }
          }
          const setSource = doc.setSourceDocument.bind(doc)
          doc.setSourceDocument = (...args) => {
            const started = performance.now()
            try { return setSource(...args) } finally {
              const elapsedMs = performance.now() - started
              if (elapsedMs >= 1000) window.stepStageReport({ run: run.name, phase: 'Slow source header apply', elapsedMs: performance.now() - run.started, applyMs: elapsedMs })
            }
          }
          const buildScene = doc.buildSceneIncrementally.bind(doc)
          doc.buildSceneIncrementally = async (...args) => {
            const started = performance.now()
            try { return await buildScene(...args) } finally {
              const elapsedMs = performance.now() - started
              if (elapsedMs >= 1000) window.stepStageReport({ run: run.name, phase: 'Slow scene build', elapsedMs: performance.now() - run.started, buildMs: elapsedMs, options: args[2] ? { ids: args[2].ids, edgesOnly: args[2].edgesOnly, release: args[2].release } : null })
            }
          }
        }
        const timingTimer = setInterval(wrapDocumentTimings, 10)
        window.testImport = window.testApp.openLocalFile(file, 'open', {
          signal: window.testController.signal,
          onProgress: p => {
            const elapsedMs = performance.now() - run.started
            run.progress.push({ ...window.stepProgressSnapshot(p), elapsedMs })
            const jobs = run.meshJobs || []
            for (let i = run.lastMeshJobReport; i < jobs.length; i++) {
              const job = jobs[i]
              if (job.endedMs && job.elapsedMs >= 5000) window.stepStageReport({ run: run.name, phase: 'Slow mesh job', job, elapsedMs })
            }
            run.lastMeshJobReport = jobs.length
            if (p.meshBufferLimited !== run.lastMeshBackpressure) {
              run.lastMeshBackpressure = p.meshBufferLimited
              window.stepStageReport({ run: run.name, phase: p.meshBufferLimited ? 'Mesh backpressure entered' : 'Mesh backpressure released', meshWorkers: p.meshWorkers, meshWorkerLimit: p.meshWorkerLimit, meshQueue: p.meshQueue, meshBufferedSourceBytes: p.meshBufferedSourceBytes, meshBufferedDisplayBytes: p.meshBufferedDisplayBytes, elapsedMs })
            }
          }
        }).then(ok => { run.ok = ok }, error => { run.error = error.message; run.errorName = error.name }).finally(() => { clearInterval(timingTimer); run.ended = performance.now(); run.settled = true })
      }
      window.testResult = () => {
        const elapsedMs = (window.stepRun.ended || performance.now()) - window.stepRun.started
        const timing = events => {
          const phases = {}
          events.forEach((event, index) => {
            const phase = event.phase || 'STEP packet'
            const value = phases[phase] ||= { firstMs: event.elapsedMs, lastMs: event.elapsedMs, activeMs: 0, events: 0 }
            value.lastMs = event.elapsedMs; value.events++
            value.activeMs += Math.max(0, (events[index + 1]?.elapsedMs ?? elapsedMs) - event.elapsedMs)
          })
          return phases
        }
        return { ...window.testScene(), ...window.stepRun, started: undefined, ended: undefined, elapsedMs, phaseTimings: timing(window.stepRun.progress), workerPhaseTimings: timing(window.stepRun.workerProgress), sources: window.testSources() }
      }
    })

    const assertRecords = run => {
      assert(run.records.length > 0, 'No native STEP worker records: ' + run.name)
      assert(run.records[0].headerBytes > 0, 'First native record must publish the File3dm header')
      assert(run.records.every(r => r.id && r.objectBytes > 0 && r.headerBytes >= 0 && (r.headerBytes > 0 || r.headerRevision === null) && r.geometry && r.attributes && r.edgesOnly && !r.displayObject && !r.failure), 'Worker must emit exact-only object records: ' + JSON.stringify(run.records))
      assert.equal(new Set(run.records.map(r => r.id)).size, run.records.length, 'Every source occurrence has a unique native ID')
    }
    const assertSources = (run, expected, allowIncompleteMeshes = false) => {
      assert(!run.error, run.error)
      assert.equal(run.documents, 1)
      if (expected != null) assert.equal(run.roots, expected, 'No missing or duplicate objects')
      assert(run.roots > 0 && run.edgeParts > 0)
      if (!allowIncompleteMeshes) assert(run.meshes > 0 && run.vertices > 0)
      assert.equal(run.sources.length, 1)
      const source = run.sources[0]
      assert.deepEqual(source.invalid, [], 'Every retained archive decodes as a valid Brep')
      assert(source.headerBytes > 0)
      assert(source.roots.every(r => r.type === 'Brep' && r.id), 'Display-only roots must never replace failed STEP topology')
      assert.deepEqual(source.roots.map(r => r.id).sort(), source.entries.map(e => e.id).sort(), 'All scene roots retain their exact source')
      assert.deepEqual(source.maps.importedGeometrySources.slice().sort(), source.entries.map(e => e.id).sort())
      assert.equal(source.edits, 0)
      assertRecords(run)
      assert.deepEqual(run.records.map(r => r.id).sort(), source.entries.map(e => e.id).sort(), 'All worker archives survive scene mounting')
      const progress = run.progress.at(-1)
      assert.equal(progress.stepFallbackParts, 0)
      assert.equal(progress.stepFailedParts, 0)
      assert.equal(progress.stepFailedObjects, 0)
      assert.equal(progress.stepDisplayOnlyObjects, 0)
      assert.equal(progress.stepExactObjects, run.roots)
      assert.equal(progress.stepPartsComplete, progress.stepPartsTotal)
      assert.equal(progress.stepNativeParts, progress.stepPartsTotal)
      if (allowIncompleteMeshes) {
        const repaired = d => !!(d?.repairedTrims || d?.repairedEdges || d?.repairedVertices)
        const repairedRecords = run.records.filter(r => repaired(r.diagnostics)).length
        assert.equal(progress.stepRepairedObjects, repairedRecords, 'Repair count matches native worker diagnostics')
        assert.equal(source.entries.filter(e => repaired(e.diagnostics)).length, repairedRecords, 'Native repair diagnostics survive source archiving')
      }
      assert(source.readerReleased && source.mesherReleased, 'Readers and mesh feeds release at EOF')
      const feeds = run.meshTasks.filter(task => task.importFeed)
      assert.equal(feeds.length, 1, 'Exactly one independent surface feed consumes converted STEP records')
      assert(feeds[0].settled && !feeds[0].error, 'The independent surface task must finish: ' + JSON.stringify(feeds))
      if (!allowIncompleteMeshes) assert.deepEqual(feeds[0].failures, [])
      assert(!run.importing && run.ok && run.settled)
      assert.deepEqual(occtRequests, [], 'STEP must never request OCCT JS/WASM')
    }
    const completed = async (name, asset, expected) => {
      await page.evaluate(({ name, asset }) => window.testBegin(name, asset), { name, asset })
      await page.waitForFunction(() => window.stepRun.settled)
      const result = await page.evaluate(() => window.testResult())
      report[name] = result
      assertSources(result, expected)
      return result
    }
    const remesh = async (name, quality, expected) => {
      const result = await page.evaluate(async quality => {
        const doc = window.testApp.modelDocuments()[0], before = window.testSources()
        const update = await window.testApp.remeshDocument(doc, quality)
        return { update, before, after: window.testSources(), ...window.testScene() }
      }, quality)
      report[name] = result
      assert.equal(result.update.updated, expected)
      assert.deepEqual(result.update.failures, [])
      assert.deepEqual(result.after[0].entries, result.before[0].entries, 'Remeshing preserves all exact geometry and attributes')
      assert.deepEqual(result.after[0].maps, result.before[0].maps)
      assert.deepEqual(result.after[0].invalid, [])
      assert.equal(result.after[0].edits, 0)
      assert(result.meshes > 0)
    }

    const nativeOnly = await completed('native-cube.step', '/__step_test__/cube.step', 1)
    assert.deepEqual(nativeOnly.sources[0].entries.map(({ valid, solid, faces, edges }) => ({ valid, solid, faces, edges })), [{ valid: true, solid: true, faces: 6, edges: 12 }])
    await page.evaluate(() => { window.exactTestDocument = window.testApp.modelDocuments()[0] })
    await remesh('cubeRemesh', HIGH_MESH_PRECISION, 1)
    const conical = await completed('native-conical.step', '/__step_test__/conical.step', 1)
    assert.deepEqual(conical.sources[0].entries.map(({ valid, solid, faces }) => ({ valid, solid, faces })), [{ valid: true, solid: true, faces: 5 }])
    await remesh('conicalRemesh', LOW_MESH_PRECISION, 1)

    // One assembly, one geometry definition, two distinct occurrences. Hold
    // the reader after its first body: its first child must already render.
    await page.evaluate(() => window.testBegin('assembly.step', '/__step_test__/assembly.step', true))
    await page.waitForFunction(() => window.stepRun.settled || (window.stepTestResume && window.testScene().meshes > 0))
    report.assemblyEarly = await page.evaluate(() => {
      const doc = window.testApp.modelDocuments()[0], groups = []
      doc.three.middleground.traverse(o => { if (o.userData.stepInstanceId && o.userData.importedBlockInstance) groups.push(o) })
      const root = groups.find(o => o.parent === doc.three.middleground)
      window.assemblyRoot = root
      if (root) { root.position.x = 37; root.visible = false; root.userData.pandauiHidden = true; root.updateMatrixWorld(true) }
      return { ...window.testResult(), groups: groups.map(o => ({ id: o.userData.stepInstanceId, uuid: o.uuid })), rootId: root?.uuid }
    })
    assert(!report.assemblyEarly.error, report.assemblyEarly.error)
    assert.equal(report.assemblyEarly.groups.length, 3, 'Whole hierarchy exists before remaining occurrences')
    assert.equal(report.assemblyEarly.roots, 1, 'First geometry renders while its instance is incomplete')
    assert(report.assemblyEarly.importing && !report.assemblyEarly.settled && report.assemblyEarly.meshes > 0)
    await page.evaluate(() => window.stepTestResume())
    await page.waitForFunction(() => window.stepRun.settled)
    report.assemblyComplete = await page.evaluate(() => {
      const root = window.assemblyRoot, doc = window.testApp.modelDocuments()[0], children = []
      root.updateMatrixWorld(true)
      root.traverse(o => { if (o.userData.importedModelObject) children.push({ id: o.userData.sourceGeometryId, parent: o.parent.userData.stepInstanceId, x: o.matrixWorld.elements[12] }) })
      return { ...window.testResult(), rootId: root.uuid, visible: root.visible, state: doc.stepInstanceState, children }
    })
    assertSources(report.assemblyComplete, 2)
    assert.equal(report.assemblyComplete.rootId, report.assemblyEarly.rootId)
    assert.equal(report.assemblyComplete.visible, false, 'Late meshes and completion preserve instance hide')
    assert.equal(report.assemblyComplete.state, 'complete')
    assert.equal(report.assemblyComplete.children.length, 2)
    assert(report.assemblyComplete.children.every(c => c.x === 37), 'Early and late children inherit the same user delta without reapplying the source transform')
    assert.equal(new Set(report.assemblyComplete.children.map(c => c.parent)).size, 2)
    assert.equal(report.assemblyComplete.records.filter(r => r.definitionReused).length, 1)
    await remesh('assemblyRemesh', HIGH_MESH_PRECISION, 2)

    await page.evaluate(() => window.testBegin('progressive.step', '/__step_test__/multi.step', true))
    await page.waitForFunction(() => window.stepRun.settled || (window.stepTestResume && window.testScene().meshes > 0))
    report.early = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return window.testResult()
    })
    assert(!report.early.error, report.early.error)
    assert(report.early.importing && !report.early.settled && report.early.meshes > 0 && report.early.vertices > 0 && report.early.edgeParts > 0)
    assert(report.early.roots > 0 && report.early.roots < 3)
    const earlyProgress = report.early.progress.at(-1)
    assert(earlyProgress.stepPartsComplete < earlyProgress.stepPartsTotal)
    assertRecords(report.early)
    await page.evaluate(() => window.stepTestResume())
    await page.waitForFunction(() => window.stepRun.settled)
    report.complete = await page.evaluate(() => window.testResult())
    assertSources(report.complete, 3)
    assert(report.complete.roots > report.early.roots)
    assert(report.complete.stages.includes('Converting STEP to OpenNURBS'), 'Production must use the OpenNURBS-first converter')
    assert(await page.evaluate(() => window.exactTestDocument.disposed && window.exactTestDocument.importedGeometrySources.size === 0), 'Closing a document releases exact archives')
    await remesh('multiRemesh', HIGH_MESH_PRECISION, 3)

    const hidden = await completed('hidden.step', '/__step_test__/hidden.step', 3)
    assert.equal(hidden.hiddenRoots, 1, 'Only the declared hidden cube stays hidden')
    assert.equal(hidden.sources[0].entries.filter(e => e.visible === false).length, 1)

    await page.evaluate(() => window.testBegin('cancel.step', '/__step_test__/multi.step', true))
    await page.waitForFunction(() => !!window.stepTestResume || window.stepRun.settled)
    assert(await page.evaluate(() => !!window.stepTestResume), 'Cancellation must interrupt a gated progressive import')
    await page.evaluate(() => { window.cancelDocument = window.testApp.modelDocuments()[0]; window.cancelRecordCount = window.stepRun.records.length; window.testController.abort() })
    await page.waitForFunction(() => window.stepRun.settled)
    // Resume the withheld pull after termination and drain queued callbacks.
    // Neither scene objects nor retained source maps may revive.
    await page.evaluate(async () => {
      window.stepTestResume()
      await new Promise(resolve => setTimeout(resolve, 250))
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    report.cancelled = await page.evaluate(() => ({
      ...window.testResult(),
      terminated: window.stepGatedWorker.testTerminated,
      disposed: window.cancelDocument.disposed,
      sourceCount: window.cancelDocument.importedGeometrySources.size,
      lateRecords: window.stepRun.records.length - window.cancelRecordCount
    }))
    assert.equal(report.cancelled.errorName, 'AbortError')
    assert.equal(report.cancelled.documents, 0)
    assert.equal(report.cancelled.roots, 0)
    assert.equal(report.cancelled.sourceCount, 0)
    assert.equal(report.cancelled.lateRecords, 0)
    assert(report.cancelled.terminated && report.cancelled.disposed)
    assertRecords(report.cancelled)

    if (afterFixtures) await afterFixtures({ page, report })
    if (userFile) {
      actualModel = true
      await page.evaluate(quality => {
        const input = document.createElement('input')
        input.type = 'file'; input.id = 'stepTestFile'; input.hidden = true
        document.body.append(input)
        window.testApp._viewmodel.meshPrecision = quality
      }, LOW_MESH_PRECISION)
      // Keep the 50 MB File browser-owned; do not JSON-serialize its bytes.
      await page.locator('#stepTestFile').setInputFiles(userFile)
      await page.evaluate(name => window.testBegin(name, null, false, true), path.basename(userFile))
      await page.waitForFunction(() => window.stepRun.settled)
      report.actualModel = await page.evaluate(() => window.testResult())
      assertSources(report.actualModel, expectedObjects, true)
      const entries = report.actualModel.sources[0].entries
      report.actualModel.topology = { archives: entries.length, faces: entries.reduce((sum, e) => sum + e.faces, 0), solids: entries.filter(e => e.solid).length, open: entries.filter(e => !e.solid).length }
      if (expectedObjects === 70) {
        const chartSplits = entries.reduce((sum, e) => sum + (e.diagnostics?.chartSplits || 0), 0)
        assert.deepEqual(report.actualModel.topology, { archives: 70, faces: 8822 + chartSplits, solids: 48, open: 22 })
        const display = report.actualModel.sources[0].display
        for (const key of ['missingMeshObjects', 'missingMeshFaces', 'meshingFailures']) {
          assert.equal(display[key], 0, `Known STEP fixture must retain every display face: ${key}`)
        }
      }
      // openLocalFile awaits the independent mesh feed. Archive validation above
      // permits partial display meshing, but never a missing/invalid source.
      assert(report.actualModel.sources[0].mesherReleased)
      assert.equal(report.actualModel.meshTasks.length, 1, 'Do not remesh the large model twice')
      assert.equal(report.actualModel.meshTasks[0].quality, LOW_MESH_PRECISION)
      console.log('STEP_ACTUAL_MODEL', JSON.stringify({ topology: report.actualModel.topology, display: report.actualModel.sources[0].display, meshTasks: report.actualModel.meshTasks, phaseTimings: report.actualModel.phaseTimings, workerPhaseTimings: report.actualModel.workerPhaseTimings }))
    }
    await page.evaluate(() => Promise.all(window.stepImportDialogReports))
    assert.deepEqual(occtRequests, [])
    assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(writes, [])
    const informational = 'STEP objects are converted to OpenNURBS before display. Failed conversions are reported; display meshes never replace source geometry.'
    let repairWarnings = 0
    assert(dialogs.every(({ message, actualModel }) => {
      const blocks = message.split('\n\n').slice(1)
      return blocks.length > 0 && blocks.every(block => {
        if (block === informational) return true
        if (!actualModel) return false
        if (topologyRepairWarning(block, report.actualModel)) { repairWarnings++; return true }
        return /^(?:Display meshes are incomplete for \d+ Brep object\(s\)\.|Frontend meshing is incomplete for \d+ Brep object\(s\)\.|\d+ surface object\(s\)(?: \(\d+ Brep faces\))? have incomplete display meshes\.)/.test(block)
      })
    }), 'Unexpected conversion/display warnings: ' + JSON.stringify(dialogs))
    if (report.actualModel) assert.equal(repairWarnings, report.actualModel.progress.at(-1).stepRepairedObjects > 0 ? 1 : 0, 'Measured topology repairs require exactly one explicit warning')
    console.log('PASS browser exact-only incremental STEP:', JSON.stringify({ ...report, pageErrors: errors, missingAssets: missing, backendWrites: writes, occtRequests, dialogs }))
  } catch (error) {
    const current = await page?.evaluate(() => window.testResult?.()).catch(() => null)
    console.error('FAIL browser STEP diagnostics:', JSON.stringify({ current, completedRuns: Object.keys(report), pageErrors: errors, missingAssets: missing, backendWrites: writes, occtRequests, dialogs }))
    throw error
  } finally {
    await browser?.close()
    if (server.listening) await new Promise(resolve => server.close(resolve))
  }
}

module.exports = { cubeFixture, topologyRepairWarning, main }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
