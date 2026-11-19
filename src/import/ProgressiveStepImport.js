import StepPart21Reader from './StepPart21'
import { parseCad } from './CadFileImport'
import { parseNativeStep } from './StepNativeImport'
import collectTransferables from './collectTransferables'
import { parseOpenNurbsStep, readStepInstances, StepOpenNurbsContext, StepSharedMetadata } from './StepOpenNurbsImport'

// The Part 21 index holds source ranges/references, not all model text or all
// triangulations. Only one dependency-complete conversion job is live at a time.
export default class ProgressiveStepImport {
  constructor (file, loadRuntime, options = {}, loadGeometryRuntime = null) {
    this.file = file
    this.loadRuntime = loadRuntime
    this.options = options
    this.loadGeometryRuntime = loadGeometryRuntime
    this.exactObjects = 0
    this.displayOnlyObjects = 0
    this.exactFailures = []
    this.reader = null
    this.active = null
    this.jobIndex = 0
    this.completedJobs = 0
    this.objects = 0
    this.failures = []
    this.nativeParts = 0
    this.fallbackParts = 0
    this.nativeFailures = []
    this.started = performance.now()
    this.timings = { indexMs: 0, metadataMs: 0, extractMs: 0, convertMs: 0, packetMs: 0, firstPacketMs: null }
    this.disposed = false
    this.nativeContext = null
    this.conversionFailures = []
    this.repairedObjects = 0
    this.partialObjects = 0
    this.nonManifoldObjects = 0
    this.openedShellObjects = 0
    this.skippedFaces = 0
    this.maxSourceGap = 0
    this.maxRepairTolerance = 0
    this.maxFitError = 0
    this.maxSewingError = 0
    this.instanceIds = new Set()
    this.instanceWarnings = []
    this.reusedDefinitions = 0
    this.sharedMetadata = null
    this.lastJobTimings = null
  }

  async open (notify) {
    this.notify = notify
    const readerOptions = { onProgress: state => {
      this.notify?.({
        phase: state.phase === 'indexing' ? 'Indexing STEP entities' : state.phase === 'planning' ? 'Planning STEP parts' : 'Reading STEP dependencies',
        readBytes: state.phase === 'indexing' ? state.loaded : this.file.size,
        sourceBytes: this.file.size,
        stepEntityCount: state.entityCount,
        ...(state.phase === 'planning' ? { stepPlannedParts: state.loaded, stepPartsTotal: state.total } : {})
      })
    } }
    // Large files spend a substantial amount of time crossing Blob boundaries.
    // Keep small-file behavior unchanged, but use a bounded 8 MiB scan window
    // for large STEP files to reduce async slice overhead without reading the
    // whole source into memory.
    if (this.file.size > 256 * 1024 * 1024) {
      readerOptions.chunkSize = this.options.stepChunkSize ?? 8 * 1024 * 1024
      // The production reader still validates the Part 21 section boundaries,
      // but avoids allocating a decoded syntax view for every ordinary entity.
      readerOptions.fastIndex = true
    }
    this.reader = await StepPart21Reader.open(this.file, readerOptions)
    this.timings.indexMs = performance.now() - this.started
    if (this.loadGeometryRuntime && this.options.nativeStep !== false) this.nativeContext = new StepOpenNurbsContext(await this.loadGeometryRuntime())
    let stepInstances = []
    if (this.nativeContext && this.reader.readMetadata) {
      const started = performance.now()
      let bytes = await this.reader.readNativeMetadata?.()
      if (bytes) {
        try { this.sharedMetadata = new StepSharedMetadata(bytes, this.options) } catch (error) {
          this.instanceWarnings.push('STEP shared metadata fallback: ' + (error.message || String(error)))
        }
      }
      if (!this.sharedMetadata) bytes = await this.reader.readMetadata()
      if (bytes) {
        try {
          stepInstances = this.sharedMetadata?.occurrences.instances || readStepInstances(bytes, this.options)
          stepInstances.forEach(node => this.instanceIds.add(node.id))
        } catch (error) { this.instanceWarnings.push('STEP assembly metadata: ' + (error.message || String(error))) }
      }
      this.timings.metadataMs = performance.now() - started
    }
    const header = this.nativeContext?.header() || null
    this.nativeContext?.markHeaderSent()
    return {
      header,
      stepInstances,
      layers: [],
      units: 'millimeter',
      warnings: [this.nativeContext ? 'STEP objects are converted to OpenNURBS before display. Failed conversions are reported; display meshes never replace source geometry.' : 'Supported STEP bodies retain exact Breps; unsupported topology uses display meshes with a conversion warning.', ...this.reader.warnings.filter(message => message.startsWith('Visibility limitation:'))],
      ...this.progress(),
      phase: 'STEP index ready'
    }
  }

