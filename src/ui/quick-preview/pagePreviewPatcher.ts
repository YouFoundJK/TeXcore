import { MarkdownView, TFile, parseLinktext } from 'obsidian';
import { around } from 'monkey-around';
import LatexReferencer from '../../main';
import { processActiveNoteEquations } from '../../core/equations/numbering';
import { EquationBlock } from '../../types';
import { getSyncFileContent } from '../../utils/obsidian';
import { parseObsitexConfig } from '../../utils/obsitex';

/**
 * Patch Obsidian's core page-preview plugin to support equation reference links (#^eq-...)
 * across both active notes and external/supplement notes cleanly without throwing DOM block resolution errors.
 */
export function setupPagePreviewPatcher(plugin: LatexReferencer): void {
  const pagePreviewPlugin = plugin.app.internalPlugins.getPluginById('page-preview') as unknown as {
    enabled: boolean;
    instance: unknown;
  } | null;

  if (!pagePreviewPlugin?.enabled) {
    return;
  }

  const instance = pagePreviewPlugin.instance;
  const app = plugin.app;

  const uninstaller = around(instance as Record<string, unknown>, {
    onLinkHover(old: unknown) {
      const oldFunc = old as (
        this: unknown,
        hoverParent: unknown,
        targetEl: unknown,
        linktext: string,
        sourcePath: string,
        state: Record<string, unknown>
      ) => unknown;

      return function (
        this: unknown,
        hoverParent: unknown,
        targetEl: unknown,
        linktext: string,
        sourcePath: string,
        state: Record<string, unknown>
      ) {
        const { path, subpath } = parseLinktext(linktext);
        const cleanSubpath = subpath
          ? subpath.startsWith('#')
            ? subpath.substring(1)
            : subpath
          : '';

        if (cleanSubpath && cleanSubpath.startsWith('^eq-')) {
          const subpathText = cleanSubpath.substring(1); // Remove '^', leaving 'eq-...'
          const subIndexMatch = subpathText.match(/-(\d+)$/);
          let blockId = subpathText;

          if (subIndexMatch) {
            blockId = subpathText.substring(0, subIndexMatch.index);
          }

          const sourceFile = app.vault.getFileByPath(sourcePath) ?? app.workspace.getActiveFile();

          const targetFile = path
            ? app.metadataCache.getFirstLinkpathDest(path, sourcePath)
            : sourceFile;

          const activeView = app.workspace.getActiveViewOfType(MarkdownView);
          const activeContent =
            typeof activeView?.getViewData === 'function' ? activeView.getViewData() : null;

          const processAndGetEquation = (f: TFile, content: string): EquationBlock | undefined => {
            const equations = processActiveNoteEquations(
              plugin,
              f,
              content,
              activeContent ?? undefined
            );
            return equations.get(blockId);
          };

          let targetEquation: EquationBlock | undefined = undefined;
          let effectiveTargetFile: TFile | null = targetFile instanceof TFile ? targetFile : null;

          if (targetFile instanceof TFile) {
            if (activeView && activeView.file?.path === targetFile.path && activeContent !== null) {
              targetEquation = processAndGetEquation(targetFile, activeContent);
            } else {
              const cachedContent = getSyncFileContent(app, targetFile);
              if (cachedContent) {
                targetEquation = processAndGetEquation(targetFile, cachedContent);
              }
            }

            // Fallback: If blockId is not found in targetFile (e.g. local link [[#^eq-...]]), search active note's supplements!
            if (!targetEquation && activeContent) {
              const obsitexConfig = parseObsitexConfig(activeContent);
              if (obsitexConfig.supplements) {
                for (const suppKey of Object.keys(obsitexConfig.supplements)) {
                  const suppFile = app.metadataCache.getFirstLinkpathDest(suppKey, sourcePath);
                  if (!suppFile) continue;
                  const suppContent = getSyncFileContent(app, suppFile);
                  if (!suppContent) continue;
                  const foundEq = processAndGetEquation(suppFile, suppContent);
                  if (foundEq) {
                    targetEquation = foundEq;
                    effectiveTargetFile = suppFile;
                    break;
                  }
                }
              }
            }
          }

          if (targetEquation && effectiveTargetFile) {
            const line = targetEquation.$position.start;
            const newState = { ...state, scroll: line };
            const effectiveLinktext = effectiveTargetFile.path;

            return oldFunc.call(
              this,
              hoverParent,
              targetEl,
              effectiveLinktext,
              sourcePath,
              newState
            );
          }
        }

        return oldFunc.call(this, hoverParent, targetEl, linktext, sourcePath, state);
      };
    }
  });

  plugin.register(uninstaller);
}
