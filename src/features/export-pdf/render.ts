import { App, Component, type FrontMatterCache, MarkdownRenderer, MarkdownView, Notice, TFile } from "obsidian";
import type { TConfig } from "./modal";
import { copyAttributes, fixAnchors, modifyDest } from "./utils";

export function getAllStyles() {
  const cssTexts: string[] = [];

  Array.from(document.styleSheets).forEach((sheet) => {
    // @ts-ignore
    const id = sheet.ownerNode?.id;

    // <style id="svelte-xxx" ignore
    if (id?.startsWith("svelte-")) {
      return;
    }
    // @ts-ignore
    const href = sheet.ownerNode?.href;

    const division = `/* ----------${id ? `id:${id}` : href ? `href:${href}` : ""}---------- */`;

    cssTexts.push(division);

    try {
      Array.from(sheet?.cssRules ?? []).forEach((rule) => {
        cssTexts.push(rule.cssText);
      });
    } catch (error) {
      console.error(error);
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
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      const cssRules = sheet?.cssRules ?? [];
      Array.from(cssRules).forEach((rule) => {
        if (rule.constructor.name == "CSSMediaRule") {
          if ((rule as CSSMediaRule).conditionText === "print") {
            const res = rule.cssText.replace(/@media print\s*\{(.+)\}/gms, "$1");
            cssTexts.push(res);
          }
        }
      });
    } catch (error) {
      console.error(error);
    }
  });
  return cssTexts;
}

function generateDocId(n: number) {
  return Array.from({ length: n }, () => ((16 * Math.random()) | 0).toString(16)).join("");
}

export type AyncFnType = (...args: unknown[]) => Promise<unknown>;

export function getFrontMatter(app: App, file: TFile) {
  const cache = app.metadataCache.getFileCache(file);
  return cache?.frontmatter ?? ({} as FrontMatterCache);
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
  const startTime = new Date().getTime();

  const ws = app.workspace;
  // if (ws.getActiveFile()?.path != file.path) {
  //   const leaf = ws.getLeaf(true);
  //   console.log(file, leaf);
  //   await leaf.openFile(file);
  // }
  // const view = ws.getActiveViewOfType(MarkdownView) as MarkdownView;

  const leaf = ws.getLeaf(true);
  await leaf.openFile(file);
  const view = leaf.view as MarkdownView;
  // @ts-ignore
  const data: string = view?.data ?? ws?.getActiveFileView()?.data ?? ws.activeEditor?.data;
  if (!data) {
    new Notice("data is empty!");
  }

  const frontMatter = getFrontMatter(app, file);

  const cssclasses = [];
  for (const [key, val] of Object.entries(frontMatter)) {
    if (key.toLowerCase() == "cssclass" || key.toLowerCase() == "cssclasses") {
      if (Array.isArray(val)) {
        cssclasses.push(...val);
      } else {
        cssclasses.push(val);
      }
    }
  }

  const comp = new Component();
  comp.load();

  const printEl = document.body.createDiv("print");
  const viewEl = printEl.createDiv({
    cls: "markdown-preview-view markdown-rendered " + cssclasses.join(" "),
  });
  app.vault.cachedRead(file);

  // @ts-ignore
  viewEl.toggleClass("rtl", app.vault.getConfig("rightToLeft"));
  // @ts-ignore
  viewEl.toggleClass("show-properties", "hidden" !== app.vault.getConfig("propertiesInDocument"));

  const title = extra?.title ?? frontMatter?.title ?? file.basename;
  viewEl.createEl("h1", { text: title }, (e) => {
    e.addClass("__title__");
    e.style.display = config.showTitle ? "block" : "none";
    e.id = extra?.id ?? "";
  });

  const cache = app.metadataCache.getFileCache(file);

  // const lines = data?.split("\n") ?? [];
  // Object.entries(cache?.blocks ?? {}).forEach(([key, c]) => {
  //   const idx = c.position.end.line;
  //   lines[idx] = `<span id="^${key}" class="blockid"></span>\n` + lines[idx];
  // });

  const blocks = new Map(Object.entries(cache?.blocks ?? {}));
  const lines = (data?.split("\n") ?? []).map((line, i) => {
    for (const {
      id,
      position: { start, end },
    } of blocks.values()) {
      const blockid = `^${id}`;
      if (line.includes(blockid) && i >= start.line && i <= end.line) {
        blocks.delete(id);
        return line.replace(blockid, `<span id="${blockid}" class="blockid"></span> ${blockid}`);
      }
    }
    return line;
  });

  [...blocks.values()].forEach(({ id, position: { start, end } }) => {
    const idx = start.line;
    lines[idx] = `<span id="^${id}" class="blockid"></span>\n\n` + lines[idx];
  });

  const promises: AyncFnType[] = [];

  // Use a temporary container for initial rendering.
  // Previous versions used a hack (throwing Error) to stop post-processing, but this causes
  // visible error artifacts in newer Obsidian versions.
  // We allow the render to complete (including implicit post-processing on the detached element)
  // and then move the content. The subsequent manual postProcess call ensures we capture
  // any necessary promises for the PDF generation wait-cycle.
  const tempContainer = document.createElement("div");
  const fixedLines = fixCalloutMath(lines);
  await MarkdownRenderer.render(app, fixedLines.join("\n"), tempContainer, file.path, comp);

  const el = createFragment();
  Array.from(tempContainer.children).forEach((item) => {
    el.createDiv({}, (t) => {
      return t.appendChild(item);
    });
  });

  viewEl.appendChild(el);

  // @ts-ignore
  // (app: App: param: T) => T
  // MarkdownPostProcessorContext
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
    displayMode: true,
  });
  await Promise.all(promises);

  printEl.findAll("a.internal-link").forEach((el: HTMLAnchorElement) => {
    const [title, anchor] = el.dataset.href?.split("#") ?? [];

    if ((!title || title?.length == 0 || title == file.basename) && anchor?.startsWith("^")) {
      return;
    }

    el.removeAttribute("href");
  });
  try {
    await fixWaitRender(data, viewEl);
  } catch (error) {
    console.warn("wait timeout");
  }

  fixCanvasToImage(viewEl);

  const doc = document.implementation.createHTMLDocument("document");
  doc.body.appendChild(printEl.cloneNode(true));

  printEl.detach();
  comp.unload();
  printEl.remove();
  doc.title = title;
  leaf.detach();
  console.log(`md render time:${new Date().getTime() - startTime}ms`);
  return { doc, frontMatter, file };
}

