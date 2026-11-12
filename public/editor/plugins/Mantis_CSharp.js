(function (PandaUI, global) {
  'use strict'

  var defaultCode = [
    'using System;',
    'using NODE_EDITOR.Kernel;',
    '',
    'public class Com_Instance : GH_Component',
    '{',
    '  public Com_Instance()',
    '    : base("C# Script", "CS", "C# script component", "Mantis", "Script") { }',
    '  public override Guid ComponentGuid => new Guid("00000000-0000-0000-0000-000000000001");',
    '',
    '  protected override void RegisterInputParams(GH_InputParamManager manager)',
    '  {',
    '    manager.AddGenericParameter("Value", "V", "Input value", GH_ParamAccess.item);',
    '  }',
    '',
    '  protected override void RegisterOutputParams(GH_OutputParamManager manager)',
    '  {',
    '    manager.AddGenericParameter("Result", "R", "Output value", GH_ParamAccess.item);',
    '  }',
    '',
    '  protected override void SolveInstance(IGH_DataAccess access)',
    '  {',
    '    object value = null;',
    '    if (access.GetData(0, ref value)) access.SetData(0, value);',
    '  }',
    '}'
  ].join('\n')

  var emptyCode = [
    'using System;',
    'using NODE_EDITOR.Kernel;',
    '',
    'public class Com_Instance : GH_Component',
    '{',
    '  public Com_Instance() : base("C# Script", "CS", "", "Mantis", "Script") { }',
    '  public override Guid ComponentGuid => new Guid("00000000-0000-0000-0000-000000000001");',
    '  protected override void RegisterInputParams(GH_InputParamManager manager) { }',
    '  protected override void RegisterOutputParams(GH_OutputParamManager manager) { }',
    '  protected override void SolveInstance(IGH_DataAccess access) { }',
    '}'
  ].join('\n')

  var methodCode = [
    'using System;',
    'using System.Collections.Generic;',
    'using CicadaCommom.Geometry;',
    '',
    'public class Com_Instance',
    '{',
    '  public Com_Instance() { }',
    '  public int ADD(int A, int B)',
    '  {',
    '    return A + B;',
    '  }',
    '',
    '  public int TIMES(int A, int B)',
    '  {',
    '    return A * B;',
    '  }',
    '}'
  ].join('\n')

  var taskCode = [
    'using System;',
    'using System.Collections.Generic;',
    'using System.Threading.Tasks;',
    'using NODE_EDITOR.Kernel;',
    '',
    'public class Com_Instance : GH_TaskCapableComponent<Dictionary<string, object>>, IGH_InitCodeAware',
    '{',
    '  public Com_Instance() : base("Task", "T", "Task component", "Mantis", "Script") { }',
    '  public override Guid ComponentGuid => new Guid("00000000-0000-0000-0000-000000000001");',
    '  public void SetInitCode(string code) { AssignInitCodeToInputParameter(1, code); }',
    '',
    '  protected override void RegisterInputParams(GH_InputParamManager manager)',
    '  {',
    '    manager.AddIntegerParameter("A", "A", "A", GH_ParamAccess.item, 1);',
    '    manager.AddIntegerParameter("B", "B", "B", GH_ParamAccess.item);',
    '  }',
    '  protected override void RegisterOutputParams(GH_OutputParamManager manager)',
    '  {',
    '    manager.AddIntegerParameter("R", "R", "Result", GH_ParamAccess.item);',
    '  }',
    '',
    '  public virtual Dictionary<string, object> GET(IGH_DataAccess access)',
    '  {',
    '    int A = 1;',
    '    int B = 2;',
    '    access.GetData(0, ref A);',
    '    if (!access.GetData(1, ref B)) return null;',
    '    return new Dictionary<string, object> { ["in0"] = A, ["in1"] = B };',
    '  }',
    '  public virtual Dictionary<string, object> COMPUTE(Dictionary<string, object> data)',
    '  {',
    '    if (data == null) return null;',
    '    return new Dictionary<string, object> { ["out0"] = (int)data["in0"] + (int)data["in1"] };',
    '  }',
    '  public virtual void SET(IGH_DataAccess access, Dictionary<string, object> data)',
    '  {',
    '    access.SetData(0, data["out0"]);',
    '  }',
    '',
    '  protected override void SolveInstance(IGH_DataAccess access)',
    '  {',
    '    if (InPreSolve)',
    '    {',
    '      var input = GET(access);',
    '      TaskList.Add(Task.Run(() => COMPUTE(input), CancelToken));',
    '      return;',
    '    }',
    '    Dictionary<string, object> result;',
    '    if (!GetSolveResults(access, out result)) result = COMPUTE(GET(access));',
    '    if (result != null) SET(access, result);',
    '  }',
    '}'
  ].join('\n')

  var commandCode = [
    'using System;',
    'using NODE_EDITOR.Kernel;',
    '',
    'public class Com_Instance : GH_Component',
    '{',
    '  public Com_Instance() : base("Command", "CMD", "Command component", "Mantis", "Script") { }',
    '  public override Guid ComponentGuid => new Guid("00000000-0000-0000-0000-000000000001");',
    '  protected override void RegisterInputParams(GH_InputParamManager manager) { }',
    '  protected override void RegisterOutputParams(GH_OutputParamManager manager) { }',
    '  protected override void SolveInstance(IGH_DataAccess access) { }',
    '}'
  ].join('\n')

  var templates = [
    { id: 'basic', label: 'Basic component', code: defaultCode },
    { id: 'empty', label: 'Empty component', code: emptyCode },
    { id: 'method', label: 'Method component', code: methodCode },
    { id: 'task', label: 'Task component', code: taskCode },
    { id: 'command', label: 'Command component', code: commandCode }
  ]

  function normalizedReferences (value) {
    return Array.isArray(value) ? value.map(function (item) { return String(item || '').trim() }).filter(Boolean) : []
  }

  function makeEntry (node, data) {
    data = data || {}
    var properties = node && node.properties || {}
    return {
      id: String(data.componentId),
      name: String(data.componentName || properties.componentName || 'C# Script'),
      nickname: String(data.componentNickname || properties.componentNickname || 'CS'),
      category: String(data.componentCategory || properties.componentCategory || 'Mantis'),
      subcategory: String(data.componentSubcategory || properties.componentSubcategory || 'Script'),
      libraryName: 'Mantis',
      description: String(data.componentDescription || properties.componentDescription || 'Runtime compiled C# GH component'),
      componentGuid: String(data.componentGuid || properties.componentGuid || data.componentId),
      isComponent: true,
      isParam: false,
      execution: 'mantisScript',
      inputs: Array.isArray(data.inputs) ? data.inputs : [],
      outputs: Array.isArray(data.outputs) ? data.outputs : []
    }
  }

  function portName (port, fallback) {
    return String(port && (port.name || port.nickname) || fallback)
  }

  function portType (port) {
    return String(port && port.type || 'generic')
  }

  function updatePorts (node, inputs, outputs) {
    inputs = Array.isArray(inputs) ? inputs : []
    outputs = Array.isArray(outputs) ? outputs : []
    var graph = node.graph
    var links = []
    if (graph && graph.links) graph.links.forEach(function (link) {
      if (String(link.origin_id) !== String(node.id) && String(link.target_id) !== String(node.id)) return
      var source = graph.getNodeById(link.origin_id)
      var target = graph.getNodeById(link.target_id)
      links.push({
        source: source,
        sourceName: source && source.outputs[link.origin_slot] && source.outputs[link.origin_slot].name,
        target: target,
        targetName: target && target.inputs[link.target_slot] && target.inputs[link.target_slot].name
      })
    })
    if (graph) {
      var linkIds = []
      graph.links.forEach(function (candidate) {
        if (String(candidate.origin_id) === String(node.id) || String(candidate.target_id) === String(node.id)) linkIds.push(candidate.id)
      })
      linkIds.forEach(function (id) { graph.removeLink(id, { silent: true }) })
    }
    while (node.inputs.length) node.removeInput(node.inputs.length - 1)
    while (node.outputs.length) node.removeOutput(node.outputs.length - 1)
    inputs.forEach(function (port) { node.addInput(portName(port, 'In'), portType(port), { label: port.nickname || port.name, access: port.access, optional: port.optional, clrType: port.clrType, parameterIndex: port.parameterIndex }) })
    outputs.forEach(function (port) { node.addOutput(portName(port, 'Out'), portType(port), { label: port.nickname || port.name, access: port.access, optional: port.optional, clrType: port.clrType, parameterIndex: port.parameterIndex }) })
    node.properties.portDefinitions = { inputs: inputs, outputs: outputs }
    node.computeSize()
    if (graph) {
      links.forEach(function (link) {
        if (!link.source || !link.target) return
        var sourceIndex = link.source.outputs.findIndex(function (port) { return port.name === link.sourceName })
        var targetIndex = link.target.inputs.findIndex(function (port) { return port.name === link.targetName })
        if (sourceIndex < 0 || targetIndex < 0) return
        graph.connect(link.source, sourceIndex, link.target, targetIndex, { silent: true, append: true })
      })
      if (!graph._restoring) graph.commitHistory('csharp-script-ports', node)
      graph.invalidateNode(node, { source: true, propagate: true, reason: 'script-ports' })
    }
  }

  function CSharpNode () {
    this.properties = {
      code: defaultCode,
      template: 'basic',
      references: [],
      componentId: '',
      compileHash: '',
      selectedMethod: '',
      methods: [],
      ghpPath: '',
      diagnostics: [],
      referenceText: '',
      foldedRanges: [],
      componentName: 'C# Script',
      componentNickname: 'CS',
      componentDescription: 'C# script component',
      componentCategory: 'Mantis',
      componentSubcategory: 'Script',
      componentGuid: '00000000-0000-0000-0000-000000000001',
      portDefinitions: { inputs: [], outputs: [] }
    }
    this.size = [640, 620]
    this.widgetUI = 'csharp'
    this._compileController = null
    this._completionController = null
    this._compileBusy = false
  }

  CSharpNode.title = 'C# Script'
  CSharpNode.desc = 'Edit, compile, and execute a C# GH component.'
  CSharpNode.pandauiDefinition = { executor: 'backend', dynamic: true }
  CSharpNode.prototype.widgetContentTop = function () {
    var slots = Math.max(this.inputs.length, this.outputs.length)
    return slots ? 34 + slots * 22 : 12
  }
  CSharpNode.prototype.getMinimumSize = function () { return [440, this.widgetContentTop() + 350] }
  CSharpNode.prototype.computeSize = function () {
    var minimum = this.getMinimumSize()
    this.size[0] = Math.max(minimum[0], Number(this.size[0]) || minimum[0])
    this.size[1] = Math.max(minimum[1], Number(this.size[1]) || minimum[1])
    this.ensurePortLabelWidth()
    return this.size
  }
  CSharpNode.prototype.getComponentDefinition = function () {
    var node = this
    var entry = node._ghEntry || makeEntry(node, { componentId: node.properties.componentId, inputs: node.properties.portDefinitions && node.properties.portDefinitions.inputs, outputs: node.properties.portDefinitions && node.properties.portDefinitions.outputs })
    if (!node.properties.componentId) return { metadata: { ghEntry: null } }
    return {
      id: node.properties.componentId,
      guid: node.properties.componentId,
      execution: 'mantisScript',
      dynamic: true,
      metadata: { ghEntry: entry, execute: global.PandaUIExecuteBackendNode }
    }
  }
  CSharpNode.prototype.onConfigure = function () {
    if (!this.properties.template) this.properties.template = 'basic'
    if (!Array.isArray(this.properties.foldedRanges)) this.properties.foldedRanges = []
    var definitions = this.properties.portDefinitions
    if (definitions) updatePorts(this, definitions.inputs, definitions.outputs)
  }
  CSharpNode.prototype.onAdded = function () {
    if (this.properties.componentId && this.properties.code) {
      this.compile()
      return
    }
    if (this.properties.componentId && typeof global.syncPandaUIGhNodeInstances === 'function') global.syncPandaUIGhNodeInstances()
  }
  CSharpNode.prototype.onRemoved = function () {
    if (this._closeGhpDialog) this._closeGhpDialog()
    if (this._compileController) this._compileController.abort()
    if (this._completionController) this._completionController.abort()
    if (this.properties.componentId) fetch('/api/node/instances', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: global.PandaUIGraphDocumentId || 'graph-workspace', nodeInstanceId: String(this.id) }) }).catch(function () {})
  }
  CSharpNode.prototype.onExecute = function () {
    var execute = global.PandaUIExecuteBackendNode
    if (!this.properties.componentId || typeof execute !== 'function') {
      this.setExecutionState('error', 'Compile the C# script before executing the node.')
      return Promise.resolve()
    }
    var context = this.getActiveExecutionContext ? this.getActiveExecutionContext() : null
    var ownsContext = false
    if (!context && this.createExecutionContext) {
      context = this.createExecutionContext({ solutionToken: this.graph ? this.graph._solutionToken : 0 })
      ownsContext = true
    }
    var result = execute(context || { node: this, graph: this.graph, solutionToken: this.graph ? this.graph._solutionToken : 0, abortController: new AbortController(), isCurrent: function () { return true } })
    if (!ownsContext) return result
    return Promise.resolve(result).finally(function () {
      context.complete()
      this.clearExecutionContext(context)
    }.bind(this))
  }

  CSharpNode.prototype.compile = function () {
    if (this._compileBusy) return Promise.resolve({ ok: false, error: 'A compile is already running.' })
    var node = this
    if (this._compileController) this._compileController.abort()
    var controller = new AbortController()
    this._compileController = controller
    this._compileBusy = true
    this.properties.diagnostics = []
    this.setDirtyCanvas()
    var references = normalizedReferences(this.properties.references)
    var source = String(this.properties.code || '')
    var method = String(this.properties.selectedMethod || '')
    function isCurrent () {
      return node._compileController === controller && !controller.signal.aborted &&
        String(node.properties.code || '') === source && String(node.properties.selectedMethod || '') === method && JSON.stringify(normalizedReferences(node.properties.references)) === JSON.stringify(references)
    }
    return fetch('/api/node/script/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: source, references: references, selectedMethod: method }),
      signal: controller.signal
    }).then(function (response) { return response.json().then(function (body) { if (!response.ok && body && body.error) throw new Error(body.error); return body }) })
      .then(function (data) {
        if (!isCurrent()) return { ok: false, cancelled: true }
        node.properties.diagnostics = Array.isArray(data && data.diagnostics) ? data.diagnostics : []
        ;(Array.isArray(data && data.warnings) ? data.warnings : []).forEach(function (message) {
          node.properties.diagnostics.push({ severity: 'warning', code: 'REFERENCE', message: message })
        })
        if (!data || !data.ok || !data.componentId) {
          node.setExecutionState('error', node.properties.diagnostics.map(function (item) { return item.message }).join('\n') || 'C# compilation failed.')
          node.setDirtyCanvas()
          return data
        }
        node.properties.componentId = String(data.componentId)
        node.properties.compileHash = String(data.compileHash || '')
        node.properties.methods = Array.isArray(data.methods) ? data.methods : []
        node.properties.selectedMethod = String(data.selectedMethod || '')
        node.properties.componentName = String(data.componentName || 'C# Script')
        node.properties.componentNickname = String(data.componentNickname || 'CS')
        node.properties.componentDescription = String(data.componentDescription || 'Runtime compiled C# GH component')
        node.properties.componentCategory = String(data.componentCategory || 'Mantis')
        node.properties.componentSubcategory = String(data.componentSubcategory || 'Script')
        node.properties.componentGuid = String(data.componentGuid || data.componentId)
        node.properties.references = references
        node._ghEntry = makeEntry(node, data)
        updatePorts(node, data.inputs, data.outputs)
        if (typeof global.syncPandaUIGhNodeInstances === 'function') return Promise.resolve(global.syncPandaUIGhNodeInstances()).then(function () { node.setExecutionState('ready'); node.setDirtyCanvas(); return data })
        node.setExecutionState('ready')
        node.setDirtyCanvas()
        return data
      })
      .catch(function (error) {
        if (error.name === 'AbortError' || !isCurrent()) return { ok: false, cancelled: true }
        node.properties.diagnostics = [{ severity: 'error', code: 'REQUEST', message: error.message || String(error) }]
        node.setExecutionState('error', error.message || String(error))
        node.setDirtyCanvas()
        return { ok: false, error: error.message || String(error) }
      })
      .finally(function () {
        if (node._compileController === controller) {
          node._compileController = null
          node._compileBusy = false
        }
        node.setDirtyCanvas()
      })
  }

  CSharpNode.prototype.buildWidgetUI = function (root, control) {
    global.PandaUIBuildCSharpWidget(this, root, control, templates)
  }

  CSharpNode.prototype.getExtraMenuOptions = function (canvas) {
    var node = this
    return [{ content: 'Add Node to .ghp…', callback: function () { global.PandaUICSharpLibrary.open(node, canvas) } }]
  }

  PandaUI.registerNode('Mantis/CSharp', CSharpNode)
  if (Array.isArray(global.PandaUINodePlugins) && !global.PandaUINodePlugins.some(function (plugin) { return plugin.id === 'mantis-csharp' })) {
    global.PandaUINodePlugins.push({ id: 'mantis-csharp', name: 'Mantis C#', version: '1.0.0', icon: 'code', description: 'Runtime C# component editor.', types: ['Mantis/CSharp'] })
    if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') global.dispatchEvent(new CustomEvent('pandaui-node-plugins-changed'))
  }
})(window.PandaUI, window)
