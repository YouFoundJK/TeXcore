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

export const EQ_ID_COMMENT_REGEX = /%\s*id:\s*(eq-[\w.-]+)/;

/**
 * Returns true if the character at `pos` is preceded by an odd number of backslashes.
 */
export function isEscapedAt(text: string, pos: number): boolean {
  let count = 0;
  let k = pos - 1;
  while (k >= 0 && text[k] === '\\') {
    count++;
    k--;
  }
  return count % 2 !== 0;
}

/**
 * Computes the character offset of the start of each line in `content`.
 */
export function computeLineStarts(content: string): number[] {
  const starts: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Converts a character offset to 0-based `{ line, col }` using precomputed `lineStarts`.
 */
export function offsetToLineCol(
  lineStarts: number[],
  offset: number
): { line: number; col: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return { line: lo, col: offset - lineStarts[lo] };
}

/**
 * Extracts an equation ID from a math block's text and optional trailing text.
 */
export function extractEquationId(
  blockText: string,
  trailingAfterBlock?: string,
  allowAnyLegacyId = false
): string | undefined {
  const commentMatch = blockText.match(EQ_ID_COMMENT_REGEX);
  if (commentMatch) return commentMatch[1];

  const labelMatch = blockText.match(/\\label\{(eq-[\w.-]+)\}/);
  if (labelMatch) return labelMatch[1];

  if (trailingAfterBlock) {
    const idGroup = allowAnyLegacyId ? '([a-zA-Z0-9\\-_]+)' : '(eq-[\\w.-]+)';
    const sameLineRe = new RegExp(`^[ \\t]*\\^${idGroup}(?:[ \\t]*(?:\\r?\\n|$))`);
    const sameLineMatch = trailingAfterBlock.match(sameLineRe);
    if (sameLineMatch) return sameLineMatch[1];

    const nextLineRe = new RegExp(`^[ \\t]*\\r?\\n[ \\t]*\\^${idGroup}(?:[ \\t]*(?:\\r?\\n|$))`);
    const nextLineMatch = trailingAfterBlock.match(nextLineRe);
    if (nextLineMatch) return nextLineMatch[1];
  }

  return undefined;
}

/**
 * Comment-aware check for unescaped `\tag{...}` or `\tag*{...}` outside `%` comments.
 */
export function hasNonCommentTag(text: string): boolean {
  let i = 0;
  while (i < text.length) {
    if (text[i] === '%' && !isEscapedAt(text, i)) {
      const nl = text.indexOf('\n', i);
      i = nl === -1 ? text.length : nl + 1;
      continue;
    }
    if (
      text[i] === '\\' &&
      !isEscapedAt(text, i) &&
      text.startsWith('\\tag', i) &&
      (i + 4 >= text.length || !/[a-zA-Z]/.test(text[i + 4]))
    ) {
      let j = i + 4;
      if (j < text.length && text[j] === '*') j++;
      while (j < text.length && /[ \t]/.test(text[j])) j++;
      if (j < text.length && text[j] === '{') {
        return true;
      }
    }
    i++;
  }
  return false;
}

const HARD_BOUNDARY_LINE_REGEXES: readonly RegExp[] = [
  /^[ \t]*#{1,6}[ \t]/,
  /^[ \t]*>[ \t]*\[!/,
  /^[ \t]*\|[ \t:|-]+\|[ \t]*$/,
  /(?<!\\)\[\[(?:#\^eq-[\w.-]+|[^\]\n]+\|[^\]\n]+|[A-Za-z][A-Za-z0-9 _'-]{2,}(?:#[^\]\n]+)?)\]\]/
];

/**
 * Returns true if the inner content of a math block contains hard Markdown
 * structural markers (headings, callout headers, fenced code blocks, table
 * separators, or Obsidian wikilinks) that indicate a desynchronized/corrupted math block.
 */
export function isLikelyCorruptedMathBlock(inner: string): boolean {
  if (/^[ \t]*(?:```|~~~)/m.test(inner)) return true;
  const lines = inner.split(/\r?\n/);
  for (const line of lines) {
    if (isHardMarkdownBoundaryLine(line)) return true;
  }
  return false;
}

function isHardMarkdownBoundaryLine(line: string): boolean {
  return HARD_BOUNDARY_LINE_REGEXES.some(re => re.test(line));
}

function collectSkipRanges(text: string): MathBlockRange[] {
  const ranges: MathBlockRange[] = [];

  // 1. YAML frontmatter at offset 0
  const fmMatch = text.match(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/);
  if (fmMatch) {
    ranges.push({ from: 0, to: fmMatch[0].length });
  }

  // 2. Fenced code blocks (``` or ~~~, 3+ chars, optional callout > prefix)
  const lineStarts = computeLineStarts(text);
  let activeFence: { char: string; len: number; from: number } | null = null;
  for (let li = 0; li < lineStarts.length; li++) {
    const lineStart = lineStarts[li];
    if (ranges.length > 0 && lineStart < ranges[0].to) continue;
    const nextStart = li + 1 < lineStarts.length ? lineStarts[li + 1] : text.length;
    const rawLine = text.slice(lineStart, nextStart).replace(/\r?\n$/, '');
    const stripped = rawLine.replace(/^\s*(?:>\s?)*/, '');
    const fenceMatch = stripped.match(/^(`{3,}|~{3,})(.*)$/);
    if (!activeFence) {
      if (fenceMatch) {
        const ch = fenceMatch[1][0];
        // Backtick info strings cannot contain backticks (CommonMark)
        if (ch !== '`' || !fenceMatch[2].includes('`')) {
          activeFence = { char: ch, len: fenceMatch[1].length, from: lineStart };
        }
      }
    } else if (
      fenceMatch &&
      fenceMatch[1][0] === activeFence.char &&
      fenceMatch[1].length >= activeFence.len &&
      fenceMatch[2].trim() === ''
    ) {
      ranges.push({ from: activeFence.from, to: nextStart });
      activeFence = null;
    }
  }
  if (activeFence) {
    ranges.push({ from: activeFence.from, to: text.length });
  }

  const isInsideRange = (start: number, end: number): boolean =>
    ranges.some(r => start >= r.from && end <= r.to);

  // 3. HTML comments <!-- ... -->
  const htmlCommentRegex = /<!--[\s\S]*?-->/g;
  let htmlMatch: RegExpExecArray | null;
  while ((htmlMatch = htmlCommentRegex.exec(text)) !== null) {
    if (!isInsideRange(htmlMatch.index, htmlMatch.index + htmlMatch[0].length)) {
      ranges.push({ from: htmlMatch.index, to: htmlMatch.index + htmlMatch[0].length });
    }
  }

  // 4. Inline code spans
  const inlineCodeRegex = /(`+)(?:(?!\1|(?:\r\n|\n){2})[\s\S])+?\1/g;
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineCodeRegex.exec(text)) !== null) {
    if (!isInsideRange(inlineMatch.index, inlineMatch.index + inlineMatch[0].length)) {
      ranges.push({ from: inlineMatch.index, to: inlineMatch.index + inlineMatch[0].length });
    }
  }

  ranges.sort((a, b) => a.from - b.from);
  return ranges;
}

function isSandwichedDollars(text: string, pos: number, dCount: number): boolean {
  if (dCount !== 2) return false;
  const prevChar = pos > 0 ? text[pos - 1] : '';
  const nextChar = pos + dCount < text.length ? text[pos + dCount] : '';
  return Boolean(
    prevChar && !/\s|\$|>|\|/.test(prevChar) && nextChar && !/\s|\$|<|\|/.test(nextChar)
  );
}

/**
 * Finds all display math ($$ ... $$) block ranges in the given markdown text,
 * correctly ignoring YAML frontmatter, fenced/inline code blocks, HTML comments,
 * inline math ($ ... $), and escaped dollar signs (\$ or \\$).
 */
export function findDisplayMathBlocks(text: string): MathBlockRange[] {
  const skipRanges = collectSkipRanges(text);
  const mathBlockRanges: MathBlockRange[] = [];
  const blankLineRe = /\r?\n[ \t]*\r?\n/y;

  let pos = 0;
  let skipIdx = 0;
  let state: 'OUTSIDE' | 'INLINE' | 'DISPLAY' = 'OUTSIDE';
  let displayStartPos = -1;

  const getUnescapedDollarCount = (p: number): number => {
    if (p >= text.length || text[p] !== '$' || isEscapedAt(text, p)) return 0;
    let count = 0;
    while (p + count < text.length && text[p + count] === '$' && !isEscapedAt(text, p + count)) {
      count++;
    }
    return count;
  };

  while (pos < text.length) {
    while (skipIdx < skipRanges.length && skipRanges[skipIdx].to <= pos) {
      skipIdx++;
    }
    if (
      skipIdx < skipRanges.length &&
      pos >= skipRanges[skipIdx].from &&
      pos < skipRanges[skipIdx].to
    ) {
      if (state === 'INLINE' || state === 'DISPLAY') {
        state = 'OUTSIDE';
        displayStartPos = -1;
      }
      pos = skipRanges[skipIdx].to;
      continue;
    }

    // In DISPLAY state, abort unclosed display math if we hit a hard Markdown boundary at line start
    if (state === 'DISPLAY' && pos > 0 && text[pos - 1] === '\n') {
      const nextNl = text.indexOf('\n', pos);
      const lineEnd = nextNl === -1 ? text.length : nextNl;
      const line = text.slice(pos, lineEnd).replace(/\r$/, '');
      if (isHardMarkdownBoundaryLine(line)) {
        state = 'OUTSIDE';
        displayStartPos = -1;
        continue;
      }
    }

    const dCount = getUnescapedDollarCount(pos);

    if (state === 'OUTSIDE') {
      if (dCount === 2) {
        if (isSandwichedDollars(text, pos, dCount)) {
          state = 'INLINE';
          pos += 1;
        } else {
          state = 'DISPLAY';
          displayStartPos = pos;
          pos += 2;
        }
      } else if (dCount > 2) {
        pos += dCount;
      } else if (dCount === 1) {
        const nextChar = text[pos + 1];
        if (nextChar && !/\s|\$/.test(nextChar)) {
          state = 'INLINE';
        }
        pos += 1;
      } else {
        pos += 1;
      }
    } else if (state === 'INLINE') {
      if (text[pos] === '\r' || text[pos] === '\n') {
        blankLineRe.lastIndex = pos;
        const blankMatch = blankLineRe.exec(text);
        if (blankMatch) {
          state = 'OUTSIDE';
          pos += blankMatch[0].length;
          continue;
        }
      }

      if (dCount === 2) {
        if (isSandwichedDollars(text, pos, dCount)) {
          state = 'INLINE';
          pos += 1;
        } else {
          state = 'DISPLAY';
          displayStartPos = pos;
          pos += 2;
        }
      } else if (dCount > 2) {
        pos += dCount;
      } else if (dCount === 1) {
        const prevChar = text[pos - 1];
        if (prevChar && !/\s/.test(prevChar)) {
          state = 'OUTSIDE';
        }
        pos += 1;
      } else {
        pos += 1;
      }
    } else if (state === 'DISPLAY') {
      if (dCount === 2) {
        mathBlockRanges.push({
          from: displayStartPos,
          to: pos + 2
        });
        state = 'OUTSIDE';
        displayStartPos = -1;
        pos += 2;
      } else if (dCount > 2) {
        pos += dCount;
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

/** Strips the callout/blockquote prefix (`> `) from a single line. */
export function stripCalloutPrefix(line: string): string {
  return line.replace(CALLOUT_PREFIX_REGEX, '');
}

/** Check if a line consists ONLY of a callout prefix (and whitespace), making it a "structural" line. */
export function isStructuralCalloutLine(line: string): boolean {
  // Matches start of line, optional prefix chars, end of line.
  return /^\s*(?:>\s?)*$/.test(line);
}

export const TOP_LEVEL_EQ_ENVS = new Set([
  'align',
  'align*',
  'gather',
  'gather*',
  'eqnarray',
  'eqnarray*',
  'flalign',
  'flalign*',
  'alignat',
  'alignat*',
  'multline',
  'multline*',
  'subequations',
  'subequations*',
  'equation',
  'equation*',
  'displaymath',
  'displaymath*',
  'math',
  'math*'
]);

/**
 * Splits a LaTeX math text into top-level equation rows by '\\', ignoring
 * line breaks that occur inside nested environments (like pmatrix, matrix, cases, array, etc.)
 * or inside LaTeX comments.
 */
export function splitMathIntoTopLevelRows(mathText: string): string[] {
  const TOKEN_REGEX =
    /\\%|%[^\n]*|\\begin\{\s*([a-zA-Z*]+)\s*\}|\\end\{\s*([a-zA-Z*]+)\s*\}|(\\\\(?:\s*\[[^\]]*\])?)/g;

  const envStack: string[] = [];
  const parts: string[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(mathText)) !== null) {
    const beginEnv = match[1];
    const endEnv = match[2];
    const lineBreak = match[3];

    if (beginEnv) {
      envStack.push(beginEnv);
    } else if (endEnv) {
      if (envStack.length > 0) {
        const idx = envStack.lastIndexOf(endEnv);
        if (idx !== -1) {
          envStack.splice(idx);
        } else {
          envStack.pop();
        }
      }
    } else if (lineBreak) {
      const isTopLevel = envStack.every(env => TOP_LEVEL_EQ_ENVS.has(env));
      if (isTopLevel) {
        const breakStart = match.index;
        const breakEnd = TOKEN_REGEX.lastIndex;
        parts.push(mathText.substring(lastIndex, breakStart));
        parts.push(mathText.substring(breakStart, breakEnd));
        lastIndex = breakEnd;
      }
    }
  }

  parts.push(mathText.substring(lastIndex));
  return parts;
}

/**
 * Finds the first top-level \end{<env>} in text where <env> is a top-level equation container
 * (e.g. align, gather), ignoring nested environment closes like \end{pmatrix} or comments.
 */
export function findTopLevelEndEnvMatch(text: string): { index: number; matchText: string } | null {
  const TOKEN_REGEX = /\\%|\\\\|%[^\n]*|\\end\{\s*([a-zA-Z*]+)\s*\}/g;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_REGEX.exec(text)) !== null) {
    const endEnv = match[1];
    if (endEnv && TOP_LEVEL_EQ_ENVS.has(endEnv)) {
      return {
        index: match.index,
        matchText: match[0]
      };
    }
  }
  return null;
}
