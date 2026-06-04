import { App, FuzzyMatch, FuzzySuggestModal, TFile } from 'obsidian';

export class NoteSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private onSelect: (file: TFile) => void
  ) {
    super(app);
    this.setPlaceholder('Search note path...');
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(item: TFile): string {
    return item.path;
  }

  renderSuggestion(item: FuzzyMatch<TFile>, el: HTMLElement): void {
    el.createEl('div', { text: item.item.basename });
    el.createEl('small', { text: item.item.path, attr: { style: 'color: var(--text-muted);' } });
  }

  onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item);
  }
}
