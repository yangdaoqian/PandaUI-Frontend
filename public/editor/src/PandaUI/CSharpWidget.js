(function (global) {
  'use strict'

  function element (tag, className, text) {
    var result = document.createElement(tag)
    result.className = className || ''
    if (text != null) result.textContent = text
    return result
  }

  global.PandaUIBuildCSharpWidget = function (node, root, control, templates) {
    root.classList.add('pandaui-csharp-editor')
    var header = element('div', 'pandaui-csharp-header')
    header.appendChild(element('span', 'pandaui-csharp-file', 'C#  ·  Component.cs'))
    var compile = button('Compile', 'Compile script (Ctrl+S)', function () { node.compile() })
    compile.classList.add('pandaui-csharp-compile')
    header.appendChild(compile)
    var toolbar = element('div', 'pandaui-csharp-toolbar')
    var template = element('select')
    template.setAttribute('aria-label', 'Template')
    templates.forEach(function (item) { var option = element('option', '', item.label); option.value = item.id; template.appendChild(option) })
    var fold = button('Fold', 'Fold all code blocks', function () { cancelCompletion(); editor.foldAll(true) })
    var unfold = button('Unfold', 'Unfold all code blocks', function () { cancelCompletion(); editor.foldAll(false) })
    var complete = button('Suggest', 'Show completions (Ctrl+Space)', function () { editor.focus(); requestCompletion(true) })
    toolbar.append(template, fold, unfold, complete)
    root.append(header, toolbar)
    var methodRow = element('label', 'pandaui-csharp-method-row', 'Method')
    var method = element('select')
    method.setAttribute('aria-label', 'Script method')
    methodRow.appendChild(method)
    methodRow.hidden = true
    root.appendChild(methodRow)
    var methodsKey = ''

    var timer = null
    var timeout = null
    var disposed = false
    var completionMessage = ''
    var completionCode = ''
    var completionPosition = -1
    var items = []
    var selected = 0
    var assistance
    var liveDiagnostics = []
    var analysisPending = false
    var analysisMessage = ''
    var signatureData = null
    var signatureIndex = 0
    var editor = new global.PandaUICSharpEditor(root, {
      code: String(node.properties.code || ''), folds: node.properties.foldedRanges,
      onChange: function (code, typed) {
        cancelCompletion()
        node.properties.code = code
        invalidate()
        if (typed && !editor.inLiteral() && global.PandaUICSharpAssistance.shouldComplete(code.slice(0, editor.cursor()))) timer = setTimeout(function () { requestCompletion(false) }, 220)
      },
      onFold: function (ranges) { node.properties.foldedRanges = ranges },
      onCursor: function () {
        cursor.textContent = cursorLabel()
        if (completionPosition >= 0 && completionPosition !== editor.cursor()) cancelCompletion()
        if (assistance) assistance.update()
      },
      onScroll: function () { if (!completion.hidden) positionCompletion() },
      onKey: function (event) {
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === ' ' || event.code === 'Space')) {
          assistance.requestSignature(); return true
        }
        if ((event.ctrlKey || event.metaKey) && (event.key === ' ' || event.code === 'Space')) {
          event.preventDefault(); requestCompletion(true); return true
        }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault(); node.compile(); return true
        }
        if (!completion.hidden) {
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            selected = (selected + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length
            selectCompletion(); return true
          }
          if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); insertCompletion(items[selected]); return true }
        }
        if (event.key === 'Escape') { event.preventDefault(); cancelCompletion(); assistance.hideSignature(); return true }
        return false
      }
    })
    var completion = element('div', 'pandaui-csharp-completion')
    completion.hidden = true
    completion.setAttribute('role', 'listbox')
    completion.setAttribute('aria-label', 'C# completions')
    editor.shell.appendChild(completion)

    var signature = element('div', 'pandaui-csharp-signature')
    signature.hidden = true
    signature.setAttribute('aria-label', 'Parameter information')
    signature.setAttribute('role', 'region')
    var signatureHeader = element('div', 'pandaui-csharp-signature-header')
    var signatureStatus = element('span')
    var previousSignature = button('‹', 'Previous overload', function () { selectSignature(-1) })
    var nextSignature = button('›', 'Next overload', function () { selectSignature(1) })
    ;[previousSignature, nextSignature].forEach(function (item) { item.addEventListener('pointerdown', function (event) { event.preventDefault() }) })
    signatureHeader.append(signatureStatus, previousSignature, nextSignature)
    var signatureText = element('div', 'pandaui-csharp-signature-text')
    signature.append(signatureHeader, signatureText)
    root.appendChild(signature)

    var references = element('details', 'pandaui-csharp-references')
    references.appendChild(element('summary', '', 'Assembly references'))
    var reference = element('input')
    reference.type = 'text'
    reference.placeholder = 'Optional DLL paths, separated by ;'
    reference.setAttribute('aria-label', 'Assembly references')
    references.appendChild(reference)
    var footer = element('div', 'pandaui-csharp-footer')
    var status = element('span', 'pandaui-csharp-status')
    status.setAttribute('role', 'status')
    var cursor = element('span', 'pandaui-csharp-cursor')
    footer.append(status, cursor)
    var diagnostics = element('div', 'pandaui-csharp-diagnostics')
    diagnostics.setAttribute('aria-label', 'Errors and warnings')
    root.append(references, footer, diagnostics)

    function button (label, title, action) {
      var result = element('button', '', label)
      result.type = 'button'; result.title = title; result.setAttribute('aria-label', title)
      result.addEventListener('click', action)
      return result
    }
    function refs () { return (node.properties.references || []).slice() }
    function diagnosticList () { return (node.properties.diagnostics || []).length ? node.properties.diagnostics : liveDiagnostics }
    function invalidate () {
      if (node._compileController) node._compileController.abort()
      node.properties.componentId = ''; node.properties.compileHash = ''; node.properties.diagnostics = []; node._ghEntry = null
      liveDiagnostics = []; analysisMessage = ''
      node.setDirtyCanvas()
      syncDiagnostics()
      syncStatus()
      if (assistance) assistance.update()
    }
    function selectSignature (direction) {
      if (!signatureData) return
      signatureIndex = (signatureIndex + direction + signatureData.signatures.length) % signatureData.signatures.length
      renderSignature()
    }
    function renderSignature () {
      var wasHidden = signature.hidden
      signature.hidden = !signatureData || !signatureData.signatures || !signatureData.signatures.length
      if (wasHidden !== signature.hidden) editor.cm.refresh()
      if (signature.hidden) return
      var item = signatureData.signatures[signatureIndex]
      signatureStatus.textContent = 'Argument ' + (signatureData.argumentIndex + 1) + ' · Overload ' + (signatureIndex + 1) + ' / ' + signatureData.signatures.length
      previousSignature.disabled = nextSignature.disabled = signatureData.signatures.length < 2
      signatureText.replaceChildren(element('span', '', item.prefix))
      item.parameters.forEach(function (parameter, index) {
        if (index) signatureText.appendChild(element('span', '', ', '))
        var part = element(index === item.activeParameter ? 'strong' : 'span', '', parameter.label)
        if (index === item.activeParameter) part.setAttribute('aria-current', 'true')
        signatureText.appendChild(part)
      })
      signatureText.appendChild(element('span', '', item.suffix))
    }
    function cursorLabel () {
      var lines = editor.code.slice(0, editor.cursor()).split('\n')
      return 'Ln ' + lines.length + ', Col ' + (lines[lines.length - 1].length + 1)
    }
    function hideCompletion () {
      completion.hidden = true; completion.replaceChildren(); items = []; selected = 0
      editor.input.setAttribute('aria-expanded', 'false')
      editor.input.removeAttribute('aria-activedescendant')
    }
    function cancelCompletion () {
      clearTimeout(timer); clearTimeout(timeout); timer = null; timeout = null
      if (node._completionController) node._completionController.abort()
      node._completionController = null
      completionPosition = -1; completionMessage = ''
      hideCompletion()
    }
    function insertCompletion (item) {
      if (!item || editor.code !== completionCode || editor.cursor() !== completionPosition) { cancelCompletion(); return }
      var end = editor.cursor()
      var prefix = (editor.code.slice(0, end).match(/[\p{L}\p{N}_]+$/u) || [''])[0]
      var from = Number.isInteger(item.replaceStart) ? item.replaceStart : end - prefix.length
      var to = Number.isInteger(item.replaceEnd) ? item.replaceEnd : end
      if (from < 0 || to < from || to > editor.code.length) { cancelCompletion(); return }
      cancelCompletion()
      editor.replaceSelection(item.insertText == null ? String(item.label) : String(item.insertText), from, to, item.newPosition)
    }
    function positionCompletion () {
      var point = editor.caretPosition()
      var width = Math.min(360, editor.shell.clientWidth - 16)
      completion.style.width = width + 'px'
      completion.style.left = Math.max(8, Math.min(point.left, editor.shell.clientWidth - width - 8)) + 'px'
      var height = Math.min(164, editor.shell.clientHeight - 16)
      completion.style.maxHeight = height + 'px'
      completion.style.top = Math.max(4, Math.min(point.top + 2, editor.shell.clientHeight - height - 4)) + 'px'
    }
    function selectCompletion () {
      Array.prototype.forEach.call(completion.children, function (option, index) { option.setAttribute('aria-selected', String(index === selected)) })
      var option = completion.children[selected]
      if (!option) return
      editor.input.setAttribute('aria-activedescendant', option.id)
      if (option.offsetTop < completion.scrollTop) completion.scrollTop = option.offsetTop
      else if (option.offsetTop + option.offsetHeight > completion.scrollTop + completion.clientHeight) completion.scrollTop = option.offsetTop + option.offsetHeight - completion.clientHeight
    }
    function showCompletion (values) {
      hideCompletion()
      items = values
      if (!items.length) return
      items.forEach(function (item, index) {
        var option = element('div', 'pandaui-csharp-completion-item')
        option.id = 'csharp-' + node.id + '-completion-' + index
        option.setAttribute('role', 'option')
        option.title = String(item.detail || item.label)
        var kinds = { namespace: 'N', namedtype: 'T', method: 'ƒ', property: 'P', field: 'F', event: 'E', local: 'V', parameter: 'V', keyword: 'K' }
        option.append(element('span', 'pandaui-csharp-completion-kind', kinds[item.kind] || 'T'), element('strong', '', item.label), element('span', 'pandaui-csharp-completion-detail', item.detail || item.kind))
        option.addEventListener('pointerdown', function (event) { event.preventDefault(); event.stopPropagation(); insertCompletion(item) })
        completion.appendChild(option)
      })
      completion.hidden = false
      editor.input.setAttribute('aria-expanded', 'true')
      positionCompletion(); selectCompletion()
    }
    function requestCompletion (explicit) {
      cancelCompletion()
      if (disposed || editor.inLiteral()) return
      var source = editor.code
      var position = editor.cursor()
      var references = refs()
      var controller = new AbortController()
      node._completionController = controller
      completionCode = source; completionPosition = position
      completionMessage = 'Loading suggestions…'; syncStatus()
      var timedOut = false
      timeout = setTimeout(function () { timedOut = true; controller.abort() }, 15000)
      fetch('/api/node/script/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: source, position: position, references: references }), signal: controller.signal
      }).then(function (response) {
        return response.json().catch(function () { throw new Error('Invalid response (HTTP ' + response.status + ')') }).then(function (data) {
          if (!response.ok || !data || !data.ok) throw new Error(data && data.error || 'HTTP ' + response.status)
          return data
        })
      }).then(function (data) {
        if (!current()) return
        var values = Array.isArray(data.items) ? data.items : []
        completionMessage = values.length ? values.length + ' suggestions · Enter to insert' : explicit ? 'No suggestions at this cursor' : ''
        showCompletion(values)
      }).catch(function (error) {
        if (!current()) return
        if (error.name !== 'AbortError' || timedOut) completionMessage = 'Completion unavailable: ' + (timedOut ? 'request timed out' : error.message)
        hideCompletion()
      }).finally(function () {
        if (node._completionController !== controller) return
        clearTimeout(timeout); timeout = null
        node._completionController = null
        syncStatus()
      })
      function current () { return !disposed && node._completionController === controller && editor.code === source && editor.cursor() === position && JSON.stringify(refs()) === JSON.stringify(references) }
    }
    function syncStatus () {
      var list = diagnosticList()
      var errors = list.filter(function (item) { return item.severity === 'error' }).length
      var warnings = list.filter(function (item) { return item.severity === 'warning' }).length
      status.dataset.state = node._compileBusy ? 'busy' : errors ? 'error' : warnings ? 'warning' : node.properties.componentId ? 'ready' : 'idle'
      status.textContent = completionMessage || (node._compileBusy ? 'Compiling…' : analysisMessage || (errors || warnings ? errors + ' errors · ' + warnings + ' warnings' : analysisPending ? 'Checking code…' : node.properties.componentId ? 'Compiled' : 'No errors · Ctrl+S to compile'))
      status.title = status.textContent
      cursor.textContent = cursorLabel()
      compile.disabled = node._compileBusy
    }
    var diagnosticsKey = ''
    function syncDiagnostics () {
      var list = diagnosticList()
      var key = JSON.stringify(list)
      if (key === diagnosticsKey) return
      diagnosticsKey = key
      editor.diagnostics = list
      editor.render(editor.selection())
      diagnostics.replaceChildren()
      diagnostics.hidden = !list.length
      list.forEach(function (item) {
        var row = button((item.severity === 'warning' ? 'Warning' : 'Error') + ' ' + (item.code || '') + (item.line ? ' · ' + item.line + ':' + (item.column || 1) : '') + '  ' + item.message, item.message, function () { cancelCompletion(); editor.reveal(item.line, item.column) })
        row.className = 'pandaui-csharp-diagnostic'; row.dataset.severity = item.severity
        diagnostics.appendChild(row)
      })
    }
    editor.input.addEventListener('blur', function () {
      cancelCompletion(); syncStatus()
      assistance.hideSignature()
      if (node.graph) node.graph.commitHistory('csharp-edit', node)
    })
    editor.input.addEventListener('focus', function () { assistance.requestSignature() })
    reference.addEventListener('change', function () {
      cancelCompletion()
      node.properties.referenceText = reference.value
      node.properties.references = reference.value.split(';').map(function (value) { return value.trim() }).filter(Boolean)
      invalidate()
    })
    template.addEventListener('change', function () {
      cancelCompletion()
      var selected = templates.find(function (item) { return item.id === template.value }) || templates[0]
      node.properties.template = selected.id
      editor.setValue(selected.code, true)
      node.properties.code = selected.code; node.properties.foldedRanges = []
      node.properties.selectedMethod = ''; node.properties.methods = []
      invalidate()
      if (node.graph) node.graph.commitHistory('csharp-template', node)
    })
    method.addEventListener('change', function () {
      node.properties.selectedMethod = method.value
      invalidate()
      node.compile()
    })
    control.bindings.push(function () {
      if (String(node.properties.code || '') !== editor.code) { cancelCompletion(); editor.setValue(String(node.properties.code || '')); liveDiagnostics = []; analysisMessage = '' }
      template.value = node.properties.template || 'basic'
      var methods = node.properties.methods || []
      var nextMethodsKey = JSON.stringify(methods)
      if (methodsKey !== nextMethodsKey) {
        methodsKey = nextMethodsKey
        method.replaceChildren()
        methods.forEach(function (item) { var option = element('option', '', item.label); option.value = item.id; method.appendChild(option) })
        methodRow.hidden = !methods.length
        editor.cm.refresh()
      }
      method.value = node.properties.selectedMethod || ''
      method.disabled = node._compileBusy
      if (document.activeElement !== reference) reference.value = node.properties.referenceText || refs().join(';')
      syncDiagnostics(); syncStatus()
      assistance.update()
    })
    assistance = new global.PandaUICSharpAssistance({
      readState: function () { return { code: editor.code, position: editor.cursor(), references: refs(), focused: editor.cm.hasFocus() } },
      onDiagnostics: function (list) { liveDiagnostics = list; analysisMessage = ''; syncDiagnostics(); syncStatus() },
      onSignature: function (data) { signatureData = data; signatureIndex = data && data.activeSignature || 0; renderSignature() },
      onPending: function (pending) { analysisPending = pending; syncStatus() },
      onError: function (kind, message) { analysisMessage = (kind === 'signature' ? 'Parameter information' : 'Live diagnostics') + ' unavailable: ' + message; syncStatus() }
    })
    assistance.update()
    control.disposers.push(function () { disposed = true; cancelCompletion(); assistance.dispose(); editor.history = []; editor.redo = [] })
  }
})(window)
