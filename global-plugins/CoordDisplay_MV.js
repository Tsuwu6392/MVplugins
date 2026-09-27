//=============================================================================
// CoordDisplay_MV.js
//=============================================================================
// PORT NOTES:
//   - Window_Base in MV takes (x, y, width, height), not a Rectangle like MZ.
//   - The real bug in the previous version: Window_Base.prototype.
//     contentsWidth()/contentsHeight() in MV compute the contents bitmap
//     size from this.standardPadding() (hardcoded to 18), NOT from
//     this.padding. Overriding updatePadding() to set this.padding = 4
//     changes frame/dimmer padding but does nothing to the contents bitmap
//     size, which createContents() still sizes off the hardcoded 18 on
//     each side. With this window's height (42), that left a 6px-tall
//     contents bitmap for 18px text - effectively invisible, no error
//     thrown. Fixed by overriding standardPadding() as well, so
//     contentsWidth()/contentsHeight() use our value too.
//=============================================================================

/*:
 * @target MV
 * @plugindesc Shows map name and player coordinates in the top-right corner. (MV port)
 * @author Claude
 *
 * @param fontSize
 * @text Font Size
 * @type number
 * @min 8
 * @default 18
 *
 * @param textColor
 * @text Text Color
 * @desc CSS color string.
 * @default #ffffff
 *
 * @param xDecimals
 * @text X Decimals
 * @type number
 * @min 0
 * @max 3
 * @default 1
 *
 * @param yDecimals
 * @text Y Decimals
 * @type number
 * @min 0
 * @max 3
 * @default 0
 *
 * @param shadowColor
 * @text Shadow Color
 * @desc CSS color string for the drop shadow, keeps text legible over any background. Set alpha to 0 to disable.
 * @default rgba(0,0,0,0.6)
 *
 * @param padding
 * @text Corner Padding
 * @type number
 * @min 0
 * @default 8
 *
 * @param position
 * @text Screen Position
 * @desc Where to anchor the display: any corner or the middle of any edge.
 * @type select
 * @option Top Left
 * @value topLeft
 * @option Top Center
 * @value topCenter
 * @option Top Right
 * @value topRight
 * @option Middle Left
 * @value middleLeft
 * @option Middle Right
 * @value middleRight
 * @option Bottom Left
 * @value bottomLeft
 * @option Bottom Center
 * @value bottomCenter
 * @option Bottom Right
 * @value bottomRight
 * @default topRight
 *
 * @help CoordDisplay_MV.js
 *
 * MV port of CoordDisplay.js. Displays "MapName - X;Y" anchored at a corner
 * or edge-midpoint of the map screen (configurable via the Screen Position
 * parameter). X and Y decimal precision are configurable separately (player
 * position is fractional while moving).
 *
 * While a message window is open, the display shifts to the middle of
 * the same side (left stays left, right/center becomes right) so it
 * never overlaps the message box, then returns to its normal position
 * once the message closes.
 *
 * No plugin commands. Just add to the plugin list and turn it on.
 */

