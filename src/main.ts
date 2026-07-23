import {
  App,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  TFile,
  parseLinktext,
  Menu,
  TFolder,
  Editor,
  MarkdownFileInfo,
  EventRef
} from 'obsidian';
import type { Extension } from '@codemirror/state';
import { around } from 'monkey-around';

import { PluginSettings, DEFAULT_SETTINGS } from './settings/settings';

import { Provider } from './core/linker/provider-link-render';
import { LatexLinkProvider } from './core/linker/latex-provider';
import { createEquationNumberProcessor } from 'core/equations/reading-view-equations';
import { CustomMathLinksProcessor } from './core/linker/reading-view-linker';
import { setupDOMObserver } from './core/linker/dom-observer';
import { createEquationNumberPlugin } from 'core/equations/live-preview-equations';
import {
  createObsitexAutoTemplatePlugin,
  DEFAULT_OBSITEX_TEMPLATE
} from './core/equations/obsitex-auto-template';
import { createLivePreviewLinkRendererPlugin } from './core/linker/live-preview-link-renderer';

import { insertDisplayMath } from 'utils/plugin';
import { LinkAutocomplete } from 'ui/search/editor-suggest';
import { MathSearchModal } from 'ui/search/modal';
import { EquationBlock } from 'types';

// ADDED: Import our new internal patcher function
import { patchSuggesterWithQuickPreview } from 'ui/quick-preview/patcher';
import { processActiveNoteEquations } from './core/equations/numbering';
import { checkAndFixCalloutMath } from 'utils/fixer';
import { showNotice, setCssProps } from 'utils/obsidian';
import { SnippetManager } from 'features/snippets/manager';
import { CustomNoteManager } from 'features/custom-notes/manager';
import type { TikzRenderer } from './features/tikz/renderer';
import {
  createRowLayoutProcessor,
  createLivePreviewRowLayoutPlugin
} from './features/tikz/row-layout';
import { createTikzLivePreviewPlugin } from './features/tikz/live-preview-overlay';

declare const process: { env: { NODE_ENV?: string } };
const isDev = process.env.NODE_ENV === 'development';

export default class LatexReferencer extends Plugin {
  declare settings: PluginSettings;
  editorExtensions!: Extension[];
  internalProviders: Provider[] = [];
  snippetManager!: SnippetManager;
  customNoteManager!: CustomNoteManager;
  tikzRenderer!: TikzRenderer;
  isTikzEditorOpen = false;

