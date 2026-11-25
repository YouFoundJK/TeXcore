import type { Editor, EditorPosition, EditorSelection } from 'obsidian';
import { findDisplayMathBlocks } from 'utils/parse';
import { formatMathBlock } from '../math-formatter/formatter';
import { findEnclosingMathBlock, replaceMathBlocksInDocument } from '../math-formatter/parser';

export type RangeResolver = (
  documentText: string,
  fromOffset: number,
  toOffset: number
) => { from: number; to: number } | null;

export interface TextTransformSnippet {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  transform: (input: string) => string;
  resolveRange?: RangeResolver;
}

export interface TextTransformResult {
  changedCount: number;
  appliedOn: 'selection' | 'line' | 'block';
}

function comparePositionsDesc(a: EditorPosition, b: EditorPosition): number {
  if (a.line !== b.line) {
    return b.line - a.line;
  }
  return b.ch - a.ch;
}

function isSelectionEmpty(selection: EditorSelection): boolean {
  return selection.anchor.line === selection.head.line && selection.anchor.ch === selection.head.ch;
}

function getSelectionRange(selection: EditorSelection): {
  from: EditorPosition;
  to: EditorPosition;
} {
  const anchorFirst =
    selection.anchor.line < selection.head.line ||
    (selection.anchor.line === selection.head.line && selection.anchor.ch <= selection.head.ch);

  return anchorFirst
    ? { from: selection.anchor, to: selection.head }
    : { from: selection.head, to: selection.anchor };
}

function normalizeWords(input: string): string[] {
  const trimmed = input.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9]+$/, '');
  if (!trimmed) {
    return [];
  }
  return trimmed.split(/[^a-zA-Z0-9]+/g).filter(Boolean);
}

function toKebabCase(input: string): string {
  return normalizeWords(input)
    .map(w => w.toLowerCase())
    .join('-');
}

function toTitleKebabCase(input: string): string {
  return normalizeWords(input)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('-');
}

function toTitleCase(input: string): string {
  return normalizeWords(input)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function cleanZoteroHighlightLine(input: string): string {
  return input.replace(
    /<mark[^>]*>\s*[\u0022\u201C\u201D]?(.*?)[\u0022\u201C\u201D]?\s*<\/mark>\s*(.*)/g,
    (_match, highlightedText: string, trailingText: string) => {
      const normalized = highlightedText.replace(/[.,]$/, '');
      return `"${normalized}." \u2014 ${trailingText}`;
    }
  );
}

function cleanDoubleDollarSymbols(input: string): string {
  return input.replace(/\$\$/g, '$');
}

function cleanInlineDoubleDollarSymbols(input: string): string {
  const lines = input.split(/\r?\n/);
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    const isBlockEquation =
      trimmed === '$$' ||
      (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 2);
    if (isBlockEquation) {
      return line;
    }
    return line.replace(/\$\$/g, '$');
  });
  const hasCarriageReturn = input.includes('\r\n');
  return processedLines.join(hasCarriageReturn ? '\r\n' : '\n');
}

export const BUILTIN_TEXT_TRANSFORM_SNIPPETS: TextTransformSnippet[] = [
  {
    id: 'kebab-case',
    name: 'Kebab Case',
    description: 'my-selected-text',
    keywords: ['kebab', 'slug', 'lower'],
    transform: toKebabCase
  },
  {
    id: 'title-kebab-case',
    name: 'Title Kebab Case',
    description: 'My-Selected-Text',
    keywords: ['title kebab', 'slug', 'dash'],
    transform: toTitleKebabCase
  },
  {
    id: 'title-case',
    name: 'Title Case',
    description: 'My Selected Text',
    keywords: ['title', 'heading', 'capitalize'],
    transform: toTitleCase
  },
  {
    id: 'clean-zotero-highlight-line',
    name: 'Clean Zotero Highlight Line',
    description: 'Format <mark>...</mark> highlights into quote + source',
    keywords: ['zotero', 'mark', 'highlight', 'citation'],
    transform: cleanZoteroHighlightLine
  },
  {
    id: 'clean-double-dollar-symbols',
    name: 'Clean Double Dollar Symbols',
    description: 'Replace all $$ with $',
    keywords: ['dollar', 'latex', 'equation', 'cleanup'],
    transform: cleanDoubleDollarSymbols
  },
  {
    id: 'clean-inline-double-dollar-symbols',
    name: 'Clean Inline Double Dollar Symbols',
    description: 'Replace inline $$ with $ while keeping block $$',
    keywords: ['dollar', 'latex', 'equation', 'inline', 'cleanup'],
    transform: cleanInlineDoubleDollarSymbols
  },
  {
    id: 'compact-display-math',
    name: 'Compact Display Math',
    description: 'Compact display math block around cursor or inside selection',
    keywords: ['latex', 'math', 'compact', 'format', 'equation', 'display', 'tidy'],
    transform: (input: string): string => {
      const trimmed = input.trim();
      const blocks = findDisplayMathBlocks(trimmed);
      if (
        blocks.length === 1 &&
        blocks[0].from === 0 &&
        /^[ \t]*(\^[^\s\r\n]+)?$/.test(trimmed.slice(blocks[0].to))
      ) {
        return formatMathBlock(trimmed);
      }
      return replaceMathBlocksInDocument(input, formatMathBlock);
    },
    resolveRange: findEnclosingMathBlock
  }
];

