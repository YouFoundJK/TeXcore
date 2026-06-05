import HTMLMachine from 'dvi2html/lib/html';
import { dviParser, mergeText, specials } from 'dvi2html';
import { Writable } from 'stream';

interface FontMetricCharacter {
  width: number;
  height: number;
  depth: number;
}

interface DviRule {
  a: number;
  b: number;
}

interface DviParsedCommand {
  opcode?: number;
  width?: number;
  height?: number;
  execute(machine: HTMLMachine): void;
}

class CustomHTMLMachine extends HTMLMachine {
  override putSVG(svgStr: string): void {
    const left = this.position.h * this.pointsPerDviUnit;
    const top = this.position.v * this.pointsPerDviUnit;

    this.svgDepth = this.svgDepth || 0;
    this.svgDepth += (svgStr.match(/<svg/g) || []).length;
    this.svgDepth -= (svgStr.match(/<\/svg>/g) || []).length;

    let replacedSvg = svgStr.replace(
      '<svg beginpicture>',
      `<svg beginpicture width="10pt" height="10pt" viewBox="0 0 10 10" style="overflow: visible; position: relative;">`
    );
    replacedSvg = replacedSvg.replace(
      '<svg>',
      `<svg width="10pt" height="10pt" viewBox="0 0 10 10" style="overflow: visible; position: relative;">`
    );

    replacedSvg = replacedSvg.replace(/{\?x}/g, left.toString());
    replacedSvg = replacedSvg.replace(/{\?y}/g, top.toString());
    this.output.write(replacedSvg);
  }

  override putRule(rule: DviRule): void {
    const a = rule.a * this.pointsPerDviUnit;
    const b = rule.b * this.pointsPerDviUnit;
    const left = this.position.h * this.pointsPerDviUnit;
    const bottom = this.position.v * this.pointsPerDviUnit;
    const top = bottom - a;

    if (this.svgDepth === 0) {
      this.output.write(
        `<span style="background: ${this.color}; position: absolute; top: ${top}pt; left: ${left}pt; width:${b}pt; height: ${a}pt;"></span>\n`
      );
    } else {
      this.output.write(
        `<rect x="${left}" y="${top}" width="${b}" height="${a}" fill="${this.color}" />\n`
      );
    }
  }

  override putText(text: number[] | Buffer): number {
    let textWidth = 0;
    let textHeight = 0;
    let textDepth = 0;
    let htmlText = '';
    const chars = this.font.metrics.characters as Record<number, FontMetricCharacter | undefined>;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const metrics = chars[c];
      if (metrics === undefined) {
        throw new Error(`Could not find font metric for ${c}`);
      }
      textWidth += metrics.width;
      textHeight = Math.max(textHeight, metrics.height);
      textDepth = Math.max(textDepth, metrics.depth);
      if (c < 32) {
        const shifted = Math.floor(c / 10) * 12 + (c % 10) + 161;
        htmlText += `&#${shifted};`;
      } else {
        htmlText += String.fromCharCode(c);
      }
    }

    const dviUnitsPerFontUnit = (this.font.metrics.designSize / 1048576.0) * (65536 / 1048576);
    const left = this.position.h * this.pointsPerDviUnit;
    const height = textHeight * this.pointsPerDviUnit * dviUnitsPerFontUnit;
    const top = this.position.v * this.pointsPerDviUnit;
    const fontsize =
      ((this.font.metrics.designSize / 1048576.0) * this.font.scaleFactor) / this.font.designSize;

    if (this.svgDepth === 0) {
      this.output.write(
        `<span style="color: ${this.color}; font-family: ${this.font.name}; font-size: ${fontsize}pt; position: absolute; top: ${top - height}pt; left: ${left}pt; overflow: visible;"><span style="margin-top: -${fontsize}pt; line-height: 0pt; height: ${fontsize}pt; display: inline-block; vertical-align: baseline; ">${htmlText}</span><span style="display: inline-block; vertical-align: ${height}pt; height: 0pt; line-height: 0;"></span></span>\n`
      );
    } else {
      const bottom = this.position.v * this.pointsPerDviUnit;
      this.output.write(
        `<text alignment-baseline="baseline" y="${bottom}" x="${left}" style="font-family: ${this.font.name}; font-size: ${fontsize};">${htmlText}</text>\n`
      );
    }
    return (textWidth * dviUnitsPerFontUnit * this.font.scaleFactor) / this.font.designSize;
  }
}

