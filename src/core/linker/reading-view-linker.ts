import {
  TFile,
  getLinkpath,
  MarkdownRenderChild,
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  finishRenderMath,
  renderMath
} from 'obsidian';
import { getMathLink } from './helper';
import LatexReferencer from 'main';

/**
 * A helper function to render a string with inline math.
 * e.g., "eq $(1.1)$" will be rendered as "eq" and a MathJax element for "(1.1)".
 */
export function setMathLink(source: string, mathLinkEl: HTMLElement) {
  mathLinkEl.replaceChildren();
  const mathPattern = /\$(?!\s)(.*?)(?<!\s)\$/g;
  let textFrom = 0;
  let result;
  while ((result = mathPattern.exec(source)) !== null) {
    const mathString = result[1];
    const textTo = result.index;
    if (textTo > textFrom) {
      mathLinkEl.appendChild(activeDocument.createTextNode(source.slice(textFrom, textTo)));
    }

    const mathEl = renderMath(mathString, false);
    const mathSpan = mathLinkEl.createSpan({ cls: ['math', 'math-inline', 'is-loaded'] });
    mathSpan.appendChild(mathEl);

    textFrom = mathPattern.lastIndex;
  }

  if (textFrom < source.length) {
    mathLinkEl.appendChild(activeDocument.createTextNode(source.slice(textFrom)));
  }
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
    this.targetFile = this.plugin.app.metadataCache.getFirstLinkpathDest(
      getLinkpath(this.targetLink),
      this.sourcePath
    );
  }

  onload(): void {
    this.update();
  }

  update(): void {
    const mathLink = getMathLink(this.plugin, this.targetLink, this.sourcePath);

    if (mathLink) {
      // The containerEl is now the link element itself
      const linkEl = this.containerEl;
      setMathLink(mathLink, linkEl);
    }
    void finishRenderMath();
  }
}

/**
 * Manually process a single internal link element. Used by the DOM observer
 * to handle links inside dynamically rendered callouts.
 */
export const processInternalLink = (
  link: HTMLAnchorElement,
  plugin: LatexReferencer,
  sourcePath: string
) => {
  if (link.classList.contains('math-link-processed')) return;
  const dataHref = link.getAttribute('data-href');
  if (dataHref && dataHref.includes('#^eq-')) {
    link.classList.add('math-link-processed');
    const mathLink = getMathLink(plugin, dataHref, sourcePath);
    if (mathLink) {
      setMathLink(mathLink, link);
      void finishRenderMath();
    }
  }
};

export const CustomMathLinksProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
  return (element: HTMLElement, context: MarkdownPostProcessorContext) => {
    const links = element.querySelectorAll<HTMLAnchorElement>('a.internal-link');
    for (const link of links) {
      if (link.classList.contains('math-link-processed')) continue;
      const dataHref = link.getAttribute('data-href');

      if (dataHref && dataHref.includes('#^eq-')) {
        link.classList.add('math-link-processed');
        context.addChild(new LatexRenderChild(link, plugin, context.sourcePath, dataHref));
      }
    }
  };
};
export {};
