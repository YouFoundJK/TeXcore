import { MarkdownView, Plugin } from 'obsidian';
import type { Extension } from '@codemirror/state';

import { registerQuickPreview } from 'obsidian-quick-preview';

import { PluginSettings, DEFAULT_SETTINGS } from 'settings/settings';
import { MathSettingTab } from "settings/tab";

import { Provider } from 'link-renderer/provider-link-render';
import { LatexLinkProvider } from 'latex-provider';
import { createEquationNumberProcessor } from 'equations/reading-view';
import { CustomMathLinksProcessor } from 'link-renderer/reading-view';
import { createEquationNumberPlugin } from 'equations/live-preview-equations';
import { createLivePreviewLinkRendererPlugin } from 'link-renderer/live-preview-link-renderer';

import { insertDisplayMath } from 'utils/plugin';
import { LinkAutocomplete } from 'search/editor-suggest';
import { MathSearchModal } from 'search/modal';
import { EquationBlock } from 'types';

export default class LatexReferencer extends Plugin {
	settings: PluginSettings;
	editorExtensions: Extension[];
	internalProviders: Provider[] = [];

	async onload() {
		await this.loadSettings();
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
		const itemNormalizer = (item: EquationBlock) => ({
			linktext: item.$file,
			sourcePath: '',
			line: item.$position.start,
		});
		registerQuickPreview(this.app, this, LinkAutocomplete, itemNormalizer);
		registerQuickPreview(this.app, this, MathSearchModal, itemNormalizer);

	// Markdown post processors for Reading View
	this.registerMarkdownPostProcessor(createEquationNumberProcessor(this));
	this.registerMarkdownPostProcessor(CustomMathLinksProcessor(this));
	this.app.workspace.onLayoutReady(() => this.forceRerender());
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
}