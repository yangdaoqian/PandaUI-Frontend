(function (root, factory) {
  var api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.PandaUIKernel = root.PandaUIKernel || {}
  root.PandaUIKernel.DependencyGraph = api.DependencyGraph
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function DependencyGraph (graph) {
    this.graph = graph || null
    this.nodes = []
    this.nodeById = new Map()
    this.incoming = new Map()
    this.outgoing = new Map()
    this.cycleNodeIds = []
    this.warnings = []
    this.dirty = true
    this.cachedOrder = null
    this.rebuildCount = 0
    if (graph) this.rebuild(graph)
  }

  DependencyGraph.prototype.rebuild = function (graph) {
    this.dirty = false
    this.cachedOrder = null
    this.rebuildCount++
    this.graph = graph || this.graph
    this.nodes = this.graph && Array.isArray(this.graph._nodes) ? this.graph._nodes.slice() : []
    this.nodeById = new Map()
    this.incoming = new Map()
    this.outgoing = new Map()
    this.cycleNodeIds = []
    this.warnings = []

    this.nodes.forEach(function (node) {
      this.nodeById.set(String(node.id), node)
      this.incoming.set(String(node.id), new Set())
      this.outgoing.set(String(node.id), new Set())
    }, this)

    ;(this.graph ? Array.from(this.graph.links.values()) : []).forEach(function (link) {
      if (!link) return
      var sourceId = String(link.origin_id)
      var targetId = String(link.target_id)
      if (!this.nodeById.has(sourceId) || !this.nodeById.has(targetId)) return
      this.outgoing.get(sourceId).add(targetId)
      this.incoming.get(targetId).add(sourceId)
    }, this)
    return this
  }

  DependencyGraph.prototype.topologicalOrder = function () {
    if (this.dirty) this.rebuild(this.graph)
    if (this.cachedOrder) return this.cachedOrder
    var indegree = new Map()
    this.nodes.forEach(function (node) {
      var id = String(node.id)
      indegree.set(id, this.incoming.get(id).size)
    }, this)

    var ready = this.nodes.filter(function (node) { return indegree.get(String(node.id)) === 0 })
    var ordered = []
    for (var readyIndex = 0; readyIndex < ready.length; readyIndex++) {
      var node = ready[readyIndex]
      var nodeId = String(node.id)
      ordered.push(node)
      this.outgoing.get(nodeId).forEach(function (targetId) {
        indegree.set(targetId, indegree.get(targetId) - 1)
        if (indegree.get(targetId) === 0) ready.push(this.nodeById.get(targetId))
      }, this)
    }

    if (ordered.length !== this.nodes.length) {
      var orderedIds = new Set(ordered.map(function (node) { return String(node.id) }))
      var cyclic = this.nodes.filter(function (node) { return !orderedIds.has(String(node.id)) })
      this.cycleNodeIds = cyclic.map(function (node) { return node.id })
      this.warnings = ['Dependency cycle detected: ' + this.cycleNodeIds.join(', ')]
      ordered = ordered.concat(cyclic)
    } else {
      this.cycleNodeIds = []
      this.warnings = []
    }
    this.cachedOrder = ordered
    return ordered
  }

  DependencyGraph.prototype.walk = function (nodeOrId, direction, includeSeed) {
    if (this.dirty) this.rebuild(this.graph)
    var seedId = String(nodeOrId && nodeOrId.id != null ? nodeOrId.id : nodeOrId)
    if (!this.nodeById.has(seedId)) return []
    var adjacency = direction === 'upstream' ? this.incoming : this.outgoing
    var visited = new Set()
    var queue = [seedId]
    var result = []
    for (var queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      var currentId = queue[queueIndex]
      if (visited.has(currentId)) continue
      visited.add(currentId)
      if (includeSeed || currentId !== seedId) result.push(this.nodeById.get(currentId))
      adjacency.get(currentId).forEach(function (nextId) { if (!visited.has(nextId)) queue.push(nextId) })
    }
    return result
  }

  DependencyGraph.prototype.downstream = function (nodeOrId, includeSeed) {
    return this.walk(nodeOrId, 'downstream', includeSeed)
  }

  DependencyGraph.prototype.upstream = function (nodeOrId, includeSeed) {
    return this.walk(nodeOrId, 'upstream', includeSeed)
  }
  DependencyGraph.prototype.invalidate = function () {
    this.dirty = true
    this.cachedOrder = null
    this.nodes = []
    this.nodeById.clear()
    this.incoming.clear()
    this.outgoing.clear()
    this.cycleNodeIds = []
    this.warnings = []
  }

  return { DependencyGraph: DependencyGraph }
})
