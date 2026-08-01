import { Extension, StateField, EditorState, Annotation, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField, MarkdownView } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import {
  CALLOUT_PREFIX_REGEX,
  findDisplayMathBlocks,
  splitMathIntoTopLevelRows,
  findTopLevelEndEnvMatch,
  TOP_LEVEL_EQ_ENVS
} from 'utils/parse';
import { logDebug } from 'utils/logger';
import { parseEquationId, stripEquationId } from 'utils/equation-id';

/**
 * The in-memory state for the TagManager. It holds only the information
 * necessary to decide if a tag should be added, updated, or removed.
 */
interface EquationInfo {
  from: number;
  to: number;
  id: string;
  printName: string | null; // The calculated number, e.g., "(1)"
  subIndices?: Set<number>; // Add this property
}
type EquationState = readonly EquationInfo[];

/**
 * A utility parser that finds the start and end positions of all $$...$$ math blocks,
 * ignoring any that are inside code blocks. This is a stable dependency.
 */
function findMathBlocks(state: EditorState): readonly { from: number; to: number }[] {
  const text = state.doc.toString();
  const mathBlockRanges = findDisplayMathBlocks(text);

  return mathBlockRanges.filter(mathRange => {
    // Guard against lazy-continuation callout math blocks.
    // When the opening $$ is on a callout line (e.g. "> $$") but the closing
    // $$ is NOT (lazy continuation), the tag manager would corrupt the document
    // by reconstructing the closing with the opening's prefix.
    // Only skip blocks with MISMATCHED prefixes; properly-formed callout
    // equations (where both $$ share the same prefix) are fine.
    const openPos = mathRange.from;
    const openLineStart = text.lastIndexOf('\n', openPos - 1) + 1;
    const openPrefix = text.substring(openLineStart, openPos);

    const closePos = mathRange.to - 2; // position of closing $$
    const closeLineStart = text.lastIndexOf('\n', closePos - 1) + 1;
    const closePrefix = text.substring(closeLineStart, closePos);

    const openCallout = (openPrefix.match(CALLOUT_PREFIX_REGEX) || [''])[0];
    const closeCallout = (closePrefix.match(CALLOUT_PREFIX_REGEX) || [''])[0];
    return openCallout === closeCallout;
  });
}

const mathBlockPositionsField = StateField.define<readonly { from: number; to: number }[]>({
  create(state) {
    return findMathBlocks(state);
  },
  update(value, tr) {
    if (!tr.docChanged) return value;
    return findMathBlocks(tr.state);
  }
});

/**
 * Reads the current document text and metadata, and computes the complete list
 * of managed equations, including their block ID and target tag string.
 */
function parseEquationInfo(state: EditorState, plugin: LatexReferencer): EquationState {
  const text = state.doc.toString();
  const file = state.field(editorInfoField).file;
  if (!file) return [];

  const processedEquations = processActiveNoteEquations(plugin, file, text);
  const mathBlocks = state.field(mathBlockPositionsField);
  const equationInfos: EquationInfo[] = [];

  logDebug(
    'TagManager',
    `parseEquationInfo called for "${file.path}". Found ${mathBlocks.length} math blocks and ${processedEquations.size} processed equations.`
  );

  for (const block of mathBlocks) {
    const blockText = state.doc.sliceString(block.from, block.to);
    let id: string | null = parseEquationId(blockText);
    if (!id) {
      const textAfter = text.substring(block.to, Math.min(text.length, block.to + 100));
      const nextLineMatch = textAfter.match(/^\s*\n\s*\^(eq-[\w.-]+)/);
      if (nextLineMatch) {
        id = nextLineMatch[1];
      }
    }

    if (id) {
      const eq = processedEquations.get(id);
      const printName = eq?.$printName ?? null;
      logDebug(
        'TagManager',
        `Math block [${block.from}-${block.to}] -> ID: "${id}", printName: "${printName}", subIndices:`,
        eq?.$subIndices ? Array.from(eq.$subIndices) : 'none'
      );
      equationInfos.push({
        from: block.from,
        to: block.to,
        id: id,
        printName: printName,
        subIndices: eq?.$subIndices
      });
    } else {
      logDebug(
        'TagManager',
        `Math block [${block.from}-${block.to}] has NO id comment. Snippet: "${blockText.substring(0, 50).replace(/\n/g, ' ')}"`
      );
    }
  }

  return equationInfos;
}

