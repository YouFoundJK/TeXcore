import { Command, Editor } from 'obsidian';
import type LatexReferencer from '../../main';
import { CustomCallout } from '../../settings/settings';
import { logDebug, logWarn, logError } from '../../utils/logger';

export class CustomCalloutManager {
  private registeredCommandIds: string[] = [];

  constructor(private plugin: LatexReferencer) {}

  onLoad() {
    this.updateStyles();
    this.registerCommands();

    if (this.plugin?.app?.workspace) {
      this.plugin.registerEvent(
        this.plugin.app.workspace.on('layout-change', () => {
          logDebug('CustomCallouts', 'Workspace layout change detected, updating callout styles.');
          this.updateStyles();
        })
      );
      this.plugin.registerEvent(
        this.plugin.app.workspace.on('active-leaf-change', () => {
          logDebug('CustomCallouts', 'Active leaf change detected, updating callout styles.');
          this.updateStyles();
        })
      );
    }
  }

  onUnload() {
    this.removeStyles();
    this.unregisterCommands();
  }

  private getDocuments(): Document[] {
    const docs: Document[] = [];
    if (typeof activeDocument !== 'undefined' && activeDocument) {
      docs.push(activeDocument);
    }
    if (typeof document !== 'undefined' && !docs.includes(document)) {
      docs.push(document);
    }
    if (this.plugin?.app?.workspace) {
      try {
        this.plugin.app.workspace.iterateAllLeaves(leaf => {
          const doc = leaf.view?.containerEl?.ownerDocument;
          if (doc && !docs.includes(doc)) {
            docs.push(doc);
          }
        });
      } catch (e) {
        logWarn('CustomCallouts', 'Error iterating workspace leaves for document contexts:', e);
      }
    }
    return docs;
  }

  updateStyles() {
    const callouts = this.plugin.settings.customCallouts || [];
    const docs = this.getDocuments();

    logDebug(
      'CustomCallouts',
      `Updating callout styles across ${docs.length} document context(s).`,
      {
        calloutsCount: callouts.length,
        callouts: callouts.map(c => ({
          id: c.id,
          type: c.type,
          rawColor: c.color,
          formattedColor: formatColorToRgb(c.color),
          icon: c.icon
        }))
      }
    );

    if (docs.length === 0) {
      logWarn('CustomCallouts', 'No valid document context found to apply custom callout styles.');
      return;
    }

    // Build the dynamic CSS content
    let css = '';
    for (const callout of callouts) {
      const type = callout.type ? callout.type.trim().toLowerCase() : '';
      if (!type) continue;

      const formattedColor = callout.color ? formatColorToRgb(callout.color) : '';
      const icon = callout.icon ? callout.icon.trim() : '';

      const declarations: string[] = [];
      if (formattedColor) {
        declarations.push(`  --callout-color: ${formattedColor};`);
        declarations.push(`  border: 1px solid rgba(${formattedColor}, 0.35);`);
        declarations.push(`  background-color: rgba(${formattedColor}, 0.08);`);
      }
      if (icon) {
        declarations.push(`  --callout-icon: ${icon};`);
      }

      if (declarations.length > 0) {
        const selectors = [
          `body .callout[data-callout="${type}"]`,
          `.markdown-rendered .callout[data-callout="${type}"]`,
          `.cm-callout[data-callout="${type}"]`,
          `.cm-embed-block .callout[data-callout="${type}"]`,
          `.callout[data-callout="${type}"]`
        ];
        css += `${selectors.join(',\n')} {\n${declarations.join('\n')}\n}\n\n`;

        if (formattedColor) {
          const titleSelectors = [
            `body .callout[data-callout="${type}"] .callout-title`,
            `.markdown-rendered .callout[data-callout="${type}"] .callout-title`,
            `.cm-callout[data-callout="${type}"] .callout-title`,
            `.callout[data-callout="${type}"] .callout-title`,
            `body .callout[data-callout="${type}"] .callout-icon`,
            `.markdown-rendered .callout[data-callout="${type}"] .callout-icon`,
            `.cm-callout[data-callout="${type}"] .callout-icon`,
            `.callout[data-callout="${type}"] .callout-icon`
          ];
          css += `${titleSelectors.join(',\n')} {\n  color: rgb(${formattedColor});\n}\n\n`;
        }
      }
    }

    const styleId = 'obsitexcore-custom-callouts';

    for (const doc of docs) {
      if (doc.body) {
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

      if (!doc.head) {
        logWarn('CustomCallouts', 'Document head is missing in target document context.');
        continue;
      }

      let styleEl = doc.getElementById(styleId) as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = doc.createElement('style');
        styleEl.id = styleId;
        doc.head.appendChild(styleEl);
        logDebug('CustomCallouts', `Created <style id="${styleId}"> element in document head.`);
      }

      styleEl.textContent = css;
    }

    logDebug('CustomCallouts', `Successfully applied CSS rules into <style id="${styleId}">`, {
      css
    });
  }

  removeStyles() {
    const docs = this.getDocuments();
    const styleId = 'obsitexcore-custom-callouts';

    for (const doc of docs) {
      if (doc.body) {
        const callouts = this.plugin.settings.customCallouts || [];
        for (const callout of callouts) {
          const type = callout.type ? callout.type.trim().toLowerCase() : '';
          if (!type) continue;
          doc.body.style.removeProperty(`--callout-color-${type}`);
          doc.body.style.removeProperty(`--callout-icon-${type}`);
        }
      }

      const styleEl = doc.getElementById(styleId);
      if (styleEl) {
        styleEl.remove();
      }
    }

    logDebug(
      'CustomCallouts',
      `Removed custom callout style properties from ${docs.length} document context(s).`
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

export function formatColorToRgb(colorStr: string): string {
  colorStr = colorStr.trim();
  if (!colorStr) return '';

  const rgbMatch = colorStr.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return `${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}`;
  }

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
