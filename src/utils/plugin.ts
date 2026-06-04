import LatexReferencer from 'main';
import { Editor, TFile, CachedMetadata, Notice } from 'obsidian';
import { getIO } from './file-io';
import { getCalloutPrefix, isStructuralCalloutLine } from './parse';
import { EquationBlock } from 'types';
import { generateEqId } from './obsidian';

export function insertDisplayMath(editor: Editor) {
  const cursorPos = editor.getCursor();
  editor.replaceRange('$$\n\n$$', cursorPos);
  cursorPos.line += 1;
  editor.setCursor(cursorPos);
}

export async function insertBlockIdIfNotExist(
  plugin: LatexReferencer,
  targetFile: TFile,
  cache: CachedMetadata,
  block: EquationBlock
): Promise<{ id: string; lineAdded: number } | undefined> {
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

  // Detect prefix from the opening line (e.g. "> ", "   > ")
  // We only care if it has blockquotes, as indentation alone usually works fine.
  const prefix = getCalloutPrefix(originalText);

  // Find the position to insert the ID comment. This should be just before the closing '$$'.
  const insertOffsetInBlock = originalText.lastIndexOf('$$');
  if (insertOffsetInBlock === -1) {
    // This should not be reached if the block is a valid math block.
    new Notice(`${plugin.manifest.name}: Could not find closing $$ in the math block.`);
    return;
  }

  // Determine where to slice the string to remove any "dirty" existing closing prefix
  // (e.g. if the user wrote "\n > $$", we want to replace the " > " part if we are overriding it)
  let startSlice = insertOffsetInBlock;

  if (prefix) {
    const lastNewline = originalText.lastIndexOf('\n', insertOffsetInBlock - 1);
    const currentClosingPrefix =
      lastNewline === -1
        ? originalText.slice(0, insertOffsetInBlock)
        : originalText.slice(lastNewline + 1, insertOffsetInBlock);

    // If the current closing prefix looks like a block quote line, consume it
    // so we can insert our own clean prefixed version.
    if (currentClosingPrefix.trim() !== '' && isStructuralCalloutLine(currentClosingPrefix)) {
      startSlice = lastNewline === -1 ? 0 : lastNewline + 1;
    }
  }

  // Prepare New Content
  const preText = originalText.slice(0, startSlice);
  // Ensure we start with a newline if we are appending to content
  const needsNewline = preText.length > 0 && !preText.endsWith('\n');

  // Construct the parts
  const idComment = `${prefix}% id: ${id}\n`;
  const closingTag = `${prefix}$$`;

  // originalText.slice(insertOffsetInBlock + 2) preserves anything after the $$ (like newlines)
  const suffix = originalText.slice(insertOffsetInBlock + 2);

  const newText = preText + (needsNewline ? '\n' : '') + idComment + closingTag + suffix;

  // Use the File IO interface to replace the old block content with the new content.
  await io.setRange(block.$pos, newText);

  // Calculate lines added strictly by counting newlines in the *inserted* portion relative to *removed* portion?
  // The previous logic just counted newlines in `textToInsert`.
  // Here we might have removed a line (the old closing prefix) and added others.
  // However, `lineAdded` usually serves to offset subsequent operations.
  // A simple approximation is (newLines - oldLines).
  const oldLines = (originalText.match(/\n/g) || []).length;
  const newLinesCount = (newText.match(/\n/g) || []).length;
  const lineAdded = Math.max(0, newLinesCount - oldLines);

  return { id, lineAdded };
}
