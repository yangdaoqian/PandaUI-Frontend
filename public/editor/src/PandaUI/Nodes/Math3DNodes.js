// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI;
    function a() {
        (this.addInput("T", "vec3"),
            this.addInput("R", "vec3"),
            this.addInput("S", "vec3"),
            this.addOutput("mat4", "mat4"),
            (this.properties = { T: [0, 0, 0], R: [0, 0, 0], S: [1, 1, 1], R_in_degrees: !0 }),
            (this._result = mat4.create()),
            (this._must_update = !0));
    }
    function i() {
        (this.addInput("A", "number,vec3"),
            this.addInput("B", "number,vec3"),
            this.addOutput("=", "number,vec3"),
            this.addProperty("OP", "+", "enum", { values: i.values }),
            (this._result = vec3.create()));
    }
    function s() {
        (this.addInput("in", "vec3"),
            this.addInput("f", "number"),
            this.addOutput("out", "vec3"),
            (this.properties = { f: 1 }),
            (this._data = new Float32Array(3)));
    }
    function r() {
        (this.addInput("in", "vec3"), this.addOutput("out", "number"));
    }
    function u() {
        (this.addInput("in", "vec3"), this.addOutput("out", "vec3"), (this._data = new Float32Array(3)));
    }
    function n() {
        (this.addInput("A", "vec3"),
            this.addInput("B", "vec3"),
            this.addInput("f", "vec3"),
            this.addOutput("out", "vec3"),
            (this.properties = { f: 0.5 }),
            (this._data = new Float32Array(3)));
    }
    function p() {
        (this.addInput("A", "vec3"), this.addInput("B", "vec3"), this.addOutput("out", "number"));
    }
    if (
        ((a.title = "mat4"),
        (a.temp_quat = new Float32Array([0, 0, 0, 1])),
        (a.temp_mat4 = new Float32Array(16)),
        (a.temp_vec3 = new Float32Array(3)),
        (a.prototype.onPropertyChanged = function (t, e) {
            this._must_update = !0;
        }),
        (a.prototype.onExecute = function () {
            var t = this._result,
                e = a.temp_quat,
                i = a.temp_mat4,
                s = a.temp_vec3,
                r = this.getInputData(0),
                u = this.getInputData(1),
                n = this.getInputData(2);
            ((this._must_update || r || u || n) &&
                ((r = r || this.properties.T),
                (u = u || this.properties.R),
                (n = n || this.properties.S),
                mat4.identity(t),
                mat4.translate(t, t, r),
                this.properties.R_in_degrees
                    ? (s.set(u), vec3.scale(s, s, DEG2RAD), quat.fromEuler(e, s))
                    : quat.fromEuler(e, u),
                mat4.fromQuat(i, e),
                mat4.multiply(t, t, i),
                mat4.scale(t, t, n)),
                this.setOutputData(0, t));
        }),
        e.registerNode("math3d/mat4", a),
        (i.values = ["+", "-", "*", "/", "%", "^", "max", "min", "dot", "cross"]),
        e.registerSearchboxExtra("math3d/operation", "CROSS()", { properties: { OP: "cross" }, title: "CROSS()" }),
        e.registerSearchboxExtra("math3d/operation", "DOT()", { properties: { OP: "dot" }, title: "DOT()" }),
        (i.title = "Operation"),
        (i.desc = "Easy math 3D operators"),
        (i["@OP"] = { type: "enum", title: "operation", values: i.values }),
        (i.size = [100, 60]),
        (i.prototype.getTitle = function () {
            return "max" == this.properties.OP || "min" == this.properties.OP
                ? this.properties.OP + "(A,B)"
                : "A " + this.properties.OP + " B";
        }),
        (i.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1);
            if (null != t && null != e) {
                (t.constructor === Number && (t = [t, t, t]), e.constructor === Number && (e = [e, e, e]));
                var a = this._result;
                switch (this.properties.OP) {
                    case "+":
                        a = vec3.add(a, t, e);
                        break;
                    case "-":
                        a = vec3.sub(a, t, e);
                        break;
                    case "x":
                    case "X":
                    case "*":
                        a = vec3.mul(a, t, e);
                        break;
                    case "/":
                        a = vec3.div(a, t, e);
                        break;
                    case "%":
                        ((a[0] = t[0] % e[0]), (a[1] = t[1] % e[1]), (a[2] = t[2] % e[2]));
                        break;
                    case "^":
                        ((a[0] = Math.pow(t[0], e[0])), (a[1] = Math.pow(t[1], e[1])), (a[2] = Math.pow(t[2], e[2])));
                        break;
                    case "max":
                        ((a[0] = Math.max(t[0], e[0])), (a[1] = Math.max(t[1], e[1])), (a[2] = Math.max(t[2], e[2])));
                        break;
                    case "min":
                        ((a[0] = Math.min(t[0], e[0])), (a[1] = Math.min(t[1], e[1])), (a[2] = Math.min(t[2], e[2])));
                    case "dot":
                        a = vec3.dot(t, e);
                        break;
                    case "cross":
                        vec3.cross(a, t, e);
                        break;
                    default:
                        console.warn("Unknown operation: " + this.properties.OP);
                }
                this.setOutputData(0, a);
            }
        }),
        (i.prototype.onDrawBackground = function (t) {
            this.flags.collapsed ||
                ((t.font = "40px Arial"),
                (t.fillStyle = "#666"),
                (t.textAlign = "center"),
                t.fillText(this.properties.OP, 0.5 * this.size[0], 0.5 * (this.size[1] + e.NODE_TITLE_HEIGHT)),
                (t.textAlign = "left"));
        }),
        e.registerNode("math3d/operation", i),
        (s.title = "vec3_scale"),
        (s.desc = "scales the components of a vec3"),
        (s.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (null != t) {
                var e = this.getInputData(1);
                null == e && (e = this.properties.f);
                var a = this._data;
                ((a[0] = t[0] * e), (a[1] = t[1] * e), (a[2] = t[2] * e), this.setOutputData(0, a));
            }
        }),
        e.registerNode("math3d/vec3-scale", s),
        (r.title = "vec3_length"),
        (r.desc = "returns the module of a vector"),
        (r.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (null != t) {
                var e = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]);
                this.setOutputData(0, e);
            }
        }),
        e.registerNode("math3d/vec3-length", r),
        (u.title = "vec3_normalize"),
        (u.desc = "returns the vector normalized"),
        (u.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (null != t) {
                var e = Math.sqrt(t[0] * t[0] + t[1] * t[1] + t[2] * t[2]),
                    a = this._data;
                ((a[0] = t[0] / e), (a[1] = t[1] / e), (a[2] = t[2] / e), this.setOutputData(0, a));
            }
        }),
        e.registerNode("math3d/vec3-normalize", u),
        (n.title = "vec3_lerp"),
        (n.desc = "returns the interpolated vector"),
        (n.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (null != t) {
                var e = this.getInputData(1);
                if (null != e) {
                    var a = this.getInputOrProperty("f"),
                        i = this._data;
                    ((i[0] = t[0] * (1 - a) + e[0] * a),
                        (i[1] = t[1] * (1 - a) + e[1] * a),
                        (i[2] = t[2] * (1 - a) + e[2] * a),
                        this.setOutputData(0, i));
                }
            }
        }),
        e.registerNode("math3d/vec3-lerp", n),
        (p.title = "vec3_dot"),
        (p.desc = "returns the dot product"),
        (p.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (null != t) {
                var e = this.getInputData(1);
                if (null != e) {
                    var a = t[0] * e[0] + t[1] * e[1] + t[2] * e[2];
                    this.setOutputData(0, a);
                }
            }
        }),
        e.registerNode("math3d/vec3-dot", p),
        t.glMatrix)
    ) {
        function o() {
            (this.addOutput("quat", "quat"),
                (this.properties = { x: 0, y: 0, z: 0, w: 1, normalize: !1 }),
                (this._value = quat.create()));
        }
        function h() {
            (this.addInputs([
                ["degrees", "number"],
                ["axis", "vec3"],
            ]),
                this.addOutput("quat", "quat"),
                (this.properties = { angle: 90, axis: vec3.fromValues(0, 1, 0) }),
                (this._value = quat.create()));
        }
        function c() {
            (this.addInput("euler", "vec3"),
                this.addOutput("quat", "quat"),
                (this.properties = { euler: [0, 0, 0], use_yaw_pitch_roll: !1 }),
                (this._degs = vec3.create()),
                (this._value = quat.create()));
        }
        function l() {
            (this.addInput(["quat", "quat"]), this.addOutput("euler", "vec3"), (this._value = vec3.create()));
        }
        function d() {
            (this.addInputs([
                ["vec3", "vec3"],
                ["quat", "quat"],
            ]),
                this.addOutput("result", "vec3"),
                (this.properties = { vec: [0, 0, 1] }));
        }
        function v() {
            (this.addInputs([
                ["A", "quat"],
                ["B", "quat"],
            ]),
                this.addOutput("A*B", "quat"),
                (this._value = quat.create()));
        }
        function m() {
            (this.addInputs([
                ["A", "quat"],
                ["B", "quat"],
                ["factor", "number"],
            ]),
                this.addOutput("slerp", "quat"),
                this.addProperty("factor", 0.5),
                (this._value = quat.create()));
        }
        function _() {
            (this.addInput("vec3", "vec3"),
                this.addOutput("remap", "vec3"),
                this.addOutput("clamped", "vec3"),
                (this.properties = {
                    clamp: !0,
                    range_min: [-1, -1, 0],
                    range_max: [1, 1, 0],
                    target_min: [-1, -1, 0],
                    target_max: [1, 1, 0],
                }),
                (this._value = vec3.create()),
                (this._clamped = vec3.create()));
        }
        ((o.title = "Quaternion"),
            (o.desc = "quaternion"),
            (o.prototype.onExecute = function () {
                ((this._value[0] = this.getInputOrProperty("x")),
                    (this._value[1] = this.getInputOrProperty("y")),
                    (this._value[2] = this.getInputOrProperty("z")),
                    (this._value[3] = this.getInputOrProperty("w")),
                    this.properties.normalize && quat.normalize(this._value, this._value),
                    this.setOutputData(0, this._value));
            }),
            (o.prototype.onGetInputs = function () {
                return [
                    ["x", "number"],
                    ["y", "number"],
                    ["z", "number"],
                    ["w", "number"],
                ];
            }),
            e.registerNode("math3d/quaternion", o),
            (h.title = "Rotation"),
            (h.desc = "quaternion rotation"),
            (h.prototype.onExecute = function () {
                var t = this.getInputData(0);
                null == t && (t = this.properties.angle);
                var e = this.getInputData(1);
                null == e && (e = this.properties.axis);
                var a = quat.setAxisAngle(this._value, e, 0.0174532925 * t);
                this.setOutputData(0, a);
            }),
            e.registerNode("math3d/rotation", h),
            (c.title = "Euler->Quat"),
            (c.desc = "Converts euler angles (in degrees) to quaternion"),
            (c.prototype.onExecute = function () {
                var t = this.getInputData(0);
                (null == t && (t = this.properties.euler),
                    vec3.scale(this._degs, t, DEG2RAD),
                    this.properties.use_yaw_pitch_roll && (this._degs = [this._degs[2], this._degs[0], this._degs[1]]));
                var e = quat.fromEuler(this._value, this._degs);
                this.setOutputData(0, e);
            }),
            e.registerNode("math3d/euler_to_quat", c),
            (l.title = "Euler->Quat"),
            (l.desc = "Converts rotX,rotY,rotZ in degrees to quat"),
            (l.prototype.onExecute = function () {
                var t = this.getInputData(0);
                if (t) {
                    quat.toEuler(this._value, t);
                    (vec3.scale(this._value, this._value, DEG2RAD), this.setOutputData(0, this._value));
                }
            }),
            e.registerNode("math3d/quat_to_euler", l),
            (d.title = "Rot. Vec3"),
            (d.desc = "rotate a point"),
            (d.prototype.onExecute = function () {
                var t = this.getInputData(0);
                null == t && (t = this.properties.vec);
                var e = this.getInputData(1);
                null == e ? this.setOutputData(t) : this.setOutputData(0, vec3.transformQuat(vec3.create(), t, e));
            }),
            e.registerNode("math3d/rotate_vec3", d),
            (v.title = "Mult. Quat"),
            (v.desc = "rotate quaternion"),
            (v.prototype.onExecute = function () {
                var t = this.getInputData(0);
                if (null != t) {
                    var e = this.getInputData(1);
                    if (null != e) {
                        var a = quat.multiply(this._value, t, e);
                        this.setOutputData(0, a);
                    }
                }
            }),
            e.registerNode("math3d/mult-quat", v),
            (m.title = "Quat Slerp"),
            (m.desc = "quaternion spherical interpolation"),
            (m.prototype.onExecute = function () {
                var t = this.getInputData(0);
                if (null != t) {
                    var e = this.getInputData(1);
                    if (null != e) {
                        var a = this.properties.factor;
                        null != this.getInputData(2) && (a = this.getInputData(2));
                        var i = quat.slerp(this._value, t, e, a);
                        this.setOutputData(0, i);
                    }
                }
            }),
            e.registerNode("math3d/quat-slerp", m),
            (_.title = "Remap Range"),
            (_.desc = "remap a 3D range"),
            (_.prototype.onExecute = function () {
                var t = this.getInputData(0);
                t && this._value.set(t);
                for (
                    var e = this.properties.range_min,
                        a = this.properties.range_max,
                        i = this.properties.target_min,
                        s = this.properties.target_max,
                        r = 0;
                    r < 3;
                    ++r
                ) {
                    var u = a[r] - e[r];
                    if (((this._clamped[r] = clamp(this._value[r], e[r], a[r])), 0 != u)) {
                        var n = (this._value[r] - e[r]) / u;
                        this.properties.clamp && (n = clamp(n, 0, 1));
                        var p = s[r] - i[r];
                        this._value[r] = i[r] + n * p;
                    } else this._value[r] = 0.5 * (i[r] + s[r]);
                }
                (this.setOutputData(0, this._value), this.setOutputData(1, this._clamped));
            }),
            e.registerNode("math3d/remap_range", _));
    } else e.debug && console.warn("No glmatrix found, some Math3D nodes may not work");
})(this);
