import { Command, Editor } from 'obsidian';
import type LatexReferencer from '../../main';
import { CustomCallout } from '../../settings/settings';
import { logDebug, logError } from '../../utils/logger';

export class CustomCalloutManager {
  private registeredCommandIds: string[] = [];

  constructor(private plugin: LatexReferencer) {}

  onLoad() {
    this.updateStyles();
    this.registerCommands();
  }

  onUnload() {
    this.removeStyles();
    this.unregisterCommands();
  }

  updateStyles() {
    const callouts = this.plugin.settings.customCallouts || [];
    logDebug('CustomCallouts', 'Updating callout styles for:', callouts);

    const doc = activeDocument;
    if (!doc || !doc.body) return;

    for (const callout of callouts) {
      const type = callout.type ? callout.type.trim().toLowerCase() : '';
      if (!type) continue;

      if (callout.color && callout.color.trim()) {
        const formattedColor = formatColorToRgb(callout.color);
        doc.body.style.setProperty(`--callout-color-${type}`, formattedColor);
      }
      if (callout.icon && callout.icon.trim()) {
        doc.body.style.setProperty(`--callout-icon-${type}`, callout.icon.trim());
      }
    }
  }

  removeStyles() {
    const doc = activeDocument;
    if (!doc || !doc.body) return;

    const callouts = this.plugin.settings.customCallouts || [];
    for (const callout of callouts) {
      const type = callout.type ? callout.type.trim().toLowerCase() : '';
      if (!type) continue;
      doc.body.style.removeProperty(`--callout-color-${type}`);
      doc.body.style.removeProperty(`--callout-icon-${type}`);
    }
    logDebug(
      'CustomCallouts',
      'Removed custom callout style properties from active document body.'
    );
  }

  unregisterCommands() {
    const appCommands = this.plugin.app.commands;
    if (appCommands && typeof appCommands.removeCommand === 'function') {
      for (const cmdId of this.registeredCommandIds) {
        try {
          appCommands.removeCommand(cmdId);
        } catch (e) {
          logError('CustomCallouts', `Failed to remove command ${cmdId}`, e);
        }
      }
    }
    this.registeredCommandIds = [];
  }

  registerCommands() {
    this.unregisterCommands();

    const callouts = this.plugin.settings.customCallouts || [];
    for (const item of callouts) {
      if (item.registerCommand === false) continue;
      const type = item.type ? item.type.trim().toLowerCase() : '';
      if (!type) continue;

      const displayName = item.title?.trim() || item.type;
      const commandId = `insert-callout-${item.id}`;
      const fullCommandId = `${this.plugin.manifest.id}:${commandId}`;

      const commandConfig: Command = {
        id: commandId,
        name: `Insert callout: ${displayName}`,
        editorCallback: (editor: Editor) => {
          this.insertCallout(editor, item);
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
    logDebug('CustomCallouts', 'Registered commands:', this.registeredCommandIds);
  }

  insertCallout(editor: Editor, item: CustomCallout) {
    logDebug('CustomCallouts', 'Inserting callout:', item);
    const type = item.type ? item.type.trim().toLowerCase() : 'note';
    const title = item.title?.trim() || '';
    const headerLine = title ? `> [!${type}] ${title}` : `> [!${type}]`;

    const selection = editor.getSelection();

    if (selection && selection.length > 0) {
      const selectedLines = selection.split(/\r?\n/);
      const prefixed = selectedLines.map(line => `> ${line}`).join('\n');
      const replacement = `${headerLine}\n${prefixed}`;
      editor.replaceSelection(replacement);
    } else {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const isEmptyLine = lineText.trim() === '';

      const insertText = isEmptyLine ? `${headerLine}\n> ` : `\n${headerLine}\n> `;

      editor.replaceRange(insertText, cursor);

      const targetLine = isEmptyLine ? cursor.line + 1 : cursor.line + 2;
      editor.setCursor({ line: targetLine, ch: 2 });
    }
  }
}

function formatColorToRgb(colorStr: string): string {
  colorStr = colorStr.trim();
  if (!colorStr) return '';
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(c => c + c)
        .join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return `${r}, ${g}, ${b}`;
      }
    }
  }
  return colorStr;
}
