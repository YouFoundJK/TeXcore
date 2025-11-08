import { TFile, App, CachedMetadata } from 'obsidian';
import { EquationBlock } from 'types';
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

            let blockId: string | undefined;

            // Priority 1: Check for the new internal ID format.
            const internalIdMatch = mathText.match(/% id: (eq-[\w-]+)/);
            if (internalIdMatch) {
                blockId = internalIdMatch[1];
            } else {
                // Priority 2: Fallback to the legacy external ID format.
                blockId = section.id;
                const nextLineIndex = section.position.end.line + 1;
                const lines = content.split('\n');
                if (nextLineIndex < lines.length) {
                    const nextLine = lines[nextLineIndex].trim();
                    const legacyIdMatch = nextLine.match(/^\^([a-zA-Z0-9\-_]+)$/);
                    if (legacyIdMatch) {
                        blockId = legacyIdMatch[1];
                    }
                }
            }

            const tagMatch = mathText.match(/\\tag\{(.*?[^\s])\}/);
            let manualTag: string | null = null;
            if (tagMatch) {
                // tagMatch[1] is the full content, e.g., "1.1" or "1"
                manualTag = tagMatch[1].split('.')[0]; 
            }

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
            
            const equation: EquationBlock = {
                $file: file.path,
                $type: 'equation',
                $blockId: blockId,
                $pos: section.position,
                $position: { start: section.position.start.line, end: section.position.end.line },
                $mathText: mathText,
                $manualTag: manualTag,
                $label: label,
                $display: display,
                $printName: null,
                $refName: null,
            };
            
            equations.push(equation);
        }

        return equations;
    }
}