import { TFile, App, CachedMetadata } from 'obsidian';
import { EquationBlock } from 'index/typings/markdown';
import { trimMathText, parseMarkdownComment, parseYamlLike } from 'utils/parse';

export class ActiveNoteEquationProvider {
    constructor(public app: App) {}

    getEquations(file: TFile, content: string): EquationBlock[] {
        const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
        if (!cache?.sections) {
            return [];
        }

        const mathSections = cache.sections.filter((section) => section.type === 'math');
        const equations: EquationBlock[] = [];
        let ordinal = 0;

        for (const section of mathSections) {
            const text = content.slice(section.position.start.offset, section.position.end.offset);
            const mathText = trimMathText(text);

            let blockId: string | undefined = section.id;
            
            // In Live Preview, the cache's section.id is not always up-to-date.
            // A manual check on the next line is more reliable.
            const nextLineIndex = section.position.end.line + 1;
            const lines = content.split('\n');
            if (nextLineIndex < lines.length) {
                const nextLine = lines[nextLineIndex].trim();
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
                $pos: section.position,
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