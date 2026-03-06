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
			setMathLink(mathLink, linkEl);
		}
		finishRenderMath();
	}
}

/**
 * Manually process a single internal link element, creating a LatexRenderChild
 * and calling onload() to render the equation number. Used by the DOM observer
 * to handle links inside dynamically rendered callouts.
 */
export const processInternalLink = (link: HTMLAnchorElement, plugin: LatexReferencer, sourcePath: string) => {
	if (link.classList.contains("math-link-processed")) return;
	const dataHref = link.getAttribute('data-href');
	if (dataHref && dataHref.includes('#^eq-')) {
		link.classList.add("math-link-processed");
		const child = new LatexRenderChild(link, plugin, sourcePath, dataHref);
		child.onload();
	}
};

export const CustomMathLinksProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
	return (element: HTMLElement, context: MarkdownPostProcessorContext) => {
		const links = element.querySelectorAll<HTMLAnchorElement>('a.internal-link');
		for (const link of links) {
			if (link.classList.contains("math-link-processed")) continue;
			const dataHref = link.getAttribute('data-href');

			if (dataHref && dataHref.includes('#^eq-')) {
				link.classList.add("math-link-processed");
				context.addChild(
					new LatexRenderChild(link, plugin, context.sourcePath, dataHref)
				);
			}
		}
	};
};
export { }