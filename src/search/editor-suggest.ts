import { Editor, EditorPosition, EditorSuggest, EditorSuggestContext, EditorSuggestTriggerInfo } from "obsidian";
import LatexReferencer from "main";
import { MathBlock } from "index/typings/markdown";
import { ActiveNoteSearchCore, SuggestParent } from "./core";

export class LinkAutocomplete extends EditorSuggest<MathBlock> implements SuggestParent {
    core: ActiveNoteSearchCore;

    constructor(public plugin: LatexReferencer) {
        super(plugin.app);
        this.core = new ActiveNoteSearchCore(this);
    }

    getEditor(): Editor {
        // This is a bit of a hack to get the editor object within the suggest context
        if (this.context) {
            return this.context.editor;
        }
        throw new Error("Editor context not available.");
    }

    getContext() {
        return this.context;
    }

    getSelectedItem() {
        return this.suggestions.values[this.suggestions.selectedItem];
    }

    onTrigger(cursor: EditorPosition, editor: Editor): EditorSuggestTriggerInfo | null {
        const trigger = this.plugin.extraSettings.triggerEquationSuggest;
        const line = editor.getLine(cursor.line).slice(0, cursor.ch);
        const triggerIndex = line.lastIndexOf(trigger);

        if (triggerIndex === -1) {
            return null;
        }

        const query = line.slice(triggerIndex + trigger.length);

        this.limit = this.plugin.extraSettings.suggestNumber;

        return {
            start: { line: cursor.line, ch: triggerIndex },
            end: cursor,
            query: query,
        };
    }

    getSuggestions(context: EditorSuggestContext): Promise<MathBlock[]> {
        return this.core.getSuggestions(context.query);
    }

    renderSuggestion(block: MathBlock, el: HTMLElement): void {
        this.core.renderSuggestion(block, el);
    }

    selectSuggestion(item: MathBlock, evt: MouseEvent | KeyboardEvent): void {
        this.core.selectSuggestion(item, evt);
    }
}