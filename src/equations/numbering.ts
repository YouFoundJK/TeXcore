import { TFile } from "obsidian";
import { CONVERTER, getEqNumberPrefix } from "utils/format";
import { EquationBlock } from "types";
import LatexReferencer from "main";
import { ActiveNoteEquationProvider } from "equations/provider";

/**
 * Finds all equations in a file's content, counts their backlinks, and assigns print/reference names.
 * This is the main processing function for both legacy and new-style equations,
 * used by Reading View, Live Preview, and the Cleveref provider.
 */
export function processActiveNoteEquations(plugin: LatexReferencer, file: TFile, content: string): Map<string, EquationBlock> {
    const provider = new ActiveNoteEquationProvider(plugin.app);
    const equations = provider.getEquations(file, content);
    const settings = plugin.settings;

    const processedEquations = new Map<string, EquationBlock>();
    let equationCount = 0;
    const eqPrefix = getEqNumberPrefix(plugin.app, file, settings);
    const eqSuffix = settings.eqNumberSuffix;

    for (const eq of equations) {
        let printName: string | null = null;
        let refName: string | null = null;

        if (eq.$blockId) {
            // Robustly count backlinks for BOTH legacy ([[#^...]]) and new ([[...^...]]) link formats.
            const legacyRegex = new RegExp(`\\[\\[#\\^${eq.$blockId}\\]\\]`, "g");
            const newStyleRegex = new RegExp(`\\[\\[\\^${eq.$blockId}\\]\\]`, "g");

            const legacyCount = (content.match(legacyRegex) || []).length;
            const newStyleCount = (content.match(newStyleRegex) || []).length;
            
            const backlinkCount = legacyCount + newStyleCount;
            
            if (eq.$manualTag) {
                printName = `(${eq.$manualTag})`;
            } else if (!settings.numberOnlyReferencedEquations || backlinkCount > 0) {
                eq.$index = equationCount;
                const num = settings.eqNumberInit + equationCount;
                const numberStyle = settings.eqNumberStyle as keyof typeof CONVERTER;
                printName = `(${eqPrefix}${CONVERTER[numberStyle](num)}${eqSuffix})`;
                equationCount++;
            }

            if (printName !== null) {
                refName = settings.eqRefPrefix + printName + settings.eqRefSuffix;
            }
        }
        
        eq.$printName = printName;
        eq.$refName = refName;

        if (eq.$blockId) {
            processedEquations.set(eq.$blockId, eq);
        }
    }
    return processedEquations;
}