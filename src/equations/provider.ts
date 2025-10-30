import { Editor, TFile, App, CachedMetadata } from 'obsidian';
import { EquationBlock } from 'index/typings/markdown';
import { trimMathText, parseMarkdownComment, parseYamlLike } from 'utils/parse';

export class ActiveNoteEquationProvider {
    constructor(public app: App) {}

    getEquations(file: TFile, editor: Editor): EquationBlock[] {
        const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
        if (!cache?.sections) {
            return [];
        }

        const mathSections = cache.sections.filter((section) => section.type === 'math');
        const equations: EquationBlock[] = [];
        let ordinal = 0;

        for (const section of mathSections) {
            const fromPos = { line: section.position.start.line, ch: section.position.start.col };
            const toPos = { line: section.position.end.line, ch: section.position.end.col };
            
            const text = editor.getRange(fromPos, toPos);
            const mathText = trimMathText(text);

            let blockId: string | undefined = section.id;
            // The cache's section.id is not always up-to-date in Live Preview.
            // A manual check on the next line is more reliable.
            if (section.position.end.line + 1 < editor.lineCount()) {
                const nextLine = editor.getLine(section.position.end.line + 1).trim();
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
            
            const equation = new EquationBlock({
                $file: file.path,
                $id: EquationBlock.readableId(file.path, ordinal),
                $ordinal: ordinal++,
                $position: { start: section.position.start.line, end: section.position.end.line },
                $pos: section.position, // The position object from the cache is a complete Pos object
                $links: [],
                $blockId: blockId,
                $type: 'equation',
                $mathText: mathText,
                $manualTag: manualTag,
                $label: label,
                $display: display,
            });
            
            equations.push(equation);
        }

        return equations;
    }
}
