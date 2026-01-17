import { TFile, App, CachedMetadata } from 'obsidian';
import { EquationBlock } from 'types';
import { trimMathText, parseMarkdownComment, parseYamlLike } from 'utils/parse';

export class ActiveNoteEquationProvider {
    constructor(public app: App) { }

    getEquations(file: TFile, content: string): EquationBlock[] {
        const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
        if (!cache?.sections) {
            return [];
        }

        const equations: EquationBlock[] = [];

        const processMathBlock = (mathText: string, position: { start: { line: number; offset: number; }; end: { line: number; offset: number; }; }) => {
            // Fix: trimMathText expects $$...$$, but mathText might be already stripped (from callout regex) or not.
            // If it doesn't start with $$, trimMathText returns empty string.
            // Check if it has $$ wrappers; if not, just trim whitespace.
            let trimmedMathText = mathText.trim();
            if (trimmedMathText.startsWith('$$')) {
                trimmedMathText = trimMathText(trimmedMathText);
            }

            let blockId: string | undefined;

            const internalIdMatch = trimmedMathText.match(/% id: (eq-[\w-]+)/);
            if (internalIdMatch) {
                blockId = internalIdMatch[1];
            }

            const tagMatch = trimmedMathText.match(/\\tag\{(.*?[^\s])\}/);
            let manualTag: string | null = null;
            if (tagMatch) {
                manualTag = tagMatch[1].split('.')[0];
            }

            const comments = parseMarkdownComment(trimmedMathText);
            let label: string | undefined;
            let display: string | undefined;
            for (const comment of comments) {
                const parsed = parseYamlLike(comment);
                if (parsed) {
                    if (parsed['label']) label = parsed['label'];
                    if (parsed['display']) display = parsed['display'];
                }
            }

            return {
                $file: file.path,
                $type: 'equation' as const,
                $blockId: blockId,
                $pos: position as any,
                $position: { start: position.start.line, end: position.end.line },
                $mathText: trimmedMathText,
                $manualTag: manualTag,
                $label: label,
                $display: display,
                $printName: null,
                $refName: null,
            };
        };

        for (let i = 0; i < cache.sections.length; i++) {
            const section = cache.sections[i];

            if (section.type === 'math') {
                const text = content.slice(section.position.start.offset, section.position.end.offset);
                const eq = processMathBlock(text, section.position);

                // Legacy ID Check
                if (!eq.$blockId) {
                    eq.$blockId = section.id;
                    const nextLineIndex = section.position.end.line + 1;
                    const lines = content.split('\n');
                    if (nextLineIndex < lines.length) {
                        const nextLine = lines[nextLineIndex].trim();
                        const legacyIdMatch = nextLine.match(/^\^([a-zA-Z0-9\-_]+)$/);
                        if (legacyIdMatch) {
                            eq.$blockId = legacyIdMatch[1];
                        }
                    }
                }
                equations.push(eq);
            }
            else if (section.type === 'callout' || section.type === 'blockquote') {
                const text = content.slice(section.position.start.offset, section.position.end.offset);

                const lines = text.split(/\r?\n/);
                // Improved regex to strip blockquote markers
                const cleanLines = lines.map(l => l.replace(/^\s*>\s?/, ''));
                const cleanText = cleanLines.join('\n');

                // Handle split/lazy blockquotes (odd number of $$) by appending a closing one
                let processedText = cleanText;
                if ((processedText.match(/\$\$/g) || []).length % 2 !== 0) {
                    processedText += '\n$$';
                }

                const mathRegex = /\$\$([\s\S]*?)\$\$/g;
                let match;

                while ((match = mathRegex.exec(processedText)) !== null) {
                    const mathContent = match[1];
                    const matchIndex = match.index;

                    const prefix = processedText.substring(0, matchIndex);
                    const startLineOffset = (prefix.match(/\n/g) || []).length;
                    const contentLineCount = (match[0].match(/\n/g) || []).length;

                    const absStartLine = section.position.start.line + startLineOffset;
                    const absEndLine = section.position.start.line + startLineOffset + contentLineCount;

                    const eq = processMathBlock(mathContent, {
                        start: { line: absStartLine, offset: 0 },
                        end: { line: absEndLine, offset: 0 }
                    });

                    if (eq) {
                        // @ts-ignore
                        equations.push(eq);
                    }
                }
            }
        }

        return equations;
    }
}