  async onload() {
    await this.loadSettings();

    // Check version and show What's New modal if upgraded/first install
    const releaseVersion = this.manifest.version;
    this.app.workspace.onLayoutReady(async () => {
      if (
        this.settings.currentVersion === null ||
        this.settings.currentVersion !== releaseVersion
      ) {
        const { WhatsNewModal } = await import('./ui/modals/WhatsNewModal');
        new WhatsNewModal(this.app, this.manifest.id).open();
        this.settings.currentVersion = releaseVersion;
        await this.saveSettings();
      }
    });

    this.internalProviders.push(new LatexLinkProvider(this));

    // Snippets
    this.snippetManager = new SnippetManager(this);
    this.snippetManager.onLoad();

    // Custom Notes
    this.customNoteManager = new CustomNoteManager(this);
    this.customNoteManager.onLoad();

    // TikZJax Rendering
    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.enableTikzjax) {
        await this.initTikzRenderer();
      }
    });

    this.addSettingTab(new LazyMathSettingTab(this.app, this));

    // Commands
    this.registerZoteroCommand();

    this.addCommand({
      id: 'fix-callout-equations',
      name: 'Fix callout equations in active note',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        const content = editor.getValue();
        const fixed = checkAndFixCalloutMath(content);
        if (fixed) {
          editor.setValue(fixed);
          showNotice('Fixed callout equations.');
        } else {
          showNotice('No issues found or no changes needed.');
        }
      }
    });

    this.addCommand({
      id: 'insert-display-math',
      name: 'Insert display math',
      editorCallback: insertDisplayMath
    });

    this.addCommand({
      id: 'insert-obsitex-block',
      name: 'Insert configuration block',
      editorCallback: (editor: Editor) => {
        const block = `\`\`\`obsitex\n${DEFAULT_OBSITEX_TEMPLATE}\n\`\`\`\n`;
        editor.replaceSelection(block);
      }
    });

    this.addCommand({
      id: 'search-equations',
      name: 'Search equations in active note',
      callback: () => {
        new MathSearchModal(this).open();
      }
    });

    this.addCommand({
      id: 'export-current-file-to-pdf',
      name: 'Export current file to pdf',
      checkCallback: (checking: boolean) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const file = view?.file;
        if (!file) {
          return false;
        }
        if (checking) {
          return true;
        }
        void (async () => {
          const { ExportConfigModal } = await import('./ui/export-pdf/modal');
          new ExportConfigModal(this, file).open();
        })();

        return true;
      }
    });

    // Menu items for file export
    this.registerEvent(
      (
        this.app.workspace as unknown as {
          on(name: 'file-menu', callback: (menu: Menu, file: TFile | TFolder) => void): EventRef;
        }
      ).on('file-menu', (menu: Menu, file: TFile | TFolder) => {
        let title = file instanceof TFolder ? 'Export folder to PDF' : 'Better Export PDF';
        if (isDev) {
          title = `${title} (dev)`;
        }

        menu.addItem(item => {
          item
            .setTitle(title)
            .setIcon('download')
            .setSection('action')
            .onClick(async () => {
              const { ExportConfigModal } = await import('./ui/export-pdf/modal');
              new ExportConfigModal(this, file).open();
            });
        });
      })
    );

    this.registerEvent(
      (
        this.app.workspace as unknown as {
          on(name: 'file-menu', callback: (menu: Menu, file: TFile | TFolder) => void): EventRef;
        }
      ).on('file-menu', (menu: Menu, file: TFile | TFolder) => {
        if (file instanceof TFolder) {
          let title = 'Export to PDF...';
          if (isDev) {
            title = `${title} (dev)`;
          }
          menu.addItem(item => {
            item.setTitle(title).setIcon('lucide-folder-down').setSection('action');
            const subMenu = (item as unknown as { setSubmenu: () => Menu }).setSubmenu();
            subMenu.addItem(item =>
              item
                .setTitle('Export each file to pdf')
                .setIcon('lucide-file-stack')
                .onClick(async () => {
                  const { ExportConfigModal } = await import('./ui/export-pdf/modal');
                  new ExportConfigModal(this, file, true).open();
                })
            );
            subMenu.addItem(item =>
              item
                .setTitle('Generate TOC.md file')
                .setIcon('lucide-file-text')
                .onClick(async () => {
                  await this.generateToc(file);
                })
            );
          });
        }
      })
    );

    // Editor Extensions
    this.editorExtensions = [];
    this.registerEditorExtension(this.editorExtensions);
    this.updateEditorExtensions();

    // Link autocompletion
    this.registerEditorSuggest(new LinkAutocomplete(this));

    // REPLACED: The old external plugin logic is gone.
    // We now call our internal patcher directly.
    const itemNormalizer = (item: EquationBlock) => ({
      linktext: `${item.$file}#^${item.$blockId}`, // Use the block ID for more precise linking
      sourcePath: item.$file,
      line: item.$position.start
    });

    patchSuggesterWithQuickPreview(this, LinkAutocomplete, itemNormalizer);
    patchSuggesterWithQuickPreview(this, MathSearchModal, itemNormalizer);

    // Markdown post processors for Reading View
    this.registerMarkdownCodeBlockProcessor('obsitex', (_source, el) => {
      setCssProps(el, { display: 'none' });
      el.empty();
    });
    this.registerMarkdownPostProcessor(createEquationNumberProcessor(this));
    this.registerMarkdownPostProcessor(CustomMathLinksProcessor(this));
    this.registerMarkdownPostProcessor(createRowLayoutProcessor(this));
    this.app.workspace.onLayoutReady(() => {
      void this.forceRerender();
    });

    this.patchPagePreview();
    this.app.workspace.onLayoutReady(() => {
      this.register(setupDOMObserver(this));
    });
  }

  onunload() {
    if (this.tikzRenderer) {
      this.tikzRenderer.onUnload();
    }
  }

  async loadSettings() {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...((await this.loadData()) as Partial<PluginSettings>)
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  updateEditorExtensions() {
    this.editorExtensions.length = 0;
    // PUSH ALL PLUGINS
    this.editorExtensions.push(createEquationNumberPlugin(this));
    this.editorExtensions.push(createObsitexAutoTemplatePlugin());
    this.editorExtensions.push(createLivePreviewLinkRendererPlugin(this));
    this.editorExtensions.push(createLivePreviewRowLayoutPlugin(this));
    this.editorExtensions.push(createTikzLivePreviewPlugin(this));
    this.app.workspace.updateOptions();
  }

  private forceRerender() {
    this.app.workspace.iterateAllLeaves(leaf => {
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.previewMode.rerender(true);
      }
    });
  }

  private patchPagePreview() {
    const pagePreviewPlugin = this.app.internalPlugins.getPluginById('page-preview') as unknown as {
      enabled: boolean;
      instance: unknown;
    } | null;
    if (!pagePreviewPlugin?.enabled) {
      return;
    }

    const instance = pagePreviewPlugin.instance;
    const app = this.app;
    const getEquations = (file: TFile, content: string) =>
      processActiveNoteEquations(this, file, content);

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

          // Check if it's our custom equation link (e.g., [[#^eq-...]] or [[file#^eq-...]])
          if (subpath && subpath.startsWith('^eq-')) {
            const subpathText = subpath.substring(1); // Remove '^', leaving 'eq-...'
            const subIndexMatch = subpathText.match(/-(\d+)$/);
            let blockId = subpathText;

            if (subIndexMatch) {
              blockId = subpathText.substring(0, subIndexMatch.index);
            }
            const targetFile = app.metadataCache.getFirstLinkpathDest(path, sourcePath);

            if (targetFile instanceof TFile) {
              const activeView = app.workspace.getActiveViewOfType(MarkdownView);
              const activeFile = activeView?.file;
              const activeContent =
                typeof activeView?.getViewData === 'function' ? activeView.getViewData() : null;

              if (!activeFile || targetFile.path !== activeFile.path || activeContent === null) {
                return oldFunc.call(this, hoverParent, targetEl, linktext, sourcePath, state);
              }

              const equations = getEquations(activeFile, activeContent);
              const targetEquation = equations.get(blockId);

              if (targetEquation) {
                const line = targetEquation.$position.start;
                const newState = { ...state, scroll: line };
                // Immediately call the original function with the correct line number
                return oldFunc.call(this, hoverParent, targetEl, linktext, sourcePath, newState);
              }
            }
          }

          // If it's not our link, or if we couldn't find it in the cache,
          // call the original function without modification.
          return oldFunc.call(this, hoverParent, targetEl, linktext, sourcePath, state);
        };
      }
    });

    this.register(uninstaller);
  }

  registerZoteroCommand() {
    const commandId = 'remove-duplicate-zotero-annotations';
    const fullCommandId = `${this.manifest.id}:${commandId}`;
    const appCommands = this.app.commands;

    // 1. Unregister if it exists
    if (appCommands && typeof appCommands.removeCommand === 'function') {
      try {
        appCommands.removeCommand(fullCommandId);
      } catch {
        // Safe to ignore
      }
    }

    // 2. Register if enabled
    if (this.settings.enableZoteroCleanup) {
      this.addCommand({
        id: commandId,
        name: 'Remove duplicate Zotero annotations',
        editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
          if (ctx instanceof MarkdownView) {
            void (async () => {
              const { processZoteroCleanup } = await import('features/zotero-cleanup');
              await processZoteroCleanup(this, ctx);
            })();
          }
        }
      });
    }
  }

  async generateToc(root: TFolder | TFile) {
    const tocPath = root.path === '/' || root.path === '.' ? '_TOC_.md' : `${root.path}/_TOC_.md`;
    let content = `---\ntoc: true\ntitle: ${root.name || 'Root'}\n---\n`;
    if (root instanceof TFolder) {
      const { traverseFolder } = await import('features/export-pdf/utils');
      const files = traverseFolder(root);
      for (const file of files) {
        if (file.name === '_TOC_.md') {
          continue;
        }
        content += `[[${file.path}]]\n`;
      }
    }
    const abstractFile = this.app.vault.getAbstractFileByPath(tocPath);
    if (abstractFile instanceof TFile) {
      await this.app.vault.modify(abstractFile, content);
    } else {
      await this.app.vault.create(tocPath, content);
    }
  }

  async initTikzRenderer() {
    if (!this.tikzRenderer) {
      const { TikzRenderer } = await import('./features/tikz/renderer');
      this.tikzRenderer = new TikzRenderer(this);
      await this.tikzRenderer.onLoad();
    }
  }
}

interface Displayable {
  display(): void;
}

class LazyMathSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    public plugin: LatexReferencer
  ) {
    super(app, plugin);
  }
  display(): void {
    import('./settings/tab')
      .then(({ MathSettingTab }) => {
        const tab = new MathSettingTab(this.app, this.plugin);
        tab.containerEl = this.containerEl;
        (tab as unknown as Displayable).display();
      })
      .catch(err => {
        console.error('Failed to load settings tab:', err);
      });
  }
}
