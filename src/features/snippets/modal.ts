import { App, Editor, FuzzyMatch, FuzzySuggestModal, Notice } from 'obsidian';
import {
  BUILTIN_TEXT_TRANSFORM_SNIPPETS,
  runTextTransformSnippet,
  TextTransformSnippet
} from './transforms';

export class TextTransformSuggestModal extends FuzzySuggestModal<TextTransformSnippet> {
  constructor(
    app: App,
    private editor: Editor
  ) {
    super(app);
    this.setPlaceholder('Select a text transform snippet...');
  }

  getItems(): TextTransformSnippet[] {
    return BUILTIN_TEXT_TRANSFORM_SNIPPETS;
  }

  getItemText(item: TextTransformSnippet): string {
    return `${item.name} ${item.keywords.join(' ')}`;
  }

  renderSuggestion(item: FuzzyMatch<TextTransformSnippet>, el: HTMLElement): void {
    el.createEl('div', { text: item.item.name });
    el.createEl('small', { text: item.item.description });
  }

  onChooseItem(item: TextTransformSnippet, evt: MouseEvent | KeyboardEvent): void {
    const result = runTextTransformSnippet(this.editor, item);
    if (result.changedCount > 0) {
      new Notice(`Applied ${item.name} to ${result.changedCount} ${result.appliedOn}(s).`);
      return;
    }
    new Notice(`${item.name} made no changes to the current ${result.appliedOn}.`);
  }
}
