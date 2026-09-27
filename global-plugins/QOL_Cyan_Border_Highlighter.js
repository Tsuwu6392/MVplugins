//=============================================================================
// QOL_Cyan_Border_Highlighter.js
//=============================================================================

/*:
 * @target MV
 * @plugindesc Draws cyan lines at the boundary between walkable and
 * non-walkable tiles. Hidden passages appear as gaps in the border lines.
 * @author Ported from MZ QOL_Cyan_Border_Highlighter
 *
 * @param toggleKey
 * @text Toggle Key
 * @desc Key used to toggle the overlay on/off (RPG Maker key name, e.g. F6).
 * @default F6
 *
 * @param color
 * @text Line Color
 * @desc CSS color string for the border lines (supports alpha via rgba()).
 * @default rgba(0,255,255,0.7)
 *
 * @param lineWidth
 * @text Line Width
 * @desc Width in pixels of the border lines.
 * @type number
 * @default 2
 *
 * @param defaultOn
 * @text Default On
 * @desc Whether the overlay is visible by default when a map loads.
 * @type boolean
 * @default true
 *
 * @help
 * QOL Cyan Border Highlighter (MV port)
 * ------------------------------------------------------------------------
 * Draws cyan lines only at the boundary between walkable and non-walkable
 * tiles. Hidden passages appear as gaps in the border lines.
 *
 * Toggle key is configurable in parameters (default F6).
 *
 * Looping maps (horizontal/vertical wrap) are supported.
 *
 * The overlay automatically redraws on map load, and on most in-map
 * passability changes (anything that goes through $gameMap.refresh()).
 * For passability changes that don't trigger a map refresh on their own,
 * use the plugin command:
 *
 *   Plugin Command: QolBorderRefresh
 *
 * (No arguments needed.)
 */

