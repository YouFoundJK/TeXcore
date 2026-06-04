import { Suggestions } from 'obsidian';

export function getSelectedItem<T>(suggestions: Suggestions<T>): T | undefined {
  return suggestions.values[suggestions.selectedItem];
}
