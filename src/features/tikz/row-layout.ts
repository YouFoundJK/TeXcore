import {
  MarkdownPostProcessor,
  MarkdownRenderChild,
  MarkdownRenderer,
  editorLivePreviewField,
  editorInfoField
} from 'obsidian';
import { EditorSelection, RangeSetBuilder, Extension, Prec, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import LatexReferencer from '../../main';

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

function formatWidth(w: string): string {
  w = w.trim();
  if (/^\d+(\.\d+)?$/.test(w)) {
    return `${w}%`;
  }
  return w;
}

function setCssProps(el: HTMLElement, props: Record<string, string>, priority = '') {
  const style = el.style;
  const setProp = 'setProperty';
  for (const [key, val] of Object.entries(props)) {
    (style as unknown as Record<string, (k: string, v: string, p?: string) => void>)[setProp](
      key,
      val,
      priority
    );
  }
}

function splitParagraphAtNodeBoundary(p: HTMLParagraphElement, delimiterNode: Node) {
  const parent = p.parentElement;
  if (!parent) return;

  const newP = activeDocument.createElement('p');
  for (const attr of Array.from(p.attributes)) {
    newP.setAttribute(attr.name, attr.value);
  }

  let nextNode = delimiterNode.nextSibling as Node;
  while (nextNode) {
    const toMove = nextNode;
    nextNode = nextNode.nextSibling as Node;
    newP.appendChild(toMove);
  }

  if (p.nextSibling) {
    parent.insertBefore(newP, p.nextSibling);
  } else {
    parent.appendChild(newP);
  }

  const cleanupBr = (el: HTMLElement) => {
    while (el.firstChild && el.firstChild.nodeName.toLowerCase() === 'br') {
      el.removeChild(el.firstChild);
    }
    while (el.lastChild && el.lastChild.nodeName.toLowerCase() === 'br') {
      el.removeChild(el.lastChild);
    }
  };
  cleanupBr(p);
  cleanupBr(newP);
}

function preprocessContainerRows(container: HTMLElement) {
  let mutated = true;
  while (mutated) {
    mutated = false;
    const paragraphs = Array.from(container.querySelectorAll('p'));

    for (const p of paragraphs) {
      if (!p.parentElement) continue;

      const childNodes = Array.from(p.childNodes);
      for (let i = 0; i < childNodes.length; i++) {
        const node = childNodes[i];
        if (node.nodeType !== Node.TEXT_NODE) continue;

        const text = node.textContent || '';
        const lines = text.split('\n');
        let offset = 0;

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx].trim();
          const isStart = line.startsWith(';;;row');
          const isDelimiter = line === ';;';
          const isClose = line === ';;;';

          if (isStart || isDelimiter || isClose) {
            const lineStartIdx = text.indexOf(line, offset);
            if (lineStartIdx !== -1) {
              const textNode = node as Text;

              // Split after the delimiter line first
              const delimEndIdx = lineStartIdx + line.length;
              if (delimEndIdx < text.length) {
                textNode.splitText(delimEndIdx);
              }

              // Split before the delimiter line
              let delimNode: Node = textNode;
              if (lineStartIdx > 0) {
                delimNode = textNode.splitText(lineStartIdx);
              }

              // Split the paragraph before the delimiter node if it's not the first child
              if (delimNode.previousSibling) {
                const newP = activeDocument.createElement('p');
                for (const attr of Array.from(p.attributes)) {
                  newP.setAttribute(attr.name, attr.value);
                }

                let curr = delimNode;
                while (curr) {
                  const next = curr.nextSibling;
                  newP.appendChild(curr);
                  curr = next as Node;
                }

                if (p.nextSibling) {
                  p.parentElement.insertBefore(newP, p.nextSibling);
                } else {
                  p.parentElement.appendChild(newP);
                }

                const cleanupBr = (el: HTMLElement) => {
                  while (el.firstChild && el.firstChild.nodeName.toLowerCase() === 'br') {
                    el.removeChild(el.firstChild);
                  }
                  while (el.lastChild && el.lastChild.nodeName.toLowerCase() === 'br') {
                    el.removeChild(el.lastChild);
                  }
                };
                cleanupBr(p);
                cleanupBr(newP);

                mutated = true;
                break;
              }

              // Split the paragraph after the delimiter node if there are subsequent siblings
              if (delimNode.nextSibling) {
                splitParagraphAtNodeBoundary(p, delimNode);
                mutated = true;
                break;
              }
            }
          }
          offset += lines[lineIdx].length + 1;
        }
        if (mutated) break;
      }
      if (mutated) break;
    }
  }
}

