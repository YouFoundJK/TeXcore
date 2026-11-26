import { Extension, StateField, EditorState, Annotation, Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField, MarkdownView } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import { extractEquationId, findDisplayMathBlocks, getCalloutPrefix } from 'utils/parse';
import { computeSafeTagUpdate } from './tag-updater';
import { logDebug } from 'utils/logger';

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

    const openCallout = getCalloutPrefix(openPrefix);
    const closeCallout = getCalloutPrefix(closePrefix);
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

  const mathBlocks = state.field(mathBlockPositionsField);
  const processedEquations = processActiveNoteEquations(plugin, file, text, undefined, mathBlocks);
  const equationInfos: EquationInfo[] = [];
  const seenIds = new Set<string>();

  logDebug(
    'TagManager',
    `parseEquationInfo called for "${file.path}". Found ${mathBlocks.length} math blocks and ${processedEquations.size} processed equations.`
  );

  for (const block of mathBlocks) {
    const blockText = state.doc.sliceString(block.from, block.to);
    const trailingAfter = text.slice(block.to, Math.min(text.length, block.to + 120));
    const id = extractEquationId(blockText, trailingAfter, false);

    if (id && !seenIds.has(id)) {
      seenIds.add(id);
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
    } else if (!id) {
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
      pendingCheckOnFocus = false;

      constructor(view: EditorView) {
        logDebug('TagManager', 'ViewPlugin created for view.');
        this.scheduleCheck(view);
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

        if (update.focusChanged && update.view.hasFocus && this.pendingCheckOnFocus) {
          this.pendingCheckOnFocus = false;
          logDebug('TagManager', 'ViewUpdate: view regained focus. Scheduling pending check.');
          this.scheduleCheck(update.view);
        }
      }
      scheduleCheck(view: EditorView) {
        if (this.timeout) window.clearTimeout(this.timeout);
        this.timeout = window.setTimeout(() => this.runCheck(view), 600);
      }

      runCheck(view: EditorView) {
        if (view.dom && !view.dom.isConnected) {
          logDebug('TagManager', 'runCheck skipped: view is detached from DOM.');
          return;
        }

        if (!view.hasFocus) {
          this.pendingCheckOnFocus = true;
          logDebug('TagManager', 'runCheck skipped: view does not have focus.');
          return;
        }
        this.pendingCheckOnFocus = false;

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
          if (info.from < 0 || info.to > view.state.doc.length || info.from + 4 > info.to) {
            logDebug(
              'TagManager',
              `Safety bounds skip for ${info.id}: [${info.from}-${info.to}], doc length ${view.state.doc.length}`
            );
            continue;
          }

          if (
            view.state.doc.sliceString(info.from, info.from + 2) !== '$$' ||
            view.state.doc.sliceString(info.to - 2, info.to) !== '$$'
          ) {
            logDebug(
              'TagManager',
              `Delimiter mismatch skip for ${info.id}: [${info.from}-${info.to}]`
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

          const updatedBlockContent = computeSafeTagUpdate(blockContent, {
            printName: info.printName,
            subIndices: info.subIndices
          });

          if (updatedBlockContent !== null) {
            logDebug('TagManager', `Updating tags for ${info.id} (${info.printName})`);
            changes.push({
              from: startPos,
              to: endPos,
              insert: updatedBlockContent
            });
          }
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

      destroy() {
        if (this.timeout) {
          window.clearTimeout(this.timeout);
          this.timeout = null;
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

export function resetEquationPluginState(): void {
  activePlugin = null;
}
