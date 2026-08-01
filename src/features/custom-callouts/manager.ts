import { Command, Editor } from 'obsidian';
import type LatexReferencer from '../../main';
import { CustomCallout } from '../../settings/settings';

export class CustomCalloutManager {
  private registeredCommandIds: string[] = [];
  private styleEl: HTMLStyleElement | null = null;

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
    console.log('[ObsiTeXcore Custom Callouts] Updating callout styles for:', callouts);
    let cssText = '';

    for (const callout of callouts) {
      const type = callout.type ? callout.type.trim().toLowerCase() : '';
      if (!type) continue;

      const props: string[] = [];

      if (callout.color && callout.color.trim()) {
        const formattedColor = formatColorToRgb(callout.color);
        props.push(`\t--callout-color: ${formattedColor};`);
        props.push(`\tbackground-color: rgba(${formattedColor}, 0.1);`);
        props.push(`\tborder: 1px solid rgba(${formattedColor}, 0.25);`);
      }

      if (callout.icon && callout.icon.trim()) {
        const iconName = callout.icon.trim();
        props.push(`\t--callout-icon: ${iconName};`);
      }

      if (props.length > 0) {
        const baseSelector = `body .callout[data-callout="${type}"],\n.markdown-rendered .callout[data-callout="${type}"],\n.cm-embed-block .callout[data-callout="${type}"]`;
        cssText += `${baseSelector} {\n${props.join('\n')}\n}\n`;

        if (callout.color && callout.color.trim()) {
          const formattedColor = formatColorToRgb(callout.color);
          const titleSelector = `body .callout[data-callout="${type}"] > .callout-title,\n.markdown-rendered .callout[data-callout="${type}"] > .callout-title`;
          const iconSelector = `body .callout[data-callout="${type}"] > .callout-title > .callout-icon,\n.markdown-rendered .callout[data-callout="${type}"] > .callout-title > .callout-icon`;
          cssText += `${titleSelector} {\n\tcolor: rgb(${formattedColor});\n}\n`;
          cssText += `${iconSelector} {\n\tcolor: rgb(${formattedColor});\n}\n`;
        }
        cssText += '\n';
      }
    }

    console.log('[ObsiTeXcore Custom Callouts] Generated CSS:\n' + cssText);

    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'obsitex-custom-callouts';
      document.head.appendChild(this.styleEl);
      console.log(
        '[ObsiTeXcore Custom Callouts] Created new <style id="obsitex-custom-callouts"> in document.head'
      );
    }

    this.styleEl.textContent = cssText;
    console.log('[ObsiTeXcore Custom Callouts] Applied style element textContent successfully.');
  }

  removeStyles() {
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
      console.log('[ObsiTeXcore Custom Callouts] Removed style element from DOM.');
    }
  }

  unregisterCommands() {
    const appCommands = this.plugin.app.commands;
    if (appCommands && typeof appCommands.removeCommand === 'function') {
      for (const cmdId of this.registeredCommandIds) {
        try {
          appCommands.removeCommand(cmdId);
        } catch (e) {
          console.error('[ObsiTeXcore Custom Callouts] Failed to remove command', cmdId, e);
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
    console.log('[ObsiTeXcore Custom Callouts] Registered commands:', this.registeredCommandIds);
  }

  insertCallout(editor: Editor, item: CustomCallout) {
    console.log('[ObsiTeXcore Custom Callouts] Inserting callout:', item);
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
