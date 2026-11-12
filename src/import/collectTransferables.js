// Build the transfer list once; copying it during traversal becomes quadratic
// for Breps containing thousands of separate cached face meshes.
export default function collectTransferables (value) {
  const buffers = new Set(), visited = new Set()
  function collect (item) {
    if (item instanceof ArrayBuffer) buffers.add(item)
    else if (ArrayBuffer.isView(item)) buffers.add(item.buffer)
    else if (item && typeof item === 'object' && !visited.has(item)) {
      visited.add(item)
      Object.values(item).forEach(collect)
    }
  }
  collect(value)
  return [...buffers]
}
