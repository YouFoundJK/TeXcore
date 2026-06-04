/**
 * DOM Observer for Callout Equation Links
 *
 * When Obsidian renders a callout in Live Preview (cursor leaves the callout),
 * it replaces the CodeMirror content with a native HTML Block Widget. This
 * native rendering bypasses MarkdownPostProcessor hooks, so our equation link
 * rendering never fires.
 *
 * Additionally, Obsidian copies the 'math-link-processed' class from the
 * CodeMirror state into the callout HTML, which means we must strip it
 * before reprocessing.
 *
 * This observer watches for DOM mutations and manually processes equation
 * links inside dynamically rendered callout blocks. It also performs an
 * initial scan on setup to catch callouts rendered before the cache was ready.
 */

import { MarkdownView } from 'obsidian';
import LatexReferencer from 'main';
import { processInternalLink } from './reading-view-linker';

/**
 * Process all equation links within a given HTML element, stripping any
 * stale 'math-link-processed' class and reprocessing them.
 */
function processEquationLinksInElement(node: HTMLElement, plugin: LatexReferencer): void {
  let sourcePath: string | undefined = undefined;

  const resolveSourcePath = () => {
    if (sourcePath) return;
    const leaves = plugin.app.workspace.getLeavesOfType('markdown');
    for (const leaf of leaves) {
      if (leaf.view.containerEl.contains(node)) {
        sourcePath = (leaf.view as MarkdownView).file?.path;
        break;
      }
    }
    if (!sourcePath) {
      const active = plugin.app.workspace.getActiveViewOfType(MarkdownView);
      sourcePath = active?.file?.path;
    }
  };

  const equationLinks = node.querySelectorAll?.('a.internal-link') as NodeListOf<HTMLAnchorElement>;
  if (equationLinks && equationLinks.length > 0) {
    for (let i = 0; i < equationLinks.length; i++) {
      const link = equationLinks[i];
      const dataHref = link.getAttribute('data-href');
      if (dataHref && dataHref.includes('#^eq-')) {
        link.classList.remove('math-link-processed');
        resolveSourcePath();
        if (sourcePath) {
          processInternalLink(link, plugin, sourcePath);
        }
      }
    }
  }

  // The node itself could be the link
  if (node.matches && node.matches('a.internal-link')) {
    const dataHref = (node as HTMLAnchorElement).getAttribute('data-href');
    if (dataHref && dataHref.includes('#^eq-')) {
      node.classList.remove('math-link-processed');
      resolveSourcePath();
      if (sourcePath) {
        processInternalLink(node as HTMLAnchorElement, plugin, sourcePath);
      }
    }
  }
}

/**
 * Scan all existing callout blocks in the DOM and process any equation links.
 * This handles callouts that were rendered before the equation cache was ready
 * (e.g., on initial page load).
 */
function scanExistingCallouts(plugin: LatexReferencer): void {
  const calloutBlocks = document.querySelectorAll('.cm-embed-block.cm-callout');
  for (const block of calloutBlocks) {
    if (block instanceof HTMLElement) {
      processEquationLinksInElement(block, plugin);
    }
  }
}

/**
 * Sets up a MutationObserver on document.body to detect callout rendering
 * and reprocess equation links within them. Also performs an initial scan
 * after a delay to catch callouts rendered before the cache was ready.
 *
 * @param plugin - The LatexReferencer plugin instance
 * @returns A cleanup function that disconnects the observer
 */
export function setupDOMObserver(plugin: LatexReferencer): () => void {
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            if (!node.querySelector && !node.matches) continue;
            processEquationLinksInElement(node, plugin);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Initial scan: process callouts that were rendered before the observer
  // started or before the equation cache was ready. We use onLayoutReady
  // to ensure the DOM is fully initialized, plus a small delay to ensure
  // the equation cache has been built.
  plugin.app.workspace.onLayoutReady(() => {
    setTimeout(() => scanExistingCallouts(plugin), 1000);
  });

  return () => observer.disconnect();
}
