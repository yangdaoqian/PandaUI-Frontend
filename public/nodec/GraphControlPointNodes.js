/* global PandaUI */
// Native frontend setter nodes. GH read nodes retain their original GUIDs and
// are registered by the normal catalog; these edits are not fictitious GH IDs.
(function (PandaUI, root) {
  function values (value) {
    if (value?._isDualData) value = value.display?.treeData || value.raw
    if (Array.isArray(value)) return value
    return root.PandaUIKernel.DataTree.from(value).values()
  }
  for (const kind of ['curve', 'surface']) {
    const title = kind === 'curve' ? 'Set Curve Control Points' : 'Set Surface Control Points'
    function Setter () {
      this.addInput('Geometry', kind === 'curve' ? 'curve,line' : 'surface,brep')
      this.addInput('Points', 'point')
      this.addInput('Indices', 'integer')
      this.addInput('Weights', 'number')
      this.addOutput('Geometry', kind === 'curve' ? 'curve' : 'surface,brep')
      this.addOutput('Points', 'point')
      this.addOutput('Weights', 'number')
      this.size = [220, 110]
    }
    Setter.title = title
    Setter.desc = 'Edits one geometry using a point list. Optional indices select sparse edits; optional weights replace weights. NURBS degree and knots are preserved. Feed encoded NodeC geometry or an inline line/polyline.'
    Setter.prototype.onExecute = async function () {
      const context = this.getActiveExecutionContext?.()
      const geometry = values(this.getInputData(0))
      const points = values(this.getInputData(1))
      if (geometry.length !== 1) throw new Error('Supply exactly one geometry to ' + title + '.')
      const positions = points.flatMap(value => {
        if (value?.kind === 'structRef') value = value.data
        const xyz = value?.__geo === 'panda.point' ? value.data : value
        if (!Array.isArray(xyz) || xyz.length !== 3 || !xyz.every(Number.isFinite)) throw new Error('Points must be Cartesian XYZ points.')
        return xyz
      })
      const indices = this.inputs[2].link == null ? undefined : values(this.getInputData(2))
      const weights = this.inputs[3].link == null ? undefined : values(this.getInputData(3))
      if (!this._controlPointClient) {
        const { default: Client } = await import('/nodec/NodeCClient.mjs')
        if (context?.signal.aborted || context?.isCurrent && !context.isCurrent()) throw new DOMException('Control point node cancelled.', 'AbortError')
        this._controlPointClient = new Client()
      }
      const result = await this._controlPointClient.run('node.execute', {
        kind: 'controlPoints:' + (kind === 'curve' ? 'setCurve' : 'setSurface'),
        geometry: geometry[0], positions, indices, weights
      }, { signal: context?.signal })
      if (context?.signal.aborted || context?.isCurrent && !context.isCurrent()) throw new DOMException('Control point node cancelled.', 'AbortError')
      const publish = (index, tree) => this.setOutputData(index, root.PandaUIBuildNativeNodeOutput ? root.PandaUIBuildNativeNodeOutput(this, index, tree) : tree)
      publish(0, { path: ['{0}'], datas: [result.value], previews: [result.preview] })
      publish(1, { path: result.controlPoints.points.map(() => '{0}'), datas: result.controlPoints.points.map(data => ({ __geo: 'panda.point', data })) })
      this.setOutputData(2, { path: result.controlPoints.points.map(() => '{0}'), datas: Array.from(result.controlPoints.weights) })
      this._executionBackend = 'nodec-wasm'
    }
    Setter.prototype.onRemoved = function () { this._controlPointClient?.dispose(); this._controlPointClient = null }
    const type = 'NodeC/Edit/' + title.replace(/ /g, '_')
    PandaUI.registerNode(type, Setter)
    PandaUI.registerSearchboxExtra?.(type, title, null)
  }
})(PandaUI, typeof window !== 'undefined' ? window : globalThis)
