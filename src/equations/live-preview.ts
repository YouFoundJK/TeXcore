import { Extension, StateField, EditorState, Annotation, RangeSetBuilder } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import LatexReferencer from 'main';
import { generateEqId } from 'utils/obsidian';
import { CONVERTER, getEqNumberPrefix } from 'utils/format';
import { EquationBlock } from 'types';
import { processActiveNoteEquations } from './numbering';

/**
 * The in-memory state for the TagManager. It holds only the information
 * necessary to decide if a tag should be added, updated, or removed.
 */
interface EquationInfo {
    from: number;
    to: number;
    id: string;
    printName: string | null; // The calculated number, e.g., "(1)"
}
type EquationState = readonly EquationInfo[];


/**
 * A utility parser that finds the start and end positions of all $$...$$ math blocks,
 * ignoring any that are inside code blocks. This is a stable dependency.
 */
function findMathBlocks(state: EditorState): readonly { from: number; to: number }[] {
    const text = state.doc.toString();
    const codeBlockRanges: { from: number; to: number }[] = [];

    const fencedCodeRegex = /^```[\s\S]*?^```/gm;
    let fencedMatch: RegExpExecArray | null;
    while ((fencedMatch = fencedCodeRegex.exec(text)) !== null) {
        codeBlockRanges.push({ from: fencedMatch.index, to: fencedMatch.index + fencedMatch[0].length });
    }

    const inlineCodeRegex = /(`+)(?:(?!\1|(?:\r\n|\n){2})[\s\S])+?\1/g;
    let inlineMatch: RegExpExecArray | null;
    while ((inlineMatch = inlineCodeRegex.exec(text)) !== null) {
        const currentMatch = inlineMatch;
        const isInsideFencedBlock = codeBlockRanges.some(range =>
            currentMatch.index >= range.from && (currentMatch.index + currentMatch[0].length) <= range.to
        );
        if (!isInsideFencedBlock) {
            codeBlockRanges.push({ from: currentMatch.index, to: currentMatch.index + currentMatch[0].length });
        }
    }

    const mathBlockRanges: { from: number; to: number }[] = [];
    const mathRegex = /\$\$(.*?)\$\$/gs;
    let mathMatch: RegExpExecArray | null;
    while ((mathMatch = mathRegex.exec(text)) !== null) {
        mathBlockRanges.push({ from: mathMatch.index, to: mathMatch.index + mathMatch[0].length });
    }

    const validMathBlocks = mathBlockRanges.filter(mathRange => {
        return !codeBlockRanges.some(codeRange =>
            mathRange.from >= codeRange.from && mathRange.to <= codeRange.to
        );
    });

    return validMathBlocks;
}

const mathBlockPositionsField = StateField.define<readonly { from: number; to: number }[]>({
    create(state) { return findMathBlocks(state); },
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

    // THE CRITICAL FIX: This regex now correctly finds [[#^eq-...]] links.
    const refRegex = /\[\[#\^eq-[\w-]+\]\]/g;
    const refCounts = new Map<string, number>();
    let refMatch;
    while ((refMatch = refRegex.exec(text)) !== null) {
        const id = refMatch[0].slice(4, -2); // Extracts 'eq-...' from '[[#^eq-...]]'
        refCounts.set(id, (refCounts.get(id) ?? 0) + 1);
    }

    const mathBlocks = state.field(mathBlockPositionsField);
    const equationInfos: (EquationInfo & { refCount: number })[] = [];
    for (const block of mathBlocks) {
        const blockText = state.doc.sliceString(block.from, block.to);
        const idMatch = blockText.match(/% id: (eq-[\w-]+)/);
        if (idMatch) {
            const id = idMatch[1];
            equationInfos.push({
                from: block.from, to: block.to, id: id,
                refCount: refCounts.get(id) ?? 0, printName: null,
            });
        }
    }

    let equationCount = 0;
    const eqPrefix = getEqNumberPrefix(plugin.app, file, settings);
    const eqSuffix = settings.eqNumberSuffix;

    for (const info of equationInfos) {
        if (!settings.numberOnlyReferencedEquations || info.refCount > 0) {
            const num = settings.eqNumberInit + equationCount;
            const numberStyle = settings.eqNumberStyle as keyof typeof CONVERTER;
            const convertedNum = CONVERTER[numberStyle](num);
            info.printName = `(${eqPrefix}${convertedNum}${eqSuffix})`;
            equationCount++;
        }
    }
    return equationInfos;
}


const idInjectorAnnotation = Annotation.define<boolean>();
const tagManagerAnnotation = Annotation.define<boolean>();

function createIdInjectorPlugin(plugin: LatexReferencer): ViewPlugin<any> {
    return ViewPlugin.fromClass(class {
        constructor(view: EditorView) { this.injectIds(view); }
        update(update: ViewUpdate) {
            if (update.docChanged && !update.transactions.some(tr => tr.annotation(idInjectorAnnotation))) {
                this.injectIds(update.view);
            }
        }
        injectIds(view: EditorView) {
            const mathBlocks = view.state.field(mathBlockPositionsField);
            const changes: { from: number; insert: string }[] = [];
            for (let i = mathBlocks.length - 1; i >= 0; i--) {
                const block = mathBlocks[i];
                const blockText = view.state.doc.sliceString(block.from, block.to);
                if (/% id: eq-[\w-]+/.test(blockText)) continue;
                const endLine = view.state.doc.lineAt(block.to);
                if (endLine.number < view.state.doc.lines) {
                    const lineAfter = view.state.doc.line(endLine.number + 1);
                    if (/^\s*\^[\w-]+$/.test(lineAfter.text)) continue;
                }
                if (blockText.replace(/\s/g, "") === '$$$$') continue;
                const newId = generateEqId();
                const insertPos = block.to - 2;
                const charBefore = view.state.doc.sliceString(insertPos - 1, insertPos);
                const textToInsert = (charBefore === '\n' ? '' : '\n') + `% id: ${newId}\n`;
                changes.push({ from: insertPos, insert: textToInsert });
            }
            if (changes.length > 0) {
                setTimeout(() => {
                    const tr = view.state.update({
                        changes,
                        selection: view.state.selection.map(view.state.changes(changes)),
                        annotations: idInjectorAnnotation.of(true),
                    });
                    view.dispatch(tr);
                }, 0);
            }
        }
    });
}

/**
 * The "Hands". This is the one and only plugin responsible for adding,
 * updating, or removing \tag{...} commands from the editor text.
 */
function createTagManagerPlugin(plugin: LatexReferencer, equationField: StateField<EquationState>): ViewPlugin<any> {
    return ViewPlugin.fromClass(class {
        timeout: NodeJS.Timeout | null = null;

        constructor(view: EditorView) { this.scheduleCheck(view); }
        update(update: ViewUpdate) {
            if (update.docChanged && !update.transactions.some(tr => tr.annotation(tagManagerAnnotation))) {
                this.scheduleCheck(update.view);
            }
        }
        scheduleCheck(view: EditorView) {
            if (this.timeout) clearTimeout(this.timeout);
            this.timeout = setTimeout(() => this.runCheck(view), 300);
        }
        runCheck(view: EditorView) {
            const equationInfos = view.state.field(equationField);
            const changes: { from: number; to: number; insert: string }[] = [];

            for (const info of equationInfos) {
                const requiredTagContent = info.printName ? info.printName.slice(1, -1) : null;
                const blockText = view.state.doc.sliceString(info.from, info.to);
                
                const tagRegex = /\\tag\{[^{}]+\}/;
                const match = blockText.match(tagRegex);
                const existingTagContent = match ? match[0].slice(5, -1) : null;

                if (requiredTagContent === existingTagContent) continue;

                if (requiredTagContent) {
                    // ACTION: ADD or UPDATE tag
                    const newTag = `\\tag{${requiredTagContent}}`;
                    if (match) {
                        // UPDATE existing tag
                        const from = info.from + (match.index ?? 0);
                        const to = from + match[0].length;
                        changes.push({ from, to, insert: newTag });
                    } else {
                        // ADD new tag
                        const insertPos = info.to - 2;
                        const charBefore = view.state.doc.sliceString(insertPos - 1, insertPos);
                        const textToInsert = (charBefore.trim() ? ' ' : '') + newTag;
                        changes.push({ from: insertPos, to: insertPos, insert: textToInsert });
                    }
                } else {
                    // ACTION: REMOVE tag
                    if (match) {
                        const from = info.from + (match.index ?? 0);
                        const to = from + match[0].length;
                        const charBefore = view.state.doc.sliceString(from - 1, from);
                        changes.push({ from: charBefore === ' ' ? from - 1 : from, to, insert: '' });
                    }
                }
            }

            if (changes.length > 0) {
                view.dispatch({
                    changes,
                    annotations: tagManagerAnnotation.of(true)
                });
            }
        }
    });
}

function createEquationField(plugin: LatexReferencer): StateField<EquationState> {
    return StateField.define<EquationState>({
        create(state) { return parseEquationInfo(state, plugin); },
        update(value, tr) {
            if (!tr.docChanged) return value;
            return parseEquationInfo(tr.state, plugin);
        }
    });
}

/** The main export that bundles all required editor extensions. */
export function createEquationNumberPlugin(plugin: LatexReferencer): Extension {
    const equationField = createEquationField(plugin);
    return [
        mathBlockPositionsField,
        equationField,
        createIdInjectorPlugin(plugin),
        createTagManagerPlugin(plugin, equationField),
    ];
}

// THIS IS A DUMMY WIDGET LEFT HERE TO PREVENT ERRORS IN OTHER FILES
// THAT MIGHT STILL REFERENCE IT. IT DOES NOTHING.
class EquationNumberWidget extends WidgetType {
    constructor(public equation: EquationBlock) { super(); }
    eq(other: EquationNumberWidget) { return true; }
    toDOM() { return createSpan(); }
}