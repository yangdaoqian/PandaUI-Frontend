(function (root, factory) {
  var api = factory(root)
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.Param = api.Param
})(typeof window !== 'undefined' ? window : globalThis, function (global) {
  function createPort (node, direction, index, name, type, options) {
    var port = Object.assign({
      owner: node,
      direction: direction,
      index: index,
      name: name || (direction === 'input' ? 'in' : 'out'),
      type: type == null ? 0 : type,
      rawValue: undefined,
      previewAttributes: { visible: direction === 'output', meshVisible: true, wireVisible: true }
    }, direction === 'input' ? { link: null, links: [], data: undefined } : { links: [], _data: undefined }, options || {})
    port.previewAttributes = Object.assign({ visible: direction === 'output', meshVisible: true, wireVisible: true }, port.previewAttributes)
    port.getPreviewAttributes = function () {
      var settings = this.owner.getNodeAttributes().previewSettings()
      return {
        visible: settings.visible !== false && this.previewAttributes.visible !== false,
        meshVisible: settings.meshVisible !== false && this.previewAttributes.meshVisible !== false,
        wireVisible: settings.wireVisible !== false && this.previewAttributes.wireVisible !== false
      }
    }
    port.setPreviewAttributes = function (attributes) { Object.assign(this.previewAttributes, attributes || {}); return this }
    port.dispatchPreview = function (action, role) {
      var attributes = this.getPreviewAttributes()
      return typeof global.PandaUIParamPreviewDispatcher === 'function'
        ? global.PandaUIParamPreviewDispatcher(this, { action: action, role: role, visible: attributes.visible && (role === 'mesh' ? attributes.meshVisible : role === 'wire' ? attributes.wireVisible : true), attributes: attributes })
        : null
    }
    port.drawPreviewMesh = function () { var settings = this.getPreviewAttributes(); return !settings.visible || !settings.meshVisible ? null : this.dispatchPreview('draw', 'mesh') }
    port.drawPreviewWire = function () { var settings = this.getPreviewAttributes(); return !settings.visible || !settings.wireVisible ? null : this.dispatchPreview('draw', 'wire') }
    port.setPreviewVisibility = function (visible) { this.previewAttributes.visible = visible !== false; return this.dispatchPreview('visibility', null) }
    port.setPreviewMeshVisible = function (visible) { this.previewAttributes.meshVisible = visible !== false; return this.dispatchPreview('visibility', 'mesh') }
    port.setPreviewWireVisible = function (visible) { this.previewAttributes.wireVisible = visible !== false; return this.dispatchPreview('visibility', 'wire') }
    port.clearPreview = function (role) { return this.dispatchPreview('clear', role || null) }
    port.zoomPreview = function () { return this.dispatchPreview('zoom', null) }
    port.bakePreview = function () { return this.direction === 'output' ? this.dispatchPreview('bake', null) : null }
    port.refreshPreviewVisibility = function () {
      this.dispatchPreview('visibility', null)
      this.drawPreviewMesh()
      this.drawPreviewWire()
      return this
    }
    return port
  }

  function Param (options) {
    options = options || {}
    var port = createPort(options.owner, options.direction === 'output' ? 'output' : 'input', options.index || 0, options.name, options.type, options.attributes)
    Object.setPrototypeOf(port, Param.prototype)
    return port
  }
  return { Param: Param }
})
