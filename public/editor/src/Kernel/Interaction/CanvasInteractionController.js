(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.CanvasInteractionController = api.CanvasInteractionController
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function CanvasInteractionController (graphCanvas, ensureAttributes) {
    this.graphCanvas = graphCanvas
    this.ensureAttributes = ensureAttributes
    this.pointer = { type: null, canvas: [0, 0], graph: [0, 0], button: 0 }
    this.dragMode = 'none'
    this.hoveredNodeId = null
  }

  CanvasInteractionController.prototype.handlePointer = function (type, event) {
    var canvas = this.graphCanvas
    this.pointer.type = type
    this.pointer.button = event && (event.which || event.button) || 0
    this.pointer.canvas = [event && event.clientX || 0, event && event.clientY || 0]
    this.pointer.graph = canvas && canvas.graph_mouse ? [canvas.graph_mouse[0], canvas.graph_mouse[1]] : [0, 0]
    this.dragMode = canvas && canvas.pointer && canvas.pointer.mode
      ? canvas.pointer.mode
      : (canvas && canvas.connecting ? 'connect' : 'none')
    this.syncNodeInteraction()
    this.emit('canvas-pointer-' + type, { event: event, pointer: this.pointer, dragMode: this.dragMode })
    return this
  }

  CanvasInteractionController.prototype.handleKey = function (event) {
    this.emit('canvas-key', { event: event })
    return this
  }

  CanvasInteractionController.prototype.syncNodeInteraction = function () {
    var canvas = this.graphCanvas
    var graph = canvas && canvas.graph
    if (!graph) return this
    var selected = canvas.selected_nodes || {}
    var hovered = canvas.hoveredNodeId == null ? null : String(canvas.hoveredNodeId)
    ;(graph._nodes || []).forEach(function (node) {
      var isHovered = hovered != null && String(node.id) === hovered
      this.ensureAttributes(node).syncFromNode().setInteractionState(!!selected[node.id] || node.is_selected === true, isHovered)
    }, this)
    this.hoveredNodeId = hovered
    return this
  }

  CanvasInteractionController.prototype.emit = function (eventName, detail) {
    var graph = this.graphCanvas && this.graphCanvas.graph
    var document = graph && graph.getGraphDocument ? graph.getGraphDocument() : null
    if (document && document.events) document.events.emit(eventName, detail)
  }

  return { CanvasInteractionController: CanvasInteractionController }
})
