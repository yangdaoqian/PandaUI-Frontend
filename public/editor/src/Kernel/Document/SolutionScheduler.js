(function (global) {
  'use strict'
  var kernel = global.PandaUIKernel = global.PandaUIKernel || {}
  function SolutionScheduler (document) { this.document = document }
  var methods = {}
  methods.requestSolution = function () {
    if (this._isSolving) {
      if (this.stepMode && this._batchDepth === 0) this._solutionRequested = true
      this.abortSolution()
      return this._solutionPromise || this._flushPromise
    }
    if (!this.stepMode || this._batchDepth > 0 || this._flushPromise) return this._flushPromise
    this._solutionRequested = true
    var pending = Promise.resolve().then(this.flushDirty.bind(this)).finally(function () {
      if (this._flushPromise === pending) this._flushPromise = null
      if (this._solutionRequested && this.stepMode && this._batchDepth === 0) this.requestSolution()
    }.bind(this))
    this._flushPromise = pending
    return pending
  }
  methods.flushDirty = function () {
    if (this._isSolving) return this._solutionPromise || Promise.resolve()
    var pending = this.runDirtySolution()
    this._solutionPromise = pending
    var clear = function () { if (this._solutionPromise === pending) this._solutionPromise = null }.bind(this)
    pending.then(clear, clear)
    return pending
  }
  methods.runDirtySolution = async function () {
    this._isSolving = true
    this._solutionRequested = false
    var token = ++this._solutionToken
    var startedAt = Date.now()
    try {
      var dirty = new Set(this._dirty); this._dirty.clear()
      var nodes = this.topologicalNodes().filter(function (node) { return dirty.has(String(node.id)) })
      for (var i = 0; i < nodes.length && token === this._solutionToken; i++) await this.executeNode(nodes[i], token)
    } finally {
      this.elapsed_time = (Date.now() - startedAt) / 1000
      this.globaltime += this.elapsed_time
      this._isSolving = false
      this._nodes.forEach(function (node) {
        if (node._executionState === 'aborting') {
          if (typeof node.setExecutionState === 'function') node.setExecutionState('ready')
          else node._executionState = 'ready'
        }
        node._executionCancellationRequested = false
      })
    }
  }
  methods.solveAll = async function () {
    if (this._isSolving && this._solutionPromise) {
      var previousToken = this._solutionToken
      await this._solutionPromise
      if (previousToken !== this._solutionToken && this.stepMode && this._flushPromise) await this._flushPromise
    }
    this._nodes.forEach(function (node) { this._dirty.add(String(node.id)) }, this)
    return this.flushDirty()
  }
  methods.newSolution = methods.solveAll
  methods.abortSolution = function () {
    this._solutionToken++
    this._nodes.forEach(function (node) {
      var active = node._activeExecutionContext || node._executionState === 'running'
      if (!active || node._executionCancellationRequested) return
      node._executionCancellationRequested = true
      if (typeof node.setExecutionState === 'function') node.setExecutionState('aborting')
      if (node._activeExecutionContext && node._activeExecutionContext.abortController) node._activeExecutionContext.abortController.abort()
      if (node._executionContext && node._executionContext.cancel) node._executionContext.cancel('document-changed')
      if (typeof node.onExecutionCancelled === 'function') node.onExecutionCancelled()
    })
    return this._solutionPromise || Promise.resolve()
  }
  Object.keys(methods).forEach(function (name) {
    SolutionScheduler.prototype[name] = function () { return methods[name].apply(this.document, arguments) }
  })
  kernel.SolutionScheduler = SolutionScheduler
  kernel.installSolutionScheduler = function (GraphDocument) {
    Object.keys(methods).forEach(function (name) {
      GraphDocument.prototype[name] = function () { return this.scheduler[name].apply(this.scheduler, arguments) }
    })
  }
})(typeof window !== 'undefined' ? window : globalThis)
