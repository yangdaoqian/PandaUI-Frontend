// View-only changes share the control-point source/worker and resource lifetime.
// They never create geometry edits, bake objects or touch the analytical cage.
export default class SubDDisplayController {
  constructor (controlPoints) { this.controls = controlPoints; this.pending = null }

  async apply (mode, selected, all = false) {
    if (!['smooth', 'mesh'].includes(mode)) throw new Error('Choose Smooth or Mesh.')
    if (this.controls.busy) throw new Error('Wait for the control point operation to finish.')
    this.pending?.abort()
    const pending = new AbortController()
    this.pending = pending
    const { services } = this.controls
    const targets = []
    const selectedRoot = this.controls.target(selected)
    for (const doc of services.getModelDocuments()) {
      if (doc.disposed) continue
      doc.three?.middleground?.traverse(root => {
        if (root.userData?.geometryType === 'SubD' && this.controls.documentFor(root) === doc && (all || root === selectedRoot || selected?.getObjectById(root.id))) targets.push([doc, root])
      })
    }
    if (!targets.length) throw new Error('Select an imported SubD object first.')
    let updated = 0
    try {
      for (const [doc, root] of targets) {
        if (doc.localImportInProgress || doc.remeshStream) throw new Error('Wait for the model to finish loading.')
        const source = await services.source.read(doc, root, { signal: pending.signal })
        const prepared = await services.source.prepare(doc, root, source, { signal: pending.signal, subdDisplayMode: mode })
        try {
          services.source.apply(doc, root, source, prepared, { displayOnly: true })
          root.userData.subdDisplayMode = mode
          updated++
          services.refreshSelectionHighlight()
          services.setDirtyFlag()
        } finally { prepared.dispose() }
      }
      return updated
    } finally { if (this.pending === pending) this.pending = null }
  }

  dispose () { this.pending?.abort(); this.pending = null }
}
