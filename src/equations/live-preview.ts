import { Extension } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { editorInfoField } from 'obsidian';
import { RangeSetBuilder } from '@codemirror/state';
import LatexReferencer from 'main';
import { processActiveNoteEquations } from './numbering';
import { EquationBlock } from 'types';

export function createEquationNumberPlugin(plugin: LatexReferencer): Extension {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;
            
            constructor(view: EditorView) {
                this.decorations = this.buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            buildDecorations(view: EditorView): DecorationSet {
                const builder = new RangeSetBuilder<Decoration>();
                const file = view.state.field(editorInfoField).file;

                if (!file) return builder.finish();

                const content = view.state.doc.toString();
                const equations = processActiveNoteEquations(plugin, file, content);

                for (const eq of equations.values()) {
                    if (eq.$printName) {
                        const pos = eq.$pos.end.offset;
                        const widget = new EquationNumberWidget(eq);
                        builder.add(pos, pos, Decoration.widget({ widget, side: 1 }));
                    }
                }
                
                return builder.finish();
            }
        },
        {
            decorations: (v) => v.decorations,
        }
    );
}

class EquationNumberWidget extends WidgetType {
    constructor(public equation: EquationBlock) {
        super();
    }

    eq(other: EquationNumberWidget) {
        return this.equation.$printName === other.equation.$printName;
    }

    toDOM() {
        return createSpan({
            cls: "math-booster-equation-number",
            text: this.equation.$printName || '',
        });
    }
}