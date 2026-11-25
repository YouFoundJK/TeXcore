import type { Editor, EditorPosition, EditorSelection } from 'obsidian';
import { findEnclosingMathBlock } from '../src/features/math-formatter';
import {
  BUILTIN_TEXT_TRANSFORM_SNIPPETS,
  runTextTransformSnippet
} from '../src/features/snippets/transforms';

function offsetToPosition(text: string, offset: number): EditorPosition {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, ch: clamped - lineStart };
}

function positionToOffset(text: string, pos: EditorPosition): number {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < text.length; i++) {
    if (line === pos.line) {
      const lineEnd = text.indexOf('\n', lineStart);
      const effectiveEnd = lineEnd === -1 ? text.length : lineEnd;
      const actualLineEnd =
        effectiveEnd > lineStart && text[effectiveEnd - 1] === '\r'
          ? effectiveEnd - 1
          : effectiveEnd;
      return lineStart + Math.min(pos.ch, actualLineEnd - lineStart);
    }
    if (text[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  if (line === pos.line) {
    return lineStart + pos.ch;
  }
  return text.length;
}

function createMockEditor(
  initialContent: string,
  selections: EditorSelection[] | EditorPosition
): Editor {
  let content = initialContent;
  let currentSelections: EditorSelection[] = Array.isArray(selections)
    ? selections.map(s => ({ anchor: { ...s.anchor }, head: { ...s.head } }))
    : [{ anchor: { ...selections }, head: { ...selections } }];

  const editor = {
    getValue: () => content,
    setValue: (val: string) => {
      content = val;
    },
    getCursor: () => ({ ...currentSelections[0].head }),
    setCursor: (pos: EditorPosition) => {
      currentSelections = [{ anchor: { ...pos }, head: { ...pos } }];
    },
    listSelections: () => currentSelections,
    setSelection: (anchor: EditorPosition, head?: EditorPosition) => {
      currentSelections = [
        {
          anchor: { ...anchor },
          head: head ? { ...head } : { ...anchor }
        }
      ];
    },
    setSelections: (ranges: { anchor: EditorPosition; head?: EditorPosition }[]) => {
      currentSelections = ranges.map(r => ({
        anchor: { ...r.anchor },
        head: r.head ? { ...r.head } : { ...r.anchor }
      }));
    },
    getRange: (from: EditorPosition, to: EditorPosition) => {
      const fromOff = positionToOffset(content, from);
      const toOff = positionToOffset(content, to);
      return content.slice(fromOff, toOff);
    },
    replaceRange: (replacement: string, from: EditorPosition, to?: EditorPosition) => {
      const fromOff = positionToOffset(content, from);
      const toOff = to ? positionToOffset(content, to) : fromOff;
      content = content.slice(0, fromOff) + replacement + content.slice(toOff);
    },
    posToOffset: (pos: EditorPosition) => positionToOffset(content, pos),
    offsetToPos: (offset: number) => offsetToPosition(content, offset),
    getSelection: () => {
      const sel = currentSelections[0];
      const fromOff = positionToOffset(content, sel.anchor);
      const toOff = positionToOffset(content, sel.head);
      return content.slice(Math.min(fromOff, toOff), Math.max(fromOff, toOff));
    }
  };

  return editor as unknown as Editor;
}

const compactSnippet = BUILTIN_TEXT_TRANSFORM_SNIPPETS.find(s => s.id === 'compact-display-math')!;

describe('findEnclosingMathBlock', () => {
  const doc = [
    '# Title',
    '',
    '$$',
    '\\mathbf I',
    '-',
    '\\mathbf K',
    '$$',
    '',
    'Paragraph text',
    '',
    '$$',
    'a + b = c',
    '$$ ^eq_target'
  ].join('\n');

  it('finds enclosing block when cursor is inside multiline display math block', () => {
    const offset = doc.indexOf('\\mathbf I');
    const block = findEnclosingMathBlock(doc, offset);
    expect(block).not.toBeNull();
    expect(doc.slice(block!.from, block!.to)).toBe('$$\n\\mathbf I\n-\n\\mathbf K\n$$');
  });

  it('finds enclosing block with trailing block ID containing underscore', () => {
    const offset = doc.indexOf('a + b');
    const block = findEnclosingMathBlock(doc, offset);
    expect(block).not.toBeNull();
    expect(doc.slice(block!.from, block!.to)).toBe('$$\na + b = c\n$$ ^eq_target');
  });

  it('does NOT match callout prefix `>` before opening $$', () => {
    const calloutDoc = '> $$\n> a\n> +\n> b\n> $$';
    const block = findEnclosingMathBlock(calloutDoc, 0, 0);
    expect(block).toBeNull();
  });

  it('returns null when cursor is outside any math block', () => {
    const offset = doc.indexOf('Paragraph');
    expect(findEnclosingMathBlock(doc, offset)).toBeNull();
  });

  it('returns null when selection spans across multiple blocks', () => {
    const start = doc.indexOf('\\mathbf I');
    const end = doc.indexOf('a + b');
    expect(findEnclosingMathBlock(doc, start, end)).toBeNull();
  });
});

describe('Compact Display Math via runTextTransformSnippet', () => {
  it('1. Cursor inside fragmented block (no selection) -> compacts and auto-selects full $$ ... $$ block', () => {
    const initial = ['Before text', '$$', '\\mathbf I', '-', '\\mathbf K', '$$', 'After text'].join(
      '\n'
    );
    const editor = createMockEditor(initial, { line: 3, ch: 0 });

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 1, appliedOn: 'block' });
    expect(editor.getValue()).toBe('Before text\n$$\n\\mathbf I - \\mathbf K\n$$\nAfter text');
    expect(editor.getSelection()).toBe('$$\n\\mathbf I - \\mathbf K\n$$');
  });

  it('2. Cursor inside already-compact block -> no text change, still auto-selects full block', () => {
    const initial = ['Before text', '$$', '\\mathbf I - \\mathbf K', '$$', 'After text'].join('\n');
    const editor = createMockEditor(initial, { line: 2, ch: 3 });

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 0, appliedOn: 'block' });
    expect(editor.getValue()).toBe(initial);
    expect(editor.getSelection()).toBe('$$\n\\mathbf I - \\mathbf K\n$$');
  });

  it('3. Partial selection excluding $$ (forward and reverse) -> expands, compacts, and auto-selects', () => {
    const initial = ['Before text', '$$', '\\mathbf I', '-', '\\mathbf K', '$$', 'After text'].join(
      '\n'
    );

    // Forward selection
    const forwardEditor = createMockEditor(initial, [
      { anchor: { line: 2, ch: 0 }, head: { line: 3, ch: 1 } }
    ]);
    const res1 = runTextTransformSnippet(forwardEditor, compactSnippet);
    expect(res1).toEqual({ changedCount: 1, appliedOn: 'block' });
    expect(forwardEditor.getValue()).toBe(
      'Before text\n$$\n\\mathbf I - \\mathbf K\n$$\nAfter text'
    );
    expect(forwardEditor.getSelection()).toBe('$$\n\\mathbf I - \\mathbf K\n$$');

    // Reverse selection (head < anchor)
    const reverseEditor = createMockEditor(initial, [
      { anchor: { line: 3, ch: 1 }, head: { line: 2, ch: 0 } }
    ]);
    const res2 = runTextTransformSnippet(reverseEditor, compactSnippet);
    expect(res2).toEqual({ changedCount: 1, appliedOn: 'block' });
    expect(reverseEditor.getSelection()).toBe('$$\n\\mathbf I - \\mathbf K\n$$');
  });

  it('4. Shift+Down partial selection ending at col 0 of line after closing $$ -> expands and compacts', () => {
    const initial = ['Before', '$$', 'a', '+', 'b', '$$', 'After'].join('\n');
    const editor = createMockEditor(initial, [
      { anchor: { line: 2, ch: 0 }, head: { line: 6, ch: 0 } }
    ]);

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 1, appliedOn: 'block' });
    expect(editor.getValue()).toBe('Before\n$$\na + b\n$$\nAfter');
    expect(editor.getSelection()).toBe('$$\na + b\n$$');
  });

  it('5. Trailing ^block_id with underscore -> preserved and included in auto-selection', () => {
    const initial = ['$$', 'a', '+', 'b', '$$ ^eq_1_a'].join('\n');
    const editor = createMockEditor(initial, { line: 2, ch: 0 });

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 1, appliedOn: 'block' });
    expect(editor.getValue()).toBe('$$\na + b\n$$ ^eq_1_a');
    expect(editor.getSelection()).toBe('$$\na + b\n$$ ^eq_1_a');
  });

  it('6. CRLF document -> cursor inside block and trailing whitespace work cleanly', () => {
    const initial = ['Before', '$$  ', 'a', '+', 'b', '$$  ', 'After'].join('\r\n');
    const editor = createMockEditor(initial, { line: 3, ch: 0 });

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 1, appliedOn: 'block' });
    expect(editor.getSelection()).toBe('$$\na + b\n$$');
  });

  it('7. Callout display math (> $$) -> cursor on leading `>` does not match/corrupt callout', () => {
    const initial = ['> $$', '> a', '> +', '> b', '> $$'].join('\n');
    const editor = createMockEditor(initial, { line: 0, ch: 0 });

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 0, appliedOn: 'line' });
    expect(editor.getValue()).toBe(initial);
  });

  it('8. Multi-block selection (Ctrl+A / $$ a $$ text $$ b $$) -> compacts all blocks without misfiring', () => {
    const initial = [
      '# Document',
      '',
      '$$',
      'a',
      '+',
      'b',
      '$$',
      '',
      'Middle paragraph',
      '',
      '$$',
      'c',
      '+',
      'd',
      '$$'
    ].join('\n');

    const lines = initial.split('\n');
    const editor = createMockEditor(initial, [
      {
        anchor: { line: 0, ch: 0 },
        head: { line: lines.length - 1, ch: lines[lines.length - 1].length }
      }
    ]);

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 1, appliedOn: 'selection' });
    expect(editor.getValue()).toBe(
      '# Document\n\n$$\na + b\n$$\n\nMiddle paragraph\n\n$$\nc + d\n$$'
    );

    // Also test inline/multi-block transform directly on `$$ a $$ text $$ b $$`
    const inlineMulti = '$$ a $$ text $$ b $$';
    expect(compactSnippet.transform(inlineMulti)).toBe('$$\na\n$$ text $$\nb\n$$');
  });

  it('9. Multi-cursor: two empty cursors in two different blocks -> compacts and auto-selects both', () => {
    const initial = ['$$', 'a', '+', 'b', '$$', '', '$$', 'c', '+', 'd', '$$'].join('\n');
    const editor = createMockEditor(initial, [
      { anchor: { line: 2, ch: 0 }, head: { line: 2, ch: 0 } },
      { anchor: { line: 8, ch: 0 }, head: { line: 8, ch: 0 } }
    ]);

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 2, appliedOn: 'block' });
    const newDoc = editor.getValue();
    expect(newDoc).toBe('$$\na + b\n$$\n\n$$\nc + d\n$$');

    const sels = editor.listSelections();
    expect(sels).toHaveLength(2);
    expect(
      newDoc.slice(positionToOffset(newDoc, sels[0].anchor), positionToOffset(newDoc, sels[0].head))
    ).toBe('$$\na + b\n$$');
    expect(
      newDoc.slice(positionToOffset(newDoc, sels[1].anchor), positionToOffset(newDoc, sels[1].head))
    ).toBe('$$\nc + d\n$$');
  });

  it('10. Multi-cursor overlapping selections -> merges cleanly without offset corruption', () => {
    const initial = ['$$', 'a', '+', 'b', '$$', '', '$$', 'c', '+', 'd', '$$'].join('\n');
    const editor = createMockEditor(initial, [
      // Partial selection inside Block 1
      { anchor: { line: 1, ch: 0 }, head: { line: 2, ch: 1 } },
      // Selection spanning Block 1 + Block 2
      { anchor: { line: 0, ch: 0 }, head: { line: 10, ch: 2 } }
    ]);

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 1, appliedOn: 'selection' });
    expect(editor.getValue()).toBe('$$\na + b\n$$\n\n$$\nc + d\n$$');
  });

  it('11. Cursor outside any math block -> makes no changes', () => {
    const initial = 'Hello world, just normal text';
    const editor = createMockEditor(initial, { line: 0, ch: 5 });

    const result = runTextTransformSnippet(editor, compactSnippet);

    expect(result).toEqual({ changedCount: 0, appliedOn: 'line' });
    expect(editor.getValue()).toBe(initial);
  });
});
