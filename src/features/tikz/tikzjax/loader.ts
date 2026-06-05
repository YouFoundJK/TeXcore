import { dvi2html } from 'dvi2html';
import { Writable } from 'stream';
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
        // Map the virtual path inside the worker (without .gz)
        const workerVirtualPath = asset.replace(/\.gz$/, '');
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

    const machine = await dvi2html(streamBuffer(), page);

    // Parse SVG safely using DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html.trim(), 'image/svg+xml');
    const svg = doc.querySelector('svg');

    if (!svg) {
      throw new Error('DVI conversion succeeded but no SVG element was generated.');
    }

    // Apply viewport attributes
    svg.setAttribute('width', `${machine.paperwidth}pt`);
    svg.setAttribute('height', `${machine.paperheight}pt`);
    svg.setAttribute('viewBox', `-72 -72 ${machine.paperwidth} ${machine.paperheight}`);

    return svg;
  }
}
