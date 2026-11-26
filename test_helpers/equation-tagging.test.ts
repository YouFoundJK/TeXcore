import { App, Editor, TFile, Vault } from 'obsidian';
import { MockAppBuilder } from './AppBuilder';
import { FileBuilder } from './FileBuilder';
import {
  EQ_ID_COMMENT_REGEX,
  findDisplayMathBlocks,
  findTopLevelEndEnvMatch,
  hasNonCommentTag,
  isLikelyCorruptedMathBlock
} from '../src/utils/parse';
import { computeSafeTagUpdate } from '../src/core/equations/tag-updater';
import { ActiveNoteEquationProvider } from '../src/core/equations/provider-equation';
import { processActiveNoteEquations } from '../src/core/equations/numbering';
import { NonActiveNoteIO } from '../src/utils/file-io';
import { insertBlockIdIfNotExist } from '../src/utils/plugin';
import { formatMathContent } from '../src/features/math-formatter/formatter';
import { checkAndFixCalloutMath } from '../src/utils/fixer';
import { DEFAULT_SETTINGS } from '../src/settings/settings';
import type LatexReferencer from '../src/main';

describe('findDisplayMathBlocks hardening', () => {
  it('recovers from an orphan $$ when encountering an ATX heading, wikilink, or callout header', () => {
    const content = [
      '$$',
      'a = b',
      '% id: eq-radbvh8z$$',
      '$$',
      '',
      '## Next Section',
      'Refer [[#^eq-next1234]]',
      '',
      '$$',
      'c = d',
      '% id: eq-next1234',
      '$$'
    ].join('\n');

    const blocks = findDisplayMathBlocks(content);
    const texts = blocks.map(b => content.slice(b.from, b.to));
    expect(texts.some(t => t.includes('## Next Section'))).toBe(false);
    expect(texts.some(t => t.includes('[[#^eq-next1234]]'))).toBe(false);
    expect(texts.some(t => t.includes('c = d') && t.includes('% id: eq-next1234'))).toBe(true);
  });

  it('aborts unclosed display math when hitting a fenced code block', () => {
    const content = [
      '$$',
      'unclosed = 1',
      '```ts',
      'const x = 1;',
      '```',
      '$$',
      'real = 2',
      '$$'
    ].join('\n');

    const blocks = findDisplayMathBlocks(content);
    expect(blocks.length).toBe(1);
    expect(content.slice(blocks[0].from, blocks[0].to)).toBe('$$\nreal = 2\n$$');
  });

  it('handles CRLF blank lines inside unclosed inline math', () => {
    const content = 'Price is $5\r\n\r\n$$\r\nx = 1\r\n$$';
    const blocks = findDisplayMathBlocks(content);
    expect(blocks.length).toBe(1);
    expect(content.slice(blocks[0].from, blocks[0].to)).toBe('$$\r\nx = 1\r\n$$');
  });

  it('handles 3+ consecutive dollar signs without leaving a dangling inline $', () => {
    const content = '$$$\nx = 1\n$$$\n\n$$\ny = 2\n$$';
    const blocks = findDisplayMathBlocks(content);
    expect(blocks.length).toBe(1);
    expect(content.slice(blocks[0].from, blocks[0].to)).toBe('$$\ny = 2\n$$');
  });

  it('detects math blocks inside callouts and tables', () => {
    const content = [
      '> [!note]',
      '> $$',
      '> x = 1',
      '> $$',
      '',
      '| col1 | col2 |',
      '| --- | --- |',
      '| $$a = b$$ | $$c = d$$ |'
    ].join('\n');

    const blocks = findDisplayMathBlocks(content);
    expect(blocks.length).toBe(3);
  });

  it('isLikelyCorruptedMathBlock flags markdown structural markers', () => {
    expect(isLikelyCorruptedMathBlock('x = 1\n## Heading')).toBe(true);
    expect(isLikelyCorruptedMathBlock('x = 1\n> [!note]')).toBe(true);
    expect(isLikelyCorruptedMathBlock('x = 1\n[[Some-Note]]')).toBe(true);
    expect(isLikelyCorruptedMathBlock('x = 1\n```js\n```')).toBe(true);
    expect(isLikelyCorruptedMathBlock('| a | b |\n| --- | --- |')).toBe(true);
    expect(isLikelyCorruptedMathBlock('\\begin{align}\nx &= 1\n\\end{align}')).toBe(false);
  });
});

