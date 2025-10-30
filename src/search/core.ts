import { App, Editor, EditorSuggestContext, Instruction, Notice, Scope, SearchResult, TFile, finishRenderMath, prepareFuzzySearch, prepareSimpleSearch, renderMath, sortSearchResults } from 'obsidian';

import LatexReferencer from 'main';
import { EquationBlock, MathBlock } from 'index/typings/markdown';
import { LEAF_OPTION_TO_ARGS } from 'settings/settings';
import { getModifierNameInPlatform, openFileAndSelectPosition } from 'utils/obsidian';
import { insertBlockIdIfNotExist, resolveSettings } from 'utils/plugin';
import { MathSearchModal } from './modal';
import { ActiveNoteEquationProvider } from 'equations/provider';

export type ScoredMathBlock = { match: SearchResult, block: MathBlock };

export interface SuggestParent {
    app: App;
    plugin: LatexReferencer;
    scope: Scope;
    getContext(): Omit<EditorSuggestContext, 'query'> | null;
    setInstructions(instructions: Instruction[]): void;
    getSelectedItem(): MathBlock;
    getEditor(): Editor;
}

export abstract class MathSearchCore {
    app: App;
    plugin: LatexReferencer;
    index: any; // No longer used, but kept for structure
    scope: Scope;

    constructor(public parent: SuggestParent) {
        this.plugin = parent.plugin;
        this.app = this.plugin.app;
        this.scope = parent.scope;
    }

    setScope() {
        // Mod (by default) + Enter to jump to the selected item
        this.scope.register([this.plugin.extraSettings.modifierToJump], "Enter", () => {
            const context = this.parent.getContext();
            if (context) {
                const { editor, start, end } = context;
                editor.replaceRange("", start, end);
            }
            const item = this.parent.getSelectedItem();
            const file = this.app.vault.getAbstractFileByPath(item.$file); // the file containing the selected item
            if (!(file instanceof TFile)) return;
            openFileAndSelectPosition(this.app, file, item.$pos, ...LEAF_OPTION_TO_ARGS[this.plugin.extraSettings.suggestLeafOption]);
            if (this.parent instanceof MathSearchModal) this.parent.close();
            return false;
        });

        // Shift (by default) + Enter to insert a link to the note containing the selected item
        this.scope.register([this.plugin.extraSettings.modifierToNoteLink], "Enter", () => {
            const item = this.parent.getSelectedItem();
            this.selectSuggestionImpl(item, true);
            if (this.parent instanceof MathSearchModal) this.parent.close();
            return false;
        });

        if (this.plugin.extraSettings.showModifierInstruction) {
            this.parent.setInstructions([
                { command: "↑↓", purpose: "to navigate" },
                { command: "↵", purpose: "to insert link" },
                { command: `${getModifierNameInPlatform(this.plugin.extraSettings.modifierToNoteLink)} + ↵`, purpose: "to insert link to note" },
                { command: `${getModifierNameInPlatform(this.plugin.extraSettings.modifierToJump)} + ↵`, purpose: "to jump" },
            ]);
        }
    }

    abstract getUnsortedSuggestions(): Promise<MathBlock[]>;

    async getSuggestions(query: string): Promise<MathBlock[]> {
        const blocks = await this.getUnsortedSuggestions();
        const callback = (this.plugin.extraSettings.searchMethod == "Fuzzy" ? prepareFuzzySearch : prepareSimpleSearch)(query);
        const results: ScoredMathBlock[] = [];

        for (const block of blocks) {
            if (block.$type === "equation") {
                const text = (block as EquationBlock).$mathText;
                const result = callback(text);
                if (result) {
                    results.push({ match: result, block });
                }
            }
        }
        
        sortSearchResults(results);
        return results.map((result) => result.block);
    }

    renderSuggestion(block: MathBlock, el: HTMLElement): void {
        const baseEl = el.createDiv({ cls: "math-booster-search-item" });
        
        const smallEl = baseEl.createEl(
            "small", {
            text: `Line ${block.$position.start + 1}`,
            cls: "math-booster-search-item-description"
        });

        if (block.$type === "equation") {
            if (this.plugin.extraSettings.renderMathInSuggestion) {
                const mjxContainerEl = renderMath((block as EquationBlock).$mathText, true);
                baseEl.insertBefore(mjxContainerEl, smallEl);
            } else {
                const mathTextEl = createDiv({ text: (block as EquationBlock).$mathText });
                baseEl.insertBefore(mathTextEl, smallEl);
            }
        }
    }

    selectSuggestion(item: MathBlock, evt: MouseEvent | KeyboardEvent): void {
        this.selectSuggestionImpl(item, false);
        finishRenderMath();
    }

    async selectSuggestionImpl(block: MathBlock, insertNoteLink: boolean): Promise<void> {
        const context = this.parent.getContext();
        if (!context) return;
        
        const fileContainingBlock = this.app.vault.getAbstractFileByPath(block.$file);
        const cache = this.app.metadataCache.getCache(block.$file);
        if (!(fileContainingBlock instanceof TFile) || !cache) return;

        const { editor, start, end, file } = context;
        const settings = resolveSettings(undefined, this.plugin, file);
        let success = false;

        const result = await insertBlockIdIfNotExist(this.plugin, fileContainingBlock, cache, block);
        if (result) {
            const { id, lineAdded } = result;
            let linktext = "";
            if (!insertNoteLink) {
                linktext += `#^${id}`;
            }
            const link = `[[${linktext}]]`;
            const insertText = link + (settings.insertSpace ? " " : "");

            editor.replaceRange(
                insertText,
                { line: start.line + lineAdded, ch: start.ch },
                { line: end.line + lineAdded, ch: end.ch }
            );
            success = true;
        }

        if (!success) {
            new Notice(`${this.plugin.manifest.name}: Failed to read cache. Retry again later.`, 5000);
        }
    }
}

export class ActiveNoteSearchCore extends MathSearchCore {
    provider: ActiveNoteEquationProvider;

    constructor(parent: SuggestParent) {
        super(parent);
        this.provider = new ActiveNoteEquationProvider(this.app);
    }

    async getUnsortedSuggestions(): Promise<MathBlock[]> {
        const file = this.app.workspace.getActiveFile();
        const editor = this.parent.getEditor();

        if (file && editor) {
            return this.provider.getEquations(file, editor);
        }
        
        return [];
    }
}