(function (PandaUI, global) {
  'use strict'
  var panels = { FILE: 'Files', DOCUMENT: 'Document Manager', HISTORY: 'History', LAYER: 'Layers', VIEW_PRESET: 'Views', CAMERA: 'Camera', VIEW: 'Display', MATERIAL: 'Materials', EDITOR: 'Editor', PLUGINS: 'Plugins' }
  var signature = ''
  Object.keys(panels).forEach(function (key) {
    function PanelNode () {
      this.properties = { panelId: key }
      this.size = [key === 'MATERIAL' || key === 'DOCUMENT' || key === 'EDITOR' ? 420 : 360, key === 'EDITOR' ? 660 : key === 'DOCUMENT' ? 560 : 480]
    }
    PanelNode.title = panels[key]
    PanelNode.desc = panels[key] + ' settings'
    PanelNode.prototype.panelId = key
    PanelNode.prototype.getMinimumSize = function () { return [300, 180] }
    PanelNode.prototype.computeSize = function () { return this.size }
    PanelNode.prototype.onExecute = function () {}
    PandaUI.registerNode('Panels/' + panels[key], PanelNode)
  })

  global.PandaUISyncPanelNodes = function (canvas, force) {
    if (!global.parent.PandaUIUpdatePanelNodes || !canvas || !canvas.graph) return
    var frame = global.frameElement.getBoundingClientRect()
    var bounds = canvas.canvas.getBoundingClientRect()
    var layouts = []
    canvas.graph._nodes.forEach(function (node) {
      if (!node.panelId) return
      layouts.push({
        panelId: node.panelId, nodeId: String(node.id),
        left: frame.left + bounds.left + (node.pos[0] + canvas.offset[0] + 4) * canvas.scale,
        top: frame.top + bounds.top + (node.pos[1] + canvas.offset[1] + 4) * canvas.scale,
        width: node.size[0] - 8, height: node.size[1] - 18, scale: canvas.scale,
        selected: Boolean(canvas.selected_nodes[node.id]),
        visible: canvas.isNodeVisible(node) && !(node.flags && node.flags.collapsed)
      })
    })
    var next = JSON.stringify(layouts)
    if (!force && signature === next) return
    signature = next
    global.parent.PandaUIUpdatePanelNodes(layouts)
  }

  global.PandaUIOpenPanelNode = function (key) {
    if (!panels[key] || !global.graph || !global.graphcanvas) return false
    var node = global.graph._nodes.find(function (candidate) { return candidate.panelId === key })
    if (!node) {
      node = global.graph.add(PandaUI.createNode('Panels/' + panels[key]))
      node.pos = global.graphcanvas.toGraph(100, 100)
      global.graph.commitHistory('add-panel-node')
    }
    node.flags = node.flags || {}
    node.flags.collapsed = false
    global.graphcanvas.setEditorMode(true)
    global.graphcanvas.selectNode(node)
    global.graphcanvas.fitView([node])
    global.PandaUISyncPanelNodes(global.graphcanvas, true)
    return true
  }
  global.PandaUIClosePanelNodes = function (key) {
    global.graph._nodes.slice().filter(function (node) { return node.panelId === key }).forEach(function (node) { global.graph.remove(node) })
    global.graph.commitHistory('remove-panel-node')
    global.PandaUISyncPanelNodes(global.graphcanvas, true)
  }
})(window.PandaUI, window)
