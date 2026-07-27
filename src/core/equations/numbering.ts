import { TFile, MarkdownView } from 'obsidian';
import { CONVERTER } from '../../utils/format';
import { parsePositionalObsitexConfigs } from '../../utils/obsitex';
import { EquationBlock } from '../../types';
import LatexReferencer from '../../main';
import { ActiveNoteEquationProvider } from './provider-equation';
import { getSyncFileContent } from '../../utils/obsidian';

interface ReferenceInfo {
  totalCount: number;
  subIndices: Set<number>;
}

function getReferencingContents(plugin: LatexReferencer, file: TFile): string {
  const parts: string[] = [];
  const app = plugin.app;

  // 1. Check current active view
  const activeView =
    typeof app.workspace?.getActiveViewOfType === 'function'
      ? app.workspace.getActiveViewOfType(MarkdownView)
      : null;
  if (activeView && activeView.file && activeView.file.path !== file.path) {
    if (typeof activeView.getViewData === 'function') {
      parts.push(activeView.getViewData());
    }
  }

  // 2. Check metadataCache resolvedLinks
  const resolvedLinks = app.metadataCache?.resolvedLinks || {};
  const checkedPaths = new Set<string>();
  if (activeView?.file) checkedPaths.add(activeView.file.path);

  for (const [sourcePath, links] of Object.entries(resolvedLinks)) {
    if (sourcePath === file.path || checkedPaths.has(sourcePath)) continue;
    if (links[file.path] || links[file.basename]) {
      checkedPaths.add(sourcePath);
      const srcFile =
        typeof app.vault?.getFileByPath === 'function' ? app.vault.getFileByPath(sourcePath) : null;
      if (srcFile) {
        const srcContent = getSyncFileContent(app, srcFile);
        if (srcContent) parts.push(srcContent);
      }
    }
  }

  return parts.join('\n');
}

/**
 * Finds all equations in a file's content, counts their backlinks (including sub-references),
 * and assigns print/reference names.
 */
export function processActiveNoteEquations(
  plugin: LatexReferencer,
  file: TFile,
  content: string,
  referencerContent?: string
): Map<string, EquationBlock> {
  const provider = new ActiveNoteEquationProvider(plugin.app);
  const equations = provider.getEquations(file, content);
  const settings = plugin.settings;

  // 1. Scan document(s) to build a map of reference counts.
  const referenceMap = new Map<string, ReferenceInfo>();
  const linkRegex = /\[\[(?:[^\]]*?#\^|\^)(eq-[\w.-]+)\]\]/g;
  const extraContent = referencerContent ?? getReferencingContents(plugin, file);
  const textToScan = extraContent ? `${content}\n${extraContent}` : content;
  let match;
  while ((match = linkRegex.exec(textToScan)) !== null) {
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
  const obsitexConfigs = parsePositionalObsitexConfigs(content);
  const shouldNumberAll =
    !settings.numberOnlyReferencedEquations || obsitexConfigs.length > 0 || referenceMap.size > 0;
  let configIdx = 0;
  let currentPrefix = settings.eqNumberPrefix;
  let equationCount = 0;
  const eqSuffix = settings.eqNumberSuffix;

  const lines = content.split('\n');
  const getEqOffset = (eq: EquationBlock): number => {
    if (eq.$pos?.start?.offset && eq.$pos.start.offset > 0) {
      return eq.$pos.start.offset;
    }
    const line = eq.$pos?.start?.line ?? 0;
    let offset = 0;
    for (let i = 0; i < Math.min(line, lines.length); i++) {
      offset += lines[i].length + 1;
    }
    return offset;
  };

  // 2. Process each equation using the pre-computed reference map.
  for (const eq of equations) {
    const eqOffset = getEqOffset(eq);

    while (configIdx < obsitexConfigs.length && obsitexConfigs[configIdx].from < eqOffset) {
      const cfg = obsitexConfigs[configIdx].config;
      if (cfg.eqPrefix !== undefined) {
        currentPrefix = cfg.eqPrefix;
      }
      if (cfg.eqContinuity === false) {
        equationCount = 0;
      }
      configIdx++;
    }

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
      } else if (shouldNumberAll || backlinkCount > 0) {
        eq.$index = equationCount;
        const num = settings.eqNumberInit + equationCount;
        const numberStyle = settings.eqNumberStyle;
        const convertedNum = CONVERTER[numberStyle](num);
        printName = `(${currentPrefix}${convertedNum}${eqSuffix})`;
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

  // Inject equation block positions into Obsidian's Metadata Cache
  const cache = plugin.app.metadataCache.getFileCache(file);
  if (cache) {
    cache.blocks = cache.blocks || {};
    for (const [blockId, eq] of processedEquations) {
      if (eq.$pos) {
        cache.blocks[blockId] = {
          id: blockId,
          position: eq.$pos
        };

        if (eq.$subIndices) {
          for (const subIdx of eq.$subIndices) {
            const subBlockId = `${blockId}-${subIdx}`;
            cache.blocks[subBlockId] = {
              id: subBlockId,
              position: eq.$pos
            };
          }
        }
      }
    }
  }

  return processedEquations;
}
