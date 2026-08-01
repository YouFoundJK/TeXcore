import {
  toRomanUpper,
  toRomanLower,
  toAlphUpper,
  toAlphLower,
  getEqNumberPrefix,
  CONVERTER
} from '../src/utils/format';
import {
  trimMathText,
  parseMarkdownComment,
  parseYamlLike,
  getCalloutPrefix,
  isStructuralCalloutLine,
  findDisplayMathBlocks,
  splitMathIntoTopLevelRows,
  findTopLevelEndEnvMatch
} from '../src/utils/parse';

import { splitIntoLines, insertAt } from '../src/utils/general';
import { cleanMathBrTags } from '../src/utils/fixer';
import { App, TFile } from 'obsidian';

describe('format.ts tests', () => {
  it('Roman numerals conversion', () => {
    expect(toRomanUpper(1)).toBe('I');
    expect(toRomanUpper(3)).toBe('III');
    expect(toRomanUpper(4)).toBe('IV');
    expect(toRomanUpper(9)).toBe('IX');
    expect(toRomanUpper(10)).toBe('X');
    expect(toRomanUpper(39)).toBe('XXXIX');
    expect(toRomanUpper(40)).toBe('XL');
    expect(toRomanUpper(50)).toBe('L');
    expect(toRomanUpper(90)).toBe('XC');
    expect(toRomanUpper(100)).toBe('C');
    expect(toRomanUpper(400)).toBe('CD');
    expect(toRomanUpper(500)).toBe('D');
    expect(toRomanUpper(900)).toBe('CM');
    expect(toRomanUpper(1000)).toBe('M');
    expect(toRomanUpper(1994)).toBe('MCMXCIV');

    expect(toRomanLower(1994)).toBe('mcmxciv');
  });

  it('Alphabetic numerals conversion', () => {
    expect(toAlphUpper(1)).toBe('A');
    expect(toAlphUpper(26)).toBe('Z');
    expect(toAlphUpper(27)).toBe('BA');
    expect(toAlphUpper(28)).toBe('BB');
    expect(toAlphLower(1)).toBe('a');
    expect(toAlphLower(27)).toBe('ba');
  });

  it('CONVERTER mapping', () => {
    expect(CONVERTER.arabic(123)).toBe('123');
    expect(CONVERTER.alph(1)).toBe('a');
    expect(CONVERTER.Alph(1)).toBe('A');
    expect(CONVERTER.roman(10)).toBe('x');
    expect(CONVERTER.Roman(10)).toBe('X');
  });

  it('getEqNumberPrefix', () => {
    const dummyApp = {} as App;
    type TempTFile = TFile;
    const dummyFile = {} as unknown as TempTFile;
    const settings = {
      eqNumberPrefix: 'Prefix-'
    } as unknown;
    expect(getEqNumberPrefix(dummyApp, dummyFile, settings)).toBe('Prefix-');
  });
});

