import { Editor, TFile, App, Pos } from 'obsidian';
import { syntaxTree } from '@codemirror/language';
import { EquationBlock } from 'index/typings/markdown';
import { trimMathText, parseMarkdownComment, parseYamlLike } from 'utils/parse';

export class ActiveNoteEquationProvider {
    constructor(public app: App) {}

    getEquations(file: TFile, editor: Editor): EquationBlock[] {
        // @ts-ignore
        if (!editor.cm) return [];

        const state = editor.cm.state;
        const tree = syntaxTree(state);
        const equations: EquationBlock[] = [];
        let ordinal = 0;

        tree.iterate({
            enter: (node) => {
                // In Obsidian's Lezer grammar, display math blocks are typed as 'HyperMD-math-block_math-display'
                if (node.name.includes("math-block")) {
                    const from = node.from;
                    const to = node.to;
                    const startPos = editor.offsetToPos(from);
                    const endPos = editor.offsetToPos(to);

                    const text = state.doc.sliceString(from, to);
                    const mathText = trimMathText(text);

                    // Check for block ID on the next line
                    let blockId: string | undefined;
                    if (endPos.line + 1 < editor.lineCount()) {
                        const nextLine = editor.getLine(endPos.line + 1).trim();
                        const idMatch = nextLine.match(/^\^([a-zA-Z0-9\-_]+)$/);
                        if (idMatch) {
                            blockId = idMatch[1];
                        }
                    }

                    const tagMatch = mathText.match(/\\tag\{(.*?[^\s])\}/);
                    const manualTag = tagMatch ? tagMatch[1] : null;

                    const comments = parseMarkdownComment(mathText);
                    let label: string | undefined;
                    let display: string | undefined;
                    for (const comment of comments) {
                        const parsed = parseYamlLike(comment);
                        if (parsed) {
                            if (parsed['label']) label = parsed['label'];
                            if (parsed['display']) display = parsed['display'];
                        }
                    }
                    
                    const pos: Pos = {
                        start: { line: startPos.line, col: startPos.ch, offset: from },
                        end: { line: endPos.line, col: endPos.ch, offset: to }
                    };

                    const equation = new EquationBlock({
                        $file: file.path,
                        $id: EquationBlock.readableId(file.path, ordinal),
                        $ordinal: ordinal++,
                        $position: { start: startPos.line, end: endPos.line },
                        $pos: pos,
                        $links: [], // Links are not needed for this provider, leave empty.
                        $blockId: blockId,
                        $type: 'equation',
                        $mathText: mathText,
                        $manualTag: manualTag,
                        $label: label,
                        $display: display,
                    });
                    
                    equations.push(equation);
                    return false; // Do not iterate into children of the math block
                }
            }
        });

        return equations;
    }
}
