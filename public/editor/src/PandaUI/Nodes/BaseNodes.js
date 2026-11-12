// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI;
    function i() {
        (this.addOutput("in ms", "number"), this.addOutput("in sec", "number"));
    }
    function s() {
        ((this.size = [140, 80]),
            (this.properties = { enabled: !0 }),
            (this.enabled = !0),
            (this.subgraph = new e.GraphDocument()),
            (this.subgraph._subgraph_node = this),
            (this.subgraph._is_subgraph = !0),
            (this.subgraph.onTrigger = this.onSubgraphTrigger.bind(this)),
            (this.subgraph.onInputAdded = this.onSubgraphNewInput.bind(this)),
            (this.subgraph.onInputRenamed = this.onSubgraphRenamedInput.bind(this)),
            (this.subgraph.onInputTypeChanged = this.onSubgraphTypeChangeInput.bind(this)),
            (this.subgraph.onInputRemoved = this.onSubgraphRemovedInput.bind(this)),
            (this.subgraph.onOutputAdded = this.onSubgraphNewOutput.bind(this)),
            (this.subgraph.onOutputRenamed = this.onSubgraphRenamedOutput.bind(this)),
            (this.subgraph.onOutputTypeChanged = this.onSubgraphTypeChangeOutput.bind(this)),
            (this.subgraph.onOutputRemoved = this.onSubgraphRemovedOutput.bind(this)));
    }
    function o() {
        (this.addOutput("", "number"),
            (this.name_in_graph = ""),
            (this.properties = { name: "", type: "number", value: 0 }));
        var t = this;
        ((this.name_widget = this.addWidget("text", "Name", this.properties.name, function (e) {
            e && t.setProperty("name", e);
        })),
            (this.type_widget = this.addWidget("text", "Type", this.properties.type, function (e) {
                t.setProperty("type", e);
            })),
            (this.value_widget = this.addWidget("number", "Value", this.properties.value, function (e) {
                t.setProperty("value", e);
            })),
            (this.widgets_up = !0),
            (this.size = [180, 90]));
    }
    function n() {
        (this.addInput("", ""), (this.name_in_graph = ""), (this.properties = { name: "", type: "" }));
        ((this.name_widget = this.addWidget("text", "Name", this.properties.name, "name")),
            (this.type_widget = this.addWidget("text", "Type", this.properties.type, "type")),
            (this.widgets_up = !0),
            (this.size = [180, 60]));
    }
    function r() {
        (this.addOutput("value", "number"),
            this.addProperty("value", 1),
            (this.widget = this.addWidget("number", "value", 1, "value")),
            (this.widgets_up = !0),
            (this.size = [180, 30]));
    }
    function a() {
        (this.addOutput("bool", "boolean"),
            this.addProperty("value", !0),
            (this.widget = this.addWidget("toggle", "value", !0, "value")),
            (this.serialize_widgets = !0),
            (this.widgets_up = !0),
            (this.size = [140, 30]));
    }
    function p() {
        (this.addOutput("string", "string"),
            this.addProperty("value", ""),
            (this.widget = this.addWidget("text", "value", "", "value")),
            (this.widgets_up = !0),
            (this.size = [180, 30]));
    }
    function u() {
        (this.addOutput("obj", "object"), (this.size = [120, 30]), (this._object = {}));
    }
    function h() {
        (this.addInput("url", "string"),
            this.addOutput("file", "string"),
            this.addProperty("url", ""),
            this.addProperty("type", "text"),
            (this.widget = this.addWidget("text", "url", "", "url")),
            (this._data = null));
    }
    function l() {
        (this.addInput("parse", e.ACTION),
            this.addInput("json", "string"),
            this.addOutput("done", e.EVENT),
            this.addOutput("object", "object"),
            (this.widget = this.addWidget("button", "parse", "", this.parse.bind(this))),
            (this._str = null),
            (this._obj = null));
    }
    function d() {
        (this.addOutput("data", "object"),
            this.addProperty("value", ""),
            (this.widget = this.addWidget("text", "json", "", "value")),
            (this.widgets_up = !0),
            (this.size = [140, 30]),
            (this._value = null));
    }
    function c() {
        ((this._value = []),
            this.addInput("json", ""),
            this.addOutput("arrayOut", "array"),
            this.addOutput("length", "number"),
            this.addProperty("value", "[]"),
            (this.widget = this.addWidget("text", "array", this.properties.value, "value")),
            (this.widgets_up = !0),
            (this.size = [140, 50]));
    }
    function g() {
        (this.addInput("arr", "array"),
            this.addInput("value", ""),
            this.addOutput("arr", "array"),
            (this.properties = { index: 0 }),
            (this.widget = this.addWidget("number", "i", this.properties.index, "index", {
                precision: 0,
                step: 10,
                min: 0,
            })));
    }
    function f() {
        (this.addInput("array", "array,table,string"),
            this.addInput("index", "number"),
            this.addOutput("value", ""),
            this.addProperty("index", 0));
    }
    function y() {
        (this.addInput("table", "table"),
            this.addInput("row", "number"),
            this.addInput("col", "number"),
            this.addOutput("value", ""),
            this.addProperty("row", 0),
            this.addProperty("column", 0));
    }
    function v() {
        (this.addInput("obj", "object"),
            this.addOutput("property", 0),
            this.addProperty("value", 0),
            (this.widget = this.addWidget("text", "prop.", "", this.setValue.bind(this))),
            (this.widgets_up = !0),
            (this.size = [140, 30]),
            (this._value = null));
    }
    function b() {
        (this.addInput("obj", ""), this.addOutput("keys", "array"), (this.size = [140, 30]));
    }
    function _() {
        (this.addInput("obj", ""),
            this.addInput("value", ""),
            this.addOutput("obj", ""),
            (this.properties = { property: "" }),
            (this.name_widget = this.addWidget("text", "prop.", this.properties.property, "property")));
    }
    function m() {
        (this.addInput("A", "object"),
            this.addInput("B", "object"),
            this.addOutput("out", "object"),
            (this._result = {}));
        var t = this;
        (this.addWidget("button", "clear", "", function () {
            t._result = {};
        }),
            (this.size = this.computeSize()));
    }
    function I() {
        ((this.size = [60, 30]),
            this.addInput("in"),
            this.addOutput("out"),
            (this.properties = { varname: "myname", container: I.LITEGRAPH }),
            (this.value = null));
    }
    function O(t) {
        return t && null != t.length ? Number(t.length) : 0;
    }
    function O(t) {
        return t && null != t.length ? Number(t.length) : 0;
    }
    function w() {
        ((this.size = [60, 30]),
            this.addInput("data", 0),
            this.addInput("download", e.ACTION),
            (this.properties = { filename: "data.json" }),
            (this.value = null));
        var t = this;
        this.addWidget("button", "Download", "", function (e) {
            t.value && t.downloadAsFile();
        });
    }
    function D() {
        (this.addInput("value", 0, { label: "" }),
            (this.size = [340, 240]),
            (this.value = null),
            (this._treeRows = []),
            (this._scroll = 0),
            (this._rowHeight = 18));
    }
    function T() {
        (this.addInput("in", 0), this.addOutput("out", 0), (this.size = [40, 30]));
    }
    function x() {
        ((this.mode = e.ON_EVENT),
            (this.size = [80, 30]),
            this.addProperty("msg", ""),
            this.addInput("log", e.EVENT),
            this.addInput("msg", 0));
    }
    function E() {
        ((this.mode = e.ON_EVENT), this.addProperty("msg", ""), this.addInput("", e.EVENT));
        ((this.widget = this.addWidget("text", "Text", "", "msg")), (this.widgets_up = !0), (this.size = [200, 30]));
    }
    function N() {
        ((this.size = [60, 30]),
            this.addProperty("onExecute", "return A;"),
            this.addInput("A", 0),
            this.addInput("B", 0),
            this.addOutput("out", 0),
            (this._func = null),
            (this.data = {}));
    }
    function A() {
        (this.addInput("A", 0),
            this.addInput("B", 0),
            this.addOutput("true", "boolean"),
            this.addOutput("false", "boolean"),
            this.addProperty("A", 1),
            this.addProperty("B", 1),
            this.addProperty("OP", "==", "enum", { values: A.values }),
            this.addWidget("combo", "Op.", this.properties.OP, { property: "OP", values: A.values }),
            (this.size = [80, 60]));
    }
    ((i.title = "Time"),
        (i.desc = "Time"),
        (i.prototype.onExecute = function () {
            (this.setOutputData(0, 1e3 * this.graph.globaltime), this.setOutputData(1, this.graph.globaltime));
        }),
        e.registerNode("basic/time", i),
        (s.title = "Subgraph"),
        (s.desc = "Graph inside a node"),
        (s.title_color = "#334"),
        (s.prototype.onGetInputs = function () {
            return [["enabled", "boolean"]];
        }),
        (s.prototype.onDblClick = function (t, e, i) {
            var s = this;
            setTimeout(function () {
                i.openSubgraph(s.subgraph);
            }, 10);
        }),
        (s.prototype.onAction = function (t, e) {
            this.subgraph.onAction(t, e);
        }),
        (s.prototype.onExecute = function () {
            if (((this.enabled = this.getInputOrProperty("enabled")), this.enabled)) {
                if (this.inputs)
                    for (var t = 0; t < this.inputs.length; t++) {
                        var e = this.inputs[t],
                            i = this.getInputData(t);
                        this.subgraph.setInputData(e.name, i);
                    }
                if ((this.subgraph.runStep(), this.outputs))
                    for (t = 0; t < this.outputs.length; t++) {
                        var s = this.outputs[t];
                        i = this.subgraph.getOutputData(s.name);
                        this.setOutputData(t, i);
                    }
            }
        }),
        (s.prototype.sendEventToAllNodes = function (t, e, i) {
            this.enabled && this.subgraph.sendEventToAllNodes(t, e, i);
        }),
        (s.prototype.onDrawBackground = function (t, i, s, o) {
            if (this.flags.collapsed) return;
            var n = this.size[1] - e.NODE_TITLE_HEIGHT + 0.5,
                r = e.isInsideRectangle(o[0], o[1], this.pos[0], this.pos[1] + n, this.size[0], e.NODE_TITLE_HEIGHT);
            let a = e.isInsideRectangle(
                o[0],
                o[1],
                this.pos[0],
                this.pos[1] + n,
                this.size[0] / 2,
                e.NODE_TITLE_HEIGHT,
            );
            ((t.fillStyle = r ? "#555" : "#222"),
                t.beginPath(),
                this._shape == e.BOX_SHAPE
                    ? a
                        ? t.rect(0, n, this.size[0] / 2 + 1, e.NODE_TITLE_HEIGHT)
                        : t.rect(this.size[0] / 2, n, this.size[0] / 2 + 1, e.NODE_TITLE_HEIGHT)
                    : a
                      ? t.roundRect(0, n, this.size[0] / 2 + 1, e.NODE_TITLE_HEIGHT, [0, 0, 8, 8])
                      : t.roundRect(this.size[0] / 2, n, this.size[0] / 2 + 1, e.NODE_TITLE_HEIGHT, [0, 0, 8, 8]),
                r ? t.fill() : t.fillRect(0, n, this.size[0] + 1, e.NODE_TITLE_HEIGHT),
                (t.textAlign = "center"),
                (t.font = "24px Arial"),
                (t.fillStyle = r ? "#DDD" : "#999"),
                t.fillText("+", 0.25 * this.size[0], n + 24),
                t.fillText("+", 0.75 * this.size[0], n + 24));
        }),
        (s.prototype.onMouseDown = function (t, i, s) {
            var o = this.size[1] - e.NODE_TITLE_HEIGHT + 0.5;
            (console.log(0),
                i[1] > o &&
                    (i[0] < this.size[0] / 2
                        ? (console.log(1), s.showSubgraphPropertiesDialog(this))
                        : (console.log(2), s.showSubgraphPropertiesDialogRight(this))));
        }),
        (s.prototype.computeSize = function () {
            var t = this.inputs ? this.inputs.length : 0,
                i = this.outputs ? this.outputs.length : 0;
            return [200, Math.max(t, i) * e.NODE_SLOT_HEIGHT + e.NODE_TITLE_HEIGHT];
        }),
        (s.prototype.onSubgraphTrigger = function (t, e) {
            var i = this.findOutputSlot(t);
            -1 != i && this.triggerSlot(i);
        }),
        (s.prototype.onSubgraphNewInput = function (t, e) {
            var i = this.findInputSlot(t);
            -1 == i && this.addInput(t, e);
        }),
        (s.prototype.onSubgraphRenamedInput = function (t, e) {
            var i = this.findInputSlot(t);
            if (-1 != i) {
                var s = this.getInputInfo(i);
                s.name = e;
            }
        }),
        (s.prototype.onSubgraphTypeChangeInput = function (t, e) {
            var i = this.findInputSlot(t);
            if (-1 != i) {
                var s = this.getInputInfo(i);
                s.type = e;
            }
        }),
        (s.prototype.onSubgraphRemovedInput = function (t) {
            var e = this.findInputSlot(t);
            -1 != e && this.removeInput(e);
        }),
        (s.prototype.onSubgraphNewOutput = function (t, e) {
            var i = this.findOutputSlot(t);
            -1 == i && this.addOutput(t, e);
        }),
        (s.prototype.onSubgraphRenamedOutput = function (t, e) {
            var i = this.findOutputSlot(t);
            if (-1 != i) {
                var s = this.getOutputInfo(i);
                s.name = e;
            }
        }),
        (s.prototype.onSubgraphTypeChangeOutput = function (t, e) {
            var i = this.findOutputSlot(t);
            if (-1 != i) {
                var s = this.getOutputInfo(i);
                s.type = e;
            }
        }),
        (s.prototype.onSubgraphRemovedOutput = function (t) {
            var e = this.findOutputSlot(t);
            -1 != e && this.removeOutput(e);
        }),
        (s.prototype.getExtraMenuOptions = function (t) {
            var e = this;
            return [
                {
                    content: "Open",
                    callback: function () {
                        t.openSubgraph(e.subgraph);
                    },
                },
            ];
        }),
        (s.prototype.onResize = function (t) {
            t[1] += 20;
        }),
        (s.prototype.serialize = function () {
            var t = e.NativeNode.prototype.serialize.call(this);
            return ((t.subgraph = this.subgraph.serialize()), t);
        }),
        (s.prototype.reassignSubgraphUUIDs = function (t) {
            const i = { nodeIDs: {}, linkIDs: {} };
            for (const s of t.nodes) {
                const t = s.id,
                    o = e.uuidv4();
                if (((s.id = o), i.nodeIDs[t] || i.nodeIDs[o]))
                    throw new Error(`New/old node UUID wasn't unique in changed map! ${t} ${o}`);
                ((i.nodeIDs[t] = o), (i.nodeIDs[o] = t));
            }
            for (const s of t.links) {
                const t = s[0],
                    o = e.uuidv4();
                if (((s[0] = o), i.linkIDs[t] || i.linkIDs[o]))
                    throw new Error(`New/old link UUID wasn't unique in changed map! ${t} ${o}`);
                ((i.linkIDs[t] = o), (i.linkIDs[o] = t));
                const n = s[1],
                    r = s[3];
                if (!i.nodeIDs[n]) throw new Error(`Old node UUID not found in mapping! ${n}`);
                if (((s[1] = i.nodeIDs[n]), !i.nodeIDs[r])) throw new Error(`Old node UUID not found in mapping! ${r}`);
                s[3] = i.nodeIDs[r];
            }
            for (const e of t.nodes) {
                if (e.inputs) for (const t of e.inputs) t.link && (t.link = i.linkIDs[t.link]);
                if (e.outputs) for (const t of e.outputs) t.links && (t.links = t.links.map((t) => i.linkIDs[t]));
            }
            for (const e of t.nodes)
                if ("graph/subgraph" === e.type) {
                    const t = reassignGraphUUIDs(e.subgraph);
                    (i.nodeIDs.assign(t.nodeIDs), i.linkIDs.assign(t.linkIDs));
                }
        }),
        (s.prototype.clone = function () {
            var t = e.createNode(this.type),
                i = this.serialize();
            if (e.use_uuids) {
                const t = e.cloneObject(i.subgraph);
                (this.reassignSubgraphUUIDs(t), (i.subgraph = t));
            }
            return (delete i["id"], delete i["inputs"], delete i["outputs"], t.configure(i), t);
        }),
        (s.prototype.buildFromNodes = function (t) {
            for (var e = {}, i = 0, s = 0; s < t.length; ++s) {
                var o = t[s];
                ((e[o.id] = o), (i = Math.min(o.pos[0], i)), Math.max(o.pos[0], i));
            }
            for (s = 0; s < t.length; ++s) {
                o = t[s];
                if (o.inputs)
                    for (var n = 0; n < o.inputs.length; ++n) {
                        var r = o.inputs[n];
                        if (r && r.link) {
                            var a = o.graph.links[r.link];
                            a && (e[a.origin_id] || this.subgraph.addInput(r.name, a.type));
                        }
                    }
                if (o.outputs)
                    for (n = 0; n < o.outputs.length; ++n) {
                        var p = o.outputs[n];
                        if (p && p.links && p.links.length)
                            for (var u = 0; u < p.links.length; ++u) {
                                a = o.graph.links[p.links[u]];
                                if (a && !e[a.target_id]) {
                                    !0;
                                    break;
                                }
                            }
                    }
            }
        }),
        (e.Subgraph = s),
        e.registerNode("graph/subgraph", s),
        (o.title = "Input"),
        (o.desc = "Input of the graph"),
        (o.prototype.onConfigure = function () {
            this.updateType();
        }),
        (o.prototype.updateType = function () {
            var t = this.properties.type;
            ((this.type_widget.value = t),
                this.outputs[0].type != t &&
                    (e.isValidConnection(this.outputs[0].type, t) || this.disconnectOutput(0),
                    (this.outputs[0].type = t)),
                "number" == t
                    ? ((this.value_widget.type = "number"), (this.value_widget.value = 0))
                    : "boolean" == t
                      ? ((this.value_widget.type = "toggle"), (this.value_widget.value = !0))
                      : "string" == t
                        ? ((this.value_widget.type = "text"), (this.value_widget.value = ""))
                        : ((this.value_widget.type = null), (this.value_widget.value = null)),
                (this.properties.value = this.value_widget.value),
                this.graph && this.name_in_graph && this.graph.changeInputType(this.name_in_graph, t));
        }),
        (o.prototype.onPropertyChanged = function (t, e) {
            if ("name" == t) {
                if ("" == e || e == this.name_in_graph || "enabled" == e) return !1;
                (this.graph &&
                    (this.name_in_graph
                        ? this.graph.renameInput(this.name_in_graph, e)
                        : this.graph.addInput(e, this.properties.type)),
                    (this.name_widget.value = e),
                    (this.name_in_graph = e));
            } else "type" == t && this.updateType();
        }),
        (o.prototype.getTitle = function () {
            return this.flags.collapsed ? this.properties.name : this.title;
        }),
        (o.prototype.onAction = function (t, i) {
            this.properties.type == e.EVENT && this.triggerSlot(0, i);
        }),
        (o.prototype.onExecute = function () {
            var t = this.properties.name,
                e = this.graph.inputs[t];
            e
                ? this.setOutputData(0, void 0 !== e.value ? e.value : this.properties.value)
                : this.setOutputData(0, this.properties.value);
        }),
        (o.prototype.onRemoved = function () {
            this.name_in_graph && this.graph.removeInput(this.name_in_graph);
        }),
        (e.GraphInput = o),
        e.registerNode("graph/input", o),
        (n.title = "Output"),
        (n.desc = "Output of the graph"),
        (n.prototype.onPropertyChanged = function (t, e) {
            if ("name" == t) {
                if ("" == e || e == this.name_in_graph || "enabled" == e) return !1;
                (this.graph &&
                    (this.name_in_graph
                        ? this.graph.renameOutput(this.name_in_graph, e)
                        : this.graph.addOutput(e, this.properties.type)),
                    (this.name_widget.value = e),
                    (this.name_in_graph = e));
            } else "type" == t && this.updateType();
        }),
        (n.prototype.updateType = function () {
            var t = this.properties.type;
            (this.type_widget && (this.type_widget.value = t),
                this.inputs[0].type != t &&
                    (("action" != t && "event" != t) || (t = e.EVENT),
                    e.isValidConnection(this.inputs[0].type, t) || this.disconnectInput(0),
                    (this.inputs[0].type = t)),
                this.graph && this.name_in_graph && this.graph.changeOutputType(this.name_in_graph, t));
        }),
        (n.prototype.onExecute = function () {
            ((this._value = this.getInputData(0)), this.graph.setOutputData(this.properties.name, this._value));
        }),
        (n.prototype.onAction = function (t, i) {
            this.properties.type == e.ACTION && this.graph.trigger(this.properties.name, i);
        }),
        (n.prototype.onRemoved = function () {
            this.name_in_graph && this.graph.removeOutput(this.name_in_graph);
        }),
        (n.prototype.getTitle = function () {
            return this.flags.collapsed ? this.properties.name : this.title;
        }),
        (e.GraphOutput = n),
        e.registerNode("graph/output", n),
        (r.title = "Const Number"),
        (r.desc = "Constant number"),
        (r.prototype.onExecute = function () {
            this.setOutputData(0, parseFloat(this.properties["value"]));
        }),
        (r.prototype.getTitle = function () {
            return this.flags.collapsed ? this.properties.value : this.title;
        }),
        (r.prototype.setValue = function (t) {
            this.setProperty("value", t);
        }),
        (r.prototype.onDrawBackground = function (t) {
            this.outputs[0].label = this.properties["value"].toFixed(3);
        }),
        e.registerNode("basic/const", r),
        (a.title = "Const Boolean"),
        (a.desc = "Constant boolean"),
        (a.prototype.getTitle = r.prototype.getTitle),
        (a.prototype.onExecute = function () {
            this.setOutputData(0, this.properties["value"]);
        }),
        (a.prototype.setValue = r.prototype.setValue),
        (a.prototype.onGetInputs = function () {
            return [["toggle", e.ACTION]];
        }),
        (a.prototype.onAction = function (t) {
            this.setValue(!this.properties.value);
        }),
        e.registerNode("basic/boolean", a),
        (p.title = "Const String"),
        (p.desc = "Constant string"),
        (p.prototype.getTitle = r.prototype.getTitle),
        (p.prototype.onExecute = function () {
            this.setOutputData(0, this.properties["value"]);
        }),
        (p.prototype.setValue = r.prototype.setValue),
        (p.prototype.onDropFile = function (t) {
            var e = this,
                i = new FileReader();
            ((i.onload = function (t) {
                e.setProperty("value", t.target.result);
            }),
                i.readAsText(t));
        }),
        e.registerNode("basic/string", p),
        (u.title = "Const Object"),
        (u.desc = "Constant Object"),
        (u.prototype.onExecute = function () {
            this.setOutputData(0, this._object);
        }),
        e.registerNode("basic/object", u),
        (h.title = "Const File"),
        (h.desc = "Fetches a file from an url"),
        (h["@type"] = { type: "enum", values: ["text", "arraybuffer", "blob", "json"] }),
        (h.prototype.onPropertyChanged = function (t, e) {
            "url" == t && (null == e || "" == e ? (this._data = null) : this.fetchFile(e));
        }),
        (h.prototype.onExecute = function () {
            var t = this.getInputData(0) || this.properties.url;
            (!t || (t == this._url && this._type == this.properties.type) || this.fetchFile(t),
                this.setOutputData(0, this._data));
        }),
        (h.prototype.setValue = r.prototype.setValue),
        (h.prototype.fetchFile = function (t) {
            var i = this;
            if (!t || t.constructor !== String) return ((i._data = null), void (i.boxcolor = null));
            ((this._url = t),
                (this._type = this.properties.type),
                "http" == t.substr(0, 4) && e.proxy && (t = e.proxy + t.substr(t.indexOf(":") + 3)),
                fetch(t)
                    .then(function (t) {
                        if (!t.ok) throw new Error("File not found");
                        return "arraybuffer" == i.properties.type
                            ? t.arrayBuffer()
                            : "text" == i.properties.type
                              ? t.text()
                              : "json" == i.properties.type
                                ? t.json()
                                : "blob" == i.properties.type
                                  ? t.blob()
                                  : void 0;
                    })
                    .then(function (t) {
                        ((i._data = t), (i.boxcolor = "#AEA"));
                    })
                    .catch(function (e) {
                        ((i._data = null), (i.boxcolor = "red"), console.error("error fetching file:", t));
                    }));
        }),
        (h.prototype.onDropFile = function (t) {
            var e = this;
            ((this._url = t.name), (this._type = this.properties.type), (this.properties.url = t.name));
            var i = new FileReader();
            if (
                ((i.onload = function (t) {
                    e.boxcolor = "#AEA";
                    var i = t.target.result;
                    ("json" == e.properties.type && (i = JSON.parse(i)), (e._data = i));
                }),
                "arraybuffer" == e.properties.type)
            )
                i.readAsArrayBuffer(t);
            else if ("text" == e.properties.type || "json" == e.properties.type) i.readAsText(t);
            else if ("blob" == e.properties.type) return i.readAsBinaryString(t);
        }),
        e.registerNode("basic/file", h),
        (l.title = "JSON Parse"),
        (l.desc = "Parses JSON String into object"),
        (l.prototype.parse = function () {
            if (this._str)
                try {
                    ((this._str = this.getInputData(1)),
                        (this._obj = JSON.parse(this._str)),
                        (this.boxcolor = "#AEA"),
                        this.triggerSlot(0));
                } catch (t) {
                    this.boxcolor = "red";
                }
        }),
        (l.prototype.onExecute = function () {
            ((this._str = this.getInputData(1)), this.setOutputData(1, this._obj));
        }),
        (l.prototype.onAction = function (t) {
            "parse" == t && this.parse();
        }),
        e.registerNode("basic/jsonparse", l),
        (d.title = "Const Data"),
        (d.desc = "Constant Data"),
        (d.prototype.onPropertyChanged = function (t, e) {
            if (((this.widget.value = e), null != e && "" != e))
                try {
                    ((this._value = JSON.parse(e)), (this.boxcolor = "#AEA"));
                } catch (i) {
                    this.boxcolor = "red";
                }
        }),
        (d.prototype.onExecute = function () {
            this.setOutputData(0, this._value);
        }),
        (d.prototype.setValue = r.prototype.setValue),
        e.registerNode("basic/data", d),
        (c.title = "Const Array"),
        (c.desc = "Constant Array"),
        (c.prototype.onPropertyChanged = function (t, e) {
            if (((this.widget.value = e), null != e && "" != e))
                try {
                    ("[" != e[0] ? (this._value = JSON.parse("[" + e + "]")) : (this._value = JSON.parse(e)),
                        (this.boxcolor = "#AEA"));
                } catch (i) {
                    this.boxcolor = "red";
                }
        }),
        (c.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (t && t.length) {
                (this._value || (this._value = new Array()), (this._value.length = t.length));
                for (var e = 0; e < t.length; ++e) this._value[e] = t[e];
            }
            (this.setOutputData(0, this._value), this.setOutputData(1, (this._value && this._value.length) || 0));
        }),
        (c.prototype.setValue = r.prototype.setValue),
        e.registerNode("basic/array", c),
        (g.title = "Set Array"),
        (g.desc = "Sets index of array"),
        (g.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (t) {
                var e = this.getInputData(1);
                void 0 !== e &&
                    (this.properties.index && (t[Math.floor(this.properties.index)] = e), this.setOutputData(0, t));
            }
        }),
        e.registerNode("basic/set_array", g),
        (f.title = "Array[i]"),
        (f.desc = "Returns an element from an array"),
        (f.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1);
            (null == e && (e = this.properties.index),
                null != t && null != e && this.setOutputData(0, t[Math.floor(Number(e))]));
        }),
        e.registerNode("basic/array[]", f),
        (y.title = "Table[row][col]"),
        (y.desc = "Returns an element from a table"),
        (y.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1),
                i = this.getInputData(2);
            if (
                (null == e && (e = this.properties.row),
                null == i && (i = this.properties.column),
                null != t && null != e && null != i)
            ) {
                e = t[Math.floor(Number(e))];
                e ? this.setOutputData(0, e[Math.floor(Number(i))]) : this.setOutputData(0, null);
            }
        }),
        e.registerNode("basic/table[][]", y),
        (v.title = "Object property"),
        (v.desc = "Outputs the property of an object"),
        (v.prototype.setValue = function (t) {
            ((this.properties.value = t), (this.widget.value = t));
        }),
        (v.prototype.getTitle = function () {
            return this.flags.collapsed ? "in." + this.properties.value : this.title;
        }),
        (v.prototype.onPropertyChanged = function (t, e) {
            this.widget.value = e;
        }),
        (v.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && this.setOutputData(0, t[this.properties.value]);
        }),
        e.registerNode("basic/object_property", v),
        (b.title = "Object keys"),
        (b.desc = "Outputs an array with the keys of an object"),
        (b.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && this.setOutputData(0, Object.keys(t));
        }),
        e.registerNode("basic/object_keys", b),
        (_.title = "Set Object"),
        (_.desc = "Adds propertiesrty to object"),
        (_.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (t) {
                var e = this.getInputData(1);
                void 0 !== e &&
                    (this.properties.property && (t[this.properties.property] = e), this.setOutputData(0, t));
            }
        }),
        e.registerNode("basic/set_object", _),
        (m.title = "Merge Objects"),
        (m.desc = "Creates an object copying properties from others"),
        (m.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1),
                i = this._result;
            if (t) for (var s in t) i[s] = t[s];
            if (e) for (var s in e) i[s] = e[s];
            this.setOutputData(0, i);
        }),
        e.registerNode("basic/merge_objects", m),
        (I.title = "Variable"),
        (I.desc = "store/read variable value"),
        (I.LITEGRAPH = 0),
        (I.GRAPH = 1),
        (I.GLOBALSCOPE = 2),
        (I["@container"] = { type: "enum", values: { pandaui: I.LITEGRAPH, graph: I.GRAPH, global: I.GLOBALSCOPE } }),
        (I.prototype.onExecute = function () {
            var t = this.getContainer();
            if (this.isInputConnected(0))
                return (
                    (this.value = this.getInputData(0)),
                    (t[this.properties.varname] = this.value),
                    void this.setOutputData(0, this.value)
                );
            this.setOutputData(0, t[this.properties.varname]);
        }),
        (I.prototype.getContainer = function () {
            switch (this.properties.container) {
                case I.GRAPH:
                    return this.graph ? this.graph.vars : {};
                case I.GLOBALSCOPE:
                    return t;
                case I.LITEGRAPH:
                default:
                    return e.Globals;
            }
        }),
        (I.prototype.getTitle = function () {
            return this.properties.varname;
        }),
        e.registerNode("basic/variable", I),
        e.wrapFunctionAsNode("basic/length", O, [""], "number"),
        e.wrapFunctionAsNode(
            "basic/not",
            function (t) {
                return !t;
            },
            [""],
            "boolean",
        ),
        (w.title = "Download"),
        (w.desc = "Download some data"),
        (w.prototype.downloadAsFile = function () {
            if (null != this.value) {
                var t = null;
                t = this.value.constructor === String ? this.value : JSON.stringify(this.value);
                var e = new Blob([t]),
                    i = URL.createObjectURL(e),
                    s = document.createElement("a");
                (s.setAttribute("href", i),
                    s.setAttribute("download", this.properties.filename),
                    (s.style.display = "none"),
                    document.body.appendChild(s),
                    s.click(),
                    document.body.removeChild(s),
                    setTimeout(function () {
                        URL.revokeObjectURL(i);
                    }, 6e4));
            }
        }),
        (w.prototype.onAction = function (t, e) {
            var i = this;
            setTimeout(function () {
                i.downloadAsFile();
            }, 100);
        }),
        (w.prototype.onExecute = function () {
            this.inputs[0] && (this.value = this.getInputData(0));
        }),
        (w.prototype.getTitle = function () {
            return this.flags.collapsed ? this.properties.filename : this.title;
        }),
        e.registerNode("basic/download", w),
        (D.title = "Watch"),
        (D.desc = "Scrollable tree view of the input value"),
        (D.prototype.onConfigure = function () {
            (!this.size || this.size[0] < 260 || this.size[1] < 180) && (this.size = [340, 240]);
        }),
        (D.prototype.updateRows = function (t) {
            ((this.value = t),
                (this._treeRows = D.createRows(this.value)),
                (this._scroll = Math.min(this._scroll, Math.max(0, this._treeRows.length - this.visibleRowCount()))));
        }),
        (D.prototype.onExecute = function () {
            this.updateRows(this.inputs[0] ? this.getInputData(0) : void 0);
        }),
        (D.prototype.getTitle = function () {
            return this.flags.collapsed ? "Watch" : this.title;
        }),
        (D.formatLeaf = function (t) {
            return null == t
                ? "null"
                : "number" === typeof t
                  ? isFinite(t)
                      ? t.toFixed(3)
                      : String(t)
                  : "string" === typeof t
                    ? '"' + t + '"'
                    : "boolean" === typeof t
                      ? String(t)
                      : t && t.__geo
                        ? String(t.__geo).replace(/^(?:panda|rhino)\./, "") + " (geometry)"
                        : String(t);
        }),
        (D.appendValueRows = function (t, e, i, s, o) {
            var n = s ? s + ": " : "";
            if (null != e && "object" === typeof e)
                if (-1 === o.indexOf(e))
                    if (i >= 6) t.push({ level: i, text: n + "...", leaf: !0 });
                    else {
                        if ((o.push(e), Array.isArray(e))) {
                            t.push({ level: i, text: n + "[" + e.length + "]", branch: !0 });
                            for (var r = 0; r < e.length; r++) D.appendValueRows(t, e[r], i + 1, "[" + r + "]", o);
                        } else if (e.__geo) t.push({ level: i, text: n + D.formatLeaf(e), leaf: !0 });
                        else {
                            var a = Object.keys(e);
                            t.push({ level: i, text: n + "{" + a.length + "}", branch: !0 });
                            for (var p = 0; p < a.length; p++) D.appendValueRows(t, e[a[p]], i + 1, a[p], o);
                        }
                        o.pop();
                    }
                else t.push({ level: i, text: n + "[circular]", leaf: !0 });
            else t.push({ level: i, text: n + D.formatLeaf(e), leaf: !0 });
        }),
        (D.createRows = function (t) {
            var e = [],
                i = t && t._isDualData && t.display ? t.display.treeData : t;
            if (!i || "object" !== typeof i || !Array.isArray(i.datas) || !Array.isArray(i.path))
                return (D.appendValueRows(e, t, 0, "value", []), e);
            for (var s = {}, o = 0; o < i.datas.length; o++) {
                for (
                    var n = i.path[o] || i.path[0] || "{0}", r = String(n).replace(/[{}]/g, "").split(";"), a = 0;
                    a < r.length;
                    a++
                ) {
                    var p = "{" + r.slice(0, a + 1).join(";") + "}";
                    s[p] || ((s[p] = !0), e.push({ level: a, text: p, branch: !0 }));
                }
                D.appendValueRows(e, i.datas[o], r.length, "[" + o + "]", []);
            }
            return (e.length || e.push({ level: 0, text: "{}", leaf: !0 }), e);
        }),
        (D.prototype.visibleRowCount = function () {
            return Math.max(1, Math.floor((this.size[1] - 34) / this._rowHeight));
        }),
        (D.prototype.onDrawBackground = function () {
            this.inputs[0].label = "";
        }),
        (D.prototype.onDrawForeground = function (t) {
            if (!this.flags.collapsed) {
                var e = this.inputs[0] && null != this.inputs[0].link ? this.getInputData(0) : void 0;
                this.inputs[0] && null != this.inputs[0].link && e !== this.value && this.updateRows(e);
                var i = this.size[0],
                    s = 24,
                    o = this.size[1] - s - 8,
                    n = this._rowHeight,
                    r = this._treeRows.length
                        ? this._treeRows
                        : D.createRows(this.inputs[0] && null != this.inputs[0].link ? void 0 : this.value),
                    a = Math.floor(this._scroll),
                    p = this.visibleRowCount();
                (t.save(),
                    (t.fillStyle = "rgba(15, 18, 22, 0.30)"),
                    t.fillRect(8, s, i - 18, o),
                    t.beginPath(),
                    t.rect(8, s, i - 18, o),
                    t.clip(),
                    (t.font = "12px Arial"),
                    (t.textBaseline = "middle"));
                for (var u = a; u < Math.min(r.length, a + p + 1); u++) {
                    var h = r[u],
                        l = s + (u - a) * n + 0.5 * n;
                    ((u - a) % 2 === 0 &&
                        ((t.fillStyle = "rgba(255,255,255,0.035)"), t.fillRect(9, l - 0.5 * n, i - 20, n)),
                        (t.fillStyle = h.branch ? "#9cc8ff" : "#e4e8ed"),
                        t.fillText(h.text, 16 + 14 * h.level, l));
                }
                if ((t.restore(), r.length > p)) {
                    var d = o,
                        c = Math.max(20, (d * p) / r.length),
                        g = d - c,
                        f = Math.max(1, r.length - p),
                        y = s + (g * this._scroll) / f;
                    ((t.fillStyle = "rgba(255,255,255,0.18)"),
                        t.fillRect(i - 8, s, 3, d),
                        (t.fillStyle = "rgba(130,190,255,0.80)"),
                        t.fillRect(i - 8, y, 3, c));
                }
            }
        }),
        (D.prototype.onMouseWheel = function (t) {
            if (this.flags.collapsed) return !1;
            var e = this._treeRows.length
                    ? this._treeRows
                    : D.createRows(this.inputs[0] && null != this.inputs[0].link ? void 0 : this.value),
                i = Math.max(0, e.length - this.visibleRowCount());
            if (!i) return !1;
            var s = null != t.deltaY ? t.deltaY : -(t.wheelDeltaY || t.wheelDelta || 0);
            return (
                !!s &&
                ((this._scroll = Math.max(0, Math.min(i, this._scroll + (s > 0 ? 3 : -3)))),
                this.setDirtyCanvas(!0, !1),
                !0)
            );
        }),
        e.registerNode("basic/watch", D),
        (T.title = "Cast"),
        (T.desc = "Allows to connect different types"),
        (T.prototype.onExecute = function () {
            this.setOutputData(0, this.getInputData(0));
        }),
        e.registerNode("basic/cast", T),
        (x.title = "Console"),
        (x.desc = "Show value inside the console"),
        (x.prototype.onAction = function (t, e) {
            var i = this.getInputData(1);
            (i || (i = this.properties.msg),
                i || (i = "Event: " + e),
                "log" == t ? console.log(i) : "warn" == t ? console.warn(i) : "error" == t && console.error(i));
        }),
        (x.prototype.onExecute = function () {
            var t = this.getInputData(1);
            (t || (t = this.properties.msg),
                null != t && "undefined" != typeof t && ((this.properties.msg = t), console.log(t)));
        }),
        (x.prototype.onGetInputs = function () {
            return [
                ["log", e.ACTION],
                ["warn", e.ACTION],
                ["error", e.ACTION],
            ];
        }),
        e.registerNode("basic/console", x),
        (E.title = "Alert"),
        (E.desc = "Show an alert window"),
        (E.color = "#510"),
        (E.prototype.onConfigure = function (t) {
            this.widget.value = t.properties.msg;
        }),
        (E.prototype.onAction = function (t, e) {
            var i = this.properties.msg;
            setTimeout(function () {
                alert(i);
            }, 10);
        }),
        e.registerNode("basic/alert", E),
        (N.prototype.onConfigure = function (t) {
            t.properties.onExecute && e.allow_scripts
                ? this.compileCode(t.properties.onExecute)
                : console.warn("Script not compiled, PandaUI.allow_scripts is false");
        }),
        (N.title = "Script"),
        (N.desc = "executes a code (max 256 characters)"),
        (N.widgets_info = { onExecute: { type: "code" } }),
        (N.prototype.onPropertyChanged = function (t, i) {
            "onExecute" == t && e.allow_scripts
                ? this.compileCode(i)
                : console.warn("Script not compiled, PandaUI.allow_scripts is false");
        }),
        (N.prototype.compileCode = function (t) {
            if (((this._func = null), t.length > 256)) console.warn("Script too long, max 256 chars");
            else {
                for (
                    var e = t.toLowerCase(),
                        i = ["script", "body", "document", "eval", "nodescript", "function"],
                        s = 0;
                    s < i.length;
                    ++s
                )
                    if (-1 != e.indexOf(i[s])) return void console.warn("invalid script");
                try {
                    this._func = new Function("A", "B", "C", "DATA", "node", t);
                } catch (o) {
                    (console.error("Error parsing script"), console.error(o));
                }
            }
        }),
        (N.prototype.onExecute = function () {
            if (this._func)
                try {
                    var t = this.getInputData(0),
                        e = this.getInputData(1),
                        i = this.getInputData(2);
                    this.setOutputData(0, this._func(t, e, i, this.data, this));
                } catch (s) {
                    (console.error("Error in script"), console.error(s));
                }
        }),
        (N.prototype.onGetOutputs = function () {
            return [["C", ""]];
        }),
        e.registerNode("basic/script", N),
        (A.values = ["==", "!="]),
        (A["@OP"] = { type: "enum", title: "operation", values: A.values }),
        (A.title = "Compare *"),
        (A.desc = "evaluates condition between A and B"),
        (A.prototype.getTitle = function () {
            return "*A " + this.properties.OP + " *B";
        }),
        (A.prototype.onExecute = function () {
            var t = this.getInputData(0);
            void 0 === t ? (t = this.properties.A) : (this.properties.A = t);
            var e = this.getInputData(1);
            void 0 === e ? (e = this.properties.B) : (this.properties.B = e);
            var i = !1;
            if (typeof t == typeof e)
                switch (this.properties.OP) {
                    case "==":
                    case "!=":
                        switch (((i = !0), typeof t)) {
                            case "object":
                                var s = Object.getOwnPropertyNames(t),
                                    o = Object.getOwnPropertyNames(e);
                                if (s.length != o.length) {
                                    i = !1;
                                    break;
                                }
                                for (var n = 0; n < s.length; n++) {
                                    var r = s[n];
                                    if (t[r] !== e[r]) {
                                        i = !1;
                                        break;
                                    }
                                }
                                break;
                            default:
                                i = t == e;
                        }
                        "!=" == this.properties.OP && (i = !i);
                        break;
                }
            (this.setOutputData(0, i), this.setOutputData(1, !i));
        }),
        e.registerNode("basic/CompareValues", A));
})(this);
