(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.DocumentEventBus = api.DocumentEventBus
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function DocumentEventBus (document) {
    this.document = document
    this.sequence = 0
    this.listeners = new Map()
  }

  DocumentEventBus.prototype.on = function (eventName, handler) {
    if (typeof handler !== 'function') return this
    var name = String(eventName || '*')
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name).add(handler)
    return function () { this.off(name, handler) }.bind(this)
  }

  DocumentEventBus.prototype.off = function (eventName, handler) {
    var handlers = this.listeners.get(String(eventName || '*'))
    if (handlers) handlers.delete(handler)
    return this
  }

  DocumentEventBus.prototype.emit = function (eventName, detail) {
    var event = {
      type: String(eventName),
      sequence: ++this.sequence,
      timestamp: Date.now(),
      document: this.document,
      detail: detail || {}
    }
    this.dispatch(event.type, event)
    this.dispatch('*', event)
    return event
  }

  DocumentEventBus.prototype.dispatch = function (eventName, event) {
    var handlers = this.listeners.get(eventName)
    if (handlers) handlers.forEach(function (handler) { handler(event) })
  }

  DocumentEventBus.prototype.clear = function () {
    this.listeners.clear()
    return this
  }

  return { DocumentEventBus: DocumentEventBus }
})
