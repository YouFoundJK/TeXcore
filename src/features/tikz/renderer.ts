import { showNotice } from 'utils/obsidian';
import LatexReferencer from '../../main';
import { TikzJaxLoader } from './tikzjax/loader';

export class TikzRenderer {
  private loader: TikzJaxLoader;
  private tikzjaxCss: string = '';
  public isLoaded: boolean = false;

  private renderCache = new Map<string, string>();

  constructor(public plugin: LatexReferencer) {
    this.loader = new TikzJaxLoader(this.plugin);
  }

  public clearCache() {
    this.renderCache.clear();
  }

  async onLoad() {
    if (!this.plugin.settings.enableTikzjax) {
      return;
    }

    try {
      // Inject styling for main window and pop-outs
      this.plugin.app.workspace.onLayoutReady(() => {
        this.injectCssAllWindows();
        this.plugin.registerEvent(
          this.plugin.app.workspace.on('window-open', (win, window) => {
            this.injectCss(window.document);
          })
        );
      });

      this.registerCodeBlockProcessor();
      this.isLoaded = true;
    } catch (error) {
      console.error('Latex Referencer: Failed to initialize TikZJax rendering', error);
      showNotice('Failed to initialize TikZJax diagram rendering.');
    }
  }

  onUnload() {
    if (!this.isLoaded) return;
    this.removeCssAllWindows();
  }

  public async render(source: string): Promise<SVGElement> {
    const code = this.tidyTikzSource(source);
    this.renderCache.delete(code);

    // Lazy-load tikzjax.css if not loaded yet
    if (!this.tikzjaxCss) {
      const adapter = this.plugin.app.vault.adapter;
      const pluginDir = this.plugin.manifest.dir;
      if (pluginDir) {
        const cssPath = `${pluginDir}/tikzjax-assets/tikzjax.css`;
        if (await adapter.exists(cssPath)) {
          this.tikzjaxCss = await adapter.read(cssPath);
        } else {
          const cssData = await this.loader.loadAssetString('tikzjax.css');
          if (cssData) {
            this.tikzjaxCss = cssData;
          }
        }

        if (this.tikzjaxCss) {
          this.injectCssAllWindows();
        }
      }
    }

    const svg = await this.loader.render(code);
    this.postProcessSvg(svg);

    // Save outerHTML of post-processed SVG to cache
    this.renderCache.set(code, svg.outerHTML);

    return svg;
  }

  private injectCss(doc: Document) {
    if (doc.getElementById('tikzjax-css')) return;

    // Inject core TikZJax styles (math glyph font-faces)
    if (this.tikzjaxCss) {
      const style = doc.createElement('style');
      style.id = 'tikzjax-css';
      style.textContent = this.tikzjaxCss;
      doc.head.appendChild(style);
    }

    // Inject note theme integration styles
    if (!doc.getElementById('tikzjax-custom-styles')) {
      const customStyle = doc.createElement('style');
      customStyle.id = 'tikzjax-custom-styles';
      customStyle.textContent = `
        .block-language-tikz {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 0;
          margin: 0.3em 0;
          overflow-x: auto;
          background-color: transparent;
        }
        .block-language-tikz svg {
          max-width: 100%;
          height: auto;
          color: var(--text-normal);
        }
        .block-language-tikz .tikzjax-error {
          color: var(--text-error);
          font-family: var(--font-monospace);
          font-size: 0.9em;
          padding: 1rem;
        }
      `;
      doc.head.appendChild(customStyle);
    }
  }

  private removeCss(doc: Document) {
    doc.getElementById('tikzjax-css')?.remove();
    doc.getElementById('tikzjax-custom-styles')?.remove();
  }

  private injectCssAllWindows() {
    for (const win of this.getAllWindows()) {
      this.injectCss(win.document);
    }
  }

  private removeCssAllWindows() {
    for (const win of this.getAllWindows()) {
      this.removeCss(win.document);
    }
  }

  private getAllWindows(): Window[] {
    const windows: Window[] = [];
    if (typeof window !== 'undefined') {
      windows.push(window);
    }

    // Retrieve floating pop-out windows
    const workspace = this.plugin.app.workspace as unknown as {
      floatingSplit?: {
        children: {
          view?: {
            containerEl?: {
              win?: Window;
            };
          };
        }[];
      };
    };
    const floatingSplit = workspace.floatingSplit;
    if (floatingSplit && floatingSplit.children) {
      for (const child of floatingSplit.children) {
        const win = child.view?.containerEl?.win;
        if (win && !windows.includes(win)) {
          windows.push(win);
        }
      }
    }
    return windows;
  }

  private postProcessSvg(svg: SVGElement) {
    if (!this.plugin.settings.invertColorsInDarkMode) return;

    // Ensure text and lines adapt cleanly to light/dark themes
    const elements = svg.querySelectorAll('[stroke], [fill]');
    elements.forEach(el => {
      const stroke = el.getAttribute('stroke');
      if (stroke === 'black' || stroke === '#000' || stroke === '#000000') {
        el.setAttribute('stroke', 'currentColor');
      }

      const fill = el.getAttribute('fill');
      if (fill === 'black' || fill === '#000' || fill === '#000000') {
        el.setAttribute('fill', 'currentColor');
      }
    });
  }

  private tidyTikzSource(tikzSource: string): string {
    // Remove non-breaking space characters which cause parsing errors
    tikzSource = tikzSource.replaceAll('&nbsp;', '');

    let lines = tikzSource.split('\n');
    // Trim whitespace and remove empty lines
    lines = lines.map(line => line.trim()).filter(line => line);

    let cleaned = lines.join('\n');
    const needsArrowsMeta =
      (cleaned.includes('Triangle') ||
        cleaned.includes('stealth') ||
        cleaned.includes('-{') ||
        cleaned.includes('}->')) &&
      !cleaned.includes('arrows.meta');

    if (needsArrowsMeta) {
      cleaned = `\\usetikzlibrary{arrows.meta}\n${cleaned}`;
    }

    return cleaned;
  }

  private registerCodeBlockProcessor() {
    this.plugin.registerMarkdownCodeBlockProcessor('tikz', (source, el, ctx) => {
      el.empty();

      if (!this.plugin.settings.enableTikzjax) {
        const pre = el.createEl('pre');
        const code = pre.createEl('code');
        code.textContent = source;
        return;
      }

      const container = el.createDiv({ cls: 'block-language-tikz' });
      container.createEl('div', { text: 'Rendering TikZ diagram...' });

      const promise = this.render(source)
        .then(svg => {
          container.empty();
          container.appendChild(svg);
        })
        .catch((err: unknown) => {
          container.empty();
          const errorEl = container.createDiv({ cls: 'tikzjax-error' });
          const msg = err instanceof Error ? err.message : String(err);
          errorEl.textContent = `TikZJax Error: ${msg}`;
        });

      const postCtx = ctx as typeof ctx & { promises?: Promise<unknown>[] };
      if (postCtx && Array.isArray(postCtx.promises)) {
        postCtx.promises.push(promise);
      }
    });
  }
}
