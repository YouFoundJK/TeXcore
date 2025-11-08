import { PaneType, SplitDirection, UserEvent } from "obsidian";
import { EditorView } from "@codemirror/view";

declare module "obsidian" {
    // 1. DEFINE the complete Suggestions interface here
    interface Suggestions<T> {
        selectedItem: number;
        values: T[];
        containerEl: HTMLElement;
        moveUp(event: KeyboardEvent): void;
        moveDown(event: KeyboardEvent): void;
        setSelectedItem(index: number, event: UserEvent | null): void;
    }

    interface App {
        plugins: {
            enabledPlugins: Set<string>;
            plugins: {
                [id: string]: any;
            };
            getPlugin: (id: string) => Plugin | null;
        };
        internalPlugins: {
            getPluginById(id: string): Plugin & { instance: any };
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
}

export type LeafArgs = [newLeaf?: PaneType | boolean] | [newLeaf?: 'split', direction?: SplitDirection];