(function (global) {
    var PandaUI = global.PandaUI;
    if (!PandaUI || !PandaUI.nodeTypes) return;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function notifyValueChanged(node, previousValue) {
        if (node.graph) {
            node.graph._version++;
            if (typeof node.graph.onWidgetChanged === "function" && previousValue !== node.properties.value) {
                node.graph.onWidgetChanged(node, "value", node.properties.value, previousValue, null);
            }
            if (typeof node.graph.invalidateNode === "function") {
                node.graph.invalidateNode(node, { source: true, propagate: true, reason: "node-drag" });
            }
        }
        node.setDirtyCanvas(true, true);
    }

    if (typeof PandaUI.colorToString !== "function") {
        PandaUI.colorToString = function (color) {
            var red = Math.round(clamp(Number(color && color[0]) || 0, 0, 1) * 255);
            var green = Math.round(clamp(Number(color && color[1]) || 0, 0, 1) * 255);
            var blue = Math.round(clamp(Number(color && color[2]) || 0, 0, 1) * 255);
            return "rgb(" + red + "," + green + "," + blue + ")";
        };
    }

    var NumberNode = PandaUI.nodeTypes["widget/number"];
    if (NumberNode) {
        NumberNode.prototype.onDrawForeground = function (context) {
            if (this.flags && this.flags.collapsed) return;
            var centerX = this.size[0] * 0.5;
            var height = this.size[1];
            if (height > 30) {
                context.fillStyle = NumberNode.markers_color || "#666";
                context.beginPath();
                context.moveTo(centerX, height * 0.1);
                context.lineTo(centerX + height * 0.1, height * 0.2);
                context.lineTo(centerX - height * 0.1, height * 0.2);
                context.fill();
                context.beginPath();
                context.moveTo(centerX, height * 0.9);
                context.lineTo(centerX + height * 0.1, height * 0.8);
                context.lineTo(centerX - height * 0.1, height * 0.8);
                context.fill();
            }
            context.fillStyle = "#EEE";
            context.font = (height * 0.3).toFixed(1) + "px Arial";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(this.properties.value.toFixed(this._precision || 0), centerX, height * 0.5);
            context.textAlign = "left";
            context.textBaseline = "alphabetic";
        };

        NumberNode.prototype.onMouseDown = function (event, localPosition) {
            if (!localPosition || localPosition[1] < 0) return false;
            this._pandauiDragX = localPosition[0];
            this._pandauiDragMoved = false;
            this._remainder = 0;
            this.mouse_captured = true;
            this.captureInput(true);
            return true;
        };

        NumberNode.prototype.onMouseMove = function (event, localPosition) {
            if (!this.mouse_captured || !localPosition) return;
            var delta = localPosition[0] - this._pandauiDragX;
            if (event.shiftKey) delta *= 10;
            if (event.metaKey || event.altKey) delta *= 0.1;
            this._pandauiDragX = localPosition[0];
            this._pandauiDragMoved = this._pandauiDragMoved || Math.abs(delta) > 0;
            var increment = this._remainder + delta / (NumberNode.pixels_threshold || 10);
            var wholeSteps = increment < 0 ? Math.ceil(increment) : Math.floor(increment);
            this._remainder = increment - wholeSteps;
            if (!wholeSteps) return;
            var previousValue = this.properties.value;
            this.properties.value = clamp(
                previousValue + wholeSteps * this.properties.step,
                this.properties.min,
                this.properties.max,
            );
            notifyValueChanged(this, previousValue);
        };

        NumberNode.prototype.onMouseUp = function () {
            this.mouse_captured = false;
            this._pandauiDragX = null;
            this.captureInput(false);
        };
    }

    var KnobNode = PandaUI.nodeTypes["widget/knob"];
    if (KnobNode) {
        KnobNode.prototype.onExecute = function () {
            this.setOutputData(0, this.properties.value);
            this.boxcolor = PandaUI.colorToString([this.value, this.value, this.value]);
        };

        KnobNode.prototype.onMouseDown = function (event, localPosition) {
            if (!localPosition) return false;
            var centerX = this.size[0] * 0.5;
            var centerY = this.size[1] * 0.5;
            var radius = Math.min(this.size[0], this.size[1]) * 0.5;
            var deltaX = localPosition[0] - centerX;
            var deltaY = localPosition[1] - centerY;
            if (Math.hypot(deltaX, deltaY) > radius) return false;
            var range = this.properties.max - this.properties.min;
            this.value = range ? clamp((this.properties.value - this.properties.min) / range, 0, 1) : 0;
            this._pandauiDragX = localPosition[0];
            this.captureInput(true);
            return true;
        };

        KnobNode.prototype.onMouseMove = function (event, localPosition) {
            if (this._pandauiDragX == null || !localPosition) return;
            var delta = localPosition[0] - this._pandauiDragX;
            if (event.shiftKey) delta *= 2;
            if (event.metaKey || event.altKey) delta *= 0.1;
            this._pandauiDragX = localPosition[0];
            var previousValue = this.properties.value;
            this.value = clamp(this.value + delta / Math.max(40, this.size[0]), 0, 1);
            this.properties.value = this.properties.min + (this.properties.max - this.properties.min) * this.value;
            notifyValueChanged(this, previousValue);
        };

        KnobNode.prototype.onMouseUp = function () {
            this._pandauiDragX = null;
            this.captureInput(false);
        };
    }
})(typeof window !== "undefined" ? window : globalThis);
