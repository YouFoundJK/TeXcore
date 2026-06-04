import { BlockSubpathResult, HeadingSubpathResult, TFile } from 'obsidian';

/**
 * A class that provides a displayed text for a given link.
 * This is the internal version for LatexReferencer and removes the dependency on MathLinks.
 */
export abstract class Provider {
  /**
   * Provide a displayed text for the given information about a link by returning a string.
   * Return `null` if the provider cannot handle the given link.
   */
  public abstract provide(
    parsedLinktext: { path: string; subpath: string },
    targetFile: TFile | null,
    targetSubpathResult: HeadingSubpathResult | BlockSubpathResult | null
  ): string | null;
}
