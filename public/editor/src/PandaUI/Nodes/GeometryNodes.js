// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI,
        s = new Float32Array(16),
        r = new Float32Array(16),
        o = new Float32Array(16),
        a = new Float32Array(16),
        n = { u_view: s, u_projection: r, u_viewprojection: o, u_model: a };
    function h() {
        return (1e5 * Math.random()) | 0;
    }
    function u() {
        (this.addInput("obj", ""),
            this.addInput("radius", "number"),
            this.addOutput("out", "geometry"),
            this.addOutput("points", "[vec3]"),
            (this.properties = {
                radius: 1,
                num_points: 4096,
                generate_normals: !0,
                regular: !1,
                mode: u.SPHERE,
                force_update: !1,
            }),
            (this.points = new Float32Array(3 * this.properties.num_points)),
            (this.normals = new Float32Array(3 * this.properties.num_points)),
            (this.must_update = !0),
            (this.version = 0));
        var t = this;
        (this.addWidget("button", "update", null, function () {
            t.must_update = !0;
        }),
            (this.geometry = { vertices: null, _id: h() }),
            (this._old_obj = null),
            (this._last_radius = null));
    }
    function d(t, e) {
        var i = t.length,
            s = 0,
            r = 0,
            o = i;
        if (0 == i) return -1;
        if (1 == i) return 0;
        while (o >= s) {
            r = (0.5 * (o + s)) | 0;
            var a = t[r];
            if (a == e) return r;
            if (s == o - 1) return s;
            a < e ? (s = r) : (o = r);
        }
        return r;
    }
    function l() {
        (this.addInput("points", "geometry"),
            this.addOutput("instances", "[mat4]"),
            (this.properties = { mode: 1, autoupdate: !0 }),
            (this.must_update = !0),
            (this.matrices = []),
            (this.first_time = !0));
    }
    function p() {
        (this.addInput("in", "geometry,[mat4]"),
            this.addInput("mat4", "mat4"),
            this.addOutput("out", "geometry"),
            (this.properties = {}),
            (this.geometry = { type: "triangles", vertices: null, _id: h(), _version: 0 }),
            (this._last_geometry_id = -1),
            (this._last_version = -1),
            (this._last_key = ""),
            (this.must_update = !0));
    }
    function c() {
        (this.addInput("sides", "number"),
            this.addInput("radius", "number"),
            this.addOutput("out", "geometry"),
            (this.properties = { sides: 6, radius: 1, uvs: !1 }),
            (this.geometry = { type: "line_loop", vertices: null, _id: h() }),
            (this.geometry_id = -1),
            (this.version = -1),
            (this.must_update = !0),
            (this.last_info = { sides: -1, radius: -1 }));
    }
    function m() {
        (this.addInput("", "geometry"),
            this.addOutput("", "geometry"),
            (this.properties = { top_cap: !0, bottom_cap: !0, offset: [0, 100, 0] }),
            (this.version = -1),
            (this._last_geo_version = -1),
            (this._must_update = !0));
    }
    function _() {
        (this.addInput("in", "geometry"),
            this.addOutput("out", "geometry"),
            (this.properties = { code: "V[1] += 0.01 * Math.sin(I + T*0.001);", execute_every_frame: !1 }),
            (this.geometry = null),
            (this.geometry_id = -1),
            (this.version = -1),
            (this.must_update = !0),
            (this.vertices = null),
            (this.func = null));
    }
    function f() {
        (this.addInput("in", "geometry"),
            this.addOutput("out", "geometry"),
            (this.properties = { min_dist: 0.4, max_dist: 0.5, max_connections: 0, probability: 1 }),
            (this.geometry_id = -1),
            (this.version = -1),
            (this.my_version = 1),
            (this.must_update = !0));
    }
    function v() {
        (this.addInput("mesh", "mesh"),
            this.addOutput("out", "geometry"),
            (this.geometry = {}),
            (this.last_mesh = null));
    }
    function g() {
        (this.addInput("in", "geometry"),
            this.addOutput("mesh", "mesh"),
            (this.properties = {}),
            (this.version = -1),
            (this.mesh = null));
    }
    function y() {
        (this.addInput("mesh", "mesh"),
            this.addInput("mat4", "mat4"),
            this.addInput("tex", "texture"),
            (this.properties = { enabled: !0, primitive: GL.TRIANGLES, additive: !1, color: [1, 1, 1], opacity: 1 }),
            (this.color = vec4.create([1, 1, 1, 1])),
            (this.model_matrix = mat4.create()),
            (this.uniforms = { u_color: this.color, u_model: this.model_matrix }));
    }
    function E() {
        (this.addInput("size", "number"),
            this.addOutput("out", "mesh"),
            (this.properties = { type: 1, size: 1, subdivisions: 32 }),
            (this.version = (1e5 * Math.random()) | 0),
            (this.last_info = { type: -1, size: -1, subdivisions: -1 }));
    }
    function M() {
        (this.addInput("in", "geometry"),
            this.addInput("mat4", "mat4"),
            this.addInput("tex", "texture"),
            (this.properties = {
                enabled: !0,
                point_size: 0.1,
                fixed_size: !1,
                additive: !0,
                color: [1, 1, 1],
                opacity: 1,
            }),
            (this.color = vec4.create([1, 1, 1, 1])),
            (this.uniforms = { u_point_size: 1, u_perspective: 1, u_point_perspective: 1, u_color: this.color }),
            (this.geometry_id = -1),
            (this.version = -1),
            (this.mesh = null));
    }
    ((e.GraphDocumentRender = { onRequestCameraMatrices: null }),
        (t.GraphDocumentPoints3D = u),
        (u.RECTANGLE = 1),
        (u.CIRCLE = 2),
        (u.CUBE = 10),
        (u.SPHERE = 11),
        (u.HEMISPHERE = 12),
        (u.INSIDE_SPHERE = 13),
        (u.OBJECT = 20),
        (u.OBJECT_UNIFORMLY = 21),
        (u.OBJECT_INSIDE = 22),
        (u.MODE_VALUES = {
            rectangle: u.RECTANGLE,
            circle: u.CIRCLE,
            cube: u.CUBE,
            sphere: u.SPHERE,
            hemisphere: u.HEMISPHERE,
            inside_sphere: u.INSIDE_SPHERE,
            object: u.OBJECT,
            object_uniformly: u.OBJECT_UNIFORMLY,
            object_inside: u.OBJECT_INSIDE,
        }),
        (u.widgets_info = { mode: { widget: "combo", values: u.MODE_VALUES } }),
        (u.title = "list of points"),
        (u.desc = "returns an array of points"),
        (u.prototype.onPropertyChanged = function (t, e) {
            this.must_update = !0;
        }),
        (u.prototype.onExecute = function () {
            var t = this.getInputData(0);
            (t != this._old_obj || (t && t._version != this._old_obj_version)) &&
                ((this._old_obj = t), (this.must_update = !0));
            var e = this.getInputData(1);
            (null == e && (e = this.properties.radius),
                this._last_radius != e && ((this._last_radius = e), (this.must_update = !0)),
                (this.must_update || this.properties.force_update) && ((this.must_update = !1), this.updatePoints()),
                (this.geometry.vertices = this.points),
                (this.geometry.normals = this.normals),
                (this.geometry._version = this.version),
                this.setOutputData(0, this.geometry));
        }),
        (u.prototype.updatePoints = function () {
            var t = 0 | this.properties.num_points;
            (t < 1 && (t = 1),
                (this.points && this.points.length == 3 * t) || (this.points = new Float32Array(3 * t)),
                this.properties.generate_normals
                    ? (this.normals && this.normals.length == this.points.length) ||
                      (this.normals = new Float32Array(this.points.length))
                    : (this.normals = null));
            var e = this._last_radius || this.properties.radius,
                i = this.properties.mode,
                s = this.getInputData(0);
            ((this._old_obj_version = s ? s._version : null),
                (this.points = u.generatePoints(e, t, i, this.points, this.normals, this.properties.regular, s)),
                this.version++);
        }),
        (u.generatePoints = function (t, e, i, s, r, o, a) {
            var n = 3 * e;
            (s && s.length == n) || (s = new Float32Array(n));
            var h = new Float32Array(3),
                d = new Float32Array([0, 1, 0]);
            if (o) {
                if (i == u.RECTANGLE) {
                    for (var l = Math.floor(Math.sqrt(e)), p = 0; p < l; ++p)
                        for (var c = 0; c < l; ++c) {
                            var m = 3 * p + 3 * c * l;
                            ((s[m] = (p / l - 0.5) * t * 2), (s[m + 1] = 0), (s[m + 2] = (c / l - 0.5) * t * 2));
                        }
                    if (((s = new Float32Array(s.subarray(0, l * l * 3))), r))
                        for (p = 0; p < r.length; p += 3) r.set(d, p);
                } else if (i == u.SPHERE) {
                    for (l = Math.floor(Math.sqrt(e)), p = 0; p < l; ++p)
                        for (c = 0; c < l; ++c) {
                            m = 3 * p + 3 * c * l;
                            (polarToCartesian(h, (p / l) * 2 * Math.PI, 2 * (c / l - 0.5) * Math.PI, t),
                                (s[m] = h[0]),
                                (s[m + 1] = h[1]),
                                (s[m + 2] = h[2]));
                        }
                    ((s = new Float32Array(s.subarray(0, l * l * 3))), r && u.generateSphericalNormals(s, r));
                } else if (i == u.CIRCLE) {
                    for (p = 0; p < n; p += 3) {
                        var _ = 2 * Math.PI * (p / n);
                        ((s[p] = Math.cos(_) * t), (s[p + 1] = 0), (s[p + 2] = Math.sin(_) * t));
                    }
                    if (r) for (p = 0; p < r.length; p += 3) r.set(d, p);
                }
            } else if (i == u.RECTANGLE) {
                for (p = 0; p < n; p += 3)
                    ((s[p] = (Math.random() - 0.5) * t * 2),
                        (s[p + 1] = 0),
                        (s[p + 2] = (Math.random() - 0.5) * t * 2));
                if (r) for (p = 0; p < r.length; p += 3) r.set(d, p);
            } else if (i == u.CUBE) {
                for (p = 0; p < n; p += 3)
                    ((s[p] = (Math.random() - 0.5) * t * 2),
                        (s[p + 1] = (Math.random() - 0.5) * t * 2),
                        (s[p + 2] = (Math.random() - 0.5) * t * 2));
                if (r) for (p = 0; p < r.length; p += 3) r.set(d, p);
            } else
                i == u.SPHERE
                    ? (u.generateSphere(s, n, t), r && u.generateSphericalNormals(s, r))
                    : i == u.HEMISPHERE
                      ? (u.generateHemisphere(s, n, t), r && u.generateSphericalNormals(s, r))
                      : i == u.CIRCLE
                        ? (u.generateInsideCircle(s, n, t), r && u.generateSphericalNormals(s, r))
                        : i == u.INSIDE_SPHERE
                          ? (u.generateInsideSphere(s, n, t), r && u.generateSphericalNormals(s, r))
                          : i == u.OBJECT
                            ? u.generateFromObject(s, r, n, a, !1)
                            : i == u.OBJECT_UNIFORMLY
                              ? u.generateFromObject(s, r, n, a, !0)
                              : i == u.OBJECT_INSIDE
                                ? u.generateFromInsideObject(s, n, a)
                                : console.warn("wrong mode in GraphDocumentPoints3D");
            return s;
        }),
        (u.generateSphericalNormals = function (t, e) {
            for (var i = new Float32Array(3), s = 0; s < e.length; s += 3)
                ((i[0] = t[s]), (i[1] = t[s + 1]), (i[2] = t[s + 2]), vec3.normalize(i, i), e.set(i, s));
        }),
        (u.generateSphere = function (t, e, i) {
            for (var s = 0; s < e; s += 3) {
                var r = Math.random(),
                    o = Math.random(),
                    a = 2 * Math.cos(2 * Math.PI * r) * Math.sqrt(o * (1 - o)),
                    n = 1 - 2 * o,
                    h = 2 * Math.sin(2 * Math.PI * r) * Math.sqrt(o * (1 - o));
                ((t[s] = a * i), (t[s + 1] = n * i), (t[s + 2] = h * i));
            }
        }),
        (u.generateHemisphere = function (t, e, i) {
            for (var s = 0; s < e; s += 3) {
                var r = Math.random(),
                    o = Math.random(),
                    a = Math.cos(2 * Math.PI * r) * Math.sqrt(1 - o * o),
                    n = o,
                    h = Math.sin(2 * Math.PI * r) * Math.sqrt(1 - o * o);
                ((t[s] = a * i), (t[s + 1] = n * i), (t[s + 2] = h * i));
            }
        }),
        (u.generateInsideCircle = function (t, e, i) {
            for (var s = 0; s < e; s += 3) {
                var r = Math.random(),
                    o = Math.random(),
                    a = Math.cos(2 * Math.PI * r) * Math.sqrt(1 - o * o),
                    n = Math.sin(2 * Math.PI * r) * Math.sqrt(1 - o * o);
                ((t[s] = a * i), (t[s + 1] = 0), (t[s + 2] = n * i));
            }
        }),
        (u.generateInsideSphere = function (t, e, i) {
            for (var s = 0; s < e; s += 3) {
                var r = Math.random(),
                    o = Math.random(),
                    a = 2 * r * Math.PI,
                    n = Math.acos(2 * o - 1),
                    h = Math.cbrt(Math.random()) * i,
                    u = Math.sin(a),
                    d = Math.cos(a),
                    l = Math.sin(n),
                    p = Math.cos(n);
                ((t[s] = h * l * d), (t[s + 1] = h * l * u), (t[s + 2] = h * p));
            }
        }),
        (u.generateFromObject = function (t, e, i, s, r) {
            if (s) {
                var o = null,
                    a = null,
                    n = null,
                    h = null;
                if (
                    (s.constructor === GL.Mesh &&
                        ((o = s.vertexBuffers.vertices.data),
                        (a = s.vertexBuffers.normals ? s.vertexBuffers.normals.data : null),
                        (n = s.indexBuffers.indices ? s.indexBuffers.indices.data : null),
                        n || (n = s.indexBuffers.triangles ? s.indexBuffers.triangles.data : null)),
                    !o)
                )
                    return null;
                var u = n ? n.length / 3 : o.length / 9,
                    l = 0;
                if (r) {
                    h = new Float32Array(u);
                    for (var p = 0; p < u; ++p) {
                        n
                            ? ((I = 3 * n[3 * p]), (L = 3 * n[3 * p + 1]), (b = 3 * n[3 * p + 2]))
                            : ((I = 9 * p), (L = 9 * p + 3), (b = 9 * p + 6));
                        var c = o.subarray(I, I + 3),
                            m = o.subarray(L, L + 3),
                            _ = o.subarray(b, b + 3),
                            f = vec3.distance(c, m),
                            v = vec3.distance(m, _),
                            g = vec3.distance(_, c),
                            y = (f + v + g) / 2;
                        ((l += Math.sqrt(y * (y - f) * (y - v) * (y - g))), (h[p] = l));
                    }
                    for (p = 0; p < u; ++p) h[p] /= l;
                }
                for (p = 0; p < i; p += 3) {
                    var E = Math.random(),
                        M = r ? d(h, E) : Math.floor(E * u),
                        I = 0,
                        L = 0,
                        b = 0;
                    n
                        ? ((I = 3 * n[3 * M]), (L = 3 * n[3 * M + 1]), (b = 3 * n[3 * M + 2]))
                        : ((I = 9 * M), (L = 9 * M + 3), (b = 9 * M + 6));
                    y = Math.random();
                    var A = Math.random(),
                        x = Math.sqrt(y),
                        R = 1 - x,
                        O = x * (1 - A),
                        S = A * x;
                    if (
                        ((t[p] = R * o[I] + O * o[L] + S * o[b]),
                        (t[p + 1] = R * o[I + 1] + O * o[L + 1] + S * o[b + 1]),
                        (t[p + 2] = R * o[I + 2] + O * o[L + 2] + S * o[b + 2]),
                        e && a)
                    ) {
                        ((e[p] = R * a[I] + O * a[L] + S * a[b]),
                            (e[p + 1] = R * a[I + 1] + O * a[L + 1] + S * a[b + 1]),
                            (e[p + 2] = R * a[I + 2] + O * a[L + 2] + S * a[b + 2]));
                        var C = e.subarray(p, p + 3);
                        vec3.normalize(C, C);
                    }
                }
            }
        }),
        (u.generateFromInsideObject = function (t, e, i) {
            if (i && i.constructor === GL.Mesh) {
                var s = i.getBoundingBox();
                i.octree || (i.octree = new GL.Octree(i));
                var r = i.octree,
                    o = vec3.create(),
                    a = vec3.fromValues(1, 0, 0),
                    n = vec3.create(),
                    h = 0,
                    u = 0;
                while (h < e && u < 10 * t.length) {
                    u += 1;
                    var d = vec3.random(n);
                    ((d[0] = (2 * d[0] - 1) * s[3] + s[0]),
                        (d[1] = (2 * d[1] - 1) * s[4] + s[1]),
                        (d[2] = (2 * d[2] - 1) * s[5] + s[2]),
                        o.set(d));
                    var l = r.testRay(o, a, 0, 1e4, !0, GL.Octree.ALL);
                    l && l.length % 2 != 0 && (t.set(d, h), (h += 3));
                }
            }
        }),
        e.registerNode("geometry/points3D", u),
        (l.NORMAL = 0),
        (l.VERTICAL = 1),
        (l.SPHERICAL = 2),
        (l.RANDOM = 3),
        (l.RANDOM_VERTICAL = 4),
        (l.modes = { normal: 0, vertical: 1, spherical: 2, random: 3, random_vertical: 4 }),
        (l.widgets_info = { mode: { widget: "combo", values: l.modes } }),
        (l.title = "points to inst"),
        (l.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (t) {
                if (this.isOutputConnected(0)) {
                    var e = t._version != this._version || t._id != this._geometry_id;
                    (((e && this.properties.autoupdate) || this.first_time) &&
                        ((this.first_time = !1), this.updateInstances(t)),
                        this.setOutputData(0, this.matrices));
                }
            } else this.setOutputData(0, null);
        }),
        (l.prototype.updateInstances = function (t) {
            var e = t.vertices;
            if (!e) return null;
            var i = t.normals,
                s = this.matrices,
                r = e.length / 3;
            s.length != r && (s.length = r);
            for (
                var o = mat4.create(),
                    a = vec3.create(),
                    n = (vec3.create(), vec3.fromValues(0, 1, 0)),
                    h = vec3.fromValues(0, 0, -1),
                    u = (vec3.fromValues(1, 0, 0), quat.create()),
                    d = vec3.create(),
                    p = vec3.create(),
                    c = vec3.create(),
                    m = 0;
                m < e.length;
                m += 3
            ) {
                var _ = m / 3,
                    f = s[_];
                (f || (f = s[_] = mat4.create()), f.set(o));
                var v = e.subarray(m, m + 3);
                switch (this.properties.mode) {
                    case l.NORMAL:
                        if ((mat4.setTranslation(f, v), i)) {
                            var g = i.subarray(m, m + 3);
                            (c.set(g),
                                vec3.normalize(c, c),
                                vec3.cross(p, h, c),
                                vec3.normalize(p, p),
                                vec3.cross(d, p, c),
                                vec3.normalize(d, d),
                                f.set(p, 0),
                                f.set(c, 4),
                                f.set(d, 8),
                                mat4.setTranslation(f, v));
                        }
                        break;
                    case l.VERTICAL:
                        mat4.setTranslation(f, v);
                        break;
                    case l.SPHERICAL:
                        (d.set(v),
                            vec3.normalize(d, d),
                            vec3.cross(p, n, d),
                            vec3.normalize(p, p),
                            vec3.cross(c, d, p),
                            vec3.normalize(c, c),
                            f.set(p, 0),
                            f.set(c, 4),
                            f.set(d, 8),
                            mat4.setTranslation(f, v));
                        break;
                    case l.RANDOM:
                        ((a[0] = 2 * Math.random() - 1),
                            (a[1] = 2 * Math.random() - 1),
                            (a[2] = 2 * Math.random() - 1),
                            vec3.normalize(a, a),
                            quat.setAxisAngle(u, a, 2 * Math.random() * Math.PI),
                            mat4.fromQuat(f, u),
                            mat4.setTranslation(f, v));
                        break;
                    case l.RANDOM_VERTICAL:
                        (quat.setAxisAngle(u, n, 2 * Math.random() * Math.PI),
                            mat4.fromQuat(f, u),
                            mat4.setTranslation(f, v));
                        break;
                }
            }
            ((this._version = t._version), (this._geometry_id = t._id));
        }),
        e.registerNode("geometry/points_to_instances", l),
        (p.title = "Transform"),
        (p.prototype.onExecute = function () {
            var t = this.getInputData(0),
                e = this.getInputData(1);
            if (t)
                if (t.constructor !== Array) {
                    if (t.vertices && t.vertices.length) {
                        var i = t;
                        if (((this.outputs[0].type = "geometry"), this.isOutputConnected(0)))
                            if (e) {
                                var s = typedArrayToArray(e).join(",");
                                ((this.must_update ||
                                    i._id != this._last_geometry_id ||
                                    i._version != this._last_version ||
                                    s != this._last_key) &&
                                    (this.updateGeometry(i, e),
                                    (this._last_key = s),
                                    (this._last_version = i._version),
                                    (this._last_geometry_id = i._id),
                                    (this.must_update = !1)),
                                    this.setOutputData(0, this.geometry));
                            } else this.setOutputData(0, i);
                    }
                } else {
                    if (0 == t.length) return;
                    if (((this.outputs[0].type = "[mat4]"), !this.isOutputConnected(0))) return;
                    if (!e) return void this.setOutputData(0, t);
                    (this._output || (this._output = new Array()),
                        this._output.length != t.length && (this._output.length = t.length));
                    for (var r = 0; r < t.length; ++r) {
                        var o = this._output[r];
                        (o || (o = this._output[r] = mat4.create()), mat4.multiply(o, t[r], e));
                    }
                    this.setOutputData(0, this._output);
                }
        }),
        (p.prototype.updateGeometry = function (t, e) {
            var i = t.vertices,
                s = this.geometry.vertices;
            (s && s.length == i.length) || (s = this.geometry.vertices = new Float32Array(i.length));
            for (var r = vec3.create(), o = 0, a = s.length; o < a; o += 3)
                ((r[0] = i[o]),
                    (r[1] = i[o + 1]),
                    (r[2] = i[o + 2]),
                    mat4.multiplyVec3(r, e, r),
                    (s[o] = r[0]),
                    (s[o + 1] = r[1]),
                    (s[o + 2] = r[2]));
            if (t.normals) {
                (this.geometry.normals && this.geometry.normals.length == t.normals.length) ||
                    (this.geometry.normals = new Float32Array(t.normals.length));
                var n = this.geometry.normals,
                    h = mat4.invert(mat4.create(), e);
                h && mat4.transpose(h, h);
                var u = t.normals;
                for (o = 0, a = n.length; o < a; o += 3)
                    ((r[0] = u[o]),
                        (r[1] = u[o + 1]),
                        (r[2] = u[o + 2]),
                        mat4.multiplyVec3(r, h, r),
                        (n[o] = r[0]),
                        (n[o + 1] = r[1]),
                        (n[o + 2] = r[2]));
            }
            ((this.geometry.type = t.type), this.geometry._version++);
        }),
        e.registerNode("geometry/transform", p),
        (c.title = "Polygon"),
        (c.prototype.onExecute = function () {
            if (this.isOutputConnected(0)) {
                var t = this.getInputOrProperty("sides"),
                    e = this.getInputOrProperty("radius");
                ((t = 0 | Math.max(3, t)),
                    (this.last_info.sides == t && this.last_info.radius == e) || this.updateGeometry(t, e),
                    this.setOutputData(0, this.geometry));
            }
        }),
        (c.prototype.updateGeometry = function (t, e) {
            var i = 3 * t,
                s = this.geometry.vertices;
            (s && s.length == i) || (s = this.geometry.vertices = new Float32Array(3 * t));
            var r = (2 * Math.PI) / t,
                o = this.properties.uvs;
            o && (uvs = this.geometry.coords = new Float32Array(3 * t));
            for (var a = 0; a < t; ++a) {
                var n = r * -a,
                    h = Math.cos(n) * e,
                    u = 0,
                    d = Math.sin(n) * e;
                ((s[3 * a] = h), (s[3 * a + 1] = u), (s[3 * a + 2] = d));
            }
            ((this.geometry._id = ++this.geometry_id),
                (this.geometry._version = ++this.version),
                (this.last_info.sides = t),
                (this.last_info.radius = e));
        }),
        e.registerNode("geometry/polygon", c),
        (m.title = "extrude"),
        (m.prototype.onPropertyChanged = function (t, e) {
            this._must_update = !0;
        }),
        (m.prototype.onExecute = function () {
            var t = this.getInputData(0);
            t &&
                this.isOutputConnected(0) &&
                ((t.version != this._last_geo_version || this._must_update) &&
                    ((this._geo = this.extrudeGeometry(t, this._geo)),
                    this._geo && (this._geo.version = this.version++),
                    (this._must_update = !1)),
                this.setOutputData(0, this._geo));
        }),
        (m.prototype.extrudeGeometry = function (t) {
            var e = t.vertices,
                i = e.length / 3,
                s = vec3.create(),
                r = vec3.create(),
                o = vec3.create(),
                a = vec3.create(),
                n = new Float32Array(this.properties.offset);
            if ("line_loop" == t.type)
                for (var u = new Float32Array(6 * i * 3), d = 0, l = 0, p = e.length; l < p; l += 3)
                    ((s[0] = e[l]),
                        (s[1] = e[l + 1]),
                        (s[2] = e[l + 2]),
                        l + 3 < p
                            ? ((r[0] = e[l + 3]), (r[1] = e[l + 4]), (r[2] = e[l + 5]))
                            : ((r[0] = e[0]), (r[1] = e[1]), (r[2] = e[2])),
                        vec3.add(o, s, n),
                        vec3.add(a, r, n),
                        u.set(s, d),
                        (d += 3),
                        u.set(r, d),
                        (d += 3),
                        u.set(o, d),
                        (d += 3),
                        u.set(r, d),
                        (d += 3),
                        u.set(a, d),
                        (d += 3),
                        u.set(o, d),
                        (d += 3));
            var c = { _id: h(), type: "triangles", vertices: u };
            return c;
        }),
        e.registerNode("geometry/extrude", m),
        (_.title = "geoeval"),
        (_.desc = "eval code"),
        (_.widgets_info = { code: { widget: "code" } }),
        (_.prototype.onConfigure = function (t) {
            this.compileCode();
        }),
        (_.prototype.compileCode = function () {
            if (this.properties.code)
                try {
                    ((this.func = new Function("V", "I", "T", this.properties.code)),
                        (this.boxcolor = "#AFA"),
                        (this.must_update = !0));
                } catch (t) {
                    this.boxcolor = "red";
                }
        }),
        (_.prototype.onPropertyChanged = function (t, e) {
            "code" == t && ((this.properties.code = e), this.compileCode());
        }),
        (_.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (t)
                if (this.func) {
                    if (
                        this.geometry_id != t._id ||
                        this.version != t._version ||
                        this.must_update ||
                        this.properties.execute_every_frame
                    ) {
                        ((this.must_update = !1),
                            (this.geometry_id = t._id),
                            this.properties.execute_every_frame ? this.version++ : (this.version = t._version));
                        var e = this.func,
                            i = getTime();
                        for (var s in (this.geometry || (this.geometry = {}), t))
                            null != t[s] &&
                                (t[s].constructor == Float32Array
                                    ? (this.geometry[s] = new Float32Array(t[s]))
                                    : (this.geometry[s] = t[s]));
                        ((this.geometry._id = t._id),
                            this.properties.execute_every_frame
                                ? (this.geometry._version = this.version)
                                : (this.geometry._version = t._version + 1));
                        var r = vec3.create(),
                            o = this.vertices;
                        o && this.vertices.length == t.vertices.length
                            ? o.set(t.vertices)
                            : (o = this.vertices = new Float32Array(t.vertices));
                        for (s = 0; s < o.length; s += 3)
                            ((r[0] = o[s]),
                                (r[1] = o[s + 1]),
                                (r[2] = o[s + 2]),
                                e(r, s / 3, i),
                                (o[s] = r[0]),
                                (o[s + 1] = r[1]),
                                (o[s + 2] = r[2]));
                        this.geometry.vertices = o;
                    }
                    this.setOutputData(0, this.geometry);
                } else this.setOutputData(0, t);
        }),
        e.registerNode("geometry/eval", _),
        (f.title = "connect points"),
        (f.desc = "adds indices between near points"),
        (f.prototype.onPropertyChanged = function (t, e) {
            this.must_update = !0;
        }),
        (f.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (t) {
                if (this.geometry_id != t._id || this.version != t._version || this.must_update) {
                    for (var e in ((this.must_update = !1),
                    (this.geometry_id = t._id),
                    (this.version = t._version),
                    (this.geometry = {}),
                    t))
                        this.geometry[e] = t[e];
                    ((this.geometry._id = h()), (this.geometry._version = this.my_version++));
                    var i = t.vertices,
                        s = i.length,
                        r = this.properties.min_dist,
                        o = this.properties.max_dist,
                        a = this.properties.probability,
                        n = this.properties.max_connections,
                        u = [];
                    for (e = 0; e < s; e += 3)
                        for (var d = i[e], l = i[e + 1], p = i[e + 2], c = 0, m = e + 3; m < s; m += 3) {
                            var _ = i[m],
                                f = i[m + 1],
                                v = i[m + 2],
                                g = Math.sqrt((d - _) * (d - _) + (l - f) * (l - f) + (p - v) * (p - v));
                            if (
                                !(g > o || g < r || (a < 1 && a < Math.random())) &&
                                (u.push(e / 3, m / 3), (c += 1), n && c > n)
                            )
                                break;
                        }
                    this.geometry.indices = this.indices = new Uint32Array(u);
                }
                this.indices && this.indices.length
                    ? ((this.geometry.indices = this.indices), this.setOutputData(0, this.geometry))
                    : this.setOutputData(0, null);
            }
        }),
        e.registerNode("geometry/connectPoints", f),
        "undefined" != typeof GL &&
            ((v.title = "to geometry"),
            (v.desc = "converts a mesh to geometry"),
            (v.prototype.onExecute = function () {
                var t = this.getInputData(0);
                if (t) {
                    if (t != this.last_mesh) {
                        for (i in ((this.last_mesh = t), t.vertexBuffers)) {
                            var e = t.vertexBuffers[i];
                            this.geometry[i] = e.data;
                        }
                        (t.indexBuffers["triangles"] && (this.geometry.indices = t.indexBuffers["triangles"].data),
                            (this.geometry._id = h()),
                            (this.geometry._version = 0));
                    }
                    (this.setOutputData(0, this.geometry),
                        this.geometry && this.setOutputData(1, this.geometry.vertices));
                }
            }),
            e.registerNode("geometry/toGeometry", v),
            (g.title = "Geo to Mesh"),
            (g.prototype.updateMesh = function (t) {
                for (var e in (this.mesh || (this.mesh = new GL.Mesh()), t))
                    if ("_" != e[0]) {
                        var i = t[e],
                            s = GL.Mesh.common_buffers[e];
                        if (s || "indices" == e) {
                            var r = s ? s.spacing : 3,
                                o = this.mesh.vertexBuffers[e];
                            (o && o.data.length == i.length
                                ? (o.data.set(i), o.upload(GL.DYNAMIC_DRAW))
                                : (o = new GL.Buffer(
                                      "indices" == e ? GL.ELEMENT_ARRAY_BUFFER : GL.ARRAY_BUFFER,
                                      i,
                                      r,
                                      GL.DYNAMIC_DRAW,
                                  )),
                                this.mesh.addBuffer(e, o));
                        }
                    }
                if (
                    this.mesh.vertexBuffers.normals &&
                    this.mesh.vertexBuffers.normals.data.length != this.mesh.vertexBuffers.vertices.data.length
                ) {
                    var a = new Float32Array([0, 1, 0]),
                        n = new Float32Array(this.mesh.vertexBuffers.vertices.data.length);
                    for (e = 0; e < n.length; e += 3) n.set(a, e);
                    ((o = new GL.Buffer(GL.ARRAY_BUFFER, n, 3)), this.mesh.addBuffer("normals", o));
                }
                return (
                    this.mesh.updateBoundingBox(),
                    (this.geometry_id = this.mesh.id = t._id),
                    (this.version = this.mesh.version = t._version),
                    this.mesh
                );
            }),
            (g.prototype.onExecute = function () {
                var t = this.getInputData(0);
                t &&
                    ((this.version == t._version && this.geometry_id == t._id) || this.updateMesh(t),
                    this.setOutputData(0, this.mesh));
            }),
            e.registerNode("geometry/toMesh", g),
            (y.title = "Render Mesh"),
            (y.desc = "renders a mesh flat"),
            (y.PRIMITIVE_VALUES = {
                points: GL.POINTS,
                lines: GL.LINES,
                line_loop: GL.LINE_LOOP,
                line_strip: GL.LINE_STRIP,
                triangles: GL.TRIANGLES,
                triangle_fan: GL.TRIANGLE_FAN,
                triangle_strip: GL.TRIANGLE_STRIP,
            }),
            (y.widgets_info = {
                primitive: { widget: "combo", values: y.PRIMITIVE_VALUES },
                color: { widget: "color" },
            }),
            (y.prototype.onExecute = function () {
                if (this.properties.enabled) {
                    var t = this.getInputData(0);
                    if (t)
                        if (e.GraphDocumentRender.onRequestCameraMatrices) {
                            e.GraphDocumentRender.onRequestCameraMatrices(s, r, o);
                            var i = null,
                                a = this.getInputData(2);
                            (a
                                ? ((i = gl.shaders["textured"]),
                                  i ||
                                      (i = gl.shaders["textured"] =
                                          new GL.Shader(M.vertex_shader_code, M.fragment_shader_code, {
                                              USE_TEXTURE: "",
                                          })))
                                : ((i = gl.shaders["flat"]),
                                  i ||
                                      (i = gl.shaders["flat"] =
                                          new GL.Shader(M.vertex_shader_code, M.fragment_shader_code))),
                                this.color.set(this.properties.color),
                                (this.color[3] = this.properties.opacity));
                            var h = this.model_matrix,
                                u = this.getInputData(1);
                            (u ? h.set(u) : mat4.identity(h), (this.uniforms.u_point_size = 1));
                            var d = this.properties.primitive;
                            (i.uniforms(n),
                                i.uniforms(this.uniforms),
                                this.properties.opacity >= 1 ? gl.disable(gl.BLEND) : gl.enable(gl.BLEND),
                                gl.enable(gl.DEPTH_TEST),
                                this.properties.additive
                                    ? (gl.blendFunc(gl.SRC_ALPHA, gl.ONE), gl.depthMask(!1))
                                    : gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA));
                            var l = "indices";
                            (t.indexBuffers.triangles && (l = "triangles"),
                                i.draw(t, d, l),
                                gl.disable(gl.BLEND),
                                gl.depthMask(!0));
                        } else
                            console.warn(
                                "cannot render geometry, PandaUI.onRequestCameraMatrices is null, remember to fill this with a callback(view_matrix, projection_matrix,viewprojection_matrix) to use 3D rendering from the graph",
                            );
                }
            }),
            e.registerNode("geometry/render_mesh", y),
            (E.title = "Primitive"),
            (E.VALID = {
                CUBE: 1,
                PLANE: 2,
                CYLINDER: 3,
                SPHERE: 4,
                CIRCLE: 5,
                HEMISPHERE: 6,
                ICOSAHEDRON: 7,
                CONE: 8,
                QUAD: 9,
            }),
            (E.widgets_info = { type: { widget: "combo", values: E.VALID } }),
            (E.prototype.onExecute = function () {
                if (this.isOutputConnected(0)) {
                    var t = this.getInputOrProperty("size");
                    ((this.last_info.type == this.properties.type &&
                        this.last_info.size == t &&
                        this.last_info.subdivisions == this.properties.subdivisions) ||
                        this.updateMesh(this.properties.type, t, this.properties.subdivisions),
                        this.setOutputData(0, this._mesh));
                }
            }),
            (E.prototype.updateMesh = function (t, e, i) {
                switch (((i = 0 | Math.max(0, i)), t)) {
                    case 1:
                        this._mesh = GL.Mesh.cube({ size: e, normals: !0, coords: !0 });
                        break;
                    case 2:
                        this._mesh = GL.Mesh.plane({ size: e, xz: !0, detail: i, normals: !0, coords: !0 });
                        break;
                    case 3:
                        this._mesh = GL.Mesh.cylinder({ size: e, subdivisions: i, normals: !0, coords: !0 });
                        break;
                    case 4:
                        this._mesh = GL.Mesh.sphere({ size: e, long: i, lat: i, normals: !0, coords: !0 });
                        break;
                    case 5:
                        this._mesh = GL.Mesh.circle({ size: e, slices: i, normals: !0, coords: !0 });
                        break;
                    case 6:
                        this._mesh = GL.Mesh.sphere({ size: e, long: i, lat: i, normals: !0, coords: !0, hemi: !0 });
                        break;
                    case 7:
                        this._mesh = GL.Mesh.icosahedron({ size: e, subdivisions: i });
                        break;
                    case 8:
                        this._mesh = GL.Mesh.cone({ radius: e, height: e, subdivisions: i });
                        break;
                    case 9:
                        this._mesh = GL.Mesh.plane({ size: e, xz: !1, detail: i, normals: !0, coords: !0 });
                        break;
                }
                ((this.last_info.type = t),
                    (this.last_info.size = e),
                    (this.last_info.subdivisions = i),
                    (this._mesh.version = this.version++));
            }),
            e.registerNode("geometry/mesh_primitive", E),
            (M.title = "renderPoints"),
            (M.desc = "render points with a texture"),
            (M.widgets_info = { color: { widget: "color" } }),
            (M.prototype.updateMesh = function (t) {
                this.buffer;
                (this.buffer && this.buffer.data && this.buffer.data.length == t.vertices.length
                    ? (this.buffer.data.set(t.vertices), this.buffer.upload(GL.DYNAMIC_DRAW))
                    : (this.buffer = new GL.Buffer(GL.ARRAY_BUFFER, t.vertices, 3, GL.DYNAMIC_DRAW)),
                    this.mesh || (this.mesh = new GL.Mesh()),
                    this.mesh.addBuffer("vertices", this.buffer),
                    (this.geometry_id = this.mesh.id = t._id),
                    (this.version = this.mesh.version = t._version));
            }),
            (M.prototype.onExecute = function () {
                if (this.properties.enabled) {
                    var t = this.getInputData(0);
                    if (t)
                        if (
                            ((this.version == t._version && this.geometry_id == t._id) || this.updateMesh(t),
                            e.GraphDocumentRender.onRequestCameraMatrices)
                        ) {
                            e.GraphDocumentRender.onRequestCameraMatrices(s, r, o);
                            var i = null,
                                h = this.getInputData(2);
                            (h
                                ? ((i = gl.shaders["textured_points"]),
                                  i ||
                                      (i = gl.shaders["textured_points"] =
                                          new GL.Shader(M.vertex_shader_code, M.fragment_shader_code, {
                                              USE_TEXTURED_POINTS: "",
                                          })))
                                : ((i = gl.shaders["points"]),
                                  i ||
                                      (i = gl.shaders["points"] =
                                          new GL.Shader(M.vertex_shader_code, M.fragment_shader_code, {
                                              USE_POINTS: "",
                                          }))),
                                this.color.set(this.properties.color),
                                (this.color[3] = this.properties.opacity));
                            var u = this.getInputData(1);
                            (u ? a.set(u) : mat4.identity(a),
                                (this.uniforms.u_point_size = this.properties.point_size),
                                (this.uniforms.u_point_perspective = this.properties.fixed_size ? 0 : 1),
                                (this.uniforms.u_perspective = gl.viewport_data[3] * r[5]),
                                i.uniforms(n),
                                i.uniforms(this.uniforms),
                                this.properties.opacity >= 1 ? gl.disable(gl.BLEND) : gl.enable(gl.BLEND),
                                gl.enable(gl.DEPTH_TEST),
                                this.properties.additive
                                    ? (gl.blendFunc(gl.SRC_ALPHA, gl.ONE), gl.depthMask(!1))
                                    : gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA),
                                i.draw(this.mesh, GL.POINTS),
                                gl.disable(gl.BLEND),
                                gl.depthMask(!0));
                        } else
                            console.warn(
                                "cannot render geometry, PandaUI.onRequestCameraMatrices is null, remember to fill this with a callback(view_matrix, projection_matrix,viewprojection_matrix) to use 3D rendering from the graph",
                            );
                }
            }),
            e.registerNode("geometry/render_points", M),
            (M.vertex_shader_code =
                "\t\tprecision mediump float;\n\t\tattribute vec3 a_vertex;\n\t\tvarying vec3 v_vertex;\n\t\tattribute vec3 a_normal;\n\t\tvarying vec3 v_normal;\n\t\t#ifdef USE_COLOR\n\t\t\tattribute vec4 a_color;\n\t\t\tvarying vec4 v_color;\n\t\t#endif\n\t\tattribute vec2 a_coord;\n\t\tvarying vec2 v_coord;\n\t\t#ifdef USE_SIZE\n\t\t\tattribute float a_extra;\n\t\t#endif\n\t\t#ifdef USE_INSTANCING\n\t\t\tattribute mat4 u_model;\n\t\t#else\n\t\t\tuniform mat4 u_model;\n\t\t#endif\n\t\tuniform mat4 u_viewprojection;\n\t\tuniform float u_point_size;\n\t\tuniform float u_perspective;\n\t\tuniform float u_point_perspective;\n\t\tfloat computePointSize(float radius, float w)\n\t\t{\n\t\t\tif(radius < 0.0)\n\t\t\t\treturn -radius;\n\t\t\treturn u_perspective * radius / w;\n\t\t}\n\t\tvoid main() {\n\t\t\tv_coord = a_coord;\n\t\t\t#ifdef USE_COLOR\n\t\t\t\tv_color = a_color;\n\t\t\t#endif\n\t\t\tv_vertex = ( u_model * vec4( a_vertex, 1.0 )).xyz;\n\t\t\tv_normal = ( u_model * vec4( a_normal, 0.0 )).xyz;\n\t\t\tgl_Position = u_viewprojection * vec4(v_vertex,1.0);\n\t\t\tgl_PointSize = u_point_size;\n\t\t\t#ifdef USE_SIZE\n\t\t\t\tgl_PointSize = a_extra;\n\t\t\t#endif\n\t\t\tif(u_point_perspective != 0.0)\n\t\t\t\tgl_PointSize = computePointSize( gl_PointSize, gl_Position.w );\n\t\t}\t"),
            (M.fragment_shader_code =
                "\t\tprecision mediump float;\n\t\tuniform vec4 u_color;\n\t\t#ifdef USE_COLOR\n\t\t\tvarying vec4 v_color;\n\t\t#endif\n\t\tvarying vec2 v_coord;\n\t\tuniform sampler2D u_texture;\n\t\tvoid main() {\n\t\t\tvec4 color = u_color;\n\t\t\t#ifdef USE_TEXTURED_POINTS\n\t\t\t\tcolor *= texture2D(u_texture, gl_PointCoord.xy);\n\t\t\t#else\n\t\t\t\t#ifdef USE_TEXTURE\n\t\t\t\t  color *= texture2D(u_texture, v_coord);\n\t\t\t\t  if(color.a < 0.1)\n\t\t\t\t\tdiscard;\n\t\t\t\t#endif\n\t\t\t\t#ifdef USE_POINTS\n\t\t\t\t\tfloat dist = length( gl_PointCoord.xy - vec2(0.5) );\n\t\t\t\t\tif( dist > 0.45 )\n\t\t\t\t\t\tdiscard;\n\t\t\t\t#endif\n\t\t\t#endif\n\t\t\t#ifdef USE_COLOR\n\t\t\t\tcolor *= v_color;\n\t\t\t#endif\n\t\t\tgl_FragColor = color;\n\t\t}\t")));
})(this);
