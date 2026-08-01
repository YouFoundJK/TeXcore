import { TFile, App, CachedMetadata, Pos } from 'obsidian';
import { EquationBlock } from 'types';
import {
  trimMathText,
  parseMarkdownComment,
  parseYamlLike,
  findDisplayMathBlocks
} from 'utils/parse';
import { parseEquationId } from 'utils/equation-id';
import { logDebug } from 'utils/logger';

export class ActiveNoteEquationProvider {
  constructor(public app: App) {}

  getEquations(file: TFile, content: string): EquationBlock[] {
    const cache: CachedMetadata | null = this.app.metadataCache.getFileCache(file);
    const equations: EquationBlock[] = [];

    logDebug(
      'EquationProvider',
      `getEquations called for "${file.path}". Cache sections: ${cache?.sections?.length ?? 0}`
    );

    const lines = content.split('\n');
    const lineOffsets = new Int32Array(lines.length + 1);
    for (let i = 0; i < lines.length; i++) {
      lineOffsets[i + 1] = lineOffsets[i] + lines[i].length + 1;
    }
    const getLineOffset = (line: number): number => lineOffsets[Math.min(line, lines.length)];

    const processMathBlock = (
      mathText: string,
      position: {
        start: { line: number; col?: number; offset: number };
        end: { line: number; col?: number; offset: number };
      }
    ) => {
      let trimmedMathText = mathText.trim();
      if (trimmedMathText.startsWith('$$')) {
        trimmedMathText = trimMathText(trimmedMathText);
      }

      const blockId: string | undefined = parseEquationId(trimmedMathText) ?? undefined;

      const tagMatch = trimmedMathText.match(/\\tag\{(.*?[^\s])\}/);
      let manualTag: string | null = null;
      if (tagMatch && !blockId) {
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

      const fullPos: Pos = {
        start: {
          line: position.start.line,
          col: position.start.col ?? 0,
          offset: position.start.offset
        },
        end: {
          line: position.end.line,
          col: position.end.col ?? 0,
          offset: position.end.offset
        }
      };

      const eq: EquationBlock = {
        $file: file.path,
        $type: 'equation' as const,
        $blockId: blockId,
        $pos: fullPos,
        $position: { start: position.start.line, end: position.end.line },
        $mathText: trimmedMathText,
        $manualTag: manualTag,
        $label: label,
        $display: display,
        $printName: null,
        $refName: null
      };

      logDebug(
        'EquationProvider',
        `Processed math block line ${position.start.line}: ID="${blockId ?? 'NONE'}", mathSnippet="${trimmedMathText.substring(0, 60).replace(/\n/g, '\\n')}"`
      );

      return eq;
    };

    if (cache?.sections && cache.sections.length > 0) {
      for (let i = 0; i < cache.sections.length; i++) {
        const section = cache.sections[i];

        if (section.type === 'math') {
          const text = content.slice(section.position.start.offset, section.position.end.offset);
          const eq = processMathBlock(text, section.position);

          // Legacy ID Check
          if (!eq.$blockId) {
            eq.$blockId = section.id;
            const nextLineIndex = section.position.end.line + 1;
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
          section.type === 'list' ||
          section.type === 'table'
        ) {
          const text = content.slice(section.position.start.offset, section.position.end.offset);
          logDebug(
            'EquationProvider',
            `Scanning composite section type="${section.type}" lines ${section.position.start.line}-${section.position.end.line}`
          );

          let processedText = text;
          if (section.type === 'callout' || section.type === 'blockquote') {
            const splitLines = text.split(/\r?\n/);
            const cleanLines = splitLines.map(l => l.replace(/^\s*>\s?/, ''));
            processedText = cleanLines.join('\n');
          }

          const mathBlocks = findDisplayMathBlocks(processedText);
          if (section.type === 'table') {
            // Also scan for single-dollar math blocks `$ ... $` inside table cells that contain equation IDs
            const inlineMathRegex =
              /(?<!\$)\$([^\$\n]+?\b(?:\\label\{eq-|% id:\s*eq-)[^\$\n]+?)\$(?!\$)/g;
            let m: RegExpExecArray | null;
            while ((m = inlineMathRegex.exec(processedText)) !== null) {
              const startPos = m.index;
              const endPos = m.index + m[0].length;
              const overlaps = mathBlocks.some(b => startPos >= b.from && endPos <= b.to);
              if (!overlaps) {
                mathBlocks.push({ from: startPos, to: endPos });
              }
            }
          }

          logDebug(
            'EquationProvider',
            `  Found ${mathBlocks.length} math block(s) inside ${section.type}`
          );

          for (const block of mathBlocks) {
            const isDisplay = processedText.substring(block.from, block.from + 2) === '$$';
            const mathContent = isDisplay
              ? processedText.substring(block.from + 2, block.to - 2)
              : processedText.substring(block.from + 1, block.to - 1);

            const prefix = processedText.substring(0, block.from);
            const startLineOffset = (prefix.match(/\n/g) || []).length;
            const blockText = processedText.substring(block.from, block.to);
            const contentLineCount = (blockText.match(/\n/g) || []).length;

            const absStartLine = section.position.start.line + startLineOffset;
            const absEndLine = section.position.start.line + startLineOffset + contentLineCount;

            const eq = processMathBlock(mathContent, {
              start: { line: absStartLine, offset: getLineOffset(absStartLine) },
              end: { line: absEndLine, offset: getLineOffset(absEndLine) }
            });

            if (eq) {
              equations.push(eq);
            }
          }
        }
      }
    } else {
      // Fallback: If cache.sections is not available, extract display math directly from content
      logDebug(
        'EquationProvider',
        'Fallback: cache.sections not available, scanning content directly'
      );
      const mathBlocks = findDisplayMathBlocks(content);
      for (const block of mathBlocks) {
        const mathContent = content.substring(block.from, block.to);
        const prefix = content.substring(0, block.from);
        const startLine = (prefix.match(/\n/g) || []).length;
        const blockText = content.substring(block.from, block.to);
        const lineCount = (blockText.match(/\n/g) || []).length;
        const endLine = startLine + lineCount;

        const eq = processMathBlock(mathContent, {
          start: { line: startLine, offset: block.from },
          end: { line: endLine, offset: block.to }
        });

        equations.push(eq);
      }
    }

    logDebug(
      'EquationProvider',
      `getEquations total extracted for "${file.path}": ${equations.length}`
    );
    return equations;
  }
}
