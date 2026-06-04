import { parseLinktext, resolveSubpath } from 'obsidian';
import LatexReferencer from 'main';

/**
 * Iterates through the internal providers to get the display text for a given link.
 */
export function getMathLink(
  plugin: LatexReferencer,
  targetLink: string,
  sourcePath: string
): string {
  const { path, subpath } = parseLinktext(targetLink);

  const targetFile = plugin.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
  // Note: We don't need the sourceFile for our provider, so we can omit it.

  const cache = targetFile ? plugin.app.metadataCache.getFileCache(targetFile) : null;
  const subpathResult = cache ? resolveSubpath(cache, subpath) : null;

  for (const provider of plugin.internalProviders) {
    const provided = provider.provide({ path, subpath }, targetFile, subpathResult as any);
    if (provided) {
      return provided;
    }
  }

  return '';
}
export {};
