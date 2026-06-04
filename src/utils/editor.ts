import { EditorState } from '@codemirror/state';
import { SyntaxNodeRef } from '@lezer/common';
import { EditorPosition, Loc, MarkdownView, editorLivePreviewField } from 'obsidian';

export function locToEditorPosition(loc: Loc): EditorPosition {
  return { ch: loc.col, line: loc.line };
}

export function isLivePreview(state: EditorState) {
  return state.field(editorLivePreviewField);
}

export function isEditingView(markdownView: MarkdownView) {
  return markdownView.getMode() === 'source';
}

/** CodeMirror/Lezer utilities */

export function nodeText(node: SyntaxNodeRef, state: EditorState): string {
  return state.sliceDoc(node.from, node.to);
}