(function () {
    "use strict";

    var pluginName = "CoordDisplay_MV";
    var params = PluginManager.parameters(pluginName);
    var fontSize = Number(params.fontSize || 18);
    var textColor = String(params.textColor || "#ffffff");
    var shadowColor = String(params.shadowColor || "rgba(0,0,0,0.6)");
    var xDecimals = Number(params.xDecimals || 0);
    var yDecimals = Number(params.yDecimals || 0);
    var padding = Number(params.padding || 8);
    var position = String(params.position || "bottomRight");

    // Maps each of the 8 anchor points to a horizontal/vertical zone and
    // the text alignment that reads naturally from that zone.
    var POSITION_LAYOUT = {
        topLeft: { h: "left", v: "top", align: "left" },
        topCenter: { h: "center", v: "top", align: "center" },
        topRight: { h: "right", v: "top", align: "right" },
        middleLeft: { h: "left", v: "middle", align: "left" },
        middleRight: { h: "right", v: "middle", align: "right" },
        bottomLeft: { h: "left", v: "bottom", align: "left" },
        bottomCenter: { h: "center", v: "bottom", align: "center" },
        bottomRight: { h: "right", v: "bottom", align: "right" }
    };

    function getLayout() {
        return POSITION_LAYOUT[position] || POSITION_LAYOUT.topRight;
    }

    // Same horizontal side as the configured position, but vertically
    // centered - used while a message window is open so the two never
    // overlap. Center-anchored positions fall back to the right side.
    function getMessageLayout() {
        var base = getLayout();
        return base.h === "left" ? POSITION_LAYOUT.middleLeft : POSITION_LAYOUT.middleRight;
    }

    function computeRect(width, height, layout) {
        var x;
        if (layout.h === "left") {
            x = padding;
        } else if (layout.h === "center") {
            x = Math.round((Graphics.boxWidth - width) / 2);
        } else {
            x = Graphics.boxWidth - width - padding;
        }

        var y;
        if (layout.v === "top") {
            y = padding;
        } else if (layout.v === "middle") {
            y = Math.round((Graphics.boxHeight - height) / 2);
        } else {
            y = Graphics.boxHeight - height - padding;
        }

        return { x: x, y: y, width: width, height: height };
    }

    function Window_CoordDisplay() {
        this.initialize.apply(this, arguments);
    }

    Window_CoordDisplay.prototype = Object.create(Window_Base.prototype);
    Window_CoordDisplay.prototype.constructor = Window_CoordDisplay;

    Window_CoordDisplay.prototype.initialize = function () {
        var width = 240;
        var height = fontSize + padding * 2 + 8;
        var layout = getLayout();
        var rect = computeRect(width, height, layout);

        // MV signature: (x, y, width, height) - not a Rectangle like MZ.
        // updatePadding() below runs automatically as part of this call.
        Window_Base.prototype.initialize.call(this, rect.x, rect.y, rect.width, rect.height);

        this._width = width;
        this._height = height;
        this._normalLayout = layout;
        this._messageLayout = getMessageLayout();
        this._messageActive = false;
        this._lastX = null;
        this._lastY = null;
        this._lastMap = null;
        this.opacity = 0;
        this.contentsOpacity = 255;

        this.refresh();
    };

    Window_CoordDisplay.prototype.updatePadding = function () {
        this.padding = 4;
    };

    // MV's Window_Base.contentsWidth()/contentsHeight() read
    // standardPadding(), not this.padding - so this override is what
    // actually controls the contents bitmap size. Keep it in sync with
    // updatePadding() above.
    Window_CoordDisplay.prototype.standardPadding = function () {
        return 4;
    };

    Window_CoordDisplay.prototype.refresh = function () {
        this.contents.clear();
        this.contents.fontSize = fontSize;
        this.contents.fontBold = true;

        var mapId = $gameMap.mapId();
        var x = $gamePlayer.x.toFixed(xDecimals);
        var y = $gamePlayer.y.toFixed(yDecimals);
        var text = mapId + " - " + x + ";" + y;
        var align = (this._messageActive ? this._messageLayout : this._normalLayout).align;
        var width = this.contents.width;

        // Shadow pass first (offset by 1px), then the main text on top.
        // Keeps the text legible over any background it happens to sit on.
        this.contents.textColor = shadowColor;
        this.drawText(text, 1, 1, width, align);

        this.contents.textColor = textColor;
        this.drawText(text, 0, 0, width, align);
    };

    Window_CoordDisplay.prototype.update = function () {
        Window_Base.prototype.update.call(this);

        var busy = $gameMessage.isBusy();
        if (busy !== this._messageActive) {
            this._messageActive = busy;
            var layout = busy ? this._messageLayout : this._normalLayout;
            var rect = computeRect(this._width, this._height, layout);
            this.move(rect.x, rect.y, rect.width, rect.height);
            this.refresh();
        }

        var curX = $gamePlayer.x.toFixed(xDecimals);
        var curY = $gamePlayer.y.toFixed(yDecimals);
        var curMap = $gameMap.mapId();

        if (curX !== this._lastX || curY !== this._lastY || curMap !== this._lastMap) {
            this._lastX = curX;
            this._lastY = curY;
            this._lastMap = curMap;
            this.refresh();
        }
    };

    var _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function () {
        _Scene_Map_createAllWindows.call(this);
        this._coordDisplayWindow = new Window_CoordDisplay();
        this.addWindow(this._coordDisplayWindow);
    };
})();