function tightenColumn(colEl: HTMLElement, colIdx: number, numColumns: number) {
  let align = 'center';
  if (numColumns > 1) {
    if (colIdx === 0) {
      align = 'right';
    } else if (colIdx === numColumns - 1) {
      align = 'left';
    }
  }

  const colAlignItems = align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center';
  const childJustifyContent =
    align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center';
  const childTextAlign = align;

  setCssProps(
    colEl,
    {
      'margin-top': '0',
      'margin-bottom': '0',
      'padding-top': '0',
      'padding-bottom': '0',
      display: 'flex',
      'flex-direction': 'column',
      'justify-content': 'center',
      'align-items': colAlignItems
    },
    'important'
  );

  const selectors =
    'p, .math, .math-block, pre, code, .block-language-tikz, mjx-container, svg, .cm-embed-block';
  colEl.querySelectorAll(selectors).forEach((item: Element) => {
    const el = item as HTMLElement;
    setCssProps(
      el,
      {
        'margin-top': '0',
        'margin-bottom': '0',
        'padding-top': '0',
        'padding-bottom': '0',
        'line-height': 'normal'
      },
      'important'
    );

    const tag = el.tagName.toLowerCase();
    if (
      tag === 'p' ||
      tag === 'pre' ||
      tag === 'code' ||
      el.classList.contains('math-block') ||
      el.classList.contains('math') ||
      el.classList.contains('block-language-tikz') ||
      el.classList.contains('cm-embed-block')
    ) {
      const displayType =
        (el.classList.contains('math') && !el.classList.contains('math-block')) || tag === 'code'
          ? 'inline-flex'
          : 'flex';

      setCssProps(
        el,
        {
          display: displayType,
          'align-items': 'center',
          'justify-content': childJustifyContent,
          'text-align': childTextAlign,
          'vertical-align': 'middle'
        },
        'important'
      );
    } else if (tag === 'svg' || tag === 'mjx-container') {
      setCssProps(
        el,
        {
          'vertical-align': 'middle'
        },
        'important'
      );
    }
  });
}

function getColumnNaturalWidth(colEl: HTMLElement): number {
  let maxWidth = 0;

  // Find all content containers
  const elements = colEl.querySelectorAll(
    'p, mjx-container, svg, img, pre, code, .math, .math-block'
  );
  elements.forEach((el: Element) => {
    const htmlEl = el as HTMLElement;
    let w = htmlEl.getBoundingClientRect().width;
    const scrollW = htmlEl.scrollWidth;
    if (scrollW > w) {
      w = scrollW;
    }
    maxWidth = Math.max(maxWidth, w);
  });

  // Fallback if elements are not yet fully measured or are empty
  if (maxWidth === 0) {
    const textLength = colEl.textContent?.trim().length || 0;
    maxWidth = Math.max(textLength * 8, 50); // Estimate ~8px per character
  }

  return maxWidth;
}

