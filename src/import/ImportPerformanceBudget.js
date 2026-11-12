// Surfaces are background work while the edge reader is active. Keep the
// existing byte backpressure; never accumulate the model in a main-thread list.
export default class ImportPerformanceBudget {
  constructor (edgeReading, hardware = {}, frameDiagnostics = () => ({}), requestedWorkers = null) {
    this.edgeReading = edgeReading
    this.frameDiagnostics = frameDiagnostics
    this.requestedWorkers = requestedWorkers
    this.cores = hardware.hardwareConcurrency || 4
    this.cost = 0
    this.lastYield = 0
    this.currentLimit = 0
  }

  workerLimit (requested) {
    requested = this.requestedWorkers ? this.requestedWorkers() : requested
    const maximum = Math.max(1, Math.min(requested || 8, this.cores - 1, 8))
    // Reserve capacity for the independent file reader and browser interaction.
    const desired = this.edgeReading() ? Math.min(maximum, Math.max(1, Math.floor(this.cores / 4))) : maximum
    return this.cost > 24 ? Math.max(1, Math.floor(desired / 2)) : desired
  }

  sample (milliseconds) { this.cost = this.cost * 0.75 + milliseconds * 0.25 }

  edgeRefreshInterval () {
    const frame = this.frameDiagnostics() || {}
    const cpu = ['prepareMs', 'backgroundMs', 'modelMs', 'previewMs', 'labelsMs'].reduce((sum, key) => sum + (Number.isFinite(frame[key]) ? frame[key] : 0), 0)
    // Spend about 10% on automatic full-scene redraws. Interaction still marks
    // the viewport dirty immediately; only background import paints are paced.
    return Math.max(200, Math.min(3000, Math.max(cpu, frame.gpuMs || 0) * 10))
  }

  async wait (signal) {
    if (signal?.aborted) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
    const now = performance.now()
    const interacting = typeof navigator !== 'undefined' && navigator.scheduling?.isInputPending?.()
    const interval = this.edgeReading() || interacting ? 24 : 8
    if (now - this.lastYield < interval && !interacting && this.cost < 8) return
    await new Promise(resolve => setTimeout(resolve, interacting || this.cost > 24 ? 16 : 0))
    this.lastYield = performance.now()
    if (signal?.aborted) throw Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })
  }
}
