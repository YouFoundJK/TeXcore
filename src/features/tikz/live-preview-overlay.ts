import { Extension, Prec, EditorState } from '@codemirror/state';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { showNotice } from 'utils/obsidian';
import LatexReferencer from '../../main';

interface CleanableDiv extends HTMLDivElement {
  _cleanup?: () => void;
}

function setCssProps(el: HTMLElement, props: Record<string, string>) {
  const style = el.style;
  const setProp = 'setProperty';
  for (const [key, val] of Object.entries(props)) {
    (style as unknown as Record<string, (k: string, v: string) => void>)[setProp](key, val);
  }
}

class TikzLivePreviewOverlay {
  private overlayEl: HTMLDivElement | null = null;
  private containerEl: HTMLDivElement | null = null;
  private currentSource: string = '';
  private debounceTimeout: number | null = null;
  private isDragging = false;
  private startX = 0;
  private startY = 0;
  private startLeft = 0;
  private startTop = 0;

  constructor(
    private view: EditorView,
    private plugin: LatexReferencer
  ) {}

  public updateSource(source: string) {
    this.ensureOverlayCreated();

    if (this.currentSource === source) {
      return;
    }
    this.currentSource = source;

    // Debounce compilation to prevent excessive UI lag/compiles
    if (this.debounceTimeout) {
      window.clearTimeout(this.debounceTimeout);
    }
    this.debounceTimeout = window.setTimeout(() => {
      this.renderTikz();
    }, 300);
  }

  private ensureOverlayCreated() {
    if (this.overlayEl) return;

    const doc = this.view.dom.ownerDocument;
    const body = doc.body;

    this.overlayEl = doc.createElement('div');
    this.overlayEl.classList.add('tikz-live-preview-overlay');

    // CSS Styles for floating overlay
    setCssProps(this.overlayEl, {
      position: 'fixed',
      'z-index': '1000',
      top: '100px',
      right: '50px',
      width: '320px',
      height: '320px',
      'background-color': 'var(--background-primary-alt)',
      border: '1px solid var(--border-color)',
      'border-radius': '8px',
      'box-shadow': '0 4px 12px rgba(0, 0, 0, 0.15)',
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden'
    });

    // Drag Handle / Header Container
    const handleEl = doc.createElement('div');
    handleEl.classList.add('tikz-live-preview-handle');
    setCssProps(handleEl, {
      cursor: 'move',
      padding: '6px 10px',
      'background-color': 'var(--background-secondary-alt)',
      'border-bottom': '1px solid var(--border-color)',
      'font-size': '0.85em',
      'font-weight': 'bold',
      color: 'var(--text-muted)',
      'user-select': 'none',
      display: 'flex',
      'justify-content': 'space-between',
      'align-items': 'center'
    });

    const titleEl = doc.createElement('span');
    titleEl.textContent = 'TikZ live preview';
    handleEl.appendChild(titleEl);

    const exportBtn = doc.createElement('button');
    exportBtn.textContent = 'Export svg';
    setCssProps(exportBtn, {
      padding: '2px 8px',
      'font-size': '0.8em',
      'border-radius': '4px',
      border: '1px solid var(--border-color)',
      'background-color': 'var(--interactive-accent)',
      color: 'var(--text-on-accent)',
      cursor: 'pointer',
      'font-weight': 'bold'
    });

    // Prevent drag events when clicking button
    exportBtn.onmousedown = (e: MouseEvent) => {
      e.stopPropagation();
    };

    exportBtn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      this.exportSvg();
    };

    handleEl.appendChild(exportBtn);
    this.overlayEl.appendChild(handleEl);

    // Container for TikZ render
    this.containerEl = doc.createElement('div');
    this.containerEl.classList.add('tikz-live-preview-container');
    this.containerEl.classList.add('block-language-tikz');
    setCssProps(this.containerEl, {
      flex: '1',
      overflow: 'auto',
      display: 'flex',
      'justify-content': 'center',
      'align-items': 'center',
      padding: '10px',
      'background-color': 'transparent'
    });
    this.overlayEl.appendChild(this.containerEl);

    // Drag functionality
    handleEl.onmousedown = (e: MouseEvent) => {
      if (!this.overlayEl) return;
      this.isDragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startLeft = this.overlayEl.offsetLeft;
      this.startTop = this.overlayEl.offsetTop;
      e.preventDefault();
    };

    const mouseMoveHandler = (e: MouseEvent) => {
      if (!this.isDragging || !this.overlayEl) return;
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;

      let newLeft = this.startLeft + dx;
      let newTop = this.startTop + dy;

      const view = doc.defaultView;
      if (!view) return;
      const maxLeft = view.innerWidth - this.overlayEl.offsetWidth;
      const maxTop = view.innerHeight - this.overlayEl.offsetHeight;

      newLeft = Math.max(0, Math.min(newLeft, maxLeft));
      newTop = Math.max(0, Math.min(newTop, maxTop));

      setCssProps(this.overlayEl, {
        left: `${newLeft}px`,
        top: `${newTop}px`,
        right: 'auto'
      });
    };

    const mouseUpHandler = () => {
      this.isDragging = false;
    };

