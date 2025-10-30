import { TFile } from "obsidian";
import { CONVERTER, getEqNumberPrefix } from "utils/format";
import { EquationBlock } from "types";
import LatexReferencer from "main";
import { ActiveNoteEquationProvider } from "equations/provider";

/**
 * Finds all equations in a file's content, counts their backlinks, and assigns print/reference names.
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
            const backlinkRegex = new RegExp(`\\[\\[#\\^${eq.$blockId}\\]\\]`, "g");
            const backlinkCount = (content.match(backlinkRegex) || []).length;
            
            if (eq.$manualTag) {
                printName = `(${eq.$manualTag})`;
            } else if (!settings.numberOnlyReferencedEquations || backlinkCount > 0) {
                eq.$index = equationCount;
                const num = settings.eqNumberInit + equationCount;
                printName = `(${eqPrefix}${CONVERTER[settings.eqNumberStyle as keyof typeof CONVERTER](num)}${eqSuffix})`;
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