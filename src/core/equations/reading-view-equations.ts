/**
 * Display equation numbers in reading view, embeds, hover page preview, and PDF export.
 */

import { MarkdownPostProcessor, TFile } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import { EquationBlock } from 'types';

import { cleanMathBrTags } from '../../utils/fixer';
import { logDebug } from '../../utils/logger';

/**
 * Universal surgical fix for <br> / &lt;br&gt; / < b r > in rendered MathJax containers.
 * Surgically prunes MathJax-rendered < b r > rows and glyph sequences without affecting actual math content.
 */
export function fixMathBrInContainer(container: HTMLElement): void {
  if (!container) return;

  // Safety Guard: NEVER mutate DOM nodes inside Live Preview / CodeMirror editor widgets.
  // Mutating DOM nodes inside Live Preview table widgets ejects user cursor focus and breaks rendering.
  if (
    container.closest?.(
      '.cm-editor, .cm-content, .cm-embed-block, .cm-table-widget, .markdown-source-view'
    )
  ) {
    logDebug(
      'ReadingView',
      `fixMathBrInContainer skipped: container <${container.tagName.toLowerCase()}> class="${container.className}" is inside Live Preview / CodeMirror editor.`
    );
    return;
  }

  logDebug(
    'ReadingView',
    `fixMathBrInContainer called on container <${container.tagName.toLowerCase()}> class="${container.className}"`
  );

  // Inspect any MathJax errors inside container
  const mathErrors = container.querySelectorAll(
    '.cm-math-error, .math-error, [data-mjx-error], mjx-merr, [title*="MathJax"], [title*="TeX"]'
  );
  if (mathErrors.length > 0) {
    mathErrors.forEach(errEl => {
      const mathAttr =
        errEl.getAttribute('data-math') ||
        errEl.closest('[data-math]')?.getAttribute('data-math') ||
        errEl.textContent;
      const errTitle =
        errEl.getAttribute('title') || errEl.getAttribute('data-mjx-error') || errEl.innerHTML;
      window.console.error(
        `[ObsiTeX MathJaxError] Math rendering error inside container:`,
        `\n  Raw Math: "${mathAttr}"`,
        `\n  Error: "${errTitle}"`,
        `\n  Element:`,
        errEl
      );
    });
  }

  // 1. Clear MathJax cells/rows whose entire content is <br>
  const cells = container.querySelectorAll('mjx-mtd, mjx-mtr');
  if (cells.length > 0) {
    logDebug(
      'ReadingView',
      `fixMathBrInContainer found ${cells.length} MathJax table cell/row elements`
    );
  }
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
  if (c3cEls.length > 0) {
    logDebug(
      'ReadingView',
      `fixMathBrInContainer found ${c3cEls.length} potential MathJax < glyph elements`
    );
  }
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
        logDebug(
          'ReadingView',
          'fixMathBrInContainer removing inline <br> glyph sequence in MathJax DOM'
        );
        moOpen.remove();
        bEl.remove();
        rEl.remove();
        moClose.remove();
      }
    }
  });

  // 3. Clean data-math attribute, textContent, and innerHTML if present
  const mathEls = container.querySelectorAll<HTMLElement>(
    '.math, [data-math], .math-block, .math-inline'
  );

  mathEls.forEach(mathEl => {
    const dataMath = mathEl.getAttribute('data-math');
    const textContent = mathEl.textContent || '';
    const innerHTML = mathEl.innerHTML || '';

    const brRegex = /<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;/i;
    const hasComment =
      textContent.includes('%') || innerHTML.includes('%') || (dataMath && dataMath.includes('%'));

    if (dataMath && (brRegex.test(dataMath) || hasComment)) {
      const cleanedData = cleanMathBrTags(dataMath);
      mathEl.setAttribute('data-math', cleanedData);
    }

    if (!mathEl.querySelector('mjx-container')) {
      if (brRegex.test(innerHTML) || (hasComment && innerHTML.includes('%'))) {
        const cleanedHTML = cleanMathBrTags(innerHTML);
        mathEl.textContent = cleanedHTML;
      } else if (brRegex.test(textContent) || (hasComment && textContent.includes('%'))) {
        const cleanedText = cleanMathBrTags(textContent);
        mathEl.textContent = cleanedText;
      }
    }
  });
}

export const createEquationNumberProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
  return (el, ctx) => {
    logDebug(
      'ReadingView',
      `createEquationNumberProcessor called for path="${ctx.sourcePath}" docId="${ctx.docId}" el=<${el.tagName.toLowerCase()}> class="${el.className}"`
    );
    fixMathBrInContainer(el);

    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) {
      logDebug('ReadingView', `Processor skipped: sourcePath "${ctx.sourcePath}" is not a TFile`);
      return;
    }

    const promise = plugin.app.vault.cachedRead(file).then(content => {
      const equations = processActiveNoteEquations(plugin, file, content);
      logDebug('ReadingView', `processActiveNoteEquations returned ${equations.size} equation(s)`);

      if (equations.size === 0) return;

      // Create a lookup map from the starting line number to the EquationBlock
      // This is more efficient than searching the entire map for each element.
      const lineToEquationMap = new Map<number, EquationBlock>();
      for (const eq of equations.values()) {
        lineToEquationMap.set(eq.$pos.start.line, eq);
        logDebug(
          'ReadingView',
          `Mapped line ${eq.$pos.start.line} -> ID "${eq.$blockId}", printName "${eq.$printName}", mathText "${eq.$mathText.substring(0, 50).replace(/\n/g, '\\n')}"`
        );
      }

      const mathElements = el.querySelectorAll<HTMLElement>(
        '.math.math-block.is-loaded, .math.math-inline.is-loaded, table .math'
      );
      logDebug(
        'ReadingView',
        `Found ${mathElements.length} math elements in postprocessor container`
      );

      mathElements.forEach((mathEl, idx) => {
        const section = ctx.getSectionInfo(mathEl);
        logDebug(
          'ReadingView',
          `mathElement #${idx}: class="${mathEl.className}" sectionLineStart=${section?.lineStart ?? 'NULL'}, sectionLineEnd=${section?.lineEnd ?? 'NULL'}`
        );

        if (!section) return;

        const equation = lineToEquationMap.get(section.lineStart);
        logDebug(
          'ReadingView',
          `mathElement #${idx} line ${section.lineStart} matched equation: ${equation ? `ID="${equation.$blockId}", printName="${equation.$printName}"` : 'NONE'}`
        );

        // Add the ID to the parent container to make it a linkable target
        if (equation?.$blockId && mathEl.parentElement) {
          mathEl.parentElement.id = equation.$blockId;
          logDebug('ReadingView', `Set mathEl.parentElement.id = "${equation.$blockId}"`);
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
            logDebug(
              'ReadingView',
              `Appended equation number tag "${equation.$printName}" to math element #${idx}`
            );
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
