import LatexReferencer from "main";
import { App, Editor, EditorSuggestContext, MarkdownView, SuggestModal } from "obsidian";
import { ActiveNoteSearchCore, SuggestParent } from "./core-search";
import { EquationBlock } from "types";

export class MathSearchModal extends SuggestModal<EquationBlock> implements SuggestParent {
    app: App;
    core: ActiveNoteSearchCore;

    constructor(public plugin: LatexReferencer) {
        super(plugin.app);
        this.app = plugin.app;
        this.core = new ActiveNoteSearchCore(this);
        this.core.setScope();
        this.setPlaceholder('Search equations in the active note...');
        this.inputEl.addClass('math-booster-search-input');
        this.limit = this.plugin.settings.suggestNumber;
    }

    getEditor(): Editor {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) return view.editor;
        throw new Error("No active MarkdownView found.");
    }

    getContext(): Omit<EditorSuggestContext, 'query'> | null {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view?.file) return null;
        const start = view.editor.getCursor('from');
        const end = view.editor.getCursor('to');
        return { file: view.file, editor: view.editor, start, end };
    }

    getSelectedItem(): EquationBlock {
        return this.chooser.values![this.chooser.selectedItem];
    }

    getSuggestions(query: string) {
        return this.core.getSuggestions(query);
    }

    renderSuggestion(value: EquationBlock, el: HTMLElement) {
        this.core.renderSuggestion(value, el);
    }

    onChooseSuggestion(item: EquationBlock, evt: MouseEvent | KeyboardEvent) {
        this.core.selectSuggestion(item, evt);
    }
}