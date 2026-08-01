import { getCalloutPrefix, findDisplayMathBlocks, findTopLevelEndEnvMatch } from './parse';
import { logDebug } from './logger';

/**
 * Checks and fixes broken math blocks inside callouts.
 * Obsidian's PDF export (and preview) requires all lines of a math block
 * inside a callout to start with '>'.
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
 * Converts legacy `% id: eq-name` inside single-line Markdown table cells
 * to standard `\label{eq-name}` so that TeX comment `%` does not swallow closing `$$`.
 * Also cleans illegal `<br>` tags inside `$$ ... $$` math in table rows to prevent MathJax
 * from rendering literal `br >` glyphs.
 */
export function fixTableMath(content: string): string | null {
  if (
    !content ||
    !content.includes('|') ||
    (!content.includes('% id:') && !content.includes('<br>'))
  ) {
    return null;
  }

  logDebug(
    'Fixer',
    `fixTableMath called on content (${content.length} chars). Scanning for table rows with math...`
  );
  const lines = content.split(/\r?\n/);
  let changed = false;

  const brBeforeMathRegex = /(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+\s*(\$\$)/gi;
  const brAfterMathRegex = /(\$\$)\s*(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi;

  const newLines = lines.map((line, idx) => {
    if (line.includes('|') && line.includes('$$')) {
      let fixedLine = line;
      if (line.includes('% id:')) {
        fixedLine = fixedLine.replace(/% id:\s*(eq-[\w.-]+)/g, '\\label{$1}');
      }
      if (fixedLine.includes('<br>')) {
        fixedLine = fixedLine.replace(brBeforeMathRegex, ' $1');
        fixedLine = fixedLine.replace(brAfterMathRegex, '$1 ');
        fixedLine = fixedLine.replace(/(\$\$[\s\S]*?\$\$)/g, mathBlock => {
          return cleanMathBrTags(mathBlock, true);
        });
      }
      if (fixedLine !== line) {
        logDebug(
          'Fixer',
          `fixTableMath modified line ${idx + 1}:\n  BEFORE: ${line}\n  AFTER:  ${fixedLine}`
        );
        changed = true;
        return fixedLine;
      }
    }
    return line;
  });

  if (!changed) {
    logDebug('Fixer', 'fixTableMath: No changes needed.');
    return null;
  }
  return newLines.join('\n');
}

/**
 * Hoists `\label{eq-...}` to before `\end{...}` if it is placed after `\end{...}`,
 * preventing MathJax syntax errors.
 */
export function hoistLabelInEnvironment(mathText: string): string {
  const endEnvMatch = findTopLevelEndEnvMatch(mathText);
  const labelMatch = mathText.match(/\\label\{(eq-[\w.-]+)\}/);

  if (
    endEnvMatch &&
    labelMatch &&
    labelMatch.index !== undefined &&
    endEnvMatch.index !== undefined
  ) {
    if (labelMatch.index > endEnvMatch.index) {
      const labelStr = labelMatch[0];
      const cleaned = mathText.replace(labelStr, '').trim();
      const newEndEnvMatch = findTopLevelEndEnvMatch(cleaned);
      if (newEndEnvMatch && newEndEnvMatch.index !== undefined) {
        const envPos = newEndEnvMatch.index;
        const separator = mathText.includes('\n') ? '\n' : ' ';
        const result = `${cleaned.slice(0, envPos).trimEnd()} ${labelStr}${separator}${cleaned.slice(envPos)}`;
        logDebug(
          'Fixer',
          `hoistLabelInEnvironment hoisted "${labelStr}" before ${newEndEnvMatch.matchText}:\n  INPUT:  "${mathText}"\n  OUTPUT: "${result}"`
        );
        return result;
      }
    }
  }

  return mathText;
}

/**
 * Cleans illegal HTML <br> tags and fixes comment truncation inside math expressions.
 * @param isSingleLineContext If true, <br> inside math is converted to spaces/LaTeX breaks rather than raw newlines \n.
 */
export function cleanMathBrTags(mathText: string, isSingleLineContext = false): string {
  if (!mathText) return mathText;

  const brRegex = /<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;/gi;
  const hasBr = brRegex.test(mathText);
  const hasComment = mathText.includes('%');
  const hasLabel = mathText.includes('\\label{');

  if (!hasBr && !hasComment && !hasLabel) {
    return mathText;
  }

  logDebug(
    'Fixer',
    `cleanMathBrTags called (isSingleLineContext=${isSingleLineContext}).\n  INPUT: "${mathText}"`
  );

  const isTableOrSingleLine = isSingleLineContext || !mathText.includes('\n');

  // 1. Replace <br> and &lt;br&gt; with appropriate line breaks or spaces
  let cleaned: string;
  if (isTableOrSingleLine) {
    // In single-line table cells, clean leading/trailing <br> inside $$ ... $$ to space,
    // and internal <br> to LaTeX newline \\ or space.
    cleaned = mathText.replace(
      /^(\$\$)\s*(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi,
      '$1 '
    );
    cleaned = cleaned.replace(
      /(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+\s*(\$\$)$/gi,
      ' $1'
    );
    cleaned = cleaned.replace(
      /\\begin\{([a-zA-Z*]+)\}\s*(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi,
      '\\begin{$1} '
    );
    cleaned = cleaned.replace(
      /(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+\s*\\end\{([a-zA-Z*]+)\}/gi,
      ' \\end{$1}'
    );
    cleaned = cleaned.replace(brRegex, ' ');
  } else {
    cleaned = mathText.replace(brRegex, '\n');
  }

  // 2. Ensure TeX comment lines starting with % terminate with \n and do not swallow closing $$
  if (!isTableOrSingleLine) {
    const lines = cleaned.split('\n');
    const fixedLines: string[] = [];

    for (const line of lines) {
      const commentIdx = line.indexOf('%');
      if (commentIdx !== -1 && (commentIdx === 0 || line[commentIdx - 1] !== '\\')) {
        const before = line.substring(0, commentIdx).trimEnd();
        let comment = line.substring(commentIdx).trimEnd();

        // If comment line contains closing $$, pull $$ onto a new line after comment
        const closingDollarIdx = comment.lastIndexOf('$$');
        if (closingDollarIdx > 0) {
          const commentBody = comment.substring(0, closingDollarIdx).trimEnd();
          comment = `${commentBody}\n$$`;
        }

        if (before.length > 0) {
          fixedLines.push(before);
        }
        fixedLines.push(comment);
      } else {
        fixedLines.push(line);
      }
    }

    cleaned = fixedLines.join('\n');
  }

  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ');

  // 3. Hoist \label{eq-...} if inside environment
  const finalResult = hoistLabelInEnvironment(cleaned);
  logDebug('Fixer', `cleanMathBrTags final result:\n  OUTPUT: "${finalResult}"`);
  return finalResult;
}
