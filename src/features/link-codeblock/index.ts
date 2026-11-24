import type { App, Editor, TFile } from 'obsidian';
import { showNotice } from 'utils/obsidian';
import { expandStandaloneLinksInLines } from './expander';
import { getTargetLineRange } from './parser';
import { createObsidianNoteResolver, type NoteResolver } from './resolver';

export { computeCodeFence, formatAsCodeBlock } from './formatter';
export {
  getTargetLineRange,
  parseStandaloneWikiLink,
  type LineRange,
  type ParsedStandaloneWikiLink
} from './parser';
export {
  createObsidianNoteResolver,
  type NoteResolver,
  type ResolvedMarkdownNote
} from './resolver';
export { expandStandaloneLinksInLines, type ExpansionResult } from './expander';

/**
 * Replaces standalone wiki-link lines in the current cursor line or selection
 * with fenced code blocks containing the linked notes' raw Markdown content.
 */
export async function expandWikiLinksToCodeBlocks(
  app: App,
  editor: Editor,
  sourceFile: TFile | null,
  resolver?: NoteResolver
): Promise<void> {
  const { startLine, endLine } = getTargetLineRange(editor);
  const lines: string[] = [];
  for (let lineIndex = startLine; lineIndex <= endLine; lineIndex++) {
    lines.push(editor.getLine(lineIndex));
  }

  const activeResolver = resolver ?? createObsidianNoteResolver(app);
  const result = await expandStandaloneLinksInLines(lines, sourceFile?.path ?? '', activeResolver);

  if (result.matchedLinkCount === 0) {
    showNotice('No standalone wiki-links found.');
    return;
  }

  if (result.expandedCount > 0) {
    const endLineLength = editor.getLine(endLine).length;
    editor.replaceRange(
      result.lines.join('\n'),
      { line: startLine, ch: 0 },
      { line: endLine, ch: endLineLength }
    );
  }

  if (result.unresolvedLinks.length === 0) {
    showNotice(`Expanded ${result.expandedCount} wiki-link(s) to code block(s).`);
  } else if (result.expandedCount > 0) {
    showNotice(
      `Expanded ${result.expandedCount}, skipped ${result.unresolvedLinks.length} unresolved: ${result.unresolvedLinks.join(', ')}.`
    );
  } else {
    showNotice(`Could not resolve: ${result.unresolvedLinks.join(', ')}.`);
  }
}
