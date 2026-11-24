import { App, Editor, TFile } from 'obsidian';
import * as obsidianUtils from '../src/utils/obsidian';
import {
  computeCodeFence,
  createObsidianNoteResolver,
  expandStandaloneLinksInLines,
  expandWikiLinksToCodeBlocks,
  formatAsCodeBlock,
  getTargetLineRange,
  parseStandaloneWikiLink,
  type NoteResolver
} from '../src/features/link-codeblock';

describe('parseStandaloneWikiLink', () => {
  it('parses a plain standalone wiki-link', () => {
    expect(parseStandaloneWikiLink('[[page_a1]]')).toEqual({
      linkTarget: 'page_a1',
      leadingWhitespace: ''
    });
  });

  it('allows leading and trailing spaces and tabs', () => {
    expect(parseStandaloneWikiLink('  \t[[page_a1]] \t ')).toEqual({
      linkTarget: 'page_a1',
      leadingWhitespace: '  \t'
    });
  });

  it('preserves nested folder paths and strips aliases', () => {
    expect(parseStandaloneWikiLink('[[notes/sub/page_a1]]')).toEqual({
      linkTarget: 'notes/sub/page_a1',
      leadingWhitespace: ''
    });
    expect(parseStandaloneWikiLink('[[folder/page_a1|Custom Alias]]')).toEqual({
      linkTarget: 'folder/page_a1',
      leadingWhitespace: ''
    });
  });

  it('rejects embeds, heading/block links, inline text, bullets, multiple links, and empty targets', () => {
    expect(parseStandaloneWikiLink('![[page_a1]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[page_a1#Heading]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[page_a1#^block-id]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[#Heading]]')).toBeNull();
    expect(parseStandaloneWikiLink('See [[page_a1]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[page_a1]] extra')).toBeNull();
    expect(parseStandaloneWikiLink('- [[page_a1]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[page_a1]] [[page_a3]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[   ]]')).toBeNull();
    expect(parseStandaloneWikiLink('[[|Alias]]')).toBeNull();
    expect(parseStandaloneWikiLink('')).toBeNull();
  });
});

describe('computeCodeFence & formatAsCodeBlock', () => {
  it('uses 3 backticks when body has 0, 1, or 2 consecutive backticks', () => {
    expect(computeCodeFence('plain text')).toBe('```');
    expect(computeCodeFence('inline `code` and ``double``')).toBe('```');
  });

  it('uses one more backtick than the longest backtick run in content', () => {
    expect(computeCodeFence('```js\nconsole.log(1);\n```')).toBe('````');
    expect(computeCodeFence('````md\n```ts\n```\n````')).toBe('`````');
  });

  it('formats raw content with YAML frontmatter verbatim and strips only one trailing newline', () => {
    const raw = '---\ntitle: Test\n---\r\n\r\nHello world\r\n';
    expect(formatAsCodeBlock('page_a1', raw)).toBe(
      '```page_a1\n---\ntitle: Test\n---\n\nHello world\n```'
    );
  });

  it('handles empty file content cleanly', () => {
    expect(formatAsCodeBlock('empty_page', '')).toBe('```empty_page\n```');
  });
});

describe('getTargetLineRange', () => {
  it('uses the cursor line when nothing is selected', () => {
    const editor = {
      somethingSelected: () => false,
      getCursor: () => ({ line: 3, ch: 4 })
    } as unknown as Pick<Editor, 'somethingSelected' | 'getCursor'>;

    expect(getTargetLineRange(editor)).toEqual({ startLine: 3, endLine: 3 });
  });

  it('handles single-line and multi-line selections ending mid-line', () => {
    const single = {
      somethingSelected: () => true,
      getCursor: (which?: 'from' | 'to') =>
        which === 'from' ? { line: 2, ch: 0 } : { line: 2, ch: 10 }
    } as unknown as Pick<Editor, 'somethingSelected' | 'getCursor'>;

    expect(getTargetLineRange(single)).toEqual({ startLine: 2, endLine: 2 });

    const multi = {
      somethingSelected: () => true,
      getCursor: (which?: 'from' | 'to') =>
        which === 'from' ? { line: 1, ch: 2 } : { line: 4, ch: 5 }
    } as unknown as Pick<Editor, 'somethingSelected' | 'getCursor'>;

    expect(getTargetLineRange(multi)).toEqual({ startLine: 1, endLine: 4 });
  });

  it('excludes the trailing line when selection ends at ch === 0 on a subsequent line', () => {
    const editor = {
      somethingSelected: () => true,
      getCursor: (which?: 'from' | 'to') =>
        which === 'from' ? { line: 1, ch: 0 } : { line: 4, ch: 0 }
    } as unknown as Pick<Editor, 'somethingSelected' | 'getCursor'>;

    expect(getTargetLineRange(editor)).toEqual({ startLine: 1, endLine: 3 });
  });
});

