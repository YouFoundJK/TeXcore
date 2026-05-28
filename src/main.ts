import { MarkdownView, Plugin, TFile, parseLinktext, Menu, TFolder, Editor, Notice } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { around } from 'monkey-around';
import * as fs from "fs/promises";
import * as path from "path";

import { PluginSettings, DEFAULT_SETTINGS } from './features/settings/settings';
import { MathSettingTab } from "./features/settings/tab";

import { Provider } from './features/linker/provider-link-render';
import { LatexLinkProvider } from 'latex-provider';
import { createEquationNumberProcessor } from 'features/equations/reading-view-equations';
import { CustomMathLinksProcessor } from './features/linker/reading-view-linker';
import { setupDOMObserver } from './features/linker/dom-observer';
import { createEquationNumberPlugin } from 'features/equations/live-preview-equations';
import { createLivePreviewLinkRendererPlugin } from './features/linker/live-preview-link-renderer';

import { insertDisplayMath } from 'utils/plugin';
import { LinkAutocomplete } from 'features/search/editor-suggest';
import { MathSearchModal } from 'features/search/modal';
import { EquationBlock } from 'types';

// ADDED: Import our new internal patcher function
import { patchSuggesterWithQuickPreview } from 'features/quick-preview/patcher';
import { processActiveNoteEquations } from './features/equations/numbering';
import { ExportConfigModal } from "./features/export-pdf/modal";
import { checkAndFixCalloutMath } from 'utils/fixer';
import { traverseFolder } from "./features/export-pdf/utils";
import { SnippetManager } from 'features/snippets/manager';
import { processZoteroCleanup } from 'features/zotero-cleanup';


const isDev = process.env.NODE_ENV === "development";

export default class LatexReferencer extends Plugin {
	settings: PluginSettings;
	editorExtensions: Extension[];
	internalProviders: Provider[] = [];
	snippetManager: SnippetManager;

	async onload() {
		await this.loadSettings();

		this.internalProviders.push(new LatexLinkProvider(this));

		// Snippets
		this.snippetManager = new SnippetManager(this);
		this.snippetManager.onLoad();

		this.addSettingTab(new MathSettingTab(this.app, this));

		// Commands
		this.addCommand({
			id: 'remove-duplicate-zotero-annotations',
			name: 'Remove duplicate Zotero annotations',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				processZoteroCleanup(this, view);
			}
		});

