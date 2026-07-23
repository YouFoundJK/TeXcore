import { TikzCodec } from '../src/features/tikz-editor/utils/tikz-codec';
import { type EditorElementStyle } from '../src/features/tikz-editor/types';

describe('TikzCodec robust parsing tests', () => {
  const defaultStyle: EditorElementStyle = {
    bold: false,
    italic: false,
    math: false,
    color: '#f8e7ad',
    fontSize: 12,
    thickness: 1.0
  };

  const codec = new TikzCodec(
    x => 120 + x * 80,
    y => 360 - y * 80,
    x => (x - 120) / 80,
    y => -(y - 360) / 80,
    () => 'test_id',
    defaultStyle
  );

  it('parses complex multi-line TikZ snippet with loops, plots, colors, and named coordinates', () => {
    const source = `
\\begin{tikzpicture}[scale=1.1]
% Axes
\\draw[thick] (-2.5,0) -- (7.2,0);
\\draw[thick,-{Triangle[length=10pt,width=10pt]}]
      (6, -2.9) -- (6,5);

% ticks
\\foreach \\y in {-2,-1,1,2,3,4}
  \\draw[thick] (5.86,\\y) -- (6.14,\\y);

\\foreach \\x in {-2,1}
  \\draw[thick] (\\x,-0.12) -- (\\x,0.12);

% Blue curve
\\draw[
  line width=7pt,
  color=blue!70!black
]
plot[smooth]
coordinates{
(-0.9,2.9)
(0.2,2.0)
(1.5,1.1)
(3.2,0.35)
(5.3,0.02)
(6.0,0.00)
(7.3,0.12)
};

% Dotted tangent line
\\draw[
  dotted,
  line width=2pt,
  color=purple!70!red
]
(-3.2,4.8) -- (7.2,-3.1);

\\node[
  color=purple!70!red,
  scale=1.6
]
at (4.75,-0.45)
{$\\mathrm{slope}=p$};

% Tangency point
\\coordinate (A) at (-1.0,2.25);

\\fill[green!70!cyan] (A) circle (0.12);

% Left vertical decomposition
\\draw[
  line width=7pt,
  color=cyan!90!blue
]
(-1,-2.25) -- (-1,0);

\\draw[
  line width=7pt,
  color=green!80!cyan
]
(-1,0) -- (A);

\\fill[green!70!cyan] (-1,0) circle (0.13);

\\node[color=green!60!black,scale=2.2]
at (-1.45,1.15) {$f$};

\\node[color=cyan!80!blue,scale=2.2]
at (-0.58,-1.2) {$g$};

% Right vertical segment
\\draw[
  line width=7pt,
  color=cyan!90!blue
]
(6,-2.25) -- (6,0);

\\node[color=cyan!80!blue,scale=2.2]
at (6.45,-1.05) {$g$};

%--------------------------------------------------
% Bottom dotted distance x
%--------------------------------------------------
\\draw[dotted,line width=2pt]
(-1,-2.25) -- (6,-2.25);

\\node[scale=2.4]
at (2.15,-1.8)
{$x$};
\\end{tikzpicture}
`;

    const result = codec.parse(source);
    expect(result.elements.length).toBeGreaterThan(15);

    // Verify text nodes were parsed
    const textNodes = result.elements.filter(e => e.type === 'text');
    expect(textNodes.map(t => t.label)).toContain('f');
    expect(textNodes.map(t => t.label)).toContain('g');
    expect(textNodes.map(t => t.label)).toContain('x');
    expect(textNodes.map(t => t.label)).toContain('\\mathrm{slope}=p');

    // Verify curve plot segments were parsed
    const blueSegments = result.elements.filter(
      e => e.type === 'wire' && e.style.rawColor === 'blue!70!black'
    );
    expect(blueSegments.length).toBe(6);

    // Verify named coordinate A was resolved for circle fill
    const circleA = result.elements.find(
      e => e.type === 'component' && e.style.rawColor === 'green!70!cyan'
    );
    expect(circleA).toBeDefined();

    // Verify dotted lines
    const dottedLine = result.elements.find(
      e => e.type === 'wire' && e.style.rawColor === 'purple!70!red'
    );
    expect(dottedLine?.style.lineStyle).toBe('dotted');

    // Test roundtrip: generate TikZ source and re-parse it
    const generated = codec.generate(result.elements, result.pictureOptions);
    expect(generated).toContain('color=blue!70!black');

    const roundtrip = codec.parse(generated);
    expect(roundtrip.elements.length).toBe(result.elements.length);

    const roundtripBlueSegments = roundtrip.elements.filter(
      e => e.type === 'wire' && e.style.rawColor === 'blue!70!black'
    );
    expect(roundtripBlueSegments.length).toBe(6);

    // Verify hex color without rawColor produces braced rgb,255 output
    const customElements = [result.elements[0]];
    customElements[0].style.rawColor = undefined;
    Object.assign(customElements[0].style, { color: '#3b82f6' });
    const customGen = codec.generate(customElements, '');
    expect(customGen).toContain('color={rgb,255:red,59;green,130;blue,246}');
  });
});
