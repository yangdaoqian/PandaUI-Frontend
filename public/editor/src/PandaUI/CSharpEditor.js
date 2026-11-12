(function (global) {
  'use strict'

  function element (tag, className, text) {
    var result = document.createElement(tag)
    result.className = className || ''
    if (text != null) result.textContent = text
    return result
  }

  function cloneFolds (folds) {
    return Array.isArray(folds) ? folds.map(function (fold) {
      return { start: Number(fold.start), end: Number(fold.end) }
    }).filter(function (fold) {
      return Number.isFinite(fold.start) && Number.isFinite(fold.end) && fold.end > fold.start
    }) : []
  }

  function methodOverlay () {
    return {
      token: function (stream) {
        if (stream.match(/[A-Za-z_$][\w$]*(?=\s*(?:<[^<>\n]+>)?\s*\()/)) return 'csharp-method'
        stream.next()
        return null
      }
    }
  }

  function CSharpEditor (parent, options) {
    if (!global.CodeMirror) throw new Error('CodeMirror is required before CSharpEditor.js')
    var self = this
    this.options = options || {}
    this.code = String(this.options.code || '')
    this.folds = cloneFolds(this.options.folds)
    this.diagnostics = []
    this._diagnosticMarks = []
    this.history = []
    this.redo = []
    this.shell = element('div', 'pandaui-csharp-editor-shell')
    this.viewport = element('div', 'pandaui-csharp-viewport')
    this.shell.appendChild(this.viewport)
    parent.appendChild(this.shell)

    this.cm = global.CodeMirror(this.viewport, {
      value: this.code,
      mode: 'text/x-csharp',
      lineNumbers: true,
      lineWrapping: false,
      tabSize: 2,
      indentUnit: 2,
      indentWithTabs: false,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'pandaui-diagnostic-gutter'],
      foldGutter: true,
      foldOptions: { rangeFinder: global.CodeMirror.fold.brace },
      styleActiveLine: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      extraKeys: {
        Tab: function (cm) { cm.replaceSelection('  ', 'end') }
      }
    })
    this.cm.addOverlay(methodOverlay())
    this.input = this.cm.getInputField()
    this.input.classList.add('pandaui-csharp-code')
    this.input.setAttribute('aria-label', 'C# source code')
    this.input.setAttribute('autocapitalize', 'off')
    this.input.setAttribute('autocomplete', 'off')
    this.input.spellcheck = false
    this._suppressChange = false
    this._ready = false
    this._installHandlers()
    this._applyFolds(this.folds)
    this.render()
    this._ready = true
  }

  CSharpEditor.prototype._installHandlers = function () {
    var self = this
    this.cm.on('change', function (cm, change) {
      if (self._suppressChange) return
      self.code = cm.getValue()
      self.folds = self._readFolds()
      if (self.options.onFold) self.options.onFold(cloneFolds(self.folds))
      if (self.options.onChange) self.options.onChange(self.code, change && change.origin !== 'setValue')
      if (self.options.onCursor) self.options.onCursor()
    })
    this.cm.on('cursorActivity', function () {
      if (self._ready && !self._suppressChange && self.options.onCursor) self.options.onCursor()
    })
    this.cm.on('scroll', function () {
      if (self._ready && self.options.onScroll) self.options.onScroll()
    })
    this.cm.on('fold', function () { self._foldChanged() })
    this.cm.on('unfold', function () { self._foldChanged() })
    this.cm.on('keydown', function (cm, event) {
      if (self.options.onKey && self.options.onKey(event)) {
        event.preventDefault()
        event.stopPropagation()
      }
    })
  }

  CSharpEditor.prototype._foldChanged = function () {
    this.folds = this._readFolds()
    if (this.options.onFold) this.options.onFold(cloneFolds(this.folds))
  }

  CSharpEditor.prototype._readFolds = function () {
    var seen = {}
    var result = []
    this.cm.getAllMarks().forEach(function (mark) {
      if (!mark.collapsed || typeof mark.find !== 'function') return
      var range = mark.find()
      if (!range || !range.from || !range.to || range.to.line <= range.from.line) return
      var key = range.from.line + ':' + range.to.line
      if (seen[key]) return
      seen[key] = true
      result.push({ start: range.from.line, end: range.to.line })
    })
    return result.sort(function (left, right) { return left.start - right.start || left.end - right.end })
  }

  CSharpEditor.prototype._clearFolds = function () {
    this.cm.getAllMarks().slice().forEach(function (mark) {
      if (mark.collapsed && typeof mark.clear === 'function') mark.clear()
    })
  }

  CSharpEditor.prototype._applyFolds = function (folds) {
    var self = this
    this._clearFolds()
    cloneFolds(folds).sort(function (left, right) { return left.start - right.start }).forEach(function (fold) {
      if (fold.start < self.cm.lineCount()) self.cm.foldCode({ line: fold.start, ch: 0 }, global.CodeMirror.fold.brace, 'fold')
    })
    this.folds = this._readFolds()
  }

  CSharpEditor.prototype._absolutePosition = function (offset) {
    return this.cm.posFromIndex(Math.max(0, Math.min(this.code.length, Number(offset) || 0)))
  }

  CSharpEditor.prototype.selection = function () {
    return {
      start: this.cm.indexFromPos(this.cm.getCursor('from')),
      end: this.cm.indexFromPos(this.cm.getCursor('to'))
    }
  }

  CSharpEditor.prototype.cursor = function () { return this.cm.indexFromPos(this.cm.getCursor('head')) }
  CSharpEditor.prototype.focus = function () { this.cm.focus() }
  CSharpEditor.prototype.snapshot = function () { return { code: this.code, folds: cloneFolds(this.folds), selection: this.selection() } }
  CSharpEditor.prototype.remember = function (snapshot) { this.history.push(snapshot || this.snapshot()); this.redo = [] }
  CSharpEditor.prototype.undo = function (forward) { if (forward) this.cm.redo(); else this.cm.undo() }
  CSharpEditor.prototype.acceptInput = function () {}
  CSharpEditor.prototype.notify = function (typed) { if (this.options.onChange) this.options.onChange(this.code, typed) }
  CSharpEditor.prototype.changedFolds = function () { if (this.options.onFold) this.options.onFold(cloneFolds(this.folds)) }

  CSharpEditor.prototype.replaceSelection = function (text, from, to, newPosition) {
    var selection = this.selection()
    from = from == null ? selection.start : from
    to = to == null ? selection.end : to
    text = String(text)
    this.cm.replaceRange(text, this._absolutePosition(from), this._absolutePosition(to), '+input')
    var cursor = Number.isInteger(newPosition) ? newPosition : from + text.length
    this.cm.setSelection(this._absolutePosition(cursor), this._absolutePosition(cursor))
    this.focus()
  }

  CSharpEditor.prototype.setValue = function (code, remember) {
    code = String(code || '')
    if (code === this.code) return
    if (remember) this.remember()
    this._suppressChange = true
    this.cm.setValue(code)
    this._clearFolds()
    this._suppressChange = false
    this.code = code
    this.folds = []
    this.cm.setCursor({ line: 0, ch: 0 })
    this.render()
  }

  CSharpEditor.prototype.foldAll = function (collapse) {
    if (!collapse) {
      this._clearFolds()
      this._foldChanged()
      return
    }
    this._clearFolds()
    for (var line = this.cm.lineCount() - 1; line >= 0; line--) {
      if (global.CodeMirror.fold.brace(this.cm, { line: line, ch: 0 })) this.cm.foldCode({ line: line, ch: 0 }, global.CodeMirror.fold.brace, 'fold')
    }
    this._foldChanged()
  }

  CSharpEditor.prototype.reveal = function (line, column) {
    var targetLine = Math.max(0, Math.min(this.cm.lineCount() - 1, (Number(line) || 1) - 1))
    var self = this
    this.cm.getAllMarks().slice().forEach(function (mark) {
      if (!mark.collapsed || typeof mark.find !== 'function') return
      var range = mark.find()
      if (range && range.from.line <= targetLine && range.to.line >= targetLine) mark.clear()
    })
    var text = this.cm.getLine(targetLine)
    var target = { line: targetLine, ch: Math.max(0, Math.min(text.length, (Number(column) || 1) - 1)) }
    this.cm.setCursor(target)
    this.cm.scrollIntoView({ from: target, to: target }, Math.max(0, this.cm.getScrollInfo().clientHeight / 3))
    this._foldChanged()
    this.focus()
  }

  CSharpEditor.prototype.caretPosition = function () {
    var coords = this.cm.cursorCoords(null, 'local')
    return { left: coords.left, top: coords.bottom }
  }

  CSharpEditor.prototype.inLiteral = function () {
    var token = this.cm.getTokenAt(this.cm.getCursor('head'))
    return !!(token && token.type && /comment|string/.test(token.type))
  }

  CSharpEditor.prototype.render = function () {
    var self = this
    this.cm.operation(function () {
      self._diagnosticMarks.forEach(function (mark) { mark.clear() })
      self._diagnosticMarks = []
      self.cm.clearGutter('pandaui-diagnostic-gutter')
      var lines = {}
      ;(self.diagnostics || []).forEach(function (item) {
        if (!(Number(item.line) > 0)) return
        var line = Math.max(0, Math.min(self.cm.lineCount() - 1, Number(item.line) - 1))
        var group = lines[line] || (lines[line] = { severity: 'warning', messages: [] })
        if (item.severity !== 'warning') group.severity = 'error'
        group.messages.push((item.code ? item.code + ': ' : '') + (item.message || ''))
        var start = Number.isInteger(item.start) ? item.start : self.cm.indexFromPos({ line: line, ch: Math.max(0, (Number(item.column) || 1) - 1) })
        var end = Math.min(self.code.length, start + Math.max(1, Number(item.length) || 1))
        if (start < 0 || end <= start || start >= self.code.length) return
        self._diagnosticMarks.push(self.cm.markText(self._absolutePosition(start), self._absolutePosition(end), {
          className: 'pandaui-csharp-error-range' + (item.severity === 'warning' ? ' pandaui-csharp-warning-range' : ''),
          title: group.messages[group.messages.length - 1]
        }))
      })
      Object.keys(lines).forEach(function (line) {
        var group = lines[line]
        var marker = element('span', 'pandaui-csharp-diagnostic-marker', group.severity === 'warning' ? '▲' : '●')
        marker.dataset.severity = group.severity
        marker.title = group.messages.join('\n')
        self.cm.setGutterMarker(Number(line), 'pandaui-diagnostic-gutter', marker)
      })
    })
    this.cm.refresh()
  }

  global.PandaUICSharpEditor = CSharpEditor
})(window)
