import { Modifier } from "obsidian";
import type { TConfig } from "../export-pdf/modal";
import { LeafArgs } from "../../declarations";

// Types
export const NUMBER_STYLES = ["arabic", "alph", "Alph", "roman", "Roman"] as const;
export type NumberStyle = typeof NUMBER_STYLES[number];

export const LEAF_OPTIONS = ["Current tab", "Split right", "Split down", "New tab", "New window"] as const;
export type LeafOption = typeof LEAF_OPTIONS[number];
export const LEAF_OPTION_TO_ARGS: Record<LeafOption, LeafArgs> = {
    "Current tab": [false],
    "Split right": ["split", "vertical"],
    "Split down": ["split", "horizontal"],
    "New tab": ["tab"],
    "New window": ["window"],
};

export const SEARCH_METHODS = ["Fuzzy", "Simple"] as const;
export type SearchMethod = typeof SEARCH_METHODS[number];

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

    // Snippets
    snippets: Snippet[];
}

export interface Snippet {
    id: string;
    name: string;
    content: string;
    replacement?: string; // Optional: for future regex replacement support
    options?: {
        mode?: "insert" | "replace"; // Future proofing
    };
}

export const DEFAULT_SETTINGS: Required<PluginSettings> = {
    // Numbering
    numberOnlyReferencedEquations: true,
    eqNumberPrefix: "",
    eqNumberSuffix: "",
    eqNumberInit: 1,
    eqNumberStyle: "arabic",
    lineByLine: true,

    // Referencing
    eqRefPrefix: "",
    eqRefSuffix: "",
    insertSpace: true,
    noteTitleInEquationLink: true,

    // Autocomplete & Search
    enableSuggest: true,
    triggerSuggest: "\\eqref",
    renderMathInSuggestion: true,
    suggestNumber: 20,
    searchMethod: "Fuzzy",
    modifierToJump: "Mod",
    showModifierInstruction: true,
    suggestLeafOption: "Current tab",

    // PDF Export Settings
    prevConfig: {
        pageSize: "A4",
        marginType: "1",
        open: true,
        landscape: false,
        scale: 100,
        showTitle: true,
        displayHeader: true,
        displayFooter: true,
        marginTop: "10",
        marginBottom: "10",
        marginLeft: "10",
        marginRight: "10",
        cssSnippet: "0",
    },
    showTitle: true,
    maxLevel: "6",
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
    concurrency: "5",

    // Snippets
    snippets: [],
};
