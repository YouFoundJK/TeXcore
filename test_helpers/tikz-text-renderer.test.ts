import { TikzTextRenderer } from '../src/features/tikz-editor/utils/tikz-text-renderer';
import type LatexReferencer from '../src/main';

describe('TikzTextRenderer', () => {
  let mockPlugin: LatexReferencer;
  let mockRender: jest.Mock<Promise<SVGElement>, [string]>;

  beforeEach(() => {
    mockRender = jest.fn<Promise<SVGElement>, [string]>().mockImplementation((snippet: string) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-snippet', snippet);
      return Promise.resolve(svg);
    });

    mockPlugin = {
      tikzRenderer: {
        render: mockRender
      }
    } as unknown as LatexReferencer;
  });

  it('renders pure text immediately without calling TikZJax', async () => {
    const renderer = new TikzTextRenderer(mockPlugin);
    const container = document.createElement('div');

    await renderer.renderTextOrMath(container, 'Hello World', 12);

    expect(container.textContent).toBe('Hello World');
    expect(mockRender).not.toHaveBeenCalled();
  });

  it('compiles LaTeX math with $ via TikZJax and replaces container content', async () => {
    const renderer = new TikzTextRenderer(mockPlugin);
    const container = document.createElement('div');

    await renderer.renderTextOrMath(container, '$\\frac{1}{2}$', 12, '#ff0000');

    expect(mockRender).toHaveBeenCalledTimes(1);
    const calledSnippet = mockRender.mock.calls[0][0];
    expect(calledSnippet).toContain(
      '\\node[inner sep=0pt, outer sep=0pt, text={#ff0000}, font=\\normalsize] at (0, 0) {$\\frac{1}{2}$};'
    );

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.classList.contains('tikzjax-text-svg')).toBe(true);
    expect(svg?.style.color).toBe('rgb(255, 0, 0)');
  });

  it('uses cached SVG on subsequent renders with the same parameters', async () => {
    const renderer = new TikzTextRenderer(mockPlugin);
    const container1 = document.createElement('div');
    const container2 = document.createElement('div');

    await renderer.renderTextOrMath(container1, '$x^2$', 14);
    expect(mockRender).toHaveBeenCalledTimes(1);

    await renderer.renderTextOrMath(container2, '$x^2$', 14);
    // Should NOT call render again; should use cache
    expect(mockRender).toHaveBeenCalledTimes(1);

    const svg2 = container2.querySelector('svg');
    expect(svg2).not.toBeNull();
  });

  it('clears cache when clearCache is called', async () => {
    const renderer = new TikzTextRenderer(mockPlugin);
    const container = document.createElement('div');

    await renderer.renderTextOrMath(container, '$y_1$', 12);
    expect(mockRender).toHaveBeenCalledTimes(1);

    renderer.clearCache();

    await renderer.renderTextOrMath(container, '$y_1$', 12);
    expect(mockRender).toHaveBeenCalledTimes(2);
  });

  it('selects appropriate font macro based on fontSizePt', async () => {
    const renderer = new TikzTextRenderer(mockPlugin);
    const container = document.createElement('div');

    await renderer.renderTextOrMath(container, '$\\alpha$', 6);
    expect(mockRender.mock.calls[0][0]).toContain('font=\\tiny');

    await renderer.renderTextOrMath(container, '$\\beta$', 24);
    expect(mockRender.mock.calls[1][0]).toContain('font=\\huge');
  });

  it('scales rendered TikZ SVG from TeX pt to canvas coordinate units', () => {
    const renderer = new TikzTextRenderer(mockPlugin, 80);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-bbox-width', '10');
    svg.setAttribute('data-bbox-height', '20');

    renderer.scaleSvgToCanvas(svg);

    // pxPerPt = 80 / 28.452756 ≈ 2.81167
    // width: 10 * 2.81167 = 28.12px
    // height: 20 * 2.81167 = 56.23px
    expect(svg.getAttribute('width')).toBe('28.12px');
    expect(svg.getAttribute('height')).toBe('56.23px');
    expect(svg.style.width).toBe('28.12px');
    expect(svg.style.height).toBe('56.23px');
  });

  it('scales rendered TikZ SVG using pt attributes when data-bbox attributes are missing', () => {
    const renderer = new TikzTextRenderer(mockPlugin, 80);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12pt');
    svg.setAttribute('height', '15pt');

    renderer.scaleSvgToCanvas(svg);

    expect(svg.getAttribute('width')).toBe('33.74px');
    expect(svg.getAttribute('height')).toBe('42.18px');
  });

  it('scales rendered TikZ SVG using viewBox when width and height attributes are missing', () => {
    const renderer = new TikzTextRenderer(mockPlugin, 80);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '-2 -10 10 20');

    renderer.scaleSvgToCanvas(svg);

    expect(svg.getAttribute('width')).toBe('28.12px');
    expect(svg.getAttribute('height')).toBe('56.23px');
  });
});

