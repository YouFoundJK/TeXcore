import { TFile, getLinkpath, MarkdownRenderChild, MarkdownPostProcessor, MarkdownPostProcessorContext, finishRenderMath, renderMath } from "obsidian";
import { getMathLink } from "./helper";
import LatexReferencer from "main";

/**
 * A helper function to render a string with inline math.
 * e.g., "eq $(1.1)$" will be rendered as "eq" and a MathJax element for "(1.1)".
 */
function setMathLink(source: string, mathLinkEl: HTMLElement) {
	mathLinkEl.replaceChildren();
	const mathPattern = /\$(.*?[^\s])\$/g;
	let textFrom = 0, textTo = 0;
	let result;
	while ((result = mathPattern.exec(source)) !== null) {
		const mathString = result[1];
		textTo = result.index;
		if (textTo > textFrom) mathLinkEl.createSpan().replaceWith(source.slice(textFrom, textTo));

		const mathEl = renderMath(mathString, false);
		mathLinkEl.createSpan({ cls: ["math", "math-inline", "is-loaded"] }).replaceWith(mathEl);

		textFrom = mathPattern.lastIndex;
	}

	if (textFrom < source.length) mathLinkEl.createSpan().replaceWith(source.slice(textFrom));
}

export class LatexRenderChild extends MarkdownRenderChild {
	readonly targetFile: TFile | null;

	constructor(
		containerEl: HTMLElement,
		public plugin: LatexReferencer,
		public sourcePath: string,
		public targetLink: string
	) {
		super(containerEl);
		this.targetFile = this.plugin.app.metadataCache.getFirstLinkpathDest(getLinkpath(this.targetLink), this.sourcePath);
	}

	onload(): void {
		this.update();
	}

	update(): void {
		const mathLink = getMathLink(this.plugin, this.targetLink, this.sourcePath);

		if (mathLink) {
			// The containerEl is now the link element itself
			const linkEl = this.containerEl as HTMLElement;
			// Verify it's still in the DOM (though MarkdownRenderChild handles unloading)
			if (linkEl.isConnected) {
				setMathLink(mathLink, linkEl);
			}
		}
		finishRenderMath();
	}
}

export const CustomMathLinksProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
	return (element: HTMLElement, context: MarkdownPostProcessorContext) => {
		const links = element.querySelectorAll<HTMLAnchorElement>('a.internal-link');
		for (const link of links) {
			const href = link.getAttribute('data-href');
			if (href && href.contains('#^eq-')) {
				// This is one of our equation links.
				// Pass the specific link element as the container to scope the child correctly.
				context.addChild(
					new LatexRenderChild(link, plugin, context.sourcePath, href)
				);
			}
		}
	};
};
export { }