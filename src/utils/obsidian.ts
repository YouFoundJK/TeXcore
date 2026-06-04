import { App, MarkdownView, Modifier, Notice, Platform, Pos, TFile } from 'obsidian';
import { locToEditorPosition } from 'utils/editor';
import { LeafArgs } from '../declarations';

///////////////////
// Markdown view //
///////////////////

export async function openFileAndSelectPosition(
  app: App,
  file: TFile,
  position: Pos,
  ...leafArgs: LeafArgs
) {
  // @ts-ignore
  const leaf = app.workspace.getLeaf(...leafArgs);
  await leaf.openFile(file);
  if (leaf.view instanceof MarkdownView) {
    // Editing view
    const editor = leaf.view.editor;
    const from = locToEditorPosition(position.start);
    const to = locToEditorPosition(position.end);

    editor.setSelection(from, to);
    editor.scrollIntoView({ from, to }, true);

    // Reading view: thank you NothingIsLost (https://discord.com/channels/686053708261228577/840286264964022302/952218718711189554)
    leaf.view.setEphemeralState({ line: position.start.line });
  }
}

////////////
// Others //
////////////

export function getModifierNameInPlatform(mod: Modifier): string {
  if (mod === 'Mod') {
    return Platform.isMacOS || Platform.isIosApp ? '⌘' : 'ctrl';
  }
  if (mod === 'Shift') {
    return 'shift';
  }
  if (mod === 'Alt') {
    return Platform.isMacOS || Platform.isIosApp ? '⌥' : 'alt';
  }
  if (mod === 'Meta') {
    return Platform.isMacOS || Platform.isIosApp ? '⌘' : Platform.isWin ? 'win' : 'meta';
  }
  return 'ctrl';
}

export function generateEqId(length: number = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'eq-';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function showNotice(message: string, duration?: number): Notice {
  const NoticeConstructor = Notice;
  return new NoticeConstructor(message, duration);
}

export function setCssProps(el: HTMLElement, props: Record<string, string>) {
  for (const [key, value] of Object.entries(props)) {
    el.style.setProperty(key, value);
  }
}