import zlib from 'zlib';
import { requestUrl, type Notice } from 'obsidian';
import { showNotice } from 'utils/obsidian';
import LatexReferencer from '../../../main';
import { TIKZJAX_ASSETS } from './assets-manifest';
// @ts-ignore
import TikzJaxWorker from './tikzjax.worker';

let cachedWasm: Uint8Array | null = null;
let cachedCore: Uint8Array | null = null;

export class TikzJaxLoader {
  constructor(private plugin: LatexReferencer) {}

  /**
   * Parse packages and libraries from TikZ code block
   */
  private parsePreamble(code: string): { packages: string[]; libraries: string[] } {
    const packages: string[] = [];
    const libraries: string[] = [];

    // Match \usepackage[options]{package1,package2} or \usepackage{package1}
    const pkgRegex = /\\usepackage(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g;
    let match;
    while ((match = pkgRegex.exec(code)) !== null) {
      const pkgs = match[1]
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      packages.push(...pkgs);
    }

    // Match \usetikzlibrary{lib1,lib2}
    const libRegex = /\\usetikzlibrary\s*\{([^}]+)\}/g;
    while ((match = libRegex.exec(code)) !== null) {
      const libs = match[1]
        .split(',')
        .map(l => l.trim())
        .filter(Boolean);
      libraries.push(...libs);
    }

    return { packages, libraries };
  }

  /**
   * Load asset files list (using static manifest)
   */
  private async ensureAssetsList(): Promise<string[]> {
    return TIKZJAX_ASSETS;
  }

  /**
   * Download a file from the CDN and save it locally in the plugin's folder
   */
  private async downloadAsset(filename: string): Promise<Uint8Array | null> {
    const adapter = this.plugin.app.vault.adapter;
    const pluginDir = this.plugin.manifest.dir;
    if (!pluginDir) return null;

    const localPath = `${pluginDir}/tikzjax-assets/${filename}`;
    const cdnUrl = `https://cdn.jsdelivr.net/gh/YouFoundJK/ObsiTeXcore@main/tikzjax-assets/${filename}`;

    let notice: Notice | null = null;
    try {
      notice = showNotice(`TeXcore: Downloading TikZ asset ${filename}...`, 0);

      const response = await requestUrl({
        url: cdnUrl,
        method: 'GET'
      });

      if (response.status !== 200) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = new Uint8Array(response.arrayBuffer);

      // Ensure directory structure exists
      const lastSlash = localPath.lastIndexOf('/');
      if (lastSlash !== -1) {
        const parentDir = localPath.substring(0, lastSlash);
        if (!(await adapter.exists(parentDir))) {
          await adapter.mkdir(parentDir);
        }
      }

      // Write binary data to local file
      await adapter.writeBinary(localPath, data.buffer);

      if (notice) notice.hide();
      showNotice(`TeXcore: Loaded TikZ asset ${filename} successfully.`);
      return data;
    } catch (err) {
      console.error(`Latex Referencer: Failed to download asset ${filename} from CDN`, err);
      if (notice) notice.hide();
      showNotice(
        `TeXcore error: Failed to download TikZ asset ${filename}. Check internet connection.`
      );
      return null;
    }
  }

  /**
   * Load an asset as a string (useful for tikzjax.css which is not compressed)
   */
  public async loadAssetString(filename: string): Promise<string | null> {
    const adapter = this.plugin.app.vault.adapter;
    const pluginDir = this.plugin.manifest.dir;
    if (!pluginDir) return null;

    const filePath = `${pluginDir}/tikzjax-assets/${filename}`;
    try {
      if (!(await adapter.exists(filePath))) {
        const downloaded = await this.downloadAsset(filename);
        if (!downloaded) {
          return null;
        }
      }
      return await adapter.read(filePath);
    } catch (err) {
      console.error(`Latex Referencer: Failed to load asset string ${filename}`, err);
      return null;
    }
  }

  /**
   * Read a .gz file from the assets folder and return the decompressed Uint8Array.
   * If the file is not present locally, it will try to download it from the CDN first.
   */
  private async loadAssetFile(filename: string): Promise<Uint8Array | null> {
    const adapter = this.plugin.app.vault.adapter;
    const pluginDir = this.plugin.manifest.dir;
    if (!pluginDir) return null;

    const filePath = `${pluginDir}/tikzjax-assets/${filename}`;
    try {
      let compressedData: ArrayBufferLike;
      if (!(await adapter.exists(filePath))) {
        const downloaded = await this.downloadAsset(filename);
        if (!downloaded) {
          return null;
        }
        compressedData = downloaded.buffer;
      } else {
        compressedData = await adapter.readBinary(filePath);
      }

      // Decompress gzip synchronously using Node zlib
      const decompressed = zlib.gunzipSync(Buffer.from(compressedData));
      return new Uint8Array(decompressed);
    } catch (err) {
      console.error(`Latex Referencer: Failed to load/decompress asset ${filename}`, err);
      return null;
    }
  }

