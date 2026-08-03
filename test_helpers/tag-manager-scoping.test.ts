import { EditorState } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { isEquationRelevantChange } from '../src/core/equations/live-preview-equations';
import { hasRowLayoutRelevantChanges, getLayoutField } from '../src/features/tikz/row-layout';
import { editorLivePreviewField, editorInfoField } from 'obsidian';
import LatexReferencer from '../src/main';

describe('TagManager Scoping & Event Filtering Tests', () => {
  it('returns FALSE for ordinary text typing', () => {
    let capturedUpdate: ViewUpdate | null = null;

    const listenerPlugin = EditorView.updateListener.of(update => {
      capturedUpdate = update;
    });

    const state = EditorState.create({
      doc: 'Initial text content',
      extensions: [listenerPlugin]
    });

    const view = new EditorView({ state });

    // Type ordinary text
    view.dispatch({
      changes: { from: 20, insert: ' Hello world, typing more plain text here.' }
    });

    expect(capturedUpdate).not.toBeNull();
    expect(isEquationRelevantChange(capturedUpdate!)).toBe(false);

    view.destroy();
  });

  it('returns FALSE for math formulas without equation IDs', () => {
    let capturedUpdate: ViewUpdate | null = null;

    const listenerPlugin = EditorView.updateListener.of(update => {
      capturedUpdate = update;
    });

    const state = EditorState.create({
      doc: '$$ a + b = c $$',
      extensions: [listenerPlugin]
    });

    const view = new EditorView({ state });

    // Edit math formula without adding ID
    view.dispatch({
      changes: { from: 7, insert: ' + d' }
    });

    expect(capturedUpdate).not.toBeNull();
    expect(isEquationRelevantChange(capturedUpdate!)).toBe(false);

    view.destroy();
  });

  it('returns TRUE when adding an equation ID (% id: eq-...)', () => {
    let capturedUpdate: ViewUpdate | null = null;

    const listenerPlugin = EditorView.updateListener.of(update => {
      capturedUpdate = update;
    });

    const state = EditorState.create({
      doc: '$$.\nE = mc^2\n$$',
      extensions: [listenerPlugin]
    });

    const view = new EditorView({ state });

    view.dispatch({
      changes: { from: 11, insert: '\n% id: eq-einstein' }
    });

    expect(capturedUpdate).not.toBeNull();
    expect(isEquationRelevantChange(capturedUpdate!)).toBe(true);

    view.destroy();
  });

  it('returns TRUE when adding a LaTeX label (\\label{eq-...)', () => {
    let capturedUpdate: ViewUpdate | null = null;

    const listenerPlugin = EditorView.updateListener.of(update => {
      capturedUpdate = update;
    });

    const state = EditorState.create({
      doc: '$$.\nE = mc^2\n$$',
      extensions: [listenerPlugin]
    });

    const view = new EditorView({ state });

    view.dispatch({
      changes: { from: 11, insert: '\n\\label{eq-einstein}' }
    });

    expect(capturedUpdate).not.toBeNull();
    expect(isEquationRelevantChange(capturedUpdate!)).toBe(true);

    view.destroy();
  });

  it('returns TRUE when adding an equation reference link ([[#^eq-...]])', () => {
    let capturedUpdate: ViewUpdate | null = null;

    const listenerPlugin = EditorView.updateListener.of(update => {
      capturedUpdate = update;
    });

    const state = EditorState.create({
      doc: 'See equation here: ',
      extensions: [listenerPlugin]
    });

    const view = new EditorView({ state });

    view.dispatch({
      changes: { from: 19, insert: '[[#^eq-einstein]]' }
    });

    expect(capturedUpdate).not.toBeNull();
    expect(isEquationRelevantChange(capturedUpdate!)).toBe(true);

    view.destroy();
  });

  it('returns TRUE when adding a \\eqref{eq-...} reference', () => {
    let capturedUpdate: ViewUpdate | null = null;

    const listenerPlugin = EditorView.updateListener.of(update => {
      capturedUpdate = update;
    });

    const state = EditorState.create({
      doc: 'As derived in ',
      extensions: [listenerPlugin]
    });

    const view = new EditorView({ state });

    view.dispatch({
      changes: { from: 14, insert: '\\eqref{eq-einstein}' }
    });

    expect(capturedUpdate).not.toBeNull();
    expect(isEquationRelevantChange(capturedUpdate!)).toBe(true);

    view.destroy();
  });

  it('returns TRUE when deleting an equation ID or reference link', () => {
    let capturedUpdate: ViewUpdate | null = null;

    const listenerPlugin = EditorView.updateListener.of(update => {
      capturedUpdate = update;
    });

    const state = EditorState.create({
      doc: '$$ E = mc^2 % id: eq-einstein $$',
      extensions: [listenerPlugin]
    });

    const view = new EditorView({ state });

    // Delete the ID comment
    const idPos = state.doc.toString().indexOf('% id: eq-einstein');
    view.dispatch({
      changes: { from: idPos, to: idPos + '% id: eq-einstein'.length }
    });

    expect(capturedUpdate).not.toBeNull();
    expect(isEquationRelevantChange(capturedUpdate!)).toBe(true);

    view.destroy();
  });

  describe('Row Layout and TikZ Scoping Tests', () => {
    it('returns FALSE for hasRowLayoutRelevantChanges on ordinary typing', () => {
      let capturedUpdate: ViewUpdate | null = null;
      const listener = EditorView.updateListener.of(update => {
        capturedUpdate = update;
      });

      const state = EditorState.create({
        doc: 'Some initial text here.',
        extensions: [listener]
      });
      const view = new EditorView({ state });

      view.dispatch({
        changes: { from: 5, insert: ' and more typing' }
      });

      expect(capturedUpdate).not.toBeNull();
      expect(hasRowLayoutRelevantChanges(capturedUpdate!.changes, capturedUpdate!.startState.doc)).toBe(false);
      view.destroy();
    });

    it('returns TRUE for hasRowLayoutRelevantChanges when user types row layout tags', () => {
      let capturedUpdate: ViewUpdate | null = null;
      const listener = EditorView.updateListener.of(update => {
        capturedUpdate = update;
      });

      const state = EditorState.create({
        doc: 'Some text.\n',
        extensions: [listener]
      });
      const view = new EditorView({ state });

      view.dispatch({
        changes: { from: 11, insert: ';;;row left center' }
      });

      expect(capturedUpdate).not.toBeNull();
      expect(hasRowLayoutRelevantChanges(capturedUpdate!.changes, capturedUpdate!.startState.doc)).toBe(true);
      view.destroy();
    });

    it('returns TRUE for hasRowLayoutRelevantChanges when deleting row layout tags', () => {
      let capturedUpdate: ViewUpdate | null = null;
      const listener = EditorView.updateListener.of(update => {
        capturedUpdate = update;
      });

      const state = EditorState.create({
        doc: 'Some text.\n;;;row left\n',
        extensions: [listener]
      });
      const view = new EditorView({ state });

      const rowPos = state.doc.toString().indexOf(';;;row');
      view.dispatch({
        changes: { from: rowPos, to: rowPos + ';;;row left'.length }
      });

      expect(capturedUpdate).not.toBeNull();
      expect(hasRowLayoutRelevantChanges(capturedUpdate!.changes, capturedUpdate!.startState.doc)).toBe(true);
      view.destroy();
    });

    it('STRICT: initial StateField state contains decorations when doc contains existing row markup', () => {
      const doc = `Some header\n;;;row left | right\nCol 1\n;;\nCol 2\n;;;\nSome footer`;
      const plugin = {} as unknown as LatexReferencer;
      const field = getLayoutField(plugin);

      const state = EditorState.create({
        doc,
        extensions: [
          editorLivePreviewField.init(() => true),
          editorInfoField.init(() => ({ file: { path: 'test.md' } })),
          field
        ]
      });

      const decorations = state.field(field);
      expect(decorations.size).toBeGreaterThan(0);
    });

    it('STRICT: initial StateField state is empty when doc does NOT contain row markup', () => {
      const doc = `Some header\nNo row markup here\nSome footer`;
      const plugin = {} as unknown as LatexReferencer;
      const field = getLayoutField(plugin);

      const state = EditorState.create({
        doc,
        extensions: [
          editorLivePreviewField.init(() => true),
          editorInfoField.init(() => ({ file: { path: 'test.md' } })),
          field
        ]
      });

      const decorations = state.field(field);
      expect(decorations.size).toBe(0);
    });
  });
});
