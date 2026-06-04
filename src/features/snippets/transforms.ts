import type { Editor, EditorPosition, EditorSelection } from 'obsidian';

export interface TextTransformSnippet {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  transform: (input: string) => string;
}

export interface TextTransformResult {
  changedCount: number;
  appliedOn: 'selection' | 'line';
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
      const normalized = highlightedText.replace(/[\.,]$/, '');
      return `\"${normalized}.\" \u2014 ${trailingText}`;
    }
  );
}

function cleanDoubleDollarSymbols(input: string): string {
  return input.replace(/\$\$/g, '$');
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
  }
];

export function runTextTransformSnippet(
  editor: Editor,
  snippet: TextTransformSnippet
): TextTransformResult {
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