function updateRowLayout(rowEl: HTMLElement, columns: HTMLElement[], customWidths: string[]) {
  const numColumns = columns.length;
  const gridTracks: string[] = [];

  if (customWidths.length > 0) {
    // Use user-defined widths
    for (let colIdx = 0; colIdx < numColumns; colIdx++) {
      gridTracks.push(colIdx < customWidths.length ? customWidths[colIdx] : '1fr');
    }
  } else {
    // Auto-calculate proportional widths
    const naturalWidths = columns.map(col => getColumnNaturalWidth(col));
    const totalNaturalWidth = naturalWidths.reduce((sum, w) => sum + w, 0) || 1;

    columns.forEach((_, colIdx) => {
      const percentage = (naturalWidths[colIdx] / totalNaturalWidth) * 100;
      gridTracks.push(`${percentage}%`);
    });
  }

  setCssProps(rowEl, {
    'grid-template-columns': gridTracks.join(' ')
  });
}

// ==========================================
// 1. Reading View & PDF Export Post-Processor
// ==========================================
export const createRowLayoutProcessor = (plugin: LatexReferencer): MarkdownPostProcessor => {
  return (el, ctx) => {
    // Find the main container (e.g. .markdown-preview-view or .markdown-preview-section)
    let cont: HTMLElement | null = el.parentElement;
    while (
      cont &&
      !cont.classList.contains('markdown-preview-view') &&
      !cont.classList.contains('markdown-rendered') &&
      !cont.classList.contains('markdown-preview-section')
    ) {
      cont = cont.parentElement;
    }
    if (!cont) {
      cont = el;
    }

    // Split merged paragraphs to isolate delimiters into standalone blocks
    preprocessContainerRows(cont);

    // Find all target paragraphs inside el that start with ;;;row
    const targetParagraphs: HTMLElement[] = [];
    if (el.tagName.toLowerCase() === 'p' && el.textContent?.trim().startsWith(';;;row')) {
      targetParagraphs.push(el);
    } else {
      el.querySelectorAll('p').forEach(p => {
        if (p.textContent?.trim().startsWith(';;;row')) {
          targetParagraphs.push(p);
        }
      });
    }

    if (targetParagraphs.length === 0) return;

    targetParagraphs.forEach(startP => {
      const text = startP.textContent?.trim() || '';

      // Defer DOM operations slightly to ensure siblings are attached
      window.setTimeout(() => {
        const parent = startP.parentElement;
        if (!parent) return;

        if (startP.dataset.rowProcessed === 'true') return;

        // Find the main container (e.g. .markdown-preview-view or .markdown-preview-section)
        let container: HTMLElement | null = startP.parentElement;
        while (
          container &&
          !container.classList.contains('markdown-preview-view') &&
          !container.classList.contains('markdown-rendered') &&
          !container.classList.contains('markdown-preview-section')
        ) {
          container = container.parentElement;
        }
        if (!container) {
          container = startP.parentElement;
        }

        // Find topBlock (direct child of the container)
        let topBlock: HTMLElement | null = startP;
        while (topBlock && topBlock.parentElement !== container) {
          topBlock = topBlock.parentElement;
        }
        if (!topBlock) return;

        const getBlockContent = (block: HTMLElement): HTMLElement => {
          if (
            block.tagName.toLowerCase() === 'div' &&
            block.children.length === 1 &&
            !block.className
          ) {
            return block.firstElementChild as HTMLElement;
          }
          return block;
        };

        // Traverse next siblings of topBlock under container
        const columnsElements: HTMLElement[][] = [[]];
        const delimitersToRemove: HTMLElement[] = [];
        let closingElement: HTMLElement | null = null;
        let foundEnd = false;

        let sibBlock = topBlock.nextElementSibling as HTMLElement | null;

        while (sibBlock) {
          const contentEl = getBlockContent(sibBlock);
          const textVal = contentEl.textContent?.trim() || '';
          const isDelimiter = contentEl.tagName.toLowerCase() === 'p' && textVal === ';;';
          const isClose = contentEl.tagName.toLowerCase() === 'p' && textVal === ';;;';

          if (isDelimiter) {
            delimitersToRemove.push(sibBlock);
            columnsElements.push([]);
          } else if (isClose) {
            closingElement = sibBlock;
            foundEnd = true;
            break;
          } else {
            columnsElements[columnsElements.length - 1].push(sibBlock);
          }
          sibBlock = sibBlock.nextElementSibling as HTMLElement | null;
        }

        if (!foundEnd) return;

        startP.dataset.rowProcessed = 'true';

        // Parse widths from the start line
        const widthsPart = text.substring(';;;row'.length).trim().replace(/^:/, '').trim();
        let widths: string[] = [];
        if (widthsPart) {
          widths = widthsPart
            .split(/\s*\|\s*|\s*,\s*|\s+/)
            .map(w => w.trim())
            .filter(w => w)
            .map(formatWidth);
        }

        const numColumns = columnsElements.length;
        const rowEl = activeDocument.createElement('div');
        rowEl.classList.add('latex-referencer-row');
        setCssProps(rowEl, {
          display: 'grid',
          gap: '1.5rem',
          width: '100%',
          'align-items': 'center',
          margin: '-0.5em 0'
        });

        const columns: HTMLElement[] = [];

        columnsElements.forEach((colEls, colIdx) => {
          const colEl = rowEl.createEl('div', { cls: 'latex-referencer-column' });
          setCssProps(colEl, {
            display: 'flex',
            'flex-direction': 'column',
            'justify-content': 'center',
            'min-width': '0'
          });

          // Move existing elements into the column
          colEls.forEach(item => colEl.appendChild(item));
          columns.push(colEl);
        });

        const refresh = () => {
          columns.forEach((colEl, colIdx) => tightenColumn(colEl, colIdx, numColumns));
          updateRowLayout(rowEl, columns, widths);
        };

        refresh();
        window.setTimeout(refresh, 50);
        window.setTimeout(refresh, 150);
        window.setTimeout(refresh, 500);

        // Replace start element and remove all old intermediate DOM nodes
        if (topBlock.parentElement) {
          topBlock.parentElement.replaceChild(rowEl, topBlock);
        }

        delimitersToRemove.forEach(sib => sib.remove());
        if (closingElement) closingElement.remove();
      }, 0);
    });
  };
};

