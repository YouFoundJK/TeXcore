import { App, MarkdownView, TFile, HeadingSubpathResult, BlockSubpathResult } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from '../equations/numbering';
import { Provider } from './provider-link-render';
import { parseObsitexConfig } from 'utils/obsitex';

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

    if (targetFile.path === activeFile.path) {
      const equations = processActiveNoteEquations(this.plugin, activeFile, activeContent);
      const targetEquation = equations.get(blockId);

      if (targetEquation?.$printName) {
        let result: string;
        if (subIndex !== undefined) {
          const baseName = targetEquation.$printName.slice(1, -1);
          result = `${settings.eqRefPrefix}(${baseName}.${subIndex})${settings.eqRefSuffix}`;
        } else {
          result = targetEquation.$refName ?? targetEquation.$printName;
        }

        if (settings.noteTitleInEquationLink && parsedLinktext.path) {
          result = `${targetFile.basename} > ${result}`;
        }
        return result;
      }
    } else {
      // Check if targetFile is in active note's supplements
      const obsitexConfig = parseObsitexConfig(activeContent);
      const supplements = obsitexConfig.supplements;
      if (!supplements) return null;

      let supplementAlias: string | null = null;
      for (const [suppKey, alias] of Object.entries(supplements)) {
        const suppFile = this.app.metadataCache.getFirstLinkpathDest(suppKey, activeFile.path);
        if (
          (suppFile && suppFile.path === targetFile.path) ||
          suppKey === targetFile.basename ||
          suppKey === targetFile.path
        ) {
          supplementAlias = alias;
          break;
        }
      }

      if (!supplementAlias) return null;

      const targetContent =
        (
          this.app.vault as unknown as { cachedReadSync?: (file: TFile) => string }
        ).cachedReadSync?.(targetFile) ?? null;

      if (!targetContent) return null;

      const targetEquations = processActiveNoteEquations(this.plugin, targetFile, targetContent);
      const targetEquation = targetEquations.get(blockId);

      if (targetEquation?.$printName) {
        const rawEqNo = targetEquation.$printName.replace(/^\((.*)\)$/, '$1');
        let printName: string;
        if (subIndex !== undefined) {
          printName = `(${supplementAlias}-${rawEqNo}.${subIndex})`;
        } else {
          printName = `(${supplementAlias}-${rawEqNo})`;
        }

        let result = settings.eqRefPrefix + printName + settings.eqRefSuffix;
        if (settings.noteTitleInEquationLink && parsedLinktext.path) {
          result = `${targetFile.basename} > ${result}`;
        }
        return result;
      }
    }

    return null;
  }
}