describe('parse.ts tests', () => {
  it('trimMathText', () => {
    expect(trimMathText('$$ E = mc^2 $$')).toBe('E = mc^2');
    expect(trimMathText('$$\nE = mc^2\n$$')).toBe('E = mc^2');
    expect(trimMathText('no math block')).toBe('');
  });

  it('findDisplayMathBlocks handles adjacent inline math like $[text]$$^2$', () => {
    const content = `$[\\text{charge}]$$^2$ Refer Eq. [[#^eq-robp7m93]]
$$
\\mathbf{D}_0=\\begin{pmatrix}\\alpha_0^{\\,2}\\,Z_i Z_j & \\alpha_0\\alpha_2\\,Z_i\\\\-\\alpha_0\\alpha_2\\,Z_j & 0\\end{pmatrix}
% id: eq-robp7m93
$$`;
    const blocks = findDisplayMathBlocks(content);
    expect(blocks.length).toBe(1);
    const matchedText = content.substring(blocks[0].from, blocks[0].to);
    expect(matchedText).toContain('% id: eq-robp7m93');
    expect(matchedText.startsWith('$$')).toBe(true);
    expect(matchedText.endsWith('$$')).toBe(true);
  });

  it('findDisplayMathBlocks extracts multiple table cell math blocks with <br>% id: ...<br>$$', () => {
    const tableText = '| cell 1,<br>$$<br>a=b<br>% id: eq-1<br>$$ | cell 2,<br>$$<br>c=d<br>% id: eq-2<br>$$ |';
    const blocks = findDisplayMathBlocks(tableText);
    expect(blocks.length).toBe(2);
    expect(tableText.substring(blocks[0].from, blocks[0].to)).toBe('$$<br>a=b<br>% id: eq-1<br>$$');
    expect(tableText.substring(blocks[1].from, blocks[1].to)).toBe('$$<br>c=d<br>% id: eq-2<br>$$');
  });

  it('findDisplayMathBlocks ignores math in code blocks', () => {
    const content = `\`\`\`
$$ fake math $$
\`\`\`
$$ real math $$`;
    const blocks = findDisplayMathBlocks(content);
    expect(blocks.length).toBe(1);
    expect(content.substring(blocks[0].from, blocks[0].to)).toBe('$$ real math $$');
  });

  it('parseMarkdownComment', () => {
    const text = 'Some text\n%% comment line 1\ncomment line 2 %%\nOther text %% single comment %%';
    const comments = parseMarkdownComment(text);
    expect(comments).toEqual(['comment line 1', 'comment line 2', 'single comment']);
  });

  it('parseYamlLike', () => {
    expect(parseYamlLike('key: value')).toEqual({ key: 'value' });
    expect(parseYamlLike('  key  :   value  ')).toEqual({ key: 'value' });
    expect(parseYamlLike('no colon')).toBeNull();
    expect(parseYamlLike('key: value: extra')).toEqual({ key: 'value: extra' });
  });

  it('getCalloutPrefix', () => {
    expect(getCalloutPrefix('> hello')).toBe('> ');
    expect(getCalloutPrefix('>> hello')).toBe('>> ');
    expect(getCalloutPrefix('  > > hello')).toBe('  > > ');
    expect(getCalloutPrefix('no callout')).toBe('');
  });

  it('isStructuralCalloutLine', () => {
    expect(isStructuralCalloutLine('>')).toBe(true);
    expect(isStructuralCalloutLine('> > ')).toBe(true);
    expect(isStructuralCalloutLine('  > >')).toBe(true);
    expect(isStructuralCalloutLine('> text')).toBe(false);
    expect(isStructuralCalloutLine('text')).toBe(false);
  });
});

describe('general.ts tests', () => {
  it('splitIntoLines', () => {
    expect(splitIntoLines('line1\nline2\r\nline3')).toEqual(['line1', 'line2', 'line3']);
  });

  it('insertAt', () => {
    const arr = [1, 2, 3];
    insertAt(arr, 99, 1);
    expect(arr).toEqual([1, 99, 2, 3]);
  });
});

describe('Sub-equation splitting and matrix environment tests', () => {
  it('should split rows while keeping \\[dimen] intact at top level', () => {
    const input = `\\beta \\frac{\\partial P}{\\partial \\rho} & = \\frac{\\partial}{\\partial \\eta} \\left[ \\eta \\frac{1 + \\eta + \\eta^2}{(1 - \\eta)^3} \\right]  \\\\[0.6em]\n\\implies q(\\eta)  & = \\frac{(1 + 2\\eta)^2}{(1 - \\eta)^4}  \\end{align}`;
    const parts = splitMathIntoTopLevelRows(input);
    expect(parts.length).toBe(3);
    expect(parts[0]).toContain('\\beta');
    expect(parts[1]).toBe('\\\\[0.6em]');
    expect(parts[2]).toContain('\\implies');
  });

  it('should split rows when there is no dimension parameter at top level', () => {
    const input = `row1 \\\\ row2`;
    const parts = splitMathIntoTopLevelRows(input);
    expect(parts).toEqual(['row1 ', '\\\\', ' row2']);
  });

  it('should NEVER split inside pmatrix or matrix environments', () => {
    const input = `\\begin{align}
J_{ij,\\chi}^{mn}(r) = (-1)^\\chi\\ 2\\pi \\sum_l \\begin{pmatrix} m & n & l \\\\ \\chi & -\\chi & 0
\\end{pmatrix} \\int_r^\\infty dr_1 \\, r_1 P_l(r/r_1) \\hat{h}_{ij}^{mnl}(r_1)  \\\\
S_{ij,\\chi}^{mn}(r) = (-1)^\\chi\\ 2\\pi \\sum_l \\begin{pmatrix} m & n & l \\\\ \\chi & -\\chi & 0 
\\end{pmatrix} \\int_r^\\infty dr_1 \\, r_1 P_l(r/r_1) \\hat{c}_{ij}^{mnl}(r_1)  
\\end{align}`;

    const parts = splitMathIntoTopLevelRows(input);
    expect(parts.length).toBe(3);
    expect(parts[0]).toContain('\\begin{pmatrix} m & n & l \\\\ \\chi & -\\chi & 0\n\\end{pmatrix}');
    expect(parts[1]).toBe('\\\\');
    expect(parts[2]).toContain('\\begin{pmatrix} m & n & l \\\\ \\chi & -\\chi & 0 \n\\end{pmatrix}');
  });

  it('should correctly find top-level end environment matches while ignoring nested environments', () => {
    const rowWithMatrix = `J = \\begin{pmatrix} a \\\\ b \\end{pmatrix} \\int f(x) dx`;
    expect(findTopLevelEndEnvMatch(rowWithMatrix)).toBeNull();

    const rowWithAlign = `S = \\begin{pmatrix} a \\\\ b \\end{pmatrix} \\int f(x) dx \\end{align}`;
    const match = findTopLevelEndEnvMatch(rowWithAlign);
    expect(match).not.toBeNull();
    expect(match?.matchText).toBe('\\end{align}');
  });
});

