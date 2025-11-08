import { TFile } from 'obsidian';
import LatexReferencer from 'main';
import { EquationBlock } from 'types';
import { processActiveNoteEquations } from 'features/equations/numbering';

export class EquationCache {
    private cache: Map<string, Map<string, EquationBlock>> = new Map();

    constructor(private plugin: LatexReferencer) {}

    /**
     * Synchronously gets a cached equation block for a given file path and block ID.
     * @param filePath The path of the file to look in.
     * @param blockId The block ID of the equation (e.g., 'eq-1234abcd').
     * @returns The cached EquationBlock or undefined if not found.
     */
    get(filePath: string, blockId: string): EquationBlock | undefined {
        return this.cache.get(filePath)?.get(blockId);
    }

    /**
     * Asynchronously reads a file, processes its equations, and updates the cache.
     * @param file The file to process.
     */
    async updateFile(file: TFile) {
        const content = await this.plugin.app.vault.cachedRead(file);
        const equations = processActiveNoteEquations(this.plugin, file, content);
        if (equations.size > 0) {
            this.cache.set(file.path, equations);
        } else {
            // If there are no equations, ensure the file is removed from the cache
            this.cache.delete(file.path);
        }
    }

    /**
     * Updates the cache when a file is renamed.
     * @param file The file with the new name.
     * @param oldPath The previous path of the file.
     */
    renameFile(file: TFile, oldPath: string) {
        const fileCache = this.cache.get(oldPath);
        if (fileCache) {
            this.cache.set(file.path, fileCache);
            this.cache.delete(oldPath);
        }
    }

    /**
     * Removes a file from the cache.
     * @param file The file to remove.
     */
    removeFile(file: TFile) {
        this.cache.delete(file.path);
    }

    /**
     * Builds the entire vault cache at startup.
     */
    async buildCache() {
        console.log("Latex Referencer: Building equation cache...");
        this.cache.clear();
        const promises = this.plugin.app.vault.getMarkdownFiles().map(file => this.updateFile(file));
        await Promise.all(promises);
        console.log(`Latex Referencer: Cache built successfully. Found equations in ${this.cache.size} files.`);
    }
}