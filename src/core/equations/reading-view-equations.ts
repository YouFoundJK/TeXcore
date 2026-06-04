/**
 * Display equation numbers in reading view, embeds, hover page preview, and PDF export.
 */

import { MarkdownPostProcessor, TFile } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import { EquationBlock } from 'types';

export const createEquationNumberProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
  return (el, ctx) => {
    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    // In reading view, we need to read the file content directly.
    // We cannot rely on an active editor being open.
    void plugin.app.vault.cachedRead(file).then(content => {
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
          const numberEl = createSpan({
            cls: 'math-booster-equation-number',
            text: equation.$printName
          });
          if (!mathEl.parentElement?.querySelector('.math-booster-equation-number')) {
            mathEl.parentElement?.classList.add('math-booster-has-equation-number');
            mathEl.parentElement?.appendChild(numberEl);
          }
        }
      });
    });
  };
};
