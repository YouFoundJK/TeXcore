import { getHeadingTree, modifyDest, fixAnchors } from '../src/features/export-pdf/utils';

function setBodyContent(doc: Document, html: string) {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  doc.body.replaceChildren(...Array.from(parsed.body.childNodes));
}

describe('Export PDF Subsystem Unit Tests', () => {
  let doc: Document;

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('test');
  });

  describe('modifyDest', () => {
    test('creates destination anchors for headings', () => {
      setBodyContent(
        doc,
        `
        <h1 id="intro">Introduction</h1>
        <h2 id="methods">Methods</h2>
      `
      );
      const destMap = modifyDest(doc);

      expect(destMap.get('intro')).toBe('h1-0');
      expect(destMap.get('methods')).toBe('h2-1');

      const h1Anchor = doc.querySelector('h1 a.md-print-anchor');
      expect(h1Anchor).not.toBeNull();
      expect(h1Anchor?.getAttribute('href')).toBe('af://h1-0');
    });

    test('DOES NOT insert HTML anchor tags inside SVG elements (preserves TikZ / Math SVG structure)', () => {
      setBodyContent(
        doc,
        `
        <div id="equation-block">
          <svg id="tikz-svg-root" width="100" height="100">
            <g id="tikz-node-1" class="tikz-element">
              <path id="path-1" d="M 0 0 L 10 10" />
            </g>
          </svg>
        </div>
      `
      );

      const destMap = modifyDest(doc);

      // The outer block receives an anchor
      expect(destMap.get('equation-block')).toBeDefined();
      expect(doc.querySelector('#equation-block > a.md-print-anchor')).not.toBeNull();

      // SVG elements inside must NOT have a.md-print-anchor inserted inside them
      expect(doc.querySelector('svg a.md-print-anchor')).toBeNull();
      expect(doc.querySelector('g a.md-print-anchor')).toBeNull();
      expect(doc.querySelector('path a.md-print-anchor')).toBeNull();
    });
  });

  describe('getHeadingTree', () => {
    test('correctly builds heading tree hierarchy', () => {
      setBodyContent(
        doc,
        `
        <h1><a class="md-print-anchor" href="af://h1-0"></a>Title</h1>
        <h2><a class="md-print-anchor" href="af://h2-1"></a>Section 1</h2>
        <h3><a class="md-print-anchor" href="af://h3-2"></a>Subsection 1.1</h3>
      `
      );

      const root = getHeadingTree(doc);
      expect(root.children.length).toBe(1);
      expect(root.children[0].title).toBe('Title');
      expect(root.children[0].children[0].title).toBe('Section 1');
      expect(root.children[0].children[0].children[0].title).toBe('Subsection 1.1');
    });
  });

  describe('fixAnchors', () => {
    test('resolves internal links within current document', () => {
      setBodyContent(
        doc,
        `
        <h1 id="sec1">Section 1</h1>
        <a class="internal-link" data-href="#sec1">Link to Sec 1</a>
      `
      );
      const dest = modifyDest(doc);
      fixAnchors(doc, dest, 'test');

      const link = doc.querySelector('a.internal-link') as HTMLAnchorElement;
      expect(link.href).toContain('an://h1-0');
    });

    test('resolves inter-file links in merged PDF export', () => {
      setBodyContent(
        doc,
        `
        <a class="internal-link" data-href="OtherNote#sec2">Link to Other Note Section 2</a>
      `
      );
      const dest = new Map<string, string>();
      dest.set('OtherNote#sec2', 'h2-5');

      fixAnchors(doc, dest, 'MainNote');

      const link = doc.querySelector('a.internal-link') as HTMLAnchorElement;
      expect(link.href).toContain('an://h2-5');
    });
  });
});
