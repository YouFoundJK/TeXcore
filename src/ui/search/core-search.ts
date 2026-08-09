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
import { showNotice, getSyncFileContent, generateEqId } from 'utils/obsidian';
import LatexReferencer from 'main';
import { EquationBlock } from 'types';
import { LEAF_OPTION_TO_ARGS } from '../../settings/settings';
import { getModifierNameInPlatform, openFileAndSelectPosition } from 'utils/obsidian';
import { insertBlockIdIfNotExist } from 'utils/plugin';
import { MathSearchModal } from './modal';
import { ActiveNoteEquationProvider } from 'core/equations/provider-equation';
import { parseObsitexConfig } from 'utils/obsitex';
import { processActiveNoteEquations } from 'core/equations/numbering';
import { EditorView } from '@codemirror/view';
import {
  cleanMathTextForRendering,
  formatEquationIdLine,
  findExactMathBlock
} from 'utils/equation-id';
import { getCalloutPrefix, isStructuralCalloutLine, findTopLevelEndEnvMatch } from 'utils/parse';
import { logDebug, logWarn } from 'utils/logger';

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
      const cleaned = cleanMathTextForRendering(block.$mathText);
      const mjxContainerEl = renderMath(cleaned, true);
      baseEl.insertBefore(mjxContainerEl, smallEl);
    } else {
      const cleaned = cleanMathTextForRendering(block.$mathText);
      const mathTextEl = createDiv({ text: cleaned });
      baseEl.insertBefore(mathTextEl, smallEl);
    }
  }

  selectSuggestion(item: EquationBlock, evt: MouseEvent | KeyboardEvent): void {
    void this.selectSuggestionImpl(item);
    void finishRenderMath();
  }

  async selectSuggestionImpl(block: EquationBlock): Promise<void> {
    logDebug(
      'SearchCore',
      `selectSuggestionImpl initiated for block. ID: "${block.$blockId ?? 'NONE'}", file: "${block.$file}"`
    );

    const context = this.parent.getContext();
    if (!context) {
      logWarn('SearchCore', 'selectSuggestionImpl skipped: context is null');
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(block.$file);
    const cache = this.app.metadataCache.getCache(block.$file);
    if (!(file instanceof TFile) || !cache) {
      logWarn('SearchCore', 'selectSuggestionImpl skipped: file or cache not found');
      return;
    }

    const { editor, start, end } = context;
    const activeFile = this.app.workspace.getActiveFile();
    const isLocal = activeFile && block.$file === activeFile.path;

    if (isLocal) {
      const cm = (editor as unknown as { cm?: EditorView }).cm;
      if (cm) {
        logDebug(
          'SearchCore',
          'Local active note: Attempting to insert ID and link in a single transaction.'
        );
        const currentText = cm.state.doc.toString();
        let id = block.$blockId;
        const changes: { from: number; to: number; insert: string }[] = [];

        if (!id) {
          const approxLine = block.$pos?.start?.line ?? 0;
          logDebug(
            'SearchCore',
            `Looking for exact math block matching "${block.$mathText}" around line ${approxLine}`
          );
          const match = findExactMathBlock(currentText, block.$mathText, approxLine);

          if (match) {
            const { startOffset, endOffset } = match;
            const originalText = currentText.substring(startOffset, endOffset);
            logDebug(
              'SearchCore',
              `Found matching math block at offsets [${startOffset}-${endOffset}]. Content: "${originalText.replace(/\n/g, '\\n')}"`
            );

            const obsitexConfig = parseObsitexConfig(currentText, startOffset);
            id = generateEqId(obsitexConfig.eqPrefix);
            const prefix = getCalloutPrefix(originalText);
            const idLine = formatEquationIdLine(id, prefix);

            const endEnvMatch = findTopLevelEndEnvMatch(originalText);
            let newText: string;
            if (endEnvMatch && endEnvMatch.index !== undefined) {
              const envPos = endEnvMatch.index;
              const preText = originalText.slice(0, envPos);
              const needsNewline = preText.length > 0 && !preText.endsWith('\n');
              const postText = originalText.slice(envPos);
              newText = preText + (needsNewline ? '\n' : '') + idLine + postText;
            } else {
              const insertOffsetInBlock = originalText.lastIndexOf('$$');
              if (insertOffsetInBlock !== -1) {
                let startSlice = insertOffsetInBlock;
                if (prefix) {
                  const lastNewline = originalText.lastIndexOf('\n', insertOffsetInBlock - 1);
                  const currentClosingPrefix =
                    lastNewline === -1
                      ? originalText.slice(0, insertOffsetInBlock)
                      : originalText.slice(lastNewline + 1, insertOffsetInBlock);

                  if (
                    currentClosingPrefix.trim() !== '' &&
                    isStructuralCalloutLine(currentClosingPrefix)
                  ) {
                    startSlice = lastNewline === -1 ? 0 : lastNewline + 1;
                  }
                }

                const preText = originalText.slice(0, startSlice);
                const needsNewline = preText.length > 0 && !preText.endsWith('\n');
                const closingTag = `${prefix}$$`;
                const suffix = originalText.slice(insertOffsetInBlock + 2);
                newText = preText + (needsNewline ? '\n' : '') + idLine + closingTag + suffix;
              } else {
                newText = originalText;
              }
            }

            changes.push({
              from: startOffset,
              to: endOffset,
              insert: newText
            });
            logDebug(
              'SearchCore',
              `Prepared math block ID insertion for ID="${id}" at offset [${startOffset}-${endOffset}].`
            );
          } else {
            // Fallback if match fails: generate standard ID
            id = generateEqId();
            logWarn(
              'SearchCore',
              `Could not find exact math block in current text. Falling back to generated ID: ${id}`
            );
          }
        }

        const triggerStartOffset = cm.state.doc.line(start.line + 1).from + start.ch;
        const triggerEndOffset = cm.state.doc.line(end.line + 1).from + end.ch;
        const link = `[[#^${id}]]`;
        const insertText = link + (this.plugin.settings.insertSpace ? ' ' : '');

        changes.push({
          from: triggerStartOffset,
          to: triggerEndOffset,
          insert: insertText
        });
        logDebug(
          'SearchCore',
          `Prepared reference link insertion for "${insertText}" at offset [${triggerStartOffset}-${triggerEndOffset}].`
        );

        // Sort changes by `from` offset (ascending) to satisfy CodeMirror
        changes.sort((a, b) => a.from - b.from);

        // Dispatch all changes in a single transaction
        cm.dispatch({
          changes,
          userEvent: 'input.complete'
        });
        logDebug('SearchCore', `Dispatched CodeMirror transaction with ${changes.length} changes.`);
        return;
      }
    }

    // Fallback path (non-local file or EditorView not found)
    logDebug('SearchCore', `Executing fallback path. isLocal=${isLocal}`);
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
      logDebug('SearchCore', `Fallback replacement done. Inserted "${insertText}"`);
    } else {
      showNotice(`${this.plugin.manifest.name}: Failed to read cache. Retry again later.`, 5000);
      logWarn('SearchCore', 'Fallback block ID insertion failed.');
    }
  }
}
