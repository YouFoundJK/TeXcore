import { Extension, Annotation } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

export const DEFAULT_OBSITEX_TEMPLATE = `eq-prefix: A          # Prefix added to equation numbers (e.g., 'A' for (A1), (A2))
eq-continuity: false  # 'false' resets numbering to 1; 'true' continues counting
# supplements:        # Cross-reference target files
#  - [[NoteName]]: S1 # Option 1: Cross-reference with prefix alias (e.g., (S1-A1))
#  - [[NoteName]]     # Option 2: Cross-reference without prefix alias (e.g., (A1))`;

const obsitexTemplateAnnotation = Annotation.define<boolean>();

/**
 * CodeMirror 6 extension that monitors empty ```obsitex``` code blocks and
 * populates them with default keys, values, and inline hints.
 * Strictly avoids modifying blocks that already contain content.
 */
export function createObsitexAutoTemplatePlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      timeout: number | null = null;

      constructor(view: EditorView) {
        this.scheduleCheck(view);
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged &&
          !update.transactions.some(tr => tr.annotation(obsitexTemplateAnnotation))
        ) {
          this.scheduleCheck(update.view);
        }
      }

      scheduleCheck(view: EditorView) {
        if (this.timeout) window.clearTimeout(this.timeout);
        this.timeout = window.setTimeout(() => this.runCheck(view), 200);
      }

      runCheck(view: EditorView) {
        const text = view.state.doc.toString();
        const blockRegex = /```obsitex[ \t]*\r?\n([\s\S]*?)```/g;
        let match: RegExpExecArray | null;
        const changes: { from: number; to: number; insert: string }[] = [];

        while ((match = blockRegex.exec(text)) !== null) {
          const innerContent = match[1];
          // Strictly only populate if inner content is empty (whitespace/newlines only)
          if (innerContent.trim() === '') {
            const firstNewlineIdx = match[0].indexOf('\n');
            const lastBackticksIdx = match[0].lastIndexOf('```');
            if (firstNewlineIdx !== -1 && lastBackticksIdx !== -1) {
              const startInner = match.index + firstNewlineIdx + 1;
              const endInner = match.index + lastBackticksIdx;

              const formattedTemplate = `${DEFAULT_OBSITEX_TEMPLATE}\n`;
              changes.push({
                from: startInner,
                to: endInner,
                insert: formattedTemplate
              });
            }
          }
        }

        if (changes.length > 0) {
          view.dispatch({
            changes,
            annotations: obsitexTemplateAnnotation.of(true)
          });
        }
      }
    }
  );
}
