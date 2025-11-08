import { Modifier } from "obsidian";
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
};
