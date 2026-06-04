import { PopoverSuggest, SuggestModal, Suggestions, HoverParent } from 'obsidian';
import { PopoverManager } from './popoverManager';

export type Suggester<T> = PopoverSuggest<T> | SuggestModal<T>;
export type PatchedSuggester<T> = Suggester<T> & { popoverManager: PopoverManager<T> };

export interface PreviewInfo {
  linktext: string;
  sourcePath: string;
  line?: number;
}

// This module now augments the global obsidian types
declare module 'obsidian' {
  interface PopoverSuggest<T> {
    suggestions: Suggestions<T>;
    suggestEl: HTMLElement;
    isOpen: boolean;
  }

  interface SuggestModal<T> {
    isOpen: boolean;
    chooser: Suggestions<T>;
  }

  interface HoverPopover {
    parent: HoverParent;
    targetEl: HTMLElement | null;
    shownPos: { x: number; y: number } | null;
    hide(): void;
    position(pos: { x: number; y: number } | null): void;
  }
}
