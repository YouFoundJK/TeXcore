import { App, MarkdownView, TFile, HeadingSubpathResult, BlockSubpathResult } from 'obsidian';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './features/equations/numbering';
import { Provider } from './features/linker/provider-link-render';


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

        const subpath = parsedLinktext.subpath.substring(2); // remove #^
        const subpathMatch = subpath.match(/^(eq-[\w]+)(?:-(\d+))?$/);
        if (!subpathMatch) return null;

        const [, blockId, subIndexStr] = subpathMatch;
        const subIndex = subIndexStr ? parseInt(subIndexStr) : undefined;

        // Use the cache instead of parsing the file content manually
        const targetEquation = this.plugin.equationCache.get(targetFile.path, blockId);

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
