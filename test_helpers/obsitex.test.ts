import { parseObsitexConfig } from '../src/utils/obsitex';
import { getEqNumberPrefix } from '../src/utils/format';
import { App, TFile } from 'obsidian';

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

  it('returns empty config if no obsitex block present', () => {
    const content = 'Just some text\n$$ x = 1 $$';
    const config = parseObsitexConfig(content);
    expect(config.eqPrefix).toBeUndefined();
  });

  it('getEqNumberPrefix uses obsitex eqPrefix over default settings', () => {
    const dummyApp = {} as App;
    const dummyFile = {} as TFile;
    const settings = { eqNumberPrefix: 'Default-' } as any;

    const content = '```obsitex\n- eq-prefix: S\n```';
    expect(getEqNumberPrefix(dummyApp, dummyFile, settings, content)).toBe('S');
    expect(getEqNumberPrefix(dummyApp, dummyFile, settings, 'no obsitex block')).toBe('Default-');
  });
});
