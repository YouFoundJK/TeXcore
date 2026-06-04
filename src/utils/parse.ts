export function trimMathText(text: string): string {
  return text.match(/\$\$([\s\S]*)\$\$/)?.[1].trim() ?? '';
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
