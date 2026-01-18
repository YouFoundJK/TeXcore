import { App, FuzzySuggestModal, Modal, Setting, Notice, MarkdownView } from "obsidian";
import type { Snippet } from "../settings/settings";
import type LatexReferencer from "../../main";

export class SnippetSuggestModal extends FuzzySuggestModal<Snippet> {
  constructor(app: App, private plugin: LatexReferencer) {
    super(app);
    this.setPlaceholder("Select a snippet to insert...");
  }

  getItems(): Snippet[] {
    return this.plugin.settings.snippets;
  }

  getItemText(item: Snippet): string {
    return item.name;
  }

  onChooseItem(item: Snippet, evt: MouseEvent | KeyboardEvent): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view) {
      const editor = view.editor;
      editor.replaceSelection(item.content);
    }
  }
}

export class SnippetEditModal extends Modal {
  name: string;
  content: string;
  editingSnippet: Snippet | null = null;
  onSubmit: (result: Snippet) => void;

  constructor(app: App, onSubmit: (result: Snippet) => void, snippet: Snippet | null = null) {
    super(app);
    this.onSubmit = onSubmit;
    this.editingSnippet = snippet;
    this.name = snippet?.name || "";
    this.content = snippet?.content || "";
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: this.editingSnippet ? "Edit Snippet" : "Add Snippet" });

    new Setting(contentEl)
      .setName("Name")
      .setDesc("The name of the snippet (used for searching and command palette)")
      .addText(text => text
        .setValue(this.name)
        .onChange(value => {
          this.name = value;
        }));

    const contentSetting = new Setting(contentEl)
      .setName("Content")
      .setDesc("The LaTeX content to insert");

    // Use a larger text area for content
    const textArea = contentSetting.controlEl.createEl("textarea", {
      attr: {
        rows: "5",
        cols: "50",
        style: "width: 100%; min-height: 150px; font-family: monospace;"
      }
    });
    textArea.value = this.content;
    textArea.addEventListener("input", (e) => {
      this.content = (e.target as HTMLTextAreaElement).value;
    });
    // Align textarea properly
    contentSetting.settingEl.style.display = "block";
    contentSetting.infoEl.style.marginBottom = "10px";


    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          if (!this.name || !this.content) {
            new Notice("Name and content are required.");
            return;
          }
          this.onSubmit({
            id: this.editingSnippet?.id || crypto.randomUUID(),
            name: this.name,
            content: this.content,
            options: this.editingSnippet?.options
          });
          this.close();
        }));
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