describe('computeSafeTagUpdate', () => {
  it('adds tag to single-line and multi-line normal equations and is idempotent', () => {
    const single = ' E = mc^2 % id: eq-abc12345 ';
    const updatedSingle = computeSafeTagUpdate(single, { printName: '(1)' });
    expect(updatedSingle).not.toBeNull();
    expect(updatedSingle).toContain('E = mc^2 \\tag{1}');
    expect(updatedSingle).toContain('% id: eq-abc12345');
    expect(computeSafeTagUpdate(updatedSingle!, { printName: '(1)' })).toBeNull();

    const multi = '\nx = y + z\n% id: eq-abc12345\n';
    const updatedMulti = computeSafeTagUpdate(multi, { printName: '(2)' });
    expect(updatedMulti).toBe('\nx = y + z \\tag{2}\n% id: eq-abc12345\n');
    expect(computeSafeTagUpdate(updatedMulti!, { printName: '(2)' })).toBeNull();
  });

  it('places tag before \\end{align} even when % id: precedes \\end{align}', () => {
    const inner = '\n\\begin{align}\na &= b \\\\\nc &= d\n% id: eq-1234abcd\n\\end{align}\n';
    const updated = computeSafeTagUpdate(inner, { printName: '(3)' });
    expect(updated).toBe(
      '\n\\begin{align}\na &= b \\\\\nc &= d \\tag{3}\n% id: eq-1234abcd\n\\end{align}\n'
    );
    expect(computeSafeTagUpdate(updated!, { printName: '(3)' })).toBeNull();
  });

  it('preserves callout prefix > on \\end{align} and % id: lines', () => {
    const inner = '\n> \\begin{align}\n> a &= b\n> \\end{align}\n> % id: eq-call1234\n> ';
    const updated = computeSafeTagUpdate(inner, {
      printName: '(4)'
    });
    expect(updated).toBe(
      '\n> \\begin{align}\n> a &= b \\tag{4}\n> \\end{align}\n> % id: eq-call1234\n> '
    );
    expect(computeSafeTagUpdate(updated!, { printName: '(4)' })).toBeNull();
  });

  it('inserts tag before trailing % comment on math line', () => {
    const inner = '\na = b % inline note\n% id: eq-comm1234\n';
    const updated = computeSafeTagUpdate(inner, { printName: '(5)' });
    expect(updated).toBe('\na = b \\tag{5} % inline note\n% id: eq-comm1234\n');
    expect(computeSafeTagUpdate(updated!, { printName: '(5)' })).toBeNull();
  });

  it('handles sub-equations (Mode 1) and ignores empty trailing row before \\end{align}', () => {
    const inner = '\n\\begin{align}\na &= 1 \\\\\nb &= 2 \\\\\n\\end{align}\n% id: eq-sub12345\n';
    const updated = computeSafeTagUpdate(inner, {
      printName: '(6)',
      subIndices: new Set([1, 2])
    });
    expect(updated).toBe(
      '\n\\begin{align}\na &= 1 \\tag{6.1} \\\\\nb &= 2 \\tag{6.2} \\\\\n\\end{align}\n% id: eq-sub12345\n'
    );
    expect(
      computeSafeTagUpdate(updated!, { printName: '(6)', subIndices: new Set([1, 2]) })
    ).toBeNull();
  });

  it('cleans up sub-equation tags when switching from Mode 1 back to Mode 2', () => {
    const inner =
      '\n\\begin{align}\na &= 1 \\tag{6.1} \\\\\nb &= 2 \\tag{6.2}\n\\end{align}\n% id: eq-sub12345\n';
    const updated = computeSafeTagUpdate(inner, { printName: '(7)' });
    expect(updated).toBe(
      '\n\\begin{align}\na &= 1 \\\\\nb &= 2 \\tag{7}\n\\end{align}\n% id: eq-sub12345\n'
    );
    expect(computeSafeTagUpdate(updated!, { printName: '(7)' })).toBeNull();
  });

  it('refuses to touch nested/corrupted \\tag or markdown-corrupted blocks', () => {
    expect(
      computeSafeTagUpdate('\nx = 1 \\tag{1 \\tag{2}}\n% id: eq-bad12345\n', {
        printName: '(1)'
      })
    ).toBeNull();

    expect(
      computeSafeTagUpdate('\n## Heading\nx = 1\n% id: eq-bad12345\n', {
        printName: '(1)'
      })
    ).toBeNull();

    expect(
      computeSafeTagUpdate('\n\\begin{align}\nx = 1\n% id: eq-unclosed\n', {
        printName: '(1)'
      })
    ).toBeNull();
  });

  it('matches EQ_ID_COMMENT_REGEX with flexible whitespace', () => {
    expect('%   id:   eq-abc12345'.match(EQ_ID_COMMENT_REGEX)?.[1]).toBe('eq-abc12345');
  });
});

