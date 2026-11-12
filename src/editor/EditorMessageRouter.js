export function createEditorMessageRouter (handlers, { getFrame, getOrigin, onError = console.error }) {
  const routes = new Map(Object.entries(handlers))
  return async function dispatchEditorMessage (event) {
    const source = getFrame()?.contentWindow
    if (!source || event.source !== source || event.origin !== getOrigin()) return false
    const message = event.data
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return false
    if (message.version != null && message.version !== 1) return false
    const handler = routes.get(message.type)
    if (!handler) return false
    try {
      await handler(message)
      return true
    } catch (error) {
      onError(error, message.type)
      return false
    }
  }
}
