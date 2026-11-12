// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI;
    function o() {
        (this.addInput("sel", "number"),
            this.addInput("A"),
            this.addInput("B"),
            this.addInput("C"),
            this.addInput("D"),
            this.addOutput("out"),
            (this.selected = 0));
    }
    function n() {
        ((this.properties = { sequence: "A,B,C" }),
            this.addInput("index", "number"),
            this.addInput("seq"),
            this.addOutput("out"),
            (this.index = 0),
            (this.values = this.properties.sequence.split(",")));
    }
    function i() {
        ((this.properties = {}),
            this.addInput("a", "boolean"),
            this.addInput("b", "boolean"),
            this.addOutput("out", "boolean"));
    }
    function u() {
        ((this.properties = {}),
            this.addInput("a", "boolean"),
            this.addInput("b", "boolean"),
            this.addOutput("out", "boolean"));
    }
    function s() {
        ((this.properties = {}), this.addInput("in", "boolean"), this.addOutput("out", "boolean"));
    }
    function a() {
        ((this.properties = {}),
            this.addInput("a", "boolean"),
            this.addInput("b", "boolean"),
            this.addOutput("out", "boolean"));
    }
    function r() {
        ((this.properties = {}),
            this.addInput("onTrigger", e.ACTION),
            this.addInput("condition", "boolean"),
            this.addOutput("true", e.EVENT),
            this.addOutput("false", e.EVENT),
            (this.mode = e.ON_TRIGGER));
    }
    ((o.title = "Selector"),
        (o.desc = "selects an output"),
        (o.prototype.onDrawBackground = function (t) {
            if (!this.flags.collapsed) {
                t.fillStyle = "#AFB";
                var o = (this.selected + 1) * e.NODE_SLOT_HEIGHT + 6;
                (t.beginPath(),
                    t.moveTo(50, o),
                    t.lineTo(50, o + e.NODE_SLOT_HEIGHT),
                    t.lineTo(34, o + 0.5 * e.NODE_SLOT_HEIGHT),
                    t.fill());
            }
        }),
        (o.prototype.onExecute = function () {
            var t = this.getInputData(0);
            ((null != t && t.constructor === Number) || (t = 0),
                (this.selected = t = Math.round(t) % (this.inputs.length - 1)));
            var e = this.getInputData(t + 1);
            void 0 !== e && this.setOutputData(0, e);
        }),
        (o.prototype.onGetInputs = function () {
            return [
                ["E", 0],
                ["F", 0],
                ["G", 0],
                ["H", 0],
            ];
        }),
        e.registerNode("logic/selector", o),
        (n.title = "Sequence"),
        (n.desc = "select one element from a sequence from a string"),
        (n.prototype.onPropertyChanged = function (t, e) {
            "sequence" == t && (this.values = e.split(","));
        }),
        (n.prototype.onExecute = function () {
            var t = this.getInputData(1);
            t && t != this.current_sequence && ((this.values = t.split(",")), (this.current_sequence = t));
            var e = this.getInputData(0);
            (null == e && (e = 0),
                (this.index = e = Math.round(e) % this.values.length),
                this.setOutputData(0, this.values[e]));
        }),
        e.registerNode("logic/sequence", n),
        (i.title = "AND"),
        (i.desc = "Return true if all inputs are true"),
        (i.prototype.onExecute = function () {
            var t = !0;
            for (var e in this.inputs)
                if (!this.getInputData(e)) {
                    t = !1;
                    break;
                }
            this.setOutputData(0, t);
        }),
        (i.prototype.onGetInputs = function () {
            return [["and", "boolean"]];
        }),
        e.registerNode("logic/AND", i),
        (u.title = "OR"),
        (u.desc = "Return true if at least one input is true"),
        (u.prototype.onExecute = function () {
            var t = !1;
            for (var e in this.inputs)
                if (this.getInputData(e)) {
                    t = !0;
                    break;
                }
            this.setOutputData(0, t);
        }),
        (u.prototype.onGetInputs = function () {
            return [["or", "boolean"]];
        }),
        e.registerNode("logic/OR", u),
        (s.title = "NOT"),
        (s.desc = "Return the logical negation"),
        (s.prototype.onExecute = function () {
            var t = !this.getInputData(0);
            this.setOutputData(0, t);
        }),
        e.registerNode("logic/NOT", s),
        (a.title = "bool == bool"),
        (a.desc = "Compare for logical equality"),
        (a.prototype.onExecute = function () {
            var t = null,
                e = !0;
            for (var o in this.inputs)
                if (null === t) t = this.getInputData(o);
                else if (t != this.getInputData(o)) {
                    e = !1;
                    break;
                }
            this.setOutputData(0, e);
        }),
        (a.prototype.onGetInputs = function () {
            return [["bool", "boolean"]];
        }),
        e.registerNode("logic/CompareBool", a),
        (r.title = "Branch"),
        (r.desc = "Branch execution on condition"),
        (r.prototype.onExecute = function (t, e) {
            var o = this.getInputData(1);
            o ? this.triggerSlot(0) : this.triggerSlot(1);
        }),
        e.registerNode("logic/IF", r));
})(this);
