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

