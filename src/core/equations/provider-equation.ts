import { TFile, App, CachedMetadata, Pos } from 'obsidian';
import { EquationBlock } from 'types';
import {
  trimMathText,
  parseMarkdownComment,
  parseYamlLike,
  findDisplayMathBlocks
} from 'utils/parse';

export class ActiveNoteEquationProvider {
  constructor(public app: App) {}

  getEquations(file: TFile, content: string): EquationBlock[] {
    const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
    if (!cache?.sections) {
      return [];
    }

    const equations: EquationBlock[] = [];

    const processMathBlock = (
      mathText: string,
      position: { start: { line: number; offset: number }; end: { line: number; offset: number } }
    ) => {
      // Fix: trimMathText expects $$...$$, but mathText might be already stripped (from callout regex) or not.
      // If it doesn't start with $$, trimMathText returns empty string.
      // Check if it has $$ wrappers; if not, just trim whitespace.
      let trimmedMathText = mathText.trim();
      if (trimmedMathText.startsWith('$$')) {
        trimmedMathText = trimMathText(trimmedMathText);
      }

      let blockId: string | undefined;

      const internalIdMatch = trimmedMathText.match(/% id: (eq-[\w.-]+)/);
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
        $pos: position as unknown as Pos,
        $position: { start: position.start.line, end: position.end.line },
        $mathText: trimmedMathText,
        $manualTag: manualTag,
        $label: label,
        $display: display,
        $printName: null,
        $refName: null
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
      } else if (
        section.type === 'callout' ||
        section.type === 'blockquote' ||
        section.type === 'list'
      ) {
        const text = content.slice(section.position.start.offset, section.position.end.offset);

        let processedText = text;
        // For callouts/blockquote, strip blockquote markers
        if (section.type === 'callout' || section.type === 'blockquote') {
          const lines = text.split(/\r?\n/);
          const cleanLines = lines.map(l => l.replace(/^\s*>\s?/, ''));
          processedText = cleanLines.join('\n');
        }

        const mathBlocks = findDisplayMathBlocks(processedText);

        for (const block of mathBlocks) {
          const mathContent = processedText.substring(block.from + 2, block.to - 2);
          const prefix = processedText.substring(0, block.from);
          const startLineOffset = (prefix.match(/\n/g) || []).length;
          const blockText = processedText.substring(block.from, block.to);
          const contentLineCount = (blockText.match(/\n/g) || []).length;

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
