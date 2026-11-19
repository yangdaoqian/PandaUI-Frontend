const dialogId = 'pandaui-import-message'
const styleId = `${dialogId}-style`

// Native top-layer dialog: accessible focus handling without blocking imports
// or scene rendering. Text is assigned as plain text, including file names.
export default function showImportMessage (message) {
  if (typeof document === 'undefined') { console.warn(String(message)); return }
  let dialog = document.getElementById(dialogId)
  if (dialog?.open) {
    const text = dialog.querySelector('textarea')
    text.value += '\n\n' + String(message)
    dialog.querySelector('[role="status"]').textContent = ''
    return dialog
  }
  // close events are queued; remove an already closed panel before replacing it.
  dialog?.remove()
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      #${dialogId} { box-sizing: border-box; width: min(720px, calc(100vw - 32px));
        max-height: calc(100dvh - 32px); padding: 24px; border: 1px solid #cbd5e1;
        border-radius: 14px; background: #f8fafc; color: #172033;
        box-shadow: 0 18px 64px #0005; font: 14px/1.5 system-ui, sans-serif; }
      #${dialogId}::backdrop { background: #0f172a66; }
      #${dialogId} h2 { margin: 0 0 8px; font-size: 19px; }
      #${dialogId} p { margin: 0 0 14px; color: #475569; }
      #${dialogId} textarea { box-sizing: border-box; display: block; width: 100%;
        height: clamp(140px, 36vh, 400px); max-height: 48dvh; min-height: 80px;
        padding: 12px; border: 1px solid #94a3b8; border-radius: 7px;
        background: #fff; color: #172033; font: 14px/1.6 ui-monospace, monospace;
        resize: vertical; white-space: pre-wrap; user-select: text !important;
        -webkit-user-select: text !important; touch-action: auto; }
      #${dialogId} footer { display: flex; align-items: center; flex-wrap: wrap;
        gap: 10px; margin-top: 16px; }
      #${dialogId} [role="status"] { flex: 1 1 180px; color: #475569; }
      #${dialogId} .message-actions { display: flex; gap: 10px; margin-left: auto; }
      #${dialogId} button { min-height: 38px; padding: 7px 16px; border-radius: 6px;
        border: 1px solid #94a3b8; color: #172033; background: white; cursor: pointer; }
      #${dialogId} button:last-child { color: white; background: #2563eb; border-color: #2563eb; }
      #${dialogId} :focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
    `
    document.head.append(style)
  }
  dialog = document.createElement('dialog')
  dialog.id = dialogId
  dialog.setAttribute('aria-labelledby', `${dialogId}-title`)
  const title = document.createElement('h2')
  title.id = `${dialogId}-title`
  title.textContent = 'Import details'
  const hint = document.createElement('p')
  hint.textContent = 'Select text to copy, or use Copy to copy the full message.'
  const text = document.createElement('textarea')
  text.readOnly = true
  text.spellcheck = false
  text.setAttribute('aria-label', 'Import message')
  text.value = String(message)
  const footer = document.createElement('footer')
  const status = document.createElement('span')
  status.setAttribute('role', 'status')
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.textContent = 'Copy'
  copy.addEventListener('click', async () => {
    let copied = false
    const value = text.value
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        copied = true
      }
    } catch (_) { /* HTTP origins and denied clipboard permissions use selection. */ }
    if (!dialog.open) return
    if (!copied) {
      text.focus()
      text.select()
      try { copied = document.execCommand('copy') === true } catch (_) { /* Keep the selection available. */ }
    }
    status.textContent = copied ? 'Copied.' : 'Text selected. Press Ctrl+C / Cmd+C, or use the selection menu to copy.'
  })
  const close = document.createElement('button')
  close.type = 'button'
  close.textContent = 'Close'
  close.addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => dialog.remove(), { once: true })
  const actions = document.createElement('div')
  actions.className = 'message-actions'
  actions.append(copy, close)
  footer.append(status, actions)
  dialog.append(title, hint, text, footer)
  document.body.append(dialog)
  dialog.showModal()
  text.focus()
  return dialog
}
