import {
  App,
  ButtonComponent,
  type FrontMatterCache,
  Modal,
  Setting,
  TFile,
  TFolder,
  debounce
} from 'obsidian';
import { PageSize } from 'features/export-pdf/constant';
import LatexReferencer from 'main';
import { exportToPDF, getOutputFile, getOutputPath } from 'features/export-pdf/pdf';
import { showNotice, setCssProps } from 'utils/obsidian';

interface FsPromisesModule {
  readFile(path: string, options: { encoding: string }): Promise<string>;
}

interface PathModule {
  join(...paths: string[]): string;
}

interface ElectronWebView extends HTMLIFrameElement {
  executeJavaScript(script: string): Promise<[number, number]>;
  insertCSS(css: string): Promise<void>;
  openDevTools(): void;
  printToPDF(options: Record<string, unknown>): Promise<ArrayBuffer>;
}

const getRequire = (): ((id: string) => unknown) | null => {
  if (typeof window !== 'undefined' && 'require' in window) {
    return (window as unknown as { require: (id: string) => unknown }).require;
  }
  return null;
};

const req = getRequire();
const fs = req ? (req('fs/promises') as FsPromisesModule) : null;
const path = req ? (req('path') as PathModule) : null;
import {
  createWebview,
  fixDoc,
  getAllStyles,
  getPatchStyle,
  renderMarkdown,
  type ParamType
} from 'features/export-pdf/render';
import {
  isNumber,
  mm2px,
  px2mm,
  safeParseFloat,
  safeParseInt,
  traverseFolder
} from 'features/export-pdf/utils';
import { Progress } from 'features/export-pdf/Progress';
import pLimit from 'p-limit';
export type PageSizeType = string | { width: number; height: number };

export interface TConfig {
  pageSize: string;
  pageWidth?: string;
  pageHeight?: string;

  marginType: string;
  open: boolean;
  landscape: boolean;
  scale: number;
  showTitle: boolean;
  displayHeader: boolean;
  displayFooter: boolean;

  marginTop?: string;
  marginBottom?: string;
  marginLeft?: string;
  marginRight?: string;

  cssSnippet?: string;

  multiple?: boolean;
}

export type DocType = { doc: Document; frontMatter?: FrontMatterCache; file: TFile };

type Callback = (conf: TConfig) => void;

function fullWidthButton(button: ButtonComponent) {
  setCssProps(button.buttonEl, {
    margin: '0 auto',
    width: '-webkit-fill-available'
  });
}

function setInputWidth(inputEl: HTMLInputElement) {
  setCssProps(inputEl, {
    width: '100px'
  });
}

interface CustomCssApp {
  customCss?: {
    snippets?: string[];
    enabledSnippets?: Set<string>;
  };
  vault: App['vault'] & {
    adapter: {
      basePath: string;
    };
  };
}

export class ExportConfigModal extends Modal {
  config: TConfig;
  canceled: boolean;
  multiplePdf?: boolean;
  callback!: Callback;
  file: TFile | TFolder;
  preview: ElectronWebView | null = null;
  webviews: ElectronWebView[];
  previewDiv!: HTMLDivElement;
  completed: boolean;
  docs: DocType[];
  title!: string;
  frontMatter!: FrontMatterCache;
  scale!: number;
  svelte: Progress | null = null;

  constructor(
    public plugin: LatexReferencer,
    file: TFile | TFolder,
    multiplePdf?: boolean
  ) {
    super(plugin.app);
    this.canceled = true;
    this.file = file;
    this.completed = false;
    this.docs = [];
    this.scale = 0.75;
    this.webviews = [];
    this.multiplePdf = multiplePdf;

    this.config = {
      pageSize: 'A4',
      marginType: '1',
      showTitle: plugin.settings.showTitle ?? true,
      open: true,
      scale: 100,
      landscape: false,
      marginTop: '10',
      marginBottom: '10',
      marginLeft: '10',
      marginRight: '10',
      displayHeader: plugin.settings.displayHeader ?? true,
      displayFooter: plugin.settings.displayHeader ?? true,
      cssSnippet: '0',
      ...(plugin.settings?.prevConfig ?? {})
    };
  }

  getFileCache(file: TFile) {
    return this.app.metadataCache.getFileCache(file);
  }

