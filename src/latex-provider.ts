import { App, MarkdownView, TFile, HeadingSubpathResult, BlockSubpathResult } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './equations/numbering';
import { Provider } from './link-renderer/provider-link-render';


export class LatexLinkProvider extends Provider {
    app: App;

    constructor(public plugin: LatexReferencer) {
        super();
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
        for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === targetFile.path) {
                content = view.editor.getValue();
                break;
            }
        }
        if (content === null) {
            // If the target file is not open, read it from the vault
            // Note: This is a fallback and might not be perfectly in sync with unsaved changes.
            this.app.vault.cachedRead(targetFile).then(fileContent => content = fileContent);
            if (content === null) return null;
        }

        const subpath = parsedLinktext.subpath.substring(2); // remove #^
        const subpathMatch = subpath.match(/^(eq-[\w]+)(?:-(\d+))?$/);
        if (!subpathMatch) return null;

        const [, blockId, subIndexStr] = subpathMatch;
        const subIndex = subIndexStr ? parseInt(subIndexStr) : undefined;

        const equations = processActiveNoteEquations(this.plugin, targetFile, content);
        const targetEquation = equations.get(blockId);
        
        if (targetEquation?.$printName) {
            let result: string;
            const settings = this.plugin.settings;

            if (subIndex !== undefined) {
                const baseName = targetEquation.$printName.slice(1, -1);
                result = settings.eqRefPrefix + `(${baseName}.${subIndex})` + settings.eqRefSuffix;
            } else {
                result = targetEquation.$refName ?? targetEquation.$printName;
            }

            if (settings.noteTitleInEquationLink && parsedLinktext.path) {
                result = targetFile.basename + ' > ' + result;
            }
            return result;
        }
    
        return null;
    }
}
