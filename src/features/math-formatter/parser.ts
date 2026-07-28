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

import { findDisplayMathBlocks } from 'utils/parse';

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
 * Given a cursor position (character offset) in `documentText`, returns the
 * range of the display math block that contains the cursor, or `null` if the
 * cursor is not inside a display math block.
 */
export function findBlockAtCursor(
  documentText: string,
  cursorOffset: number
): { from: number; to: number } | null {
  const ranges = findDisplayMathBlocks(documentText);
  for (const range of ranges) {
    if (cursorOffset >= range.from && cursorOffset <= range.to) {
      return range;
    }
  }
  return null;
}