  /**
   * Renders a TikZ code block into an SVG element
   */
  public async render(source: string): Promise<SVGElement> {
    const pluginDir = this.plugin.manifest.dir;

    if (!pluginDir) {
      throw new Error('Plugin manifest directory is not defined.');
    }

    // 1. Ensure core assets (tex.wasm.gz and core.dump.gz) are loaded/cached in memory
    if (!cachedWasm) {
      const wasmBuf = await this.loadAssetFile('tex.wasm.gz');
      if (!wasmBuf) {
        throw new Error('Required tex.wasm.gz file is missing from tikzjax-assets.');
      }
      cachedWasm = wasmBuf;
    }

    if (!cachedCore) {
      const coreBuf = await this.loadAssetFile('core.dump.gz');
      if (!coreBuf) {
        throw new Error('Required core.dump.gz file is missing from tikzjax-assets.');
      }
      cachedCore = coreBuf;
    }

    // 2. Parse code preamble to determine needed packages/libraries
    const tidyCode = source.trim();
    const { packages, libraries } = this.parsePreamble(tidyCode);

    // Always load core assets
    const filesToLoad: Record<string, Uint8Array> = {
      'tex.wasm': cachedWasm,
      'core.dump': cachedCore
    };

    // Scan available files in the assets directory
    const availableAssets = await this.ensureAssetsList();

    // 3. Resolve and load package dependencies
    const assetsToLoad = new Set<string>();

    // Standard font definitions to load every time (they are very small, < 1KB each)
    const fontFiles = [
      'tex_files/ueuex.fd.gz',
      'tex_files/ueuf.fd.gz',
      'tex_files/ueur.fd.gz',
      'tex_files/ueus.fd.gz',
      'tex_files/umsa.fd.gz',
      'tex_files/umsb.fd.gz'
    ];
    for (const font of fontFiles) {
      if (availableAssets.includes(font)) {
        assetsToLoad.add(font);
      }
    }

    // Resolve packages
    for (const pkg of packages) {
      // Find package files like tex_files/chemfig.sty.gz, etc.
      const candidates = [
        `tex_files/${pkg}.sty.gz`,
        `tex_files/${pkg}.tex.gz`,
        `tex_files/t-${pkg}.tex.gz`
      ];

      for (const cand of candidates) {
        if (availableAssets.includes(cand)) {
          assetsToLoad.add(cand);
        }
      }

      // Special dependency rules for major packages
      if (pkg === 'pgfplots') {
        availableAssets
          .filter(
            name =>
              name.startsWith('tex_files/pgfplots') ||
              name.startsWith('tex_files/pgflibrarypgfplots')
          )
          .forEach(name => assetsToLoad.add(name));
      } else if (pkg === 'circuitikz') {
        availableAssets
          .filter(
            name =>
              name.startsWith('tex_files/circuitikz') ||
              name.startsWith('tex_files/pgfcirc') ||
              name.startsWith('tex_files/t-circuitikz')
          )
          .forEach(name => assetsToLoad.add(name));
      } else if (pkg === 'chemfig') {
        // chemfig depends on simplekv
        availableAssets
          .filter(
            name => name.startsWith('tex_files/simplekv') || name.startsWith('tex_files/t-chemfig')
          )
          .forEach(name => assetsToLoad.add(name));
      } else if (pkg === 'tikz-cd') {
        availableAssets
          .filter(
            name =>
              name.startsWith('tex_files/tikzlibrarycd') || name.startsWith('tex_files/tikz-cd')
          )
          .forEach(name => assetsToLoad.add(name));
      } else if (pkg === 'tikz-feynhand' || pkg === 'tikzfeynhand') {
        availableAssets
          .filter(
            name =>
              name.startsWith('tex_files/tikzlibraryfeynhand') ||
              name.startsWith('tex_files/tikzfeynhand') ||
              name.startsWith('tex_files/tikz-feynhand')
          )
          .forEach(name => assetsToLoad.add(name));
      } else if (pkg === 'pgfcalendar') {
        availableAssets
          .filter(name => name.startsWith('tex_files/pgfcalendar'))
          .forEach(name => assetsToLoad.add(name));
      }
    }

    // Resolve TikZ libraries
    for (const lib of libraries) {
      const cand = `tex_files/tikzlibrary${lib}.code.tex.gz`;
      if (availableAssets.includes(cand)) {
        assetsToLoad.add(cand);
      }
    }

    // Load and decompress all resolved assets
    for (const asset of assetsToLoad) {
      const data = await this.loadAssetFile(asset);
      if (data) {
        // Strip the 'tex_files/' prefix and '.gz' suffix so TeX can find
        // files by their bare name (e.g. 'tikz.sty', not 'tex_files/tikz.sty.gz')
        const workerVirtualPath = asset.replace(/^tex_files\//, '').replace(/\.gz$/, '');
        filesToLoad[workerVirtualPath] = data;
      }
    }

    // 4. Run the compilation inside the Web Worker
    const dviData = await this.runWorkerCompile(tidyCode, filesToLoad);

    // 5. Convert DVI output to SVG element
    return this.dviToSvg(dviData);
  }

  /**
   * Spawns the Web Worker and compiles the code
   */
  private runWorkerCompile(code: string, files: Record<string, Uint8Array>): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      let worker: Worker;
      try {
        const WorkerConstructor = TikzJaxWorker as unknown as new () => Worker;
        worker = new WorkerConstructor();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      worker.onmessage = (e: MessageEvent) => {
        const data = e.data as { type: string; dvi?: Uint8Array; error?: string };
        if (data.type === 'success' && data.dvi) {
          resolve(data.dvi);
          worker.terminate();
        } else if (data.type === 'error') {
          reject(new Error(data.error || 'Unknown error occurred in worker.'));
          worker.terminate();
        }
      };

      worker.onerror = (err: ErrorEvent) => {
        reject(err.error instanceof Error ? err.error : new Error(err.message || 'Worker error'));
        worker.terminate();
      };

      // Start compile
      worker.postMessage({ type: 'compile', code, files });
    });
  }

  /**
   * Converts DVI format to SVG
   */
  private async dviToSvg(dvi: Uint8Array): Promise<SVGElement> {
    if (dvi.length === 0) {
      throw new Error('TikZJax Error: The generated DVI file is completely empty.');
    }

    let html = '';
    const page = new Writable({
      write(chunk: unknown, _, callback) {
        html += String(chunk);
        callback();
      }
    });

    async function* streamBuffer() {
      yield Buffer.from(dvi);
      return;
    }

    // Reconstruct the parser pipeline using dvi2html primitives
    const parser = specials.papersize(
      specials.svg(specials.color(mergeText(dviParser(streamBuffer()))))
    );

    const machine = new CustomHTMLMachine(page);

    let currentPageIndex = -1;
    const pageSizes: { width: number; height: number }[] = [];

    for await (const rawCommand of parser) {
      const command = rawCommand as DviParsedCommand;
      if (command.opcode === 139) {
        // Bop
        if (currentPageIndex >= 0) {
          page.write('</div>');
        }
        currentPageIndex++;
        pageSizes[currentPageIndex] = { width: 0, height: 0 };
        page.write(`<div class="texcore-page" data-page="${currentPageIndex}">`);
      } else if (command.width !== undefined && command.height !== undefined) {
        if (currentPageIndex >= 0) {
          pageSizes[currentPageIndex] = {
            width: command.width,
            height: command.height
          };
        }
      }
      command.execute(machine);
    }

    if (currentPageIndex >= 0) {
      page.write('</div>');
    }

    const domParser = new DOMParser();
    const doc = domParser.parseFromString(html.trim(), 'text/html');

    // LaTeX generated multiple pages. Let's grab all SVGs from the HTML.
    const svgs = Array.from(doc.querySelectorAll('svg'));

    if (svgs.length === 0) {
      console.error('[TeXcore] Raw HTML output:', html);
      throw new Error('TikZJax Error: DVI conversion succeeded but no SVGs were found.');
    }

    // If there are multiple pages, one might be a blank cropping artifact.
    // Grab the first SVG that actually contains drawing elements, or default to the first.
    const svg =
      svgs.find(s =>
        s.querySelector('path, use, rect, circle, ellipse, line, polyline, polygon, text')
      ) || svgs[0];

    // Calculate the bounding box of the actual elements to crop margins perfectly
    const bbox = getSvgBoundingBox(svg);
    if (bbox) {
      const padding = 4; // 4pt padding on all sides for layout safety
      const width = bbox.maxX - bbox.minX + padding * 2;
      const height = bbox.maxY - bbox.minY + padding * 2;
      svg.setAttribute('width', `${width}pt`);
      svg.setAttribute('height', `${height}pt`);
      svg.setAttribute(
        'viewBox',
        `${bbox.minX - padding} ${bbox.minY - padding} ${width} ${height}`
      );
      svg.classList.add('tikz-cropped');
      svg.setAttribute('data-bbox-minx', bbox.minX.toString());
      svg.setAttribute('data-bbox-miny', bbox.minY.toString());
      svg.setAttribute('data-bbox-maxx', bbox.maxX.toString());
      svg.setAttribute('data-bbox-maxy', bbox.maxY.toString());
      svg.setAttribute('data-bbox-width', width.toString());
      svg.setAttribute('data-bbox-height', height.toString());
    } else {
      // Find the corresponding page container to retrieve the paper size dimensions
      const pageContainer = svg.closest('.texcore-page');
      const pageIndexStr = pageContainer?.getAttribute('data-page');
      const pageIndex = pageIndexStr ? parseInt(pageIndexStr, 10) : 0;
      const pageSize = pageSizes[pageIndex];

      // Apply bounding boxes starting at -72 -72 for standalone cropped outputs
      if (pageSize && pageSize.width && pageSize.height) {
        svg.setAttribute('width', `${pageSize.width}pt`);
        svg.setAttribute('height', `${pageSize.height}pt`);
        svg.setAttribute('viewBox', `-72 -72 ${pageSize.width} ${pageSize.height}`);
      } else {
        // Fallback: If paper dimensions are missing, check if width/height attributes are on the SVG
        const w = svg.getAttribute('width')?.replace('pt', '');
        const h = svg.getAttribute('height')?.replace('pt', '');
        if (w && h && w !== '10' && h !== '10') {
          svg.setAttribute('viewBox', `-72 -72 ${w} ${h}`);
        }
      }
    }

    return svg;
  }
}

interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function getSvgBoundingBox(
  svg: SVGElement
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function updateBounds(x: number, y: number) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function parseTransform(transformStr: string | null): Matrix2D {
    if (!transformStr) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    let matrix: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const regex = /(\w+)\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(transformStr)) !== null) {
      const type = match[1];
      const args = match[2]
        .trim()
        .split(/[\s,]+/)
        .map(Number)
        .filter(n => !isNaN(n));
      if (type === 'translate') {
        const tx = args[0] || 0;
        const ty = args[1] || 0;
        matrix = multiply(matrix, { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
      } else if (type === 'scale') {
        const sx = args[0] || 1;
        const sy = args[1] !== undefined ? args[1] : sx;
        matrix = multiply(matrix, { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
      } else if (type === 'matrix') {
        matrix = multiply(matrix, {
          a: args[0] !== undefined ? args[0] : 1,
          b: args[1] || 0,
          c: args[2] || 0,
          d: args[3] !== undefined ? args[3] : 1,
          e: args[4] || 0,
          f: args[5] || 0
        });
      }
    }
    return matrix;
  }

  function multiply(m1: Matrix2D, m2: Matrix2D): Matrix2D {
    return {
      a: m1.a * m2.a + m1.c * m2.b,
      b: m1.b * m2.a + m1.d * m2.b,
      c: m1.a * m2.c + m1.c * m2.d,
      d: m1.b * m2.c + m1.d * m2.d,
      e: m1.a * m2.e + m1.c * m2.f + m1.e,
      f: m1.b * m2.e + m1.d * m2.f + m1.f
    };
  }

  function getAbsoluteMatrix(element: Element): Matrix2D {
    let m: Matrix2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    let current: Element | null = element;
    while (current && current !== svg) {
      const transform = current.getAttribute('transform');
      if (transform) {
        m = multiply(parseTransform(transform), m);
      }
      current = current.parentElement;
    }
    return m;
  }

  function applyTransform(matrix: Matrix2D, x: number, y: number) {
    return {
      x: matrix.a * x + matrix.c * y + matrix.e,
      y: matrix.b * x + matrix.d * y + matrix.f
    };
  }

  function parsePathBounds(d: string, matrix: Matrix2D, offsetX = 0, offsetY = 0) {
    const matches = d.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
    if (matches) {
      for (let i = 0; i < matches.length; i += 2) {
        const x = parseFloat(matches[i]);
        const y = parseFloat(matches[i + 1]);
        if (!isNaN(x) && !isNaN(y)) {
          const pt = applyTransform(matrix, x + offsetX, y + offsetY);
          updateBounds(pt.x, pt.y);
        }
      }
    }
  }

  // 1. Scan paths
  const paths = svg.querySelectorAll('path');
  paths.forEach(path => {
    if (path.closest('defs')) return;
    const d = path.getAttribute('d') || '';
    const matrix = getAbsoluteMatrix(path);
    parsePathBounds(d, matrix);
  });

  // 2. Scan use elements (referenced symbols)
  const uses = svg.querySelectorAll('use');
  uses.forEach(use => {
    const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
    const x = parseFloat(use.getAttribute('x') || '0');
    const y = parseFloat(use.getAttribute('y') || '0');
    const matrix = getAbsoluteMatrix(use);

    const pt = applyTransform(matrix, x, y);
    updateBounds(pt.x, pt.y);

    if (href.startsWith('#')) {
      const id = href.substring(1);
      const defElement = svg.querySelector(`[id="${id}"]`);
      if (defElement) {
        if (defElement.tagName === 'path') {
          const d = defElement.getAttribute('d') || '';
          parsePathBounds(d, matrix, x, y);
        }
      }
    }
  });

  // 3. Scan rects
  const rects = svg.querySelectorAll('rect');
  rects.forEach(rect => {
    if (rect.closest('defs')) return;
    const x = parseFloat(rect.getAttribute('x') || '0');
    const y = parseFloat(rect.getAttribute('y') || '0');
    const w = parseFloat(rect.getAttribute('width') || '0');
    const h = parseFloat(rect.getAttribute('height') || '0');
    const matrix = getAbsoluteMatrix(rect);
    const p1 = applyTransform(matrix, x, y);
    const p2 = applyTransform(matrix, x + w, y);
    const p3 = applyTransform(matrix, x, y + h);
    const p4 = applyTransform(matrix, x + w, y + h);
    updateBounds(p1.x, p1.y);
    updateBounds(p2.x, p2.y);
    updateBounds(p3.x, p3.y);
    updateBounds(p4.x, p4.y);
  });

  // 4. Scan circles
  const circles = svg.querySelectorAll('circle');
  circles.forEach(circle => {
    if (circle.closest('defs')) return;
    const cx = parseFloat(circle.getAttribute('cx') || '0');
    const cy = parseFloat(circle.getAttribute('cy') || '0');
    const r = parseFloat(circle.getAttribute('r') || '0');
    const matrix = getAbsoluteMatrix(circle);
    const p1 = applyTransform(matrix, cx - r, cy - r);
    const p2 = applyTransform(matrix, cx + r, cy + r);
    updateBounds(p1.x, p1.y);
    updateBounds(p2.x, p2.y);
  });

  // 5. Scan lines
  const lines = svg.querySelectorAll('line');
  lines.forEach(line => {
    if (line.closest('defs')) return;
    const x1 = parseFloat(line.getAttribute('x1') || '0');
    const y1 = parseFloat(line.getAttribute('y1') || '0');
    const x2 = parseFloat(line.getAttribute('x2') || '0');
    const y2 = parseFloat(line.getAttribute('y2') || '0');
    const matrix = getAbsoluteMatrix(line);
    const p1 = applyTransform(matrix, x1, y1);
    const p2 = applyTransform(matrix, x2, y2);
    updateBounds(p1.x, p1.y);
    updateBounds(p2.x, p2.y);
  });

  // 6. Scan texts
  const texts = svg.querySelectorAll('text');
  texts.forEach(text => {
    if (text.closest('defs')) return;
    const x = parseFloat(text.getAttribute('x') || '0');
    const y = parseFloat(text.getAttribute('y') || '0');
    const matrix = getAbsoluteMatrix(text);
    const pt = applyTransform(matrix, x, y);

    // Extract font size from style
    const style = text.getAttribute('style') || '';
    const fontSizeMatch = style.match(/font-size:\s*([\d.]+)/);
    const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 10;

    // Extract text content and estimate width
    const content = text.textContent || '';
    const estimatedWidth = content.length * fontSize * 0.6;

    // Add text box bounds
    updateBounds(pt.x, pt.y);
    updateBounds(pt.x + estimatedWidth, pt.y);
    updateBounds(pt.x, pt.y - fontSize);
    updateBounds(pt.x + estimatedWidth, pt.y - fontSize);
    updateBounds(pt.x, pt.y + fontSize * 0.2); // descenders
    updateBounds(pt.x + estimatedWidth, pt.y + fontSize * 0.2);
  });

  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}
