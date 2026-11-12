// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI;
    function i() {
        (this.addInput("in", 0), this.addOutput("out", 0), (this.size = [80, 30]));
    }
    function r() {
        (this.addInput("in"), this.addOutput("out"), (this.size = [80, 30]));
    }
    function s() {
        (this.addInput("in"), this.addOutput("out"));
    }
    function a() {
        (this.addInput("in"), this.addOutput("out"), (this.size = [100, 30]));
    }
    function n() {
        (this.addInput("in"), this.addOutput("out"), (this.size = [100, 30]));
    }
    function o() {
        (this.addInput("in"), this.addOutput("out"), (this.size = [100, 30]));
    }
    function u() {
        (this.addInput("in"),
            this.addProperty("type", "number", { type: "enum", values: ["number", "integer", "string", "boolean"] }),
            this.addOutput("out"),
            (this.size = [120, 60]));
    }
    function p() {
        (this.addInput("in", "number", { locked: !0 }),
            this.addOutput("out", "number", { locked: !0 }),
            this.addOutput("clamped", "number", { locked: !0 }),
            this.addProperty("in", 0),
            this.addProperty("in_min", 0),
            this.addProperty("in_max", 1),
            this.addProperty("out_min", 0),
            this.addProperty("out_max", 1),
            (this.size = [120, 50]));
    }
    function h() {
        (this.addOutput("value", "number"),
            this.addProperty("min", 0),
            this.addProperty("max", 1),
            (this.size = [80, 30]));
    }
    function d() {
        (this.addInput("in", "number"),
            this.addOutput("out", "number"),
            this.addProperty("min", 0),
            this.addProperty("max", 1),
            this.addProperty("smooth", !0),
            this.addProperty("seed", 0),
            this.addProperty("octaves", 1),
            this.addProperty("persistence", 0.8),
            this.addProperty("speed", 1),
            (this.size = [90, 30]));
    }
    function c() {
        (this.addOutput("out", "number"),
            this.addProperty("min_time", 1),
            this.addProperty("max_time", 2),
            this.addProperty("duration", 0.2),
            (this.size = [90, 30]),
            (this._remaining_time = 0),
            (this._blink_time = 0));
    }
    function l() {
        (this.addInput("in", "number"),
            this.addOutput("out", "number"),
            (this.size = [80, 30]),
            this.addProperty("min", 0),
            this.addProperty("max", 1));
    }
    function m() {
        ((this.properties = { f: 0.5 }),
            this.addInput("A", "number"),
            this.addInput("B", "number"),
            this.addOutput("out", "number"));
    }
    function v() {
        (this.addInput("in", "number"), this.addOutput("out", "number"), (this.size = [80, 30]));
    }
    function f() {
        (this.addInput("in", "number"), this.addOutput("out", "number"), (this.size = [80, 30]));
    }
    function y() {
        (this.addInput("in", "number"), this.addOutput("out", "number"), (this.size = [80, 30]));
    }
    function b() {
        (this.addInput("in", "number"),
            this.addOutput("out", "number"),
            (this.size = [80, 30]),
            (this.properties = { A: 0, B: 1 }));
    }
    function g() {
        (this.addInput("in", "number", { label: "" }),
            this.addOutput("out", "number", { label: "" }),
            (this.size = [80, 30]),
            this.addProperty("factor", 1));
    }
    function O() {
        (this.addInput("v", "boolean"), this.addInput("A"), this.addInput("B"), this.addOutput("out"));
    }
    function x() {
        (this.addInput("in", "number"),
            this.addOutput("out", "number"),
            (this.size = [80, 30]),
            this.addProperty("samples", 10),
            (this._values = new Float32Array(10)),
            (this._current = 0));
    }
    function _() {
        (this.addInput("in", "number"),
            this.addOutput("out", "number"),
            this.addProperty("factor", 0.1),
            (this.size = [80, 30]),
            (this._value = null));
    }
    function I() {
        (this.addInput("A", "number,array,object"),
            this.addInput("B", "number"),
            this.addOutput("=", "number"),
            this.addProperty("A", 1),
            this.addProperty("B", 1),
            this.addProperty("OP", "+", "enum", { values: I.values }),
            (this._func = I.funcs[this.properties.OP]),
            (this._result = []));
    }
    function D() {
        (this.addInput("A", "number"),
            this.addInput("B", "number"),
            this.addOutput("A==B", "boolean"),
            this.addOutput("A!=B", "boolean"),
            this.addProperty("A", 0),
            this.addProperty("B", 0));
    }
    function A() {
        (this.addInput("A", "number"),
            this.addInput("B", "number"),
            this.addOutput("true", "boolean"),
            this.addOutput("false", "boolean"),
            this.addProperty("A", 1),
            this.addProperty("B", 1),
            this.addProperty("OP", ">", "enum", { values: A.values }),
            this.addWidget("combo", "Cond.", this.properties.OP, { property: "OP", values: A.values }),
            (this.size = [80, 60]));
    }
    function B() {
        (this.addInput("in", 0),
            this.addInput("cond", "boolean"),
            this.addOutput("true", 0),
            this.addOutput("false", 0),
            (this.size = [80, 60]));
    }
    function P() {
        (this.addInput("inc", "number"),
            this.addOutput("total", "number"),
            this.addProperty("increment", 1),
            this.addProperty("value", 0));
    }
    function N() {
        (this.addInput("v", "number"),
            this.addOutput("sin", "number"),
            this.addProperty("amplitude", 1),
            this.addProperty("offset", 0),
            (this.bgImageUrl = "nodes/imgs/icon-sin.png"));
    }
    function E() {
        (this.addInput("x", "number"),
            this.addInput("y", "number"),
            this.addOutput("", "number"),
            (this.properties = { x: 1, y: 1, formula: "x+y" }),
            (this.code_widget = this.addWidget("text", "F(x,y)", this.properties.formula, function (t, e, i) {
                i.properties.formula = t;
            })),
            this.addWidget("toggle", "allow", e.allow_scripts, function (t) {
                e.allow_scripts = t;
            }),
            (this._func = null));
    }
    function T() {
        (this.addInput("vec2", "vec2"), this.addOutput("x", "number"), this.addOutput("y", "number"));
    }
    function k() {
        (this.addInputs([
            ["x", "number"],
            ["y", "number"],
        ]),
            this.addOutput("vec2", "vec2"),
            (this.properties = { x: 0, y: 0 }),
            (this._data = new Float32Array(2)));
    }
    function w() {
        (this.addInput("vec3", "vec3"),
            this.addOutput("x", "number"),
            this.addOutput("y", "number"),
            this.addOutput("z", "number"));
    }
    function z() {
        (this.addInputs([
            ["x", "number"],
            ["y", "number"],
            ["z", "number"],
        ]),
            this.addOutput("vec3", "vec3"),
            (this.properties = { x: 0, y: 0, z: 0 }),
            (this._data = new Float32Array(3)));
    }
    function M() {
        (this.addInput("vec4", "vec4"),
            this.addOutput("x", "number"),
            this.addOutput("y", "number"),
            this.addOutput("z", "number"),
            this.addOutput("w", "number"));
    }
    function S() {
        (this.addInputs([
            ["x", "number"],
            ["y", "number"],
            ["z", "number"],
            ["w", "number"],
        ]),
            this.addOutput("vec4", "vec4"),
            (this.properties = { x: 0, y: 0, z: 0, w: 0 }),
            (this._data = new Float32Array(4)));
    }
    ((i.title = "Converter"),
        (i.desc = "type A to type B"),
        (i.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (null != t && this.outputs)
                for (var e = 0; e < this.outputs.length; e++) {
                    var i = this.outputs[e];
                    if (i.links && i.links.length) {
                        var r = null;
                        switch (i.name) {
                            case "number":
                                r = t.length ? t[0] : parseFloat(t);
                                break;
                            case "vec2":
                            case "vec3":
                            case "vec4":
                                r = null;
                                var s = 1;
                                switch (i.name) {
                                    case "vec2":
                                        s = 2;
                                        break;
                                    case "vec3":
                                        s = 3;
                                        break;
                                    case "vec4":
                                        s = 4;
                                        break;
                                }
                                r = new Float32Array(s);
                                if (t.length) for (var a = 0; a < t.length && a < r.length; a++) r[a] = t[a];
                                else r[0] = parseFloat(t);
                                break;
                        }
                        this.setOutputData(e, r);
                    }
                }
        }),
        (i.prototype.onGetOutputs = function () {
            return [
                ["number", "number"],
                ["vec2", "vec2"],
                ["vec3", "vec3"],
                ["vec4", "vec4"],
            ];
        }),
        e.registerNode("math/converter", i),
        (r.title = "Bypass"),
        (r.desc = "removes the type"),
        (r.prototype.onExecute = function () {
            var t = this.getInputData(0);
            this.setOutputData(0, t);
        }),
        e.registerNode("math/bypass", r),
        (s.title = "to Number"),
        (s.desc = "Cast to number"),
        (s.prototype.onExecute = function () {
            var t = this.getInputData(0);
            this.setOutputData(0, Number(t));
        }),
        e.registerNode("math/to_number", s),
        (a.title = "to Integer"),
        (a.desc = "Cast to integer (truncate)"),
        (a.prototype.onExecute = function () {
            var t = this.getInputData(0);
            void 0 !== t &&
                null !== t &&
                (Array.isArray(t)
                    ? this.setOutputData(
                          0,
                          t.map(function (t) {
                              return Math.trunc(Number(t));
                          }),
                      )
                    : this.setOutputData(0, Math.trunc(Number(t))));
        }),
        e.registerNode("math/to_integer", a),
        (n.title = "to String"),
        (n.desc = "Cast to string"),
        (n.prototype.onExecute = function () {
            var t = this.getInputData(0);
            void 0 !== t &&
                null !== t &&
                (Array.isArray(t)
                    ? this.setOutputData(
                          0,
                          t.map(function (t) {
                              return String(t);
                          }),
                      )
                    : this.setOutputData(0, String(t)));
        }),
        e.registerNode("math/to_string", n),
        (o.title = "to Boolean"),
        (o.desc = "Cast to boolean"),
        (o.prototype.onExecute = function () {
            var t = this.getInputData(0);
            void 0 !== t &&
                null !== t &&
                (Array.isArray(t)
                    ? this.setOutputData(
                          0,
                          t.map(function (t) {
                              return Boolean(t);
                          }),
                      )
                    : this.setOutputData(0, Boolean(t)));
        }),
        e.registerNode("math/to_boolean", o),
        (u.title = "Convert"),
        (u.desc = "Convert data type: number/integer/string/boolean"),
        (u.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (void 0 !== t && null !== t) {
                var e = this.properties.type || "number";
                Array.isArray(t) ? this.setOutputData(0, t.map(i)) : this.setOutputData(0, i(t));
            }
            function i(t) {
                switch (e) {
                    case "integer":
                        return Math.trunc(Number(t));
                    case "string":
                        return String(t);
                    case "boolean":
                        return Boolean(t);
                    default:
                        return Number(t);
                }
            }
        }),
        e.registerNode("math/convert", u),
        (p.title = "Range"),
        (p.desc = "Convert a number from one range to another"),
        (p.prototype.getTitle = function () {
            return this.flags.collapsed ? (this._last_v || 0).toFixed(2) : this.title;
        }),
        (p.prototype.onExecute = function () {
            if (this.inputs)
                for (var t = 0; t < this.inputs.length; t++) {
                    var e = this.inputs[t],
                        i = this.getInputData(t);
                    void 0 !== i && (this.properties[e.name] = i);
                }
            i = this.properties["in"];
            (void 0 !== i && null !== i && i.constructor === Number) || (i = 0);
            var r = this.properties.in_min,
                s = this.properties.in_max,
                a = this.properties.out_min,
                n = this.properties.out_max;
            ((this._last_v = ((i - r) / (s - r)) * (n - a) + a),
                this.setOutputData(0, this._last_v),
                this.setOutputData(1, clamp(this._last_v, a, n)));
        }),
        (p.prototype.onDrawBackground = function (t) {
            this._last_v ? (this.outputs[0].label = this._last_v.toFixed(3)) : (this.outputs[0].label = "?");
        }),
        (p.prototype.onGetInputs = function () {
            return [
                ["in_min", "number"],
                ["in_max", "number"],
                ["out_min", "number"],
                ["out_max", "number"],
            ];
        }),
        e.registerNode("math/range", p),
        (h.title = "Rand"),
        (h.desc = "Random number"),
        (h.prototype.onExecute = function () {
            if (this.inputs)
                for (var t = 0; t < this.inputs.length; t++) {
                    var e = this.inputs[t],
                        i = this.getInputData(t);
                    void 0 !== i && (this.properties[e.name] = i);
                }
            var r = this.properties.min,
                s = this.properties.max;
            ((this._last_v = Math.random() * (s - r) + r), this.setOutputData(0, this._last_v));
        }),
        (h.prototype.onDrawBackground = function (t) {
            this.outputs[0].label = (this._last_v || 0).toFixed(3);
        }),
        (h.prototype.onGetInputs = function () {
            return [
                ["min", "number"],
                ["max", "number"],
            ];
        }),
        e.registerNode("math/rand", h),
        (d.title = "Noise"),
        (d.desc = "Random number with temporal continuity"),
        (d.data = null),
        (d.getValue = function (t, e) {
            if (!d.data) {
                d.data = new Float32Array(1024);
                for (var i = 0; i < d.data.length; ++i) d.data[i] = Math.random();
            }
            ((t %= 1024), t < 0 && (t += 1024));
            var r = Math.floor(t),
                s = ((t = t - r), d.data[r]),
                a = d.data[1023 == r ? 0 : r + 1];
            return (e && (t = t * t * t * (t * (6 * t - 15) + 10)), s * (1 - t) + a * t);
        }),
        (d.prototype.onExecute = function () {
            var t = this.getInputData(0) || 0,
                e = this.properties.octaves || 1,
                i = 0,
                r = 1,
                s = this.properties.seed || 0;
            t += s;
            for (var a = this.properties.speed || 1, n = 0, o = 0; o < e; ++o)
                if (
                    ((i += d.getValue(t * (1 + o) * a, this.properties.smooth) * r),
                    (n += r),
                    (r *= this.properties.persistence),
                    r < 0.001)
                )
                    break;
            i /= n;
            var u = this.properties.min,
                p = this.properties.max;
            ((this._last_v = i * (p - u) + u), this.setOutputData(0, this._last_v));
        }),
        (d.prototype.onDrawBackground = function (t) {
            this.outputs[0].label = (this._last_v || 0).toFixed(3);
        }),
        e.registerNode("math/noise", d),
        (c.title = "Spikes"),
        (c.desc = "spike every random time"),
        (c.prototype.onExecute = function () {
            var t = this.graph.elapsed_time;
            ((this._remaining_time -= t), (this._blink_time -= t));
            var e = 0;
            if (this._blink_time > 0) {
                var i = this._blink_time / this.properties.duration;
                e = 1 / (Math.pow(8 * i - 4, 4) + 1);
            }
            (this._remaining_time < 0
                ? ((this._remaining_time =
                      Math.random() * (this.properties.max_time - this.properties.min_time) + this.properties.min_time),
                  (this._blink_time = this.properties.duration),
                  (this.boxcolor = "#FFF"))
                : (this.boxcolor = "#000"),
                this.setOutputData(0, e));
        }),
        e.registerNode("math/spikes", c),
        (l.title = "Clamp"),
        (l.desc = "Clamp number between min and max"),
        (l.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t &&
                ((t = Math.max(this.properties.min, t)),
                (t = Math.min(this.properties.max, t)),
                this.setOutputData(0, t));
        }),
        (l.prototype.getCode = function (t) {
            var e = "";
            return (
                this.isInputConnected(0) &&
                    (e += "clamp({{0}}," + this.properties.min + "," + this.properties.max + ")"),
                e
            );
        }),
        e.registerNode("math/clamp", l),
        (m.title = "Lerp"),
        (m.desc = "Linear Interpolation"),
        (m.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null == t && (t = 0);
            var e = this.getInputData(1);
            null == e && (e = 0);
            var i = this.properties.f,
                r = this.getInputData(2);
            (void 0 !== r && (i = r), this.setOutputData(0, t * (1 - i) + e * i));
        }),
        (m.prototype.onGetInputs = function () {
            return [["f", "number"]];
        }),
        e.registerNode("math/lerp", m),
        (v.title = "Abs"),
        (v.desc = "Absolute"),
        (v.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && this.setOutputData(0, Math.abs(t));
        }),
        e.registerNode("math/abs", v),
        (f.title = "Floor"),
        (f.desc = "Floor number to remove fractional part"),
        (f.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && this.setOutputData(0, Math.floor(t));
        }),
        e.registerNode("math/floor", f),
        (y.title = "Frac"),
        (y.desc = "Returns fractional part"),
        (y.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && this.setOutputData(0, t % 1);
        }),
        e.registerNode("math/frac", y),
        (b.title = "Smoothstep"),
        (b.desc = "Smoothstep"),
        (b.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (void 0 !== t) {
                var e = this.properties.A,
                    i = this.properties.B;
                ((t = clamp((t - e) / (i - e), 0, 1)), (t = t * t * (3 - 2 * t)), this.setOutputData(0, t));
            }
        }),
        e.registerNode("math/smoothstep", b),
        (g.title = "Scale"),
        (g.desc = "v * factor"),
        (g.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && this.setOutputData(0, t * this.properties.factor);
        }),
        e.registerNode("math/scale", g),
        (O.title = "Gate"),
        (O.desc = "if v is true, then outputs A, otherwise B"),
        (O.prototype.onExecute = function () {
            var t = this.getInputData(0);
            this.setOutputData(0, this.getInputData(t ? 1 : 2));
        }),
        e.registerNode("math/gate", O),
        (x.title = "Average"),
        (x.desc = "Average Filter"),
        (x.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null == t && (t = 0);
            var e = this._values.length;
            ((this._values[this._current % e] = t), (this._current += 1), this._current > e && (this._current = 0));
            for (var i = 0, r = 0; r < e; ++r) i += this._values[r];
            this.setOutputData(0, i / e);
        }),
        (x.prototype.onPropertyChanged = function (t, e) {
            (e < 1 && (e = 1), (this.properties.samples = Math.round(e)));
            var i = this._values;
            ((this._values = new Float32Array(this.properties.samples)),
                i.length <= this._values.length
                    ? this._values.set(i)
                    : this._values.set(i.subarray(0, this._values.length)));
        }),
        e.registerNode("math/average", x),
        (_.title = "TendTo"),
        (_.desc = "moves the output value always closer to the input"),
        (_.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null == t && (t = 0);
            var e = this.properties.factor;
            (null == this._value ? (this._value = t) : (this._value = this._value * (1 - e) + t * e),
                this.setOutputData(0, this._value));
        }),
        e.registerNode("math/tendTo", _),
        (I.values = ["+", "-", "*", "/", "%", "^", "max", "min"]),
        (I.funcs = {
            "+": function (t, e) {
                return t + e;
            },
            "-": function (t, e) {
                return t - e;
            },
            x: function (t, e) {
                return t * e;
            },
            X: function (t, e) {
                return t * e;
            },
            "*": function (t, e) {
                return t * e;
            },
            "/": function (t, e) {
                return t / e;
            },
            "%": function (t, e) {
                return t % e;
            },
            "^": function (t, e) {
                return Math.pow(t, e);
            },
            max: function (t, e) {
                return Math.max(t, e);
            },
            min: function (t, e) {
                return Math.min(t, e);
            },
        }),
        (I.title = "Operation"),
        (I.desc = "Easy math operators"),
        (I["@OP"] = { type: "enum", title: "operation", values: I.values }),
        (I.size = [100, 60]),
        (I.prototype.getTitle = function () {
            return "max" == this.properties.OP || "min" == this.properties.OP
                ? this.properties.OP + "(A,B)"
                : "A " + this.properties.OP + " B";
        }),
        (I.prototype.setValue = function (t) {
            ("string" == typeof t && (t = parseFloat(t)), (this.properties["value"] = t));
        }),
        (I.prototype.onPropertyChanged = function (t, e) {
            "OP" == t &&
                ((this._func = I.funcs[this.properties.OP]),
                this._func ||
                    (console.warn("Unknown operation: " + this.properties.OP),
                    (this._func = function (t) {
                        return t;
                    })));
        }),
        (I.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1);
            (null != t ? t.constructor === Number && (this.properties["A"] = t) : (t = this.properties["A"]),
                null != e ? (this.properties["B"] = e) : (e = this.properties["B"]));
            var i,
                r = I.funcs[this.properties.OP];
            if (t.constructor === Number) ((i = 0), (i = r(t, e)));
            else if (t.constructor === Array) {
                ((i = this._result), (i.length = t.length));
                for (var s = 0; s < t.length; ++s) i[s] = r(t[s], e);
            } else for (var s in ((i = {}), t)) i[s] = r(t[s], e);
            this.setOutputData(0, i);
        }),
        (I.prototype.onDrawBackground = function (t) {
            this.flags.collapsed ||
                ((t.font = "40px Arial"),
                (t.fillStyle = "#666"),
                (t.textAlign = "center"),
                t.fillText(this.properties.OP, 0.5 * this.size[0], 0.5 * (this.size[1] + e.NODE_TITLE_HEIGHT)),
                (t.textAlign = "left"));
        }),
        e.registerNode("math/operation", I),
        e.registerSearchboxExtra("math/operation", "MAX", { properties: { OP: "max" }, title: "MAX()" }),
        e.registerSearchboxExtra("math/operation", "MIN", { properties: { OP: "min" }, title: "MIN()" }),
        (D.title = "Compare"),
        (D.desc = "compares between two values"),
        (D.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1);
            (void 0 !== t ? (this.properties["A"] = t) : (t = this.properties["A"]),
                void 0 !== e ? (this.properties["B"] = e) : (e = this.properties["B"]));
            for (var i = 0, r = this.outputs.length; i < r; ++i) {
                var s = this.outputs[i];
                if (s.links && s.links.length) {
                    var a;
                    switch (s.name) {
                        case "A==B":
                            a = t == e;
                            break;
                        case "A!=B":
                            a = t != e;
                            break;
                        case "A>B":
                            a = t > e;
                            break;
                        case "A<B":
                            a = t < e;
                            break;
                        case "A<=B":
                            a = t <= e;
                            break;
                        case "A>=B":
                            a = t >= e;
                            break;
                    }
                    this.setOutputData(i, a);
                }
            }
        }),
        (D.prototype.onGetOutputs = function () {
            return [
                ["A==B", "boolean"],
                ["A!=B", "boolean"],
                ["A>B", "boolean"],
                ["A<B", "boolean"],
                ["A>=B", "boolean"],
                ["A<=B", "boolean"],
            ];
        }),
        e.registerNode("math/compare", D),
        e.registerSearchboxExtra("math/compare", "==", { outputs: [["A==B", "boolean"]], title: "A==B" }),
        e.registerSearchboxExtra("math/compare", "!=", { outputs: [["A!=B", "boolean"]], title: "A!=B" }),
        e.registerSearchboxExtra("math/compare", ">", { outputs: [["A>B", "boolean"]], title: "A>B" }),
        e.registerSearchboxExtra("math/compare", "<", { outputs: [["A<B", "boolean"]], title: "A<B" }),
        e.registerSearchboxExtra("math/compare", ">=", { outputs: [["A>=B", "boolean"]], title: "A>=B" }),
        e.registerSearchboxExtra("math/compare", "<=", { outputs: [["A<=B", "boolean"]], title: "A<=B" }),
        (A.values = [">", "<", "==", "!=", "<=", ">=", "||", "&&"]),
        (A["@OP"] = { type: "enum", title: "operation", values: A.values }),
        (A.title = "Condition"),
        (A.desc = "evaluates condition between A and B"),
        (A.prototype.getTitle = function () {
            return "A " + this.properties.OP + " B";
        }),
        (A.prototype.onExecute = function () {
            var t = this.getInputData(0);
            void 0 === t ? (t = this.properties.A) : (this.properties.A = t);
            var e = this.getInputData(1);
            void 0 === e ? (e = this.properties.B) : (this.properties.B = e);
            var i = !0;
            switch (this.properties.OP) {
                case ">":
                    i = t > e;
                    break;
                case "<":
                    i = t < e;
                    break;
                case "==":
                    i = t == e;
                    break;
                case "!=":
                    i = t != e;
                    break;
                case "<=":
                    i = t <= e;
                    break;
                case ">=":
                    i = t >= e;
                    break;
                case "||":
                    i = t || e;
                    break;
                case "&&":
                    i = t && e;
                    break;
            }
            (this.setOutputData(0, i), this.setOutputData(1, !i));
        }),
        e.registerNode("math/condition", A),
        (B.title = "Branch"),
        (B.desc = "If condition is true, outputs IN in true, otherwise in false"),
        (B.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1);
            e
                ? (this.setOutputData(0, t), this.setOutputData(1, null))
                : (this.setOutputData(0, null), this.setOutputData(1, t));
        }),
        e.registerNode("math/branch", B),
        (P.title = "Accumulate"),
        (P.desc = "Increments a value every time"),
        (P.prototype.onExecute = function () {
            null === this.properties.value && (this.properties.value = 0);
            var t = this.getInputData(0);
            ((this.properties.value += null !== t ? t : this.properties.increment),
                this.setOutputData(0, this.properties.value));
        }),
        e.registerNode("math/accumulate", P),
        (N.title = "Trigonometry"),
        (N.desc = "Sin Cos Tan"),
        (N.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null == t && (t = 0);
            var e = this.properties["amplitude"],
                i = this.findInputSlot("amplitude");
            -1 != i && (e = this.getInputData(i));
            var r = this.properties["offset"];
            ((i = this.findInputSlot("offset")), -1 != i && (r = this.getInputData(i)));
            for (var s = 0, a = this.outputs.length; s < a; ++s) {
                var n,
                    o = this.outputs[s];
                switch (o.name) {
                    case "sin":
                        n = Math.sin(t);
                        break;
                    case "cos":
                        n = Math.cos(t);
                        break;
                    case "tan":
                        n = Math.tan(t);
                        break;
                    case "asin":
                        n = Math.asin(t);
                        break;
                    case "acos":
                        n = Math.acos(t);
                        break;
                    case "atan":
                        n = Math.atan(t);
                        break;
                }
                this.setOutputData(s, e * n + r);
            }
        }),
        (N.prototype.onGetInputs = function () {
            return [
                ["v", "number"],
                ["amplitude", "number"],
                ["offset", "number"],
            ];
        }),
        (N.prototype.onGetOutputs = function () {
            return [
                ["sin", "number"],
                ["cos", "number"],
                ["tan", "number"],
                ["asin", "number"],
                ["acos", "number"],
                ["atan", "number"],
            ];
        }),
        e.registerNode("math/trigonometry", N),
        e.registerSearchboxExtra("math/trigonometry", "SIN()", { outputs: [["sin", "number"]], title: "SIN()" }),
        e.registerSearchboxExtra("math/trigonometry", "COS()", { outputs: [["cos", "number"]], title: "COS()" }),
        e.registerSearchboxExtra("math/trigonometry", "TAN()", { outputs: [["tan", "number"]], title: "TAN()" }),
        (E.title = "Formula"),
        (E.desc = "Compute formula"),
        (E.size = [160, 100]),
        (x.prototype.onPropertyChanged = function (t, e) {
            "formula" == t && (this.code_widget.value = e);
        }),
        (E.prototype.onExecute = function () {
            if (e.allow_scripts) {
                var t = this.getInputData(0),
                    i = this.getInputData(1);
                (null != t ? (this.properties["x"] = t) : (t = this.properties["x"]),
                    null != i ? (this.properties["y"] = i) : (i = this.properties["y"]));
                var r;
                this.properties["formula"];
                try {
                    ((this._func && this._func_code == this.properties.formula) ||
                        ((this._func = new Function("x", "y", "TIME", "return " + this.properties.formula)),
                        (this._func_code = this.properties.formula)),
                        (r = this._func(t, i, this.graph.globaltime)),
                        (this.boxcolor = null));
                } catch (s) {
                    this.boxcolor = "red";
                }
                this.setOutputData(0, r);
            }
        }),
        (E.prototype.getTitle = function () {
            return this._func_code || "Formula";
        }),
        (E.prototype.onDrawBackground = function () {
            var t = this.properties["formula"];
            this.outputs && this.outputs.length && (this.outputs[0].label = t);
        }),
        e.registerNode("math/formula", E),
        (T.title = "Vec2->XY"),
        (T.desc = "vector 2 to components"),
        (T.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && (this.setOutputData(0, t[0]), this.setOutputData(1, t[1]));
        }),
        e.registerNode("math3d/vec2-to-xy", T),
        (k.title = "XY->Vec2"),
        (k.desc = "components to vector2"),
        (k.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null == t && (t = this.properties.x);
            var e = this.getInputData(1);
            null == e && (e = this.properties.y);
            var i = this._data;
            ((i[0] = t), (i[1] = e), this.setOutputData(0, i));
        }),
        e.registerNode("math3d/xy-to-vec2", k),
        (w.title = "Vec3->XYZ"),
        (w.desc = "vector 3 to components"),
        (w.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t && (this.setOutputData(0, t[0]), this.setOutputData(1, t[1]), this.setOutputData(2, t[2]));
        }),
        e.registerNode("math3d/vec3-to-xyz", w),
        (z.title = "XYZ->Vec3"),
        (z.desc = "components to vector3"),
        (z.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null == t && (t = this.properties.x);
            var e = this.getInputData(1);
            null == e && (e = this.properties.y);
            var i = this.getInputData(2);
            null == i && (i = this.properties.z);
            var r = this._data;
            ((r[0] = t), (r[1] = e), (r[2] = i), this.setOutputData(0, r));
        }),
        e.registerNode("math3d/xyz-to-vec3", z),
        (M.title = "Vec4->XYZW"),
        (M.desc = "vector 4 to components"),
        (M.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null != t &&
                (this.setOutputData(0, t[0]),
                this.setOutputData(1, t[1]),
                this.setOutputData(2, t[2]),
                this.setOutputData(3, t[3]));
        }),
        e.registerNode("math3d/vec4-to-xyzw", M),
        (S.title = "XYZW->Vec4"),
        (S.desc = "components to vector4"),
        (S.prototype.onExecute = function () {
            var t = this.getInputData(0);
            null == t && (t = this.properties.x);
            var e = this.getInputData(1);
            null == e && (e = this.properties.y);
            var i = this.getInputData(2);
            null == i && (i = this.properties.z);
            var r = this.getInputData(3);
            null == r && (r = this.properties.w);
            var s = this._data;
            ((s[0] = t), (s[1] = e), (s[2] = i), (s[3] = r), this.setOutputData(0, s));
        }),
        e.registerNode("math3d/xyzw-to-vec4", S));
})(this);
