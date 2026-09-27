//=============================================================================
// InvertAlertOnSteal.js
//=============================================================================

/*:
 * @plugindesc v1.0.0 Inverts (or customizes) the Alert Level change fired by the Steal common event, with no edits to CommonEvents.json.
 * @author (fill in)
 *
 * @param AlertVariableId
 * @text Alert Variable ID
 * @type variable
 * @desc The game variable that stores Alert Level.
 * @default 12
 *
 * @param MatchOperation
 * @text Match Operation
 * @type select
 * @option Add (+=)
 * @value 1
 * @option Subtract (-=)
 * @value 2
 * @option Set (=)
 * @value 0
 * @desc Only intercept Control Variables commands using this operation, so unrelated changes to the same variable are left alone.
 * @default 1
 *
 * @param MatchOperandType
 * @text Match Operand Type
 * @type select
 * @option Constant
 * @value 0
 * @option Variable
 * @value 1
 * @option Random
 * @value 2
 * @option Game Data
 * @value 3
 * @option Script
 * @value 4
 * @desc Only intercept commands whose operand is this type. The Steal event uses a constant (0).
 * @default 0
 *
 * @param MatchAmount
 * @text Match Amount
 * @type number
 * @min -1
 * @desc Only intercept when the constant operand equals this value (e.g. 10). Use -1 to match any amount.
 * @default 10
 *
 * @param Mode
 * @text Behavior
 * @type select
 * @option Invert (turn +N into -N, or -N into +N)
 * @value invert
 * @option Custom Amount (always subtract CustomAmount)
 * @value custom
 * @option Disable (let the matched command run unmodified)
 * @value off
 * @desc What to do once a matching Control Variables command is found.
 * @default invert
 *
 * @param CustomAmount
 * @text Custom Amount
 * @type number
 * @min 0
 * @desc Used only when Behavior = Custom Amount. Alert Level is decreased by this much.
 * @default 10
 *
 * @param ClampMin
 * @text Clamp Minimum
 * @type number
 * @min -9999
 * @desc Alert Level will not go below this after a matched change. Set to -9999 to disable the floor.
 * @default 0
 *
 * @param ClampMax
 * @text Clamp Maximum
 * @type number
 * @min -9999
 * @desc Alert Level will not go above this after a matched change. Set to -9999 to disable the ceiling.
 * @default -9999
 *
 * @param RewriteMessage
 * @text Rewrite Message Text
 * @type boolean
 * @desc If ON, replaces RoseText with FellText in the next Show Text line(s) shown after a matched change.
 * @default true
 *
 * @param RoseText
 * @text Text To Replace
 * @type string
 * @desc The phrase used in the original message when Alert increases.
 * @default rose by
 *
 * @param FellText
 * @text Replacement Text
 * @type string
 * @desc The phrase to substitute in when Alert decreases instead.
 * @default fell by
 *
 * @help
 * ============================================================================
 * InvertAlertOnSteal.js
 * ============================================================================
 *
 * PURPOSE
 * -------
 * Common Event 72 ("Time-stop Steal (Commoner class)") raises Alert Level
 * via a single Control Variables command:
 *
 *     Variable[12] += 10      (only runs while Switch 61 is ON)
 *
 * This plugin makes NO changes to CommonEvents.json. Instead it intercepts
 * that exact Control Variables command at the moment it runs and rewrites
 * its effect — by default, turning the increase into an equal decrease.
 * Because the interception happens inside command122, the existing
 * Switch 61 gate in the common event still applies automatically; this
 * plugin does not need to know about it.
 *
 * HOW MATCHING WORKS
 * -------------------
 * A Control Variables command is only touched when ALL of these match:
 *   - target variable range includes AlertVariableId
 *   - operation equals MatchOperation
 *   - operand type equals MatchOperandType
 *   - operand amount equals MatchAmount (unless MatchAmount = -1)
 *
 * This means other places in your game that also change the same variable
 * are left alone unless they happen to use the exact same operation and
 * amount. Tighten MatchAmount (or narrow AlertVariableId) if you need a
 * more exact match for your project.
 *
 * MESSAGE TEXT
 * ------------
 * The Show Text command that follows the Control Variables command is
 * unedited JSON — its wording still says "rose by 10". If RewriteMessage
 * is ON, this plugin swaps RoseText for FellText in the next Show Text
 * line(s) that contain it, right before they're queued for display. This
 * only fires immediately after a command122 call that this plugin actually
 * modified, so unrelated text elsewhere in the game is never touched.
 *
 * CLAMPING
 * --------
 * If ClampMin / ClampMax are not left at -9999, Alert Level is clamped
 * into that range immediately after a matched change is applied.
 *
 * LOAD ORDER
 * ----------
 * Place this plugin BELOW any plugin that already redefines
 * Game_Interpreter.prototype.command122 or Game_Message.prototype.add
 * (some Yanfly/VisuStella-style core scripts do), so this plugin's alias
 * wraps theirs rather than the other way around.
 *
 * No plugin commands — everything is configured via parameters above.
 * ============================================================================
 */

