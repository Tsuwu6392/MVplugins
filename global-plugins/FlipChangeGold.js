/*:
 * @plugindesc Flips "Change Gold" (command 125) from Decrease to Increase.
 * @author You
 *
 * @help
 * Any Change Gold event command set to "Decrease" will instead increase gold.
 * No plugin commands, no parameters. Just drop it in and enable it.
 */

(function() {
    'use strict';

    var _Game_Interpreter_command125 = Game_Interpreter.prototype.command125;

    Game_Interpreter.prototype.command125 = function() {
        // parameters: [operation, operandType, operandValue]
        // operation: 0 = Increase, 1 = Decrease
        if (this._params[0] === 1) {
            this._params[0] = 0; // flip Decrease -> Increase
        }
        return _Game_Interpreter_command125.call(this);
    };
})();