describe('ActiveNoteEquationProvider without cache.sections', () => {
  it('parses CRLF, callout, and table equations accurately from live content', () => {
    const content = [
      '$$\r\nx = 1\r\n% id: eq-11111111\r\n$$',
      '',
      '> [!note]',
      '> $$',
      '> y = 2',
      '> % id: eq-22222222',
      '> $$',
      '',
      '| A | B |',
      '| - | - |',
      '| $$z = 3 % id: eq-33333333$$ | ok |'
    ].join('\r\n');

    const builtApp = MockAppBuilder.make().file('test.md', new FileBuilder().text(content)).done();
    const file = builtApp.vault.getFileByPath('test.md');
    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) return;

    const mockApp = {
      metadataCache: {
        getFileCache: () => null
      }
    } as unknown as App;

    const provider = new ActiveNoteEquationProvider(mockApp);
    const eqs = provider.getEquations(file, content);
    expect(eqs.length).toBe(3);
    expect(eqs.map(e => e.$blockId)).toEqual(['eq-11111111', 'eq-22222222', 'eq-33333333']);
    for (const eq of eqs) {
      const sliced = content.slice(eq.$pos.start.offset, eq.$pos.end.offset);
      expect(sliced.startsWith('$$')).toBe(true);
      expect(sliced.endsWith('$$')).toBe(true);
    }
  });
});

describe('NonActiveNoteIO.setRange', () => {
  it('preserves the character immediately after position.end.offset', async () => {
    let stored = 'before $$old$$ after';
    const mockPlugin = {
      app: {
        vault: {
          process: jest.fn(async (_file: TFile, fn: (data: string) => string) => {
            stored = fn(stored);
            return stored;
          })
        } as unknown as Vault
      }
    } as unknown as LatexReferencer;

    const dummyFile = new TFile();
    const io = new NonActiveNoteIO(mockPlugin, dummyFile);
    await io.setRange(
      {
        start: { line: 0, col: 7, offset: 7 },
        end: { line: 0, col: 14, offset: 14 }
      },
      '$$new$$',
      '$$old$$'
    );
    expect(stored).toBe('before $$new$$ after');
  });

  it('aborts safely when expectedOriginal does not match live file content (M4)', async () => {
    let stored = 'before $$changed$$ after';
    const mockPlugin = {
      app: {
        vault: {
          process: jest.fn(async (_file: TFile, fn: (data: string) => string) => {
            stored = fn(stored);
            return stored;
          })
        } as unknown as Vault
      }
    } as unknown as LatexReferencer;

    const dummyFile = new TFile();
    const io = new NonActiveNoteIO(mockPlugin, dummyFile);
    await io.setRange(
      {
        start: { line: 0, col: 7, offset: 7 },
        end: { line: 0, col: 14, offset: 14 }
      },
      '$$new$$',
      '$$old$$'
    );
    expect(stored).toBe('before $$changed$$ after');
  });
});