(function() {
    'use strict';

    var PLUGIN_NAME = 'InvertAlertOnSteal';
    var params = PluginManager.parameters(PLUGIN_NAME);

    var ALERT_VAR_ID       = Number(params['AlertVariableId'] || 12);
    var MATCH_OPERATION    = Number(params['MatchOperation'] !== undefined ? params['MatchOperation'] : 1);
    var MATCH_OPERAND_TYPE = Number(params['MatchOperandType'] !== undefined ? params['MatchOperandType'] : 0);
    var MATCH_AMOUNT       = Number(params['MatchAmount'] !== undefined ? params['MatchAmount'] : 10);
    var MODE               = String(params['Mode'] || 'invert');
    var CUSTOM_AMOUNT      = Number(params['CustomAmount'] || 10);
    var CLAMP_MIN          = Number(params['ClampMin'] !== undefined ? params['ClampMin'] : 0);
    var CLAMP_MAX          = Number(params['ClampMax'] !== undefined ? params['ClampMax'] : -9999);
    var REWRITE_MESSAGE    = String(params['RewriteMessage'] || 'true') === 'true';
    var ROSE_TEXT          = String(params['RoseText'] || 'rose by');
    var FELL_TEXT          = String(params['FellText'] || 'fell by');

    var HAS_MIN = CLAMP_MIN !== -9999;
    var HAS_MAX = CLAMP_MAX !== -9999;

    // Set for one Show Text block whenever we've just modified a matching
    // Control Variables command, so the message hook knows to rewrite the
    // very next line(s) that mention RoseText.
    var _pendingMessageRewrite = false;

    function matchesTarget(p) {
        var startVar     = p[0];
        var endVar       = p[1];
        var operation    = p[2];
        var operandType  = p[3];
        var amount       = p[4];

        if (ALERT_VAR_ID < startVar || ALERT_VAR_ID > endVar) return false;
        if (operation !== MATCH_OPERATION) return false;
        if (operandType !== MATCH_OPERAND_TYPE) return false;
        if (MATCH_AMOUNT !== -1 && amount !== MATCH_AMOUNT) return false;
        return true;
    }

    //--------------------------------------------------------------------
    // Game_Interpreter.command122 (Control Variables)
    //--------------------------------------------------------------------
    var _Game_Interpreter_command122 = Game_Interpreter.prototype.command122;
    Game_Interpreter.prototype.command122 = function() {
        if (MODE === 'off' || !this._params || !matchesTarget(this._params)) {
            return _Game_Interpreter_command122.call(this);
        }

        var original = this._params.slice();

        if (MODE === 'invert') {
            if (original[2] === 1) {
                // add -> sub, same amount
                this._params = [original[0], original[1], 2, original[3], original[4]];
            } else if (original[2] === 2) {
                // sub -> add, same amount
                this._params = [original[0], original[1], 1, original[3], original[4]];
            }
        } else if (MODE === 'custom') {
            // always a straight subtraction of CustomAmount
            this._params = [original[0], original[1], 2, 0, CUSTOM_AMOUNT];
        }

        var result = _Game_Interpreter_command122.call(this);

        if (HAS_MIN || HAS_MAX) {
            var current = $gameVariables.value(ALERT_VAR_ID);
            if (HAS_MIN && current < CLAMP_MIN) current = CLAMP_MIN;
            if (HAS_MAX && current > CLAMP_MAX) current = CLAMP_MAX;
            $gameVariables.setValue(ALERT_VAR_ID, current);
        }

        if (REWRITE_MESSAGE) {
            _pendingMessageRewrite = true;
        }

        this._params = original;
        return result;
    };

    //--------------------------------------------------------------------
    // Game_Message.add — rewrite the next matching Show Text line(s)
    //--------------------------------------------------------------------
    var _Game_Message_add = Game_Message.prototype.add;
    Game_Message.prototype.add = function(text) {
        if (_pendingMessageRewrite && typeof text === 'string' && text.indexOf(ROSE_TEXT) !== -1) {
            text = text.split(ROSE_TEXT).join(FELL_TEXT);
            _pendingMessageRewrite = false;
        }
        return _Game_Message_add.call(this, text);
    };

})();