  async getAllFiles() {
    const app = this.plugin.app;
    const data: ParamType[] = [];
    const docs: DocType[] = [];
    if (this.file instanceof TFolder) {
      const files = traverseFolder(this.file);
      for (const file of files) {
        data.push({
          app,
          file,
          config: this.config
        });
      }
    } else {
      const { doc, frontMatter, file } = await renderMarkdown({
        app,
        file: this.file,
        config: this.config
      });
      docs.push({ doc, frontMatter, file });
      if (frontMatter.toc) {
        const files = this.parseToc(doc);
        for (const item of files) {
          data.push({
            app,
            file: item.file,
            config: this.config,
            extra: item
          });
        }
      }
    }
    return { data, docs };
  }

  async renderFiles(data: ParamType[], docs?: DocType[], cb?: (i: number) => void) {
    const concurrency = safeParseInt(this.plugin.settings.concurrency) || 5;
    const limit = pLimit(concurrency);

    const inputs = data.map((param, i) =>
      limit(async () => {
        const res = await renderMarkdown(param);
        cb?.(i);
        return res;
      })
    );
    let _docs = [...(docs ?? []), ...(await Promise.all(inputs))];

    if (this.file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf();
      await leaf.openFile(this.file);
    }

    if (!this.multiplePdf) {
      _docs = this.mergeDoc(_docs);
    }
    this.docs = _docs.map(({ doc, ...rest }) => {
      return { ...rest, doc: fixDoc(doc, doc.title) };
    });
  }
  parseToc(doc: Document) {
    if (!(this.file instanceof TFile)) return [];
    const cache = this.getFileCache(this.file);
    const results =
      cache?.links
        ?.map(({ link, displayText }) => {
          const id: string = crypto.randomUUID();
          const elem = doc.querySelector(`a[data-href="${link}"]`) as HTMLAnchorElement;
          if (elem) {
            elem.href = `#${id}`;
          }
          const target = this.plugin.app.metadataCache.getFirstLinkpathDest(link, this.file.path);
          if (!(target instanceof TFile)) {
            return null;
          }
          return {
            title: displayText,
            file: target,
            id
          };
        })
        .filter(
          (item): item is { title: string | undefined; file: TFile; id: string } => item !== null
        ) ?? [];
    return results;
  }

  mergeDoc(docs: DocType[]) {
    const { doc: doc0, frontMatter, file } = docs[0];
    const sections = [];
    for (const { doc } of docs) {
      const element = doc.querySelector('.markdown-preview-view');

      if (element) {
        const section = doc0.createElement('section');
        Array.from(element.children).forEach(child => {
          section.appendChild(doc0.importNode(child, true));
        });

        sections.push(section);
      }
    }
    const root = doc0.querySelector('.markdown-preview-view');
    if (root) {
      root.innerHTML = '';
    }
    sections.forEach(section => {
      root?.appendChild(section);
    });

    return [{ doc: doc0, frontMatter, file }];
  }

  calcPageSize(element?: HTMLDivElement, config?: TConfig) {
    const { pageSize, pageWidth, pageHeight } = config ?? this.config;
    const el = element ?? this.previewDiv;
    const [w, h] = PageSize?.[pageSize] ?? [
      safeParseFloat(pageWidth, 210),
      safeParseFloat(pageHeight, 297)
    ];

    // Scale is ratio of PDF Page Width in Pixels to Container Width in Pixels
    const width = w;
    const scale = Math.floor((mm2px(width) / el.offsetWidth) * 100) / 100;

    this.webviews.forEach(wb => {
      setCssProps(wb, {
        transform: `scale(${1 / scale},${1 / scale})`,
        width: `calc(${scale} * 100%)`,
        height: `${mm2px(h)}px`
      });
    });
    this.scale = scale;
    return scale;
  }

  async calcWebviewSize() {
    await sleep(500);
    for (let i = 0; i < this.webviews.length; i++) {
      const e = this.webviews[i];
      const [width, height] = await e.executeJavaScript(
        '[document.body.offsetWidth, document.body.offsetHeight]'
      );
      const sizeEl = e.parentNode?.querySelector('.print-size');
      if (sizeEl) {
        sizeEl.empty();
        sizeEl.createDiv({ text: `${width}×${height}px` });
        sizeEl.createDiv({ text: `${px2mm(width)}×${px2mm(height)}mm` });
      }
    }
  }

  async togglePrintSize() {
    activeDocument.querySelectorAll('.print-size')?.forEach((el: Element) => {
      const sizeEl = el as HTMLDivElement;
      if (this.config['pageSize'] === 'Custom') {
        setCssProps(sizeEl, { visibility: 'visible' });
      } else {
        setCssProps(sizeEl, { visibility: 'hidden' });
      }
    });
  }

