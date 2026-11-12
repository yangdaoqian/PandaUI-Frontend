export default class ViewportGestureRouter {
  constructor ({ frame, scene, getEditorMode, setEditorMode, canLeaveScene }) {
    Object.assign(this, { frame, scene, getEditorMode, setEditorMode, canLeaveScene })
    this.documents = new Set()
    this.forwarded = new WeakSet()
    this.gesture = null
    this.touchPointers = new Map()
    this.touchGesture = null
    this.touchEvaluationFrame = null
    this.touchLongPressTimer = null
    this.suppressClickUntil = 0
    this.suppressContextUntil = 0
    this.listeners = {
      pointerdown: event => this.down(event),
      pointermove: event => this.move(event),
      pointerup: event => this.up(event),
      pointercancel: event => { if (!this.forwarded.has(event)) event.pointerType === 'touch' ? this.touchCancel(event) : this.cancel() },
      touchmove: event => this.touchMoveEvent(event),
      touchend: event => this.touchEndEvent(event),
      touchcancel: event => this.touchEndEvent(event),
      contextmenu: event => this.contextMenu(event),
      click: event => this.click(event),
      dblclick: event => this.click(event),
      keydown: event => { if (event.key === 'Escape') this.cancel() }
    }
    this.visibilityChanged = () => { if (document.hidden) this.cancel() }
    this.windowBlur = () => {
      window.setTimeout(() => { if (!document.hasFocus()) this.cancel() }, 0)
    }
    document.addEventListener('visibilitychange', this.visibilityChanged)
    window.addEventListener('blur', this.windowBlur)
    this.listen(document)
    this.attachEditor()
  }

  listen (owner) {
    if (!owner || this.documents.has(owner)) return
    for (const [type, listener] of Object.entries(this.listeners)) owner.addEventListener(type, listener, true)
    this.documents.add(owner)
  }

  attachEditor () {
    this.cancel()
    for (const owner of this.documents) {
      if (owner === document) continue
      for (const [type, listener] of Object.entries(this.listeners)) owner.removeEventListener(type, listener, true)
      this.documents.delete(owner)
    }
    this.listen(this.frame?.contentDocument)
  }

  get graph () { return this.frame?.contentWindow?.graphcanvas }

  position (event) {
    const bounds = event.target?.ownerDocument === document ? { left: 0, top: 0 } : this.frame.getBoundingClientRect()
    return { x: event.clientX + bounds.left, y: event.clientY + bounds.top }
  }

  stop (event) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  dispatch (target, type, original, point = this.position(original)) {
    return this.dispatchWithOptions(target, type, original, point, {})
  }

  dispatchWithOptions (target, type, original, point, overrides) {
    const owner = target.ownerDocument.defaultView
    const bounds = owner === window ? { left: 0, top: 0 } : this.frame.getBoundingClientRect()
    const properties = { bubbles: true, cancelable: true, view: owner, clientX: point.x - bounds.left, clientY: point.y - bounds.top }
    for (const key of ['button', 'buttons', 'pointerId', 'pointerType', 'isPrimary', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'pressure']) properties[key] = original[key]
    Object.assign(properties, overrides)
    const event = type === 'contextmenu' ? new owner.MouseEvent(type, properties) : new owner.PointerEvent(type, properties)
    Object.defineProperty(event, 'pandauiForwardedGesture', { value: true })
    this.forwarded.add(event)
    target.dispatchEvent(event)
  }

  dispatchTouch (target, type, point) {
    const owner = target.ownerDocument.defaultView
    const points = Array.isArray(point) ? point : [point]
    const touchInit = points.map((entry, index) => ({ identifier: index + 1, target, clientX: entry.x, clientY: entry.y, screenX: entry.x, screenY: entry.y, pageX: entry.x, pageY: entry.y }))
    let event
    if (typeof owner.Touch === 'function' && typeof owner.TouchEvent === 'function') {
      const touches = touchInit.map(entry => new owner.Touch(entry))
      event = new owner.TouchEvent(type, { bubbles: true, cancelable: true, view: owner, touches: type === 'touchend' || type === 'touchcancel' ? [] : touches, targetTouches: type === 'touchend' || type === 'touchcancel' ? [] : touches, changedTouches: touches })
    } else {
      event = new owner.Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        touches: { value: type === 'touchend' || type === 'touchcancel' ? [] : touchInit },
        targetTouches: { value: type === 'touchend' || type === 'touchcancel' ? [] : touchInit },
        changedTouches: { value: touchInit }
      })
    }
    this.forwarded.add(event)
    target.dispatchEvent(event)
  }

  dispatchGraphWheel (point, deltaY) {
    const target = this.graph?.canvas
    if (!target) return
    const owner = target.ownerDocument.defaultView
    const event = new owner.WheelEvent('wheel', { bubbles: true, cancelable: true, view: owner, clientX: point.x, clientY: point.y, deltaX: 0, deltaY, deltaMode: 0 })
    this.forwarded.add(event)
    target.dispatchEvent(event)
  }

  down (event) {
    if (this.forwarded.has(event)) return
    if (event.pointerType === 'touch') { this.touchDown(event); return }
    if (this.gesture || event.pointerType !== 'mouse') return
    this.suppressClickUntil = 0
    this.suppressContextUntil = 0
    const graph = this.graph
    if (!graph || !this.scene) return
    const toGraph = event.target === this.scene && !this.getEditorMode() && event.button === 0 && event.buttons === 1 && this.canLeaveScene(event)
    const toScene = event.target === graph.canvas && this.getEditorMode() && event.button === 2 && event.buttons === 2
    if (!toGraph && !toScene) return
    this.gesture = { source: event.target, destination: toGraph ? graph.canvas : this.scene, toGraph, down: event, start: this.position(event), last: event, active: false }
    event.target.setPointerCapture(event.pointerId)
    this.stop(event)
  }

  move (event) {
    if (this.forwarded.has(event)) return
    if (event.pointerType === 'touch') { this.touchMove(event); return }
    const gesture = this.gesture
    if (this.forwarded.has(event) || !gesture || event.pointerId !== gesture.down.pointerId) return
    this.stop(event)
    gesture.last = event
    if ((event.buttons & (gesture.toGraph ? 1 : 2)) === 0) { this.cancel(); return }
    const point = this.position(event)
    if (!gesture.active && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= 4) {
      gesture.active = true
      this.setEditorMode(gesture.toGraph)
      this.graph.closeMenu()
      this.dispatch(gesture.destination, 'pointerdown', gesture.down, gesture.start)
    }
    if (gesture.active) this.dispatch(gesture.destination, 'pointermove', event, point)
  }

  up (event) {
    if (event.pointerType === 'touch') { this.touchUp(event); return }
    const gesture = this.gesture
    if (this.forwarded.has(event) || !gesture || event.pointerId !== gesture.down.pointerId) return
    this.stop(event)
    const target = gesture.active ? gesture.destination : gesture.source
    if (!gesture.active) this.dispatch(target, 'pointerdown', gesture.down, gesture.start)
    this.dispatch(target, 'pointerup', event)
    if (gesture.active) this.suppressClickUntil = performance.now() + 400
    if (gesture.down.button === 2) {
      this.suppressContextUntil = performance.now() + 400
      if (!gesture.active) this.dispatch(target, 'contextmenu', event)
    }
    this.release()
  }

  release () {
    const gesture = this.gesture
    this.gesture = null
    if (gesture?.source.hasPointerCapture(gesture.down.pointerId)) gesture.source.releasePointerCapture(gesture.down.pointerId)
  }

  cancel () {
    this.clearTouchLongPressTimer()
    if (this.touchEvaluationFrame != null) {
      window.cancelAnimationFrame(this.touchEvaluationFrame)
      this.touchEvaluationFrame = null
    }
    if (this.touchGesture?.mode === 'left' || this.touchGesture?.mode === 'scene' || this.touchGesture?.mode === 'scene-pinch' || this.touchGesture?.mode === 'scene-native') {
      const gesture = this.touchGesture
      if (gesture.mode === 'scene' || gesture.mode === 'scene-pinch' || gesture.mode === 'scene-native') this.dispatchTouch(gesture.destination, 'touchcancel', gesture.mode === 'scene-pinch' ? this.touchPagePoints() : gesture.last)
      else {
        const original = this.touchMouseEvent(gesture.last, 1)
        this.dispatchWithOptions(gesture.destination, 'pointercancel', original, gesture.last, { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1, isPrimary: true })
      }
    }
    this.touchGesture = null
    this.touchPointers.clear()
    const gesture = this.gesture
    if (gesture?.active) {
      this.dispatch(gesture.destination, gesture.toGraph ? 'pointercancel' : 'pointerup', gesture.last)
      this.suppressClickUntil = performance.now() + 400
      this.suppressContextUntil = performance.now() + 400
    }
    this.release()
  }

  contextMenu (event) {
    if (this.forwarded.has(event)) return
    if (this.gesture?.down.button === 2 || (performance.now() < this.suppressContextUntil && this.isCanvas(event.target))) this.stop(event)
  }

  touchDown (event) {
    if (!this.touchGesture && this.touchPointers.size >= 2) this.touchPointers.clear()
    if (this.touchGesture && this.touchPointers.size >= 2) {
      const duplicate = Array.from(this.touchPointers.values()).some(pointer => pointer.target === event.target && Math.hypot(pointer.x - event.clientX, pointer.y - event.clientY) < 1.5)
      if (duplicate) return
      this.cancel()
      return
    }
    const page = this.position(event)
    this.touchPointers.set(event.pointerId, { event, x: event.clientX, y: event.clientY, pageX: page.x, pageY: page.y, target: event.target })
    if (this.touchGesture?.mode === 'scene-native' && this.touchPointers.size === 2) {
      this.clearTouchLongPressTimer()
      const point = this.touchPoint()
      this.touchGesture = { source: this.scene, start: point, last: point, startDistance: this.touchDistance(), mode: 'pending', destination: null, toGraph: false }
      return
    }
    if (this.touchPointers.size === 1) {
      if (event.target === this.scene) {
        if (this.getEditorMode()) {
          this.setEditorMode(false)
          this.graph?.closeMenu()
        }
        this.touchGesture = { source: event.target, start: page, last: page, startDistance: 0, mode: 'scene-native', destination: this.scene, toGraph: false }
        this.startTouchLongPressTimer(this.touchGesture)
      } else if (event.target === this.graph?.canvas && this.getEditorMode() && this.scene) {
        this.stop(event)
        this.touchGesture = { source: event.target, start: page, last: page, startDistance: 0, mode: 'scene-pending', destination: this.scene, toGraph: false }
        this.startTouchLongPressTimer(this.touchGesture)
      }
      return
    }
    if (this.touchGesture?.mode === 'scene-pending' && this.touchPointers.size === 2) {
      this.clearTouchLongPressTimer()
      this.stop(event)
      const point = this.touchPoint()
      this.touchGesture = { source: event.target, start: point, last: point, startDistance: this.touchDistance(), mode: 'pending', destination: null, toGraph: false }
      return
    }
    if (this.touchPointers.size !== 2 || this.touchGesture) return
    const entries = Array.from(this.touchPointers.values())
    const source = entries[0].target
    if (!this.isCanvas(source) || !this.graph) return
    this.clearTouchLongPressTimer()
    if (source !== this.scene) this.stop(event)
    const point = this.touchPoint()
    this.touchGesture = { source, start: point, last: point, startDistance: this.touchDistance(), mode: 'pending', destination: null, toGraph: false }
  }

  touchMove (event) {
    const pointer = this.touchPointers.get(event.pointerId)
    if (!pointer) return
    pointer.x = event.clientX
    pointer.y = event.clientY
    const page = this.position(event)
    pointer.pageX = page.x
    pointer.pageY = page.y
    if (!this.touchGesture) return
    const gesture = this.touchGesture
    const point = this.touchPoint()
    gesture.last = point
    this.cancelTouchLongPressIfMoved(gesture)
    if (gesture.mode === 'scene-pending') {
      this.stop(event)
      const pagePoint = this.touchPagePoint()
      gesture.last = pagePoint
      if (Math.hypot(pagePoint.x - gesture.start.x, pagePoint.y - gesture.start.y) >= 4) this.beginSceneTouchGesture(gesture)
    } else if (gesture.mode === 'pending') {
      if (gesture.source !== this.scene) this.stop(event)
      this.queueTouchGestureEvaluation()
    }
    if (gesture.mode === 'long-press' || gesture.mode === 'scene-native') {
      if (gesture.mode === 'long-press') this.stop(event)
    } else if (gesture.mode === 'graph-pinch') {
      this.stop(event)
    } else if (gesture.mode === 'scene') {
      this.stop(event)
      this.dispatchTouch(gesture.destination, 'touchmove', gesture.last)
    } else if (gesture.mode === 'left') {
      this.stop(event)
      this.dispatchWithOptions(gesture.destination, 'pointermove', this.touchMouseEvent(point, 1), point, { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1, isPrimary: true })
    }
  }

  touchUp (event) {
    if (!this.touchPointers.has(event.pointerId)) return
    if (!this.touchGesture) {
      this.touchPointers.delete(event.pointerId)
      return
    }
    const gesture = this.touchGesture
    const point = gesture.mode === 'scene-pending' || gesture.mode === 'scene' ? this.touchPagePoint() : this.touchPoint()
    this.clearTouchLongPressTimer()
    if (gesture.mode === 'long-press') {
      this.stop(event)
    } else if (gesture.mode === 'scene-native') {
      // Keep the native Three.js touchend untouched after an ordinary scene gesture.
    } else if (gesture.mode === 'scene-pending') {
      this.stop(event)
      this.beginSceneTouchGesture(gesture, true)
      const destination = gesture.destination
      this.dispatchTouch(destination, 'touchstart', point)
      this.dispatchTouch(destination, 'touchend', point)
    } else if (gesture.mode === 'pending') {
      this.beginLeftTouchGesture(gesture, true)
      const destination = gesture.destination
      this.dispatchWithOptions(destination, 'pointerdown', this.touchMouseEvent(point, 1), point, { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1, isPrimary: true })
      this.dispatchWithOptions(destination, 'pointerup', this.touchMouseEvent(point, 0), point, { pointerType: 'mouse', button: 0, buttons: 0, pointerId: 1, isPrimary: true })
    } else if (gesture.mode === 'graph-pinch') {
      this.stop(event)
    } else if (gesture.mode === 'scene-pinch') {
      this.stop(event)
      this.dispatchTouch(gesture.destination, 'touchend', this.touchPagePoints())
    } else if (gesture.mode === 'scene') {
      this.stop(event)
      this.dispatchTouch(gesture.destination, 'touchend', point)
    } else if (gesture.mode === 'left') {
      this.stop(event)
      this.dispatchWithOptions(gesture.destination, 'pointerup', this.touchMouseEvent(point, 0), point, { pointerType: 'mouse', button: 0, buttons: 0, pointerId: 1, isPrimary: true })
    }
    this.suppressClickUntil = performance.now() + 400
    this.touchPointers.clear()
    this.touchGesture = null
  }

  touchCancel (event) {
    if (!this.touchPointers.has(event.pointerId)) return
    this.clearTouchLongPressTimer()
    this.stop(event)
    if (this.touchGesture?.mode === 'left' || this.touchGesture?.mode === 'scene' || this.touchGesture?.mode === 'scene-pinch' || this.touchGesture?.mode === 'scene-native') {
      if (this.touchGesture.mode === 'scene' || this.touchGesture.mode === 'scene-pinch') this.dispatchTouch(this.touchGesture.destination, 'touchcancel', this.touchGesture.mode === 'scene-pinch' ? this.touchPagePoints() : this.touchGesture.last)
      else if (this.touchGesture.mode === 'scene-native') this.dispatchTouch(this.touchGesture.destination, 'touchcancel', this.touchGesture.last)
      else {
        const original = this.touchMouseEvent(this.touchGesture.last, 1)
        this.dispatchWithOptions(this.touchGesture.destination, 'pointercancel', original, this.touchGesture.last, { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1, isPrimary: true })
      }
    }
    this.touchPointers.clear()
    this.touchGesture = null
    this.suppressClickUntil = performance.now() + 400
  }

  touchEndEvent (event) {
    if (event.touches?.length === 0 && this.touchGesture == null) this.touchPointers.clear()
  }

  touchMoveEvent (event) {
    if (this.forwarded.has(event)) return
    const gesture = this.touchGesture
    if (!gesture) return
    const entries = Array.from(this.touchPointers.values())
    const touches = Array.from(event.touches || [])
    if (touches.length === entries.length) {
      touches.forEach((touch, index) => {
        entries[index].x = touch.clientX
        entries[index].y = touch.clientY
        const page = this.touchPagePosition(entries[index].target, touch.clientX, touch.clientY)
        entries[index].pageX = page.x
        entries[index].pageY = page.y
      })
      if (gesture.mode === 'scene-pending') {
        const point = this.touchPagePoint()
        gesture.last = point
        if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= 4) this.beginSceneTouchGesture(gesture)
      } else {
        gesture.last = this.touchPoint()
        this.cancelTouchLongPressIfMoved(gesture)
        this.evaluateTouchGesture()
      }
    }
    if (this.touchGesture?.mode === 'long-press' || this.touchGesture?.mode === 'scene-native') {
      if (this.touchGesture.mode === 'long-press') this.stop(event)
    } else if (this.touchGesture?.mode === 'graph-pinch') {
      this.stop(event)
      this.dispatchGraphPinch()
    } else if (this.touchGesture?.mode === 'scene-pinch') {
      this.stop(event)
      this.dispatchTouch(this.touchGesture.destination, 'touchmove', this.touchPagePoints())
    } else if (this.touchGesture?.mode === 'scene') {
      this.stop(event)
      const point = this.touchPagePoint()
      this.touchGesture.last = point
      this.dispatchTouch(this.touchGesture.destination, 'touchmove', point)
    } else if (this.touchGesture?.mode === 'left') {
      this.stop(event)
      const point = this.touchPoint()
      this.touchGesture.last = point
      this.dispatchWithOptions(this.touchGesture.destination, 'pointermove', this.touchMouseEvent(point, 1), point, { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1, isPrimary: true })
    } else if (gesture.source !== this.scene && this.touchGesture?.mode === 'pending') this.stop(event)
  }

  queueTouchGestureEvaluation () {
    if (this.touchEvaluationFrame != null) return
    this.touchEvaluationFrame = window.requestAnimationFrame(() => {
      this.touchEvaluationFrame = null
      this.evaluateTouchGesture()
    })
  }

  startTouchLongPressTimer (gesture) {
    this.clearTouchLongPressTimer()
    gesture.longPressPending = true
    this.touchLongPressTimer = window.setTimeout(() => {
      this.touchLongPressTimer = null
      if (this.touchGesture !== gesture || !gesture.longPressPending || this.touchPointers.size !== 1) return
      this.triggerTouchLongPress(gesture)
    }, 550)
  }

  clearTouchLongPressTimer () {
    if (this.touchLongPressTimer != null) {
      window.clearTimeout(this.touchLongPressTimer)
      this.touchLongPressTimer = null
    }
    if (this.touchGesture) this.touchGesture.longPressPending = false
  }

  cancelTouchLongPressIfMoved (gesture) {
    if (!gesture?.longPressPending || gesture.longPressTriggered) return
    const point = gesture.source === this.scene || gesture.mode === 'scene-pending' ? this.touchPagePoint() : this.touchPoint()
    if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= 4) this.clearTouchLongPressTimer()
  }

  triggerTouchLongPress (gesture) {
    const point = this.touchPagePoint()
    gesture.longPressPending = false
    gesture.longPressTriggered = true
    gesture.mode = 'long-press'
    gesture.destination = gesture.source
    this.suppressClickUntil = performance.now() + 800
    this.suppressContextUntil = performance.now() + 1200
    if (gesture.source === this.scene) this.dispatchTouch(gesture.source, 'touchcancel', point)
    this.dispatchWithOptions(gesture.source, 'contextmenu', this.touchMouseEvent(point, 0), point, {
      button: 2,
      buttons: 0,
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true
    })
  }

  evaluateTouchGesture () {
    const gesture = this.touchGesture
    if (!gesture || gesture.mode !== 'pending') return
    const distanceDelta = Math.abs(this.touchDistance() - gesture.startDistance)
    if (distanceDelta >= 8) {
      if (gesture.source === this.scene) this.touchGesture = null
      else this.beginGraphPinchGesture(gesture)
      return
    }
    const point = this.touchPoint()
    if (Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >= 4) {
      gesture.last = point
      this.beginLeftTouchGesture(gesture)
    }
  }

  touchPoint () {
    const pointers = Array.from(this.touchPointers.values())
    return { x: pointers.reduce((sum, pointer) => sum + pointer.x, 0) / pointers.length, y: pointers.reduce((sum, pointer) => sum + pointer.y, 0) / pointers.length }
  }

  touchPagePoint () {
    const pointers = Array.from(this.touchPointers.values())
    return { x: pointers.reduce((sum, pointer) => sum + pointer.pageX, 0) / pointers.length, y: pointers.reduce((sum, pointer) => sum + pointer.pageY, 0) / pointers.length }
  }

  touchPagePoints () {
    return Array.from(this.touchPointers.values()).map(pointer => ({ x: pointer.pageX, y: pointer.pageY }))
  }

  dispatchGraphPinch () {
    const gesture = this.touchGesture
    if (!gesture || gesture.mode !== 'graph-pinch') return
    const distance = this.touchDistance()
    const delta = distance - gesture.lastDistance
    if (Math.abs(delta) < 0.1) return
    gesture.lastDistance = distance
    this.dispatchGraphWheel(this.touchPoint(), -delta * 2)
  }

  touchPagePosition (target, x, y) {
    const bounds = target?.ownerDocument === document ? { left: 0, top: 0 } : this.frame.getBoundingClientRect()
    return { x: x + bounds.left, y: y + bounds.top }
  }

  touchDistance () {
    const pointers = Array.from(this.touchPointers.values())
    if (pointers.length < 2) return 0
    return Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y)
  }

  beginLeftTouchGesture (gesture, click = false) {
    const entries = Array.from(this.touchPointers.values())
    this.cancelNativeTouch(gesture.source)
    entries.forEach(entry => this.dispatch(entry.target, 'pointercancel', entry.event))
    gesture.mode = 'left'
    gesture.toGraph = !click && gesture.source === this.scene && !this.getEditorMode() && this.canLeaveScene(this.touchMouseEvent(gesture.last, 1))
    gesture.destination = gesture.toGraph ? this.graph.canvas : gesture.source
    if (gesture.toGraph) {
      this.setEditorMode(true)
      this.graph.closeMenu()
    }
    if (!click) this.dispatchWithOptions(gesture.destination, 'pointerdown', this.touchMouseEvent(gesture.start, 1), gesture.start, { pointerType: 'mouse', button: 0, buttons: 1, pointerId: 1, isPrimary: true })
  }

  beginSceneTouchGesture (gesture, click = false) {
    this.clearTouchLongPressTimer()
    gesture.mode = 'scene'
    gesture.destination = this.scene
    this.setEditorMode(false)
    this.graph?.closeMenu()
    if (!click) this.dispatchTouch(gesture.destination, 'touchstart', gesture.start)
  }

  beginGraphPinchGesture (gesture) {
    gesture.mode = 'graph-pinch'
    gesture.destination = this.graph?.canvas
    gesture.lastDistance = gesture.startDistance
  }

  touchMouseEvent (point, buttons) {
    return { clientX: point.x, clientY: point.y, button: 0, buttons, pointerType: 'mouse', pointerId: 1, isPrimary: true, pressure: buttons ? 0.5 : 0 }
  }

  cancelNativeTouch (target) {
    const owner = target.ownerDocument.defaultView
    const event = new owner.Event('touchend', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'pandauiForwardedGesture', { value: true })
    target.dispatchEvent(event)
  }

  isCanvas (target) { return target === this.scene || target === this.graph?.canvas }

  click (event) {
    if (performance.now() < this.suppressClickUntil && this.isCanvas(event.target)) this.stop(event)
  }

  dispose () {
    this.cancel()
    for (const owner of this.documents) {
      for (const [type, listener] of Object.entries(this.listeners)) owner.removeEventListener(type, listener, true)
    }
    this.documents.clear()
    document.removeEventListener('visibilitychange', this.visibilityChanged)
    window.removeEventListener('blur', this.windowBlur)
  }
}
