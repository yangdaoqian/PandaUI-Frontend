(function (global) {
  'use strict'

  var defaultTokens = 6000
  var maximumBytes = 48 * 1024
  var maximumMessages = 48

  function budget (value) { return Math.max(2000, Math.min(16000, Math.round(Number(value) || defaultTokens))) }
  function measure (value) {
    var json = typeof value === 'string' ? value : JSON.stringify(value)
    var bytes = 0
    var ascii = 0
    var unicode = 0
    for (var character of json) {
      var code = character.codePointAt(0)
      bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4
      if (code < 128) ascii++
      else unicode++
    }
    return { bytes: bytes, tokens: Math.ceil(ascii / 4 + unicode * 1.5) }
  }
  function textOf (content) {
    if (typeof content === 'string') return content
    return (content || []).filter(function (block) { return block && block.type === 'text' }).map(function (block) { return block.text || '' }).join('\n')
  }
  function userRequest (message) {
    return message && message.role === 'user' && (typeof message.content === 'string' ||
      Array.isArray(message.content) && !message.content.some(function (block) { return block.type === 'tool_result' }))
  }
  function readable (message) {
    if (typeof message.content === 'string') return message.content
    return (message.content || []).map(function (block) {
      if (block.type === 'text') return block.text
      if (block.type === 'tool_use') return 'Tool request ' + block.name + ': ' + JSON.stringify(block.input)
      if (block.type === 'tool_result') return 'Tool result ' + (block._tool || block.tool_use_id) + (block.is_error ? ' (error): ' : ': ') + (typeof block.content === 'string' ? block.content : JSON.stringify(block.content))
      return ''
    }).filter(Boolean).join('\n')
  }
  function excerpt (value, count) {
    var text = String(value == null ? '' : value)
    return text.length <= count ? text : text.slice(0, count) + ' … [excerpt; use read_history for exact details]'
  }
  function outcome (block) {
    var content = block.content
    try {
      var value = JSON.parse(content)
      if (value && Array.isArray(value.nodes) && value.generation != null) {
        var problems = value.nodes.filter(function (node) { return node.state === 'error' || node.error || node.messages && (node.messages.errors || []).length })
        return JSON.stringify({ generation: value.generation, totalNodes: value.nodes.length, errors: problems.slice(0, 4) })
      }
      if (value && value.totalNodes != null) return JSON.stringify({ documentId: value.documentId, revision: value.revision, totalNodes: value.totalNodes, totalLinks: value.totalLinks })
      if (value && value.total != null && Array.isArray(value.nodes)) return JSON.stringify({ matches: value.total, types: value.nodes.slice(0, 4).map(function (node) { return node.type }) })
    } catch (ignored) {}
    return typeof content === 'string' ? content : JSON.stringify(content)
  }
  function wireMessage (message, index) {
    if (!Array.isArray(message.content)) return { role: message.role, content: message.content }
    return { role: message.role, content: message.content.map(function (block) {
      if (block.type !== 'tool_result') return block
      var content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
      if (measure(content).bytes > 6000) {
        content = JSON.stringify({
          excerpt: excerpt(outcome(block), 1600),
          truncated: true, historyMessage: index,
          retrieve: 'Use read_history with messageIndex ' + index + ', offset 0; follow nextOffset for exact details.'
        })
      }
      return { type: block.type, tool_use_id: block.tool_use_id, is_error: block.is_error, content: content }
    }) }
  }
  function graphState (agent) {
    if (!agent || typeof agent.get_graph !== 'function') return null
    var response = agent.get_graph({ limit: 6 })
    if (!response || response.is_error || !response.result) return null
    var state = response.result
    return {
      documentId: state.documentId, revision: state.revision, totalNodes: state.totalNodes, totalLinks: state.totalLinks,
      sample: state.nodes.map(function (node) { return { id: node.id, type: node.type, title: node.title } })
    }
  }
  function checkpoint (messages, cut, latestUser, agent, tokenBudget) {
    var requests = []
    var replies = []
    var results = []
    messages.slice(0, cut).forEach(function (message, index) {
      if (userRequest(message) && index !== latestUser) requests.push('#' + index + ' ' + excerpt(textOf(message.content), 500))
      if (message.role === 'assistant' && textOf(message.content)) replies.push('#' + index + ' ' + excerpt(textOf(message.content), 250))
      if (Array.isArray(message.content)) message.content.forEach(function (block) {
        if (block.type === 'tool_result') results.push('#' + index + ' ' + (block._tool || block.tool_use_id) + (block.is_error ? ' ERROR: ' : ': ') + excerpt(outcome(block), 450))
      })
    })
    var lines = [
      'Conversation checkpoint (excerpts, not a complete specification). Original messages remain available through read_history.',
      'Read relevant archived requests before relying on earlier dimensions or constraints. Do not repeat completed edits without checking the current graph.',
      'Archived messages: 0 through ' + (cut - 1) + '.',
      'Current graph (authoritative; use get_graph for details): ' + JSON.stringify(graphState(agent))
    ]
    var notes = []
    if (requests.length) notes.push('Initial request: ' + requests[0])
    requests.slice(-4).forEach(function (entry) { if (!requests.length || entry !== requests[0]) notes.push('Recent request: ' + entry) })
    results.slice(-8).forEach(function (entry) { notes.push('Tool outcome: ' + entry) })
    replies.slice(-2).forEach(function (entry) { notes.push('Previous reply: ' + entry) })
    var noteTokens = 0
    var noteLimit = Math.min(1200, Math.floor(tokenBudget * 0.3))
    notes.forEach(function (entry) {
      var tokens = measure(entry).tokens
      if (noteTokens + tokens <= noteLimit) { lines.push(entry); noteTokens += tokens }
    })
    if (latestUser < cut && latestUser >= 0) lines.push('Current user request (verbatim):\n' + textOf(messages[latestUser].content))
    lines.push('Continue the current request using this checkpoint and the recent messages. Retrieve archived details if needed.')
    return { role: 'user', content: lines.join('\n') }
  }
  function metrics (messages) {
    var size = { bytes: 0, tokens: 0 }
    messages.forEach(function (message) {
      var measured = measure(JSON.stringify(message.content))
      size.bytes += measured.bytes
      size.tokens += measured.tokens + 8
    })
    return size
  }
  function prepare (messages, options) {
    options = options || {}
    var tokenBudget = budget(options.tokens)
    var entries = messages.map(wireMessage)
    var sizes = entries.map(function (entry) { return metrics([entry]) })
    var suffix = new Array(entries.length + 1)
    suffix[entries.length] = { bytes: 0, tokens: 0 }
    for (var index = entries.length - 1; index >= 0; index--) {
      suffix[index] = { bytes: sizes[index].bytes + suffix[index + 1].bytes, tokens: sizes[index].tokens + suffix[index + 1].tokens }
    }
    var latestUser = -1
    messages.forEach(function (message, index) { if (userRequest(message)) latestUser = index })
    var shortened = messages.reduce(function (count, message) {
      return count + (Array.isArray(message.content) ? message.content.filter(function (block) {
        return block.type === 'tool_result' && measure(typeof block.content === 'string' ? block.content : JSON.stringify(block.content)).bytes > 6000
      }).length : 0)
    }, 0)
    function fits (size, count) { return size.tokens <= tokenBudget && size.bytes <= maximumBytes && count <= maximumMessages }
    if (fits(suffix[0], entries.length)) return { messages: entries, stats: { estimatedTokens: suffix[0].tokens, bytes: suffix[0].bytes, budgetTokens: tokenBudget, archivedMessages: 0, shortenedResults: shortened } }
    for (var cut = 1; cut <= entries.length; cut++) {
      if (cut < entries.length && !userRequest(messages[cut]) && messages[cut].role !== 'assistant') continue
      if (!fits(suffix[cut], entries.length - cut + 1)) continue
      var memory = checkpoint(messages, cut, latestUser, options.agent, tokenBudget)
      var memorySize = metrics([memory])
      var size = { bytes: suffix[cut].bytes + memorySize.bytes, tokens: suffix[cut].tokens + memorySize.tokens }
      if (!fits(size, entries.length - cut + 1)) continue
      return {
        messages: [memory].concat(entries.slice(cut)),
        stats: { estimatedTokens: size.tokens, bytes: size.bytes, budgetTokens: tokenBudget, archivedMessages: cut, shortenedResults: shortened }
      }
    }
    throw new Error('The current message alone is too large for the selected context budget. Split the message or increase Context budget; your saved conversation is unchanged.')
  }
  function readHistory (messages, input) {
    input = input || {}
    if (input.messageIndex != null) {
      var index = Number(input.messageIndex)
      if (!Number.isInteger(index) || index < 0 || index >= messages.length) return { is_error: true, error: { code: 'MESSAGE_NOT_FOUND', message: 'Use a saved message index from 0 to ' + (messages.length - 1) + '.' } }
      var content = readable(messages[index])
      var offset = Math.max(0, Math.floor(Number(input.offset) || 0))
      var length = Math.max(200, Math.min(4000, Math.floor(Number(input.limit) || 3000)))
      var chunk = content.slice(offset, offset + length)
      while (measure(chunk).tokens > 700 || measure(chunk).bytes > 3000) chunk = chunk.slice(0, Math.floor(chunk.length * 0.8))
      return { is_error: false, result: { messageIndex: index, role: messages[index].role, text: chunk, totalCharacters: content.length, nextOffset: offset + chunk.length < content.length ? offset + chunk.length : null } }
    }
    var query = String(input.query || '').toLowerCase()
    var matches = []
    messages.forEach(function (message, index) {
      if (Array.isArray(message.content) && message.content.some(function (block) { return block._tool === 'read_history' || block.name === 'read_history' })) return
      var content = readable(message)
      var position = query ? content.toLowerCase().indexOf(query) : 0
      if (position >= 0) matches.push({ messageIndex: index, role: message.role, characterOffset: Math.max(0, position - 60), excerpt: excerpt(content.slice(Math.max(0, position - 60)), 180) })
    })
    var start = Math.max(0, Math.floor(Number(input.offset) || 0))
    return { is_error: false, result: { total: matches.length, messages: matches.slice(start, start + 3), nextOffset: start + 3 < matches.length ? start + 3 : null } }
  }

  var api = { prepare: prepare, readHistory: readHistory, measure: measure, budget: budget }
  if (typeof module === 'object' && module.exports) module.exports = api
  else global.PandaUI.ConversationContext = api
})(typeof window !== 'undefined' ? window : globalThis)
