import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  createObsitexAutoTemplatePlugin,
  DEFAULT_OBSITEX_TEMPLATE
} from '../src/core/equations/obsitex-auto-template';

describe('obsitex-auto-template tests', () => {
  it('template contains eq-prefix, eq-continuity and inline hints', () => {
    expect(DEFAULT_OBSITEX_TEMPLATE).toContain('eq-prefix: A');
    expect(DEFAULT_OBSITEX_TEMPLATE).toContain('eq-continuity: false');
    expect(DEFAULT_OBSITEX_TEMPLATE).toContain('#');
  });

  it('populates empty obsitex codeblock with template', async () => {
    const initialText = `
# Title

\`\`\`obsitex

\`\`\`

$$
x = 1
$$
`;

    const state = EditorState.create({
      doc: initialText,
      extensions: [createObsitexAutoTemplatePlugin()]
    });

    const view = new EditorView({ state });

    // Allow timeout in plugin to fire
    await new Promise(resolve => window.setTimeout(resolve, 300));

    const updatedText = view.state.doc.toString();
    expect(updatedText).toContain('eq-prefix: A');
    expect(updatedText).toContain('eq-continuity: false');

    view.destroy();
  });

  it('STRICT: does NOT modify non-empty obsitex codeblock', async () => {
    const initialText = `
\`\`\`obsitex
- eq-prefix: CustomSection
- eq-continuity: true
\`\`\`
`;

    const state = EditorState.create({
      doc: initialText,
      extensions: [createObsitexAutoTemplatePlugin()]
    });

    const view = new EditorView({ state });

    await new Promise(resolve => window.setTimeout(resolve, 300));

    const updatedText = view.state.doc.toString();
    expect(updatedText).toBe(initialText); // Must remain completely untouched!

    view.destroy();
  });
});
