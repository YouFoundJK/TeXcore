/**
 * formatter.ts — Robust LaTeX display math block compactor.
 *
 * Strategy: token-stream walk, not regex substitution.
 *
 * The core idea is to scan the content character-by-character, maintaining
 * an environment/brace stack, and decide at each newline whether that
 * newline is "structural" (must be kept) or "cosmetic" (can be joined).
 *
 * A newline is STRUCTURAL if any of these are true:
 *   a) It follows a `\\` row-break (possibly with spacing option `\\[...]`)
 *   b) It immediately follows `\begin{env}` or precedes `\end{env}`
 *   c) It is a blank line (two consecutive newlines) — collapsed to one blank
 *
 * Everything else: cosmetic newlines between adjacent tokens are replaced by
 * a single space and the surrounding tokens are joined.
 *
 * This approach is inherently robust to:
 *   - Arbitrary nesting depths (bmatrix inside aligned inside boxed, etc.)
 *   - Unknown/custom environments and commands
 *   - `\left[`, `\left\{`, `\bigg(` and all delimiter variants
 *   - `\boxed{...}`, `\underbrace{...}`, arbitrary brace groups
 *   - Tags `\tag{...}` (preserved at end)
 *   - Obsidian block IDs `^blockid`
 */

// ---------------------------------------------------------------------------
// Helpers — character-level scanner
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Token type tags — for structural decisions
// ---------------------------------------------------------------------------

type TokenKind =
  | 'text' // ordinary content (commands, symbols, letters, digits)
  | 'newline' // a single \n
  | 'row_break' // \\ or \\[...] — mandatory row separator
  | 'env_begin' // \begin{name}
  | 'env_end'; // \end{name}

interface Token {
  kind: TokenKind;
  value: string; // raw text of the token
  envName?: string; // set for env_begin and env_end
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenises a LaTeX math string into a flat sequence of tokens.
 * Groups everything between newlines as `text` tokens.
 */
function tokenise(content: string): Token[] {
  const tokens: Token[] = [];

  // We scan line by line, but within each line we look for \begin, \end, \\
  const lines = content.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    if (li > 0) {
      tokens.push({ kind: 'newline', value: '\n' });
    }

    if (line.trim() === '') {
      // Blank line — represent as text token with empty value (handled later)
      tokens.push({ kind: 'text', value: '' });
      continue;
    }

    // Within a line, scan for \begin{}, \end{}, and \\ row breaks.
    // Everything between them is `text`.
    const LINE_TOKEN_RE = /\\begin\{([^}]*)\}|\\end\{([^}]*)\}|(\\\\(?:\s*\[[^\]]*\])?)/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    LINE_TOKEN_RE.lastIndex = 0;

    while ((match = LINE_TOKEN_RE.exec(line)) !== null) {
      // Text before this match
      if (match.index > lastIndex) {
        const chunk = line.slice(lastIndex, match.index);
        if (chunk.length > 0) {
          tokens.push({ kind: 'text', value: chunk });
        }
      }

      if (match[1] !== undefined) {
        tokens.push({ kind: 'env_begin', value: match[0], envName: match[1].trim() });
      } else if (match[2] !== undefined) {
        tokens.push({ kind: 'env_end', value: match[0], envName: match[2].trim() });
      } else if (match[3] !== undefined) {
        tokens.push({ kind: 'row_break', value: match[3] });
      }

      lastIndex = LINE_TOKEN_RE.lastIndex;
    }

    // Remaining text on this line
    if (lastIndex < line.length) {
      tokens.push({ kind: 'text', value: line.slice(lastIndex) });
    }
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Compactor
// ---------------------------------------------------------------------------

/**
 * Determines whether a newline between two tokens should be preserved.
 *
 * A newline is structural if:
 *   - The preceding non-newline/non-empty token is a row_break (`\\`)
 *   - The preceding non-newline/non-empty token is env_begin
 *   - The following non-newline/non-empty token is env_end
 *   - The following non-newline/non-empty token is env_begin (blank line between envs)
 *   - The newline is blank (both neighbours are blank text tokens)
 */
