/**
 * math-formatter.test.ts — Unit tests for the robust math formatter.
 */

import { formatMathContent, formatMathBlock } from '../src/features/math-formatter/formatter';
import { replaceMathBlocksInDocument } from '../src/features/math-formatter/parser';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Strips common leading indentation from a template-literal string. */
function dedent(s: string): string {
  const lines = s.split('\n');
  if (lines[0].trim() === '') lines.shift();
  if (lines[lines.length - 1].trim() === '') lines.pop();
  const indent = lines[0].match(/^(\s*)/)?.[1].length ?? 0;
  return lines.map(l => l.slice(indent)).join('\n');
}

// ---------------------------------------------------------------------------
// formatMathContent
// ---------------------------------------------------------------------------

describe('formatMathContent', () => {
  it('collapses simple fragmented lines into one', () => {
    const input = dedent(`
      \\mathbf I
      -
      \\boldsymbol\\rho
      \\mathbf K^0
      =
      0
    `);
    expect(formatMathContent(input)).toBe('\\mathbf I - \\boldsymbol\\rho \\mathbf K^0 = 0');
  });

  it('collapses tokens around \\left ... \\right', () => {
    const input = dedent(`
      \\mathbf W^{-1}
      \\left(
      \\mathbf I-\\frac12\\boldsymbol\\rho
      \\right)
    `);
    const result = formatMathContent(input);
    expect(result).toContain('\\left(');
    expect(result).toContain('\\right)');
    expect(result.split('\n').filter(l => l.trim()).length).toBe(1);
  });

  it('normalises multiple spaces to single space', () => {
    expect(formatMathContent('\\mathbf  I  =  0')).toBe('\\mathbf I = 0');
  });

  it('handles \\tag — hoisted to end of last line', () => {
    const result = formatMathContent('a = b\n\\tag{1}');
    expect(result).toBe('a = b \\tag{1}');
  });

  it('handles empty/whitespace-only input gracefully', () => {
    expect(formatMathContent('   ')).toBe('');
    expect(formatMathContent('\n\n')).toBe('');
  });

  // ── bmatrix ───────────────────────────────────────────────────────────────
  it('preserves bmatrix row structure', () => {
    const input = dedent(`
      \\begin{bmatrix}
      \\dfrac{\\pi\\chi_1}{\\Delta}\\mathbf1\\\\[1mm]
      \\dfrac{\\beta_0^{10}}{\\Delta_n}
      \\end{bmatrix}
    `);
    const result = formatMathContent(input);
    const lines = result.split('\n');
    expect(lines.some(l => l.includes('\\begin{bmatrix}'))).toBe(true);
    expect(lines.some(l => l.includes('\\end{bmatrix}'))).toBe(true);
    const bi = lines.findIndex(l => l.includes('\\begin{bmatrix}'));
    const ei = lines.findIndex(l => l.includes('\\end{bmatrix}'));
    expect(ei).toBeGreaterThan(bi + 1); // at least one row line between them
  });

  // ── align ─────────────────────────────────────────────────────────────────
  it('preserves align row breaks', () => {
    const input = dedent(`
      \\begin{align}
      a &= b \\\\
      c &= d
      \\end{align}
    `);
    const result = formatMathContent(input);
    expect(result).toContain('\\begin{align}');
    expect(result).toContain('\\end{align}');
    // Row break must survive
    expect(result).toContain('\\\\');
  });

  // ── cases ─────────────────────────────────────────────────────────────────
  it('preserves cases rows', () => {
    const input = dedent(`
      f(x) =
      \\begin{cases}
      1 & x > 0 \\\\
      0 & \\text{otherwise}
      \\end{cases}
    `);
    const result = formatMathContent(input);
    expect(result).toContain('\\begin{cases}');
    expect(result).toContain('\\end{cases}');
    expect(result).toContain('\\\\');
  });

  // ── simple user example ───────────────────────────────────────────────────
  it('compacts the simple user example equation', () => {
    const input = dedent(`
      \\mathbf I-\\boldsymbol\\rho\\mathbf K^0
      =
      \\mathbf W^{-1}
      \\left(
      \\mathbf I-\\frac12\\boldsymbol\\rho\\boldsymbol\\sigma\\mathbf Q_\\lambda
      \\right)
      +
      \\frac1{12}
      \\boldsymbol\\rho\\boldsymbol\\sigma^3
      \\begin{bmatrix}
      \\dfrac{\\pi\\chi_1}{\\Delta}\\mathbf1\\\\[1mm]
      \\dfrac{\\beta_0^{10}}{\\Delta_n}
      \\end{bmatrix}
      \\begin{bmatrix}
      (\\mathbf a^0)^T&a_n^1
      \\end{bmatrix}.
      \\tag{1}
    `);
    const result = formatMathContent(input);
    expect(result).toContain('\\mathbf I-\\boldsymbol\\rho\\mathbf K^0');
    expect(result).toContain('\\left(');
    expect(result).toContain('\\right)');
    expect(result).toContain('\\begin{bmatrix}');
    expect(result).toContain('\\end{bmatrix}');
    expect(result.trimEnd()).toMatch(/\\tag\{1\}$/);
    const nonEmpty = result.split('\n').filter(l => l.trim());
    expect(nonEmpty.length).toBeLessThan(12);
  });

  // ── COMPLEX: boxed + aligned + nested bmatrix + left/right ───────────────
  it('handles \\boxed{\\begin{aligned}...} with deeply nested content', () => {
    const input = dedent(`
      \\boxed{
      \\begin{aligned}
      &\\frac12
      \\begin{bmatrix}
      (\\mathbf a^0)^T&a_n^1
      \\end{bmatrix}
      \\left[
      \\eta_0+
      \\sum_i\\rho_i\\sigma_iz_i
      \\left(
      \\sum_l\\rho_lz_lJ_{li}^{00}
      +\\frac{\\pi}{4}\\chi_2
      \\right)
      \\right]\\\\
      ={}&
      \\frac12
      \\begin{bmatrix}
      (\\boldsymbol\\rho_{\\rm ion}\\mathbf z_{\\rm ion})^T \\mathbf Q_\\lambda^{00}& (\\boldsymbol\\rho_{\\rm ion}\\mathbf z_{\\rm ion})^T \\mathbf Q_\\lambda^{01}
      \\end{bmatrix}\\\\
      &-
      \\begin{bmatrix}
      \\mathbf N^T&0
      \\end{bmatrix}
      \\left\\{
      \\mathbf I-\\frac12\\boldsymbol\\rho\\boldsymbol\\sigma\\mathbf Q_\\lambda
      +
      \\frac1{12}\\boldsymbol\\rho\\boldsymbol\\sigma^3
      \\begin{bmatrix}
      \\pi\\chi_1\\mathbf1\\\\
      \\beta_0^{10}
      \\end{bmatrix}
      \\begin{bmatrix}
      (\\mathbf a^0)^T&a_n^1
      \\end{bmatrix}
      \\right\\}\\\\
      &-
      \\begin{bmatrix}
      0&\\dfrac16\\beta_0^{10}\\sigma_n
      \\end{bmatrix}
      -
      \\frac16
      \\begin{bmatrix}
      0&\\beta_0^{10}\\sigma_n
      \\end{bmatrix}
      \\left(
      \\mathbf I-\\frac12
      \\boldsymbol\\rho\\boldsymbol\\sigma\\mathbf Q_\\lambda
      \\right).
      \\end{aligned}
      } \\tag{C32}
    `);

    const result = formatMathContent(input);

    // Must contain all key structural elements
    expect(result).toContain('\\begin{aligned}');
    expect(result).toContain('\\end{aligned}');
    expect(result).toContain('\\begin{bmatrix}');
    expect(result).toContain('\\end{bmatrix}');
    expect(result).toContain('\\left[');
    expect(result).toContain('\\right]');
    expect(result).toContain('\\left(');
    expect(result).toContain('\\right)');
    expect(result).toContain('\\left\\{');
    expect(result).toContain('\\right\\}');
    // Tag hoisted to end
    expect(result.trimEnd()).toMatch(/\\tag\{C32\}$/);
    // Row breaks within aligned must be preserved
    const rowBreaks = (result.match(/\\\\/g) ?? []).length;
    expect(rowBreaks).toBeGreaterThanOrEqual(3); // at least 3 \\ row separators
    // Should be far fewer lines than the original ~45 line input
    const nonEmpty = result.split('\n').filter(l => l.trim());
    expect(nonEmpty.length).toBeLessThan(30);
  });
});

