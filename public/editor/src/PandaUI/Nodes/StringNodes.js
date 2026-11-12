// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var r = t.PandaUI;
    function n(t) {
        if (t && t.constructor === Object)
            try {
                return JSON.stringify(t);
            } catch (r) {
                return String(t);
            }
        return String(t);
    }
    function i(t, r) {
        return t == r;
    }
    function s(t, r) {
        return void 0 === t ? r : void 0 === r ? t : t + r;
    }
    function e(t, r) {
        return void 0 !== t && void 0 !== r && -1 != t.indexOf(r);
    }
    function o(t) {
        return null != t && t.constructor === String ? t.toUpperCase() : t;
    }
    function a(t, r) {
        if ((null == r && (r = this.properties.separator), null == t)) return [];
        if (t.constructor === String) return t.split(r || " ");
        if (t.constructor === Array) {
            for (var n = [], i = 0; i < t.length; ++i) "string" == typeof t[i] && (n[i] = t[i].split(r || " "));
            return n;
        }
        return null;
    }
    function u(t) {
        return null != t && t.constructor === Number ? t.toFixed(this.properties.precision) : t;
    }
    function p() {
        (this.addInput("", "string"),
            this.addOutput("table", "table"),
            this.addOutput("rows", "number"),
            this.addProperty("value", ""),
            this.addProperty("separator", ","),
            (this._table = null));
    }
    (r.wrapFunctionAsNode("string/toString", n, [""], "string"),
        r.wrapFunctionAsNode("string/compare", i, ["string", "string"], "boolean"),
        r.wrapFunctionAsNode("string/concatenate", s, ["string", "string"], "string"),
        r.wrapFunctionAsNode("string/contains", e, ["string", "string"], "boolean"),
        r.wrapFunctionAsNode("string/toUpperCase", o, ["string"], "string"),
        r.wrapFunctionAsNode("string/split", a, ["string,array", "string"], "array", { separator: "," }),
        r.wrapFunctionAsNode("string/toFixed", u, ["number"], "string", { precision: 0 }),
        (p.title = "toTable"),
        (p.desc = "Splits a string to table"),
        (p.prototype.onExecute = function () {
            var t = this.getInputData(0);
            if (t) {
                var r = this.properties.separator || ",";
                ((t == this._str && r == this._last_separator) ||
                    ((this._last_separator = r),
                    (this._str = t),
                    (this._table = t.split("\n").map(function (t) {
                        return t.trim().split(r);
                    }))),
                    this.setOutputData(0, this._table),
                    this.setOutputData(1, this._table ? this._table.length : 0));
            }
        }),
        r.registerNode("string/toTable", p));
})(this);
