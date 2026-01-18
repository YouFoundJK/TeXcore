import { MarkdownView } from "obsidian";
import type LatexReferencer from "../../main";
import type { Snippet } from "../settings/settings";
import { SnippetSuggestModal } from "./modal";

export class SnippetManager {
  constructor(private plugin: LatexReferencer) { }

  async addSnippet(snippet: Snippet) {
    this.plugin.settings.snippets.push(snippet);
    await this.plugin.saveSettings();
    this.registerSnippetCommand(snippet);
  }

  async updateSnippet(id: string, updatedSnippet: Snippet) {
    const index = this.plugin.settings.snippets.findIndex(s => s.id === id);
    if (index !== -1) {
      this.plugin.settings.snippets[index] = updatedSnippet;
      await this.plugin.saveSettings();
      // Re-register command likely requires a reload or sophisticated command management
      // For now, prompt user to reload or rely on simple command overwriting if ID is stable?
      // Obsidian doesn't easily allow unregistering commands dynamically without private APIs.
      // However, we can update the callback if we keep track of it, but easiest is to just
      // keep using the ID. Since ID is typically stable, the command ID won't change.
      // But the Name might change. 
    }
  }

  async deleteSnippet(id: string) {
    const index = this.plugin.settings.snippets.findIndex(s => s.id === id);
    if (index !== -1) {
      this.plugin.settings.snippets.splice(index, 1);
      await this.plugin.saveSettings();
      // Again, dynamic unregistering is hard.
    }
  }

  getSnippets(): Snippet[] {
    return this.plugin.settings.snippets;
  }

  registerSnippetCommand(snippet: Snippet) {
    const commandId = `insert-snippet-${snippet.id}`;

    this.plugin.addCommand({
      id: commandId,
      name: `Insert Snippet: ${snippet.name}`,
      editorCallback: (editor, view) => {
        editor.replaceSelection(snippet.content);
      }
    });
  }

  onLoad() {
    // Register main command
    this.plugin.addCommand({
      id: "insert-latex-snippet",
      name: "Insert LaTeX Snippet",
      callback: () => {
        new SnippetSuggestModal(this.plugin.app, this.plugin).open();
      }
    });

    // Register individual commands
    for (const snippet of this.plugin.settings.snippets) {
      this.registerSnippetCommand(snippet);
    }
  }
}
