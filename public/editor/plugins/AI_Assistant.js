(function (PandaUI, global) {
  'use strict'

  // The AI assistant node. It renders as a chat panel (widgetUI 'chat', drawn by
  // WidgetControls) and drives the graph through a GraphAgent. It produces no
  // geometry of its own -- it edits the graph, and the nodes it adds do the work.

  function isBlock (block) {
    return block && typeof block === 'object' && typeof block.type === 'string'
  }

  function AiAssistant () {
    this.properties = { provider: 'claude', conversations: {}, conversation: [], contextTokenBudget: 6000, status: 'idle', lastError: '' }
    this.size = [420, 480]
    this._session = null
    this._agent = null
    this._configured = null
    this._providers = null
  }
  AiAssistant.title = 'AI Assistant'
  AiAssistant.desc = 'Describe what you want to model and let the assistant build the node graph.'
  AiAssistant.prototype.widgetUI = 'chat'
  AiAssistant.prototype.widgetContentTop = function () { return 12 }
  AiAssistant.prototype.getMinimumSize = function () { return [320, 300] }
  AiAssistant.prototype.computeSize = function () { this.onResize(); return this.size }
  AiAssistant.prototype.onResize = function () {
    var minimum = this.getMinimumSize()
    this.size[0] = Math.max(minimum[0], this.size[0])
    this.size[1] = Math.max(minimum[1], this.size[1])
  }

  // Conversations round-trip through the document, so a restored one is
  // untrusted input: drop anything that is not a well formed message.
  AiAssistant.prototype.onConfigure = function () {
    var settings = this.properties
    settings.provider = settings.provider === 'gpt' ? 'gpt' : 'claude'
    settings.contextTokenBudget = PandaUI.ConversationContext.budget(settings.contextTokenBudget)
    if (!settings.conversations || typeof settings.conversations !== 'object' || Array.isArray(settings.conversations)) settings.conversations = {}
    settings.status = 'idle'
    settings.lastError = ''
    settings.conversation = (Array.isArray(settings.conversation) ? settings.conversation : [])
      .filter(function (message) {
        if (!message || typeof message !== 'object') return false
        if (message.role !== 'user' && message.role !== 'assistant') return false
        return typeof message.content === 'string' || (Array.isArray(message.content) && message.content.every(isBlock))
      })
      .map(function (message) {
        return {
          role: message.role,
          at: Number.isFinite(message.at) ? message.at : Date.now(),
          content: message.content
        }
      })
    // A transcript must start on a user message and must not open with orphaned
    // tool results, or the next request is rejected.
    while (settings.conversation.length && settings.conversation[0].role !== 'user') settings.conversation.shift()
    while (settings.conversation.length && Array.isArray(settings.conversation[0].content) &&
      settings.conversation[0].content.some(function (block) { return block.type === 'tool_result' })) settings.conversation.shift()
    if (this._session) {
      this._session.messages = settings.conversation
      this._session.provider = settings.provider
      this._session.contextTokenBudget = settings.contextTokenBudget
    }
    this.updateBackendStatus()
    this.onResize()
  }

  // Built lazily: the node needs a graph, and a node restored from a document is
  // constructed before it is added to one.
  AiAssistant.prototype.session = function () {
    if (this._session) return this._session
    if (!this.graph || !PandaUI.GraphAgent || !PandaUI.AgentSession) return null
    this._agent = new PandaUI.GraphAgent(this.graph, { assistantNodeId: this.id })
    this._session = new PandaUI.AgentSession(this._agent, {
      messages: this.properties.conversation,
      provider: this.properties.provider,
      contextTokenBudget: this.properties.contextTokenBudget,
      onUpdate: this.onSessionUpdate.bind(this)
    })
    return this._session
  }

  AiAssistant.prototype.onSessionUpdate = function (session) {
    this.properties.conversation = session.messages
    this.properties.status = session.status
    this.properties.lastError = session.lastError
    this._contextStats = session.contextStats
    this._lastUsage = session.lastUsage
    if (typeof this.onChatUpdate === 'function') this.onChatUpdate()
    this.setDirtyCanvas()
  }

  AiAssistant.prototype.send = function (text) {
    var session = this.session()
    if (!session) return Promise.resolve({ ok: false, error: 'The assistant is not connected to a graph yet.' })
    return session.send(text)
  }
  AiAssistant.prototype.onPropertyChanged = function (name, value, previous) {
    if (name === 'contextTokenBudget') {
      if (this._session && this._session.busy || !Number.isFinite(value) || value !== PandaUI.ConversationContext.budget(value)) return false
      if (this._session) this._session.contextTokenBudget = value
      return
    }
    if (name !== 'provider') return
    if (value !== 'gpt' && value !== 'claude' || this._session && this._session.busy) return false
    if (value === previous) return
    this.properties.conversations[previous || 'claude'] = this.properties.conversation
    this.properties.conversation = this.properties.conversations[value] || []
    delete this.properties.conversations[value]
    this.properties.status = 'idle'
    this.properties.lastError = ''
    this._contextStats = null
    this._lastUsage = null
    if (this._session) {
      this._session.provider = value
      this._session.messages = this.properties.conversation
      this._session.status = 'idle'
      this._session.lastError = ''
      this._session.contextStats = null
      this._session.lastUsage = null
    }
  }
  AiAssistant.prototype.selectProvider = function (provider) {
    if (this.setProperty('provider', provider) === false) return false
    this.updateBackendStatus()
    this.checkBackend().then(function () { this.setDirtyCanvas() }.bind(this))
    if (typeof this.onChatUpdate === 'function') this.onChatUpdate()
    this.setDirtyCanvas()
    return true
  }
  AiAssistant.prototype.cancel = function () {
    if (this._session) this._session.cancel()
  }
  AiAssistant.prototype.clearConversation = function () {
    if (this._session && this._session.busy) return false
    this.properties.conversation = []
    this.properties.lastError = ''
    this.properties.status = 'idle'
    this._contextStats = null
    this._lastUsage = null
    if (this._session) { this._session.messages = this.properties.conversation; this._session.lastError = ''; this._session.status = 'idle'; this._session.contextStats = null; this._session.lastUsage = null }
    if (typeof this.onChatUpdate === 'function') this.onChatUpdate()
    this.setDirtyCanvas()
    return true
  }

  // Cached so the widget can show a clear "not configured" state instead of
  // letting the first message fail.
  AiAssistant.prototype.checkBackend = function () {
    var node = this
    return fetch('/api/ai/status')
      .then(function (response) { return response.ok ? response.json() : { configured: false } })
      .then(function (body) {
        node._providers = body && body.providers || { claude: { configured: Boolean(body && body.configured) }, gpt: { configured: false } }
        node.updateBackendStatus()
        return node._configured
      })
      .catch(function () { node._configured = false; return false })
  }
  AiAssistant.prototype.updateBackendStatus = function () {
    var provider = this._providers && this._providers[this.properties.provider]
    this._configured = provider ? Boolean(provider.configured) : null
  }

  AiAssistant.prototype.onRemoved = function () {
    if (this._session) this._session.dispose()
    this._session = null
    this._agent = null
  }

  AiAssistant.prototype.onExecute = function () {}

  PandaUI.registerNode('AI/Assistant', AiAssistant)
})(window.PandaUI, window)
