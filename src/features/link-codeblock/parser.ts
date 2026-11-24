import type { Editor } from 'obsidian';

export interface ParsedStandaloneWikiLink {
  linkTarget: string;
  leadingWhitespace: string;
}

export interface LineRange {
  startLine: number;
  endLine: number;
}

const STANDALONE_WIKILINK_REGEX = /^([ \t]*)\[\[([^[\]\r\n]+)\]\][ \t]*$/;

/**
 * Parses a line that consists solely of a standalone wiki-link (`[[target]]` or `[[target|alias]]`),
 * optionally surrounded by spaces or tabs.
 * Rejects embeds (`![[...]]`), heading/block links (`#...`), empty targets, and lines with extra text.
 */
export function parseStandaloneWikiLink(line: string): ParsedStandaloneWikiLink | null {
  const match = STANDALONE_WIKILINK_REGEX.exec(line);
  if (!match) {
    return null;
  }

  const leadingWhitespace = match[1];
  const inner = match[2];

  const pipeIndex = inner.indexOf('|');
  const rawTarget = pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner;
  const linkTarget = rawTarget.trim();

  if (!linkTarget || linkTarget.includes('#')) {
    return null;
  }

  return {
    linkTarget,
    leadingWhitespace
  };
}

/**
 * Determines the 0-based inclusive line range targeted by the current editor cursor or selection.
 */
export function getTargetLineRange(
  editor: Pick<Editor, 'somethingSelected' | 'getCursor'>
): LineRange {
  if (!editor.somethingSelected()) {
    const cursor = editor.getCursor();
    return { startLine: cursor.line, endLine: cursor.line };
  }

  const from = editor.getCursor('from');
  const to = editor.getCursor('to');
  const endLine = to.ch === 0 && to.line > from.line ? to.line - 1 : to.line;

  return { startLine: from.line, endLine };
}
