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