    doc.addEventListener('mousemove', mouseMoveHandler);
    doc.addEventListener('mouseup', mouseUpHandler);

    // Save reference to clean up event listeners later
    (this.overlayEl as CleanableDiv)._cleanup = () => {
      doc.removeEventListener('mousemove', mouseMoveHandler);
      doc.removeEventListener('mouseup', mouseUpHandler);
    };

    body.appendChild(this.overlayEl);
    this.renderTikz();
  }

  private renderTikz() {
    if (!this.containerEl) return;
    this.containerEl.empty();

    if (!this.currentSource.trim()) {
      return;
    }

    const source = this.currentSource;
    this.containerEl.createEl('div', { text: 'Rendering TikZ diagram...' });

    this.plugin.tikzRenderer
      .render(source)
      .then(svg => {
        if (this.currentSource !== source) return;
        if (this.containerEl) {
          this.containerEl.empty();
          this.containerEl.appendChild(svg);
        }
      })
      .catch((err: unknown) => {
        if (this.currentSource !== source) return;
        if (this.containerEl) {
          this.containerEl.empty();
          const errorEl = this.containerEl.createDiv({ cls: 'tikzjax-error' });
          const msg = err instanceof Error ? err.message : String(err);
          errorEl.textContent = `TikZJax Error: ${msg}`;
        }
      });
  }

  private exportSvg() {
    if (!this.containerEl) return;

    const svgEl = this.containerEl.querySelector('svg');
    if (!svgEl) {
      showNotice('No rendered TikZ svg found to export yet.');
      return;
    }

    const doc = this.view.dom.ownerDocument;

    // Clone the SVG element
    const svgClone = svgEl.cloneNode(true) as SVGElement;

    // Ensure standard XML namespace is present
    if (!svgClone.getAttribute('xmlns')) {
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    // Inline CSS fonts and styles from the document
    const tikzStyle = doc.getElementById('tikzjax-css')?.textContent;
    if (tikzStyle) {
      const styleEl = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.textContent = tikzStyle;
      svgClone.insertBefore(styleEl, svgClone.firstChild);
    }

    // Serialize the SVG to string
    const serializer = new XMLSerializer();
    const svgData = serializer.serializeToString(svgClone);

    // Trigger a browser file download
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);

    const downloadLink = doc.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'tikz_diagram.svg';
    doc.body.appendChild(downloadLink);
    downloadLink.click();
    doc.body.removeChild(downloadLink);

    URL.revokeObjectURL(svgUrl);

    showNotice('TikZ diagram exported as svg successfully.');
  }

  public destroy() {
    if (this.debounceTimeout) {
      window.clearTimeout(this.debounceTimeout);
    }
    if (this.overlayEl) {
      const cleanable = this.overlayEl as CleanableDiv;
      if (typeof cleanable._cleanup === 'function') {
        cleanable._cleanup();
      }
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.containerEl = null;
  }
}

export const createTikzLivePreviewPlugin = (plugin: LatexReferencer): Extension => {
  return Prec.highest(
    ViewPlugin.fromClass(
      class {
        private previewOverlay: TikzLivePreviewOverlay | null = null;

        constructor(private view: EditorView) {}

        update(update: ViewUpdate) {
          if (!plugin.settings.enableTikzjax) {
            this.cleanup();
            return;
          }

          const state = update.state;
          const pos = state.selection.main.head;

          const tikzBlock = this.getTikzBlockAtPos(state, pos);
          if (tikzBlock) {
            if (!this.previewOverlay) {
              this.previewOverlay = new TikzLivePreviewOverlay(this.view, plugin);
            }
            this.previewOverlay.updateSource(tikzBlock.source);
          } else {
            this.cleanup();
          }
        }

        private getTikzBlockAtPos(state: EditorState, pos: number): { source: string } | null {
          try {
            const doc = state.doc;
            const curLine = doc.lineAt(pos).number;

            let isInside = false;
            let blockStartLine = -1;
            let blockEndLine = -1;

            // Scan backwards to find block start
            for (let l = curLine; l >= 1; l--) {
              const text = doc.line(l).text.trim();
              if (text.startsWith('```tikz')) {
                isInside = true;
                blockStartLine = l;
                break;
              } else if (text === '```' && l < curLine) {
                break;
              }
            }

            if (!isInside) return null;

            // Scan forwards to find block end
            for (let l = curLine; l <= doc.lines; l++) {
              const text = doc.line(l).text.trim();
              if (text === '```') {
                blockEndLine = l;
                break;
              } else if (text.startsWith('```tikz') && l > curLine) {
                break;
              }
            }

            if (blockStartLine !== -1 && blockEndLine !== -1) {
              const lines: string[] = [];
              for (let l = blockStartLine + 1; l < blockEndLine; l++) {
                lines.push(doc.line(l).text);
              }
              return { source: lines.join('\n') };
            }
          } catch {
            // Fail silently on line errors
          }
          return null;
        }

        private cleanup() {
          if (this.previewOverlay) {
            this.previewOverlay.destroy();
            this.previewOverlay = null;
          }
        }

        destroy() {
          this.cleanup();
        }
      }
    )
  );
};
