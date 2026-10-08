/**
 * Display equation numbers in reading view, embeds, hover page preview, and PDF export.
 */

import { MarkdownPostProcessor, TFile } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import { EquationBlock } from 'types';
import { cleanMathBrTags } from '../../utils/fixer';
import { fixMathInTableElement } from '../../utils/math-table-sanitizer';

/**
 * Universal surgical fix for <br> / &lt;br&gt; / < b r > in rendered MathJax containers.
 * Surgically prunes MathJax-rendered < b r > rows and glyph sequences without affecting actual math content,
 * and recovers any MathJax error blocks caused by table markup.
 */
export function fixMathBrInContainer(container: HTMLElement): void {
  if (!container) return;

  // Clean data-math attribute if present
  const mathEls = container.querySelectorAll<HTMLElement>('.math, [data-math]');
  mathEls.forEach(mathEl => {
    const dataMath = mathEl.getAttribute('data-math');
    if (dataMath && /<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;/i.test(dataMath)) {
      const cleaned = cleanMathBrTags(dataMath);
      mathEl.setAttribute('data-math', cleaned);
    }
  });

  // Comprehensive fixer for table math elements (glyph pruning + merror recovery)
  fixMathInTableElement(container);
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
      const lineToEquationMap = new Map<number, EquationBlock>();
      for (const eq of equations.values()) {
        lineToEquationMap.set(eq.$pos.start.line, eq);
      }

      const mathElements = el.querySelectorAll<HTMLElement>('.math.math-block.is-loaded');

      mathElements.forEach(mathEl => {
        const section = ctx.getSectionInfo(mathEl);
        let equation: EquationBlock | undefined = undefined;

        if (section) {
          equation = lineToEquationMap.get(section.lineStart);
        }

        // If not found by lineStart (e.g. in tables where section info only points to the table start),
        // search by blockId on parent or mathEl
        if (!equation) {
          const parentId = mathEl.parentElement?.id || mathEl.id;
          if (parentId && equations.has(parentId)) {
            equation = equations.get(parentId);
          } else {
            const dataMath = mathEl.getAttribute('data-math') || '';
            for (const eq of equations.values()) {
              if (
                eq.$blockId &&
                (mathEl.parentElement?.id === eq.$blockId ||
                  dataMath.includes(eq.$blockId) ||
                  mathEl.textContent?.includes(eq.$blockId) ||
                  (eq.$label &&
                    (dataMath.includes(eq.$label) || mathEl.textContent?.includes(eq.$label))))
              ) {
                equation = eq;
                break;
              }
            }
          }
        }

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
