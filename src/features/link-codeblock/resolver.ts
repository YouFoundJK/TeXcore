import { App, TFile } from 'obsidian';

export interface ResolvedMarkdownNote {
  basename: string;
  content: string;
}

export interface NoteResolver {
  resolve(linkTarget: string, sourcePath: string): Promise<ResolvedMarkdownNote | null>;
}

/**
 * Creates a resolver backed by Obsidian's metadata cache and vault.
 * Resolves only existing Markdown (`.md`) files.
 */
export function createObsidianNoteResolver(app: App): NoteResolver {
  return {
    async resolve(linkTarget: string, sourcePath: string): Promise<ResolvedMarkdownNote | null> {
      const file = app.metadataCache.getFirstLinkpathDest(linkTarget, sourcePath);
      if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') {
        return null;
      }

      const content = await app.vault.cachedRead(file);
      return {
        basename: file.basename,
        content
      };
    }
  };
}
