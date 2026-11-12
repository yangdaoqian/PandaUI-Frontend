(function (global) {
  'use strict'
  var closeActive = null
  function panel (title, onClose) {
    if (closeActive) closeActive()
    var box = document.createElement('div')
    box.className = 'pandaui-picker'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', title)
    Object.assign(box.style, { position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647', width: '320px', maxWidth: '90vw', padding: '18px', borderRadius: '12px', background: '#242c38', color: '#eef3ff', boxShadow: '0 12px 50px #0008', font: '14px Arial' })
    var heading = document.createElement('strong'); heading.textContent = title; box.appendChild(heading)
    var closed = false
    var close = function () { if (closed) return; closed = true; onClose?.(); box.remove(); document.removeEventListener('keydown', keydown, true); if (closeActive === close) closeActive = null }
    var keydown = function (event) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }
    document.addEventListener('keydown', keydown, true)
    ;['pointerdown', 'click', 'dblclick', 'wheel', 'keydown', 'keyup'].forEach(function (type) { box.addEventListener(type, function (event) { event.stopPropagation() }) })
    document.body.appendChild(box); closeActive = close
    return { box: box, close: close }
  }
  function control (box, tag, label) {
    var input = document.createElement(tag)
    input.setAttribute('aria-label', label)
    Object.assign(input.style, { boxSizing: 'border-box', display: 'block', width: '100%', marginTop: '12px', padding: '8px', borderRadius: '6px', border: '1px solid #718096', background: '#364152', color: '#fff' })
    box.appendChild(input); return input
  }
  var api = {
    color: function (value, onInput, onCommit) {
      var view = panel('Choose color', onCommit)
      var picker = control(view.box, 'input', 'Color'); picker.type = 'color'; picker.style.height = '110px'
      picker.value = /^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'
      var text = control(view.box, 'input', 'Hex color'); text.value = picker.value
      picker.oninput = function () { text.value = picker.value; onInput(picker.value) }
      text.oninput = function () { if (/^#[\da-f]{6}$/i.test(text.value)) { picker.value = text.value; onInput(text.value) } }
      var done = control(view.box, 'button', 'Done'); done.textContent = 'Done'
      done.onclick = view.close
      picker.onchange = function () { onCommit?.() }
      return view.close
    },
    file: function (accept, onFile) {
      var picker = document.createElement('input'); picker.type = 'file'; picker.accept = accept
      picker.style.display = 'none'; document.body.appendChild(picker)
      picker.onchange = function () { var file = picker.files && picker.files[0]; picker.remove(); if (file) onFile(file) }
      picker.oncancel = function () { picker.remove() }
      picker.click()
    }
  }
  global.PandaUIWidgetPickers = api
})(window)
