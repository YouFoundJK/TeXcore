import { App, MarkdownView, TFile, HeadingSubpathResult, BlockSubpathResult } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from '../equations/numbering';
import { Provider } from './provider-link-render';
import { parseObsitexConfig } from 'utils/obsitex';
import { getSyncFileContent } from 'utils/obsidian';
import { EquationBlock } from 'types';

export class LatexLinkProvider extends Provider {
  app: App;

  constructor(public plugin: LatexReferencer) {
    super();
    this.app = plugin.app;
  }

  provide(
    parsedLinktext: { path: string; subpath: string },
    targetFile: TFile | null,
    targetSubpathResult: HeadingSubpathResult | BlockSubpathResult | null
  ): string | null {
    if (!targetFile || !parsedLinktext.subpath || !parsedLinktext.subpath.startsWith('#^')) {
      return null;
    }

    const subpath = parsedLinktext.subpath.substring(2); // remove #^
    const subIndexMatch = subpath.match(/-(\d+)$/);
    let blockId = subpath;
    let subIndex: number | undefined = undefined;

    if (subIndexMatch) {
      subIndex = parseInt(subIndexMatch[1]);
      blockId = subpath.substring(0, subIndexMatch.index);
    }

    if (!blockId.startsWith('eq-')) {
      return null;
    }

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const activeFile = activeView?.file;
    const activeContent =
      typeof activeView?.getViewData === 'function' ? activeView.getViewData() : null;
    if (!activeFile || activeContent === null) {
      return null;
    }

    const settings = this.plugin.settings;

    let targetEquation: EquationBlock | undefined;
    let effectiveTargetFile: TFile = targetFile;
    let supplementAlias = '';
    let isSupplementLink = false;

    if (targetFile.path === activeFile.path) {
      const equations = processActiveNoteEquations(this.plugin, activeFile, activeContent);
      targetEquation = equations.get(blockId);

      // Fallback: If equation blockId is not in active file, search active file's supplements!
      if (!targetEquation) {
        const obsitexConfig = parseObsitexConfig(activeContent);
        const supplements = obsitexConfig.supplements;
        if (supplements) {
          for (const [suppKey, alias] of Object.entries(supplements)) {
            const suppFile = this.app.metadataCache.getFirstLinkpathDest(suppKey, activeFile.path);
            if (!suppFile) continue;
            const suppContent = getSyncFileContent(this.app, suppFile);
            if (!suppContent) continue;
            const suppEquations = processActiveNoteEquations(
              this.plugin,
              suppFile,
              suppContent,
              activeContent
            );
            const foundEq = suppEquations.get(blockId);
            if (foundEq) {
              targetEquation = foundEq;
              effectiveTargetFile = suppFile;
              supplementAlias = alias || '';
              isSupplementLink = true;
              break;
            }
          }
        }
      }
    } else {
      // Cross-note targetFile passed
      const obsitexConfig = parseObsitexConfig(activeContent);
      const supplements = obsitexConfig.supplements;
      if (supplements) {
        for (const [suppKey, alias] of Object.entries(supplements)) {
          const suppFile = this.app.metadataCache.getFirstLinkpathDest(suppKey, activeFile.path);
          if (
            (suppFile && suppFile.path === targetFile.path) ||
            suppKey === targetFile.basename ||
            suppKey === targetFile.path
          ) {
            isSupplementLink = true;
            supplementAlias = alias || '';
            break;
          }
        }
      }

      if (!isSupplementLink) return null;

      const targetContent = getSyncFileContent(this.app, targetFile);

      if (!targetContent) {
        return null;
      }

      const targetEquations = processActiveNoteEquations(
        this.plugin,
        targetFile,
        targetContent,
        activeContent
      );
      targetEquation = targetEquations.get(blockId);
    }

    if (targetEquation?.$printName) {
      const rawEqNo = targetEquation.$printName.replace(/^\((.*)\)$/, '$1');
      let printName: string;

      if (isSupplementLink) {
        if (subIndex !== undefined) {
          printName = supplementAlias
            ? `(${supplementAlias}-${rawEqNo}.${subIndex})`
            : `(${rawEqNo}.${subIndex})`;
        } else {
          printName = supplementAlias
            ? `(${supplementAlias}-${rawEqNo})`
            : targetEquation.$printName;
        }
      } else {
        if (subIndex !== undefined) {
          printName = `(${rawEqNo}.${subIndex})`;
        } else {
          printName = targetEquation.$printName;
        }
      }

      let result = settings.eqRefPrefix + printName + settings.eqRefSuffix;
      if (settings.noteTitleInEquationLink && parsedLinktext.path) {
        result = `${effectiveTargetFile.basename} > ${result}`;
      }
      return result;
    }

    return null;
  }
}
