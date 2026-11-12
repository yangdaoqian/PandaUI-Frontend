import { reactive } from 'vue'

export default class ViewportOverlayState {
  #actions = new Map()
  #timer = null
  state = reactive({ menu: null, selection: null, modeling: null, pointer: '', status: '', gpu: null })

  setActions (actions) { this.#actions = new Map(Object.entries(actions)) }
  dispatch (action) { return this.#actions.get(action.type)?.(action) }
  showMenu (items, x, y) { this.state.menu = { items, x, y } }
  hideMenu () { this.state.menu = null }
  showSelection (rows, x, y) {
    this.clearSelection()
    this.state.selection = { rows, x: x + 12, y: y + 12 }
    this.#timer = setTimeout(() => this.clearSelection(), 1000)
  }
  clearSelection () { clearTimeout(this.#timer); this.#timer = null; this.state.selection = null }
  dispose () { this.clearSelection(); this.hideMenu(); this.state.modeling = null; this.state.status = ''; this.#actions.clear() }
}