  makeWebviewJs(doc: Document) {
    return `
      document.body.innerHTML = decodeURIComponent(\`${encodeURIComponent(doc.body.innerHTML)}\`);
      document.head.innerHTML = decodeURIComponent(\`${encodeURIComponent(activeDocument.head.innerHTML)}\`);
      
      // Function to recursively decode and replace innerHTML of span.markdown-embed elements
      function decodeAndReplaceEmbed(element) {
				// Replace the innerHTML with the decoded content
				element.innerHTML = decodeURIComponent(element.innerHTML);
				// Check if the new content contains further span.markdown-embed elements
				const newEmbeds = element.querySelectorAll("span.markdown-embed");
				newEmbeds.forEach(decodeAndReplaceEmbed);
      }
      
      // Start the process with all span.markdown-embed elements in the document
      document.querySelectorAll("span.markdown-embed").forEach(decodeAndReplaceEmbed);
 
      document.body.setAttribute("class", \`${activeDocument.body.getAttribute('class')}\`)
      document.body.setAttribute("style", \`${activeDocument.body.getAttribute('style')}\`)
      document.body.addClass("theme-light");
      document.body.removeClass("theme-dark");
      document.title = \`${doc.title}\`;
      `;
  }
  /**
   * append webview
   * @param e HTMLDivElement
   * @param render Rerender or not
   */
  async appendWebview(e: HTMLDivElement, doc: Document) {
    const webview = createWebview(this.scale) as unknown as ElectronWebView;
    const preview = e.appendChild(webview);
    this.webviews.push(preview);
    this.preview = preview;
    preview.addEventListener('dom-ready', () => {
      void (async () => {
        this.completed = true;
        const styles = getAllStyles();
        for (const css of styles) {
          await preview.insertCSS(css);
        }
        if (this.config.cssSnippet && this.config.cssSnippet !== '0') {
          try {
            if (fs) {
              const cssSnippet = await fs.readFile(this.config.cssSnippet, { encoding: 'utf8' });
              // remove `@media print { ... }`
              const printCss = cssSnippet.replaceAll(/@media print\s*{([^}]+)}/g, '$1');
              await preview.insertCSS(printCss);
              await preview.insertCSS(cssSnippet);
            }
          } catch {
            // Ignore snippet loading issues
          }
        }
        await preview.executeJavaScript(this.makeWebviewJs(doc));
        const patchStyles = getPatchStyle();
        for (const css of patchStyles) {
          await preview.insertCSS(css);
        }
      })();
    });
  }
  async appendWebviews(el: HTMLDivElement, render = true) {
    el.empty();
    if (render) {
      // await this.renderFiles(el);
      this.svelte = new Progress({
        target: el,
        props: {
          startCount: 5
        }
      });
      const { data, docs } = await this.getAllFiles();
      if (this.svelte) {
        this.svelte.initRenderStates(data);
        await this.renderFiles(data, docs, i => this.svelte?.updateRenderStates(i));
      }
    }
    el.empty();
    await Promise.all(
      this.docs?.map(async ({ doc }, i) => {
        if (this.multiplePdf) {
          el.createDiv({
            text: `${i + 1}-${doc.title}`,
            attr: { class: 'filename' }
          });
        }
        const div = el.createDiv({ attr: { class: 'webview-wrapper' } });
        div.createDiv({ attr: { class: 'print-size' } });
        await this.appendWebview(div, doc);
      })
    );
    await this.calcWebviewSize();
  }
  async onOpen() {
    this.contentEl.empty();
    this.modalEl.addClass('better-export-pdf-modal');
    setCssProps(this.containerEl, {
      '--dialog-width': '90vw',
      '--dialog-height': '90vh'
    });

    this.titleEl.setText('Export to pdf');
    const wrapper = this.contentEl.createDiv({ attr: { id: 'better-export-pdf' } });

    const title = this.file instanceof TFile ? this.file.basename : this.file.name;

    this.previewDiv = wrapper.createDiv({ attr: { class: 'pdf-preview' } }, el => {
      el.empty();
      const resizeObserver = new ResizeObserver(() => {
        this.calcPageSize(el);
      });
      resizeObserver.observe(el);
      void (async () => {
        await this.appendWebviews(el);
        this.calcPageSize(el);
        await this.togglePrintSize();
      })();
    });

    const contentEl = wrapper.createDiv({ attr: { class: 'setting-wrapper' } });
    contentEl.addEventListener('keyup', event => {
      if (event.key === 'Enter') {
        void handleExport();
      }
    });
    this.generateForm(contentEl);

    const handleExport = async () => {
      this.plugin.settings.prevConfig = this.config;
      await this.plugin.saveSettings();
      if (this.config['pageSize'] === 'Custom') {
        if (
          !isNumber(this.config['pageWidth'] ?? '') ||
          !isNumber(this.config['pageHeight'] ?? '')
        ) {
          showNotice('When the page size is Custom, the Width/Height cannot be empty.');
          return;
        }
      }

      if (this.multiplePdf) {
        const outputPath = await getOutputPath(title);
        if (outputPath) {
          await Promise.all(
            this.webviews.map(async (wb, i) => {
              await exportToPDF(
                `${outputPath}/${this.docs[i].file.basename}.pdf`,
                { ...this.plugin.settings, ...this.config },
                wb,
                this.docs[i]
              );
            })
          );
          this.close();
        }
      } else {
        const outputFile = await getOutputFile(title, this.plugin.settings.isTimestamp);
        if (outputFile) {
          await exportToPDF(
            outputFile,
            { ...this.plugin.settings, ...this.config },
            this.webviews[0],
            this.docs[0]
          );
          this.close();
        }
      }
    };

    new Setting(contentEl).setHeading().addButton(button => {
      button.setButtonText('Export').onClick(() => {
        void handleExport();
      });
      button.setCta();
      fullWidthButton(button);
    });

    new Setting(contentEl).setHeading().addButton(button => {
      button.setButtonText('Refresh').onClick(() => {
        void (async () => {
          await this.appendWebviews(this.previewDiv);
        })();
      });
      fullWidthButton(button);
    });

    const debugEl = new Setting(contentEl).setHeading().addButton(button => {
      button.setButtonText('Debug').onClick(() => {
        void (async () => {
          this.preview?.openDevTools();
        })();
      });
      fullWidthButton(button);
    });
    debugEl.settingEl.hidden = !this.plugin.settings.debug;
  }

  private generateForm(contentEl: HTMLDivElement) {
    new Setting(contentEl).setName('Include file name as title').addToggle(toggle =>
      toggle
        .setTooltip('Include file name as title')
        .setValue(this.config['showTitle'])
        .onChange(async value => {
          this.config['showTitle'] = value;
          this.webviews.forEach((wv, i) => {
            void wv.executeJavaScript(`
              var _title = document.querySelector("h1.__title__");
              if (_title) {
              	_title.style.display = "${value ? 'block' : 'none'}";
              }
              `);
            const _title = this.docs[i]?.doc?.querySelector('h1.__title__') as HTMLHeadingElement;
            if (_title) {
              setCssProps(_title, { display: value ? 'block' : 'none' });
            }
          });
        })
    );
    const pageSizes: string[] = [
      'A0',
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'Legal',
      'Letter',
      'Tabloid',
      'Ledger',
      'Custom'
    ];
    new Setting(contentEl).setName('Page size').addDropdown(dropdown => {
      dropdown
        .addOptions(Object.fromEntries(pageSizes.map(size => [size, size])))
        .setValue(this.config.pageSize)
        .onChange((value: string) => {
          void (async () => {
            this.config['pageSize'] = value;
            if (value === 'Custom') {
              sizeEl.settingEl.hidden = false;
            } else {
              sizeEl.settingEl.hidden = true;
            }
            void this.togglePrintSize();
            this.calcPageSize();
            await this.calcWebviewSize();
          })();
        });
    });

    const sizeEl = new Setting(contentEl)
      .setName('Width/height')
      .addText(text => {
        setInputWidth(text.inputEl);
        text
          .setPlaceholder('Width')
          .setValue(this.config['pageWidth'] as string)
          .onChange(
            debounce(
              value => {
                void (async () => {
                  this.config['pageWidth'] = value;
                  this.calcPageSize();
                  await this.calcWebviewSize();
                })();
              },
              500,
              true
            )
          );
      })
      .addText(text => {
        setInputWidth(text.inputEl);
        text
          .setPlaceholder('Height')
          .setValue(this.config['pageHeight'] as string)
          .onChange(value => {
            this.config['pageHeight'] = value;
          });
      });

    sizeEl.settingEl.hidden = this.config['pageSize'] !== 'Custom';

    new Setting(contentEl)
      .setName('Margin')
      .setDesc('The unit is millimeters.')
      .addDropdown(dropdown => {
        dropdown
          .addOption('0', 'None')
          .addOption('1', 'Default')
          .addOption('2', 'Small')
          .addOption('3', 'Custom')
          .setValue(this.config['marginType'])
          .onChange((value: string) => {
            this.config['marginType'] = value;
            if (value === '3') {
              topEl.settingEl.hidden = false;
              btmEl.settingEl.hidden = false;
            } else {
              topEl.settingEl.hidden = true;
              btmEl.settingEl.hidden = true;
            }
          });
      });

    const topEl = new Setting(contentEl)
      .setName('Top/bottom')
      .addText(text => {
        setInputWidth(text.inputEl);
        text
          .setPlaceholder('Margin top')
          .setValue(this.config['marginTop'] as string)
          .onChange(value => {
            this.config['marginTop'] = value;
          });
      })
      .addText(text => {
        setInputWidth(text.inputEl);
        text
          .setPlaceholder('Margin bottom')
          .setValue(this.config['marginBottom'] as string)
          .onChange(value => {
            this.config['marginBottom'] = value;
          });
      });
    topEl.settingEl.hidden = this.config['marginType'] !== '3';
    const btmEl = new Setting(contentEl)
      .setName('Left/right')
      .addText(text => {
        setInputWidth(text.inputEl);
        text
          .setPlaceholder('Margin left')
          .setValue(this.config['marginLeft'] as string)
          .onChange(value => {
            this.config['marginLeft'] = value;
          });
      })
      .addText(text => {
        setInputWidth(text.inputEl);
        text
          .setPlaceholder('Margin right')
          .setValue(this.config['marginRight'] as string)
          .onChange(value => {
            this.config['marginRight'] = value;
          });
      });
    btmEl.settingEl.hidden = this.config['marginType'] !== '3';

    new Setting(contentEl).setName('Downscale percent').addSlider(slider => {
      slider
        .setLimits(0, 100, 1)
        .setValue(this.config['scale'])
        .onChange(async value => {
          this.config['scale'] = value;
          slider.showTooltip();
        });
    });
    new Setting(contentEl).setName('Landscape').addToggle(toggle =>
      toggle
        .setTooltip('Landscape')
        .setValue(this.config['landscape'])
        .onChange(async value => {
          this.config['landscape'] = value;
        })
    );

    new Setting(contentEl).setName('Display header').addToggle(toggle =>
      toggle
        .setTooltip('Display header')
        .setValue(this.config['displayHeader'])
        .onChange(async value => {
          this.config['displayHeader'] = value;
        })
    );

    new Setting(contentEl).setName('Display footer').addToggle(toggle =>
      toggle
        .setTooltip('Display footer')
        .setValue(this.config['displayFooter'])
        .onChange(async value => {
          this.config['displayFooter'] = value;
        })
    );

    new Setting(contentEl).setName('Open after export').addToggle(toggle =>
      toggle
        .setTooltip('Open the exported file after exporting.')
        .setValue(this.config['open'])
        .onChange(async value => {
          this.config['open'] = value;
        })
    );

    const snippets = this.cssSnippets();

    if (Object.keys(snippets).length > 0 && this.plugin.settings.enabledCss) {
      new Setting(contentEl).setName('Css snippets').addDropdown(dropdown => {
        dropdown
          .addOption('0', 'Not select')
          .addOptions(snippets)
          .setValue(this.config['cssSnippet'] as string)
          .onChange((value: string) => {
            void (async () => {
              this.config['cssSnippet'] = value;
              await this.appendWebviews(this.previewDiv, false);
            })();
          });
      });
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.svelte) {
      this.svelte.destroy();
    }
  }

  cssSnippets(): Record<string, string> {
    const customApp = this.app as unknown as CustomCssApp;
    const { snippets, enabledSnippets } = customApp.customCss ?? {};
    const basePath = customApp.vault.adapter.basePath;
    if (!path || !snippets || !enabledSnippets) return {};
    const entries = snippets
      .filter((item: string) => !enabledSnippets.has(item))
      .map((name: string): [string, string] => {
        const file = path.join(basePath, this.app.vault.configDir, 'snippets', `${name}.css`);
        return [file, name];
      });
    return Object.fromEntries(entries);
  }
}