describe('Adversarial audit regression tests (C1, C3, H1-H7, M3, M5-M7)', () => {
  it('C1: insertBlockIdIfNotExist preserves callout > prefix when block.$pos starts at $$', async () => {
    const content = '> [!note]\n> $$\n> x = 1\n> $$';
    const builtApp = MockAppBuilder.make().file('note.md', new FileBuilder().text(content)).done();
    const file = builtApp.vault.getFileByPath('note.md');
    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) return;

    const cache = builtApp.metadataCache.getFileCache(file)!;
    cache.sections = [{ type: 'callout', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 3, col: 4, offset: content.length } } }];

    const provider = new ActiveNoteEquationProvider(builtApp);
    const eqs = provider.getEquations(file, content);
    expect(eqs.length).toBe(1);

    let currentDoc = content;
    const mockEditor = {
      getValue: () => currentDoc,
      getLine: (n: number) => currentDoc.split('\n')[n],
      getRange: (from: { line: number; ch: number }, to: { line: number; ch: number }) => {
        const lines = currentDoc.split('\n');
        const toOff = (p: { line: number; ch: number }) =>
          lines.slice(0, p.line).reduce((a, l) => a + l.length + 1, 0) + p.ch;
        return currentDoc.slice(toOff(from), toOff(to));
      },
      replaceRange: (text: string, from: { line: number; ch: number }, to: { line: number; ch: number }) => {
        const lines = currentDoc.split('\n');
        const toOff = (p: { line: number; ch: number }) =>
          lines.slice(0, p.line).reduce((a, l) => a + l.length + 1, 0) + p.ch;
        currentDoc = currentDoc.slice(0, toOff(from)) + text + currentDoc.slice(toOff(to));
      }
    } as unknown as Editor;

    const mockPlugin = {
      app: {
        ...builtApp,
        workspace: {
          getActiveViewOfType: () => ({
            file,
            editor: mockEditor,
            getMode: () => 'source'
          })
        }
      },
      manifest: { name: 'TeXcore' }
    } as unknown as LatexReferencer;

    const res = await insertBlockIdIfNotExist(mockPlugin, file, cache, eqs[0]);
    expect(res?.id).toMatch(/^eq-/);
    expect(currentDoc).toBe(`> [!note]\n> $$\n> x = 1\n> % id: ${res!.id}\n> $$`);
  });

  it('C3: stripTagsFromSegment does not inject stray backslash when no space precedes \\tag', () => {
    const inner = '\n\\begin{align}\na &= 1\\tag{6.1}\\\\\nb &= 2\\tag{6.2}\n\\end{align}\n% id: eq-sub12345\n';
    const updated = computeSafeTagUpdate(inner, { printName: '(7)' });
    expect(updated).toBe('\n\\begin{align}\na &= 1\\\\\nb &= 2 \\tag{7}\n\\end{align}\n% id: eq-sub12345\n');
  });

  it('H1: Mode 2 inserts tag BEFORE trailing \\\\ in align', () => {
    const inner = '\n\\begin{align}\na &= 1 \\\\\n\\end{align}\n% id: eq-trail123\n';
    const updated = computeSafeTagUpdate(inner, { printName: '(1)' });
    expect(updated).toBe('\n\\begin{align}\na &= 1 \\tag{1} \\\\\n\\end{align}\n% id: eq-trail123\n');
    expect(computeSafeTagUpdate(updated!, { printName: '(1)' })).toBeNull();
  });

  it('H2: Mode 2 places tag inside inner align rather than between \\end{align} and \\end{subequations}', () => {
    const inner = '\n\\begin{subequations}\n\\begin{align}\na &= 1\n\\end{align}\n\\end{subequations}\n% id: eq-subeq123\n';
    const updated = computeSafeTagUpdate(inner, { printName: '(2)' });
    expect(updated).toBe(
      '\n\\begin{subequations}\n\\begin{align}\na &= 1 \\tag{2}\n\\end{align}\n\\end{subequations}\n% id: eq-subeq123\n'
    );
  });

  it('H3: refuses to tag \\tag*{...}, skips \\begin{align} and \\notag lines', () => {
    expect(
      computeSafeTagUpdate('\nx = 1 \\tag*{custom}\n% id: eq-star1234\n', { printName: '(1)' })
    ).toBeNull();

    const subWithCommentFirst =
      '\n\\begin{align}\n% comment\n\\\\\na &= 1\n\\end{align}\n% id: eq-hdr12345\n';
    const updated = computeSafeTagUpdate(subWithCommentFirst, {
      printName: '(3)',
      subIndices: new Set([1])
    });
    expect(updated).toBe(
      '\n\\begin{align}\n% comment\n\\\\\na &= 1 \\tag{3.1}\n\\end{align}\n% id: eq-hdr12345\n'
    );
  });

  it('H4: relocates mid-expression \\tag{...} at braceDepth 0 to terminal position', () => {
    const inner = '\nr \\tag{6}_{12}^2 = 1\n% id: eq-mid12345\n';
    const updated = computeSafeTagUpdate(inner, { printName: '(8)' });
    expect(updated).toBe('\nr _{12}^2 = 1 \\tag{8}\n% id: eq-mid12345\n');
  });

  it('H6: skips YAML frontmatter, tilde fences, HTML comments, $$$, and allows LaTeX [[f]]', () => {
    const content = [
      '---',
      'math: "$$"',
      '---',
      '~~~',
      '$$ fake $$',
      '~~~',
      '<!-- $$ hidden $$ -->',
      '$$$',
      'a = 1',
      '$$$',
      '$$',
      '[[f]] = f^+ - f^-',
      '% id: eq-jump1234',
      '$$'
    ].join('\n');

    const blocks = findDisplayMathBlocks(content);
    expect(blocks.length).toBe(1);
    expect(content.slice(blocks[0].from, blocks[0].to)).toBe(
      '$$\n[[f]] = f^+ - f^-\n% id: eq-jump1234\n$$'
    );
  });

  it('H7: formatMathContent preserves % comments and standalone % id: lines', () => {
    const formatted = formatMathContent('\n% comment\nx = 1\n% id: eq-fmt12345\n');
    expect(formatted).toBe('% comment\nx = 1\n% id: eq-fmt12345');
  });

  it('M3: duplicate equation IDs do not collide or duplicate numbers', () => {
    const content = [
      '$$\na = 1\n% id: eq-dup12345\n$$',
      '$$\nb = 2\n% id: eq-dup12345\n$$',
      '$$\nc = 3\n% id: eq-uniq1234\n$$',
      'See [[#^eq-dup12345]] and [[#^eq-uniq1234]]'
    ].join('\n');

    const builtApp = MockAppBuilder.make().file('dup.md', new FileBuilder().text(content)).done();
    const file = builtApp.vault.getFileByPath('dup.md');
    expect(file).toBeInstanceOf(TFile);
    if (!(file instanceof TFile)) return;

    const mockPlugin = {
      app: builtApp,
      settings: { ...DEFAULT_SETTINGS, numberOnlyReferencedEquations: true }
    } as unknown as LatexReferencer;

    const eqs = processActiveNoteEquations(mockPlugin, file, content, '');
    expect(eqs.get('eq-dup12345')?.$printName).toBe('(1)');
    expect(eqs.get('eq-uniq1234')?.$printName).toBe('(2)');
  });

  it('M5 & M6: hasNonCommentTag ignores % comments and findTopLevelEndEnvMatch ignores \\\\end{align}', () => {
    expect(hasNonCommentTag('x = 1 % \\tag{1}')).toBe(false);
    expect(hasNonCommentTag('x = 1 \\tag{1}')).toBe(true);
    expect(findTopLevelEndEnvMatch('a = 1 \\\\end{align}')).toBeNull();
  });

  it('M7: checkAndFixCalloutMath handles CRLF accurately', () => {
    const crlf = '> [!note]\r\n> $$\r\nx = 1\r\n> $$';
    expect(checkAndFixCalloutMath(crlf)).toBe('> [!note]\r\n> $$\r\n> x = 1\r\n> $$');
  });
});
