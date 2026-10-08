import {
  sanitizeTableMath,
  pruneMathBrGlyphs,
  fixTableMerrors,
  fixTableMathWithBr,
  fixMathInTableElement,
  resetMathJaxLabels
} from '../src/utils/math-table-sanitizer';

function createEl(
  tag: string,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  for (const child of children) {
    if (typeof child === 'string') {
      el.appendChild(document.createTextNode(child));
    } else {
      el.appendChild(child);
    }
  }
  return el;
}

interface MockInputJax {
  parseOptions: {
    options: Record<string, unknown>;
    tags: {
      reset: jest.Mock<void, []>;
      allLabels: Record<string, unknown>;
      labels: Record<string, unknown>;
    };
  };
  options: Record<string, unknown>;
}

interface MockMathJax {
  config: {
    tex: Record<string, unknown>;
  };
  startup: {
    document: {
      inputJax: MockInputJax[];
    };
  };
}

describe('sanitizeTableMath unit tests', () => {
  it('sanitizes Eq1 from Equations.md: strips leading/trailing <br>, moves \\label inside \\end{align}', () => {
    const raw = `<br>\\begin{align}<br>u_{ij}(12) &= u^{000}_{ij}(r)\\, \\Phi^{000}(12) \\\\<br>\\text{where} \\qquad  u^{000}_{ij}(r) &= u^{\\mathrm{HS}}_{ij}(r) + \\frac{1}{4\\pi\\varepsilon_0} \\frac{q_i q_j}{r}, \\qquad \\Phi^{000}(12) = 1<br>\\end{align}<br>\\label{eq-4a8b2c0d}<br>`;
    const result = sanitizeTableMath(raw);

    expect(result.wasModified).toBe(true);
    expect(result.labelId).toBe('eq-4a8b2c0d');
    expect(result.cleanLatex).not.toContain('<br>');
    expect(result.cleanLatex.startsWith('\\begin{align}')).toBe(true);
    expect(result.cleanLatex).toContain('\\label{eq-4a8b2c0d} \\end{align}');
  });

  it('sanitizes Eq2 from Equations.md: handles internal <br> within \\text{where}', () => {
    const raw = `<br>\\begin{align}<br>u_{in}(12) & = u^{000}_{in}(r)\\, \\Phi^{000}(12) + u^{011}_{in}(r)\\, \\Phi^{011}(12) \\\\<br>\\text{where} \\qquad <br>u^{000}_{in}(r) & = u^{\\mathrm{HS}}_{in}(r), \\qquad u^{011}_{in}(r) = -\\frac{1}{4\\pi\\varepsilon_0} \\frac{q_i m_n}{r^2}<br>\\end{align} <br>\\label{eq-7f3e1a9b}<br>`;
    const result = sanitizeTableMath(raw);

    expect(result.wasModified).toBe(true);
    expect(result.labelId).toBe('eq-7f3e1a9b');
    expect(result.cleanLatex).not.toContain('<br>');
    expect(result.cleanLatex).toContain('\\label{eq-7f3e1a9b} \\end{align}');
  });

  it('sanitizes Eq5 (Radial Correlations): strips leading and trailing <br>', () => {
    const raw = `<br>g_{ij}(12) = g^{000}_{ij}(r)\\, \\Phi^{000}(12) = g^{000}_{ij}(r)<br>\\label{eq-3a7c5d8e}<br>`;
    const result = sanitizeTableMath(raw);

    expect(result.wasModified).toBe(true);
    expect(result.labelId).toBe('eq-3a7c5d8e');
    expect(result.cleanLatex).not.toContain('<br>');
    expect(result.cleanLatex).toBe(
      'g_{ij}(12) = g^{000}_{ij}(r)\\, \\Phi^{000}(12) = g^{000}_{ij}(r) \\label{eq-3a7c5d8e}'
    );
  });

  it('sanitizes Eq7 (Dipole–ion with tag 11): preserves \\tag{11} and extracts label', () => {
    const raw = `<br>g_{ni}(12) = g^{000}_{ni}(r)\\, \\Phi^{000}(12) + h^{101}_{ni}(r)\\, \\Phi^{101}(12) \\tag{11}<br>\\label{eq-8d3a7b4c}<br>`;
    const result = sanitizeTableMath(raw);

    expect(result.wasModified).toBe(true);
    expect(result.labelId).toBe('eq-8d3a7b4c');
    expect(result.cleanLatex).not.toContain('<br>');
    expect(result.cleanLatex).toContain('\\tag{11}');
    expect(result.cleanLatex).toContain('\\label{eq-8d3a7b4c}');
  });

  it('correctly places \\label before outermost \\end in nested environments', () => {
    const raw = `\\begin{align}<br>\\begin{pmatrix} a \\\\ b \\end{pmatrix}<br>\\end{align}<br>\\label{eq-nested}<br>`;
    const result = sanitizeTableMath(raw);

    expect(result.wasModified).toBe(true);
    expect(result.labelId).toBe('eq-nested');
    expect(result.cleanLatex).toContain('\\label{eq-nested} \\end{align}');
    expect(result.cleanLatex).not.toContain('\\label{eq-nested} \\end{pmatrix}');
  });

  it('handles clean math without modifications', () => {
    const raw = 'E = mc^2';
    const result = sanitizeTableMath(raw);

    expect(result.wasModified).toBe(false);
    expect(result.cleanLatex).toBe('E = mc^2');
    expect(result.labelId).toBeNull();
  });

  it('handles empty input gracefully', () => {
    const result = sanitizeTableMath('');
    expect(result.cleanLatex).toBe('');
    expect(result.wasModified).toBe(false);
  });
});

