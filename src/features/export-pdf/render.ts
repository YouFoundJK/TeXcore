import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import type { TConfig } from '../../ui/export-pdf/modal';
import { copyAttributes, fixAnchors, modifyDest } from './utils';
import { checkAndFixCalloutMath } from '../../utils/fixer';
import { showNotice } from 'utils/obsidian';

export function getAllStyles() {
  const cssTexts: string[] = [];

  Array.from(activeDocument.styleSheets).forEach(sheet => {
    let id: string | undefined = undefined;
    let href: string | undefined = undefined;
    if (sheet.ownerNode) {
      if (sheet.ownerNode.instanceOf(HTMLElement)) {
        id = sheet.ownerNode.id;
      }
      if (sheet.ownerNode.instanceOf(HTMLLinkElement)) {
        href = sheet.ownerNode.href;
      }
    }

    // <style id="svelte-xxx" ignore
    if (id?.startsWith('svelte-')) {
      return;
    }

    const division = `/* ----------${id ? `id:${id}` : href ? `href:${href}` : ''}---------- */`;

    cssTexts.push(division);

    try {
      Array.from(sheet?.cssRules ?? []).forEach(rule => {
        cssTexts.push(rule.cssText);
      });
    } catch {
      // ignore
    }
  });

  cssTexts.push(...getPatchStyle());
  return cssTexts;
}

const CSS_PATCH = `
/* ---------- css patch ---------- */

body {
  overflow: auto !important;
}
@media print {
  .print .markdown-preview-view {
    height: auto !important;
  }
  .md-print-anchor, .blockid {
    white-space: pre !important;
    border-left: none !important;
    border-right: none !important;
    border-top: none !important;
    border-bottom: none !important;
    display: inline-block !important;
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    right: 0 !important;
    outline: 0 !important;
    background: 0 0 !important;
    text-decoration: initial !important;
    text-shadow: initial !important;
  }
}
@media print {
  table {
    break-inside: auto;
  }
  tr {
    break-inside: avoid;
    break-after: auto;
  }
}

img.__canvas__ {
  width: 100% !important;
  height: 100% !important;
}
`;

export function getPatchStyle() {
  return [CSS_PATCH, ...getPrintStyle()];
}

export function getPrintStyle() {
  const cssTexts: string[] = [];
  Array.from(activeDocument.styleSheets).forEach(sheet => {
    try {
      const cssRules = sheet?.cssRules ?? [];
      Array.from(cssRules).forEach(rule => {
        if (rule.constructor.name === 'CSSMediaRule') {
          if ((rule as CSSMediaRule).conditionText === 'print') {
            const res = rule.cssText.replace(/@media print\s*\{(.+)\}/gms, '$1');
            cssTexts.push(res);
          }
        }
      });
    } catch {
      // ignore
    }
  });
  return cssTexts;
}

function generateDocId(n: number) {
  return Array.from({ length: n }, () => ((16 * Math.random()) | 0).toString(16)).join('');
}

export type AyncFnType = Promise<unknown>;

import { FrontMatterCache } from 'obsidian';

export function getFrontMatter(app: App, file: TFile): FrontMatterCache {
  const cache = app.metadataCache.getFileCache(file);
  return cache?.frontmatter ?? {};
}

export type ParamType = {
  app: App;
  file: TFile;
  config: TConfig;
  extra?: {
    title?: string;
    file: TFile;
    id?: string;
  };
};

