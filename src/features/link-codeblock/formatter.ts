/**
 * Computes a backtick fence string longer than the longest contiguous run of backticks in `content`,
 * with a minimum length of 3.
 */
export function computeCodeFence(content: string): string {
  const matches = content.match(/`+/g);
  const maxRun = matches ? Math.max(...matches.map(m => m.length)) : 0;
  return '`'.repeat(Math.max(3, maxRun + 1));
}

/**
 * Wraps `rawContent` inside a fenced code block named `fileName`.
 * Preserves all raw content (including YAML frontmatter) verbatim, normalizing CRLF to LF
 * and stripping at most one trailing newline before the closing fence.
 */
export function formatAsCodeBlock(fileName: string, rawContent: string): string {
  const normalized = rawContent.replace(/\r\n/g, '\n').replace(/\n$/, '');
  const fence = computeCodeFence(normalized);

  if (normalized.length === 0) {
    return `${fence}${fileName}\n${fence}`;
  }

  return `${fence}${fileName}\n${normalized}\n${fence}`;
}
