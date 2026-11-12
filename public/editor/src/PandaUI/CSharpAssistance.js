(function (global) {
  'use strict'

  function sameSource (left, right) {
    return left && right && left.code === right.code && left.referencesKey === right.referencesKey
  }

  function Assistance (options) {
    this.options = options
    this.disposed = false
    this.channels = { diagnostics: {}, signature: {} }
  }

  Assistance.shouldComplete = function (prefix) {
    return /[\p{L}\p{N}_.]$/u.test(prefix) || /\bnew\s+$/u.test(prefix)
  }

  Assistance.prototype.snapshot = function () {
    var state = this.options.readState()
    return { code: state.code, position: state.position, references: state.references.slice(), referencesKey: JSON.stringify(state.references), focused: state.focused }
  }

  Assistance.prototype.update = function () {
    if (this.disposed) return
    var state = this.snapshot()
    this.schedule('diagnostics', state, 600)
    if (state.focused) this.schedule('signature', state, 150)
    else this.hideSignature()
  }

  Assistance.prototype.schedule = function (kind, state, delay) {
    var channel = this.channels[kind]
    if (sameSource(channel.state, state) && (kind === 'diagnostics' || channel.state.position === state.position)) return
    this.cancel(kind)
    channel.state = state
    if (kind === 'signature') this.options.onSignature(null)
    else this.options.onPending(true)
    channel.timer = setTimeout(function () { this.send(kind, state) }.bind(this), delay)
  }

  Assistance.prototype.cancel = function (kind) {
    var channel = this.channels[kind]
    clearTimeout(channel.timer)
    clearTimeout(channel.timeout)
    if (channel.controller) channel.controller.abort()
    channel.controller = null
  }

  Assistance.prototype.hideSignature = function () {
    this.cancel('signature')
    this.channels.signature.state = this.snapshot()
    this.options.onSignature(null)
  }

  Assistance.prototype.requestSignature = function () {
    this.channels.signature.state = null
    this.update()
  }

  Assistance.prototype.send = async function (kind, state) {
    var channel = this.channels[kind]
    var controller = new AbortController()
    channel.controller = controller
    var timedOut = false
    channel.timeout = setTimeout(function () { timedOut = true; controller.abort() }, 15000)
    var current = function () {
      if (this.disposed || channel.controller !== controller) return false
      var latest = this.snapshot()
      return sameSource(state, latest) && (kind === 'diagnostics' || (latest.focused && state.position === latest.position))
    }.bind(this)
    try {
      var response = await fetch('/api/node/script/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ code: state.code, position: state.position, references: state.references, includeDiagnostics: kind === 'diagnostics' })
      })
      var data = await response.json()
      if (!response.ok || !data || !data.ok) throw new Error(data && data.error || 'HTTP ' + response.status)
      if (!current()) return
      if (kind === 'diagnostics') this.options.onDiagnostics(Array.isArray(data.diagnostics) ? data.diagnostics : [])
      else this.options.onSignature(data.signature)
    } catch (error) {
      if (current() && (error.name !== 'AbortError' || timedOut)) this.options.onError(kind, timedOut ? 'request timed out' : error.message)
    } finally {
      if (channel.controller === controller) {
        clearTimeout(channel.timeout)
        channel.controller = null
        if (!this.disposed && kind === 'diagnostics') this.options.onPending(false)
      }
    }
  }

  Assistance.prototype.dispose = function () {
    this.disposed = true
    this.cancel('diagnostics')
    this.cancel('signature')
  }

  global.PandaUICSharpAssistance = Assistance
})(window)
