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
          const originalLines = text.split(/\r?\n/);
          const cleanToOriginalMap: number[] = [];

          if (section.type === 'callout' || section.type === 'blockquote') {
            const cleanLines = originalLines.map(l => l.replace(/^\s*>\s?/, ''));
            processedText = cleanLines.join('\n');

            let origIdx = 0;
            for (let i = 0; i < originalLines.length; i++) {
              const origLine = originalLines[i];
              const prefixMatch = origLine.match(/^\s*>\s?/);
              const prefixLen = prefixMatch ? prefixMatch[0].length : 0;

              origIdx += prefixLen;
              const contentLen = origLine.length - prefixLen;
              for (let j = 0; j < contentLen; j++) {
                cleanToOriginalMap.push(origIdx);
                origIdx++;
              }

              if (i < originalLines.length - 1) {
                const hasCarriageReturn = text.startsWith('\r\n', origIdx);
                cleanToOriginalMap.push(origIdx);
                origIdx += hasCarriageReturn ? 2 : 1;
              }
            }
            cleanToOriginalMap.push(origIdx);
          } else {
            // Identity mapping
            for (let i = 0; i <= text.length; i++) {
              cleanToOriginalMap.push(i);
            }
          }

          const mathBlocks = findDisplayMathBlocks(processedText);
          if (section.type === 'table') {
            // Also scan for single-dollar math blocks `$ ... $` inside table cells that contain equation IDs
            const inlineMathRegex =
              /(?<!\$)\$([^$\n]+?\b(?:\\label\{eq-|% id:\s*eq-)[^$\n]+?)\$(?!\$)/g;
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

            const startOffset = section.position.start.offset + cleanToOriginalMap[block.from];
            const endOffset = section.position.start.offset + cleanToOriginalMap[block.to];

            const startCol = startOffset - getLineOffset(absStartLine);
            const endCol = endOffset - getLineOffset(absEndLine);

            const eq = processMathBlock(mathContent, {
              start: { line: absStartLine, col: startCol, offset: startOffset },
              end: { line: absEndLine, col: endCol, offset: endOffset }
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

        const startCol = block.from - getLineOffset(startLine);
        const endCol = block.to - getLineOffset(endLine);

        const eq = processMathBlock(mathContent, {
          start: { line: startLine, col: startCol, offset: block.from },
          end: { line: endLine, col: endCol, offset: block.to }
        });

        equations.push(eq);
      }
    }

    // Deduplicate equations by position range
    const uniqueEquations: EquationBlock[] = [];
    const seenRanges = new Set<string>();
    for (const eq of equations) {
      const key = `${eq.$pos?.start?.offset ?? eq.$pos?.start?.line}_${eq.$pos?.end?.offset ?? eq.$pos?.end?.line}`;
      if (!seenRanges.has(key)) {
        seenRanges.add(key);
        uniqueEquations.push(eq);
      }
    }

    // Strictly sort equations by document position offset/line
    uniqueEquations.sort((a, b) => {
      const startA = a.$pos?.start?.offset ?? (a.$pos?.start?.line ?? 0) * 1000;
      const startB = b.$pos?.start?.offset ?? (b.$pos?.start?.line ?? 0) * 1000;
      return startA - startB;
    });

    logDebug(
      'EquationProvider',
      `getEquations total extracted for "${file.path}": ${uniqueEquations.length}`
    );
    return uniqueEquations;
  }
}
