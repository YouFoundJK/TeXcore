import {
  App,
  Editor,
  EditorSuggestContext,
  Instruction,
  Scope,
  SearchResult,
  TFile,
  finishRenderMath,
  prepareFuzzySearch,
  prepareSimpleSearch,
  renderMath,
  sortSearchResults
} from 'obsidian';
import { showNotice, getSyncFileContent } from 'utils/obsidian';
import LatexReferencer from 'main';
import { EquationBlock } from 'types';
import { LEAF_OPTION_TO_ARGS } from '../../settings/settings';
import { getModifierNameInPlatform, openFileAndSelectPosition } from 'utils/obsidian';
import { insertBlockIdIfNotExist } from 'utils/plugin';
import { MathSearchModal } from './modal';
import { ActiveNoteEquationProvider } from 'core/equations/provider-equation';
import { parseObsitexConfig } from 'utils/obsitex';
import { processActiveNoteEquations } from 'core/equations/numbering';

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
      void openFileAndSelectPosition(
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
      const localBlocks = this.provider.getEquations(file, content);

      const obsitexConfig = parseObsitexConfig(content);
      const supplements = obsitexConfig.supplements;
      if (!supplements || Object.keys(supplements).length === 0) {
        return localBlocks;
      }

      const suppBlocks: EquationBlock[] = [];
      for (const [suppKey, alias] of Object.entries(supplements)) {
        const suppFile = this.app.metadataCache.getFirstLinkpathDest(suppKey, file.path);
        if (suppFile) {
          const suppContent =
            getSyncFileContent(this.app, suppFile) ?? (await this.app.vault.read(suppFile));

          if (suppContent) {
            const eqMap = processActiveNoteEquations(this.plugin, suppFile, suppContent);
            for (const eq of eqMap.values()) {
              const rawEqNo = eq.$printName ? eq.$printName.replace(/^\((.*)\)$/, '$1') : '';
              const clone: EquationBlock = {
                ...eq,
                $supplementAlias: alias || undefined,
                $isSupplement: true,
                $printName: alias && rawEqNo ? `(${alias}-${rawEqNo})` : eq.$printName
              };
              suppBlocks.push(clone);
            }
          }
        }
      }
      return [...localBlocks, ...suppBlocks];
    }
    return [];
  }

  async getSuggestions(query: string): Promise<EquationBlock[]> {
    const blocks = await this.getUnsortedSuggestions();
    const file = this.app.workspace.getActiveFile();
    const editor = this.parent.getEditor();
    let filterAlias: string | null = null;
    let searchPattern = query.trim();

    if (file && editor) {
      const obsitexConfig = parseObsitexConfig(editor.getValue());
      if (obsitexConfig.supplements) {
        for (const alias of Object.values(obsitexConfig.supplements)) {
          if (!alias) continue;
          const aliasLower = alias.toLowerCase();
          const qLower = searchPattern.toLowerCase();
          if (qLower === aliasLower) {
            filterAlias = alias;
            searchPattern = '';
            break;
          } else if (qLower.startsWith(`${aliasLower} `)) {
            filterAlias = alias;
            searchPattern = searchPattern.substring(alias.length).trim();
            break;
          }
        }
      }
    }

    let candidateBlocks = blocks;
    const targetAlias = filterAlias;
    if (targetAlias) {
      const aliasLower = targetAlias.toLowerCase();
      candidateBlocks = blocks.filter(b => b.$supplementAlias?.toLowerCase() === aliasLower);
      if (!searchPattern) {
        return candidateBlocks;
      }
    }

    const callback = (
      this.plugin.settings.searchMethod === 'Fuzzy' ? prepareFuzzySearch : prepareSimpleSearch
    )(searchPattern);
    const results: ScoredEquationBlock[] = [];

    for (const block of candidateBlocks) {
      const searchText = block.$supplementAlias
        ? `${block.$supplementAlias} ${block.$mathText}`
        : block.$mathText;
      const result = callback(searchText);
      if (result) {
        results.push({ match: result, block });
      }
    }

    sortSearchResults(results);
    return results.map(result => result.block);
  }

  renderSuggestion(block: EquationBlock, el: HTMLElement): void {
    const baseEl = el.createDiv();
    const fileObj = this.app.vault.getAbstractFileByPath(block.$file);
    const fileName = fileObj instanceof TFile ? fileObj.basename : block.$file;
    const descText =
      block.$isSupplement && block.$supplementAlias
        ? `[${block.$supplementAlias}] ${fileName} - Line ${block.$position.start + 1}`
        : `Line ${block.$position.start + 1}`;

    const smallEl = baseEl.createEl('small', {
      text: descText,
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
    void this.selectSuggestionImpl(item);
    void finishRenderMath();
  }

  async selectSuggestionImpl(block: EquationBlock): Promise<void> {
    const context = this.parent.getContext();
    if (!context) return;
    const file = this.app.vault.getAbstractFileByPath(block.$file);
    const cache = this.app.metadataCache.getCache(block.$file);
    if (!(file instanceof TFile) || !cache) return;

    const { editor, start, end } = context;
    const activeFile = this.app.workspace.getActiveFile();
    const isLocal = activeFile && block.$file === activeFile.path;

    const result = await insertBlockIdIfNotExist(this.plugin, file, cache, block);
    if (result) {
      const { id, lineAdded } = result;
      let link: string;
      if (!isLocal && activeFile) {
        const linkpath = this.app.metadataCache.fileToLinktext(file, activeFile.path);
        link = `[[${linkpath}#^${id}]]`;
      } else {
        link = `[[#^${id}]]`;
      }
      const insertText = link + (this.plugin.settings.insertSpace ? ' ' : '');
      const lineOffset = isLocal ? lineAdded : 0;
      editor.replaceRange(
        insertText,
        { line: start.line + lineOffset, ch: start.ch },
        { line: end.line + lineOffset, ch: end.ch }
      );
    } else {
      showNotice(`${this.plugin.manifest.name}: Failed to read cache. Retry again later.`, 5000);
    }
  }
}
