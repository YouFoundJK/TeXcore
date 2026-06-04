import { MarkdownView, Notice } from 'obsidian';
import LatexReferencer from '../../main';

export const processZoteroCleanup = async (plugin: LatexReferencer, activeView: MarkdownView) => {
  const activeFile = activeView.file;
  if (!activeFile) {
    new Notice('No active file to process.');
    return;
  }

  const dirsSetting = plugin.settings.zoteroCleanDirectories;
  if (!dirsSetting || dirsSetting.trim().length === 0) {
    new Notice('No Zotero cleanup directories configured in settings.');
    return;
  }

  const directories = dirsSetting
    .split(',')
    .map(d => d.trim())
    .filter(d => d.length > 0)
    .map(d => d.replace(/^\/+|\/+$/g, '')); // remove leading/trailing slashes

  if (directories.length === 0) {
    new Notice('No valid Zotero cleanup directories configured.');
    return;
  }

  const app = plugin.app;
  const activeContent = activeView.editor.getValue();
  const urlRegex = /zotero:\/\/[^\s\)<>"]+/g;

  const activeUrlsMatches = activeContent.match(urlRegex);
  if (!activeUrlsMatches || activeUrlsMatches.length === 0) {
    new Notice('No Zotero URLs found in the active note.');
    return;
  }

  const activeUrls = Array.from(new Set(activeUrlsMatches));

  // Find all markdown files that match the directories, excluding the active file
  const otherFiles = app.vault.getMarkdownFiles().filter(file => {
    if (file.path === activeFile.path) return false;
    return directories.some(dir => file.path === dir || file.path.startsWith(`${dir}/`));
  });

  if (otherFiles.length === 0) {
    new Notice('No other markdown files found in the specified directories.');
    return;
  }

  const existingUrls = new Set<string>();
  const notice = new Notice('Scanning directories for duplicate Zotero annotations...', 0);

  try {
    for (const file of otherFiles) {
      const text = await app.vault.cachedRead(file);
      for (const url of activeUrls) {
        if (!existingUrls.has(url) && text.includes(url)) {
          existingUrls.add(url);
        }
      }
      if (existingUrls.size === activeUrls.length) break;
    }
  } finally {
    notice.hide();
  }

  if (existingUrls.size === 0) {
    new Notice('No duplicate Zotero annotations found.');
    return;
  }

  const lines = activeContent.split('\n');
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  // Group lines into blocks. A new block starts when a line contains '<mark class='
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<mark class=') && currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [];
    }
    currentBlock.push(line);
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const newLines: string[] = [];
  for (const block of blocks) {
    const blockText = block.join('\n');
    let shouldDelete = false;

    const isAnnotationBlock = block.some(l => l.includes('<mark class='));

    if (isAnnotationBlock) {
      for (const url of existingUrls) {
        if (blockText.includes(url)) {
          shouldDelete = true;
          break;
        }
      }
    }

    if (!shouldDelete) {
      newLines.push(...block);
    }
  }

  const newContent = newLines.join('\n');
  if (newContent !== activeContent) {
    activeView.editor.setValue(newContent);
    new Notice(`Removed ${existingUrls.size} duplicate Zotero annotation(s).`);
  } else {
    new Notice('No changes made.');
  }
};
