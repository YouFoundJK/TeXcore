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
});
