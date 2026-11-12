// A placeholder must never look like a successful computation with empty outputs.
export class NativeNodeNotImplementedError extends Error {
  constructor (nodeId, nodeName, reasonCode, reason) {
    super(`${nodeName}: ${reason}`)
    this.name = 'NativeNodeNotImplementedError'
    this.code = 'FRONTEND_NOT_IMPLEMENTED'
    this.nodeId = nodeId
    this.reasonCode = reasonCode
    this.implementationStatus = 'placeholder'
    this.fallback = 'backend'
  }
}
