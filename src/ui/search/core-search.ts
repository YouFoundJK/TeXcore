import {
  App,
  Editor,
  EditorSuggestContext,
  Instruction,
  Notice,
  Scope,
  SearchResult,
  TFile,
  finishRenderMath,
  prepareFuzzySearch,
  prepareSimpleSearch,
  renderMath,
  sortSearchResults
} from 'obsidian';
import LatexReferencer from 'main';
import { EquationBlock } from 'types';
import { LEAF_OPTION_TO_ARGS } from '../../settings/settings';
import { getModifierNameInPlatform, openFileAndSelectPosition } from 'utils/obsidian';
import { insertBlockIdIfNotExist } from 'utils/plugin';
import { MathSearchModal } from './modal';
import { ActiveNoteEquationProvider } from 'core/equations/provider-equation';

export type ScoredEquationBlock = { match: SearchResult; block: EquationBlock };

export interface SuggestParent {
  app: App;
  plugin: LatexReferencer;
  scope: Scope;
  getContext(): Omit<EditorSuggestContext, 'query'> | null;
  setInstructions(instructions: Instruction[]): void;
  getSelectedItem(): EquationBlock;
  getEditor(): Editor;
}

export class ActiveNoteSearchCore {
  app: App;
  plugin: LatexReferencer;
  scope: Scope;
  provider: ActiveNoteEquationProvider;

  constructor(public parent: SuggestParent) {
    this.plugin = parent.plugin;
    this.app = this.plugin.app;
    this.scope = parent.scope;
    this.provider = new ActiveNoteEquationProvider(this.app);
  }

  setScope() {
    this.scope.register([this.plugin.settings.modifierToJump], 'Enter', () => {
      const item = this.parent.getSelectedItem();
      const file = this.app.vault.getAbstractFileByPath(item.$file);
      if (!(file instanceof TFile)) return;
      openFileAndSelectPosition(
        this.app,
        file,
        item.$pos,
        ...LEAF_OPTION_TO_ARGS[this.plugin.settings.suggestLeafOption]
      );
      if (this.parent instanceof MathSearchModal) this.parent.close();
      return false;
    });

    if (this.plugin.settings.showModifierInstruction) {
      this.parent.setInstructions([
        { command: '↑↓', purpose: 'to navigate' },
        { command: '↵', purpose: 'to insert link' },
        {
          command: `${getModifierNameInPlatform(this.plugin.settings.modifierToJump)} + ↵`,
          purpose: 'to jump'
        }
      ]);
    }
  }

  async getUnsortedSuggestions(): Promise<EquationBlock[]> {
    const file = this.app.workspace.getActiveFile();
    const editor = this.parent.getEditor();
    if (file && editor) {
      const content = editor.getValue();
      return this.provider.getEquations(file, content);
    }
    return [];
  }

  async getSuggestions(query: string): Promise<EquationBlock[]> {
    const blocks = await this.getUnsortedSuggestions();
    const callback = (
      this.plugin.settings.searchMethod == 'Fuzzy' ? prepareFuzzySearch : prepareSimpleSearch
    )(query);
    const results: ScoredEquationBlock[] = [];

    for (const block of blocks) {
      const result = callback(block.$mathText);
      if (result) {
        results.push({ match: result, block });
      }
    }

    sortSearchResults(results);
    return results.map(result => result.block);
  }

  renderSuggestion(block: EquationBlock, el: HTMLElement): void {
    const baseEl = el.createDiv();
    const smallEl = baseEl.createEl('small', {
      text: `Line ${block.$position.start + 1}`,
      cls: 'math-booster-search-item-description'
    });
    if (this.plugin.settings.renderMathInSuggestion) {
      const mjxContainerEl = renderMath(block.$mathText, true);
      baseEl.insertBefore(mjxContainerEl, smallEl);
    } else {
      const mathTextEl = createDiv({ text: block.$mathText });
      baseEl.insertBefore(mathTextEl, smallEl);
    }
  }

  selectSuggestion(item: EquationBlock, evt: MouseEvent | KeyboardEvent): void {
    this.selectSuggestionImpl(item);
    finishRenderMath();
  }

  async selectSuggestionImpl(block: EquationBlock): Promise<void> {
    const context = this.parent.getContext();
    if (!context) return;
    const file = this.app.vault.getAbstractFileByPath(block.$file);
    const cache = this.app.metadataCache.getCache(block.$file);
    if (!(file instanceof TFile) || !cache) return;

    const { editor, start, end } = context;
    const result = await insertBlockIdIfNotExist(this.plugin, file, cache, block);
    if (result) {
      const { id, lineAdded } = result;
      const link = `[[#^${id}]]`;
      const insertText = link + (this.plugin.settings.insertSpace ? ' ' : '');
      editor.replaceRange(
        insertText,
        { line: start.line + lineAdded, ch: start.ch },
        { line: end.line + lineAdded, ch: end.ch }
      );
    } else {
      new Notice(`${this.plugin.manifest.name}: Failed to read cache. Retry again later.`, 5000);
    }
  }
}
