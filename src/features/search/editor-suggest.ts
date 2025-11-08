import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo } from "obsidian";
import LatexReferencer from "main";
import { EquationBlock } from "types";
import { ActiveNoteSearchCore, SuggestParent } from "./core-search";

export class LinkAutocomplete extends EditorSuggest<EquationBlock> implements SuggestParent {
    core: ActiveNoteSearchCore;

    constructor(public plugin: LatexReferencer) {
        super(plugin.app);
        this.core = new ActiveNoteSearchCore(this);
    }

    getEditor(): Editor {
        if (this.context) return this.context.editor;
        throw new Error("Editor context not available.");
    }

    getContext() { return this.context; }
    getSelectedItem() { return this.suggestions.values[this.suggestions.selectedItem]; }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        if (!this.plugin.settings.enableSuggest) return null;
        const trigger = this.plugin.settings.triggerSuggest;
        const line = editor.getLine(cursor.line).slice(0, cursor.ch);
        const triggerIndex = line.lastIndexOf(trigger);
        if (triggerIndex === -1) return null;
        const query = line.slice(triggerIndex + trigger.length);
        if (query.startsWith('[[')) return null;
        this.limit = this.plugin.settings.suggestNumber;
        return { start: { line: cursor.line, ch: triggerIndex }, end: cursor, query: query };
    }

    getSuggestions(context: EditorSuggestContext): Promise<EquationBlock[]> {
        return this.core.getSuggestions(context.query);
    }

    renderSuggestion(block: EquationBlock, el: HTMLElement): void {
        this.core.renderSuggestion(block, el);
    }

    selectSuggestion(item: EquationBlock, evt: MouseEvent | KeyboardEvent): void {
        this.core.selectSuggestion(item, evt);
    }
}