import { Notice } from 'obsidian';
import type LatexReferencer from '../../main';
import { TextTransformSuggestModal } from '../../ui/snippets/modal';

export class SnippetManager {
  constructor(private plugin: LatexReferencer) {}

  onLoad() {
    this.plugin.addCommand({
      id: 'add-tags-frontmatter',
      name: 'Add Tags',
      editorCallback: editor => {
        const content = editor.getValue().replace(/\r\n/g, '\n');
        const frontmatterPattern = /^---\n[\s\S]*?\n---\n?/;
        if (frontmatterPattern.test(content)) {
          new Notice('Frontmatter already exists at the top of this note.');
          return;
        }

        const tagsFrontmatter = '---\ntags:\n  - \naliases:\n  - \n---\n\n';
        editor.replaceRange(tagsFrontmatter, { line: 0, ch: 0 });
        new Notice('Added tags frontmatter.');
      }
    });

    this.plugin.addCommand({
      id: 'run-text-transform-snippet',
      name: 'Run Text Transform Snippet',
      editorCallback: editor => {
        new TextTransformSuggestModal(this.plugin.app, editor).open();
      }
    });
  }
}
