import { MarkdownView, TFile, parseLinktext } from 'obsidian';
import { around } from 'monkey-around';
import LatexReferencer from '../../main';
import { processActiveNoteEquations } from '../../core/equations/numbering';
import { EquationBlock } from '../../types';

/**
 * Patch Obsidian's core page-preview plugin to support equation reference links (#^eq-...)
 * across both active notes and external notes cleanly without throwing DOM block resolution errors.
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

          const targetFile = path
            ? app.metadataCache.getFirstLinkpathDest(path, sourcePath)
            : (app.metadataCache.getFirstLinkpathDest(sourcePath, sourcePath) ??
              app.vault.getFileByPath(sourcePath));

          if (targetFile instanceof TFile) {
            const activeView = app.workspace.getActiveViewOfType(MarkdownView);
            let targetContent: string | null = null;

            if (
              activeView &&
              activeView.file?.path === targetFile.path &&
              typeof activeView.getViewData === 'function'
            ) {
              targetContent = activeView.getViewData();
            }

            const processAndGetEquation = (content: string): EquationBlock | undefined => {
              const equations = processActiveNoteEquations(plugin, targetFile, content);
              return equations.get(blockId);
            };

            let targetEquation: EquationBlock | undefined = undefined;

            if (targetContent !== null) {
              targetEquation = processAndGetEquation(targetContent);
            } else {
              const cachedContent = (
                app.vault as unknown as { cachedReadSync?: (file: TFile) => string }
              ).cachedReadSync?.(targetFile);

              if (cachedContent) {
                targetEquation = processAndGetEquation(cachedContent);
              } else {
                void app.vault.read(targetFile).then(content => {
                  processActiveNoteEquations(plugin, targetFile, content);
                });
              }
            }

            if (targetEquation) {
              const line = targetEquation.$position.start;
              const newState = { ...state, scroll: line };
              const effectiveLinktext = targetFile.path;
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
        }

        return oldFunc.call(this, hoverParent, targetEl, linktext, sourcePath, state);
      };
    }
  });

  plugin.register(uninstaller);
}
