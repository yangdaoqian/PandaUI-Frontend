(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.CanvasRenderer = api.CanvasRenderer
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function CanvasRenderer (graphCanvas, ensureAttributes) {
    this.graphCanvas = graphCanvas
    this.ensureAttributes = ensureAttributes
    this.showStateOutline = false
    this.showStateBadge = false
  }

  CanvasRenderer.prototype.renderNode = function (node, context, drawNode) {
    var attributes = this.ensureAttributes(node).syncFromNode()
    var result = drawNode()
    this.drawNodeState(node, attributes, context)
    return result
  }

  CanvasRenderer.prototype.drawNodeState = function (node, attributes, context) {
    if (!node || !attributes || !context || !attributes.visible) return
    var style = attributes.getStyle()
    var titleHeight = 30
    var PandaUI = typeof window !== 'undefined' ? window.PandaUI : globalThis.PandaUI
    if (PandaUI && PandaUI.NODE_TITLE_HEIGHT) titleHeight = PandaUI.NODE_TITLE_HEIGHT
    var width = node.flags && node.flags.collapsed ? (node._collapsed_width || node.size[0]) : node.size[0]
    var bodyHeight = node.flags && node.flags.collapsed ? 0 : node.size[1]
    var totalHeight = bodyHeight + titleHeight
    var lowQuality = this.graphCanvas && this.graphCanvas.ds && this.graphCanvas.ds.scale < 0.5

    context.save()
    context.shadowColor = 'transparent'
    context.globalAlpha = 1
    if (this.showStateOutline && (!lowQuality || attributes.solutionState === 'warning' || attributes.solutionState === 'error')) {
      context.globalAlpha = attributes.selected ? 0.95 : 0.58
      context.strokeStyle = style.color
      context.lineWidth = attributes.selected ? 2 : 1.25
      context.strokeRect(0.5, -titleHeight + 0.5, Math.max(0, width - 1), Math.max(0, totalHeight - 1))
    }

    if (this.showStateBadge) {
      var badgeX = Math.max(12, width - 12)
      var badgeY = -titleHeight * 0.5
      context.globalAlpha = 1
      context.fillStyle = style.color
      context.beginPath()
      context.arc(badgeX, badgeY, attributes.solutionState === 'computing' ? 5 : 4, 0, Math.PI * 2)
      context.fill()
      var messageCount = attributes.runtimeMessageCount()
      if (messageCount > 0 && !lowQuality) {
        context.font = 'bold 9px Arial'
        context.textAlign = 'right'
        context.textBaseline = 'middle'
        context.fillText(String(messageCount), badgeX - 7, badgeY)
      }
    }
    context.restore()
  }

  return { CanvasRenderer: CanvasRenderer }
})