describe('pruneMathBrGlyphs DOM tests', () => {
  it('prunes MathJax 4 < b r > sequence from DOM', () => {
    const math = createEl('mjx-math', {}, [
      createEl('mjx-mo', {}, ['<']),
      createEl('mjx-mi', {}, ['b']),
      createEl('mjx-mi', {}, ['r']),
      createEl('mjx-mo', {}, ['>']),
      createEl('mjx-mi', {}, ['x']),
      createEl('mjx-mo', {}, ['+']),
      createEl('mjx-mn', {}, ['1']),
      createEl('mjx-mo', {}, ['<']),
      createEl('mjx-mi', {}, ['b']),
      createEl('mjx-mi', {}, ['r']),
      createEl('mjx-mo', {}, ['>'])
    ]);
    const container = createEl('div', {}, [
      createEl('mjx-container', { class: 'MathJax' }, [math])
    ]);

    pruneMathBrGlyphs(container);

    const mos = container.querySelectorAll('mjx-mo');
    const mis = container.querySelectorAll('mjx-mi');
    // The < and > should be gone, only + remains
    expect(mos.length).toBe(1);
    expect(mos[0].textContent).toBe('+');
    // b and r should be gone, only x remains
    expect(mis.length).toBe(1);
    expect(mis[0].textContent).toBe('x');
  });

  it('prunes MathJax 3 <mjx-c c="3C"> sequences', () => {
    const container = createEl('div', {}, [
      createEl('mjx-container', {}, [
        createEl('mjx-mo', {}, [createEl('mjx-c', { c: '3C' })]),
        createEl('mjx-mi', { class: 'mjx-i' }, [createEl('mjx-c', { class: 'mjx-c1D44F' })]),
        createEl('mjx-mi', { class: 'mjx-i' }, [createEl('mjx-c', { class: 'mjx-c1D45F' })]),
        createEl('mjx-mo', {}, [createEl('mjx-c', { c: '3E' })]),
        createEl('mjx-mi', {}, ['y'])
      ])
    ]);

    pruneMathBrGlyphs(container);

    expect(container.querySelectorAll('mjx-c[c="3C"]').length).toBe(0);
    expect(container.textContent).toContain('y');
  });
});

