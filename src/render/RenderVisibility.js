// CAD wires may be native lines or triangle-based thick-line shaders.
export function isRenderEdge (object) {
  for (let current = object; current; current = current.parent) {
    const data = current.userData || {}
    if (data.surfaceWires || data.edgeLines || data.meshGeometryEdges || data.meshFaceEdges) return true
  }
  return false
}

export function isRenderCurve (object) {
  const attributes = object.geometry?.attributes
  return object.isLine || !!(object.isMesh && attributes?.end && attributes?.thickness && attributes?.side)
}

// Hide after render batches are prepared so sealed line batches are included.
// Restore the exact visibility state even when a draw or export fails.
export function withRenderVisibility (scenes, effects, draw) {
  const hidden = []
  try {
    for (const scene of scenes) {
      scene.traverse(object => {
        if (object.visible && (isRenderEdge(object) ? effects.showEdges !== true : isRenderCurve(object) && effects.showCurves === false)) {
          hidden.push(object); object.visible = false
        }
      })
    }
    return draw()
  } finally { hidden.forEach(object => { object.visible = true }) }
}