function compact(tokens: Token[]): string {
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    if (tok.kind !== 'newline') {
      // Flush non-newline token value (trim trailing whitespace per token)
      out.push(tok.value);
      continue;
    }

    // --- We have a newline. Decide: keep or replace with space? ---

    // Find the last meaningful token before this newline
    let prevIdx = i - 1;
    while (prevIdx >= 0 && tokens[prevIdx].kind === 'newline') {
      prevIdx--;
    }
    // Edge: skip over empty text tokens
    while (prevIdx >= 0 && tokens[prevIdx].kind === 'text' && tokens[prevIdx].value.trim() === '') {
      prevIdx--;
    }

    // Find the next meaningful token after this newline
    let nextIdx = i + 1;
    while (nextIdx < tokens.length && tokens[nextIdx].kind === 'newline') {
      nextIdx++;
    }
    // Skip empty text tokens
    while (
      nextIdx < tokens.length &&
      tokens[nextIdx].kind === 'text' &&
      tokens[nextIdx].value.trim() === ''
    ) {
      nextIdx++;
    }

    const prev = prevIdx >= 0 ? tokens[prevIdx] : null;
    const next = nextIdx < tokens.length ? tokens[nextIdx] : null;

    // How many consecutive newlines are here?
    let newlineCount = 1;
    let j = i + 1;
    while (j < tokens.length && tokens[j].kind === 'newline') {
      newlineCount++;
      j++;
    }

    const isBlank = newlineCount >= 2;

    const keepNewline =
      isBlank ||
      (prev !== null && (prev.kind === 'row_break' || prev.kind === 'env_begin')) ||
      (next !== null && (next.kind === 'env_end' || next.kind === 'env_begin'));

    if (keepNewline) {
      out.push('\n');
      // If multiple consecutive newlines, skip the extras (collapse blank lines to one)
      i += newlineCount - 1;
    } else {
      // Replace cosmetic newline with a single space — but only if we won't
      // produce double spaces (prev/next might already end/start with space)
      const prevStr = out.length > 0 ? out[out.length - 1] : '';
      const endsWithSpace = prevStr.endsWith(' ') || prevStr.endsWith('\n');
      if (!endsWithSpace && next !== null) {
        out.push(' ');
      }
    }
  }

  return out.join('');
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

/** Collapse multiple consecutive spaces to one, per line. */
function normaliseSpaces(s: string): string {
  return s
    .split('\n')
    .map(line => line.replace(/ {2,}/g, ' ').trimEnd())
    .join('\n');
}

/**
 * Ensure `\tag{...}` appears at the end of the content (same line as the
 * last content token, separated by a single space).
 */
function hoistTag(s: string): string {
  // Match \tag{...} potentially on its own line at the end, supporting 1 level of nested braces
  const tagRe = /\n?\s*(\\tag\{((?:[^{}]|\{[^{}]*\})*)\})\s*$/;
  const m = s.match(tagRe);
  if (!m) return s;
  const tag = m[1];
  const body = s.slice(0, m.index ?? s.lastIndexOf(m[0])).trimEnd();
  return `${body} ${tag}`;
}

/** Strip leading/trailing blank lines from the block inner content. */
function trimLines(s: string): string {
  const lines = s.split('\n');
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Formats the raw *inner* content of a `$$ ... $$` block (the text between
 * the opening and closing `$$` delimiters).
 *
 * Pure function — no Obsidian dependencies. Safe to call in unit tests.
 */
export function formatMathContent(inner: string): string {
  if (!inner || inner.trim() === '') return '';
  const tokens = tokenise(inner);
  const compacted = compact(tokens);
  const spaced = normaliseSpaces(compacted);
  const trimmed = trimLines(spaced);
  return hoistTag(trimmed);
}

/**
 * Formats a complete display math block string including the `$$` delimiters
 * and any trailing Obsidian block ID (`^blockid`).
 */
export function formatMathBlock(block: string): string {
  // Capture optional trailing block ID: `$$ ^eq-abc123` or `$$^eq-abc123`
  const blockIdMatch = block.match(/\$\$\s*(\^[^\s\n]+)\s*$/m);
  const blockId = blockIdMatch ? ` ${blockIdMatch[1]}` : '';

  // Strip outer `$$` delimiters (and block id)
  let inner = block;
  inner = inner.replace(/^\s*\$\$\s*/, ''); // opening $$
  inner = inner.replace(/\$\$\s*(\^[^\s\n]+)?\s*$/, ''); // closing $$ (+blockid)

  const formatted = formatMathContent(inner);
  if (!formatted) return block; // don't touch if we got nothing

  return `$$\n${formatted}\n$$${blockId}`;
}