(() => {
  "use strict";

  const pluginName = "QOL_Cyan_Border_Highlighter";
  const params = PluginManager.parameters(pluginName);

  const TOGGLE_KEY_NAME = String(params.toggleKey || "F6");
  const COLOR = String(params.color || "rgba(0,255,255,0.7)");
  const LINE_WIDTH = Number(params.lineWidth || 2);
  const DEFAULT_ON = params.defaultOn === "true";

  // MV's NW.js doesn't pre-map F-keys in Input.keyMapper.
  const F_KEY_CODES = {
    F5: 116, F6: 117, F7: 118, F8: 119, F9: 120
  };
  if (F_KEY_CODES[TOGGLE_KEY_NAME] !== undefined) {
    Input.keyMapper[F_KEY_CODES[TOGGLE_KEY_NAME]] = "qolBorderToggle";
  }

  //---------------------------------------------------------------------
  // Plugin Command (MV style)
  // Usage in event editor: Plugin Command -> QolBorderRefresh
  //---------------------------------------------------------------------
  const _Game_Interpreter_pluginCommand =
    Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if (command === "QolBorderRefresh") {
      if ($gameMap) $gameMap._qolBorderDirty = true;
    }
  };

  //---------------------------------------------------------------------
  // Game_Map — dirty flag on every setup call
  //---------------------------------------------------------------------
  const _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function(mapId) {
    _Game_Map_setup.call(this, mapId);
    this._qolBorderDirty = true;
  };

  Game_Map.prototype.qolBorderDirty = function() {
    return this._qolBorderDirty || false;
  };

  Game_Map.prototype.qolBorderClearDirty = function() {
    this._qolBorderDirty = false;
  };

  //---------------------------------------------------------------------
  // Scene_Map — teardown hook
  // MV has no Sprite.destroy() or Bitmap.destroy(). We null refs here
  // and let the GC handle it. The sprites are also removed from the
  // tilemap so PIXI doesn't keep rendering them into the next scene.
  //---------------------------------------------------------------------
  const _Scene_Map_terminate = Scene_Map.prototype.terminate;
  Scene_Map.prototype.terminate = function() {
    if (this._spriteset) {
      this._spriteset.disposeQolBorderOverlay();
    }
    _Scene_Map_terminate.call(this);
  };

  //---------------------------------------------------------------------
  // Spriteset_Map
  //---------------------------------------------------------------------
  const _Spriteset_Map_createLowerLayer =
    Spriteset_Map.prototype.createLowerLayer;
  Spriteset_Map.prototype.createLowerLayer = function() {
    _Spriteset_Map_createLowerLayer.call(this);
    this.createQolBorderOverlay();
  };

  const _Spriteset_Map_update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function() {
    _Spriteset_Map_update.call(this);
    this.updateQolBorderOverlay();
  };

  Spriteset_Map.prototype.createQolBorderOverlay = function() {
    this._qolBorderVisible = DEFAULT_ON;
    this._qolBorderBitmap = null;
    this._qolBorderSprites = [];

    this.rebuildQolBorderSprites();
    if (this._qolBorderVisible) this.redrawQolBorderOverlay();
    this.syncQolBorderPosition();
  };

  // (Re)creates the set of sprites used to draw the overlay. For a
  // looping map we need extra copies offset by one full map-width
  // and/or map-height so the border is visible on both sides of the
  // seam simultaneously. All copies share the same bitmap.
  Spriteset_Map.prototype.rebuildQolBorderSprites = function() {
    for (const sprite of this._qolBorderSprites) {
      this._tilemap.removeChild(sprite);
      // No sprite.destroy() in MV — removeChild + null ref is enough.
    }
    this._qolBorderSprites = [];

    if (!$gameMap) return;

    const mapPw = $gameMap.width() * $gameMap.tileWidth();
    const mapPh = $gameMap.height() * $gameMap.tileHeight();
    const xOffsets = $gameMap.isLoopHorizontal() ? [-mapPw, 0, mapPw] : [0];
    const yOffsets = $gameMap.isLoopVertical() ? [-mapPh, 0, mapPh] : [0];

    for (const yOff of yOffsets) {
      for (const xOff of xOffsets) {
        const sprite = new Sprite(this._qolBorderBitmap);
        // z=8 matches Sprite_Animation. Sort falls through to y then
        // spriteId on ties, so the overlay won't occlude animations.
        sprite.z = 8;
        sprite.visible = this._qolBorderVisible;
        sprite._qolXOffset = xOff;
        sprite._qolYOffset = yOff;
        this._tilemap.addChild(sprite);
        this._qolBorderSprites.push(sprite);
      }
    }
  };

  Spriteset_Map.prototype.updateQolBorderOverlay = function() {
    if (Input.isTriggered("qolBorderToggle")) {
      this._qolBorderVisible = !this._qolBorderVisible;
      for (const sprite of this._qolBorderSprites) {
        sprite.visible = this._qolBorderVisible;
      }
      if (this._qolBorderVisible) this.redrawQolBorderOverlay();
    }

    if ($gameMap.qolBorderDirty()) {
      // Null out the old bitmap rather than calling .destroy() —
      // MV's Bitmap has no such method.
      this._qolBorderBitmap = null;
      $gameMap.qolBorderClearDirty();
      // New map may have different dimensions or loop settings.
      this.rebuildQolBorderSprites();
      if (this._qolBorderVisible) this.redrawQolBorderOverlay();
    }

    if (!this._qolBorderVisible) return;

    // MV's tilemap scrolls via origin.x/y on its internal layers, not
    // by moving the container itself. Children of the tilemap container
    // (including our sprites) sit in a fixed coordinate space and must
    // recompute their own screen position from the map scroll each frame,
    // exactly the same as in MZ.
    this.syncQolBorderPosition();
  };

  Spriteset_Map.prototype.syncQolBorderPosition = function() {
    if (!$gameMap || !this._qolBorderSprites) return;
    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();
    const baseX = -Math.round($gameMap.displayX() * tw);
    const baseY = -Math.round($gameMap.displayY() * th);
    for (const sprite of this._qolBorderSprites) {
      sprite.x = baseX + sprite._qolXOffset;
      sprite.y = baseY + sprite._qolYOffset;
    }
  };

  Spriteset_Map.prototype.redrawQolBorderOverlay = function() {
    if (!$gameMap) return;

    const tw = $gameMap.tileWidth();
    const th = $gameMap.tileHeight();
    const w = $gameMap.width();
    const h = $gameMap.height();
    const mapPw = w * tw;
    const mapPh = h * th;

    if (
      !this._qolBorderBitmap ||
      this._qolBorderBitmap.width !== mapPw ||
      this._qolBorderBitmap.height !== mapPh
    ) {
      // No .destroy() in MV — just replace the reference.
      this._qolBorderBitmap = new Bitmap(mapPw, mapPh);
      for (const sprite of this._qolBorderSprites) {
        sprite.bitmap = this._qolBorderBitmap;
      }
    } else {
      this._qolBorderBitmap.clear();
    }

    if ($gameMap.setPassableSubject && $gamePlayer) {
      $gameMap.setPassableSubject($gamePlayer);
    }

    const hasHalfMoveNpCheck =
      typeof $gameMap.isPassableByHalfRegionAndTag === "function" &&
      typeof $gameMap.roundHalfXWithDirection === "function" &&
      typeof $gameMap.roundHalfYWithDirection === "function" &&
      typeof Game_Map.tileUnit === "number" &&
      (!$gameSystem || !$gameSystem.canHalfMove || $gameSystem.canHalfMove());

    const halfMoveBlocked = (mx, my, d) => {
      if (!hasHalfMoveNpCheck) return false;
      const targetX = $gameMap.roundHalfXWithDirection(mx, d);
      const targetY = $gameMap.roundHalfYWithDirection(my, d);
      if (!$gameMap.isPassableByHalfRegionAndTag(targetX, targetY)) return true;
      if (!$gameMap.isPassableByHalfRegionAndTag(
        targetX + Game_Map.tileUnit, targetY
      )) return true;
      return false;
    };

    const lw = LINE_WIDTH;
    const loopH = $gameMap.isLoopHorizontal();
    const loopV = $gameMap.isLoopVertical();
    const pass = new Array(w * h * 4);

    for (let mx = 0; mx < w; mx++) {
      for (let my = 0; my < h; my++) {
        const i = (my * w + mx) * 4;
        pass[i]     = $gameMap.isPassable(mx, my, 8) && !halfMoveBlocked(mx, my, 8);
        pass[i + 1] = $gameMap.isPassable(mx, my, 2) && !halfMoveBlocked(mx, my, 2);
        pass[i + 2] = $gameMap.isPassable(mx, my, 4) && !halfMoveBlocked(mx, my, 4);
        pass[i + 3] = $gameMap.isPassable(mx, my, 6) && !halfMoveBlocked(mx, my, 6);
      }
    }

    const fetch = (mx, my, d) => {
      let x = mx;
      let y = my;
      if (x < 0 || x >= w) {
        if (!loopH) return false;
        x = ((x % w) + w) % w;
      }
      if (y < 0 || y >= h) {
        if (!loopV) return false;
        y = ((y % h) + h) % h;
      }
      const i = (y * w + x) * 4;
      switch (d) {
        case 8: return pass[i];
        case 2: return pass[i + 1];
        case 4: return pass[i + 2];
        case 6: return pass[i + 3];
        default: return false;
      }
    };

    const bmp = this._qolBorderBitmap;

    for (let mx = 0; mx < w; mx++) {
      for (let my = 0; my < h; my++) {
        const px = mx * tw;
        const py = my * th;

        if (fetch(mx, my - 1, 2) !== fetch(mx, my, 8)) {
          bmp.fillRect(px, py, tw, lw, COLOR);
        }

        if (fetch(mx - 1, my, 6) !== fetch(mx, my, 4)) {
          bmp.fillRect(px, py, lw, th, COLOR);
        }

        if (mx === w - 1) {
          if (fetch(mx, my, 6) !== fetch(mx + 1, my, 4)) {
            bmp.fillRect(px + tw - lw, py, lw, th, COLOR);
          }
        }

        if (my === h - 1) {
          if (fetch(mx, my, 2) !== fetch(mx, my + 1, 8)) {
            bmp.fillRect(px, py + th - lw, tw, lw, COLOR);
          }
        }
      }
    }
  };

  Spriteset_Map.prototype.disposeQolBorderOverlay = function() {
    for (const sprite of this._qolBorderSprites || []) {
      if (sprite.parent) sprite.parent.removeChild(sprite);
    }
    // Null out refs — no .destroy() available in MV.
    this._qolBorderSprites = [];
    this._qolBorderBitmap = null;
  };
})();
