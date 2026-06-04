import { getCalloutPrefix } from './parse';

/**
 * Checks and fixes broken math blocks inside callouts.
 * Obsidian's PDF export (and sometimes editor preview) requires all lines of a math block
 * inside a callout to start with '>'.
 *
 * @param content The full text content to check.
 * @returns The fixed content string if changes were made, or null if no changes were needed.
 */
export function checkAndFixCalloutMath(content: string): string | null {
  const lines = content.split(/\r?\n/);
  let changed = false;
  let inMathBlock = false;
  let mathBlockStartLevel = 0;

  const newLines = lines.map(line => {
    // Determine current blockquote level
    const prefix = getCalloutPrefix(line);
    const currentLevel = (prefix.match(/>/g) || []).length;

    const dollars = (line.match(/\$\$/g) || []).length;

    let processedLine = line;

    // If inside a math block and the indentation level dropped, fix it.
    // We only fix if we are strictly inside a block (after the opening line).
    if (inMathBlock && currentLevel < mathBlockStartLevel) {
      const missingLevels = mathBlockStartLevel - currentLevel;
      const patch = '> '.repeat(missingLevels);
      processedLine = patch + line;
      changed = true;
    }

    // Toggle block state if we see an odd number of '$$' on the line.
    // This handles standard start/end tags.
    if (dollars % 2 !== 0) {
      if (!inMathBlock) {
        inMathBlock = true;
        mathBlockStartLevel = currentLevel;
        // Note: The opening line itself defines the level, so we don't fix it based on itself.
      } else {
        inMathBlock = false;
      }
    }

    return processedLine;
  });

  if (!changed) return null;
  return newLines.join('\n');
}
