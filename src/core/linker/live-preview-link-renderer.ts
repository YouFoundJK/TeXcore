import { editorLivePreviewField, renderMath, editorInfoField } from 'obsidian';
import { EditorSelection, EditorState, RangeSetBuilder, Extension, Prec } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  ViewUpdate,
  EditorView,
  ViewPlugin,
  PluginValue,
  WidgetType
} from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { getMathLink } from './helper';
import LatexReferencer from 'main';

/**
 * Check if the given EditorSelection has an overlap with a range.
 */
function selectionAndRangeOverlap(
  selection: EditorSelection,
  rangeFrom: number,
  rangeTo: number
): boolean {
  for (const range of selection.ranges) {
    if (range.from <= rangeTo && range.to >= rangeFrom) {
      return true;
    }
  }
  return false;
}

/**
 * A helper function to render a string with inline math.
 */
function setMathLink(source: string, mathLinkEl: HTMLElement) {
  mathLinkEl.replaceChildren();
  const mathPattern = /\$(?!\s)(.*?)(?<!\s)\$/g;
  let textFrom = 0;
  let result;
  while ((result = mathPattern.exec(source)) !== null) {
    const mathString = result[1];
    const textTo = result.index;
    if (textTo > textFrom) {
      mathLinkEl.appendChild(activeDocument.createTextNode(source.slice(textFrom, textTo)));
    }

    const mathEl = renderMath(mathString, false);
    const mathSpan = mathLinkEl.createSpan({ cls: ['math', 'math-inline', 'is-loaded'] });
    mathSpan.appendChild(mathEl);

    textFrom = mathPattern.lastIndex;
  }

  if (textFrom < source.length) {
    mathLinkEl.appendChild(activeDocument.createTextNode(source.slice(textFrom)));
  }
}

/** Given a LatexReferencer plugin instance, create a CodeMirror6 view plugin that renders equation links. */
export const createLivePreviewLinkRendererPlugin = (plugin: LatexReferencer): Extension => {
  const { app } = plugin;

  class MathWidget extends WidgetType {
    constructor(
      public outLinkText: string,
      public outLinkMathLink: string,
      public sourcePath: string,
      public from: number,
      public to: number
    ) {
      super();
    }

    eq(other: MathWidget) {
      return (
        this.outLinkText === other.outLinkText &&
        this.outLinkMathLink === other.outLinkMathLink &&
        this.sourcePath === other.sourcePath &&
        this.from === other.from &&
        this.to === other.to
      );
    }

    toDOM() {
      const mathLinkEl = createSpan();
      setMathLink(this.outLinkMathLink, mathLinkEl);
      mathLinkEl.addClass('cm-underline');
      mathLinkEl.setAttribute('draggable', 'true');

      const mathLinkWrapper = createSpan();
      mathLinkWrapper.addClass('cm-hmd-internal-link');
      mathLinkWrapper.appendChild(mathLinkEl);

      mathLinkWrapper.onclick = (evt: MouseEvent) => {
        evt.preventDefault();
        void app.workspace.openLinkText(
          this.outLinkText,
          this.sourcePath,
          evt.ctrlKey || evt.metaKey
        );
      };

      mathLinkWrapper.onmousedown = (evt: MouseEvent) => {
        if (evt.button === 1) evt.preventDefault();
      };

      mathLinkWrapper.onauxclick = (evt: MouseEvent) => {
        if (evt.button === 1) {
          void app.workspace.openLinkText(this.outLinkText, this.sourcePath, true);
        }
      };

      return mathLinkWrapper;
    }
  }

  const viewPlugin = ViewPlugin.fromClass(
    class implements PluginValue {
      decorations!: DecorationSet;
      lastFingerprint = '';

      constructor(view: EditorView) {
        this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        let shouldRebuild = update.docChanged || update.viewportChanged;
        if (!shouldRebuild && update.selectionSet) {
          shouldRebuild = this.selectionIntersectsLink(update);
        }
        if (shouldRebuild) {
          this.buildDecorations(update.view);
        }
      }

      selectionIntersectsLink(update: ViewUpdate): boolean {
        const { state, startState } = update;
        const checkSelection = (sel: EditorSelection, st: EditorState) => {
          let intersects = false;
          syntaxTree(st).iterate({
            from: update.view.viewport.from,
            to: update.view.viewport.to,
            enter: node => {
              if (node.name.includes('hmd-internal-link')) {
                const linkText = st.sliceDoc(node.from, node.to);
                if (linkText.includes('#^eq-')) {
                  if (selectionAndRangeOverlap(sel, node.from, node.to)) {
                    intersects = true;
                    return false;
                  }
                }
              }
            }
          });
          return intersects;
        };

        return (
          checkSelection(update.startState.selection, startState) ||
          checkSelection(update.state.selection, state)
        );
      }

      buildDecorations(view: EditorView): void {
        const { state } = view;

        if (!state.field(editorLivePreviewField)) {
          this.decorations = Decoration.none;
          this.lastFingerprint = '';
          return;
        }

        const file = state.field(editorInfoField).file;
        const sourcePath = file?.path ?? '';
        if (!sourcePath) {
          this.decorations = Decoration.none;
          this.lastFingerprint = '';
          return;
        }

        const builder = new RangeSetBuilder<Decoration>();
        const fingerprintParts: string[] = [];

        for (const { from, to } of view.visibleRanges) {
          syntaxTree(state).iterate({
            from,
            to,
            enter: node => {
              if (node.name.includes('hmd-internal-link')) {
                const linkNode = node.node;
                const startNode = linkNode.prevSibling;
                const endNode = linkNode.nextSibling;

                if (
                  startNode?.name.includes('formatting-link-start') &&
                  endNode?.name.includes('formatting-link-end')
                ) {
                  if (selectionAndRangeOverlap(state.selection, linkNode.from, linkNode.to)) {
                    return;
                  }
                  const linkText = state.sliceDoc(linkNode.from, linkNode.to);

                  if (linkText.includes('#^eq-')) {
                    const outLinkMathLink = getMathLink(plugin, linkText, sourcePath);

                    if (outLinkMathLink) {
                      builder.add(
                        linkNode.from,
                        linkNode.to,
                        Decoration.replace({
                          widget: new MathWidget(
                            linkText,
                            outLinkMathLink,
                            sourcePath,
                            linkNode.from,
                            linkNode.to
                          )
                        })
                      );
                      fingerprintParts.push(`${linkNode.from}-${linkNode.to}:${outLinkMathLink}`);
                    }
                  }
                }
              }
            }
          });
        }

        this.decorations = builder.finish();
        const newFingerprint = fingerprintParts.join('|');
        if (this.decorations.size > 0 && newFingerprint !== this.lastFingerprint) {
          this.lastFingerprint = newFingerprint;
        } else if (this.decorations.size === 0) {
          this.lastFingerprint = '';
        }
      }
    },
    { decorations: v => v.decorations }
  );
  return Prec.highest(viewPlugin);
};