// ==========================================
// 2. Live Preview CodeMirror 6 Extension
// ==========================================
class RowLayoutWidget extends WidgetType {
  private components: MarkdownRenderChild[] = [];

  constructor(
    public plugin: LatexReferencer,
    public sourcePath: string,
    public widths: string[],
    public columnsMarkdown: string[],
    public startPos: number
  ) {
    super();
  }

  eq(other: RowLayoutWidget) {
    return (
      this.widths.join('|') === other.widths.join('|') &&
      this.columnsMarkdown.join('---') === other.columnsMarkdown.join('---') &&
      this.sourcePath === other.sourcePath
    );
  }

  toDOM() {
    const rowEl = activeDocument.createElement('div');
    rowEl.classList.add('latex-referencer-row');
    setCssProps(rowEl, {
      display: 'grid',
      gap: '1.5rem',
      width: '100%',
      'align-items': 'center',
      margin: '-0.5em 0'
    });

    const numColumns = this.columnsMarkdown.length;
    const columns: HTMLElement[] = [];

    this.columnsMarkdown.forEach((colMarkdown, colIdx) => {
      const colEl = rowEl.createEl('div', { cls: 'latex-referencer-column' });
      setCssProps(colEl, {
        display: 'flex',
        'flex-direction': 'column',
        'justify-content': 'center',
        'min-width': '0'
      });
      columns.push(colEl);

      // Render Markdown asynchronously inside the editor column
      const comp = new MarkdownRenderChild(colEl);
      comp.load();
      this.components.push(comp);
      MarkdownRenderer.render(this.plugin.app, colMarkdown, colEl, this.sourcePath, comp)
        .then(() => {
          refresh();
        })
        .catch(err =>
          console.error('Latex Referencer: Failed to render Live Preview column markdown', err)
        );
    });

    const refresh = () => {
      columns.forEach((colEl, colIdx) => tightenColumn(colEl, colIdx, numColumns));
      updateRowLayout(rowEl, columns, this.widths);
    };

    refresh();
    window.setTimeout(refresh, 50);
    window.setTimeout(refresh, 150);
    window.setTimeout(refresh, 500);

    // Resolve editing flow: move selection inside the block when clicked
    rowEl.onclick = (evt: MouseEvent) => {
      try {
        const view = EditorView.findFromDOM(rowEl);
        if (view) {
          evt.preventDefault();
          evt.stopPropagation();
          const pos = view.posAtDOM(rowEl);
          view.dispatch({
            selection: { anchor: pos },
            scrollIntoView: true
          });
          view.focus();
        }
      } catch (err) {
        console.error('Latex Referencer: Failed to focus editor on widget click', err);
      }
    };

    return rowEl;
  }

