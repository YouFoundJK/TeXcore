import LatexReferencer from "main";
import { Editor, TFile, CachedMetadata, Notice } from "obsidian";
import { getIO } from "./file-io";
import { EquationBlock } from "types";
import { generateEqId } from "./obsidian";

export function insertDisplayMath(editor: Editor) {
    const cursorPos = editor.getCursor();
    editor.replaceRange('$$\n\n$$', cursorPos);
    cursorPos.line += 1;
    editor.setCursor(cursorPos);
}

export async function insertBlockIdIfNotExist(plugin: LatexReferencer, targetFile: TFile, cache: CachedMetadata, block: EquationBlock): Promise<{ id: string, lineAdded: number } | undefined> {
    // If the block already has an ID (from a previous reference), do nothing and return the existing ID.
    if (block.$blockId) {
        return { id: block.$blockId, lineAdded: 0 };
    }

    // Safeguard against missing cache sections.
    if (!cache?.sections) return;

    // Generate a new ID in the format "eq-..."
    const id = generateEqId();
    const io = getIO(plugin, targetFile);

    // Get the full text of the math block from the file, e.g., "$$\n\\sin(x)\n$$"
    const originalText = await io.getRange(block.$pos);

    // Find the position to insert the ID comment. This should be just before the closing '$$'.
    const insertOffsetInBlock = originalText.lastIndexOf('$$');
    if (insertOffsetInBlock === -1) {
        // This should not be reached if the block is a valid math block.
        new Notice(`${plugin.manifest.name}: Could not find closing $$ in the math block.`);
        return;
    }

    // To ensure clean formatting, check if the character before the insertion point is already a newline.
    const charBefore = originalText.slice(insertOffsetInBlock - 1, insertOffsetInBlock);
    
    // Construct the ID comment. Add a preceding newline if necessary to avoid breaking the LaTeX.
    // Example: "% id: eq-a1b2c3d4"
    const textToInsert = (charBefore === '\n' ? '' : '\n') + `% id: ${id}\n`;
    
    // Construct the new, full text for the math block.
    const newText = originalText.slice(0, insertOffsetInBlock) + textToInsert + originalText.slice(insertOffsetInBlock);
    
    // Use the File IO interface to replace the old block content with the new content.
    await io.setRange(block.$pos, newText);

    // The calling function needs to know how many lines were added to the document *before* its own position,
    // so it can adjust its own text insertion coordinates. We calculate that here.
    // This will be 1 or 2, depending on whether we added a leading newline.
    const lineAdded = (textToInsert.match(/\n/g) || []).length;
    
    return { id, lineAdded };
}
