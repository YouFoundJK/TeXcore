import { App, MarkdownView, TFile, HeadingSubpathResult, BlockSubpathResult } from 'obsidian';
import * as MathLinks from 'obsidian-mathlinks';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './equations/numbering';
import { MathIndex } from 'index/math-index';

export class CleverefProvider extends MathLinks.Provider {
    app: App;
    index: MathIndex;

    constructor(mathLinks: any, public plugin: LatexReferencer) {
        // Using `any` for `mathLinks` as the exact type is unclear. This should be revisited.
        super(mathLinks);
        this.app = plugin.app;
        this.index = plugin.indexManager.index;
    }

    provide(
        parsedLinktext: { path: string; subpath: string; },
        targetFile: TFile | null,
        targetSubpathResult: HeadingSubpathResult | BlockSubpathResult | null,
    ): string | null {
        // The subpath for a block link is "#^blockid". This check is now correct.
        if (!targetFile || !parsedLinktext.subpath || !parsedLinktext.subpath.startsWith('#^')) {
            return null;
        }

        let content: string | null = null;
        for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === targetFile.path) {
                content = view.editor.getValue();
                break;
            }
        }

        if (content === null) {
            this.app.vault.read(targetFile).then(cachedContent => {
                if (cachedContent) {
                    content = cachedContent;
                }
            }).catch(error => {
                console.error("Error reading file from vault:", error);
            });

            if (!content) {
                return null;
            }
        }
        
        // Correctly extract the block ID by removing the first two characters ("#^").
        const blockId = parsedLinktext.subpath.substring(2);

        if (content) {
            const equations = processActiveNoteEquations(this.plugin, targetFile, content);
            const targetEquation = equations.get(blockId);

            if (targetEquation?.$refName) {
                let result = targetEquation.$refName;
                // Check if the original link was to a different file (`path` is not empty)
                if (this.plugin.extraSettings.noteTitleInEquationLink && parsedLinktext.path) {
                    result = targetFile.basename + ' > ' + result;
                }
                return result;
            }
        }
        
        return null;
    }
}