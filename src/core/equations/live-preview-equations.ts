import { Extension, StateField, EditorState, Annotation } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import LatexReferencer from 'main';
import { CONVERTER } from 'utils/format';
import { parsePositionalObsitexConfigs } from 'utils/obsitex';
import {
  CALLOUT_PREFIX_REGEX,
  getCalloutPrefix,
  isStructuralCalloutLine,
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
  const settings = plugin.settings;
  const file = state.field(editorInfoField).file;
  if (!file) return [];

  // 1. Scan for all references, including sub-equation links
  const referenceMap = new Map<string, { totalCount: number; subIndices: Set<number> }>();
  const linkRegex = /\[\[#\^eq-[\w.-]+\]\]/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    const linkText = match[0].slice(4, -2); // eq-id or eq-id-2
    const subIndexMatch = linkText.match(/-(\d+)$/);
    let baseId = linkText;
    let subIndexStr: string | undefined = undefined;

    if (subIndexMatch) {
      subIndexStr = subIndexMatch[1];
      baseId = linkText.substring(0, subIndexMatch.index);
    }

    if (!referenceMap.has(baseId)) {
      referenceMap.set(baseId, { totalCount: 0, subIndices: new Set() });
    }
    const refInfo = referenceMap.get(baseId);
    if (!refInfo) continue;
    refInfo.totalCount++;
    if (subIndexStr) {
      const subIndex = parseInt(subIndexStr);
      if (!isNaN(subIndex)) {
        refInfo.subIndices.add(subIndex);
      }
    }
  }

  const mathBlocks = state.field(mathBlockPositionsField);
  const equationInfos: (EquationInfo & { refCount: number })[] = [];
  for (const block of mathBlocks) {
    const blockText = state.doc.sliceString(block.from, block.to);
    const idMatch = blockText.match(/% id: (eq-[\w.-]+)/);
    if (idMatch) {
      const id = idMatch[1];
      const refInfo = referenceMap.get(id);
      equationInfos.push({
        from: block.from,
        to: block.to,
        id: id,
        refCount: refInfo?.totalCount ?? 0,
        printName: null,
        subIndices: refInfo?.subIndices
      });
    }
  }

  const obsitexConfigs = parsePositionalObsitexConfigs(text);
  let configIdx = 0;
  let currentPrefix = settings.eqNumberPrefix;
  let equationCount = 0;
  const eqSuffix = settings.eqNumberSuffix;

  for (const info of equationInfos) {
    while (configIdx < obsitexConfigs.length && obsitexConfigs[configIdx].from < info.from) {
      const cfg = obsitexConfigs[configIdx].config;
      if (cfg.eqPrefix !== undefined) {
        currentPrefix = cfg.eqPrefix;
      }
      if (cfg.eqContinuity === false) {
        equationCount = 0;
      }
      configIdx++;
    }

    if (!settings.numberOnlyReferencedEquations || info.refCount > 0) {
      const num = settings.eqNumberInit + equationCount;
      const numberStyle = settings.eqNumberStyle;
      const convertedNum = CONVERTER[numberStyle](num);
      info.printName = `(${currentPrefix}${convertedNum}${eqSuffix})`;
      equationCount++;
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
        if (
          update.docChanged &&
          !update.transactions.some(tr => tr.annotation(tagManagerAnnotation))
        ) {
          this.scheduleCheck(update.view);
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
        const equationInfos = view.state.field(equationField);
        const changes: { from: number; to: number; insert: string }[] = [];
        const selection = view.state.selection.main;
        let blockedChanges = 0;

        for (const info of equationInfos) {
          const selectionOverlapsEquation = selection.from <= info.to && selection.to >= info.from;
          // Determine the prefix from the OPENING line of the block.
          // This is the source of truth for indentation/callout level.
          const startLine = view.state.doc.lineAt(info.from);
          const prefix = getCalloutPrefix(startLine.text);

          // Get inner content (excluding $$ delimiters)
          const blockContent = view.state.doc.sliceString(info.from + 2, info.to - 2);

          // --- Common Extraction Logic ---
          // 1. Extract existing ID if present
          const idCommentRegex = /(\s*% id: eq-[\w.-]+)/;
          const idMatch = blockContent.match(idCommentRegex);
          const idVal = idMatch ? idMatch[0].match(/eq-[\w.-]+/)?.[0] : null;

          // 2. Isolate Math Part (all text before the ID comment)
          let mathPart = idMatch ? blockContent.substring(0, idMatch.index) : blockContent;

          // 3. Clean existing tags
          mathPart = mathPart.replace(/\\tag\{[^{}]+\}/g, '');

          // 4. Robust Line-Based Trimming
          // Split into lines to inspect them individually.
          const mathLines = mathPart.split(/\r?\n/);

          // We want to remove trailing lines that contain ONLY the prefix (or whitespace).
          // These are "structural" lines that shouldn't be treated as math content.
          // e.g. a line that is just "> " or "   > "

          // Pop lines from the end until we hit content or run out
          while (mathLines.length > 0 && isStructuralCalloutLine(mathLines[mathLines.length - 1])) {
            mathLines.pop();
          }

          // Be careful: if we stripped everything (empty block), we might want to keep one empty line?
          // Or just have empty content.
          // If mathLines is empty now, it means block was empty.

          // Rejoin the trimmed math part
          mathPart = mathLines.join('\n');

          let newInnerContent: string | null = null;

          // --- Mode 1: Sub-equation ---
          if (info.subIndices && info.subIndices.size > 0 && info.printName) {
            const baseName = info.printName.slice(1, -1);
            const parts = splitMathIntoTopLevelRows(mathPart);
            let hasContent = false;
            const newParts = [...parts];

            for (let i = 0; i < parts.length; i += 2) {
              const row = parts[i];
              const cleanedRow = row.replace(/^[ \t]+/, '');
              if (cleanedRow.trim() === '') {
                newParts[i] = cleanedRow;
                continue;
              }
              hasContent = true;
              const subIndex = i / 2 + 1;
              const newTag = ` \\tag{${baseName}.${subIndex}}`;
              const endEnvMatch = findTopLevelEndEnvMatch(cleanedRow);
              if (endEnvMatch) {
                const before = cleanedRow.substring(0, endEnvMatch.index).trimEnd();
                const environment = endEnvMatch.matchText;
                const after = cleanedRow.substring(endEnvMatch.index + environment.length);
                newParts[i] = `${before + newTag} ${environment}${after}`;
              } else {
                newParts[i] = cleanedRow.trimEnd() + newTag;
              }
            }

            if (hasContent) {
              newInnerContent = newParts.join('');
            }
          }
          // --- Mode 2: Normal Equation ---
          else {
            const requiredTagContent = info.printName ? info.printName.slice(1, -1) : null;
            // mathPart is already trimmed of trailing structural lines.
            // We still trimEnd to remove trailing spaces on the last content line itself.
            mathPart = mathPart.trimEnd();

            if (requiredTagContent) {
              const newTag = ` \\tag{${requiredTagContent}}`;
              const endEnvMatch = findTopLevelEndEnvMatch(mathPart);
              if (endEnvMatch) {
                const before = mathPart.substring(0, endEnvMatch.index).trimEnd();
                const environment = endEnvMatch.matchText;
                const after = mathPart.substring(endEnvMatch.index + environment.length);
                mathPart = `${before + newTag} ${environment}${after}`;
              } else {
                mathPart += newTag;
              }
            }
            newInnerContent = mathPart;
          }

          // --- Reconstruction ---
          if (newInnerContent !== null) {
            // Logic to reconstruct the block end
            const existingSuffix = view.state.doc.sliceString(info.from + 2, info.to);
            // But if we trimmed, we might lose them.
            // blockContent usually starts with `\n`.

            // Simple heuristic: If original started with newline, keep it.
            const leadingNewline = blockContent.startsWith('\n') ? '\n' : '';
            const cleanMath = newInnerContent.trim();

            let proposedSuffix = leadingNewline + cleanMath;

            if (idVal) {
              proposedSuffix += `\n${prefix}% id: ${idVal}`;
            }
            proposedSuffix += `\n${prefix}$$`;

            // Comparison
            // We simply compare the strings.
            // Note: This replaces EVERYTHING from inside the block to the end of the block.
            if (existingSuffix !== proposedSuffix) {
              if (selectionOverlapsEquation) {
                blockedChanges += 1;
                continue;
              }
              changes.push({ from: info.from + 2, to: info.to, insert: proposedSuffix });
            }
          }
        }

        this.blockedBySelection = blockedChanges > 0;

        if (changes.length > 0) {
          view.dispatch({
            changes,
            annotations: tagManagerAnnotation.of(true)
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
        if (!tr.docChanged) return value;
        if (!activePlugin) return [];
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
