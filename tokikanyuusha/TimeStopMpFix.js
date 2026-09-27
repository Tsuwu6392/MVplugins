//=============================================================================
// TimeStopMpFix.js
//=============================================================================
/*:
 * @plugindesc [v2.0] Flips the per-step MP drain in Common Event #8
 * ("time still - tp take") into a gain, by patching the loaded event data
 * (not CommonEvents.json on disk, and not script execution at runtime).
 * @author (custom patch)
 *
 * @param mode
 * @text Behavior Mode
 * @type select
 * @option Reverse (gain MP instead of drain)
 * @value reverse
 * @option No-op (cancel the effect entirely)
 * @value noop
 * @default reverse
 *
 * @param commonEventId
 * @text Common Event ID
 * @type number
 * @default 8
 *
 * @help
 * -----------------------------------------------------------------------------
 * TimeStopMpFix.js  (v2 -- data-patch approach)
 * -----------------------------------------------------------------------------
 * Target: Common Event #8, "time still - tp take" (Parallel Process, gated
 * by Switch #3), which contains this script call once per qualifying step:
 *
 *   $gameActors.actor(1).gainMp(-Math.ceil($gameVariables.value(11)));
 *
 * WHY THIS VERSION IS DIFFERENT FROM A command355 OVERRIDE:
 * An earlier approach overrode Game_Interpreter.prototype.command355 (the
 * "Script..." event-command handler) to rewrite the assembled script text
 * right before eval. That works in isolation, but if any other plugin in
 * the project ALSO overrides/aliases command355 (for example, a message or
 * sound plugin that exposes a helper function such as set_text_sound_name
 * to script calls via its own closure scope), fully replacing command355
 * discards that plugin's scope and breaks anything else in the same script
 * block that depends on it -- causing errors like:
 *   ReferenceError: set_text_sound_name is not defined
 *
 * This version avoids that entirely. Instead of touching how scripts are
 * executed, it patches the *loaded event data* once, right after
 * CommonEvents.json is parsed into $dataCommonEvents at boot -- rewriting
 * only the literal text of the one matching command parameter. Every other
 * line in the same script block (including whatever calls into other
 * plugins' helper functions) is left completely untouched and still runs
 * through the exact same execution path it always did.
 *
 * Effect:
 *   Mode "reverse" (default):
 *     $gameActors.actor(1).gainMp(-Math.ceil($gameVariables.value(11)));
 *     becomes
 *     $gameActors.actor(1).gainMp(Math.ceil($gameVariables.value(11)));
 *
 *   Mode "noop":
 *     becomes
 *     $gameActors.actor(1).gainMp(0);
 *
 * CommonEvents.json on disk is never modified -- only the in-memory copy
 * loaded into $dataCommonEvents is patched, every time the database loads.
 * Safe to reopen/re-save the project in the editor at any time.
 *
 * -----------------------------------------------------------------------------
 * Install
 * -----------------------------------------------------------------------------
 * 1. Drop this file into js/plugins/.
 * 2. Open the Plugin Manager in the editor and add/enable "TimeStopMpFix".
 * 3. Load order relative to other plugins does not matter -- this only
 *    hooks DataManager.onLoad for $dataCommonEvents, not any interpreter
 *    method, so it can't collide with other plugins' script-execution
 *    patches.
 * 4. (Optional) Set "Behavior Mode" to "No-op" instead of "Reverse" if you'd
 *    rather cancel the effect than invert it.
 * 5. No plugin commands needed -- it applies automatically at boot.
 *
 * -----------------------------------------------------------------------------
 * Notes / caveats
 * -----------------------------------------------------------------------------
 * - The match is textual (whitespace-insensitive) against the exact
 *   expression $gameActors.actor(1).gainMp(-Math.ceil($gameVariables.value(11)))
 *   inside Common Event #8 specifically (configurable via the plugin
 *   parameter "Common Event ID"). It will not touch that Common Event's
 *   separate TP auto-replenish branch, or any other event, since it only
 *   scans the one event's command list for the one matching parameter text.
 * - Runs once per boot (when $dataCommonEvents finishes loading), so it's
 *   in place before any parallel-process interpreter ever reads the data.
 */

(function() {
    'use strict';

    var pluginName = 'TimeStopMpFix';
    var parameters = PluginManager.parameters(pluginName);
    var mode = String(parameters['mode'] || 'reverse');
    var commonEventId = Number(parameters['commonEventId'] || 8);

    // Matches: $gameActors.actor(1).gainMp(-Math.ceil($gameVariables.value(11)));
    // Whitespace-insensitive, optional trailing semicolon.
    var TARGET_PATTERN = /\$gameActors\.actor\(\s*1\s*\)\.gainMp\(\s*-\s*Math\.ceil\(\s*\$gameVariables\.value\(\s*11\s*\)\s*\)\s*\)\s*;?/;

    function buildReplacement() {
        if (mode === 'noop') {
            return '$gameActors.actor(1).gainMp(0);';
        }
        return '$gameActors.actor(1).gainMp(Math.ceil($gameVariables.value(11)));';
    }

    function patchTargetCommonEvent() {
        var ce = $dataCommonEvents && $dataCommonEvents[commonEventId];
        if (!ce || !ce.list) return;
        var replacement = buildReplacement();
        ce.list.forEach(function(cmd) {
            // 355 = "Script..." (first line), 655 = its "..." continuation lines
            if ((cmd.code === 355 || cmd.code === 655) &&
                typeof cmd.parameters[0] === 'string' &&
                TARGET_PATTERN.test(cmd.parameters[0])) {
                cmd.parameters[0] = cmd.parameters[0].replace(TARGET_PATTERN, replacement);
            }
        });
    }

    var _DataManager_onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _DataManager_onLoad.call(this, object);
        if (object === $dataCommonEvents) {
            patchTargetCommonEvent();
        }
    };

})();
