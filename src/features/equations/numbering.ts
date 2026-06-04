import { TFile } from 'obsidian';
import { CONVERTER, getEqNumberPrefix } from 'utils/format';
import { EquationBlock } from 'types';
import LatexReferencer from 'main';
import { ActiveNoteEquationProvider } from 'features/equations/provider-equation';
import type { PluginSettings } from 'features/settings/settings';

interface ReferenceInfo {
  totalCount: number;
  subIndices: Set<number>;
}

/**
 * Finds all equations in a file's content, counts their backlinks (including sub-references),
 * and assigns print/reference names.
 */
export function processActiveNoteEquations(
  plugin: LatexReferencer,
  file: TFile,
  content: string
): Map<string, EquationBlock> {
  const provider = new ActiveNoteEquationProvider(plugin.app);
  const equations = provider.getEquations(file, content);
  const settings = plugin.settings;

  // 1. Scan the entire document once to build a map of reference counts.
  const referenceMap = new Map<string, ReferenceInfo>();
  const linkRegex = /\[\[(?:#\^|\^)(eq-[\w-]+)\]\]/g;
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const fullId = match[1];
    const subIndexMatch = fullId.match(/-(\d+)$/);
    let baseId = fullId;
    let subIndexStr: string | undefined = undefined;

    if (subIndexMatch) {
      subIndexStr = subIndexMatch[1];
      baseId = fullId.substring(0, subIndexMatch.index);
    }

    if (!referenceMap.has(baseId)) {
      referenceMap.set(baseId, { totalCount: 0, subIndices: new Set() });
    }
    const refInfo = referenceMap.get(baseId) ?? { totalCount: 0, subIndices: new Set() };

    refInfo.totalCount++;
    if (subIndexStr) {
      const subIndex = parseInt(subIndexStr);
      if (!isNaN(subIndex)) {
        refInfo.subIndices.add(subIndex);
      }
    }
  }

  const processedEquations = new Map<string, EquationBlock>();
  let equationCount = 0;
  const eqPrefix = getEqNumberPrefix(plugin.app, file, settings as Required<PluginSettings>);
  const eqSuffix = settings.eqNumberSuffix;

  // 2. Process each equation using the pre-computed reference map.
  for (const eq of equations) {
    let printName: string | null = null;
    let refName: string | null = null;

    if (eq.$blockId) {
      const refInfo = referenceMap.get(eq.$blockId);
      const backlinkCount = refInfo?.totalCount ?? 0;
      const subIndices = refInfo?.subIndices;

      if (subIndices && subIndices.size > 0) {
        eq.$subIndices = subIndices;
      }

      if (eq.$manualTag) {
        printName = `(${eq.$manualTag})`;
      } else if (!settings.numberOnlyReferencedEquations || backlinkCount > 0) {
        eq.$index = equationCount;
        const num = settings.eqNumberInit + equationCount;
        const numberStyle = settings.eqNumberStyle;
        const convertedNum = CONVERTER[numberStyle](num);
        printName = `(${eqPrefix}${convertedNum}${eqSuffix})`;
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
