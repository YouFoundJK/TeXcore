import { App, MarkdownView, TFile, HeadingSubpathResult, BlockSubpathResult } from 'obsidian';
import * as MathLinks from 'obsidian-mathlinks';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './equations/numbering';

export class CleverefProvider extends MathLinks.Provider {
    app: App;

    constructor(mathLinks: any, public plugin: LatexReferencer) {
        super(mathLinks);
        this.app = plugin.app;
    }

    provide(
        parsedLinktext: { path: string; subpath: string; },
        targetFile: TFile | null,
        targetSubpathResult: HeadingSubpathResult | BlockSubpathResult | null,
    ): string | null {
        if (!targetFile || !parsedLinktext.subpath || !parsedLinktext.subpath.startsWith('#^')) {
            return null;
        }

        let content: string | null = null;
        // The only reliable SYNCHRONOUS way to get content is to find an open editor.
        for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === targetFile.path) {
                content = view.editor.getValue();
                break;
            }
        }

        // If the file is not open, we cannot process it. This is a necessary limitation
        // to comply with the synchronous nature of the MathLinks API.
        if (content === null) {
            return null;
        }
    
        const blockId = parsedLinktext.subpath.substring(2);

        const equations = processActiveNoteEquations(this.plugin, targetFile, content);
        const targetEquation = equations.get(blockId);

        if (targetEquation?.$refName) {
            let result = targetEquation.$refName;
            if (this.plugin.settings.noteTitleInEquationLink && parsedLinktext.path) {
                result = targetFile.basename + ' > ' + result;
            }
            return result;
        }
    
        return null;
    }
}