  progress () {
    return {
      phase: 'Converting STEP parts',
      sourceBytes: this.file?.size || 0,
      readBytes: this.file?.size || 0,
      processedObjects: this.objects,
      stepPartsComplete: this.completedJobs,
      stepPartsTotal: this.reader?.jobs.length || 0,
      stepFailedParts: this.failures.length,
      stepFailedObjects: this.conversionFailures.length,
      stepRepairedObjects: this.repairedObjects,
      stepPartialObjects: this.partialObjects,
      stepNonManifoldObjects: this.nonManifoldObjects,
      stepOpenedShellObjects: this.openedShellObjects,
      stepSkippedFaces: this.skippedFaces,
      stepMaxSourceGapMm: this.maxSourceGap,
      stepMaxRepairToleranceMm: this.maxRepairTolerance,
      stepMaxFitErrorMm: this.maxFitError,
      stepMaxSewingErrorMm: this.maxSewingError,
      stepNativeParts: this.nativeParts,
      stepFallbackParts: this.fallbackParts,
      stepExactObjects: this.exactObjects,
      stepInstanceCount: this.instanceIds.size,
      stepReusedDefinitions: this.reusedDefinitions,
      stepDisplayOnlyObjects: this.displayOnlyObjects,
      stepExactFallbackReasons: this.exactFailures.slice(0, 8),
      stepNativeFallbackReasons: this.nativeFailures.slice(0, 8),
      stepTimings: { ...this.timings },
      ...(this.lastJobTimings ? { stepLastJobTimings: { ...this.lastJobTimings } } : {}),
      ...(this.reader?.fallbackReason ? { stepFallbackReason: this.reader.fallbackReason } : {})
    }
  }

