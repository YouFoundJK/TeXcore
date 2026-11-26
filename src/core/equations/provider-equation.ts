import { TFile, App, Pos } from 'obsidian';
import { EquationBlock } from 'types';
import {
  trimMathText,
  parseMarkdownComment,
  parseYamlLike,
  findDisplayMathBlocks,
  CALLOUT_PREFIX_REGEX,
  MathBlockRange,
  computeLineStarts,
  offsetToLineCol,
  stripCalloutPrefix,
  extractEquationId
} from 'utils/parse';

function stripLatexComments(text: string): string {
  return text.replace(/(^|[^\\])((?:\\\\)*)%[^\n]*/g, '$1$2');
}

export class ActiveNoteEquationProvider {
  constructor(public app: App) {}

  getEquations(
    file: TFile,
    content: string,
    precomputedBlocks?: readonly MathBlockRange[]
  ): EquationBlock[] {
    const equations: EquationBlock[] = [];
    const lineStarts = computeLineStarts(content);

    const processMathBlock = (
      mathText: string,
      trailingAfterBlock: string,
      position: {
        start: { line: number; col: number; offset: number };
        end: { line: number; col: number; offset: number };
      }
    ): EquationBlock => {
      let trimmedMathText = mathText.trim();
      if (trimmedMathText.startsWith('$$')) {
        trimmedMathText = trimMathText(trimmedMathText);
      }

      const blockId = extractEquationId(trimmedMathText, trailingAfterBlock, true);

      const mathWithoutComments = stripLatexComments(trimmedMathText);
      const tagMatch = mathWithoutComments.match(/\\tag\*?\{(.*?[^\s])\}/);
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
          col: position.start.col,
          offset: position.start.offset
        },
        end: {
          line: position.end.line,
          col: position.end.col,
          offset: position.end.offset
        }
      };

      return {
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
    };

    const mathBlocks = precomputedBlocks ?? findDisplayMathBlocks(content);
    for (const block of mathBlocks) {
      const startLoc = offsetToLineCol(lineStarts, block.from);
      const endLoc = offsetToLineCol(lineStarts, block.to);

      let rawBlockText = content.slice(block.from, block.to);
      const openLinePrefix = content.slice(lineStarts[startLoc.line], block.from);
      if (CALLOUT_PREFIX_REGEX.test(openLinePrefix)) {
        rawBlockText = rawBlockText
          .split(/\r?\n/)
          .map(l => stripCalloutPrefix(l))
          .join('\n');
      }

      const trailingAfterBlock = content.slice(block.to, Math.min(content.length, block.to + 120));
      const eq = processMathBlock(rawBlockText, trailingAfterBlock, {
        start: { line: startLoc.line, col: startLoc.col, offset: block.from },
        end: { line: endLoc.line, col: endLoc.col, offset: block.to }
      });

      equations.push(eq);
    }

    return equations;
  }
}
