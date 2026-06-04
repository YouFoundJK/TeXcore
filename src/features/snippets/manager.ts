import type LatexReferencer from '../../main';
import { TextTransformSuggestModal } from '../../ui/snippets/modal';
import { showNotice } from 'utils/obsidian';

export class SnippetManager {
  constructor(private plugin: LatexReferencer) {}

  onLoad() {
    this.plugin.addCommand({
      id: 'add-tags-frontmatter',
      name: 'Add tags',
      editorCallback: editor => {
        const content = editor.getValue().replace(/\r\n/g, '\n');
        const frontmatterPattern = /^---\n[\s\S]*?\n---\n?/;
        if (frontmatterPattern.test(content)) {
          showNotice('Frontmatter already exists at the top of this note.');
          return;
        }

        const tagsFrontmatter = '---\ntags:\n  - \naliases:\n  - \n---\n\n';
        editor.replaceRange(tagsFrontmatter, { line: 0, ch: 0 });
        showNotice('Added tags frontmatter.');
      }
    });

    this.plugin.addCommand({
      id: 'run-text-transform-snippet',
      name: 'Run text transform snippet',
      editorCallback: editor => {
        new TextTransformSuggestModal(this.plugin.app, editor).open();
      }
    });
  }
}
