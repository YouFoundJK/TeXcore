import { parseObsitexConfig, getObsitexConfigAtPosition } from '../src/utils/obsitex';
import { getEqNumberPrefix } from '../src/utils/format';
import { processActiveNoteEquations } from '../src/core/equations/numbering';
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
});
