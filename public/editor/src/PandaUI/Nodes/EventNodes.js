// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI;
    function i() {
        ((this.size = [60, 30]), this.addInput("event", e.ACTION));
    }
    function n() {
        ((this.size = [60, 30]),
            this.addInput("if", ""),
            this.addOutput("true", e.EVENT),
            this.addOutput("change", e.EVENT),
            this.addOutput("false", e.EVENT),
            (this.properties = { only_on_change: !0 }),
            (this.prev = 0));
    }
    function s() {
        var t = this;
        (this.addInput("", e.ACTION),
            this.addInput("", e.ACTION),
            this.addInput("", e.ACTION),
            this.addOutput("", e.EVENT),
            this.addOutput("", e.EVENT),
            this.addOutput("", e.EVENT),
            this.addWidget("button", "+", null, function () {
                (t.addInput("", e.ACTION), t.addOutput("", e.EVENT));
            }),
            (this.size = [90, 70]),
            (this.flags = { horizontal: !0, render_box: !1 }));
    }
    function o() {
        var t = this;
        (this.addInput("", e.ACTION),
            this.addInput("", e.ACTION),
            this.addOutput("", e.EVENT),
            this.addWidget("button", "+", null, function () {
                (t.addInput("", e.ACTION), (t.size[0] = 90));
            }),
            (this.size = [90, 70]),
            (this.ready = []));
    }
    function r() {
        var t = this;
        ((this.properties = { index: 0 }),
            this.addInput("index", "number"),
            this.addInput("step", e.ACTION),
            this.addInput("reset", e.ACTION),
            this.addOutput("index", "number"),
            this.addOutput("", e.EVENT),
            this.addOutput("", e.EVENT),
            this.addOutput("", e.EVENT, { removable: !0 }),
            this.addWidget("button", "+", null, function () {
                t.addOutput("", e.EVENT, { removable: !0 });
            }),
            (this.size = [120, 120]),
            (this.flags = { render_box: !1 }));
    }
    function u() {
        ((this.size = [60, 30]),
            this.addInput("event", e.ACTION),
            this.addOutput("event", e.EVENT),
            (this.properties = { equal_to: "", has_property: "", property_equal_to: "" }));
    }
    function a() {
        (this.addInput("in", e.ACTION),
            this.addInput("cond", "boolean"),
            this.addOutput("true", e.EVENT),
            this.addOutput("false", e.EVENT),
            (this.size = [120, 60]),
            (this._value = !1));
    }
    function p() {
        (this.addInput("inc", e.ACTION),
            this.addInput("dec", e.ACTION),
            this.addInput("reset", e.ACTION),
            this.addOutput("change", e.EVENT),
            this.addOutput("num", "number"),
            this.addProperty("doCountExecution", !1, "boolean", { name: "Count Executions" }),
            this.addWidget("toggle", "Count Exec.", this.properties.doCountExecution, "doCountExecution"),
            (this.num = 0));
    }
    function h() {
        ((this.size = [60, 30]),
            this.addProperty("time_in_ms", 1e3),
            this.addInput("event", e.ACTION),
            this.addOutput("on_time", e.EVENT),
            (this._pending = []));
    }
    function d() {
        (this.addProperty("interval", 1e3),
            this.addProperty("event", "tick"),
            this.addOutput("on_tick", e.EVENT),
            (this.time = 0),
            (this.last_interval = 1e3),
            (this.triggered = !1));
    }
    function l() {
        (this.addInput("go", e.ACTION),
            this.addInput("green", e.ACTION),
            this.addInput("red", e.ACTION),
            this.addOutput("continue", e.EVENT),
            this.addOutput("blocked", e.EVENT),
            this.addOutput("is_green", "boolean"),
            (this._ready = !1),
            (this.properties = {}));
        var t = this;
        this.addWidget("button", "reset", "", function () {
            t._ready = !1;
        });
    }
    function c() {
        (this.addInput("in", e.ACTION),
            this.addInput("reset", e.ACTION),
            this.addOutput("out", e.EVENT),
            (this._once = !1),
            (this.properties = {}));
        var t = this;
        this.addWidget("button", "reset", "", function () {
            t._once = !1;
        });
    }
    function g() {
        (this.addInput("data", 0),
            this.addInput("assign", e.ACTION),
            this.addOutput("data", 0),
            (this._last_value = null),
            (this.properties = { data: null, serialize: !0 }));
        var t = this;
        this.addWidget("button", "store", "", function () {
            t.properties.data = t._last_value;
        });
    }
    ((i.title = "Log Event"),
        (i.desc = "Log event in console"),
        (i.prototype.onAction = function (t, e, i) {
            console.log(t, e);
        }),
        e.registerNode("events/log", i),
        (n.title = "TriggerEvent"),
        (n.desc = "Triggers event if input evaluates to true"),
        (n.prototype.onExecute = function (t, e) {
            var i = this.getInputData(0),
                n = i != this.prev;
            0 === this.prev && (n = !1);
            var s = (n && this.properties.only_on_change) || (!n && !this.properties.only_on_change);
            (i && s && this.triggerSlot(0, t, null, e),
                !i && s && this.triggerSlot(2, t, null, e),
                n && this.triggerSlot(1, t, null, e),
                (this.prev = i));
        }),
        e.registerNode("events/trigger", n),
        (s.title = "Sequence"),
        (s.desc = "Triggers a sequence of events when an event arrives"),
        (s.prototype.getTitle = function () {
            return "";
        }),
        (s.prototype.onAction = function (t, e, i) {
            if (this.outputs) {
                i = i || {};
                for (var n = 0; n < this.outputs.length; ++n) {
                    this.outputs[n];
                    (i.action_call
                        ? (i.action_call = i.action_call + "_seq_" + n)
                        : (i.action_call =
                              this.id + "_" + (t || "action") + "_seq_" + n + "_" + Math.floor(9999 * Math.random())),
                        this.triggerSlot(n, e, null, i));
                }
            }
        }),
        e.registerNode("events/sequence", s),
        (o.title = "WaitAll"),
        (o.desc = "Wait until all input events arrive then triggers output"),
        (o.prototype.getTitle = function () {
            return "";
        }),
        (o.prototype.onDrawBackground = function (t) {
            if (!this.flags.collapsed)
                for (var i = 0; i < this.inputs.length; ++i) {
                    var n = i * e.NODE_SLOT_HEIGHT + 10;
                    ((t.fillStyle = this.ready[i] ? "#AFB" : "#000"), t.fillRect(20, n, 10, 10));
                }
        }),
        (o.prototype.onAction = function (t, e, i, n) {
            if (null != n) {
                ((this.ready.length = this.outputs.length), (this.ready[n] = !0));
                for (var s = 0; s < this.ready.length; ++s) if (!this.ready[s]) return;
                (this.reset(), this.triggerSlot(0));
            }
        }),
        (o.prototype.reset = function () {
            this.ready.length = 0;
        }),
        e.registerNode("events/waitAll", o),
        (r.title = "Stepper"),
        (r.desc = "Trigger events sequentially when an tick arrives"),
        (r.prototype.onDrawBackground = function (t) {
            if (!this.flags.collapsed) {
                var i = this.properties.index || 0;
                t.fillStyle = "#AFB";
                var n = this.size[0],
                    s = (i + 1) * e.NODE_SLOT_HEIGHT + 4;
                (t.beginPath(),
                    t.moveTo(n - 30, s),
                    t.lineTo(n - 30, s + e.NODE_SLOT_HEIGHT),
                    t.lineTo(n - 15, s + 0.5 * e.NODE_SLOT_HEIGHT),
                    t.fill());
            }
        }),
        (r.prototype.onExecute = function () {
            var t = this.getInputData(0);
            (null != t &&
                ((t = Math.floor(t)),
                (t = clamp(t, 0, this.outputs ? this.outputs.length - 2 : 0)),
                t != this.properties.index && ((this.properties.index = t), this.triggerSlot(t + 1))),
                this.setOutputData(0, this.properties.index));
        }),
        (r.prototype.onAction = function (t, e) {
            if ("reset" == t) this.properties.index = 0;
            else if ("step" == t) {
                this.triggerSlot(this.properties.index + 1, e);
                var i = this.outputs ? this.outputs.length - 1 : 0;
                this.properties.index = (this.properties.index + 1) % i;
            }
        }),
        e.registerNode("events/stepper", r),
        (u.title = "Filter Event"),
        (u.desc = "Blocks events that do not match the filter"),
        (u.prototype.onAction = function (t, e, i) {
            if (null != e && (!this.properties.equal_to || this.properties.equal_to == e)) {
                if (this.properties.has_property) {
                    var n = e[this.properties.has_property];
                    if (null == n) return;
                    if (this.properties.property_equal_to && this.properties.property_equal_to != n) return;
                }
                this.triggerSlot(0, e, null, i);
            }
        }),
        e.registerNode("events/filter", u),
        (a.title = "Branch"),
        (a.desc = "If condition is true, outputs triggers true, otherwise false"),
        (a.prototype.onExecute = function () {
            this._value = this.getInputData(1);
        }),
        (a.prototype.onAction = function (t, e, i) {
            ((this._value = this.getInputData(1)), this.triggerSlot(this._value ? 0 : 1, e, null, i));
        }),
        e.registerNode("events/branch", a),
        (p.title = "Counter"),
        (p.desc = "Counts events"),
        (p.prototype.getTitle = function () {
            return this.flags.collapsed ? String(this.num) : this.title;
        }),
        (p.prototype.onAction = function (t, e, i) {
            var n = this.num;
            ("inc" == t ? (this.num += 1) : "dec" == t ? (this.num -= 1) : "reset" == t && (this.num = 0),
                this.num != n && this.trigger("change", this.num));
        }),
        (p.prototype.onDrawBackground = function (t) {
            this.flags.collapsed ||
                ((t.fillStyle = "#AAA"),
                (t.font = "20px Arial"),
                (t.textAlign = "center"),
                t.fillText(this.num, 0.5 * this.size[0], 0.5 * this.size[1]));
        }),
        (p.prototype.onExecute = function () {
            (this.properties.doCountExecution && (this.num += 1), this.setOutputData(1, this.num));
        }),
        e.registerNode("events/counter", p),
        (h.title = "Delay"),
        (h.desc = "Delays one event"),
        (h.prototype.onAction = function (t, e, i) {
            var n = this.properties.time_in_ms;
            n <= 0 ? this.trigger(null, e, i) : this._pending.push([n, e]);
        }),
        (h.prototype.onExecute = function (t, e) {
            var i = 1e3 * this.graph.elapsed_time;
            this.isInputConnected(1) && (this.properties.time_in_ms = this.getInputData(1));
            for (var n = 0; n < this._pending.length; ++n) {
                var s = this._pending[n];
                ((s[0] -= i), s[0] > 0 || (this._pending.splice(n, 1), --n, this.trigger(null, s[1], e)));
            }
        }),
        (h.prototype.onGetInputs = function () {
            return [
                ["event", e.ACTION],
                ["time_in_ms", "number"],
            ];
        }),
        e.registerNode("events/delay", h),
        (d.title = "Timer"),
        (d.desc = "Sends an event every N milliseconds"),
        (d.prototype.onStart = function () {
            this.time = 0;
        }),
        (d.prototype.getTitle = function () {
            return "Timer: " + this.last_interval.toString() + "ms";
        }),
        (d.on_color = "#AAA"),
        (d.off_color = "#222"),
        (d.prototype.onDrawBackground = function () {
            ((this.boxcolor = this.triggered ? d.on_color : d.off_color), (this.triggered = !1));
        }),
        (d.prototype.onExecute = function () {
            var t = 1e3 * this.graph.elapsed_time,
                e = 0 == this.time;
            ((this.time += t),
                (this.last_interval = Math.max(1, 0 | this.getInputOrProperty("interval"))),
                e || !(this.time < this.last_interval || isNaN(this.last_interval))
                    ? ((this.triggered = !0),
                      (this.time = this.time % this.last_interval),
                      this.trigger("on_tick", this.properties.event),
                      this.inputs && this.inputs.length > 1 && this.inputs[1] && this.setOutputData(1, !0))
                    : this.inputs && this.inputs.length > 1 && this.inputs[1] && this.setOutputData(1, !1));
        }),
        (d.prototype.onGetInputs = function () {
            return [["interval", "number"]];
        }),
        (d.prototype.onGetOutputs = function () {
            return [["tick", "boolean"]];
        }),
        e.registerNode("events/timer", d),
        (l.title = "Semaphore Event"),
        (l.desc = "Until both events are not triggered, it doesnt continue."),
        (l.prototype.onExecute = function () {
            (this.setOutputData(1, this._ready), (this.boxcolor = this._ready ? "#9F9" : "#FA5"));
        }),
        (l.prototype.onAction = function (t, e) {
            "go" == t
                ? this.triggerSlot(this._ready ? 0 : 1)
                : "green" == t
                  ? (this._ready = !0)
                  : "red" == t && (this._ready = !1);
        }),
        e.registerNode("events/semaphore", l),
        (c.title = "Once"),
        (c.desc = "Only passes an event once, then gets locked"),
        (c.prototype.onAction = function (t, e) {
            "in" != t || this._once ? "reset" == t && (this._once = !1) : ((this._once = !0), this.triggerSlot(0, e));
        }),
        e.registerNode("events/once", c),
        (g.title = "Data Store"),
        (g.desc = "Stores data and only changes when event is received"),
        (g.prototype.onExecute = function () {
            ((this._last_value = this.getInputData(0)), this.setOutputData(0, this.properties.data));
        }),
        (g.prototype.onAction = function (t, e, i) {
            this.properties.data = this._last_value;
        }),
        (g.prototype.onSerialize = function (t) {
            null != t.data &&
                (0 == this.properties.serialize ||
                    (t.data.constructor !== String &&
                        t.data.constructor !== Number &&
                        t.data.constructor !== Boolean &&
                        t.data.constructor !== Array &&
                        t.data.constructor !== Object)) &&
                (t.data = null);
        }),
        e.registerNode("basic/data_store", g));
})(this);
