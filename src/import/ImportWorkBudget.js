// Cooperative main-thread work, shared by conversion and instance expansion.
// Wait until after a paint before continuing; a timer alone can keep filling
// the event loop without giving an overloaded viewport a frame.
export default class ImportWorkBudget {
  constructor (milliseconds = 4) {
    this.milliseconds = milliseconds
    this.started = performance.now()
  }

  get expired () { return performance.now() - this.started >= this.milliseconds }

  async yield () {
    await new Promise(resolve => {
      if (typeof requestAnimationFrame !== 'function' || (typeof document !== 'undefined' && document.hidden)) {
        setTimeout(resolve, 0)
        return
      }
      let frame
      const finish = () => { clearTimeout(timer); cancelAnimationFrame(frame); resolve() }
      // Also finish if the tab becomes hidden while waiting for its paint.
      const timer = setTimeout(finish, 100)
      frame = requestAnimationFrame(() => setTimeout(finish, 0))
    })
    this.started = performance.now()
  }
}
