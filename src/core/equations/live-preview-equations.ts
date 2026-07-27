import { Extension, StateField, EditorState, Annotation, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField, MarkdownView } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import {
  CALLOUT_PREFIX_REGEX,
  findDisplayMathBlocks,
  splitMathIntoTopLevelRows,
  findTopLevelEndEnvMatch
} from 'utils/parse';

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
 * The "Brain". This function scans the document for references and calculates
 * the correct number for each managed equation.
 */
function parseEquationInfo(state: EditorState, plugin: LatexReferencer): EquationState {
  const text = state.doc.toString();
  const file = state.field(editorInfoField).file;
  if (!file) return [];

  const processedEquations = processActiveNoteEquations(plugin, file, text);
  const mathBlocks = state.field(mathBlockPositionsField);
  const equationInfos: EquationInfo[] = [];

  for (const block of mathBlocks) {
    const blockText = state.doc.sliceString(block.from, block.to);
    const idMatch = blockText.match(/% id: (eq-[\w.-]+)/);
    if (idMatch) {
      const id = idMatch[1];
      const eq = processedEquations.get(id);
      equationInfos.push({
        from: block.from,
        to: block.to,
        id: id,
        printName: eq?.$printName ?? null,
        subIndices: eq?.$subIndices
      });
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
        this.scheduleCheck(view);
      }
      update(update: ViewUpdate) {
        if (!update.transactions.some(tr => tr.annotation(tagManagerAnnotation))) {
          if (update.docChanged) {
            this.scheduleCheck(update.view);
          }
        }

        // If a previous run detected pending edits but skipped due to active selection
        // inside an equation block, retry once the selection changes.
        if (update.selectionSet && this.blockedBySelection) {
          this.scheduleCheck(update.view);
        }
      }
      scheduleCheck(view: EditorView) {
        if (this.timeout) window.clearTimeout(this.timeout);
        this.timeout = window.setTimeout(() => this.runCheck(view), 300);
      }

      // equations/live-preview.ts (inside ViewPlugin.fromClass)

      runCheck(view: EditorView) {
        if (view.hasFocus === false && view.dom.ownerDocument?.hasFocus?.()) return;

        const equationInfos = view.state.field(equationField);
        if (!equationInfos || equationInfos.length === 0) return;

        const changes: { from: number; to: number; insert: string }[] = [];
        const selection = view.state.selection;
        let blockedChanges = 0;

        // Multi-Window Guard 2: Gather selections from all split-screen leaves open for this note.
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
          // Safety bounds check
          if (info.from < 0 || info.to > view.state.doc.length || info.from >= info.to) {
            continue;
          }

          // Strict selection check across ALL split views open for this file
          const isNearOrInside = activeSelections.some(sel =>
            sel.ranges.some(r => r.from <= info.to + 20 && r.to >= info.from - 20)
          );
          if (isNearOrInside) {
            blockedChanges++;
            continue;
          }

          const startPos = info.from + 2;
          const endPos = info.to - 2;
          if (startPos >= endPos) continue;

          const blockContent = view.state.doc.sliceString(startPos, endPos);
          const idCommentMatch = blockContent.match(/\s*% id: eq-[\w.-]+/);
          const idIndex = idCommentMatch ? (idCommentMatch.index ?? -1) : -1;
          const mathText = idIndex !== -1 ? blockContent.substring(0, idIndex) : blockContent;

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
                const stripped = cleanedRow.replace(/\\tag\{[^{}]+\}/g, '');
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
              changes.push({
                from: startPos,
                to: startPos + mathText.length,
                insert: newMathText
              });
            }
            continue;
          }

          // Mode 2: Normal equations
          const requiredTagContent = info.printName ? info.printName.slice(1, -1) : null;
          const existingTagMatch = mathText.match(/\\tag\{([^{}]+)\}/);

          if (!requiredTagContent) {
            if (existingTagMatch && existingTagMatch.index !== undefined) {
              const tagStart = startPos + existingTagMatch.index;
              const tagEnd = tagStart + existingTagMatch[0].length;
              changes.push({ from: tagStart, to: tagEnd, insert: '' });
            }
            continue;
          }

          const expectedTagStr = `\\tag{${requiredTagContent}}`;

          if (existingTagMatch && existingTagMatch.index !== undefined) {
            if (existingTagMatch[1] === requiredTagContent) {
              // Tag already matches - DO NOTHING
              continue;
            }
            // Replace ONLY the tag string
            const tagStart = startPos + existingTagMatch.index;
            const tagEnd = tagStart + existingTagMatch[0].length;
            changes.push({ from: tagStart, to: tagEnd, insert: expectedTagStr });
            continue;
          }

          // No tag exists - insert expectedTagStr right before endEnv or before % id: / end of mathText
          const endEnvMatch = findTopLevelEndEnvMatch(mathText);
          if (endEnvMatch && endEnvMatch.index !== undefined) {
            const insertPos = startPos + endEnvMatch.index;
            changes.push({ from: insertPos, to: insertPos, insert: ` ${expectedTagStr} ` });
            continue;
          }

          let insertPos = startPos + mathText.length;
          while (
            insertPos > startPos &&
            /\s/.test(view.state.doc.sliceString(insertPos - 1, insertPos))
          ) {
            insertPos--;
          }
          changes.push({ from: insertPos, to: insertPos, insert: ` ${expectedTagStr}` });
        }

        this.blockedBySelection = blockedChanges > 0;

        if (changes.length > 0) {
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
