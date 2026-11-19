export function normalizeViewportSettings (value = {}) {
  return { adaptive: value.adaptive !== false }
}

export default class AdaptiveViewport {
  constructor (renderer) {
    this.gl = renderer.getContext()
    this.webgl2 = renderer.capabilities.isWebGL2
    this.extension = this.gl.getExtension(this.webgl2 ? 'EXT_disjoint_timer_query_webgl2' : 'EXT_disjoint_timer_query')
    this.settings = normalizeViewportSettings()
    this.targetGpuMs = 100
    this.minimumScale = 0.6
    this.scale = 1
    this.activeScale = 1
    this.idleFullResolution = false
    this.averageMs = 0
    this.samples = 0
    this.fastSamples = 0
    this.lastAdjustment = -Infinity
    this.lastFrame = null
    this.tickIndex = 0
    this.lastDrawTick = null
    this.consecutiveFrames = 0
    this.lastInteraction = null
    this.cpuMs = 0
    this.gpuMs = null
    this.frameTimes = []
    this.fps = null
    this.idle = true
    this.lastTick = null
    this.callbackMs = 0
    this.pending = []
    this.active = null
    this.warmup = 5
    this.source = this.extension ? 'GPU' : 'Frame'
    this.loading = false
    this.queryPool = new Set()
    this.freeQueries = []
    this.lastQueryStart = -Infinity
    this.lastQueryPoll = -Infinity
    this.queryIntervalMs = 100
  }

  configure (settings) {
    const next = normalizeViewportSettings(settings)
    if (next.adaptive === this.settings.adaptive) return false
    this.settings = next
    this.reset()
    return true
  }

  reset (preserveScale = false) {
    this.clearQueries()
    if (!preserveScale) {
      this.scale = this.activeScale = 1
      this.idleFullResolution = false
    }
    this.lastAdjustment = -Infinity
    this.averageMs = 0
    this.samples = this.fastSamples = 0
    this.warmup = 5
    this.lastFrame = null
    this.lastDrawTick = null
    this.lastTick = null
    this.callbackMs = 0
    this.consecutiveFrames = 0
    this.lastInteraction = null
    this.cpuMs = 0
    this.gpuMs = null
    this.frameTimes = []
    this.fps = null
    this.idle = true
    this.lastQueryStart = this.lastQueryPoll = -Infinity
  }

  deleteQuery (query) {
    if (this.webgl2) this.gl.deleteQuery(query)
    else this.extension.deleteQueryEXT(query)
  }

  clearQueries () {
    this.pending.forEach(entry => this.freeQueries.push(entry.query))
    this.pending = []
  }

  observeRefresh (now) {
    const interval = this.lastTick == null ? 0 : now - this.lastTick
    this.lastTick = now
    if (interval > 0) this.callbackMs = this.callbackMs ? this.callbackMs * 0.85 + interval * 0.15 : interval
  }

