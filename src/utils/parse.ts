export function trimMathText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  return text.match(/\$\$([\s\S]*)\$\$/)?.[1].trim() ?? '';
}

export interface MathBlockRange {
  from: number;
  to: number;
}

/**
 * Finds all display math ($$ ... $$) block ranges in the given markdown text,
 * correctly ignoring fenced/inline code blocks, inline math ($ ... $),
 * and escaped dollar signs (\$ or \\$).
 */
export function findDisplayMathBlocks(text: string): MathBlockRange[] {
  const codeBlockRanges: MathBlockRange[] = [];

  const fencedCodeRegex = /^```[\s\S]*?^```/gm;
  let fencedMatch: RegExpExecArray | null;
  while ((fencedMatch = fencedCodeRegex.exec(text)) !== null) {
    codeBlockRanges.push({
      from: fencedMatch.index,
      to: fencedMatch.index + fencedMatch[0].length
    });
  }

  const inlineCodeRegex = /(`+)(?:(?!\1|(?:\r\n|\n){2})[\s\S])+?\1/g;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineCodeRegex.exec(text)) !== null) {
    const currentMatch = inlineMatch;
    const isInsideFencedBlock = codeBlockRanges.some(
      range =>
        currentMatch.index >= range.from && currentMatch.index + currentMatch[0].length <= range.to
    );
    if (!isInsideFencedBlock) {
      codeBlockRanges.push({
        from: currentMatch.index,
        to: currentMatch.index + currentMatch[0].length
      });
    }
  }

  const mathBlockRanges: MathBlockRange[] = [];

  let pos = 0;
  let state: 'OUTSIDE' | 'INLINE' | 'DISPLAY' = 'OUTSIDE';
  let displayStartPos = -1;

  const isEscaped = (p: number): boolean => {
    let count = 0;
    let k = p - 1;
    while (k >= 0 && text[k] === '\\') {
      count++;
      k--;
    }
    return count % 2 !== 0;
  };

  const getUnescapedDollarCount = (p: number): number => {
    if (p >= text.length || isEscaped(p) || text[p] !== '$') return 0;
    let count = 0;
    while (p + count < text.length && text[p + count] === '$' && !isEscaped(p + count)) {
      count++;
    }
    return count;
  };

  while (pos < text.length) {
    // Skip code block ranges
    const codeRange = codeBlockRanges.find(r => pos >= r.from && pos < r.to);
    if (codeRange) {
      if (state === 'INLINE') {
        state = 'OUTSIDE';
      }
      pos = codeRange.to;
      continue;
    }

    const dCount = getUnescapedDollarCount(pos);

    if (state === 'OUTSIDE') {
      if (dCount >= 2) {
        const prevChar = pos > 0 ? text[pos - 1] : '';
        const nextChar = pos + dCount < text.length ? text[pos + dCount] : '';
        const isSandwiched =
          prevChar && !/\s|\$/.test(prevChar) && nextChar && !/\s|\$/.test(nextChar);

        if (isSandwiched) {
          // Adjacent inline math delimiters like $a$$b$ or $[a]$$^2$
          state = 'INLINE';
          pos += 1;
        } else {
          state = 'DISPLAY';
          displayStartPos = pos;
          pos += 2;
        }
      } else if (dCount === 1) {
        // Check if valid inline math start: next char is non-whitespace and not $
        const nextChar = text[pos + 1];
        if (nextChar && !/\s|\$/.test(nextChar)) {
          state = 'INLINE';
          pos += 1;
        } else {
          pos += 1;
        }
      } else {
        pos += 1;
      }
    } else if (state === 'INLINE') {
      // Inline math cannot span across blank lines (\n\n)
      if (text[pos] === '\n' && text[pos + 1] === '\n') {
        state = 'OUTSIDE';
        pos += 2;
      } else if (dCount >= 1) {
        // Check if valid inline math end: prev char is non-whitespace
        const prevChar = text[pos - 1];
        if (prevChar && !/\s/.test(prevChar)) {
          state = 'OUTSIDE';
          pos += 1;
        } else {
          pos += 1;
        }
      } else {
        pos += 1;
      }
    } else if (state === 'DISPLAY') {
      if (dCount >= 2) {
        mathBlockRanges.push({
          from: displayStartPos,
          to: pos + 2
        });
        state = 'OUTSIDE';
        pos += 2;
      } else {
        pos += 1;
      }
    }
  }

  return mathBlockRanges;
}

/** Parse the given markdown text and returns all comments in it as an array of lines. */
export function parseMarkdownComment(markdown: string): string[] {
  const comments: string[] = [];
  const pattern = /%%([\s\S]*?)%%/g;
  let result;
  while ((result = pattern.exec(markdown))) {
    for (let line of result[1].split('\n')) {
      line = line.trim();
      if (line) comments.push(line);
    }
  }
  return comments;
}

/** Parse an one-line YAML-like string into a key-value pair. */
export function parseYamlLike(line: string): Record<string, string | undefined> | null {
  const result = line.match(/^(?<key>.*?):(?<value>.*)$/)?.groups;
  if (!result) return null;
  return { [result.key.trim()]: result.value.trim() };
}

/**
 * Regex to identify the callout/blockquote prefix at the start of a line.
 * Matches standard "> " or nested ">> " or even "   > ".
 */
export const CALLOUT_PREFIX_REGEX = /^(\s*(?:>\s?)+)/;

/** Extracts the callout prefix from a line, or returns empty string. */
export function getCalloutPrefix(line: string): string {
  const match = line.match(CALLOUT_PREFIX_REGEX);
  return match ? match[0] : '';
}

/** Check if a line consists ONLY of a callout prefix (and whitespace), making it a "structural" line. */
export function isStructuralCalloutLine(line: string): boolean {
  // Matches start of line, optional prefix chars, end of line.
  return /^\s*(?:>\s?)*$/.test(line);
}
