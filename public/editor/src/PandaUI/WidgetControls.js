(function (global) {
  'use strict'

  function element (tag, className, text) {
    var control = document.createElement(tag)
    if (className) control.className = className
    if (text != null) control.textContent = text
    return control
  }

  function WidgetControl (node, canvas) {
    this.node = node
    this.canvas = canvas
    this.root = element('section', 'pandaui-widget-controls')
    this.root.dataset.nodeId = String(node.id)
    this.root.dataset.widget = node.widgetUI
    this.root.setAttribute('aria-label', node.title)
    this.bindings = []
    this.disposers = []
    this.pending = null
    this.root.addEventListener('pointerdown', function (event) {
      event.stopPropagation()
      canvas.closeMenu()
      if (event.button === 0) canvas.selectNode(node)
    })
    ;['click', 'dblclick', 'keydown', 'keyup'].forEach(function (type) {
      this.root.addEventListener(type, function (event) { event.stopPropagation() })
    }, this)
    this.root.addEventListener('wheel', function (event) { event.stopPropagation() })
    this.root.addEventListener('contextmenu', function (event) {
      if (event.target.matches('input, textarea')) return
      event.preventDefault()
      event.stopPropagation()
      canvas.showNodeMenu(event.clientX, event.clientY, node)
    })
    document.body.appendChild(this.root)
    try { this.renderWidgetUI() } catch (error) { this.dispose(); throw error }
  }

  WidgetControl.prototype.step = function () {
    return this.node.type === 'widget/slider' ? Math.pow(10, -this.node.properties.precision) : Number(this.node.properties.step) || 0.01
  }
  WidgetControl.prototype.invalidate = function () {
    if (this.pending != null) return
    this.pending = requestAnimationFrame(function () {
      this.pending = null
      if (this.node.graph) this.node.graph.invalidateNode(this.node, { source: true, propagate: true, reason: 'widget-input' })
    }.bind(this))
  }
  WidgetControl.prototype.change = function (key, value) {
    var node = this.node
    var previous = node.properties[key]
    if (typeof value === 'number' && !Number.isFinite(value)) return
    node.properties[key] = value
    if (typeof node.normalizeWidget === 'function') node.normalizeWidget()
    if (node.widgetUI === 'text' && !node.isInputConnected(0)) node._displayValue = String(node.properties.value)
    if (previous !== node.properties[key]) {
      if (key === 'value' && (node.widgetUI === 'combo' || node.widgetUI === 'toggle')) node.triggerSlot(1, node.properties.value)
      if (node.graph && typeof node.graph.onWidgetChanged === 'function') node.graph.onWidgetChanged(node, key, node.properties[key], previous, null)
      if (node.widgetUI === 'scene-material') node.queue()
      this.invalidate()
    }
    node.setDirtyCanvas()
    this.syncValues()
  }
  WidgetControl.prototype.commit = function () {
    if (this.pending != null) {
      cancelAnimationFrame(this.pending)
      this.pending = null
      if (this.node.graph) this.node.graph.invalidateNode(this.node, { source: true, propagate: true, reason: 'widget-input' })
    }
    if (this.node.graph) this.node.graph.commitHistory('widget-edit', this.node)
  }
  WidgetControl.prototype.field = function (parent, label, key, type) {
    var wrapper = element('label', 'pandaui-widget-field')
    wrapper.appendChild(element('span', '', label))
    var input = element(type === 'textarea' ? 'textarea' : 'input')
    if (type !== 'textarea') input.type = type || 'text'
    input.setAttribute('aria-label', label)
    if (type === 'number') input.step = 'any'
    var initial = null
    input.addEventListener('focus', function () { initial = this.node.properties[key] }.bind(this))
    input.addEventListener('input', function (event) {
      if (event.isComposing || type === 'number' && input.value === '') return
      this.change(key, type === 'number' ? Number(input.value) : input.value)
    }.bind(this))
    input.addEventListener('compositionend', function () { this.change(key, input.value) }.bind(this))
    input.addEventListener('change', function () { this.commit(); this.syncValues(true) }.bind(this))
    input.addEventListener('keydown', function (event) {
      if (event.isComposing) return
      if (event.key === 'Escape') { event.preventDefault(); this.change(key, initial); input.blur(); this.syncValues(true) }
      else if (event.key === 'Enter' && type !== 'textarea') { event.preventDefault(); input.blur() }
    }.bind(this))
    wrapper.appendChild(input)
    parent.appendChild(wrapper)
    this.bindings.push(function (force) {
      var controlled = key === 'value' && (this.node.widgetUI === 'text' || this.node.widgetUI === 'toggle') && this.node.isInputConnected(0)
      input.readOnly = controlled
      var value = controlled && this.node.widgetUI === 'text' ? this.node._displayValue : this.node.properties[key]
      if (force || document.activeElement !== input || controlled) input.value = value == null ? '' : String(value)
      if (key === 'value' && type === 'number') {
        input.min = this.node.properties.min
        input.max = this.node.properties.max
        input.step = this.step()
      }
    }.bind(this))
    return input
  }
  WidgetControl.prototype.rangeFields = function (parent, precision) {
    var row = element('div', 'pandaui-widget-grid')
    this.field(row, 'Min', 'min', 'number')
    this.field(row, 'Max', 'max', 'number')
    if (precision) {
      var label = element('label', 'pandaui-widget-field')
      label.appendChild(element('span', '', 'Decimals'))
      var select = element('select')
      select.setAttribute('aria-label', 'Decimals')
      for (var index = 0; index <= 6; index++) { var option = element('option', '', index); option.value = index; select.appendChild(option) }
      select.addEventListener('change', function () { this.change('precision', Number(select.value)); this.commit() }.bind(this))
      label.appendChild(select)
      row.appendChild(label)
      this.bindings.push(function () { select.value = this.node.properties.precision }.bind(this))
    } else this.field(row, 'Step', 'step', 'number')
    parent.appendChild(row)
  }
  WidgetControl.prototype.numericValue = function (parent) {
    var row = element('div', 'pandaui-widget-number')
    var minus = element('button', 'pandaui-widget-step', '-')
    minus.type = 'button'; minus.title = 'Decrease'; minus.setAttribute('aria-label', 'Decrease')
    var input = this.field(row, 'Value', 'value', 'number')
    row.insertBefore(minus, row.firstChild)
    var plus = element('button', 'pandaui-widget-step', '+')
    plus.type = 'button'; plus.title = 'Increase'; plus.setAttribute('aria-label', 'Increase')
    row.appendChild(plus)
    ;[[minus, -1], [plus, 1]].forEach(function (entry) {
      entry[0].addEventListener('click', function () { this.change('value', Number(this.node.properties.value) + entry[1] * this.step()); this.commit() }.bind(this))
    }, this)
    this.bindings.push(function () {
      minus.disabled = this.node.properties.value <= this.node.properties.min
      plus.disabled = this.node.properties.value >= this.node.properties.max
    }.bind(this))
    parent.appendChild(row)
    return input
  }
  WidgetControl.prototype.slider = function (parent) {
    var range = element('input', 'pandaui-widget-range')
    range.type = 'range'
    range.setAttribute('aria-label', 'Slider value')
    range.addEventListener('input', function () { this.change('value', Number(range.value)) }.bind(this))
    range.addEventListener('change', this.commit.bind(this))
    var limits = element('div', 'pandaui-widget-limits')
    var minimum = element('span'); var maximum = element('span')
    limits.appendChild(minimum); limits.appendChild(maximum)
    parent.appendChild(range); parent.appendChild(limits)
    this.bindings.push(function () {
      var properties = this.node.properties
      range.min = properties.min; range.max = properties.max; range.step = this.step(); range.value = properties.value
      range.disabled = properties.min === properties.max
      var fraction = properties.max > properties.min ? (properties.value - properties.min) / (properties.max - properties.min) : 0
      range.style.setProperty('--fill', (fraction * 100) + '%')
      minimum.textContent = properties.min; maximum.textContent = properties.max
    }.bind(this))
  }
  WidgetControl.prototype.knob = function (parent) {
    var knob = element('div', 'pandaui-widget-knob')
    knob.tabIndex = 0
    knob.setAttribute('role', 'slider'); knob.setAttribute('aria-label', 'Knob value')
    knob.appendChild(element('span', 'pandaui-widget-knob-pointer'))
    var drag = null
    knob.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return
      drag = { y: event.clientY, value: this.node.properties.value }
      knob.setPointerCapture(event.pointerId)
      knob.focus()
    }.bind(this))
    knob.addEventListener('pointermove', function (event) {
      if (!drag) return
      var properties = this.node.properties
      var change = (drag.y - event.clientY) / (160 * this.canvas.scale) * (properties.max - properties.min)
      var step = this.step()
      this.change('value', Math.round((drag.value + change) / step) * step)
    }.bind(this))
    knob.addEventListener('pointerup', function () { if (drag) { drag = null; this.commit() } }.bind(this))
    knob.addEventListener('pointercancel', function () { if (drag) { this.change('value', drag.value); drag = null } }.bind(this))
    knob.addEventListener('keydown', function (event) {
      var value = this.node.properties.value
      if (event.key === 'Home') value = this.node.properties.min
      else if (event.key === 'End') value = this.node.properties.max
      else if (['ArrowUp', 'ArrowRight'].indexOf(event.key) >= 0) value += this.step()
      else if (['ArrowDown', 'ArrowLeft'].indexOf(event.key) >= 0) value -= this.step()
      else return
      event.preventDefault(); this.change('value', value); this.commit()
    }.bind(this))
    this.bindings.push(function () {
      var properties = this.node.properties
      var fraction = properties.max > properties.min ? (properties.value - properties.min) / (properties.max - properties.min) : 0
      knob.style.setProperty('--angle', (fraction * 270) + 'deg')
      knob.style.setProperty('--rotation', (-135 + fraction * 270) + 'deg')
      knob.setAttribute('aria-valuemin', properties.min); knob.setAttribute('aria-valuemax', properties.max); knob.setAttribute('aria-valuenow', properties.value)
    }.bind(this))
    parent.appendChild(knob)
  }
  WidgetControl.prototype.renderWidgetUI = function () {
    var node = this.node
    var root = this.root
    if (typeof node.normalizeWidget === 'function') node.normalizeWidget()
    if (['slider', 'number', 'knob'].indexOf(node.widgetUI) >= 0) {
      if (node.widgetUI === 'knob') this.knob(root)
      this.numericValue(root)
      if (node.widgetUI === 'slider') this.slider(root)
      this.rangeFields(root, node.type === 'widget/slider')
    } else if (node.widgetUI === 'text' || node.widgetUI === 'panel') {
      this.field(root, node.widgetUI === 'text' ? 'Text' : 'Notes', 'value', 'textarea')
      var count = element('output', 'pandaui-widget-count')
      root.appendChild(count)
      this.bindings.push(function () {
        var controlled = node.widgetUI === 'text' && node.isInputConnected(0)
        var value = String(controlled ? node._displayValue || '' : node.properties.value || '')
        count.textContent = (controlled ? 'Connected' : value.length + ' characters')
      })
    } else if (node.widgetUI === 'toggle') {
      var toggle = element('button', 'pandaui-widget-toggle')
      toggle.type = 'button'; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', 'Value')
      var state = element('span'); toggle.appendChild(state); toggle.appendChild(element('span', 'pandaui-widget-switch'))
      toggle.addEventListener('click', function () { this.change('value', !node.properties.value); this.commit() }.bind(this))
      this.bindings.push(function () {
        toggle.setAttribute('aria-checked', String(!!node.properties.value))
        toggle.disabled = node.isInputConnected(0)
        state.textContent = node.properties.value ? 'True' : 'False'
      })
      root.appendChild(toggle)
    } else if (node.widgetUI === 'combo') {
      var choice = element('select')
      choice.setAttribute('aria-label', 'Value')
      choice.addEventListener('change', function () { this.change('value', choice.value); this.commit() }.bind(this))
      root.appendChild(choice)
      this.field(root, 'Options', 'values', 'text')
      var optionsKey = null
      this.bindings.push(function () {
        node.normalizeWidget()
        var key = JSON.stringify(node._values)
        if (optionsKey !== key) {
          optionsKey = key
          choice.replaceChildren()
          node._values.forEach(function (value) { var option = element('option', '', value); option.value = value; choice.appendChild(option) })
        }
        choice.value = node.properties.value; choice.disabled = !node._values.length
      })
    } else if (node.widgetUI === 'button') {
      var button = element('button', 'pandaui-widget-action')
      button.type = 'button'
      button.addEventListener('pointerdown', function (event) { if (event.button === 0) { button.setPointerCapture(event.pointerId); node.press() } })
      ;['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(function (eventName) { button.addEventListener(eventName, function () { if (node.clicked) node.release() }) })
      button.addEventListener('keydown', function (event) { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); node.press() } })
      button.addEventListener('keyup', function (event) { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); node.release() } })
      root.appendChild(button)
      var row = element('div', 'pandaui-widget-grid pandaui-widget-grid--two')
      this.field(row, 'Label', 'text', 'text'); this.field(row, 'Message', 'message', 'text'); root.appendChild(row)
      this.bindings.push(function () { button.textContent = node.properties.text || 'Run'; button.setAttribute('aria-pressed', String(node.clicked)); button.title = node.properties.text || 'Run' })
    } else if (node.widgetUI === 'progress') {
      var progress = element('progress'); progress.max = 1; progress.setAttribute('aria-label', 'Progress')
      var output = element('output', 'pandaui-widget-progress-value')
      root.appendChild(output); root.appendChild(progress)
      var limits = element('div', 'pandaui-widget-grid pandaui-widget-grid--two')
      this.field(limits, 'Min', 'min', 'number'); this.field(limits, 'Max', 'max', 'number'); root.appendChild(limits)
      this.bindings.push(function () {
        var properties = node.properties
        var fraction = properties.max > properties.min ? Math.max(0, Math.min(1, (properties.value - properties.min) / (properties.max - properties.min))) : 0
        progress.value = fraction; output.textContent = Math.round(fraction * 100) + '%'
      })
    } else if (node.widgetUI === 'scene-material') {
      this.sceneMaterial(root)
    } else if (node.widgetUI === 'color-picker') {
      this.field(root, 'Color', 'color', 'color')
    } else if (node.widgetUI === 'chat') {
      this.chat(root)
    } else if (typeof node.buildWidgetUI === 'function') {
      node.buildWidgetUI(root, this)
    }
    this.syncValues(true)
  }
  // Shared node surface: selectors and editors stay in the graph, below ports.
  WidgetControl.prototype.sceneMaterial = function (root) {
    var node = this.node, control = this
    function button (parent, label, action) {
      var item = element('button', 'pandaui-widget-action', label)
      item.type = 'button'; item.addEventListener('click', action); parent.appendChild(item)
      return item
    }
    var toolbar = element('div', 'pandaui-material-toolbar')
    var search = element('input'); search.type = 'search'; search.placeholder = 'Search materials'
    search.setAttribute('aria-label', 'Search materials'); toolbar.appendChild(search)
    button(toolbar, 'Refresh', function () { node.refresh() }); root.appendChild(toolbar)
    var summary = element('output', 'pandaui-material-summary'); root.appendChild(summary)
    var list = element('select', 'pandaui-material-list'); list.size = 5
    list.setAttribute('aria-label', 'Scene materials'); root.appendChild(list)
    var catalog = null, query = null, selectedKey = null
    function updateList () {
      var text = search.value.trim().toLowerCase()
      if (catalog !== node._catalog || query !== text) {
        catalog = node._catalog; query = text; list.replaceChildren()
        selectedKey = null
        var filtered = catalog.filter(function (entry) { return (entry.name + ' ' + entry.document).toLowerCase().includes(text) })
        filtered.forEach(function (entry) {
          var settings = entry.settings || {}
          var option = element('option', '', entry.name + ' · ' + entry.count + ' objects · ' + entry.document + ' · R ' + Number(settings.roughness || 0).toFixed(2) + ' / M ' + Number(settings.metalness || 0).toFixed(2))
          option.value = entry.key; option.title = option.textContent; list.appendChild(option)
        })
        summary.textContent = filtered.length + ' / ' + catalog.length + ' shared materials'
      }
      // Do not overwrite the native list's pending pointer/keyboard selection
      // on every canvas frame, before its change event can reach the node.
      if (selectedKey !== node.properties.materialKey) { selectedKey = node.properties.materialKey; list.value = selectedKey }
    }
    search.addEventListener('input', updateList)
    list.addEventListener('change', function () { node.selectMaterial(list.value); control.syncValues(true) })
    var focus = function () { search.focus() }; node._focusMaterialSearch = focus
    node._revealMaterial = function () { search.value = ''; query = null; updateList() }
    this.disposers.push(function () { if (node._focusMaterialSearch === focus) delete node._focusMaterialSearch; delete node._revealMaterial })
    var selected = element('strong'); root.appendChild(selected)
    var preview = element('img', 'pandaui-material-preview'); preview.alt = 'Material sphere preview'; preview.hidden = true; root.appendChild(preview)
    var previewStatus = element('output', 'pandaui-material-summary'); root.appendChild(previewStatus)
    var fields = element('fieldset', 'pandaui-material-fields'); root.appendChild(fields)
    var schema = global.PandaUIMaterialSchema
    var typeLabel = element('label', 'pandaui-widget-field', 'Material type'), type = element('select')
    type.setAttribute('aria-label', 'Material type'); typeLabel.appendChild(type); fields.appendChild(typeLabel)
    Object.keys(schema.types).forEach(function (key) { var option = element('option', '', schema.types[key].label); option.value = key; type.appendChild(option) })
    type.addEventListener('change', function () { node.setMaterialType(type.value); control.invalidate(); control.syncValues(true) })
    var sections = schema.groups.map(function (group) {
      var section = element('details', 'pandaui-material-group'); section.open = true
      section.appendChild(element('summary', '', group.label))
      var row = element('div', 'pandaui-widget-grid pandaui-widget-grid--two'); section.appendChild(row)
      group.fields.forEach(function (pair) {
        var color = schema.colors.includes(pair[1])
        var input = control.field(row, pair[0], pair[1], color ? 'color' : 'number')
        if (!color) { input.min = schema.ranges[pair[1]][0]; input.max = schema.ranges[pair[1]][1]; input.step = 0.01 }
        control.bindings.push(function () {
          input.parentElement.hidden = pair[1] === 'ior' && node.properties.materialType === 'metal' || pair[1] === 'metalness' && ['glass', 'plastic'].includes(node.properties.materialType)
        })
      })
      fields.appendChild(section)
      return { element: section, group: group }
    })
    Object.keys(schema.textures).forEach(function (key) {
      var texture = element('output', 'pandaui-material-summary'); fields.appendChild(texture)
      var actions = element('div', 'pandaui-widget-grid pandaui-widget-grid--two'); fields.appendChild(actions)
      button(actions, 'Choose ' + schema.textures[key].label.toLowerCase() + ' texture', function () { node.pickTexture(key) })
      button(actions, 'Remove ' + schema.textures[key].label.toLowerCase() + ' texture', function () { node.setProperty(key, null); node.setProperty(key + 'Name', ''); node.queue() })
      control.bindings.push(function () {
        texture.textContent = schema.textures[key].label + ' texture: ' + (node.properties[key + 'Name'] || (node.properties[key] === null ? 'None' : 'Original / none'))
      })
    })
    var help = element('p', 'pandaui-material-summary', 'Glass uses screen-space refraction in Real-time Render. Off-screen objects, glass behind glass and caustics are not traced. Bump and normal textures are alternative surface-detail modes. Preview uses a studio-lit unit sphere; scene lighting and scale may differ.')
    fields.appendChild(help)
    var notice = element('output', 'pandaui-material-summary'); notice.setAttribute('aria-live', 'polite'); root.appendChild(notice)
    this.bindings.push(function () {
      updateList(); fields.disabled = !node.properties.materialKey
      type.value = node.properties.materialType
      sections.forEach(function (section) {
        var group = section.group, selectedType = node.properties.materialType
        section.element.hidden = !!(group.only && !group.only.includes(selectedType) || group.exclude && group.exclude.includes(selectedType))
      })
      if (node._previewImage && preview.getAttribute('src') !== node._previewImage) preview.src = node._previewImage
      preview.hidden = !node._previewImage
      previewStatus.textContent = node._previewError || (!node._previewImage && node.properties.materialKey ? 'Rendering material sphere…' : 'Studio preview')
      selected.textContent = node.properties.materialName || 'Select a material above'
      notice.textContent = node._status.value
    })
  }
  WidgetControl.prototype.getContentTop = function () {
    var node = this.node
    var slots = Math.max(node.inputs.length, node.outputs.length)
    var slotHeight = global.PandaUI && Number(global.PandaUI.NODE_SLOT_HEIGHT) || 22
    var requested = typeof node.widgetContentTop === 'function' ? Number(node.widgetContentTop()) : 12
    if (!Number.isFinite(requested) || requested < 0) requested = 12
    var portBottom = slots ? 34 + slots * slotHeight : 12
    return Math.max(requested, portBottom)
  }
  // The AI assistant surface. Unlike every other widget here it does not write a
  // property through change()/commit() -- the node's GraphAgent owns the edits
  // and the undo transaction for the whole turn, so this only sends text and
  // renders what comes back.
  WidgetControl.prototype.chat = function (root) {
    var node = this.node
    var providers = element('div', 'pandaui-chat-providers')
    providers.setAttribute('role', 'group')
    providers.setAttribute('aria-label', 'AI provider')
    providers.title = 'Each provider keeps a separate conversation.'
    var providerButtons = ['claude', 'gpt'].map(function (provider) {
      var button = element('button', '', provider === 'gpt' ? 'GPT' : 'Claude')
      button.type = 'button'
      button.dataset.provider = provider
      button.addEventListener('click', function () { node.selectProvider(provider) })
      providers.appendChild(button)
      return button
    })
    var contextRow = element('div', 'pandaui-chat-context')
    var budgetLabel = element('label', '', 'Context budget')
    var contextBudget = element('select')
    contextBudget.setAttribute('aria-label', 'Context budget')
    ;[2000, 4000, 6000, 8000, 12000, 16000].forEach(function (value) {
      var option = element('option', '', value / 1000 + 'k tokens')
      option.value = String(value)
      contextBudget.appendChild(option)
    })
    contextBudget.addEventListener('change', function () { node.setProperty('contextTokenBudget', Number(contextBudget.value)); node.setDirtyCanvas() })
    budgetLabel.appendChild(contextBudget)
    var contextInfo = element('span', 'pandaui-chat-context-info')
    contextRow.appendChild(budgetLabel); contextRow.appendChild(contextInfo)
    var transcript = element('div', 'pandaui-chat-transcript')
    transcript.setAttribute('role', 'log')
    transcript.setAttribute('aria-live', 'polite')
    transcript.setAttribute('aria-label', 'Conversation')
    var status = element('div', 'pandaui-chat-status')
    var form = element('div', 'pandaui-chat-compose')
    var input = element('textarea', 'pandaui-chat-input')
    input.rows = 2
    input.placeholder = 'Describe what to model...'
    input.setAttribute('aria-label', 'Message')
    var send = element('button', 'pandaui-chat-send', 'Send')
    send.type = 'button'
    var stop = element('button', 'pandaui-chat-stop', 'Stop')
    stop.type = 'button'
    stop.hidden = true
    var clear = element('button', 'pandaui-chat-clear', 'Clear')
    clear.type = 'button'
    clear.title = 'Clear the conversation'
    var actions = element('div', 'pandaui-chat-actions')
    actions.appendChild(clear); actions.appendChild(stop); actions.appendChild(send)
    form.appendChild(input); form.appendChild(actions)
    root.appendChild(providers); root.appendChild(contextRow); root.appendChild(transcript); root.appendChild(status); root.appendChild(form)

    var submit = function () {
      var text = input.value.trim()
      if (!text || node._session && node._session.busy) return
      input.value = ''
      node.send(text)
    }
    send.addEventListener('click', submit)
    stop.addEventListener('click', function () { node.cancel() })
    clear.addEventListener('click', function () { node.clearConversation() })
    // Enter sends, Shift+Enter makes a newline. keydown already stops
    // propagating at the root, so the canvas never sees these keys.
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit() }
    })

    var rendered = null
    var renderedCount = 0
    var renderedLast = null
    var visibleMessages = 80
    var render = function () {
      var conversation = Array.isArray(node.properties.conversation) ? node.properties.conversation : []
      if (rendered === conversation && renderedCount === conversation.length && renderedLast === conversation[conversation.length - 1]) return
      var pinned = transcript.scrollTop + transcript.clientHeight >= transcript.scrollHeight - 24
      rendered = conversation
      renderedCount = conversation.length
      renderedLast = conversation[conversation.length - 1]
      transcript.replaceChildren()
      if (conversation.length > visibleMessages) {
        var earlier = element('button', 'pandaui-chat-earlier', 'Show earlier messages (' + (conversation.length - visibleMessages) + ')')
        earlier.type = 'button'
        earlier.addEventListener('click', function () { visibleMessages += 80; rendered = null; render() })
        transcript.appendChild(earlier)
      }
      conversation.slice(-visibleMessages).forEach(function (message) {
        var entry = renderMessage(message)
        if (entry) transcript.appendChild(entry)
      })
      if (pinned) transcript.scrollTop = transcript.scrollHeight
    }
    this.bindings.push(function () {
      render()
      var busy = Boolean(node._session && node._session.busy)
      contextBudget.disabled = busy
      contextBudget.value = String(node.properties.contextTokenBudget || 6000)
      var stats = node._contextStats
      contextInfo.textContent = stats ? '≈' + stats.estimatedTokens.toLocaleString() + ' tokens' + (stats.archivedMessages ? ' · ' + stats.archivedMessages + ' archived' : '') : 'Automatic compaction'
      contextInfo.title = 'Estimated conversation tokens; system instructions and tools are extra. Older messages stay saved and can be retrieved.' +
        (node._lastUsage && Number.isFinite(node._lastUsage.input_tokens) ? ' Last API input: ' + node._lastUsage.input_tokens + ' tokens.' : '')
      providerButtons.forEach(function (button) {
        button.disabled = busy
        button.setAttribute('aria-pressed', String(button.dataset.provider === (node.properties.provider || 'claude')))
      })
      send.disabled = busy
      clear.disabled = busy
      stop.hidden = !busy
      input.readOnly = busy
      var keyName = node.properties.provider === 'gpt' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
      status.textContent = node.properties.lastError || (node._configured === false ? 'Set ' + keyName + ' on the backend to use the assistant.' : '') ||
        (node.properties.status === 'thinking' ? 'Thinking...' : node.properties.status === 'working' ? 'Editing the graph...' : '')
      status.dataset.state = node.properties.lastError || node._configured === false ? 'error' : node.properties.status
    })
    var onChatUpdate = function () { this.syncValues() }.bind(this)
    node.onChatUpdate = onChatUpdate
    this.disposers.push(function () { if (node.onChatUpdate === onChatUpdate) delete node.onChatUpdate })
    node.checkBackend().then(function () { if (!this.disposed) this.syncValues() }.bind(this))
  }
  // Renders one transcript entry. Tool calls collapse to a single line each --
  // the full JSON is noise in a chat log, and the interesting part is which
  // tools ran and whether they failed.
  function renderMessage (message) {
    var content = message && message.content
    if (typeof content === 'string') {
      if (!content.trim()) return null
      var entry = element('div', 'pandaui-chat-message')
      entry.dataset.role = message.role
      entry.appendChild(element('p', 'pandaui-chat-text', content))
      return entry
    }
    if (!Array.isArray(content)) return null
    var container = element('div', 'pandaui-chat-message')
    container.dataset.role = message.role
    content.forEach(function (block) {
      if (!block) return
      if (block.type === 'text' && block.text && block.text.trim()) container.appendChild(element('p', 'pandaui-chat-text', block.text))
      else if (block.type === 'tool_use') container.appendChild(element('div', 'pandaui-chat-tool', block.name))
      else if (block.type === 'tool_result' && block.is_error) {
        var failure = element('div', 'pandaui-chat-tool', (block._tool || 'tool') + ' failed')
        failure.dataset.state = 'error'
        container.appendChild(failure)
      }
    })
    return container.childNodes.length ? container : null
  }
  WidgetControl.prototype.syncValues = function (force) { this.bindings.forEach(function (binding) { binding(force) }) }
  WidgetControl.prototype.sync = function () {
    var node = this.node
    var canvas = this.canvas
    var visible = !(node.flags && node.flags.collapsed) && canvas.isNodeVisible(node)
    this.root.hidden = !visible
    this.root.inert = !canvas.editorModeActive
    this.root.style.pointerEvents = canvas.editorModeActive ? 'auto' : 'none'
    if (!canvas.editorModeActive && node.clicked && node.release) node.release()
    if (!visible) { if (node.clicked && node.release) node.release(); return }
    var rect = canvas.canvas.getBoundingClientRect()
    var top = this.getContentTop()
    var signature = [rect.left, rect.top, node.pos[0], node.pos[1], node.size[0], node.size[1], top, canvas.offset[0], canvas.offset[1], canvas.scale].join(',')
    if (this.layoutSignature !== signature) {
      this.layoutSignature = signature
      this.root.style.left = rect.left + (node.pos[0] + canvas.offset[0] + 12) * canvas.scale + 'px'
      this.root.style.top = rect.top + (node.pos[1] + canvas.offset[1] + top) * canvas.scale + 'px'
      this.root.style.width = Math.max(0, node.size[0] - 24) + 'px'
      this.root.style.height = Math.max(0, node.size[1] - top - 12) + 'px'
      this.root.style.transform = 'scale(' + canvas.scale + ')'
    }
    this.syncValues()
  }
  WidgetControl.prototype.dispose = function () {
    this.disposed = true
    this.disposers.forEach(function (dispose) { dispose() })
    this.disposers.length = 0
    if (this.pending != null) cancelAnimationFrame(this.pending)
    if (this.node.clicked && this.node.release) this.node.release()
    this.root.remove()
  }

  global.PandaUISyncWidgetControls = function (canvas) {
    if (!canvas._widgetControls) canvas._widgetControls = new Map()
    var live = new Set(canvas.graph._nodes)
    canvas._widgetControls.forEach(function (control, node) {
      if (!live.has(node)) { control.dispose(); canvas._widgetControls.delete(node) }
    })
    canvas.graph._nodes.forEach(function (node, index) {
      if (!node.widgetUI) return
      var control = canvas._widgetControls.get(node)
      try {
        if (!control) { control = new WidgetControl(node, canvas); canvas._widgetControls.set(node, control) }
        control.root.style.zIndex = 10 + index
        control.sync()
        if (node._widgetRenderError) { delete node._widgetRenderError; canvas.setDirty() }
      } catch (error) {
        var message = String(error && error.message || error)
        if (control) control.root.hidden = true
        if (node._widgetRenderError !== message) {
          node._widgetRenderError = message
          console.error('[PandaUI] Widget failed for ' + node.type + ' (' + node.id + '):', error)
          canvas.setDirty()
        }
      }
    })
  }
})(window)
