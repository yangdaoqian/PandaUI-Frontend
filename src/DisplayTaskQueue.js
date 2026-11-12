export default class DisplayTaskQueue {
  constructor (onSlice, budgetMs = 8) {
    this.onSlice = onSlice
    this.budgetMs = budgetMs
    this.tasks = []
    this.head = 0
    this.timer = null
    this.running = false
    this.processed = 0
    this.disposed = false
    this.error = null
  }

  enqueue (iterator) {
    if (this.disposed || this.error) {
      iterator.return?.()
      return this.error ? Promise.reject(this.error) : Promise.resolve()
    }
    const completion = new Promise((resolve, reject) => this.tasks.push({ iterator, resolve, reject }))
    completion.catch(() => {})
    if (this.timer == null && !this.running) this.timer = window.setTimeout(() => this.runSlice(), 0)
    return completion
  }

  runSlice () {
    this.timer = null
    if (this.disposed) return
    this.running = true
    const started = performance.now()
    let processed = 0
    const completed = []
    try {
      while (this.head < this.tasks.length) {
        const task = this.tasks[this.head]
        const result = task.iterator.next()
        if (result.done) {
          this.tasks[this.head++] = null
          task.iterator = null
          completed.push(task)
        } else {
          processed++
          if (result.value) this.processed++
        }
        if (performance.now() - started >= this.budgetMs) break
      }
      if (processed > 0) this.onSlice?.({ processed: this.processed })
      completed.forEach(task => task.resolve())
      if (this.head < this.tasks.length) this.timer = window.setTimeout(() => this.runSlice(), 0)
      else {
        this.tasks.length = 0
        this.head = 0
      }
    } catch (error) {
      this.error = error
      completed.forEach(task => task.reject(error))
      this.clear(error)
    } finally {
      this.running = false
    }
  }

  clear (error) {
    window.clearTimeout(this.timer)
    this.timer = null
    for (let index = this.head; index < this.tasks.length; index++) {
      const task = this.tasks[index]
      try { task.iterator.return?.() } catch (failure) { void failure }
      task.iterator = null
      task.reject(error)
    }
    this.tasks.length = 0
    this.head = 0
  }

  dispose () {
    this.disposed = true
    const error = new Error('Display expansion cancelled.')
    error.name = 'AbortError'
    this.clear(error)
    this.onSlice = null
  }
}
