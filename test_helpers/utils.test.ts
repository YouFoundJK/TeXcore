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
  isStructuralCalloutLine
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
    const dummyFile = {} as TFile;
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
