/**
 * Display equation numbers in reading view, embeds, hover page preview, and PDF export.
 */

import { MarkdownPostProcessor, TFile } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import { EquationBlock } from 'types';

import { cleanMathBrTags } from '../../utils/fixer';

/**
 * Universal surgical fix for <br> / &lt;br&gt; / < b r > in rendered MathJax containers.
 * Surgically prunes MathJax-rendered < b r > rows and glyph sequences without affecting actual math content.
 */
export function fixMathBrInContainer(container: HTMLElement): void {
  if (!container) return;

  // 1. Clear MathJax cells/rows whose entire content is <br>
  const cells = container.querySelectorAll('mjx-mtd, mjx-mtr');
  cells.forEach(cell => {
    const text = (cell.textContent || '').trim().replace(/\s+/g, '').toLowerCase();
    if (text === '<br>' || text === '<br/>' || text === '<br>') {
      const tag = cell.tagName.toLowerCase();
      if (tag === 'mjx-mtr') {
        cell.remove();
      } else {
        cell.innerHTML = '';
      }
    }
  });

  // 2. Remove inline < b r > glyph sequences (< + b + r + >) inside MathJax table cells
  const c3cEls = container.querySelectorAll('mjx-c[c="3C"], mjx-c.mjx-c3C');
  c3cEls.forEach(c3c => {
    const moOpen = c3c.closest('mjx-mo');
    if (!moOpen) return;

    const bEl = moOpen.nextElementSibling as HTMLElement | null;
    const rEl = bEl?.nextElementSibling as HTMLElement | null;
    const moClose = rEl?.nextElementSibling as HTMLElement | null;

    if (bEl && rEl && moClose) {
      const bHTML = bEl.innerHTML || '';
      const bText = (bEl.textContent || '').trim();
      const isB = bText === 'b' || bHTML.includes('1D44F') || bHTML.includes('c1D44F');

      const rHTML = rEl.innerHTML || '';
      const rText = (rEl.textContent || '').trim();
      const isR = rText === 'r' || rHTML.includes('1D45F') || rHTML.includes('c1D45F');

      const closeHTML = moClose.innerHTML || '';
      const isCloseGt =
        closeHTML.includes('3E') ||
        closeHTML.includes('c3E') ||
        moClose.textContent?.trim() === '>';

      if (isB && isR && isCloseGt) {
        moOpen.remove();
        bEl.remove();
        rEl.remove();
        moClose.remove();
      }
    }
  });

  // 3. Clean data-math attribute if present
  const mathEls = container.querySelectorAll<HTMLElement>('.math, [data-math]');
  mathEls.forEach(mathEl => {
    const dataMath = mathEl.getAttribute('data-math');
    if (dataMath && /<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;/i.test(dataMath)) {
      const cleaned = cleanMathBrTags(dataMath);
      mathEl.setAttribute('data-math', cleaned);
    }
  });
}

export const createEquationNumberProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
  return (el, ctx) => {
    fixMathBrInContainer(el);

    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const promise = plugin.app.vault.cachedRead(file).then(content => {
      const equations = processActiveNoteEquations(plugin, file, content);
      if (equations.size === 0) return;

      // Create a lookup map from the starting line number to the EquationBlock
      // This is more efficient than searching the entire map for each element.
      const lineToEquationMap = new Map<number, EquationBlock>();
      for (const eq of equations.values()) {
        lineToEquationMap.set(eq.$pos.start.line, eq);
      }

      const mathElements = el.querySelectorAll<HTMLElement>('.math.math-block.is-loaded');

      mathElements.forEach(mathEl => {
        const section = ctx.getSectionInfo(mathEl);
        if (!section) return;

        const equation = lineToEquationMap.get(section.lineStart);

        // Add the ID to the parent container to make it a linkable target
        if (equation?.$blockId && mathEl.parentElement) {
          mathEl.parentElement.id = equation.$blockId;
        }

        if (equation?.$printName && !equation.$subIndices) {
          const hasMjxTag = Boolean(
            mathEl.querySelector('mjx-labels, mjx-tag, .mjx-tag') ||
            (equation.$mathText && equation.$mathText.includes('\\tag{'))
          );

          if (hasMjxTag) {
            const existing = mathEl.parentElement?.querySelector('.math-booster-equation-number');
            if (existing) {
              existing.remove();
            }
            mathEl.parentElement?.classList.remove('math-booster-has-equation-number');
          } else if (!mathEl.parentElement?.querySelector('.math-booster-equation-number')) {
            const numberEl = createSpan({
              cls: 'math-booster-equation-number',
              text: equation.$printName
            });
            mathEl.parentElement?.classList.add('math-booster-has-equation-number');
            mathEl.parentElement?.appendChild(numberEl);
          }
        }
      });
    });

    const ctxWithPromises = ctx as unknown as { promises?: Promise<unknown>[] };
    if (ctxWithPromises.promises) {
      ctxWithPromises.promises.push(promise);
    }
  };
};
