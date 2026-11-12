(function (global) {
  'use strict'
  var kernel = global.PandaUIKernel = global.PandaUIKernel || {}
  function CommandHistory (document) {
    this.document = document
    this.entries = []
    this.cursor = 0
    this.pending = []
    this.transaction = null
    this.maxEntries = 20
    this.baseToken = kernel.newOperationId()
  }
  CommandHistory.prototype.record = function (command) {
    ;(this.transaction ? this.transaction.commands : this.pending).push(command)
  }
  CommandHistory.prototype.notify = function (reason) {
    this.document.events.emit('history-changed', { reason: reason, canUndo: this.cursor > 0, canRedo: this.cursor < this.entries.length })
  }
  CommandHistory.prototype.commit = function (label) {
    if (this.transaction || !this.pending.length) return false
    this.entries.splice(this.cursor)
    this.entries.push({ label: label || 'Graph change', commands: this.pending, timestamp: Date.now() })
    this.pending = []
    if (this.entries.length > this.maxEntries) {
      var removed = this.entries.shift()
      this.baseToken = removed.commands[removed.commands.length - 1].operation.operationId
    }
    this.cursor = this.entries.length
    this.notify(label)
    return true
  }
  CommandHistory.prototype.begin = function (label) {
    if (this.transaction) throw new Error('A graph transaction is already active.')
    this.commit('Graph change')
    this.transaction = { label: label || 'Graph change', commands: [] }
  }
  CommandHistory.prototype.commitTransaction = function () {
    if (!this.transaction) return false
    var transaction = this.transaction
    this.transaction = null
    this.pending.push.apply(this.pending, transaction.commands)
    return this.commit(transaction.label)
  }
  CommandHistory.prototype.rollback = function () {
    if (!this.transaction) return false
    var transaction = this.transaction
    var result = transaction.commands.length && this.document.applyOperation({ type: 'batch', payload: { operations: transaction.commands.slice().reverse().map(function (command) { return command.inverse }) } }, { record: false, source: 'rollback' })
    var complete = function () { this.transaction = null; this.notify('rollback'); return transaction.commands.length > 0 }.bind(this)
    return result && typeof result.then === 'function' ? result.then(complete) : complete()
  }
  CommandHistory.prototype.undo = function () {
    if (this.transaction) throw new Error('Finish the active graph transaction before undo.')
    this.commit('Graph change')
    if (!this.cursor) return false
    var entry = this.entries[this.cursor - 1]
    var result = this.document.applyOperation({ type: 'batch', payload: { operations: entry.commands.slice().reverse().map(function (command) { return command.inverse }) } }, { record: false, source: 'undo' })
    var complete = function () { this.cursor--; this.notify('undo'); return true }.bind(this)
    return result && typeof result.then === 'function' ? result.then(complete) : complete()
  }
  CommandHistory.prototype.redo = function () {
    if (this.transaction) throw new Error('Finish the active graph transaction before redo.')
    if (this.cursor >= this.entries.length || this.pending.length) return false
    var entry = this.entries[this.cursor]
    var result = this.document.applyOperation({ type: 'batch', payload: { operations: entry.commands.map(function (command) { return { type: command.operation.type, payload: command.operation.payload } }) } }, { record: false, source: 'redo' })
    var complete = function () { this.cursor++; this.notify('redo'); return true }.bind(this)
    return result && typeof result.then === 'function' ? result.then(complete) : complete()
  }
  CommandHistory.prototype.clear = function () {
    this.entries = []; this.cursor = 0; this.pending = []; this.transaction = null
    this.baseToken = kernel.newOperationId()
  }
  CommandHistory.prototype.discard = function (predicate) {
    if (this.transaction || this.document._asyncOperationActive) throw new Error('Finish the active document operation before discarding history.')
    var changed = false
    var cursor = 0
    this.entries = this.entries.filter(function (entry, index) {
      var before = entry.commands.length
      entry.commands = entry.commands.filter(function (command) { return !predicate(command.operation) })
      changed = changed || before !== entry.commands.length
      if (entry.commands.length && index < this.cursor) cursor++
      return entry.commands.length > 0
    }, this)
    this.cursor = cursor
    this.pending = this.pending.filter(function (command) {
      if (!predicate(command.operation)) return true
      changed = true
      return false
    })
    if (changed) this.notify('discard')
    return changed
  }
  CommandHistory.prototype.stateToken = function () {
    var commands = this.pending.length ? this.pending : this.cursor ? this.entries[this.cursor - 1].commands : []
    return commands.length ? commands[commands.length - 1].operation.operationId : this.baseToken
  }
  CommandHistory.prototype.capture = function () {
    return JSON.parse(JSON.stringify({ version: 1, entries: this.entries, cursor: this.cursor, revision: this.document.revision, baseToken: this.baseToken }))
  }
  CommandHistory.prototype.restore = function (data) {
    this.clear()
    if (data && data.version === 1 && Array.isArray(data.entries)) {
      this.entries = JSON.parse(JSON.stringify(data.entries))
      this.cursor = Math.max(0, Math.min(this.entries.length, Number(data.cursor) || 0))
      this.document.revision = Number(data.revision) || 0
      this.baseToken = data.baseToken || this.baseToken
    }
    this.notify('restore')
  }
  kernel.CommandHistory = CommandHistory
})(typeof window !== 'undefined' ? window : globalThis)
