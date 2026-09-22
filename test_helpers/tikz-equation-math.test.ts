/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import { CustomHTMLMachine } from '../src/features/tikz/tikzjax/loader';
import { Writable } from 'stream';

describe('CustomHTMLMachine math equation rendering', () => {
  it('correctly preserves vertical orientation of text and rules inside SVG text blocks', () => {
    let html = '';
    const page = new Writable({
      write(chunk, _, cb) {
        html += String(chunk);
        cb();
      }
    });

    const machine = new CustomHTMLMachine(page);
    (machine as any).pointsPerDviUnit = 1;
    (machine as any).svgDepth = 1;
    (machine as any).font = {
      name: 'cmr10',
      designSize: 655360,
      scaleFactor: 655360,
      metrics: {
        designSize: 655360,
        characters: {
          49: { width: 5, height: 7, depth: 0 }, // '1'
          50: { width: 5, height: 7, depth: 0 }, // '2'
          43: { width: 5, height: 5, depth: 0 } // '+'
        }
      }
    };

    // Simulate TeX placing a text block at origin (h=100, v=100)
    (machine as any).position = { h: 100, v: 100 };
    machine.putSVG('<g transform="translate({?x},{?y})">');

    // Numerator '1' is higher up in DVI (smaller v, e.g. v=96)
    (machine as any).position = { h: 105, v: 96 };
    machine.putText([49]);

    // Fraction bar rule is between them (v=98, height=1)
    (machine as any).position = { h: 105, v: 98 };
    machine.putRule({ a: 1, b: 5 });

    // Denominator '2' is lower down in DVI (larger v, e.g. v=103)
    (machine as any).position = { h: 105, v: 103 };
    machine.putText([50]);

    machine.putSVG('</g>');

    // In SVG coordinates (with textBlockOriginV=100):
    // Numerator '1' at v=96 should have y = 96 - 100 = -4 (above baseline)
    // Denominator '2' at v=103 should have y = 103 - 100 = +3 (below baseline)
    // Fraction bar at v=98 should have y = 98 - 1 - 100 = -3
    expect(html).toContain('y="-4"');
    expect(html).toContain('1</text>');
    expect(html).toContain('y="3"');
    expect(html).toContain('2</text>');
    expect(html).toContain('<rect x="5" y="-3" width="5" height="1"');
  });
});