describe('fixTableMerrors recovery tests', () => {
  it('detects mjx-merror, sanitizes LaTeX, and replaces it with clean math element', () => {
    const cell = createEl('td', {}, [
      createEl('strong', {}, ['Ion–ion potential']),
      createEl('br'),
      createEl('mjx-container', { class: 'MathJax' }, [
        createEl('mjx-merror', { 'data-mjx-error': 'Erroneous nesting of equation structures' }, [
          createEl('mjx-mtext', {}, [
            '\\begin{align}<br>u_{ij}(12) &= u^{000}_{ij}(r)<br>\\end{align}<br>\\label{eq-4a8b2c0d}<br>'
          ])
        ])
      ])
    ]);

    fixTableMerrors(cell);

    expect(cell.querySelector('mjx-merror')).toBeNull();
    const cleanEl = cell.querySelector('.math.math-block');
    expect(cleanEl).not.toBeNull();
    expect(cleanEl?.getAttribute('data-obsitex-cleaned')).toBe('true');
    expect(cell.id).toBe('eq-4a8b2c0d');
  });

  it('marks unrecoverable LaTeX error without re-rendering to prevent infinite loops', () => {
    const cell = createEl('td', {}, [
      createEl('mjx-container', { class: 'MathJax' }, [
        createEl('mjx-merror', { 'data-mjx-error': 'Undefined control sequence' }, [
          createEl('mjx-mtext', {}, ['\\invalidmacro{foo}'])
        ])
      ])
    ]);

    fixTableMerrors(cell);

    // Should NOT replace with new math element because sanitization did not modify it
    expect(cell.querySelector('mjx-merror')).not.toBeNull();
    expect(cell.querySelector('mjx-merror')?.getAttribute('data-obsitex-cleaned')).toBe('true');
  });
});

describe('fixTableMathWithBr tests', () => {
  it('detects contaminated data-latex with <br> and re-renders clean equation', () => {
    const cell = createEl('td', {}, [
      createEl('mjx-container', { class: 'MathJax' }, [
        createEl('mjx-math', { 'data-latex': '<br>g_{ij}(12) = g^{000}_{ij}(r)<br>\\label{eq-3a7c5d8e}<br>' }, [
          createEl('mjx-mi', {}, ['g'])
        ])
      ])
    ]);

    fixTableMathWithBr(cell);

    const cleanEl = cell.querySelector('.math.math-block');
    expect(cleanEl).not.toBeNull();
    expect(cleanEl?.getAttribute('data-obsitex-cleaned')).toBe('true');
    expect(cleanEl?.textContent).toBe('g_{ij}(12) = g^{000}_{ij}(r) \\label{eq-3a7c5d8e}');
    expect(cell.id).toBe('eq-3a7c5d8e');
  });
});

describe('fixMathInTableElement integration tests', () => {
  it('runs both glyph pruning and merror recovery on a table', () => {
    const cell1 = createEl('td', {}, [
      createEl('mjx-container', { class: 'MathJax' }, [
        createEl('mjx-mo', {}, ['<']),
        createEl('mjx-mi', {}, ['b']),
        createEl('mjx-mi', {}, ['r']),
        createEl('mjx-mo', {}, ['>']),
        createEl('mjx-mi', {}, ['g'])
      ])
    ]);
    const cell2 = createEl('td', {}, [
      createEl('mjx-container', { class: 'MathJax' }, [
        createEl('mjx-merror', { 'data-mjx-error': 'Error' }, [
          createEl('mjx-mtext', {}, [
            '\\begin{align}<br>y = 1<br>\\end{align}<br>\\label{eq-test}<br>'
          ])
        ])
      ])
    ]);
    const tr = createEl('tr', {}, [cell1, cell2]);
    const table = createEl('table', {}, [tr]);

    fixMathInTableElement(table);

    // First cell: < b r > pruned
    expect(cell1.querySelectorAll('mjx-mo').length).toBe(0);
    expect(cell1.textContent?.trim()).toBe('g');

    // Second cell: merror recovered
    expect(cell2.querySelector('mjx-merror')).toBeNull();
    expect(cell2.id).toBe('eq-test');
  });
});

describe('resetMathJaxLabels tests', () => {
  it('does not throw when window.MathJax is undefined or partially initialized', () => {
    expect(() => resetMathJaxLabels()).not.toThrow();

    const mockMathJax: MockMathJax = {
      config: { tex: {} },
      startup: {
        document: {
          inputJax: [
            {
              parseOptions: {
                options: {},
                tags: {
                  reset: jest.fn<void, []>(),
                  allLabels: { 'eq-1': {} },
                  labels: { 'eq-1': {} }
                }
              },
              options: {}
            }
          ]
        }
      }
    };

    (window as unknown as { MathJax?: MockMathJax }).MathJax = mockMathJax;

    expect(() => resetMathJaxLabels()).not.toThrow();
    const mj = (window as unknown as { MathJax: MockMathJax }).MathJax;
    expect(mj.config.tex.ignoreDuplicateLabels).toBe(true);
    expect(mj.startup.document.inputJax[0].parseOptions.options.ignoreDuplicateLabels).toBe(true);
    expect(mj.startup.document.inputJax[0].parseOptions.tags.allLabels).toEqual({});
  });
});
