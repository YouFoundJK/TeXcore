import { TikzCodec } from '../src/features/tikz-editor/utils/tikz-codec';
import { type EditorElement, type EditorElementStyle } from '../src/features/tikz-editor/types';
import { AssetsManager } from '../src/features/tikz-editor/assets-manager';

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

    // Verify text nodes were parsed with $...$ math enclosing preserved
    const textNodes = result.elements.filter(e => e.type === 'text');
    expect(textNodes.map(t => t.label)).toContain('$f$');
    expect(textNodes.map(t => t.label)).toContain('$g$');
    expect(textNodes.map(t => t.label)).toContain('$x$');
    expect(textNodes.map(t => t.label)).toContain('$\\mathrm{slope}=p$');

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

  it('groups solid and dashed wire into unified Wire component', () => {
    const core = AssetsManager.getCoreComponents();
    expect(core.some(c => c.name === 'Wire')).toBe(true);
    expect(core.some(c => c.name === 'Dashed Wire')).toBe(false);
  });

  it('parses and generates crossed wire with decorations.pathmorphing and crosses decoration', () => {
    const crossedSource = `
\\usetikzlibrary{decorations.pathmorphing}
\\begin{tikzpicture}
\\draw[decorate, decoration={crosses, segment length=6pt}, thick] (0, 0) -- (5, 0);
\\end{tikzpicture}
`;
    const parsed = codec.parse(crossedSource);
    expect(parsed.elements.length).toBe(1);
    const wire = parsed.elements[0];
    expect(wire.type).toBe('wire');
    expect(wire.style.lineStyle).toBe('crossed');

    const generated = codec.generate(parsed.elements, '');
    expect(generated).toContain('\\usetikzlibrary{decorations.pathmorphing');
    expect(generated).toContain('decorate, decoration={crosses, segment length=6pt}, thick');
  });

  it('generates crossed wire with color and custom thickness correctly', () => {
    const crossedElement: EditorElement = {
      id: 'test_cross',
      type: 'wire',
      name: 'Wire',
      x: 120,
      y: 360,
      x2: 440,
      y2: 360,
      label: '',
      rotation: 0,
      style: {
        bold: false,
        italic: false,
        math: false,
        color: '#ef4444',
        fontSize: 12,
        thickness: 2.5,
        lineStyle: 'crossed'
      },
      svgMarkup: '',
      tikzCommand: '\\draw[line width=0.8pt] ({x}, {y}) -- ({x2}, {y2});'
    };

    const generated = codec.generate([crossedElement], '');
    expect(generated).toContain('\\usetikzlibrary{decorations.pathmorphing');
    expect(generated).toContain('color={rgb,255:red,239;green,68;blue,68}');
    expect(generated).toContain('decorate, decoration={crosses, segment length=6pt}');
    expect(generated).toContain('line width=2.5pt');
    // Ensure old line width=0.8pt was cleaned up
    expect(generated).not.toContain('line width=0.8pt');
  });

  it('generates Right bracket with decoration and node label correctly', () => {
    const bracketElement: EditorElement = {
      id: 'bracket_1',
      type: 'wire',
      name: 'Right bracket',
      x: 160,
      y: 80,
      x2: 160,
      y2: 240,
      label: '$N = 2$',
      rotation: 0,
      style: {
        bold: false,
        italic: false,
        math: true,
        color: '#000000',
        fontSize: 12,
        thickness: 1,
        lineStyle: 'solid',
        bracketDirection: 'right',
        bracketAmplitude: 17
      },
      svgMarkup: '',
      tikzCommand: '\\draw[decorate, decoration={brace, amplitude=6pt}] ({x}, {y}) -- ({x2}, {y2});'
    };

    const generated = codec.generate([bracketElement], '');
    expect(generated).toContain('\\usetikzlibrary{decorations.pathreplacing');
    expect(generated).toContain('decorate, decoration={brace, amplitude=6pt}');
    expect(generated).toContain('node[midway, right=8pt, font=\\normalsize]');
    expect(generated).toContain('{$N = 2$}');
  });

  it('parses TikZ brace command into Right bracket element', () => {
    const tikzCode = `
\\begin{tikzpicture}
\\draw [decorate, decoration={brace, amplitude=8pt}] (1, 2) -- (1, -1) node[midway, right=10pt] {Rows 1-2};
\\end{tikzpicture}
`;
    const result = codec.parse(tikzCode);
    const elements = result.elements;
    const bracket = elements.find(
      el => el.name === 'Right bracket' || el.style.bracketDirection === 'right'
    );
    expect(bracket).toBeDefined();
    expect(bracket?.type).toBe('wire');
    expect(bracket?.label).toBe('Rows 1-2');
    expect(bracket?.style.bracketDirection).toBe('right');
    expect(bracket?.style.bracketAmplitude).toBeGreaterThan(20);
  });

  it('parses LaTeX font sizes correctly on text nodes', () => {
    const tikzCode = `
\\begin{tikzpicture}
\\node [font=\\Huge] at (0, 0) {Huge Title};
\\node at (2, 0) {\\scriptsize Small subtext};
\\end{tikzpicture}
`;
    const result = codec.parse(tikzCode);
    const elements = result.elements;
    expect(elements.length).toBe(2);
    const hugeEl = elements.find(el => el.label.includes('Huge Title'));
    const smallEl = elements.find(el => el.label.includes('Small subtext'));
    expect(hugeEl).toBeDefined();
    expect(hugeEl?.style.fontSize).toBe(30);
    expect(smallEl).toBeDefined();
    expect(smallEl?.style.fontSize).toBe(8);
  });

  it('keeps pure text simple and wraps LaTeX symbols in $...$', () => {
    const tikzCode = `
\\begin{tikzpicture}
\\node at (0, 0) {=};
\\node at (1, 0) {1};
\\node at (2, 0) {+};
\\node at (3, 0) {+\\frac12};
\\node at (4, 0) {$+\\frac{1}{2}$};
\\end{tikzpicture}
`;
    const result = codec.parse(tikzCode);
    const elements = result.elements;
    expect(elements.length).toBe(5);

    // Pure text should have no $ and math=false
    const eq = elements.find(el => el.label === '=');
    expect(eq).toBeDefined();
    expect(eq?.style.math).toBe(false);

    const one = elements.find(el => el.label === '1');
    expect(one).toBeDefined();
    expect(one?.style.math).toBe(false);

    const plus = elements.find(el => el.label === '+');
    expect(plus).toBeDefined();
    expect(plus?.style.math).toBe(false);

    // LaTeX symbol without $ should be auto-wrapped in $
    const frac1 = elements.find(el => el.label === '$+\\frac12$');
    expect(frac1).toBeDefined();
    expect(frac1?.style.math).toBe(true);

    // LaTeX symbol with $ should stay enclosed in $
    const frac2 = elements.find(el => el.label === '$+\\frac{1}{2}$');
    expect(frac2).toBeDefined();
    expect(frac2?.style.math).toBe(true);

    // Generation: pure text should NOT have $, LaTeX should have $ without double-wrapping
    const generated = codec.generate(elements, '');
    expect(generated).toContain('{=}');
    expect(generated).toContain('{1}');
    expect(generated).toContain('{+}');
    expect(generated).toContain('{$+\\frac12$}');
    expect(generated).toContain('{$+\\frac{1}{2}$}');
    expect(generated).not.toContain('{$=$}');
    expect(generated).not.toContain('{$1$}');
    expect(generated).not.toContain('{$+$}');
    expect(generated).not.toContain('$$');
  });
});
