// PandaUI NativeNode migration of the classic node collection.
+(function (t) {
    var e = t.PandaUI;
    function a() {
        (this.addOutput("left_x_axis", "number"),
            this.addOutput("left_y_axis", "number"),
            this.addOutput("button_pressed", e.EVENT),
            (this.properties = { gamepad_index: 0, threshold: 0.1 }),
            (this._left_axis = new Float32Array(2)),
            (this._right_axis = new Float32Array(2)),
            (this._triggers = new Float32Array(2)),
            (this._previous_buttons = new Uint8Array(17)),
            (this._current_buttons = new Uint8Array(17)));
    }
    ((a.title = "Gamepad"),
        (a.desc = "gets the input of the gamepad"),
        (a.CENTER = 0),
        (a.LEFT = 1),
        (a.RIGHT = 2),
        (a.UP = 4),
        (a.DOWN = 8),
        (a.zero = new Float32Array(2)),
        (a.buttons = ["a", "b", "x", "y", "lb", "rb", "lt", "rt", "back", "start", "ls", "rs", "home"]),
        (a.prototype.onExecute = function () {
            var t = this.getGamepad(),
                e = this.properties.threshold || 0;
            if (
                (t &&
                    ((this._left_axis[0] = Math.abs(t.xbox.axes["lx"]) > e ? t.xbox.axes["lx"] : 0),
                    (this._left_axis[1] = Math.abs(t.xbox.axes["ly"]) > e ? t.xbox.axes["ly"] : 0),
                    (this._right_axis[0] = Math.abs(t.xbox.axes["rx"]) > e ? t.xbox.axes["rx"] : 0),
                    (this._right_axis[1] = Math.abs(t.xbox.axes["ry"]) > e ? t.xbox.axes["ry"] : 0),
                    (this._triggers[0] = Math.abs(t.xbox.axes["ltrigger"]) > e ? t.xbox.axes["ltrigger"] : 0),
                    (this._triggers[1] = Math.abs(t.xbox.axes["rtrigger"]) > e ? t.xbox.axes["rtrigger"] : 0)),
                this.outputs)
            )
                for (var s = 0; s < this.outputs.length; s++) {
                    var r = this.outputs[s];
                    if (r.links && r.links.length) {
                        var b = null;
                        if (t)
                            switch (r.name) {
                                case "left_axis":
                                    b = this._left_axis;
                                    break;
                                case "right_axis":
                                    b = this._right_axis;
                                    break;
                                case "left_x_axis":
                                    b = this._left_axis[0];
                                    break;
                                case "left_y_axis":
                                    b = this._left_axis[1];
                                    break;
                                case "right_x_axis":
                                    b = this._right_axis[0];
                                    break;
                                case "right_y_axis":
                                    b = this._right_axis[1];
                                    break;
                                case "trigger_left":
                                    b = this._triggers[0];
                                    break;
                                case "trigger_right":
                                    b = this._triggers[1];
                                    break;
                                case "a_button":
                                    b = t.xbox.buttons["a"] ? 1 : 0;
                                    break;
                                case "b_button":
                                    b = t.xbox.buttons["b"] ? 1 : 0;
                                    break;
                                case "x_button":
                                    b = t.xbox.buttons["x"] ? 1 : 0;
                                    break;
                                case "y_button":
                                    b = t.xbox.buttons["y"] ? 1 : 0;
                                    break;
                                case "lb_button":
                                    b = t.xbox.buttons["lb"] ? 1 : 0;
                                    break;
                                case "rb_button":
                                    b = t.xbox.buttons["rb"] ? 1 : 0;
                                    break;
                                case "ls_button":
                                    b = t.xbox.buttons["ls"] ? 1 : 0;
                                    break;
                                case "rs_button":
                                    b = t.xbox.buttons["rs"] ? 1 : 0;
                                    break;
                                case "hat_left":
                                    b = t.xbox.hatmap & a.LEFT;
                                    break;
                                case "hat_right":
                                    b = t.xbox.hatmap & a.RIGHT;
                                    break;
                                case "hat_up":
                                    b = t.xbox.hatmap & a.UP;
                                    break;
                                case "hat_down":
                                    b = t.xbox.hatmap & a.DOWN;
                                    break;
                                case "hat":
                                    b = t.xbox.hatmap;
                                    break;
                                case "start_button":
                                    b = t.xbox.buttons["start"] ? 1 : 0;
                                    break;
                                case "back_button":
                                    b = t.xbox.buttons["back"] ? 1 : 0;
                                    break;
                                case "button_pressed":
                                    for (var n = 0; n < this._current_buttons.length; ++n)
                                        this._current_buttons[n] &&
                                            !this._previous_buttons[n] &&
                                            this.triggerSlot(s, a.buttons[n]);
                                    break;
                                default:
                                    break;
                            }
                        else
                            switch (r.name) {
                                case "button_pressed":
                                    break;
                                case "left_axis":
                                case "right_axis":
                                    b = a.zero;
                                    break;
                                default:
                                    b = 0;
                            }
                        this.setOutputData(s, b);
                    }
                }
        }),
        (a.mapping = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9, ls: 10, rs: 11 }),
        (a.mapping_array = ["a", "b", "x", "y", "lb", "rb", "lt", "rt", "back", "start", "ls", "rs"]),
        (a.prototype.getGamepad = function () {
            var t = navigator.getGamepads || navigator.webkitGetGamepads || navigator.mozGetGamepads;
            if (!t) return null;
            var e = t.call(navigator),
                s = null;
            this._previous_buttons.set(this._current_buttons);
            for (var r = this.properties.gamepad_index; r < 4; r++)
                if (e[r]) {
                    s = e[r];
                    var b = this.xbox_mapping;
                    (b || (b = this.xbox_mapping = { axes: [], buttons: {}, hat: "", hatmap: a.CENTER }),
                        (b.axes["lx"] = s.axes[0]),
                        (b.axes["ly"] = s.axes[1]),
                        (b.axes["rx"] = s.axes[2]),
                        (b.axes["ry"] = s.axes[3]),
                        (b.axes["ltrigger"] = s.buttons[6].value),
                        (b.axes["rtrigger"] = s.buttons[7].value),
                        (b.hat = ""),
                        (b.hatmap = a.CENTER));
                    for (var n = 0; n < s.buttons.length; n++)
                        if (((this._current_buttons[n] = s.buttons[n].pressed), n < 12))
                            ((b.buttons[a.mapping_array[n]] = s.buttons[n].pressed),
                                s.buttons[n].was_pressed && this.trigger(a.mapping_array[n] + "_button_event"));
                        else
                            switch (n) {
                                case 12:
                                    s.buttons[n].pressed && ((b.hat += "up"), (b.hatmap |= a.UP));
                                    break;
                                case 13:
                                    s.buttons[n].pressed && ((b.hat += "down"), (b.hatmap |= a.DOWN));
                                    break;
                                case 14:
                                    s.buttons[n].pressed && ((b.hat += "left"), (b.hatmap |= a.LEFT));
                                    break;
                                case 15:
                                    s.buttons[n].pressed && ((b.hat += "right"), (b.hatmap |= a.RIGHT));
                                    break;
                                case 16:
                                    b.buttons["home"] = s.buttons[n].pressed;
                                    break;
                                default:
                            }
                    return ((s.xbox = b), s);
                }
        }),
        (a.prototype.onDrawBackground = function (t) {
            if (!this.flags.collapsed) {
                var e = this._left_axis,
                    a = this._right_axis;
                ((t.strokeStyle = "#88A"),
                    t.strokeRect(0.5 * (e[0] + 1) * this.size[0] - 4, 0.5 * (e[1] + 1) * this.size[1] - 4, 8, 8),
                    (t.strokeStyle = "#8A8"),
                    t.strokeRect(0.5 * (a[0] + 1) * this.size[0] - 4, 0.5 * (a[1] + 1) * this.size[1] - 4, 8, 8));
                var s = this.size[1] / this._current_buttons.length;
                t.fillStyle = "#AEB";
                for (var r = 0; r < this._current_buttons.length; ++r)
                    this._current_buttons[r] && t.fillRect(0, s * r, 6, s);
            }
        }),
        (a.prototype.onGetOutputs = function () {
            return [
                ["left_axis", "vec2"],
                ["right_axis", "vec2"],
                ["left_x_axis", "number"],
                ["left_y_axis", "number"],
                ["right_x_axis", "number"],
                ["right_y_axis", "number"],
                ["trigger_left", "number"],
                ["trigger_right", "number"],
                ["a_button", "number"],
                ["b_button", "number"],
                ["x_button", "number"],
                ["y_button", "number"],
                ["lb_button", "number"],
                ["rb_button", "number"],
                ["ls_button", "number"],
                ["rs_button", "number"],
                ["start_button", "number"],
                ["back_button", "number"],
                ["a_button_event", e.EVENT],
                ["b_button_event", e.EVENT],
                ["x_button_event", e.EVENT],
                ["y_button_event", e.EVENT],
                ["lb_button_event", e.EVENT],
                ["rb_button_event", e.EVENT],
                ["ls_button_event", e.EVENT],
                ["rs_button_event", e.EVENT],
                ["start_button_event", e.EVENT],
                ["back_button_event", e.EVENT],
                ["hat_left", "number"],
                ["hat_right", "number"],
                ["hat_up", "number"],
                ["hat_down", "number"],
                ["hat", "number"],
                ["button_pressed", e.EVENT],
            ];
        }),
        e.registerNode("input/gamepad", a));
})(this);
