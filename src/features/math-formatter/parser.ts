/**
 * parser.ts — Document-level math block scanner.
 *
 * Locates all display math (`$$ ... $$`) blocks in a Markdown document and
 * applies a formatter function to each, reconstructing the document text.
 *
 * Uses the existing `findDisplayMathBlocks` utility from utils/parse so we
 * share the same robust block-detection logic (handles code fences, inline
 * code, escaped dollars, etc.) without duplicating it.
 */

import { findDisplayMathBlocks, MathBlockRange } from 'utils/parse';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MathBlockFormatter = (rawBlock: string) => string;

export interface FormattedBlock {
  /** Start offset (inclusive) of the `$$` opening in the document string. */
  from: number;
  /** End offset (exclusive) of the `$$` closing in the document string. */
  to: number;
  /** The raw original block text. */
  original: string;
  /** The formatted block text. */
  formatted: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Applies `formatter` to every display math block in `documentText`.
 *
 * Returns a new string with all math blocks replaced by their formatted
 * equivalents. Blocks that produce no change are left untouched.
 */
export function replaceMathBlocksInDocument(
  documentText: string,
  formatter: MathBlockFormatter
): string {
  const ranges = findDisplayMathBlocks(documentText);

  if (ranges.length === 0) return documentText;

  // Process in reverse order so offsets remain valid as we splice
  const parts: { from: number; to: number; replacement: string }[] = [];

  for (const range of ranges) {
    const rawBlock = documentText.slice(range.from, range.to);
    const formatted = formatter(rawBlock);
    if (formatted !== rawBlock) {
      parts.push({ from: range.from, to: range.to, replacement: formatted });
    }
  }

  if (parts.length === 0) return documentText;

  // Apply replacements from end → start to preserve offsets
  parts.sort((a, b) => b.from - a.from);

  let result = documentText;
  for (const { from, to, replacement } of parts) {
    result = result.slice(0, from) + replacement + result.slice(to);
  }

  return result;
}

/**
 * Returns the list of all display math blocks in `documentText` together with
 * their formatted versions. Useful for previewing changes.
 */
export function collectFormattedBlocks(
  documentText: string,
  formatter: MathBlockFormatter
): FormattedBlock[] {
  const ranges = findDisplayMathBlocks(documentText);
  return ranges.map(range => {
    const original = documentText.slice(range.from, range.to);
    return {
      from: range.from,
      to: range.to,
      original,
      formatted: formatter(original)
    };
  });
}

/**
 * Locates the enclosing display math block that contains the given character
 * range (or cursor position when startOffset === endOffset).
 *
 * Expands hit detection to include:
 * - Leading horizontal whitespace on the opening line
 * - Trailing block IDs (`^block-id`) and trailing whitespace on the closing line
 * - A single trailing newline when a non-empty selection ends at column 0 of the next line
 *
 * Returns `null` if the range is not enclosed within any display math block.
 */
export function findEnclosingMathBlock(
  documentText: string,
  startOffset: number,
  endOffset = startOffset
): MathBlockRange | null {
  const minOffset = Math.min(startOffset, endOffset);
  const maxOffset = Math.max(startOffset, endOffset);
  const ranges = findDisplayMathBlocks(documentText);

  for (const range of ranges) {
    // Include optional trailing block ID on the same line (consistent with formatter.ts, CRLF-safe)
    const afterClosing = documentText.slice(range.to);
    const blockIdMatch = afterClosing.match(/^[ \t]*(\^[^\s\r\n]+)/);
    const effectiveTo = blockIdMatch ? range.to + blockIdMatch[0].length : range.to;

    // Leading horizontal whitespace only on opening line (do NOT include `>` callout prefix)
    const lineStart = documentText.lastIndexOf('\n', range.from - 1) + 1;
    const leadingText = documentText.slice(lineStart, range.from);
    const detectFrom = /^[ \t]*$/.test(leadingText) ? lineStart : range.from;

    // Trailing horizontal whitespace (and \r for CRLF) on closing line
    const nextNewline = documentText.indexOf('\n', effectiveTo);
    const lineEnd = nextNewline === -1 ? documentText.length : nextNewline;
    const trailingText = documentText.slice(effectiveTo, lineEnd);
    const detectTo = /^[ \t\r]*$/.test(trailingText) ? lineEnd : effectiveTo;

    // Allow a single trailing newline when a non-empty selection starts before detectTo (e.g. Shift+Down)
    const detectToWithNewline = nextNewline !== -1 && detectTo === lineEnd ? lineEnd + 1 : detectTo;
    const withinEnd =
      maxOffset <= detectTo || (minOffset < detectTo && maxOffset <= detectToWithNewline);

    if (minOffset >= detectFrom && withinEnd) {
      return { from: range.from, to: effectiveTo };
    }
  }

  return null;
}

/**
 * Given a cursor position (character offset) in `documentText`, returns the
 * range of the display math block that contains the cursor, or `null` if the
 * cursor is not inside a display math block.
 */
export function findBlockAtCursor(
  documentText: string,
  cursorOffset: number
): MathBlockRange | null {
  return findEnclosingMathBlock(documentText, cursorOffset, cursorOffset);
}
