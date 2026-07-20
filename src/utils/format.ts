import { App, TFile } from 'obsidian';
import { PluginSettings } from '../settings/settings';
import { parseObsitexConfig } from './obsitex';

const ROMAN = [
  '',
  'C',
  'CC',
  'CCC',
  'CD',
  'D',
  'DC',
  'DCC',
  'DCCC',
  'CM',
  '',
  'X',
  'XX',
  'XXX',
  'XL',
  'L',
  'LX',
  'LXX',
  'LXXX',
  'XC',
  '',
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX'
];

export function toRomanUpper(num: number): string {
  const digits = String(num).split('');
  let roman = '';
  let i = 3;
  while (i--) {
    const digit = digits.pop();
    roman = ((ROMAN[+(digit ?? 0) + i * 10] ?? '') || '') + roman;
  }
  return Array(+digits.join('') + 1).join('M') + roman;
}

export function toRomanLower(num: number): string {
  return toRomanUpper(num).toLowerCase();
}

export const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function toAlphUpper(num: number): string {
  return (num - 1)
    .toString(26)
    .split('')
    .map(str => ALPH[parseInt(str, 26)])
    .join('');
}

export function toAlphLower(num: number): string {
  return toAlphUpper(num).toLowerCase();
}

export const CONVERTER = {
  arabic: String,
  alph: toAlphLower,
  Alph: toAlphUpper,
  roman: toRomanLower,
  Roman: toRomanUpper
};

/**
 * Get an appropriate prefix for equation numbering.
 */
export function getEqNumberPrefix(
  app: App,
  file: TFile,
  settings: Required<PluginSettings>,
  content?: string
): string {
  if (content) {
    const config = parseObsitexConfig(content);
    if (config.eqPrefix !== undefined) {
      return config.eqPrefix;
    }
  }
  return settings.eqNumberPrefix;
}
