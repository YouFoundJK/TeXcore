import LatexReferencer from '../main';
import { Editor, TFile, CachedMetadata } from 'obsidian';
import { getIO } from './file-io';
import { getCalloutPrefix, isStructuralCalloutLine, findTopLevelEndEnvMatch } from './parse';
import { EquationBlock } from 'types';
import { generateEqId, showNotice } from './obsidian';
import { parseObsitexConfig } from './obsitex';
import { formatEquationIdLine } from './equation-id';

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

  const io = getIO(plugin, targetFile);
  const fullContent = await io.read();

  let blockOffset = block.$pos?.start?.offset ?? 0;
  if (!blockOffset && block.$pos?.start?.line > 0) {
    const lines = fullContent.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(block.$pos.start.line, lines.length); i++) {
      offset += lines[i].length + 1;
    }
    blockOffset = offset;
  }

  const obsitexConfig = parseObsitexConfig(fullContent, blockOffset);

  // Generate a new ID in the format "eq-[prefix]-..."
  const id = generateEqId(obsitexConfig.eqPrefix);

  // Get the full text of the math block from the file, e.g., "$$\n\\sin(x)\n$$"
  const originalText = await io.getRange(block.$pos);

  // Detect prefix from the opening line (e.g. "> ", "   > ")
  const prefix = getCalloutPrefix(originalText);

  // Default tag mechanism uses `% id: <id>` as specified
  const idLine = formatEquationIdLine(id, prefix);

  // Check if math block has an \end{...} environment (like align or equation)
  const endEnvMatch = findTopLevelEndEnvMatch(originalText);
  let newText: string;

  if (endEnvMatch && endEnvMatch.index !== undefined) {
    const envPos = endEnvMatch.index;
    const preText = originalText.slice(0, envPos);
    const needsNewline = preText.length > 0 && !preText.endsWith('\n');
    const postText = originalText.slice(envPos);
    newText = preText + (needsNewline ? '\n' : '') + idLine + postText;
  } else {
    // Find position to insert the ID comment, just before the closing '$$'
    const insertOffsetInBlock = originalText.lastIndexOf('$$');
    if (insertOffsetInBlock === -1) {
      showNotice(`${plugin.manifest.name}: Could not find closing $$ in the math block.`);
      return;
    }

    let startSlice = insertOffsetInBlock;

    if (prefix) {
      const lastNewline = originalText.lastIndexOf('\n', insertOffsetInBlock - 1);
      const currentClosingPrefix =
        lastNewline === -1
          ? originalText.slice(0, insertOffsetInBlock)
          : originalText.slice(lastNewline + 1, insertOffsetInBlock);

      if (currentClosingPrefix.trim() !== '' && isStructuralCalloutLine(currentClosingPrefix)) {
        startSlice = lastNewline === -1 ? 0 : lastNewline + 1;
      }
    }

    const preText = originalText.slice(0, startSlice);
    const needsNewline = preText.length > 0 && !preText.endsWith('\n');
    const closingTag = `${prefix}$$`;
    const suffix = originalText.slice(insertOffsetInBlock + 2);

    newText = preText + (needsNewline ? '\n' : '') + idLine + closingTag + suffix;
  }

  // Use the File IO interface to replace the old block content with the new content.
  await io.setRange(block.$pos, newText);

  const oldLines = (originalText.match(/\n/g) || []).length;
  const newLinesCount = (newText.match(/\n/g) || []).length;
  const lineAdded = Math.max(0, newLinesCount - oldLines);

  return { id, lineAdded };
}
