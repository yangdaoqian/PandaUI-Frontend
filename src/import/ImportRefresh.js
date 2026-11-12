// Limit automatic import redraws, without delaying user-triggered redraws.
export const IMPORT_REFRESH_BYTES = 30 * 1024 * 1024
export default class ImportRefresh {
  last = -Infinity
  timer = null
  pendingBytes = 0
  disposed = false
  constructor (refresh, interval = 200, byteThreshold = IMPORT_REFRESH_BYTES) {
    this.refresh = refresh
    this.interval = interval
    this.byteThreshold = byteThreshold
  }
  request (bytes = 0) {
    if (this.disposed) return false
    const amount = Number(bytes)
    if (Number.isFinite(amount) && amount > 0) this.pendingBytes += amount
    if (this.pendingBytes < this.byteThreshold) return false
    this.pendingBytes = 0
    this.flush()
    return true
  }
  flush () {
    if (this.timer != null) clearTimeout(this.timer)
    this.timer = null
    if (this.disposed) return
    this.pendingBytes = 0
    this.last = performance.now()
    this.refresh()
  }
  dispose () { if (this.timer != null) clearTimeout(this.timer); this.timer = null; this.pendingBytes = 0; this.disposed = true }
}
