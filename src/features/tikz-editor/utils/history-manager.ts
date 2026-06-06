import { type EditorElement } from '../types';

export class HistoryManager {
  private historyStack: EditorElement[][] = [];
  private redoStack: EditorElement[][] = [];

  constructor(private maxDepth = 50) {}

  saveState(elements: EditorElement[]) {
    const currentJSON = JSON.stringify(elements);
    if (this.historyStack.length > 0) {
      const lastJSON = JSON.stringify(this.historyStack[this.historyStack.length - 1]);
      if (currentJSON === lastJSON) return;
    }

    this.historyStack.push(JSON.parse(currentJSON) as EditorElement[]);
    if (this.historyStack.length > this.maxDepth) {
      this.historyStack.shift();
    }
    this.redoStack = [];
  }

  undo(): EditorElement[] | null {
    if (this.historyStack.length > 1) {
      const popped = this.historyStack.pop();
      if (popped !== undefined) {
        this.redoStack.push(popped);
      }
      return JSON.parse(
        JSON.stringify(this.historyStack[this.historyStack.length - 1])
      ) as EditorElement[];
    }
    return null;
  }

  redo(): EditorElement[] | null {
    if (this.redoStack.length > 0) {
      const next = this.redoStack.pop();
      if (next !== undefined) {
        this.historyStack.push(next);
        return JSON.parse(JSON.stringify(next)) as EditorElement[];
      }
    }
    return null;
  }

  canUndo(): boolean {
    return this.historyStack.length > 1;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear() {
    this.historyStack = [];
    this.redoStack = [];
  }
}
