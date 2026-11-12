export default class ModelFileDrop {
  constructor ({ owner = document, frame, onFiles, onActive, delegate }) {
    this.owner = owner
    this.frame = frame
    this.onFiles = onFiles
    this.onActive = onActive
    this.delegate = delegate
    this.documents = new Set()
    this.depths = new Map()
    this.active = false
    this.listeners = {
      dragenter: event => this.enter(event),
      dragover: event => this.over(event),
      dragleave: event => this.leave(event),
      drop: event => this.drop(event),
      dragend: () => this.reset(),
      keydown: event => { if (event.key === 'Escape') this.reset() }
    }
    this.frameLoaded = () => this.attachEditor()
    this.frame?.addEventListener('load', this.frameLoaded)
    this.listen(owner)
    this.attachEditor()
  }

  isFileDrag (event) {
    const transfer = event.dataTransfer
    return Array.from(transfer?.types || []).includes('Files') || Array.from(transfer?.items || []).some(item => item.kind === 'file') || transfer?.files?.length > 0
  }

  listen (owner) {
    if (!owner || this.documents.has(owner)) return
    for (const [type, listener] of Object.entries(this.listeners)) owner.addEventListener(type, listener, true)
    this.documents.add(owner)
  }

  detach (owner) {
    for (const [type, listener] of Object.entries(this.listeners)) owner.removeEventListener(type, listener, true)
    this.documents.delete(owner)
    this.depths.delete(owner)
  }

  attachEditor () {
    this.reset()
    for (const owner of this.documents) if (owner !== this.owner) this.detach(owner)
    this.listen(this.frame?.contentDocument)
  }

  setActive (active) {
    if (this.active === active) return
    this.active = active
    this.onActive(active)
  }

  enter (event) {
    if (!this.isFileDrag(event)) return
    event.preventDefault()
    const owner = event.currentTarget
    this.depths.set(owner, (this.depths.get(owner) || 0) + 1)
    this.setActive(true)
  }

  over (event) {
    if (!this.isFileDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    this.setActive(true)
  }

  leave (event) {
    if (!this.active) return
    const owner = event.currentTarget
    this.depths.set(owner, event.relatedTarget == null ? 0 : Math.max(0, (this.depths.get(owner) || 0) - 1))
    if (![...this.depths.values()].some(depth => depth > 0)) this.setActive(false)
  }

  drop (event) {
    const files = Array.from(event.dataTransfer?.files || [])
    this.reset()
    if (!this.isFileDrag(event)) return
    event.preventDefault()
    if (this.delegate?.(event)) return
    event.stopImmediatePropagation()
    const directories = Array.from(event.dataTransfer?.items || []).some(item => item.webkitGetAsEntry?.()?.isDirectory)
    this.onFiles(files, directories)
  }

  reset () {
    this.depths.clear()
    this.setActive(false)
  }

  dispose () {
    this.frame?.removeEventListener('load', this.frameLoaded)
    for (const owner of this.documents) this.detach(owner)
    this.reset()
  }
}
