import { getSvgBoundingBox } from '../src/features/tikz/tikzjax/loader';

describe('getSvgBoundingBox', () => {
  it('correctly calculates bounding box including text labels outside path coordinates', () => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <path d="M 0 0 L 100 0 L 100 100 L 0 100 Z" />
        <text x="-50" y="50" font-size="12">≡</text>
        <text x="50" y="-20" font-size="12" text-anchor="middle">4</text>
        <text x="50" y="120" font-size="12" text-anchor="middle">1</text>
      </svg>`,
      'image/svg+xml'
    );
    const svg = svgDoc.documentElement as unknown as SVGElement;
    const bbox = getSvgBoundingBox(svg);

    expect(bbox).not.toBeNull();
    if (bbox) {
      // minX should be less than 0 due to text at x = -50
      expect(bbox.minX).toBeLessThan(0);
      // minY should be less than 0 due to text at y = -20
      expect(bbox.minY).toBeLessThan(0);
      // maxY should be greater than 100 due to text at y = 120
      expect(bbox.maxY).toBeGreaterThan(100);
      // maxX should be at least 100
      expect(bbox.maxX).toBeGreaterThanOrEqual(100);
    }
  });

  it('correctly calculates bounding box for use elements pointing to symbols or paths', () => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <defs>
          <g id="glyph1">
            <path d="M -10 -10 L 10 10" />
          </g>
        </defs>
        <use href="#glyph1" x="-40" y="-30" />
      </svg>`,
      'image/svg+xml'
    );
    const svg = svgDoc.documentElement as unknown as SVGElement;
    const bbox = getSvgBoundingBox(svg);

    expect(bbox).not.toBeNull();
    if (bbox) {
      expect(bbox.minX).toBeLessThanOrEqual(-50);
      expect(bbox.minY).toBeLessThanOrEqual(-40);
    }
  });

  it('correctly calculates bounding box for ellipses and polygons', () => {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="20" cy="30" rx="40" ry="15" />
        <polygon points="100,200 150,250 80,220" />
      </svg>`,
      'image/svg+xml'
    );
    const svg = svgDoc.documentElement as unknown as SVGElement;
    const bbox = getSvgBoundingBox(svg);

    expect(bbox).not.toBeNull();
    if (bbox) {
      expect(bbox.minX).toBe(-20);
      expect(bbox.minY).toBe(15);
      expect(bbox.maxX).toBe(150);
      expect(bbox.maxY).toBe(250);
    }
  });

  it('calculates bounding box for complex TikZ diagram markup and preserves namespaces on clone', () => {
    const complexTikzHtml = `
      <div class="texcore-page" data-page="0">
        <svg xmlns="http://www.w3.org/2000/svg" width="10pt" height="10pt" viewBox="0 0 10 10" style="overflow: visible; position: relative;">
          <g stroke="#000" fill="none">
            <path d="M 0 0 L 100 0 L 100 100 L 0 100 Z" />
            <circle cx="50" cy="50" r="30" />
            <text alignment-baseline="baseline" x="20" y="30" style="font-family: cmr10; font-size: 10;">C 1</text>
            <text alignment-baseline="baseline" x="80" y="30" style="font-family: cmr10; font-size: 10;">C 2</text>
          </g>
        </svg>
      </div>
    `;
    const domParser = new DOMParser();
    const doc = domParser.parseFromString(complexTikzHtml.trim(), 'text/html');
    const svg = doc.querySelector('svg') as unknown as SVGElement;

    expect(svg).toBeDefined();
    const bbox = getSvgBoundingBox(svg);
    expect(bbox).not.toBeNull();
    if (bbox) {
      expect(bbox.minX).toBeLessThanOrEqual(0);
      expect(bbox.minY).toBeLessThanOrEqual(0);
      expect(bbox.maxX).toBeGreaterThanOrEqual(100);
      expect(bbox.maxY).toBeGreaterThanOrEqual(100);

      const padding = 3;
      const width = bbox.maxX - bbox.minX + padding * 2;
      const height = bbox.maxY - bbox.minY + padding * 2;
      svg.setAttribute('width', `${width}pt`);
      svg.setAttribute('height', `${height}pt`);
      svg.setAttribute(
        'viewBox',
        `${bbox.minX - padding} ${bbox.minY - padding} ${width} ${height}`
      );
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Test cloneNode behavior used in TikzRenderer cache
      const clone = svg.cloneNode(true) as SVGElement;
      expect(clone).not.toBe(svg);
      expect(clone.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
      expect(clone.getAttribute('viewBox')).toBe(svg.getAttribute('viewBox'));
      expect(clone.querySelectorAll('path').length).toBe(1);
      expect(clone.querySelectorAll('circle').length).toBe(1);
      expect(clone.querySelectorAll('text').length).toBe(2);

      // Mutating clone does not mutate original cached SVG
      clone.setAttribute('data-test', 'modified');
      expect(svg.getAttribute('data-test')).toBeNull();
    }
  });
});