// ---------------------------------------------------------------------------
// formatMathBlock
// ---------------------------------------------------------------------------

describe('formatMathBlock', () => {
  it('wraps result with $$ delimiters', () => {
    const result = formatMathBlock('$$\na = b\n$$');
    expect(result.startsWith('$$\n')).toBe(true);
    expect(result.endsWith('\n$$')).toBe(true);
  });

  it('preserves Obsidian block ID on closing $$', () => {
    const result = formatMathBlock('$$\na = b\n$$ ^eq-abc123');
    expect(result).toMatch(/\^eq-abc123/);
  });

  it('does not mutate an already-compact single-line block', () => {
    const input = '$$\na = b + c \\tag{2}\n$$';
    expect(formatMathBlock(input)).toBe('$$\na = b + c \\tag{2}\n$$');
  });

  it('compacts a fragmented block to one inner line', () => {
    const result = formatMathBlock('$$\na\n+\nb\n=\nc\n$$');
    const inner = result.replace(/^\$\$\n/, '').replace(/\n\$\$$/, '');
    const nonEmpty = inner.split('\n').filter(l => l.trim());
    expect(nonEmpty.length).toBe(1);
    expect(nonEmpty[0]).toBe('a + b = c');
  });

  it('does not crash on empty block', () => {
    expect(() => formatMathBlock('$$\n\n$$')).not.toThrow();
    expect(() => formatMathBlock('$$$$')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// replaceMathBlocksInDocument
// ---------------------------------------------------------------------------

describe('replaceMathBlocksInDocument', () => {
  it('formats multiple $$ blocks in a document', () => {
    const doc = 'Some text\n$$\na\n=\nb\n$$\nmore text\n$$\nx\n+\ny\n$$\nend';
    const result = replaceMathBlocksInDocument(doc, formatMathBlock);
    expect(result).toContain('a = b');
    expect(result).toContain('x + y');
    expect(result).toContain('Some text');
    expect(result).toContain('more text');
    expect(result).toContain('end');
  });

  it('does not touch $$ blocks inside fenced code blocks', () => {
    const doc = '```\n$$\na\n=\nb\n$$\n```';
    const result = replaceMathBlocksInDocument(doc, formatMathBlock);
    expect(result).toBe(doc);
  });
});
