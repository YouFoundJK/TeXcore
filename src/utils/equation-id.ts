import { logDebug, logWarn } from './logger';
import { findDisplayMathBlocks, trimMathText } from './parse';

/**
 * Unified Equation ID parsing, formatting, and manipulation service.
 * Follows Single Responsibility and DRY principles by centralizing equation ID syntax handling.
 */

/**
 * Regex matching supported equation ID formats:
 * - % id: eq-123
 * - \label{eq-123}
 * - <!-- id: eq-123 -->
 */
export const EQUATION_ID_REGEX = /(?:% id:|\\label\{|<!--\s*id:)\s*(eq-[\w.-]+)\}?/i;

/**
 * Global regex matching equation ID annotations for stripping/cleaning.
 */
export const EQUATION_ID_GLOBAL_REGEX = /\s*(?:% id:|\\label\{|<!--\s*id:)\s*eq-[\w.-]+\}?/g;

/**
 * Extract an equation ID from a text snippet, if present.
 */
export function parseEquationId(text: string): string | null {
  const match = text.match(EQUATION_ID_REGEX);
  return match ? match[1] : null;
}

/**
 * Strip equation ID annotations from math block text.
 */
export function stripEquationId(text: string): string {
  return text.replace(EQUATION_ID_GLOBAL_REGEX, '');
}

/**
 * Format a default equation ID line using '% id: <id>'.
 */
export function formatEquationIdLine(id: string, prefix = ''): string {
  return `${prefix}% id: ${id}\n`;
}

/**
 * Clean math text for rendering by removing all comments, annotations, and labels
 * that can cause MathJax compilation errors.
 */
export function cleanMathTextForRendering(text: string): string {
  logDebug(
    'EquationID',
    `cleanMathTextForRendering input: "${text.substring(0, 100).replace(/\n/g, '\\n')}${text.length > 100 ? '...' : ''}"`
  );

  let cleaned = text;

  // 1. Remove HTML comments completely (e.g. <!-- id: eq-123 --> or any comments)
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');

  // 2. Remove Markdown comments completely (e.g. %% label: ... %%)
  cleaned = cleaned.replace(/%%[\s\S]*?%%/g, '');

  // 3. Remove whole lines that are LaTeX comments (like % id: eq-123)
  cleaned = cleaned.replace(/^[ \t]*%.*?(\r?\n|$)/gm, '');

  // 4. Remove trailing LaTeX comments on lines (except when escaped \% or inside environments where % is allowed, but for rendering we strip it)
  cleaned = cleaned.replace(/(?<!\\)%.*?$/gm, '');

  // 5. Remove labels like \label{eq-123}
  cleaned = cleaned.replace(/\\label\{\s*eq-[\w.-]+\s*\}/gi, '');
  cleaned = cleaned.replace(/\\label\{\s*\}/gi, '');

  cleaned = cleaned.trim();

  logDebug(
    'EquationID',
    `cleanMathTextForRendering output: "${cleaned.substring(0, 100).replace(/\n/g, '\\n')}${cleaned.length > 100 ? '...' : ''}"`
  );
  return cleaned;
}

/**
 * Clean math text for whitespace and prefix-insensitive equation matching comparison.
 */
export function cleanMathForComparison(text: string): string {
  // Strip callout prefixes (including nested callouts like >> or > >)
  let cleaned = text.replace(/^\s*(?:>\s*)+/gm, '');
  // Strip equation ID annotations
  cleaned = stripEquationId(cleaned);
  // Strip comments, newlines, and whitespace
  cleaned = cleaned.replace(/%%[\s\S]*?%%/g, '');
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/\s+/g, '');
  return cleaned;
}

/**
 * Locate the exact display math block in the document text by comparing cleaned versions.
 */
export function findExactMathBlock(
  currentText: string,
  targetMathText: string,
  approxStartLine: number
): { startOffset: number; endOffset: number; startLine: number; endLine: number } | null {
  const mathBlocks = findDisplayMathBlocks(currentText);
  if (mathBlocks.length === 0) {
    logDebug('EquationID', 'findExactMathBlock: No math blocks found in document.');
    return null;
  }

  const targetClean = cleanMathForComparison(targetMathText);
  logDebug('EquationID', `findExactMathBlock: targetClean comparison key: "${targetClean}"`);

  let bestMatch: { from: number; to: number; lineDiff: number } | null = null;

  for (let idx = 0; idx < mathBlocks.length; idx++) {
    const block = mathBlocks[idx];
    const rawText = currentText.substring(block.from, block.to);
    let trimmed = rawText.trim();
    if (trimmed.startsWith('$$')) {
      trimmed = trimMathText(trimmed);
    }
    const blockClean = cleanMathForComparison(trimmed);

    logDebug(
      'EquationID',
      `Checking math block index ${idx} [${block.from}-${block.to}]. blockClean key: "${blockClean}"`
    );

    if (blockClean === targetClean) {
      const prefix = currentText.substring(0, block.from);
      const startLine = (prefix.match(/\n/g) || []).length;
      const lineDiff = Math.abs(startLine - approxStartLine);
      logDebug(
        'EquationID',
        `Match found! startLine=${startLine}, approxStartLine=${approxStartLine}, lineDiff=${lineDiff}`
      );

      if (bestMatch === null || lineDiff < bestMatch.lineDiff) {
        bestMatch = { from: block.from, to: block.to, lineDiff };
      }
    }
  }

  if (bestMatch) {
    const from = bestMatch.from;
    const to = bestMatch.to;
    const prefix = currentText.substring(0, from);
    const startLine = (prefix.match(/\n/g) || []).length;
    const blockText = currentText.substring(from, to);
    const lineCount = (blockText.match(/\n/g) || []).length;
    const endLine = startLine + lineCount;

    logDebug(
      'EquationID',
      `Best match selected: offsets [${from}-${to}], startLine=${startLine}, endLine=${endLine}`
    );
    return {
      startOffset: from,
      endOffset: to,
      startLine,
      endLine
    };
  }

  logWarn('EquationID', 'findExactMathBlock: No math block matched the clean comparison key.');
  return null;
}
