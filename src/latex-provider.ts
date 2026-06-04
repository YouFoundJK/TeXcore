import { App, MarkdownView, TFile, HeadingSubpathResult, BlockSubpathResult } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './features/equations/numbering';
import { Provider } from './features/linker/provider-link-render';

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
    if (!activeFile || activeContent === null || targetFile.path !== activeFile.path) {
      return null;
    }

    const equations = processActiveNoteEquations(this.plugin, activeFile, activeContent);
    const targetEquation = equations.get(blockId);

    if (targetEquation?.$printName) {
      let result: string;
      const settings = this.plugin.settings;

      if (subIndex !== undefined) {
        const baseName = targetEquation.$printName.slice(1, -1);
        result = settings.eqRefPrefix + `(${baseName}.${subIndex})` + settings.eqRefSuffix;
      } else {
        result = targetEquation.$refName ?? targetEquation.$printName;
      }

      if (settings.noteTitleInEquationLink && parsedLinktext.path) {
        result = targetFile.basename + ' > ' + result;
      }
      return result;
    }

    return null;
  }
}