// 逆向原生打印函数
export async function renderMarkdown({ app, file, config, extra }: ParamType) {
  const ws = app.workspace;
  const leaf = ws.getLeaf(true);
  await leaf.openFile(file);
  const data: string = await app.vault.cachedRead(file);
  if (!data) {
    showNotice('Data is empty!');
  }

  const frontMatter = getFrontMatter(app, file);

  const cssclasses: string[] = [];
  for (const [key, val] of Object.entries(frontMatter)) {
    if (key.toLowerCase() === 'cssclass' || key.toLowerCase() === 'cssclasses') {
      if (Array.isArray(val)) {
        cssclasses.push(
          ...(val as unknown[]).flatMap(v =>
            String(v)
              .split(/[\s,]+/)
              .filter(Boolean)
          )
        );
      } else {
        cssclasses.push(
          ...String(val)
            .split(/[\s,]+/)
            .filter(Boolean)
        );
      }
    }
  }

  const comp = new Component();
  comp.load();

  const printEl = activeDocument.body.createDiv('print');
  const viewEl = printEl.createDiv({
    cls: `markdown-preview-view markdown-rendered ${cssclasses.join(' ')}`
  });

  viewEl.toggleClass('rtl', app.vault.getConfig('rightToLeft') as boolean);
  viewEl.toggleClass(
    'show-properties',
    'hidden' !== (app.vault.getConfig('propertiesInDocument') as string)
  );

  const title = extra?.title ?? (frontMatter?.title as string | undefined) ?? file.basename;
  viewEl.createEl('h1', { text: title }, e => {
    e.addClass('__title__');
    e.style.display = config.showTitle ? 'block' : 'none';
    e.id = extra?.id ?? '';
  });

  const cache = app.metadataCache.getFileCache(file);

  const blocks = new Map(Object.entries(cache?.blocks ?? {}));
  const lines = (data?.split('\n') ?? []).map((line, i) => {
    for (const {
      id,
      position: { start, end }
    } of blocks.values()) {
      const blockid = `^${id}`;
      if (line.includes(blockid) && i >= start.line && i <= end.line) {
        blocks.delete(id);
        return line.replace(blockid, `<span id="${blockid}" class="blockid"></span> ${blockid}`);
      }
    }
    return line;
  });

  [...blocks.values()].forEach(({ id, position: { start } }) => {
    const idx = start.line;
    if (idx < lines.length) {
      lines[idx] = `<span id="^${id}" class="blockid"></span>\n\n${lines[idx]}`;
    }
  });

  const promises: AyncFnType[] = [];

  const tempContainer = activeDocument.createElement('div');
  const linesContent = lines.join('\n');
  const fixedContent = checkAndFixCalloutMath(linesContent) ?? linesContent;

  await MarkdownRenderer.render(app, fixedContent, tempContainer, file.path, comp);

  const el = createFragment();
  Array.from(tempContainer.children).forEach(item => {
    el.createDiv({}, t => {
      return t.appendChild(item);
    });
  });

  viewEl.appendChild(el);

  await MarkdownRenderer.postProcess(app, {
    docId: generateDocId(16),
    sourcePath: file.path,
    frontmatter: {},
    promises,
    addChild: function (e: Component) {
      return comp.addChild(e);
    },
    getSectionInfo: function () {
      return null;
    },
    containerEl: viewEl,
    el: viewEl,
    displayMode: true
  });
  await Promise.all(promises);

  printEl.findAll('a.internal-link').forEach((el: HTMLElement) => {
    const [title, anchor] = el.dataset.href?.split('#') ?? [];

    if ((!title || title?.length === 0 || title === file.basename) && anchor && anchor.length > 0) {
      return;
    }

    el.removeAttribute('href');
  });
  try {
    await fixWaitRender(data, viewEl);
  } catch {
    console.warn('wait timeout');
  }

  fixCanvasToImage(viewEl);

  const doc = activeDocument.implementation.createHTMLDocument('document');
  doc.body.appendChild(printEl.cloneNode(true));

  printEl.detach();
  comp.unload();
  printEl.remove();
  doc.title = title;
  leaf.detach();
  return { doc, frontMatter, file };
}

export function fixDoc(doc: Document, title: string) {
  const dest = modifyDest(doc);
  fixAnchors(doc, dest, title);
  encodeEmbeds(doc);
  return doc;
}

export function encodeEmbeds(doc: Document) {
  const spans = Array.from(doc.querySelectorAll('span.markdown-embed')).reverse();
  spans.forEach((el: Element) => {
    const span = el as HTMLElement;
    span['innerHTML'] = encodeURIComponent(span['innerHTML']);
  });
}

export async function fixWaitRender(data: string, viewEl: HTMLElement) {
  if (data.includes('```dataview') || data.includes('```gEvent') || data.includes('![[')) {
    await sleep(1500);
  }

  // Explicitly wait for any pending TikZJax diagram compilation tasks to finish in viewEl
  const tikzStart = Date.now();
  while (viewEl.textContent?.includes('Rendering TikZ diagram...')) {
    if (Date.now() - tikzStart > 20000) {
      console.warn('[PDF Export] Timed out waiting for TikZ diagrams to render.');
      break;
    }
    await sleep(100);
  }

  try {
    await waitForDomChange(viewEl);
  } catch {
    await sleep(200);
  }
}

export function fixCanvasToImage(el: HTMLElement) {
  for (const canvas of Array.from(el.querySelectorAll('canvas'))) {
    const data = canvas.toDataURL();
    const img = activeDocument.createElement('img');
    img.src = data;
    copyAttributes(img, canvas.attributes);
    img.classList.add('__canvas__');

    canvas.replaceWith(img);
  }
}

export function createWebview(scale = 1.25) {
  const webview = activeDocument.createElement('webview') as HTMLElement & { src: string };
  webview.src = `app://obsidian.md/help.html`;
  webview.setAttribute(
    'style',
    `height:calc(${scale} * 100%);
     width: calc(${scale} * 100%);
     transform: scale(${1 / scale}, ${1 / scale});
     transform-origin: top left;
     border: 1px solid #f2f2f2;
    `
  );
  webview.setAttribute('nodeintegration', 'true');
  return webview;
}

function waitForDomChange(target: HTMLElement, timeout = 1000, interval = 150): Promise<boolean> {
  return new Promise(resolve => {
    let timer: number | null = null;
    const observer = new MutationObserver(() => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        observer.disconnect();
        resolve(true);
      }, interval);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    // Short settlement check: if no mutations happen within 300ms, assume DOM has settled
    const initialTimer = window.setTimeout(() => {
      if (!timer) {
        observer.disconnect();
        resolve(true);
      }
    }, 300);

    window.setTimeout(() => {
      window.clearTimeout(initialTimer);
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      resolve(true);
    }, timeout);
  });
}
