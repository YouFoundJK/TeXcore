import { Extension, StateField, EditorState, Annotation } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import LatexReferencer from 'main';
import { CONVERTER, getEqNumberPrefix } from 'utils/format';


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

    // 1. Scan for all references, including sub-equation links
    const referenceMap = new Map<string, { totalCount: number, subIndices: Set<number> }>();
    const linkRegex = /\[\[#\^eq-[\w-]+(?:-\d+)?\]\]/g;
    let match;
    while ((match = linkRegex.exec(text)) !== null) {
        const linkText = match[0].slice(4, -2); // eq-id or eq-id-2
        const parts = linkText.split('-');
        const baseId = parts.slice(0, 2).join('-'); // eq-id
        const subIndexStr = parts.length > 2 ? parts[parts.length - 1] : undefined;

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
        const idMatch = blockText.match(/% id: (eq-[\w-]+)/);
        if (idMatch) {
            const id = idMatch[1];
            const refInfo = referenceMap.get(id);
            equationInfos.push({
                from: block.from, to: block.to, id: id,
                refCount: refInfo?.totalCount ?? 0,
                printName: null,
                subIndices: refInfo?.subIndices,
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


const tagManagerAnnotation = Annotation.define<boolean>();

/**
 * The "Hands". This is the one and only plugin responsible for adding,
 * updating, or removing \tag{...} commands from the editor text.
 */
function createTagManagerPlugin(plugin: LatexReferencer, equationField: StateField<EquationState>): ViewPlugin<object> {
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

// equations/live-preview.ts (inside ViewPlugin.fromClass)

        runCheck(view: EditorView) {
            const equationInfos = view.state.field(equationField);
            const changes: { from: number; to: number; insert: string }[] = [];

            for (const info of equationInfos) {
                const blockContent = view.state.doc.sliceString(info.from + 2, info.to - 2);
                let newBlockContent: string | null = null;

                // Mode 1: Multi-tag for sub-references
                if (info.subIndices && info.subIndices.size > 0 && info.printName) {
                    const baseName = info.printName.slice(1, -1);
                    const idCommentRegex = /(\s*% id: eq-[\w-]+)/;
                    const idMatch = blockContent.match(idCommentRegex);
                    const idComment = idMatch ? idMatch[0].trim() : '';
                    let mathPart = idMatch ? blockContent.substring(0, idMatch.index) : blockContent;
                    mathPart = mathPart.replace(/\\tag\{[^{}]+\}/g, '');
                    const rows = mathPart.trim().split(/\\\\/);
                    let hasContent = false;

                    const taggedRows = rows.map((row, index) => {
                        if (row.trim() === '') return row;
                        hasContent = true;
                        const subIndex = index + 1;
                        const newTag = ` \\tag{${baseName}.${subIndex}}`;
                        const endEnvMatch = row.match(/(\\end\{[a-zA-Z*]+\})/);
                        if (endEnvMatch && endEnvMatch.index !== undefined) {
                            const before = row.substring(0, endEnvMatch.index).trimEnd();
                            const environment = endEnvMatch[0];
                            const after = row.substring(endEnvMatch.index + environment.length);
                            return before + newTag + ' ' + environment + after;
                        } else {
                            return row.trimEnd() + newTag;
                        }
                    });

                    if (hasContent) {
                        newBlockContent = taggedRows.join(' \\\\ ') + (idComment ? `\n${idComment}`: '');
                    }
                } 
                // Mode 2: Single-tag for normal references (Corrected)
                else { 
                    const requiredTagContent = info.printName ? info.printName.slice(1, -1) : null;
                    
                    // 1. Isolate the ID comment to protect it.
                    const idCommentRegex = /(\s*% id: eq-[\w-]+)/;
                    const idMatch = blockContent.match(idCommentRegex);
                    const idComment = idMatch ? idMatch[0].trim() : '';

                    // 2. Get the pure math part of the block.
                    let mathPart = idMatch ? blockContent.substring(0, idMatch.index) : blockContent;
                    
                    // 3. Clean ALL existing tags from the math part.
                    mathPart = mathPart.replace(/\\tag\{[^{}]+\}/g, '').trim();

                    // 4. Append the single tag to the math part, if needed.
                    if (requiredTagContent) {
                        mathPart += ` \\tag{${requiredTagContent}}`;
                    }
                    
                    // 5. Reconstruct the full content with the comment at the end.
                    newBlockContent = mathPart + (idComment ? `\n${idComment}` : '');
                }

                if (newBlockContent !== null) {
                    const oldNormalized = blockContent.replace(/\s+/g, '');
                    const newNormalized = newBlockContent.replace(/\s+/g, '');
                    if (oldNormalized !== newNormalized) {
                        changes.push({ from: info.from + 2, to: info.to - 2, insert: `\n${newBlockContent.trim()}\n` });
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
        createTagManagerPlugin(plugin, equationField),
    ];
}