describe('createObsidianNoteResolver', () => {
  it('resolves markdown files and rejects missing or non-markdown files', async () => {
    const mdFile = new TFile();
    mdFile.name = 'page_a1.md';

    const pngFile = new TFile();
    pngFile.name = 'diagram.png';

    const cachedRead = jest.fn().mockResolvedValue('raw md content');
    const getFirstLinkpathDest = jest.fn((target: string) => {
      if (target === 'page_a1') return mdFile;
      if (target === 'diagram.png') return pngFile;
      return null;
    });

    const app = {
      metadataCache: { getFirstLinkpathDest },
      vault: { cachedRead }
    } as unknown as App;

    const resolver = createObsidianNoteResolver(app);

    await expect(resolver.resolve('page_a1', 'source.md')).resolves.toEqual({
      basename: 'page_a1',
      content: 'raw md content'
    });
    await expect(resolver.resolve('diagram.png', 'source.md')).resolves.toBeNull();
    await expect(resolver.resolve('missing', 'source.md')).resolves.toBeNull();
    expect(cachedRead).toHaveBeenCalledTimes(1);
  });
});

describe('expandStandaloneLinksInLines & expandWikiLinksToCodeBlocks', () => {
  const createMockResolver = (
    notes: Record<string, { basename: string; content: string }>
  ): NoteResolver => ({
    async resolve(linkTarget: string) {
      return notes[linkTarget] ?? null;
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('expands matching standalone links and leaves non-matching and unresolved lines untouched', async () => {
    const resolver = createMockResolver({
      page_a1: { basename: 'page_a1', content: 'page a1 contents here\n' },
      'dir/page_a3': { basename: 'page_a3', content: '```ts\nconst x = 1;\n```' }
    });

    const inputLines = [
      '[[page_a1]]',
      '',
      'Inline [[page_a1]] text',
      '![[page_a1]]',
      '  [[dir/page_a3|Alias]]  ',
      '[[missing_page]]'
    ];

    const result = await expandStandaloneLinksInLines(inputLines, 'index.md', resolver);

    expect(result).toEqual({
      lines: [
        '```page_a1\npage a1 contents here\n```',
        '',
        'Inline [[page_a1]] text',
        '![[page_a1]]',
        '````page_a3\n```ts\nconst x = 1;\n```\n````',
        '[[missing_page]]'
      ],
      expandedCount: 2,
      matchedLinkCount: 3,
      unresolvedLinks: ['missing_page']
    });
  });

  it('applies a single atomic replaceRange edit and shows an appropriate notice', async () => {
    const noticeSpy = jest
      .spyOn(obsidianUtils, 'showNotice')
      .mockImplementation(() => ({}) as never);

    const lines = ['Intro', '[[page_a1]]', '[[page_a3]]', 'Outro'];
    const replaceRange = jest.fn();
    const editor = {
      somethingSelected: () => true,
      getCursor: (which?: 'from' | 'to') =>
        which === 'from' ? { line: 1, ch: 0 } : { line: 2, ch: 11 },
      getLine: (index: number) => lines[index],
      replaceRange
    } as unknown as Editor;

    const resolver = createMockResolver({
      page_a1: { basename: 'page_a1', content: 'A1' },
      page_a3: { basename: 'page_a3', content: 'A3' }
    });

    await expandWikiLinksToCodeBlocks({} as App, editor, null, resolver);

    expect(replaceRange).toHaveBeenCalledTimes(1);
    expect(replaceRange).toHaveBeenCalledWith(
      '```page_a1\nA1\n```\n```page_a3\nA3\n```',
      { line: 1, ch: 0 },
      { line: 2, ch: 11 }
    );
    expect(noticeSpy).toHaveBeenCalledWith('Expanded 2 wiki-link(s) to code block(s).');
  });

  it('does not edit editor when no standalone wiki-links are found', async () => {
    const noticeSpy = jest
      .spyOn(obsidianUtils, 'showNotice')
      .mockImplementation(() => ({}) as never);

    const replaceRange = jest.fn();
    const editor = {
      somethingSelected: () => false,
      getCursor: () => ({ line: 0, ch: 3 }),
      getLine: () => 'Just text with [[page_a1]] inline',
      replaceRange
    } as unknown as Editor;

    await expandWikiLinksToCodeBlocks({} as App, editor, null, createMockResolver({}));

    expect(replaceRange).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith('No standalone wiki-links found.');
  });

  it('does not edit editor and reports unresolved links when all matched links fail to resolve', async () => {
    const noticeSpy = jest
      .spyOn(obsidianUtils, 'showNotice')
      .mockImplementation(() => ({}) as never);

    const replaceRange = jest.fn();
    const editor = {
      somethingSelected: () => false,
      getCursor: () => ({ line: 0, ch: 0 }),
      getLine: () => '[[nonexistent]]',
      replaceRange
    } as unknown as Editor;

    await expandWikiLinksToCodeBlocks({} as App, editor, null, createMockResolver({}));

    expect(replaceRange).not.toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith('Could not resolve: nonexistent.');
  });
});
