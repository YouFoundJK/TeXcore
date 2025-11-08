import { MarkdownView, Plugin, TFile, parseLinktext } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { around } from 'monkey-around';

import { PluginSettings, DEFAULT_SETTINGS } from './features/settings/settings';
import { MathSettingTab } from "./features/settings/tab";

import { Provider } from './features/linker/provider-link-render';
import { LatexLinkProvider } from 'latex-provider';
import { createEquationNumberProcessor } from 'features/equations/reading-view-equations';
import { CustomMathLinksProcessor } from './features/linker/reading-view-linker';
import { createEquationNumberPlugin } from 'features/equations/live-preview-equations';
import { createLivePreviewLinkRendererPlugin } from './features/linker/live-preview-link-renderer';

import { insertDisplayMath } from 'utils/plugin';
import { LinkAutocomplete } from 'features/search/editor-suggest';
import { MathSearchModal } from 'features/search/modal';
import { EquationBlock } from 'types';

// ADDED: Import our new internal patcher function
import { patchSuggesterWithQuickPreview } from 'features/quick-preview/patcher';
import { EquationCache } from './features/cache/equation-cache';

export default class LatexReferencer extends Plugin {
	settings: PluginSettings;
	editorExtensions: Extension[];
	internalProviders: Provider[] = [];
	equationCache: EquationCache;

	async onload() {
		await this.loadSettings();

		// Caching
		this.equationCache = new EquationCache(this);
		this.app.workspace.onLayoutReady(async () => {
			await this.equationCache.buildCache();
		});

		// Register event handlers to keep the cache up-to-date
		this.registerEvent(this.app.metadataCache.on('changed', async (file) => {
			await this.equationCache.updateFile(file);
		}));
		this.registerEvent(this.app.vault.on('rename', async (file, oldPath) => {
			if (file instanceof TFile) this.equationCache.renameFile(file, oldPath);
		}));
		this.registerEvent(this.app.vault.on('delete', async (file) => {
			if (file instanceof TFile) this.equationCache.removeFile(file);
		}));

		this.internalProviders.push(new LatexLinkProvider(this));
		this.addSettingTab(new MathSettingTab(this.app, this));

		// Commands
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
						const blockId = subpath.substring(1); // Remove '^', leaving 'eq-...'
						const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(path, sourcePath);

						if (targetFile instanceof TFile) {
							// Perform a SYNCHRONOUS lookup in our cache
							const targetEquation = plugin.equationCache.get(targetFile.path, blockId);

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
}