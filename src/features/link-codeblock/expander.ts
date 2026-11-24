import { formatAsCodeBlock } from './formatter';
import { parseStandaloneWikiLink } from './parser';
import type { NoteResolver } from './resolver';

export interface ExpansionResult {
  lines: string[];
  expandedCount: number;
  matchedLinkCount: number;
  unresolvedLinks: string[];
}

/**
 * Expands any standalone wiki-link lines in `lines` into fenced code blocks using `resolver`.
 * Non-matching lines and unresolved links are preserved untouched.
 */
export async function expandStandaloneLinksInLines(
  lines: string[],
  sourcePath: string,
  resolver: NoteResolver
): Promise<ExpansionResult> {
  const outputLines: string[] = [];
  let expandedCount = 0;
  let matchedLinkCount = 0;
  const unresolvedLinks: string[] = [];

  for (const line of lines) {
    const parsed = parseStandaloneWikiLink(line);
    if (!parsed) {
      outputLines.push(line);
      continue;
    }

    matchedLinkCount += 1;
    const resolved = await resolver.resolve(parsed.linkTarget, sourcePath);
    if (!resolved) {
      outputLines.push(line);
      unresolvedLinks.push(parsed.linkTarget);
      continue;
    }

    outputLines.push(formatAsCodeBlock(resolved.basename, resolved.content));
    expandedCount += 1;
  }

  return {
    lines: outputLines,
    expandedCount,
    matchedLinkCount,
    unresolvedLinks
  };
}