export function fixDoc(doc: Document, title: string) {
  const dest = modifyDest(doc);
  fixAnchors(doc, dest, title);
  encodeEmbeds(doc);
  return doc;
}

export function encodeEmbeds(doc: Document) {
  const spans = Array.from(doc.querySelectorAll("span.markdown-embed")).reverse();
  spans.forEach((span: HTMLElement) => (span.innerHTML = encodeURIComponent(span.innerHTML)));
}

export async function fixWaitRender(data: string, viewEl: HTMLElement) {
  if (data.includes("```dataview") || data.includes("```gEvent") || data.includes("![[")) {
    await sleep(2000);
  }
  try {
    await waitForDomChange(viewEl);
  } catch (error) {
    await sleep(1000);
  }
}

// TODO: base64 to canvas
// TODO: light render canvas
export function fixCanvasToImage(el: HTMLElement) {
  for (const canvas of Array.from(el.querySelectorAll("canvas"))) {
    const data = canvas.toDataURL();
    const img = document.createElement("img");
    img.src = data;
    copyAttributes(img, canvas.attributes);
    img.className = "__canvas__";

    canvas.replaceWith(img);
  }
}

export function createWebview(scale = 1.25) {
  const webview = document.createElement("webview");
  webview.src = `app://obsidian.md/help.html`;
  webview.setAttribute(
    "style",
    `height:calc(${scale} * 100%);
     width: calc(${scale} * 100%);
     transform: scale(${1 / scale}, ${1 / scale});
     transform-origin: top left;
     border: 1px solid #f2f2f2;
    `,
  );
  webview.setAttribute("nodeintegration", "true");
  return webview;
}

function waitForDomChange(target: HTMLElement, timeout = 2000, interval = 200): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout;
    const observer = new MutationObserver((m) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        observer.disconnect();
        resolve(true);
      }, interval);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`timeout ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Fixes broken math blocks inside callouts for PDF export.
 * Obsidian's PDF export requires all lines of a math block inside a callout to start with '>'.
 * This function detects such blocks and prepends missing '>' characters.
 */
function fixCalloutMath(lines: string[]) {
  let inMathBlock = false;
  let mathBlockStartLevel = 0;

  return lines.map((line) => {
    // Determine current blockquote level
    const match = line.match(/^(\s*(?:>\s?)*)/);
    const prefix = match ? match[0] : "";
    const currentLevel = (prefix.match(/>/g) || []).length;

    const dollars = (line.match(/\$\$/g) || []).length;

    let processedLine = line;

    // If inside a math block and the indentation level dropped, fix it.
    if (inMathBlock && currentLevel < mathBlockStartLevel) {
      const missingLevels = mathBlockStartLevel - currentLevel;
      const patch = "> ".repeat(missingLevels);
      processedLine = patch + line;
    }

    // Toggle block state if we see an odd number of '$$' on the line.
    // This handles standard start/end tags.
    if (dollars % 2 !== 0) {
      if (!inMathBlock) {
        inMathBlock = true;
        mathBlockStartLevel = currentLevel;
      } else {
        inMathBlock = false;
      }
    }

    return processedLine;
  });
}
