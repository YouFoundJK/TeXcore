import LatexReferencer from "main";
import { Editor, TFile, CachedMetadata } from "obsidian";
import { generateBlockID } from "./obsidian";
import { getIO } from "file-io";
import { EquationBlock } from "types";

export function insertDisplayMath(editor: Editor) {
    const cursorPos = editor.getCursor();
    editor.replaceRange('$$\n\n$$', cursorPos);
    cursorPos.line += 1;
    editor.setCursor(cursorPos);
}

export async function insertBlockIdIfNotExist(plugin: LatexReferencer, targetFile: TFile, cache: CachedMetadata, block: EquationBlock): Promise<{ id: string, lineAdded: number } | undefined> {
    if (!cache?.sections) return;
    if (block.$blockId) return { id: block.$blockId, lineAdded: 0 };

    const id = generateBlockID(cache);
    const io = getIO(plugin, targetFile);
    await io.insertLine(block.$position.end + 1, "^" + id);
    await io.insertLine(block.$position.end + 1, "");
    return { id, lineAdded: 2 };
}
