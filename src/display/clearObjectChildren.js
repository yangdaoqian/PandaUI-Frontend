// Object3D.remove performs an index search and splice for every child. Detach
// an entire list in one pass while preserving parent links and removed events.
export default function clearObjectChildren (parent) {
  const children = parent.children.splice(0)
  for (const child of children) {
    if (child.parent !== parent) continue
    child.parent = null
    child.dispatchEvent({ type: 'removed' })
  }
}