  destroy(dom: HTMLElement) {
    this.components.forEach(comp => comp.unload());
    this.components = [];
  }
}

let layoutField: StateField<DecorationSet> | null = null;
let activePlugin: LatexReferencer | null = null;

function getLayoutField(plugin: LatexReferencer): StateField<DecorationSet> {
  activePlugin = plugin;
  if (!layoutField) {
    layoutField = StateField.define<DecorationSet>({
      create() {
        return Decoration.none;
      },
      update(decorations, tr) {
        // Re-evaluate whenever the document contents or selections change
        if (!tr.docChanged && !tr.selection) {
          return decorations;
        }

        const { state } = tr;

        const livePreview = state.field(editorLivePreviewField, false);
        if (!livePreview) {
          return Decoration.none;
        }

        const info = state.field(editorInfoField, false);
        const file = info?.file;
        const sourcePath = file?.path ?? '';
        if (!sourcePath) {
          return Decoration.none;
        }

        const builder = new RangeSetBuilder<Decoration>();
        const docText = state.doc.toString();
        const lines = docText.split(/\r?\n/);

        let inRow = false;
        let startPos = -1;
        let startLineIdx = -1;
        let widths: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!inRow) {
            if (line.startsWith(';;;row')) {
              inRow = true;
              startLineIdx = i;
              startPos = state.doc.line(i + 1).from;

              const widthsPart = line.substring(';;;row'.length).trim().replace(/^:/, '').trim();
              if (widthsPart) {
                widths = widthsPart
                  .split(/\s*\|\s*|\s*,\s*|\s+/)
                  .map(w => w.trim())
                  .filter(w => w)
                  .map(formatWidth);
              } else {
                widths = [];
              }
            }
          } else {
            if (line === ';;;') {
              inRow = false;
              const endPos = state.doc.line(i + 1).to;

              // Decorate if cursor selection is completely outside this block
              if (!selectionAndRangeOverlap(state.selection, startPos, endPos)) {
                const columnsMarkdown: string[] = [];
                const rowLines = lines.slice(startLineIdx + 1, i);
                let currentColLines: string[] = [];

                for (let rIdx = 0; rIdx < rowLines.length; rIdx++) {
                  const rLine = rowLines[rIdx];
                  if (rLine.trim() === ';;') {
                    columnsMarkdown.push(currentColLines.join('\n'));
                    currentColLines = [];
                  } else {
                    currentColLines.push(rLine);
                  }
                }
                columnsMarkdown.push(currentColLines.join('\n'));

                builder.add(
                  startPos,
                  endPos,
                  Decoration.replace({
                    widget: new RowLayoutWidget(
                      activePlugin!,
                      sourcePath,
                      widths,
                      columnsMarkdown,
                      startPos
                    ),
                    block: true
                  })
                );
              }
            }
          }
        }

        return builder.finish();
      },
      provide(field) {
        return EditorView.decorations.from(field);
      }
    });
  }
  return layoutField;
}

export const createLivePreviewRowLayoutPlugin = (plugin: LatexReferencer): Extension => {
  return Prec.highest(getLayoutField(plugin));
};