  async pull (notify = () => {}) {
    if (this.disposed) throw new Error('STEP reader has been disposed.')
    this.notify = notify
    // Never start a second conversion until the preceding packet has been
    // consumed by the scene. This is backpressure, not an unbounded push queue.
    if (!this.active && this.jobIndex < this.reader.jobs.length) {
      const job = this.reader.jobs[this.jobIndex++]
      const jobNumber = this.jobIndex
      notify({ ...this.progress(), phase: 'Reading STEP part dependencies', stepCurrentPart: jobNumber })
      const extractStarted = performance.now()
      let source
      try {
        source = this.sharedMetadata ? await this.reader.readNativeJob(job) : await this.reader.readJob(job)
        const extractMs = performance.now() - extractStarted
        this.timings.extractMs += extractMs
        notify({ ...this.progress(), phase: this.nativeContext ? 'Converting STEP to OpenNURBS' : 'Meshing STEP part', stepCurrentPart: jobNumber, stepPartBytes: source.byteLength })
        const convertStarted = performance.now()
        let parsed
        if (this.nativeContext) {
          parsed = parseOpenNurbsStep(source, { ...this.options, visible: job.visible, sparseHeaders: true }, this.nativeContext, this.sharedMetadata, job.rootIds)
          this.nativeParts++
        } else {
          try {
          // Native conversion is attempted per dependency-complete job. A
          // compatibility failure is isolated to this part and falls back to
          // OCCT; successful native parts are never converted twice.
            parsed = this.options.nativeStep === false ? null : parseNativeStep(source, this.options, await this.loadGeometryRuntime?.())
            if (parsed) this.nativeParts++
          } catch (nativeError) {
            this.nativeFailures.push({ part: jobNumber, message: nativeError.message || String(nativeError) })
            parsed = parseCad(await this.loadRuntime(), 'step', source, this.options)
            this.fallbackParts++
          }
        }
        if (!parsed) {
          parsed = parseCad(await this.loadRuntime(), 'step', source, this.options)
          this.fallbackParts++
        }
        const convertMs = performance.now() - convertStarted
        this.timings.convertMs += convertMs
        this.lastJobTimings = {
          part: jobNumber,
          sourceBytes: source.byteLength,
          extractMs,
          convertMs,
          records: 0,
          ...(this.reader.lastReadTimings ? { read: { ...this.reader.lastReadTimings } } : {})
        }
        this.active = parsed.records
        this.activeId = `step:${jobNumber}`
        this.activeVisible = job.visible !== false
        if (this.nativeContext) for (const warning of parsed.warnings || []) if (!this.instanceWarnings.includes(warning)) this.instanceWarnings.push(warning)
        const instances = (parsed.instances || []).filter(node => !this.instanceIds.has(node.id))
        if (instances.length) {
          instances.forEach(node => this.instanceIds.add(node.id))
          // A hierarchy barrier: return before invoking the geometry generator.
          // The scene can display the instance tree before the first expensive
          // Brep solve; metadata packets never enter the mesh worker pool.
          return { ...this.progress(), records: [{ stepInstances: instances }], done: false }
        }
      } catch (error) {
        this.failures.push({ part: jobNumber, message: error.message || String(error) })
        this.completedJobs++
      } finally { source = null }
    }
    const packetStarted = performance.now(), records = []
    let conversionMs = 0
    let bytes = 0
    while (this.active && records.length < 16 && bytes < 4 * 1024 * 1024 && performance.now() - packetStarted < 12) {
      const next = this.active.next()
      if (next.done) { this.active = null; this.completedJobs++; break }
      const record = next.value
      conversionMs += record.stepConversionMs || record.conversionFailure?.conversionMs || 0
      if (record.conversionFailure) {
        this.conversionFailures.push({ sourceFile: this.file?.name, part: this.jobIndex, ...record.conversionFailure })
        if (record.conversionFailure.instanceId) records.push({ stepInstanceFailure: record.conversionFailure })
        if (this.nativeContext) break
        continue
      }
      if (record.exactSource) this.exactObjects++
      else {
        this.displayOnlyObjects++
        if (record.exactError && this.exactFailures.length < 8) this.exactFailures.push(record.exactError)
      }
      if (record.stepDefinitionReused) this.reusedDefinitions++
      const diagnostics = record.stepGeometryDiagnostics
      if (record.stepSkippedFaces?.length) {
        this.partialObjects++
        this.skippedFaces += record.stepSkippedFaces.length
      }
      if (diagnostics) {
        if (diagnostics.openedDeclaredClosedShell) this.openedShellObjects++
        if (diagnostics.nonManifoldRecovery) this.nonManifoldObjects++
        const scale = diagnostics.lengthScale || 1
        if (diagnostics.repairedTrims || diagnostics.repairedEdges || diagnostics.repairedVertices) this.repairedObjects++
        this.maxSourceGap = Math.max(this.maxSourceGap, (diagnostics.sourceGap || 0) * scale)
        this.maxRepairTolerance = Math.max(this.maxRepairTolerance, (diagnostics.repairTolerance || 0) * scale)
        this.maxFitError = Math.max(this.maxFitError, (diagnostics.maxFitError || 0) * scale)
        this.maxSewingError = Math.max(this.maxSewingError, (diagnostics.maxSewingError || 0) * scale)
      }
      if (record.displayObject) {
        record.displayObject.id = `${this.activeId}:${record.displayObject.id}`
        if (!this.activeVisible) record.displayObject.visible = false
      }
      records.push(record)
      bytes += collectTransferables(record).reduce((total, buffer) => total + buffer.byteLength, 0)
      this.objects++
      if (this.lastJobTimings) this.lastJobTimings.records++
      // A fast first body must not wait behind the next synchronous native
      // solve (which can take seconds). Mount it before requesting more work.
      if (this.nativeContext) break
    }
    this.timings.convertMs += conversionMs
    this.timings.packetMs += Math.max(0, performance.now() - packetStarted - conversionMs)
    if (records.length && this.timings.firstPacketMs == null) this.timings.firstPacketMs = performance.now() - this.started
    const done = !this.active && this.jobIndex >= this.reader.jobs.length
    if (done && !this.objects) throw new Error('STEP import produced no readable OpenNURBS objects. ' + [...this.failures, ...this.conversionFailures].slice(0, 3).map(item => item.message).join('; '))
    const warnings = []
    if (done) warnings.push(...this.instanceWarnings)
    if (done && this.repairedObjects) warnings.push(`STEP: ${this.repairedObjects} object(s) required topology tolerance repair. Maximum sampled curve/surface gap: ${this.maxSourceGap.toPrecision(5)} mm; endpoint sewing: ${this.maxSewingError.toPrecision(5)} mm; UV fitting error: ${this.maxFitError.toPrecision(5)} mm; repair limit: ${this.maxRepairTolerance.toPrecision(5)} mm. Original 3D geometry is retained; recovered UV trims are approximate.`)
    if (done && this.failures.length) warnings.push(`STEP: ${this.failures.length} conversion job(s) failed; other parts were retained. ` + this.failures.slice(0, 3).map(item => `Part ${item.part}: ${item.message}`).join('; '))
    if (done && this.conversionFailures.length) warnings.push(`STEP: ${this.conversionFailures.length} object(s) failed OpenNURBS conversion. No display-only replacements were inserted. ` + this.conversionFailures.slice(0, 5).map(item => `#${item.entity}: ${item.message}`).join('; '))
    if (done && this.partialObjects) warnings.push(`STEP: ${this.partialObjects} object(s) were retained as partial OpenNURBS Breps after skipping ${this.skippedFaces} invalid face(s). Skipped source-face IDs and failure reasons are retained in object diagnostics; skipped faces are not present in the resulting Brep.`)
    if (done && this.nonManifoldObjects) warnings.push(`STEP: ${this.nonManifoldObjects} object(s) passed OpenNURBS validity but failed the global oriented-manifold check. Source surfaces were retained and the objects are flagged with nonManifoldRecovery diagnostics.`)
    if (done && this.openedShellObjects) warnings.push(`STEP: ${this.openedShellObjects} object(s) were declared CLOSED_SHELL by the source but contained a boundary; all valid faces were retained as open OpenNURBS Breps.`)
    if (done && this.displayOnlyObjects) warnings.push(`STEP: ${this.exactObjects} exact Brep object(s), ${this.displayOnlyObjects} display-only mesh object(s). ${this.exactFailures.slice(0, 3).join('; ')}`)
    const result = {
      ...this.progress(),
      records,
      done,
      ...(done ? { totalObjects: this.objects } : {}),
      ...(warnings.length ? { importWarnings: warnings } : {})
    }
    if (done) this.dispose()
    return result
  }

  dispose () {
    this.active?.return?.()
    this.active = null
    this.reader?.dispose?.()
    this.nativeContext?.dispose(); this.nativeContext = null
    this.sharedMetadata?.dispose(); this.sharedMetadata = null
    this.reader = this.file = this.loadRuntime = this.loadGeometryRuntime = this.notify = null
    this.lastJobTimings = null
    this.instanceIds.clear(); this.instanceWarnings.length = 0
    this.disposed = true
  }
}
