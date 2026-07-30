import { getCalloutPrefix, findDisplayMathBlocks } from './parse';

/**
 * Checks and fixes broken math blocks inside callouts.
 * Obsidian's PDF export (and sometimes editor preview) requires all lines of a math block
 * inside a callout to start with '>'.
 *
 * @param content The full text content to check.
 * @returns The fixed content string if changes were made, or null if no changes were needed.
 */
export function checkAndFixCalloutMath(content: string): string | null {
  const blocks = findDisplayMathBlocks(content);
  if (blocks.length === 0) return null;

  const lines = content.split('\n');
  const lineOffsets: number[] = [0];
  for (let i = 0; i < lines.length; i++) {
    lineOffsets.push(lineOffsets[i] + lines[i].length + 1); // +1 for \n
  }

  interface BlockLineRange {
    startLine: number;
    endLine: number;
    calloutLevel: number;
  }

  const blockRanges: BlockLineRange[] = [];

  for (const b of blocks) {
    let startLine = -1;
    let endLine = -1;
    for (let i = 0; i < lines.length; i++) {
      const lineStart = lineOffsets[i];
      const lineEnd = lineOffsets[i + 1] - 1;
      if (b.from >= lineStart && b.from <= lineEnd) {
        startLine = i;
      }
      if (b.to > lineStart && b.to <= lineEnd + 1) {
        endLine = i;
      }
    }

    if (startLine !== -1 && endLine !== -1) {
      const startLinePrefix = getCalloutPrefix(lines[startLine]);
      const calloutLevel = (startLinePrefix.match(/>/g) || []).length;
      if (calloutLevel > 0) {
        blockRanges.push({ startLine, endLine, calloutLevel });
      }
    }
  }

  if (blockRanges.length === 0) return null;

  let changed = false;
  const newLines = [...lines];

  for (const { startLine, endLine, calloutLevel } of blockRanges) {
    for (let i = startLine + 1; i <= endLine; i++) {
      const line = newLines[i];
      const prefix = getCalloutPrefix(line);
      const currentLevel = (prefix.match(/>/g) || []).length;

      if (currentLevel < calloutLevel) {
        const missingLevels = calloutLevel - currentLevel;
        const patch = '> '.repeat(missingLevels);
        newLines[i] = patch + line;
        changed = true;
      }
    }
  }

  if (!changed) return null;
  return newLines.join('\n');
}

/**
 * Cleans illegal HTML <br> tags from inside LaTeX math expressions for DOM rendering.
 */
export function cleanMathBrTags(mathText: string): string {
  if (!mathText) return mathText;

  const brRegex = /<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;/gi;
  if (!brRegex.test(mathText)) {
    return mathText;
  }

  return mathText.replace(brRegex, ' ').replace(/[ \t]{2,}/g, ' ');
}
