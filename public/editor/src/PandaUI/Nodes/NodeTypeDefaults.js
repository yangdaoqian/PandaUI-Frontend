// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI;
    ("undefined" == typeof e.slot_types_default_in && (e.slot_types_default_in = {}),
        (e.slot_types_default_in["_event_"] = "widget/button"),
        (e.slot_types_default_in["array"] = "basic/array"),
        (e.slot_types_default_in["boolean"] = "basic/boolean"),
        (e.slot_types_default_in["number"] = "widget/number"),
        (e.slot_types_default_in["object"] = "basic/data"),
        (e.slot_types_default_in["string"] = ["basic/string", "string/concatenate"]),
        (e.slot_types_default_in["vec2"] = "math3d/xy-to-vec2"),
        (e.slot_types_default_in["vec3"] = "math3d/xyz-to-vec3"),
        (e.slot_types_default_in["vec4"] = "math3d/xyzw-to-vec4"),
        "undefined" == typeof e.slot_types_default_out && (e.slot_types_default_out = {}),
        (e.slot_types_default_out["_event_"] = ["logic/IF", "events/sequencer", "events/log", "events/counter"]),
        (e.slot_types_default_out["array"] = ["basic/watch", "basic/set_array", "basic/array[]"]),
        (e.slot_types_default_out["boolean"] = ["logic/IF", "basic/watch", "math/branch", "math/gate"]),
        (e.slot_types_default_out["number"] = [
            "basic/watch",
            { node: "math/operation", properties: { OP: "*" }, title: "A*B" },
            { node: "math/operation", properties: { OP: "/" }, title: "A/B" },
            { node: "math/operation", properties: { OP: "+" }, title: "A+B" },
            { node: "math/operation", properties: { OP: "-" }, title: "A-B" },
            { node: "math/compare", outputs: [["A==B", "boolean"]], title: "A==B" },
            { node: "math/compare", outputs: [["A>B", "boolean"]], title: "A>B" },
            { node: "math/compare", outputs: [["A<B", "boolean"]], title: "A<B" },
        ]),
        (e.slot_types_default_out["object"] = [
            "basic/object_property",
            "basic/keys",
            ["string/toString", "basic/watch"],
        ]),
        (e.slot_types_default_out["string"] = [
            "basic/watch",
            "string/compare",
            "string/concatenate",
            "string/contains",
        ]),
        (e.slot_types_default_out["vec2"] = "math3d/vec2-to-xy"),
        (e.slot_types_default_out["vec3"] = "math3d/vec3-to-xyz"),
        (e.slot_types_default_out["vec4"] = "math3d/vec4-to-xyzw"));
})(this);
