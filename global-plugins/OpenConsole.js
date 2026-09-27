//=============================================================================
// OpenConsole.js
//=============================================================================

/*:
 * @plugindesc Force-opens the NW.js DevTools console via a key press, for cases where the game's normal console shortcut (F8/F12) is disabled or non-functional.
 * @author
 *
 * @param Key Code
 * @desc Key code that triggers DevTools. Default 123 = F12. (F8 = 119, F10 = 121)
 * @default 123
 *
 * @help
 * Binds a keydown listener directly to the DOM, bypassing RPG Maker's
 * own input handling, and calls nw.Window.get().showDevTools() when
 * the configured key is pressed.
 *
 * Use this when Playtest console won't open normally (e.g. key capture
 * is being intercepted elsewhere, or you're running a packaged/deployed
 * build where the default shortcut was stripped out).
 */

(function() {
    'use strict';

    var pluginName = 'OpenConsole';
    var parameters = PluginManager.parameters(pluginName);
    var triggerKey = Number(parameters['Key Code'] || 123);

    function getNwWindow() {
        if (typeof nw !== 'undefined' && nw.Window) {
            return nw.Window.get();
        }
        if (typeof require !== 'undefined') {
            try {
                return require('nw.gui').Window.get();
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    document.addEventListener('keydown', function(event) {
        if (event.keyCode !== triggerKey) return;

        var win = getNwWindow();
        if (!win) {
            console.warn('[OpenConsole] Not running under NW.js — cannot open DevTools.');
            return;
        }

        try {
            win.showDevTools();
        } catch (e) {
            console.error('[OpenConsole] Failed to open DevTools:', e);
        }
    }, true); // capture phase, so this fires even if other handlers stopPropagation()

})();