function runResolvedRangeSnippet(
  editor: Editor,
  snippet: TextTransformSnippet,
  resolveRange: RangeResolver
): TextTransformResult {
  const content = editor.getValue();
  const rawTargets: { from: number; to: number; isBlock: boolean }[] = [];

  for (const selection of editor.listSelections()) {
    const { from, to } = getSelectionRange(selection);
    const fromOff = editor.posToOffset(from);
    const toOff = editor.posToOffset(to);
    const resolved = resolveRange(content, fromOff, toOff);

    if (resolved) {
      rawTargets.push({ from: resolved.from, to: resolved.to, isBlock: true });
    } else if (fromOff < toOff) {
      rawTargets.push({ from: fromOff, to: toOff, isBlock: false });
    }
  }

  if (rawTargets.length === 0) {
    return { changedCount: 0, appliedOn: 'line' };
  }

  // Sort ascending by start offset (longest range first on ties) and merge overlapping ranges
  rawTargets.sort((a, b) => a.from - b.from || b.to - a.to);
  const merged: typeof rawTargets = [];
  for (const target of rawTargets) {
    const prev = merged[merged.length - 1];
    if (prev && target.from <= prev.to) {
      prev.isBlock =
        prev.isBlock && target.isBlock && prev.from === target.from && prev.to === target.to;
      prev.to = Math.max(prev.to, target.to);
    } else {
      merged.push({ ...target });
    }
  }

  const entries = merged.map(target => {
    const original = content.slice(target.from, target.to);
    const transformed = snippet.transform(original);
    return { ...target, original, transformed, changed: transformed !== original };
  });

  // Apply edits in descending order so earlier offsets stay valid
  let changedCount = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.changed) {
      editor.replaceRange(
        entry.transformed,
        editor.offsetToPos(entry.from),
        editor.offsetToPos(entry.to)
      );
      changedCount += 1;
    }
  }

  // Compute post-edit selections in ascending order with cumulative length delta
  let delta = 0;
  const finalSelections = entries.map(entry => {
    const finalFrom = entry.from + delta;
    const finalTo = finalFrom + entry.transformed.length;
    delta += entry.transformed.length - (entry.to - entry.from);
    return {
      anchor: editor.offsetToPos(finalFrom),
      head: editor.offsetToPos(finalTo)
    };
  });

  if (finalSelections.length === 1) {
    editor.setSelection(finalSelections[0].anchor, finalSelections[0].head);
  } else if (typeof editor.setSelections === 'function') {
    editor.setSelections(finalSelections);
  } else {
    const last = finalSelections[finalSelections.length - 1];
    editor.setSelection(last.anchor, last.head);
  }

  return {
    changedCount,
    appliedOn: entries.every(entry => entry.isBlock) ? 'block' : 'selection'
  };
}

export function runTextTransformSnippet(
  editor: Editor,
  snippet: TextTransformSnippet
): TextTransformResult {
  if (snippet.resolveRange) {
    return runResolvedRangeSnippet(editor, snippet, snippet.resolveRange);
  }

  const allSelections = editor.listSelections();
  const nonEmptySelections = allSelections.filter(selection => !isSelectionEmpty(selection));

  if (nonEmptySelections.length > 0) {
    const ranges = nonEmptySelections
      .map(selection => getSelectionRange(selection))
      .sort((a, b) => comparePositionsDesc(a.from, b.from));

    let changedCount = 0;
    for (const range of ranges) {
      const original = editor.getRange(range.from, range.to);
      const transformed = snippet.transform(original);
      if (transformed !== original) {
        editor.replaceRange(transformed, range.from, range.to);
        changedCount += 1;
      }
    }

    return {
      changedCount,
      appliedOn: 'selection'
    };
  }

  const cursor = editor.getCursor();
  const lineNumber = cursor.line;
  const originalLine = editor.getLine(lineNumber);
  const transformedLine = snippet.transform(originalLine);

  if (transformedLine !== originalLine) {
    editor.replaceRange(
      transformedLine,
      { line: lineNumber, ch: 0 },
      { line: lineNumber, ch: originalLine.length }
    );
    return {
      changedCount: 1,
      appliedOn: 'line'
    };
  }

  return {
    changedCount: 0,
    appliedOn: 'line'
  };
}