		this.addCommand({
			id: 'fix-callout-equations',
			name: 'Fix callout equations in active note',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const content = editor.getValue();
				const fixed = checkAndFixCalloutMath(content);
				if (fixed) {
					editor.setValue(fixed);
					new Notice('Fixed callout equations.');
				} else {
					new Notice('No issues found or no changes needed.');
				}
			}
		});

		this.addCommand({
			id: 'insert-display-math',
			name: 'Insert display math',
			editorCallback: insertDisplayMath,
		});

		this.addCommand({
			id: 'search-equations',
			name: 'Search equations in active note',
			callback: () => {
				new MathSearchModal(this).open();
			}
		});

		this.addCommand({
			id: "export-current-file-to-pdf",
			name: "Export current file to PDF",
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				const file = view?.file;
				if (!file) {
					return false;
				}
				if (checking) {
					return true;
				}
				new ExportConfigModal(this, file).open();

				return true;
			},
		});

		// Menu items for file export
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TFile | TFolder) => {
				let title = file instanceof TFolder ? "Export folder to PDF" : "Better Export PDF";
				if (isDev) {
					title = `${title} (dev)`;
				}

				menu.addItem((item) => {
					item
						.setTitle(title)
						.setIcon("download")
						.setSection("action")
						.onClick(async () => {
							new ExportConfigModal(this, file).open();
						});
				});
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file: TFile | TFolder) => {
				if (file instanceof TFolder) {
					let title = "Export to PDF...";
					if (isDev) {
						title = `${title} (dev)`;
					}
					menu.addItem((item) => {
						item.setTitle(title).setIcon("lucide-folder-down").setSection("action");
						// @ts-ignore
						const subMenu: Menu = item.setSubmenu();
						subMenu.addItem((item) =>
							item
								.setTitle("Export each file to PDF")
								.setIcon("lucide-file-stack")
								.onClick(async () => {
									new ExportConfigModal(this, file, true).open();
								}),
						);
						subMenu.addItem((item) =>
							item
								.setTitle("Generate TOC.md file")
								.setIcon("lucide-file-text")
								.onClick(async () => {
									await this.generateToc(file);
								}),
						);
					});
				}
			}),
		);

		// Editor Extensions
		this.editorExtensions = []
		this.registerEditorExtension(this.editorExtensions);
		this.updateEditorExtensions();

		// Link autocompletion
		this.registerEditorSuggest(new LinkAutocomplete(this));

		// REPLACED: The old external plugin logic is gone.
		// We now call our internal patcher directly.
		const itemNormalizer = (item: EquationBlock) => ({
			linktext: item.$file + '#^' + item.$blockId, // Use the block ID for more precise linking
			sourcePath: item.$file,
			line: item.$position.start,
		});

		patchSuggesterWithQuickPreview(this, LinkAutocomplete, itemNormalizer);
		patchSuggesterWithQuickPreview(this, MathSearchModal, itemNormalizer);


		// Markdown post processors for Reading View
		this.registerMarkdownPostProcessor(createEquationNumberProcessor(this));
		this.registerMarkdownPostProcessor(CustomMathLinksProcessor(this));
		this.app.workspace.onLayoutReady(() => this.forceRerender());

		this.patchPagePreview();
		this.register(setupDOMObserver(this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateEditorExtensions() {
		this.editorExtensions.length = 0;
		// PUSH BOTH PLUGINS
		this.editorExtensions.push(createEquationNumberPlugin(this));
		this.editorExtensions.push(createLivePreviewLinkRendererPlugin(this));
		this.app.workspace.updateOptions();
	}

	forceRerender() {
		setTimeout(async () => {
			for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
				const view = leaf.view as MarkdownView;
				view.previewMode.rerender(true);
			}
		}, 800);
	}

	patchPagePreview() {
		const pagePreviewPlugin = this.app.internalPlugins.getPluginById('page-preview');
		if (!pagePreviewPlugin?.instance) {
			console.log("Latex Referencer: Page Preview plugin not found. Cannot patch hover behavior.");
			return;
		}

		const instance = pagePreviewPlugin.instance;
		const plugin = this;

		const uninstaller = around(instance, {
			onLinkHover(old: any) {
				return function (hoverParent: any, targetEl: any, linktext: string, sourcePath: string, state: any) {
					const { path, subpath } = parseLinktext(linktext);

					// Check if it's our custom equation link (e.g., [[#^eq-...]] or [[file#^eq-...]])
					if (subpath && subpath.startsWith('^eq-')) {
						const subpathText = subpath.substring(1); // Remove '^', leaving 'eq-...'
						const subIndexMatch = subpathText.match(/-(\d+)$/);
						let blockId = subpathText;

						if (subIndexMatch) {
							blockId = subpathText.substring(0, subIndexMatch.index);
						}
						const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(path, sourcePath);

						if (targetFile instanceof TFile) {
							const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
							const activeFile = activeView?.file;
							const activeContent = typeof activeView?.getViewData === 'function' ? activeView.getViewData() : null;

							if (!activeFile || targetFile.path !== activeFile.path || activeContent === null) {
								return old.call(this, hoverParent, targetEl, linktext, sourcePath, state);
							}

							const equations = processActiveNoteEquations(plugin, activeFile, activeContent);
							const targetEquation = equations.get(blockId);

							if (targetEquation) {
								const line = targetEquation.$position.start;
								const newState = { ...state, scroll: line };
								// Immediately call the original function with the correct line number
								return old.call(this, hoverParent, targetEl, linktext, sourcePath, newState);
							}
						}
					}

					// If it's not our link, or if we couldn't find it in the cache,
					// call the original function without modification.
					return old.call(this, hoverParent, targetEl, linktext, sourcePath, state);
				};
			}
		});

		this.register(uninstaller);
	}




	async generateToc(root: TFolder | TFile) {
		// @ts-ignore
		const basePath = this.app.vault.adapter.basePath;
		const toc = path.join(basePath, root.path, "_TOC_.md");
		const content = `---\ntoc: true\ntitle: ${root.name}\n---\n`;
		await fs.writeFile(toc, content);
		if (root instanceof TFolder) {
			const files = traverseFolder(root);
			for (const file of files) {
				if (file.name == "_TOC_.md") {
					continue;
				}
				await fs.appendFile(toc, `[[${file.path}]]\n`);
			}
		}
	}
}