  beginFrame (now = performance.now()) {
    const consecutive = this.lastDrawTick === this.tickIndex - 1
    this.consecutiveFrames = consecutive ? this.consecutiveFrames + 1 : 0
    this.lastDrawTick = this.tickIndex
    this.frameStart = now
    this.lastFrame = now
    this.idle = false
    this.sampleFrame = this.warmup-- <= 0
    if (!this.settings.adaptive || !this.extension || this.pending.length >= 4 || this.gl.isContextLost()) return
    if (now - this.lastQueryStart < this.queryIntervalMs) return
    let query = this.freeQueries.pop()
    if (!query && this.queryPool.size < 4) {
      query = this.webgl2 ? this.gl.createQuery() : this.extension.createQueryEXT()
      if (query) this.queryPool.add(query)
    }
    if (!query) return
    if (this.webgl2) this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query)
    else this.extension.beginQueryEXT(this.extension.TIME_ELAPSED_EXT, query)
    this.active = query
    this.lastQueryStart = now
  }

  endFrame (now = performance.now()) {
    this.frameTimes.push(now)
    while (this.frameTimes.length > 512 || (this.frameTimes.length > 2 && this.frameTimes[1] < now - 1000)) this.frameTimes.shift()
    const duration = now - this.frameTimes[0]
    if (duration >= 250) this.fps = (this.frameTimes.length - 1) * 1000 / duration
    const cpuMs = now - this.frameStart
    this.cpuMs = this.cpuMs ? this.cpuMs * 0.85 + cpuMs * 0.15 : cpuMs
    if (this.active) {
      if (this.webgl2) this.gl.endQuery(this.extension.TIME_ELAPSED_EXT)
      else this.extension.endQueryEXT(this.extension.TIME_ELAPSED_EXT)
      this.pending.push({ query: this.active, sample: this.sampleFrame, adaptive: !this.idleFullResolution, scale: this.scale })
      this.active = null
    } else if (!this.extension && this.settings.adaptive && !this.idleFullResolution) {
      this.sample(cpuMs, now, this.sampleFrame)
    }
  }

  noteInteraction (now = performance.now()) {
    this.resumeResolution()
    if (this.lastInteraction == null || now - this.lastInteraction > 300) {
      this.frameTimes = []
      this.fps = null
    }
    this.lastInteraction = now
  }

  get mode () {
    if (this.idle) return 'idle'
    const interacting = this.lastInteraction != null && Math.max(this.lastTick || 0, this.lastFrame || 0) - this.lastInteraction < 300
    return interacting || this.consecutiveFrames >= 2 ? 'continuous' : 'on-demand'
  }

  resumeResolution () {
    if (!this.idleFullResolution) return
    this.scale = this.activeScale
    this.idleFullResolution = false
    this.averageMs = this.samples = this.fastSamples = 0
    this.clearQueries()
  }

  sample (milliseconds, now, allowRecovery = true) {
    if (!this.settings.adaptive || this.idleFullResolution) return
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return
    milliseconds = Math.min(milliseconds, 250)
    this.averageMs = this.samples++ ? this.averageMs * 0.85 + milliseconds * 0.15 : milliseconds
    const slow = Math.min(milliseconds, this.averageMs) > this.targetGpuMs
    const fast = allowRecovery && !this.loading && Math.max(milliseconds, this.averageMs) < this.targetGpuMs - 4
    this.fastSamples = fast ? this.fastSamples + 1 : 0
    let next = this.scale
    if (slow && now - this.lastAdjustment >= (this.loading ? 500 : 250)) {
      const factor = Math.max(0.9, Math.min(0.99, Math.sqrt((this.targetGpuMs - 1) / this.averageMs)))
      next = Math.max(this.minimumScale, this.scale * factor)
    } else if (this.fastSamples >= 12 && now - this.lastAdjustment >= 750) {
      next = Math.min(1, this.scale * 1.03)
    }
    next = Math.round(next * 100) / 100
    if (Math.abs(next - this.scale) < 0.001) return
    this.scale = this.activeScale = next
    this.lastAdjustment = now
    this.averageMs = this.samples = this.fastSamples = 0
  }

  tickLight (now = performance.now(), idle = false, loading = false) {
    this.tickIndex++
    this.observeRefresh(now)
    this.loading = loading
    const previousScale = this.scale
    // Progressive AA/path-tracing requests are drawing work, not interaction.
    // Keep idle full resolution until an explicit invalidation or import resumes.
    if (loading) this.resumeResolution()
    const lastCompleted = this.frameTimes.length ? this.frameTimes[this.frameTimes.length - 1] : this.lastFrame
    if (idle && (lastCompleted == null || now - lastCompleted > 300)) {
      this.idle = true
      this.fps = null
      this.frameTimes = []
      this.consecutiveFrames = 0
      if (!loading && this.scale < 1 && !this.idleFullResolution) {
        this.activeScale = this.scale
        this.scale = 1
        this.idleFullResolution = true
        this.fastSamples = 0
        this.clearQueries()
      }
    }
    return previousScale !== this.scale
  }

  tickConsume (now = performance.now()) {
    if (!this.extension || !this.pending.length) return
    if (now - this.lastQueryPoll < this.queryIntervalMs) return
    this.lastQueryPoll = now
    if (this.gl.getParameter(this.extension.GPU_DISJOINT_EXT)) {
      this.clearQueries()
      this.gpuMs = null
      this.averageMs = this.samples = this.fastSamples = 0
      return
    }
    while (this.pending.length) {
      const entry = this.pending[0]
      const available = this.webgl2
        ? this.gl.getQueryParameter(entry.query, this.gl.QUERY_RESULT_AVAILABLE)
        : this.extension.getQueryObjectEXT(entry.query, this.extension.QUERY_RESULT_AVAILABLE_EXT)
      if (!available) break
      const elapsed = this.webgl2
        ? this.gl.getQueryParameter(entry.query, this.gl.QUERY_RESULT)
        : this.extension.getQueryObjectEXT(entry.query, this.extension.QUERY_RESULT_EXT)
      this.freeQueries.push(entry.query)
      this.pending.shift()
      if (entry.scale === this.scale) {
        const gpuMs = elapsed / 1e6
        this.gpuMs = gpuMs
        if (entry.adaptive) this.sample(gpuMs, now, entry.sample)
      }
    }
  }

  tick (now = performance.now(), idle = false, loading = false) {
    const previousScale = this.scale
    this.tickLight(now, idle, loading)
    this.tickConsume(now)
    return previousScale !== this.scale
  }

  dispose () {
    this.clearQueries()
    this.queryPool.forEach(query => this.deleteQuery(query))
    this.queryPool.clear()
    this.freeQueries = []
  }
}