import { parseEquationId, stripEquationId, formatEquationIdLine } from '../src/utils/equation-id';
import { hoistLabelInEnvironment, cleanMathBrTags, fixTableMath } from '../src/utils/fixer';

describe('equation-id.ts tests', () => {
  it('parseEquationId correctly parses % id:, \\label{}, and HTML comment IDs', () => {
    expect(parseEquationId('$$ E = mc^2 % id: eq-einstein $$')).toBe('eq-einstein');
    expect(parseEquationId('$$ \\label{eq-relativity} E = mc^2 $$')).toBe('eq-relativity');
    expect(parseEquationId('$$ <!-- id: eq-html --> E = mc^2 $$')).toBe('eq-html');
    expect(parseEquationId('$$ no id here $$')).toBeNull();
  });

  it('stripEquationId removes all ID annotations from math blocks', () => {
    expect(stripEquationId('E = mc^2 % id: eq-1')).toBe('E = mc^2');
    expect(stripEquationId('E = mc^2 \\label{eq-2}')).toBe('E = mc^2');
  });

  it('formatEquationIdLine defaults to % id: format', () => {
    expect(formatEquationIdLine('eq-123')).toBe('% id: eq-123\n');
    expect(formatEquationIdLine('eq-123', '> ')).toBe('> % id: eq-123\n');
  });
});

describe('fixer.ts tests', () => {
  it('cleanMathBrTags replaces <br> with newlines so % comment lines do not swallow closing $$ in multiline math', () => {
    const input = '$$\n<br>\\begin{align}\n<br>u_{ij}(12) &= u^{000}_{ij}(r)\n<br>\\end{align}\n<br>% id: eq-P1-4a8b2c0d\n<br>$$';
    const cleaned = cleanMathBrTags(input);
    expect(cleaned).toContain('% id: eq-P1-4a8b2c0d');
    expect(cleaned).not.toContain('<br>');
  });

  it('cleanMathBrTags hoists \\label{eq-id} to before \\end{align} so MathJax does not throw TeX errors', () => {
    const input = '\\begin{align}\nu_{in}(12) &= u^{000}_{in}(r)\n\\end{align}\n\\label{eq-P1-7f3e1a9b}';
    const cleaned = cleanMathBrTags(input);
    expect(cleaned).toBe('\\begin{align}\nu_{in}(12) &= u^{000}_{in}(r) \\label{eq-P1-7f3e1a9b}\n\\end{align}');
  });

  it('hoistLabelInEnvironment hoists misplaced labels cleanly', () => {
    const input = '\\begin{equation}\nx=y\n\\end{equation}\n\\label{eq-test}';
    expect(hoistLabelInEnvironment(input)).toBe('\\begin{equation}\nx=y \\label{eq-test}\n\\end{equation}');
  });

  it('cleanMathBrTags cleans <br> in single-line table context without creating raw newlines', () => {
    const input = '$$<br>g_{ij}(12) = g^{000}_{ij}(r)<br>\\label{eq-3a7c5d8e}<br>$$';
    const cleaned = cleanMathBrTags(input, true);
    expect(cleaned).not.toContain('<br>');
    expect(cleaned).not.toContain('\n');
    expect(cleaned).toContain('$$ g_{ij}(12)');
  });

  it('fixTableMath fixes <br> and % id: inside single-line table cells', () => {
    const tableLine = '| **Ion-ion**,<br>$$<br>g_{ij}(12) = g^{000}_{ij}(r)<br>% id: eq-3a7c5d8e<br>$$ | cell 2 |';
    const fixed = fixTableMath(tableLine);
    expect(fixed).not.toBeNull();
    expect(fixed).not.toContain('<br>$$');
    expect(fixed).not.toContain('% id:');
    expect(fixed).toContain('\\label{eq-3a7c5d8e}');
    expect(fixed?.split('\n').length).toBe(1);
  });
});


