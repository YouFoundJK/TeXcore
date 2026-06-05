import { editorLivePreviewField, finishRenderMath, renderMath, editorInfoField } from 'obsidian';
import { EditorSelection, RangeSetBuilder, Extension, Prec } from '@codemirror/state';
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
  const mathPattern = /\$(.*?[^\s])\$/g;
  let textFrom = 0;
  let result;
  while ((result = mathPattern.exec(source)) !== null) {
    const mathString = result[1];
    const textTo = result.index;
    if (textTo > textFrom) mathLinkEl.createSpan().replaceWith(source.slice(textFrom, textTo));

    const mathEl = renderMath(mathString, false);
    mathLinkEl.createSpan({ cls: ['math', 'math-inline', 'is-loaded'] }).replaceWith(mathEl);

    textFrom = mathPattern.lastIndex;
  }

  if (textFrom < source.length) mathLinkEl.createSpan().replaceWith(source.slice(textFrom));
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

      constructor(view: EditorView) {
        this.buildDecorations(view);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.buildDecorations(update.view);
        }
      }

      buildDecorations(view: EditorView): void {
        const { state } = view;

        if (!state.field(editorLivePreviewField)) {
          this.decorations = Decoration.none;
          return;
        }

        const file = state.field(editorInfoField).file;
        const sourcePath = file?.path ?? '';
        if (!sourcePath) {
          this.decorations = Decoration.none;
          return;
        }

        const builder = new RangeSetBuilder<Decoration>();

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
                  const linkText = state.sliceDoc(linkNode.from, linkNode.to);

                  if (linkText.startsWith('#^eq-')) {
                    const outLinkMathLink = getMathLink(plugin, linkText, sourcePath);

                    if (
                      outLinkMathLink &&
                      !selectionAndRangeOverlap(state.selection, linkNode.from, linkNode.to)
                    ) {
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
                    }
                  }
                }
              }
            }
          });
        }

        this.decorations = builder.finish();
        if (this.decorations.size > 0) {
          const MathJax = (window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } }).MathJax;
          if (MathJax && typeof MathJax.chtmlStylesheet === 'function') {
            void finishRenderMath();
          }
        }
      }
    },
    { decorations: v => v.decorations }
  );
  return Prec.highest(viewPlugin);
};
