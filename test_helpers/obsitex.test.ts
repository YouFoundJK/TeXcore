import { parseObsitexConfig, getObsitexConfigAtPosition } from '../src/utils/obsitex';
import { getEqNumberPrefix } from '../src/utils/format';
import { processActiveNoteEquations, clearEquationCache } from '../src/core/equations/numbering';
import { LatexLinkProvider } from '../src/core/linker/latex-provider';
import { findTopLevelEndEnvMatch, splitMathIntoTopLevelRows } from '../src/utils/parse';
import { MockAppBuilder } from './AppBuilder';
import { FileBuilder } from './FileBuilder';
import { App, TFile } from 'obsidian';
import LatexReferencer from '../src/main';
import type { PluginSettings } from '../src/settings/settings';

describe('obsitex config tests', () => {
  it('parses eq-prefix with dash syntax', () => {
    const content = `
# Title

\`\`\`obsitex
- eq-prefix: S
\`\`\`

$$
E = mc^2
$$
`;
    const config = parseObsitexConfig(content);
    expect(config.eqPrefix).toBe('S');
  });

  it('parses eq-prefix with standard key-value syntax', () => {
    const content = `
\`\`\`obsitex
eq-prefix: S3.2
\`\`\`
`;
    const config = parseObsitexConfig(content);
    expect(config.eqPrefix).toBe('S3.2');
  });

  it('parses eq-continuity true and false', () => {
    const contentFalse = `
\`\`\`obsitex
- eq-prefix: A
- eq-continuity: false
\`\`\`
`;
    const configFalse = parseObsitexConfig(contentFalse);
    expect(configFalse.eqPrefix).toBe('A');
    expect(configFalse.eqContinuity).toBe(false);

    const contentTrue = `
\`\`\`obsitex
eq-prefix: B
eq-continuity: true
\`\`\`
`;
    const configTrue = parseObsitexConfig(contentTrue);
    expect(configTrue.eqPrefix).toBe('B');
    expect(configTrue.eqContinuity).toBe(true);
  });

  it('returns empty config if no obsitex block present', () => {
    const content = 'Just some text\n$$ x = 1 $$';
    const config = parseObsitexConfig(content);
    expect(config.eqPrefix).toBeUndefined();
    expect(config.eqContinuity).toBeUndefined();
  });

  it('strips inline comments starting with # in eq-prefix and eq-continuity', () => {
    const content = `
\`\`\`obsitex
eq-prefix: A          # Prefix added to equation numbers (e.g., 'A' for (A1), (A2))
eq-continuity: false  # 'false' resets numbering to 1; 'true' continues counting
\`\`\`
`;
    const config = parseObsitexConfig(content);
    expect(config.eqPrefix).toBe('A');
    expect(config.eqContinuity).toBe(false);
  });

  it('resolves config positionally with getObsitexConfigAtPosition', () => {
    const content = `
$$
y = mx + c
$$

\`\`\`obsitex
- eq-prefix: A
- eq-continuity: false
\`\`\`

$$
z = x + 1
$$
`;

    const obsitexIndex = content.indexOf('```obsitex');
    const beforeBlockConfig = getObsitexConfigAtPosition(content, obsitexIndex - 1);
    expect(beforeBlockConfig.eqPrefix).toBeUndefined();

    const afterBlockConfig = getObsitexConfigAtPosition(content, obsitexIndex + 100);
    expect(afterBlockConfig.eqPrefix).toBe('A');
    expect(afterBlockConfig.eqContinuity).toBe(false);
  });

  it('getEqNumberPrefix uses obsitex eqPrefix positionally over default settings', () => {
    const dummyApp = {} as App;
    const dummyFile = new TFile();
    const settings: Required<PluginSettings> = {
      numberOnlyReferencedEquations: false,
      eqNumberPrefix: 'Default-',
      eqNumberSuffix: '',
      eqNumberInit: 1,
      eqNumberStyle: 'arabic',
      eqRefPrefix: '',
      eqRefSuffix: '',
      defaultCalloutType: 'note',
      showNoteTitleInLink: true
    };

    const content = 'Eq before\n```obsitex\n- eq-prefix: S\n```\nEq after';
    const obsitexPos = content.indexOf('```obsitex');

    expect(getEqNumberPrefix(dummyApp, dummyFile, settings, content, obsitexPos - 1)).toBe(
      'Default-'
    );
    expect(getEqNumberPrefix(dummyApp, dummyFile, settings, content, obsitexPos + 20)).toBe('S');
  });

  it('processActiveNoteEquations applies position-scoped prefix and continuity reset', () => {
    const content = `$$
\\eta_j = \\Gamma_1 M_j
% id: eq-6l1k6gc0
$$

From Eq. [[#^eq-6l1k6gc0]] and Eq. [[#^eq-A-7w0xzwm6]]

## Appendix
\`\`\`obsitex
- eq-prefix: A
- eq-continuity: false
\`\`\`

$$
a_j^0 = ax
% id: eq-A-7w0xzwm6
$$
`;

    const mockApp = MockAppBuilder.make()
      .file('doc.md', new FileBuilder().text(content))
      .done();

    const file = mockApp.vault.getFileByPath('doc.md')!;
    const cache = mockApp.metadataCache.getFileCache(file)!;

    const eq1Start = content.indexOf('$$');
    const eq1End = content.indexOf('$$', eq1Start + 2) + 2;
    const eq2Start = content.indexOf('$$', eq1End);
    const eq2End = content.indexOf('$$', eq2Start + 2) + 2;

    cache.sections = [
      {
        type: 'math',
        position: {
          start: { line: 0, col: 0, offset: eq1Start },
          end: { line: 3, col: 2, offset: eq1End }
        }
      },
      {
        type: 'math',
        position: {
          start: { line: 13, col: 0, offset: eq2Start },
          end: { line: 16, col: 2, offset: eq2End }
        }
      }
    ];

    const testSettings: Required<PluginSettings> = {
      numberOnlyReferencedEquations: false,
      eqNumberPrefix: '',
      eqNumberSuffix: '',
      eqNumberInit: 1,
      eqNumberStyle: 'arabic',
      eqRefPrefix: '',
      eqRefSuffix: '',
      defaultCalloutType: 'note',
      showNoteTitleInLink: true
    };

    const mockPlugin = {
      app: mockApp,
      settings: testSettings
    } as unknown as LatexReferencer;

    const equations = processActiveNoteEquations(mockPlugin, file, content);

    const eq1 = equations.get('eq-6l1k6gc0');
    expect(eq1?.$printName).toBe('(1)');

    const eq2 = equations.get('eq-A-7w0xzwm6');
    expect(eq2?.$printName).toBe('(A1)');
  });

  it('processActiveNoteEquations parses \\label{eq-id} equations as valid IDs', () => {
    const content = `$$
E = mc^2
\\label{eq-einstein}
$$`;

    const mockApp = MockAppBuilder.make()
      .file('label_doc.md', new FileBuilder().text(content))
      .done();

    const file = mockApp.vault.getFileByPath('label_doc.md')!;
    const cache = mockApp.metadataCache.getFileCache(file)!;

    cache.sections = [
      {
        type: 'math',
        position: {
          start: { line: 0, col: 0, offset: 0 },
          end: { line: 3, col: 2, offset: content.length }
        }
      }
    ];

    const dummyPlugin = {
      app: mockApp,
      settings: { eqNumberPrefix: '', eqContinuity: true, eqNumberStyle: 'arabic', eqNumberInit: 1 }
    } as unknown as LatexReferencer;

    const eqMap = processActiveNoteEquations(dummyPlugin, file, content);
    expect(eqMap.get('eq-einstein')?.$blockId).toBe('eq-einstein');
  });

  it('processActiveNoteEquations maintains continuity when eq-continuity is omitted or true', () => {
    const content = `$$
\\eta_j = \\Gamma_1 M_j
% id: eq-111
$$

## Appendix
\`\`\`obsitex
- eq-prefix: A
\`\`\`

$$
a_j^0 = ax
% id: eq-222
$$
`;

    const mockApp = MockAppBuilder.make()
      .file('doc.md', new FileBuilder().text(content))
      .done();

    const file = mockApp.vault.getFileByPath('doc.md')!;
    const cache = mockApp.metadataCache.getFileCache(file)!;

    const eq1Start = content.indexOf('$$');
    const eq1End = content.indexOf('$$', eq1Start + 2) + 2;
    const eq2Start = content.indexOf('$$', eq1End);
    const eq2End = content.indexOf('$$', eq2Start + 2) + 2;

    cache.sections = [
      {
        type: 'math',
        position: {
          start: { line: 0, col: 0, offset: eq1Start },
          end: { line: 3, col: 2, offset: eq1End }
        }
      },
      {
        type: 'math',
        position: {
          start: { line: 9, col: 0, offset: eq2Start },
          end: { line: 12, col: 2, offset: eq2End }
        }
      }
    ];

    const testSettings2: Required<PluginSettings> = {
      numberOnlyReferencedEquations: false,
      eqNumberPrefix: '',
      eqNumberSuffix: '',
      eqNumberInit: 1,
      eqNumberStyle: 'arabic',
      eqRefPrefix: '',
      eqRefSuffix: '',
      defaultCalloutType: 'note',
      showNoteTitleInLink: true
    };

    const mockPlugin = {
      app: mockApp,
      settings: testSettings2
    } as unknown as LatexReferencer;

    const equations = processActiveNoteEquations(mockPlugin, file, content);

    const eq1 = equations.get('eq-111');
    expect(eq1?.$printName).toBe('(1)');

    const eq2 = equations.get('eq-222');
    expect(eq2?.$printName).toBe('(A2)');

    // Verify metadata cache blocks injection
    expect(cache.blocks).toBeDefined();
    expect(cache.blocks!['eq-111']).toEqual({
      id: 'eq-111',
      position: {
        start: { line: 0, col: 0, offset: eq1Start },
        end: { line: 3, col: 2, offset: eq1End }
      }
    });
    expect(cache.blocks!['eq-222']).toEqual({
      id: 'eq-222',
      position: {
        start: { line: 9, col: 0, offset: eq2Start },
        end: { line: 12, col: 2, offset: eq2End }
      }
    });
  });

  it('parses supplements in YAML list format without explicit alias (exact user case)', () => {
    const content = `\`\`\`obsitex
eq-prefix: C
eq-continuity: false
supplements:
 - [[Blum-1978-Solution-Of-The-Mean-Spherical-Approximation-For-Hard-Ions-And-Dipoles-Of-Arbitrary-Size]]
\`\`\``;
    const config = parseObsitexConfig(content);
    expect(config.eqPrefix).toBe('C');
    expect(config.eqContinuity).toBe(false);
    expect(config.supplements).toBeDefined();
    expect(
      config.supplements![
        'Blum-1978-Solution-Of-The-Mean-Spherical-Approximation-For-Hard-Ions-And-Dipoles-Of-Arbitrary-Size'
      ]
    ).toBe('');
  });

  it('parses supplements in YAML list format with explicit alias', () => {
    const content = `\`\`\`obsitex
supplements:
 - [[SuppNote]]: S1
\`\`\``;
    const config = parseObsitexConfig(content);
    expect(config.supplements).toBeDefined();
    expect(config.supplements!['SuppNote']).toBe('S1');
  });

  it('LatexLinkProvider resolves cross-note equation links for un-aliased supplements', () => {
    const mainContent = `\`\`\`obsitex
eq-prefix: A
supplements:
 - [[Blum-1978-Solution]]
\`\`\`

Cross ref to [[Blum-1978-Solution#^eq-hard-ions]]
`;

    const suppContent = `\`\`\`obsitex
eq-prefix: C
eq-continuity: false
\`\`\`

$$
E = mc^2
% id: eq-hard-ions
$$
`;

    const mockApp = MockAppBuilder.make()
      .file('Main.md', new FileBuilder().text(mainContent))
      .file('Blum-1978-Solution.md', new FileBuilder().text(suppContent))
      .done();

    const mainFile = mockApp.vault.getFileByPath('Main.md')!;
    const suppFile = mockApp.vault.getFileByPath('Blum-1978-Solution.md')!;

    const suppCache = mockApp.metadataCache.getFileCache(suppFile)!;
    const eqStart = suppContent.indexOf('$$');
    const eqEnd = suppContent.indexOf('$$', eqStart + 2) + 2;
    suppCache.sections = [
      {
        type: 'math',
        position: {
          start: { line: 5, col: 0, offset: eqStart },
          end: { line: 8, col: 2, offset: eqEnd }
        }
      }
    ];

    mockApp.workspace.getActiveViewOfType = (() => ({
      file: mainFile,
      getViewData: () => mainContent
    })) as unknown as typeof mockApp.workspace.getActiveViewOfType;

    const testSettings: Required<PluginSettings> = {
      numberOnlyReferencedEquations: false,
      eqNumberPrefix: '',
      eqNumberSuffix: '',
      eqNumberInit: 1,
      eqNumberStyle: 'arabic',
      eqRefPrefix: '',
      eqRefSuffix: '',
      defaultCalloutType: 'note',
      showNoteTitleInLink: false
    };

    const mockPlugin = {
      app: mockApp,
      settings: testSettings
    } as unknown as LatexReferencer;

    const provider = new LatexLinkProvider(mockPlugin);
    const linkText = provider.provide(
      { path: 'Blum-1978-Solution', subpath: '#^eq-hard-ions' },
      suppFile,
      null
    );

    expect(linkText).toBe('(C1)');
  });

  it('LatexLinkProvider resolves cross-note equation links with alias for supplemented notes', () => {
    const mainContent = `\`\`\`obsitex
supplements:
 - [[Blum-1978-Solution]]: S1
\`\`\`

Cross ref to [[Blum-1978-Solution#^eq-hard-ions]]
`;

    const suppContent = `\`\`\`obsitex
eq-prefix: C
\`\`\`

$$
E = mc^2
% id: eq-hard-ions
$$
`;

    const mockApp = MockAppBuilder.make()
      .file('Main.md', new FileBuilder().text(mainContent))
      .file('Blum-1978-Solution.md', new FileBuilder().text(suppContent))
      .done();

    const mainFile = mockApp.vault.getFileByPath('Main.md')!;
    const suppFile = mockApp.vault.getFileByPath('Blum-1978-Solution.md')!;

    const suppCache = mockApp.metadataCache.getFileCache(suppFile)!;
    const eqStart = suppContent.indexOf('$$');
    const eqEnd = suppContent.indexOf('$$', eqStart + 2) + 2;
    suppCache.sections = [
      {
        type: 'math',
        position: {
          start: { line: 5, col: 0, offset: eqStart },
          end: { line: 8, col: 2, offset: eqEnd }
        }
      }
    ];

    mockApp.workspace.getActiveViewOfType = (() => ({
      file: mainFile,
      getViewData: () => mainContent
    })) as unknown as typeof mockApp.workspace.getActiveViewOfType;

    const testSettings: Required<PluginSettings> = {
      numberOnlyReferencedEquations: false,
      eqNumberPrefix: '',
      eqNumberSuffix: '',
      eqNumberInit: 1,
      eqNumberStyle: 'arabic',
      eqRefPrefix: '',
      eqRefSuffix: '',
      defaultCalloutType: 'note',
      showNoteTitleInLink: false
    };

    const mockPlugin = {
      app: mockApp,
      settings: testSettings
    } as unknown as LatexReferencer;

    const provider = new LatexLinkProvider(mockPlugin);
    const linkText = provider.provide(
      { path: 'Blum-1978-Solution', subpath: '#^eq-hard-ions' },
      suppFile,
      null
    );

    expect(linkText).toBe('(S1-C1)');
  });

  describe('multi-line and surgical tag insertion tests', () => {
    it('finds endEnv in multi-line align blocks for tag insertion', () => {
      const mathText = `\\begin{align}\na &= b + c \\\\\nd &= e + f\n\\end{align}`;
      const endMatch = findTopLevelEndEnvMatch(mathText);
      expect(endMatch).not.toBeNull();
      expect(endMatch?.matchText).toBe('\\end{align}');

      const rows = splitMathIntoTopLevelRows(mathText);
      expect(rows.length).toBe(3); // row 1, '\\', row 2
    });

    it('handles sub-equation row splitting and tag formatting', () => {
      const mathText = `\\begin{align}\nx &= 1 \\\\\ny &= 2\n\\end{align}`;
      const parts = splitMathIntoTopLevelRows(mathText);
      const baseName = '1';
      const newParts = [...parts];

      for (let i = 0; i < parts.length; i += 2) {
        const row = parts[i];
        const subIndex = i / 2 + 1;
        const expectedTag = `\\tag{${baseName}.${subIndex}}`;
        const endEnvMatch = findTopLevelEndEnvMatch(row);
        if (endEnvMatch && endEnvMatch.index !== undefined) {
          const before = row.substring(0, endEnvMatch.index).trimEnd();
          const environment = endEnvMatch.matchText;
          const after = row.substring(endEnvMatch.index + environment.length);
          newParts[i] = `${before} ${expectedTag} ${environment}${after}`;
        } else {
          newParts[i] = `${row.trimEnd()} ${expectedTag}`;
        }
      }

      const result = newParts.join('');
      expect(result).toContain('\\tag{1.1}');
      expect(result).toContain('\\tag{1.2}');
      expect(result).toContain('\\end{align}');
    });

    it('returns null for findTopLevelEndEnvMatch when environment is unclosed', () => {
      const incompleteMath = `\\begin{align}\na &= b \\\\\nc &= d`;
      const endMatch = findTopLevelEndEnvMatch(incompleteMath);
      expect(endMatch).toBeNull();
    });

    it('correctly matches top-level align endEnv even when inner bmatrix exists', () => {
      const mathWithMatrix = `\\begin{align}\nA &= \\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}\n\\end{align}`;
      const endMatch = findTopLevelEndEnvMatch(mathWithMatrix);
      expect(endMatch).not.toBeNull();
      expect(endMatch?.matchText).toBe('\\end{align}');
    });

    it('returns null printName for unreferenced equations when numberOnlyReferencedEquations is true', () => {
      const content = `$$
E = mc^2
% id: eq-unreferenced
$$

$$
a^2 + b^2 = c^2
% id: eq-referenced
$$

Link to [[#^eq-referenced]]
`;
      const mockApp = MockAppBuilder.make()
        .file('test.md', new FileBuilder().text(content))
        .done();

      const file = mockApp.vault.getFileByPath('test.md')!;
      const settings: Required<PluginSettings> = {
        numberOnlyReferencedEquations: true,
        eqNumberPrefix: '',
        eqNumberSuffix: '',
        eqNumberInit: 1,
        eqNumberStyle: 'arabic',
        eqRefPrefix: '',
        eqRefSuffix: '',
        defaultCalloutType: 'note',
        showNoteTitleInLink: true
      };

      const mockPlugin = {
        app: mockApp,
        settings
      } as unknown as LatexReferencer;

      const equations = processActiveNoteEquations(mockPlugin, file, content);
      expect(equations.get('eq-unreferenced')?.$printName).toBeNull();
      expect(equations.get('eq-referenced')?.$printName).toBe('(1)');
    });

    it('STRICT: maintains top-to-bottom equation order even with callouts and updates tag numbers when a top equation is referenced', () => {
      const initialContent = `> [!note] Top Equation
> $$
> E = mc^2
> % id: eq-top
> $$

$$
a^2 + b^2 = c^2
% id: eq-middle
$$

Link to [[#^eq-middle]]
`;

      const mockApp = MockAppBuilder.make()
        .file('doc.md', new FileBuilder().text(initialContent))
        .done();

      const file = mockApp.vault.getFileByPath('doc.md')!;
      const cache = mockApp.metadataCache.getFileCache(file)!;

      const topStart = initialContent.indexOf('$$');
      const topEnd = initialContent.indexOf('$$', topStart + 2) + 2;
      const midStart = initialContent.indexOf('$$', topEnd);
      const midEnd = initialContent.indexOf('$$', midStart + 2) + 2;

      // Simulate Obsidian metadata cache sections where callout section appears
      cache.sections = [
        {
          type: 'callout',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 5, col: 2, offset: topEnd }
          }
        },
        {
          type: 'math',
          position: {
            start: { line: 7, col: 0, offset: midStart },
            end: { line: 10, col: 2, offset: midEnd }
          }
        }
      ];

      const settings: Required<PluginSettings> = {
        numberOnlyReferencedEquations: true,
        eqNumberPrefix: 'C',
        eqNumberSuffix: '',
        eqNumberInit: 1,
        eqNumberStyle: 'arabic',
        eqRefPrefix: '',
        eqRefSuffix: '',
        defaultCalloutType: 'note',
        showNoteTitleInLink: true
      };

      const mockPlugin = {
        app: mockApp,
        settings
      } as unknown as LatexReferencer;

      // Initial check: only eq-middle is referenced -> receives (C1)
      let equations = processActiveNoteEquations(mockPlugin, file, initialContent);
      expect(equations.get('eq-top')?.$printName).toBeNull();
      expect(equations.get('eq-middle')?.$printName).toBe('(C1)');

      // Now user adds a reference to eq-top at the top of the note!
      const updatedContent = `Ref to [[#^eq-top]]

> [!note] Top Equation
> $$
> E = mc^2
> % id: eq-top
> $$

$$
a^2 + b^2 = c^2
% id: eq-middle
$$

Link to [[#^eq-middle]]
`;

      clearEquationCache(file.path);
      delete (cache as { sections?: unknown }).sections;
      equations = processActiveNoteEquations(mockPlugin, file, updatedContent);

      // eq-top is at line 3 -> must receive (C1)
      // eq-middle is at line 10 -> must receive (C2)
      expect(equations.get('eq-top')?.$printName).toBe('(C1)');
      expect(equations.get('eq-middle')?.$printName).toBe('(C2)');
    });
  });
});

