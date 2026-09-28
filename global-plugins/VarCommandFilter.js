/*:
 * @target MZ
 * @plugindesc (MV/MZ) Clamps selected Control Variable operations at a threshold.
 * @author you
 * @help
 * Works in both RPG Maker MV and MZ.
 * Place in js/plugins/, enable in Plugin Manager.
 *
 * LOAD ORDER: place this BELOW any other plugin that patches or rewrites
 * Game_Interpreter.prototype.command122 (Control Variables), so this
 * plugin wraps the final version.
 *
 * Each rule is: VALUE_ID, OPERATION, VALUE
 *   VALUE_ID   the variable ID
 *   OPERATION  Set, Add, Sub, Mul, Div, Mod (or raw numbers 0..5).
 *              Combine several with "|" (e.g. Add|Sub). Leave empty for ALL.
 *   VALUE      the threshold (optional, see below)
 *
 * Separate rules from each other with ";" (or a new line).
 *
 * HOW THE THRESHOLD WORKS
 *   The threshold is applied in the direction the command moved the variable:
 *   - If the operation DECREASED the variable and the result is
 *     equal to or below VALUE, the variable is set back to VALUE.
 *   - If the operation INCREASED the variable and the result is
 *     equal to or above VALUE, the variable is set back to VALUE.
 *
 *   So for Sub, VALUE acts as a floor. For Add, VALUE acts as a ceiling.
 *
 * Examples:
 *   "10, Sub, 0"
 *   -> Variable 10 can never be reduced by Sub to 0 or below; it is set to 0.
 *
 *   "10, Sub, 0; 6, Add, 99"
 *   -> Variable 10 floors at 0 on Sub, variable 6 caps at 99 on Add.
 *
 * Leave VALUE out entirely to BLOCK the operation instead of clamping it
 * (the variable is restored to what it was before the command ran):
 *   "6, Add"     or     "10, Sub|Mul,"
 *
 * Ranged Control Variables commands (e.g. variables 8 through 12) are
 * handled per variable, so only the ruled variable is clamped/restored
 * and the others in the range update normally.
 *
 * Note: only the Control Variables event command is filtered. Script calls
 * such as $gameVariables.setValue() are not affected.
 *
 * @param rules
 * @text Rules
 * @type string
 * @default 10, Sub, 0; 6, Add, 99
 * @desc "VALUE_ID, OPERATION, VALUE" rules separated by ";". Omit VALUE to block the operation instead.
 *
 * @param logBlocked
 * @text Log Clamped/Blocked Commands
 * @type boolean
 * @default false
 * @desc If true, prints a console line each time a rule fires.
 */

(() => {
    const PLUGIN = "VarCommandFilter";
    const params = PluginManager.parameters(PLUGIN);
    const raw = String(params["rules"] || "").trim();
    const LOG = String(params["logBlocked"]) === "true";

    const OP = { Set: 0, Add: 1, Sub: 2, Mul: 3, Div: 4, Mod: 5 };
    const parseOp = (s) => {
        s = String(s).trim();
        if (Object.prototype.hasOwnProperty.call(OP, s)) return OP[s];
        if (s === "") return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
    };

    // ---- Rule parsing ------------------------------------------------------
    /** @type {{id:number, ops:Set<number>|null, limit:number|null}[]} */
    const RULES = [];

    for (const rule of raw.split(/[;\n]+/)) {
        if (rule.trim() === "") continue;
        const parts = rule.split(",").map((s) => s.trim());

        const id = Number(parts[0]);
        if (parts[0] === "" || !Number.isFinite(id)) continue;

        // Operation(s): empty = all operations.
        let ops = null;
        if (parts[1]) {
            ops = new Set();
            for (const name of parts[1].split(/[|+\s]+/).filter(Boolean)) {
                const code = parseOp(name);
                if (code !== null) ops.add(code);
            }
            if (ops.size === 0) continue; // nothing valid was given
        }

        // Threshold: empty/missing = block instead of clamp.
        let limit = null;
        if (parts[2] !== undefined && parts[2] !== "") {
            const n = Number(parts[2]);
            if (!Number.isFinite(n)) continue;
            limit = n;
        }

        RULES.push({ id, ops, limit });
    }

    console.log(`[${PLUGIN}] rules =`, raw,
        "parsed =", RULES.map((r) => [r.id, r.ops === null ? "ALL" : [...r.ops], r.limit]));

    // ---- Hook ---------------------------------------------------------------
    const _command122 = Game_Interpreter.prototype.command122;
    Game_Interpreter.prototype.command122 = function(params) {
        // MZ passes params as an argument; MV keeps them on this._params.
        const p = params || this._params;
        const startId = p[0];
        const endId   = p[1];
        const op      = p[2];

        // Rules that apply to this command, plus each variable's value beforehand.
        const active = RULES.filter((r) =>
            startId <= r.id && r.id <= endId && (r.ops === null || r.ops.has(op)));
        if (active.length === 0) return _command122.call(this, params);

        const before = new Map();
        for (const r of active) {
            if (!before.has(r.id)) before.set(r.id, $gameVariables.value(r.id));
        }

        const result = _command122.call(this, params);

        for (const r of active) {
            const old = before.get(r.id);
            const now = $gameVariables.value(r.id);
            if (now === old) continue;

            if (r.limit === null) {
                // Block: put it back exactly as it was.
                $gameVariables.setValue(r.id, old);
                if (LOG) console.log(`[${PLUGIN}] blocked var ${r.id} op=${op}: ${now} -> ${old}`);
            } else if (
                (now < old && now <= r.limit) ||   // decreased to/below threshold
                (now > old && now >= r.limit)      // increased to/above threshold
            ) {
                $gameVariables.setValue(r.id, r.limit);
                if (LOG) console.log(`[${PLUGIN}] clamped var ${r.id} op=${op}: ${now} -> ${r.limit}`);
            }
        }
        return result;
    };
})();
