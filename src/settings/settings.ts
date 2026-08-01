import { Modifier } from 'obsidian';
import type { TConfig } from '../ui/export-pdf/modal';
import { LeafArgs } from '../declarations';

// Types
export const NUMBER_STYLES = ['arabic', 'alph', 'Alph', 'roman', 'Roman'] as const;
export type NumberStyle = (typeof NUMBER_STYLES)[number];

export const LEAF_OPTIONS = [
  'Current tab',
  'Split right',
  'Split down',
  'New tab',
  'New window'
] as const;
export type LeafOption = (typeof LEAF_OPTIONS)[number];
export const LEAF_OPTION_TO_ARGS: Record<LeafOption, LeafArgs> = {
  'Current tab': [false],
  'Split right': ['split', 'vertical'],
  'Split down': ['split', 'horizontal'],
  'New tab': ['tab'],
  'New window': ['window']
};

export const SEARCH_METHODS = ['Fuzzy', 'Simple'] as const;
export type SearchMethod = (typeof SEARCH_METHODS)[number];

// This is now the single settings interface for the entire plugin.
export interface PluginSettings {
  // Numbering
  numberOnlyReferencedEquations: boolean;
  eqNumberPrefix: string;
  eqNumberSuffix: string;
  eqNumberInit: number;
  eqNumberStyle: NumberStyle;
  lineByLine: boolean;

  // Referencing
  eqRefPrefix: string;
  eqRefSuffix: string;
  insertSpace: boolean;
  noteTitleInEquationLink: boolean;

  // Autocomplete & Search
  enableSuggest: boolean;
  triggerSuggest: string;
  renderMathInSuggestion: boolean;
  suggestNumber: number;
  searchMethod: SearchMethod;
  modifierToJump: Modifier;
  showModifierInstruction: boolean;
  suggestLeafOption: LeafOption;

  // PDF Export Settings
  prevConfig?: TConfig;
  showTitle: boolean;
  maxLevel: string;
  displayHeader: boolean;
  displayFooter: boolean;
  headerTemplate: string;
  footerTemplate: string;
  printBackground: boolean;
  generateTaggedPDF: boolean;
  displayMetadata: boolean;
  isTimestamp: boolean;
  debug: boolean;
  enabledCss: boolean;
  concurrency: string;

  // Zotero Cleanup
  enableZoteroCleanup: boolean;
  zoteroCleanDirectories: string;

  // Custom Note Hotkeys
  customNoteHotkeys: CustomNoteHotkey[];

  // Custom Callouts
  customCallouts: CustomCallout[];

  // TikZJax Settings
  enableTikzjax: boolean;
  invertColorsInDarkMode: boolean;
  pinnedTikzComponents?: string[];
  installedTikzPackages?: string[];

  // Version tracking
  currentVersion: string | null;
}

export interface CustomNoteHotkey {
  id: string;
  notePath: string;
  name: string;
  hotkeyModifiers: Modifier[];
  hotkeyKey: string;
}

export interface CustomCallout {
  id: string;
  type: string;
  title?: string;
  color: string;
  icon?: string;
  registerCommand: boolean;
  hotkeyModifiers?: Modifier[];
  hotkeyKey?: string;
}

export const DEFAULT_CUSTOM_CALLOUTS: CustomCallout[] = [
  {
    id: 'preset-cite',
    type: 'cite',
    title: 'Citation',
    color: '235, 219, 178',
    registerCommand: true
  },
  {
    id: 'preset-authors',
    type: 'authors',
    title: 'Authors',
    color: '251, 73, 52',
    registerCommand: true
  },
  {
    id: 'preset-abstract',
    type: 'abstract',
    title: 'Abstract',
    color: '152, 151, 26',
    registerCommand: true
  },
  {
    id: 'preset-definition',
    type: 'definition',
    title: 'Definition',
    color: '219, 51, 96',
    icon: 'lucide-bookmark',
    registerCommand: true
  },
  {
    id: 'preset-significance',
    type: 'significance',
    title: 'Significance',
    color: '142, 192, 124',
    icon: 'lucide-brain-circuit',
    registerCommand: true
  }
];

export const DEFAULT_SETTINGS: Required<PluginSettings> = {
  currentVersion: null,
  // Numbering
  numberOnlyReferencedEquations: true,
  eqNumberPrefix: '',
  eqNumberSuffix: '',
  eqNumberInit: 1,
  eqNumberStyle: 'arabic',
  lineByLine: true,

  // Referencing
  eqRefPrefix: '',
  eqRefSuffix: '',
  insertSpace: true,
  noteTitleInEquationLink: true,

  // Autocomplete & Search
  enableSuggest: true,
  triggerSuggest: '\\eqref',
  renderMathInSuggestion: true,
  suggestNumber: 20,
  searchMethod: 'Fuzzy',
  modifierToJump: 'Mod',
  showModifierInstruction: true,
  suggestLeafOption: 'Current tab',

  // PDF Export Settings
  prevConfig: {
    pageSize: 'A4',
    marginType: '1',
    open: true,
    landscape: false,
    scale: 100,
    showTitle: true,
    displayHeader: true,
    displayFooter: true,
    marginTop: '10',
    marginBottom: '10',
    marginLeft: '10',
    marginRight: '10',
    cssSnippet: '0'
  },
  showTitle: true,
  maxLevel: '6',
  displayHeader: true,
  displayFooter: true,
  headerTemplate: `<div style="width: 100vw;font-size:10px;text-align:center;"><span class="title"></span></div>`,
  footerTemplate: `<div style="width: 100vw;font-size:10px;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
  printBackground: false,
  generateTaggedPDF: false,
  displayMetadata: false,
  isTimestamp: false,
  debug: false,
  enabledCss: false,
  concurrency: '5',

  // Zotero Cleanup
  enableZoteroCleanup: false,
  zoteroCleanDirectories: '',

  // Custom Note Hotkeys
  customNoteHotkeys: [],

  // Custom Callouts
  customCallouts: DEFAULT_CUSTOM_CALLOUTS,

  // TikZJax Settings
  enableTikzjax: true,
  invertColorsInDarkMode: true,
  pinnedTikzComponents: [],
  installedTikzPackages: []
};
