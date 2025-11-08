/**
 * Display equation numbers in reading view, embeds, hover page preview, and PDF export.
 */

import { MarkdownPostProcessor, MarkdownView, TFile } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';


export const createEquationNumberProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
    return (el, ctx) => {
        const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath) as TFile;
        const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);

        if (!file || !view?.editor) return;

        const content = view.editor.getValue();
        const equations = processActiveNoteEquations(plugin, file, content);
        if (equations.size === 0) return;

        const mathElements = el.querySelectorAll<HTMLElement>(".math.math-block.is-loaded");

        mathElements.forEach((mathEl) => {
            const section = ctx.getSectionInfo(mathEl);
            if (!section) return;

            const cache = plugin.app.metadataCache.getFileCache(file);
            if (!cache) return;

            const mathSection = cache.sections?.find(s => s.position.start.line === section.lineStart && s.type === 'math');
            const blockId = mathSection?.id;

            if (blockId) {
                const equation = equations.get(blockId);
                if (equation?.$printName) {
                    const numberEl = createSpan({
                        cls: "math-booster-equation-number",
                        text: equation.$printName,
                    });
                    mathEl.parentElement?.classList.add("math-booster-has-equation-number");
                    mathEl.parentElement?.appendChild(numberEl);
                }
            }
        });
    };
};
