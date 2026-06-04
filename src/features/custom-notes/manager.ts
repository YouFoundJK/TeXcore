import { Notice, TFile } from 'obsidian';
import type LatexReferencer from '../../main';

export class CustomNoteManager {
  private registeredCommandIds: string[] = [];

  constructor(private plugin: LatexReferencer) {}

  onLoad() {
    this.registerCommands();
  }

  registerCommands() {
    // 1. Unregister all previously registered commands
    const appCommands = (this.plugin.app as any).commands;
    if (appCommands && typeof appCommands.removeCommand === 'function') {
      for (const cmdId of this.registeredCommandIds) {
        try {
          appCommands.removeCommand(cmdId);
        } catch (e) {
          console.error('Failed to remove custom note command', cmdId, e);
        }
      }
    }
    this.registeredCommandIds = [];

    // 2. Register new commands
    const customNotes = this.plugin.settings.customNoteHotkeys || [];
    for (const item of customNotes) {
      if (!item.notePath) continue;

      const displayName =
        item.name || item.notePath.split('/').pop()?.replace(/\.md$/, '') || item.notePath;
      const commandId = `open-custom-note-${item.id}`;
      const fullCommandId = `${this.plugin.manifest.id}:${commandId}`;

      const commandConfig: any = {
        id: commandId,
        name: `Open custom note: ${displayName}`,
        callback: () => {
          this.openCustomNote(item.notePath);
        }
      };

      if (item.hotkeyKey && item.hotkeyKey.trim()) {
        commandConfig.hotkeys = [
          {
            modifiers: item.hotkeyModifiers || [],
            key: item.hotkeyKey.trim()
          }
        ];
      }

      this.plugin.addCommand(commandConfig);
      this.registeredCommandIds.push(fullCommandId);
    }
  }

  async openCustomNote(notePath: string) {
    let file = this.plugin.app.vault.getAbstractFileByPath(notePath);
    if (!file && !notePath.endsWith('.md')) {
      file = this.plugin.app.vault.getAbstractFileByPath(`${notePath}.md`);
    }

    if (file instanceof TFile) {
      const leaf = this.plugin.app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    } else {
      new Notice(
        `Custom note not found at path: ${notePath}. Please verify your configuration in settings.`
      );
    }
  }
}
