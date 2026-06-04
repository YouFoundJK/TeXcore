import { PaneType, SplitDirection, UserEvent, Scope, View, MarkdownFileInfo } from 'obsidian';
import { EditorView } from '@codemirror/view';

declare module 'obsidian' {
  // 1. DEFINE the complete Suggestions interface here
  interface Suggestions<T> {
    selectedItem: number;
    values: T[];
    containerEl: HTMLElement;
    moveUp(event: KeyboardEvent): void;
    moveDown(event: KeyboardEvent): void;
    setSelectedItem(index: number, event: UserEvent | null): void;
  }

  interface Workspace {
    getActiveFileView(): View | null;
    activeEditor?: MarkdownFileInfo | null;
  }

  interface App {
    workspace: Workspace;
    commands: {
      commands: Record<string, unknown>;
      removeCommand(id: string): void;
    };
    plugins: {
      enabledPlugins: Set<string>;
      plugins: {
        [id: string]: unknown;
      };
      getPlugin: (id: string) => Plugin | null;
    };
    internalPlugins: {
      getPluginById(id: string): Plugin & { instance: unknown };
    };
  }
  interface Editor {
    cm?: EditorView;
  }

  interface EditorSuggest<T> {
    scope: Scope;
    // 2. USE the complete interface
    suggestions: Suggestions<T>;
    suggestEl: HTMLElement;
  }

  interface SuggestModal<T> {
    // 3. USE the complete interface here as well
    chooser: Suggestions<T>;
  }
  interface Vault {
    getConfig(key: string): unknown;
  }
  namespace MarkdownRenderer {
    function postProcess(app: App, context: unknown): Promise<void>;
  }
}

export type LeafArgs =
  | [newLeaf?: PaneType | boolean]
  | [newLeaf?: 'split', direction?: SplitDirection];
