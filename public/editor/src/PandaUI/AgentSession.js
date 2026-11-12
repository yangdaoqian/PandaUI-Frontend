(function (global) {
  'use strict'
  var PandaUI = global.PandaUI

  // Conversation loop for the AI/Assistant node. It owns the exchange with the
  // model and hands every tool call to a GraphAgent, which owns the graph edits
  // and the undo transaction. One call to send() is one AI turn, which is one
  // undo entry: either every edit lands or none of them do.

  var maxIterations = 24

  function now () { return Date.now() }

  function textOf (blocks) {
    if (typeof blocks === 'string') return blocks
    if (!Array.isArray(blocks)) return ''
    return blocks.filter(function (block) { return block && block.type === 'text' && typeof block.text === 'string' })
      .map(function (block) { return block.text }).join('\n').trim()
  }

  // The model needs the tool outcome as text. GraphAgent already bounded the
  // payload, so this only has to serialise it; the is_error flag rides on the
  // tool_result block itself rather than being described in prose.
  function resultContent (response) {
    var value = response && response.is_error && response.error ? response.error : response && response.result
    if (value === undefined || value === null) return 'null'
    try { return typeof value === 'string' ? value : JSON.stringify(value) } catch (error) { return String(value) }
  }

  function defaultTransport (payload, signal) {
    return fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal
    }).then(function (response) {
      return response.json().catch(function () { return {} }).then(function (body) {
        if (!response.ok) throw new Error(body && body.error || 'The AI backend returned ' + response.status + '.')
        return body
      })
    })
  }

  function AgentSession (agent, options) {
    if (!agent || typeof agent.execute !== 'function') throw new Error('AgentSession requires a GraphAgent.')
    this.agent = agent
    this.options = options || {}
    this.transport = this.options.transport || defaultTransport
    this.messages = this.options.messages || []
    this.provider = this.options.provider || 'claude'
    this.contextTokenBudget = PandaUI.ConversationContext.budget(this.options.contextTokenBudget)
    this.contextStats = null
    this.lastUsage = null
    this.status = 'idle'
    this.lastError = ''
    this.busy = false
    this._controller = null
    this._disposed = false
  }

  AgentSession.prototype._emit = function () {
    if (this._disposed || typeof this.options.onUpdate !== 'function') return
    try { this.options.onUpdate(this) } catch (error) { console.error('Unable to update the assistant UI:', error) }
  }
  AgentSession.prototype._setStatus = function (status, error) {
    this.status = status
    this.lastError = error || ''
    this._emit()
  }
  AgentSession.prototype._record = function (role, content) {
    this.messages.push({ role: role, content: content, at: now() })
    this._emit()
  }

  AgentSession.prototype.cancel = function () {
    if (this._controller) this._controller.abort()
  }

  AgentSession.prototype._payload = function () {
    var context = PandaUI.ConversationContext.prepare(this.messages, { tokens: this.contextTokenBudget, agent: this.agent })
    this.contextStats = context.stats
    this._emit()
    return { provider: this.provider, messages: context.messages }
  }

  AgentSession.prototype.send = async function (userText) {
    var text = String(userText == null ? '' : userText).trim()
    if (!text) return { ok: false, error: 'Type a message first.' }
    if (this._disposed) return { ok: false, error: 'This assistant has been removed.' }
    if (this.busy) return { ok: false, error: 'The assistant is still working on the previous message.' }
    this.busy = true
    this._controller = new AbortController()
    var signal = this._controller.signal
    var ownedTurn = null
    var conflictAbort = null
    var previousMessages = this.messages.slice()
    var committed = false
    try {
      this._setStatus('thinking')
      var began = await this.agent.beginTurn({ label: 'AI: ' + text.slice(0, 40), signal: signal })
      if (began.is_error) throw Object.assign(new Error(began.error.message), { code: began.error.code, details: began.error.details })
      ownedTurn = this.agent.turn
      conflictAbort = function () { if (ownedTurn.conflicted) this._controller.abort() }.bind(this)
      ownedTurn.signal.addEventListener('abort', conflictAbort)
      this._record('user', text)
      for (var iteration = 0; iteration < maxIterations; iteration++) {
        if (signal.aborted) throw Object.assign(new Error('Cancelled.'), { code: 'ABORTED' })
        var message = await this.transport(this._payload(), signal)
        if (signal.aborted || this._disposed) throw Object.assign(new Error('Cancelled.'), { code: 'ABORTED' })
        this.lastUsage = message && message.usage || null
        var content = Array.isArray(message && message.content) ? message.content : []
        this._record('assistant', content)

        var calls = content.filter(function (block) { return block && block.type === 'tool_use' })
        if (message.stop_reason !== 'tool_use' || !calls.length) {
          var commit = this.agent.commitTurn()
          if (commit.is_error) throw Object.assign(new Error(commit.error.message), { code: commit.error.code, details: commit.error.details })
          committed = true
          this._setStatus('idle')
          return { ok: true, text: textOf(content) }
        }

        this._setStatus('working')
        // The model may emit several tool_use blocks in one response. Every one
        // of their results has to come back in a SINGLE user message.
        var results = []
        for (var index = 0; index < calls.length; index++) {
          var call = calls[index]
          var response = call.name === 'read_history'
            ? PandaUI.ConversationContext.readHistory(this.messages, call.input)
            : await this.agent.execute(call.name, call.input)
          results.push({
            type: 'tool_result',
            tool_use_id: call.id,
            is_error: Boolean(response && response.is_error),
            content: resultContent(response),
            _tool: call.name
          })
          // A conflict poisons the whole turn: the graph moved under us and every
          // later call would fail the same way. Stop here. Note that GraphAgent
          // deliberately commits a conflicted turn rather than reverting it --
          // rolling back would clobber the edit the user just made -- so the
          // assistant's partial work is kept, not discarded.
          if (response && response.is_error && response.error && (response.error.code === 'GRAPH_CHANGED' || response.error.code === 'ABORTED')) {
            this._record('user', results)
            throw Object.assign(new Error(response.error.message), { code: response.error.code, details: response.error.details })
          }
        }
        this._record('user', results)
        this._setStatus('thinking')
      }
      throw Object.assign(new Error('The assistant used too many steps without finishing. The changes were discarded.'), { code: 'TOO_MANY_STEPS' })
    } catch (error) {
      var graphChanged = error && error.code === 'GRAPH_CHANGED' || ownedTurn && ownedTurn.conflicted
      var conflict = error && error.details && error.details.conflict || ownedTurn && ownedTurn.conflict
      var aborted = !graphChanged && error && (error.name === 'AbortError' || error.code === 'ABORTED')
      var reason = graphChanged
        ? 'The graph changed while the assistant was working, so it stopped. The changes it had already made were kept.' +
          (conflict && conflict.description ? ' Cause: ' + conflict.description + '.' : '') + ' Send a new message to continue from the current graph.'
        : aborted ? 'Cancelled. The changes were discarded.' : String(error && error.message || error)
      // On a conflicted turn this commits instead of reverting, by design.
      if (!committed && ownedTurn && this.agent.turn === ownedTurn) this.agent.rollbackTurn()
      if (!committed && ownedTurn) this.messages = previousMessages
      this._setStatus(aborted ? 'idle' : 'error', aborted ? '' : reason)
      return { ok: false, error: reason, aborted: Boolean(aborted), conflict: conflict || null }
    } finally {
      if (ownedTurn && conflictAbort) ownedTurn.signal.removeEventListener('abort', conflictAbort)
      this.busy = false
      this._controller = null
      this._emit()
    }
  }

  // `_tool` is kept on the block for the transcript UI but is not part of the
  // tool_result schema, so it comes off before the block goes back to the model.
  function stripLocal (block) {
    return { type: block.type, tool_use_id: block.tool_use_id, is_error: block.is_error, content: block.content }
  }

  AgentSession.prototype.dispose = function () {
    this._disposed = true
    this.cancel()
    if (this.agent && typeof this.agent.dispose === 'function') this.agent.dispose()
  }

  AgentSession.stripLocal = stripLocal
  AgentSession.textOf = textOf
  PandaUI.AgentSession = AgentSession
})(typeof window !== 'undefined' ? window : globalThis)