const tagManagerAnnotation = Annotation.define<boolean>();

/**
 * The "Hands". This is the one and only plugin responsible for adding,
 * updating, or removing \tag{...} commands from the editor text.
 */
function createTagManagerPlugin(
  plugin: LatexReferencer,
  equationField: StateField<EquationState>
): ViewPlugin<object> {
  return ViewPlugin.fromClass(
    class {
      timeout: number | null = null;
      blockedBySelection = false;

      constructor(view: EditorView) {
        logDebug('TagManager', 'ViewPlugin created for view.');
        this.scheduleCheck(view);
      }
      destroy() {
        if (this.timeout) window.clearTimeout(this.timeout);
      }
      update(update: ViewUpdate) {
        const hasTagAnno = update.transactions.some(tr => tr.annotation(tagManagerAnnotation));
        if (!hasTagAnno) {
          if (update.docChanged) {
            logDebug('TagManager', 'ViewUpdate: docChanged. Scheduling check.');
            this.scheduleCheck(update.view);
          }
        }

        if (update.selectionSet && this.blockedBySelection) {
          logDebug(
            'TagManager',
            'ViewUpdate: selectionSet while blockedBySelection=true. Scheduling check.'
          );
          this.scheduleCheck(update.view);
        }
      }
      scheduleCheck(view: EditorView) {
        if (this.timeout) window.clearTimeout(this.timeout);
        this.timeout = window.setTimeout(() => this.runCheck(view), 600);
      }

      runCheck(view: EditorView) {
        const hasFocus = view.hasFocus;
        const docFocus = view.dom.ownerDocument?.hasFocus?.();
        logDebug(
          'TagManager',
          `runCheck starting. view.hasFocus=${hasFocus}, docHasFocus=${docFocus}`
        );

        if (hasFocus === false && docFocus) {
          logDebug(
            'TagManager',
            'runCheck skipped: view.hasFocus is false while document has focus.'
          );
          return;
        }

        // Safety Guard: Skip TagManager operations if user is focused inside an Obsidian native table widget
        const activeEl = view.dom.ownerDocument?.activeElement as HTMLElement | null;
        if (activeEl && activeEl.closest('.cm-table-widget, .obsidian-table, table, td, th')) {
          logDebug(
            'TagManager',
            'runCheck skipped: User is currently focused/editing inside an Obsidian native table cell.'
          );
          return;
        }

        const equationInfos = view.state.field(equationField);
        if (!equationInfos || equationInfos.length === 0) {
          logDebug('TagManager', 'runCheck: no managed equationInfos in field.');
          return;
        }

        logDebug('TagManager', `runCheck evaluating ${equationInfos.length} managed equation(s).`);

        const changes: { from: number; to: number; insert: string }[] = [];
        const selection = view.state.selection;
        let blockedChanges = 0;

        const file = view.state.field(editorInfoField, false)?.file;
        const activeSelections = [selection];

        if (file && plugin.app?.workspace) {
          const allLeaves = plugin.app.workspace.getLeavesOfType('markdown');
          for (const leaf of allLeaves) {
            const mdView = leaf.view as MarkdownView;
            if (mdView && mdView.file?.path === file.path && mdView.editor) {
              const cm = (mdView.editor as unknown as { cm?: EditorView }).cm;
              if (cm && cm !== view && cm.state?.selection) {
                activeSelections.push(cm.state.selection);
              }
            }
          }
        }

        for (const info of equationInfos) {
          if (info.from < 0 || info.to > view.state.doc.length || info.from >= info.to) {
            logDebug(
              'TagManager',
              `Safety bounds skip for ${info.id}: [${info.from}-${info.to}], doc length ${view.state.doc.length}`
            );
            continue;
          }

          // Table Row Exemption: Do not alter raw document text inside single-line Markdown table rows
          const lineText = view.state.doc.lineAt(info.from).text;
          if (lineText.includes('|')) {
            logDebug(
              'TagManager',
              `Skipped tag document edit for ${info.id}: math block is inside a Markdown table row.`
            );
            continue;
          }

          const isNearOrInside = activeSelections.some(sel =>
            sel.ranges.some(r => r.from <= info.to + 20 && r.to >= info.from - 20)
          );
          if (isNearOrInside) {
            blockedChanges++;
            logDebug(
              'TagManager',
              `Blocked tag check for ${info.id}: cursor selection near/inside block [${info.from}-${info.to}]`
            );
            continue;
          }

          const startPos = info.from + 2;
          const endPos = info.to - 2;
          if (startPos >= endPos) continue;

          const blockContent = view.state.doc.sliceString(startPos, endPos);
          const mathText = stripEquationId(blockContent);

          const beginEnvMatches = mathText.match(/\\begin\{\s*([a-zA-Z*]+)\s*\}/g);
          if (beginEnvMatches) {
            let unclosedTopLevelEnv: string | null = null;
            for (const m of beginEnvMatches) {
              const envName = m.match(/\\begin\{\s*([a-zA-Z*]+)\s*\}/)?.[1];
              if (envName && TOP_LEVEL_EQ_ENVS.has(envName)) {
                const endEnvMatch = findTopLevelEndEnvMatch(mathText);
                if (!endEnvMatch) {
                  unclosedTopLevelEnv = envName;
                  break;
                }
              }
            }
            if (unclosedTopLevelEnv) {
              logDebug(
                'TagManager',
                `Skipped tag update for ${info.id}: unclosed environment \\begin{${unclosedTopLevelEnv}}`
              );
              continue;
            }
          }

          // Mode 1: Sub-equations
          if (info.subIndices && info.subIndices.size > 0 && info.printName) {
            const baseName = info.printName.slice(1, -1);
            const parts = splitMathIntoTopLevelRows(mathText);
            let needsUpdate = false;
            const newParts = [...parts];

            for (let i = 0; i < parts.length; i += 2) {
              const row = parts[i];
              const cleanedRow = row.replace(/^[ \t]+/, '');
              if (cleanedRow.trim() === '') continue;
              const subIndex = i / 2 + 1;
              const expectedTag = `\\tag{${baseName}.${subIndex}}`;

              if (!cleanedRow.includes(expectedTag)) {
                needsUpdate = true;
                const stripped = cleanedRow.replace(/\\tag\{((?:[^{}]|\{[^{}]*\})+)\}/g, '');
                const endEnvMatch = findTopLevelEndEnvMatch(stripped);
                if (endEnvMatch && endEnvMatch.index !== undefined) {
                  const before = stripped.substring(0, endEnvMatch.index).trimEnd();
                  const environment = endEnvMatch.matchText;
                  const after = stripped.substring(endEnvMatch.index + environment.length);
                  newParts[i] = `${before} ${expectedTag} ${environment}${after}`;
                } else {
                  newParts[i] = `${stripped.trimEnd()} ${expectedTag}`;
                }
              }
            }

            if (needsUpdate) {
              const newMathText = newParts.join('');
              logDebug(
                'TagManager',
                `Mode 1: Updating sub-equation tags for ${info.id} to ${baseName}.*`
              );
              changes.push({
                from: startPos,
                to: startPos + mathText.length,
                insert: newMathText
              });
            } else {
              logDebug(
                'TagManager',
                `Mode 1: Sub-equation tags for ${info.id} already match ${baseName}.*`
              );
            }
            continue;
          }

          // Mode 2: Normal equations
          const requiredTagContent = info.printName ? info.printName.slice(1, -1) : null;
          const existingTagMatch = mathText.match(/\\tag\{((?:[^{}]|\{[^{}]*\})+)\}/);

          logDebug(
            'TagManager',
            `Mode 2 checking ${info.id}: printName="${info.printName}", requiredTag="${requiredTagContent}", existingTag="${existingTagMatch ? existingTagMatch[1] : 'NONE'}"`
          );

          if (!requiredTagContent) {
            logDebug('TagManager', `Mode 2 skip for ${info.id}: requiredTagContent is null`);
            continue;
          }

          const expectedTagStr = `\\tag{${requiredTagContent}}`;

          if (blockContent.includes(expectedTagStr)) {
            logDebug(
              'TagManager',
              `Mode 2 OK for ${info.id}: blockContent already contains "${expectedTagStr}"`
            );
            continue;
          }

          if (existingTagMatch && existingTagMatch.index !== undefined) {
            if (existingTagMatch[1] === requiredTagContent) {
              logDebug(
                'TagManager',
                `Mode 2 OK for ${info.id}: tag content "${existingTagMatch[1]}" already equals required "${requiredTagContent}"`
              );
              continue;
            }
            logDebug(
              'TagManager',
              `Mode 2 REPLACE for ${info.id}: changing "${existingTagMatch[0]}" -> "${expectedTagStr}"`
            );
            const tagStart = startPos + existingTagMatch.index;
            const tagEnd = tagStart + existingTagMatch[0].length;
            changes.push({ from: tagStart, to: tagEnd, insert: expectedTagStr });
            continue;
          }

          // No tag exists - insert expectedTagStr right BEFORE endEnv or at math end
          const isMultiLineBlock = view.state.doc.sliceString(info.from, info.to).includes('\n');
          const endEnvMatch = findTopLevelEndEnvMatch(mathText);
          if (endEnvMatch && endEnvMatch.index !== undefined) {
            const insertPos = startPos + endEnvMatch.index;
            const beforeChar = view.state.doc.sliceString(insertPos - 1, insertPos);
            const pad = /\s/.test(beforeChar) ? '' : ' ';
            const tagInsert = isMultiLineBlock ? `${pad}${expectedTagStr}\n` : `${pad}${expectedTagStr} `;
            logDebug(
              'TagManager',
              `Mode 2 INSERT for ${info.id}: inserting "${expectedTagStr}" BEFORE \\end at doc pos ${insertPos}`
            );
            changes.push({ from: insertPos, to: insertPos, insert: tagInsert });
            continue;
          }

          let insertPos = startPos + mathText.length;
          while (
            insertPos > startPos &&
            /\s/.test(view.state.doc.sliceString(insertPos - 1, insertPos))
          ) {
            insertPos--;
          }
          logDebug(
            'TagManager',
            `Mode 2 INSERT for ${info.id}: inserting "${expectedTagStr}" at math end`
          );
          changes.push({ from: insertPos, to: insertPos, insert: ` ${expectedTagStr}` });
        }

        this.blockedBySelection = blockedChanges > 0;
        logDebug(
          'TagManager',
          `runCheck summary: ${changes.length} change(s) prepared, ${blockedChanges} block(s) selection-blocked.`
        );

        if (changes.length > 0) {
          logDebug('TagManager', `Dispatching ${changes.length} tag change(s) to view:`, changes);
          view.dispatch({
            changes,
            annotations: [tagManagerAnnotation.of(true), Transaction.addToHistory.of(false)]
          });
        }
      }
    }
  );
}

let equationField: StateField<EquationState> | null = null;
let activePlugin: LatexReferencer | null = null;

function getEquationField(): StateField<EquationState> {
  if (!equationField) {
    equationField = StateField.define<EquationState>({
      create(state) {
        if (!activePlugin) return [];
        return parseEquationInfo(state, activePlugin);
      },
      update(value, tr) {
        if (!activePlugin) return [];
        if (!tr.docChanged) return value;
        return parseEquationInfo(tr.state, activePlugin);
      }
    });
  }
  return equationField;
}

/** The main export that bundles all required editor extensions. */
export function createEquationNumberPlugin(plugin: LatexReferencer): Extension {
  activePlugin = plugin;
  const eqField = getEquationField();
  return [mathBlockPositionsField, eqField, createTagManagerPlugin(plugin, eqField)];
}
