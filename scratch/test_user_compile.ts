import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { dviParser, mergeText, specials } from 'dvi2html';
import HTMLMachine from 'dvi2html/lib/html';
import { Writable } from 'stream';

// 1. Mock the Worker self environment
let messageHandler: ((e: any) => Promise<void>) | null = null;
const globalSelf = {
  addEventListener(type: string, handler: any) {
    if (type === 'message') {
      messageHandler = handler;
    }
  },
  postMessage(data: any) {
    if (data.type === 'success') {
      console.log('SUCCESS: DVI compiled, size =', data.dvi.length);
      void convertDviToSvg(data.dvi);
    } else if (data.type === 'error') {
      console.error('COMPILE ERROR:', data.error);
    }
  }
};
(global as any).self = globalSelf;

// 2. Load the worker module
require('../src/features/tikz/tikzjax/tikzjax.worker');

// 3. Helper to decompress assets
const assetsDir = './tikzjax-assets';
function loadDecompressed(filename: string): Uint8Array {
  const content = fs.readFileSync(path.join(assetsDir, filename));
  const decompressed = zlib.gunzipSync(content);
  return new Uint8Array(decompressed);
}

// 4. Run compilation
async function run() {
  const wasm = loadDecompressed('tex.wasm.gz');
  const core = loadDecompressed('core.dump.gz');

  const files: Record<string, Uint8Array> = {
    'tex.wasm': wasm,
    'core.dump': core
  };

  const code = `\\begin{tikzpicture}[scale=1.5, transform shape, thick, shift={(0.0,-0.5)}]

% Gamma
\\node at (0,0.5) {$\\Gamma =$};

\\begin{scope}[shift={(0.5,0)}]
\\fill (0.5,1) circle (2pt);
\\fill (0,0) circle (2pt);
\\fill (1,0) circle (2pt);

\\draw (0.5,1)--(0,0);
\\draw (0.5,1)--(1,0);
\\draw (0,0)--(1,0);
\\end{scope}

% arrow
\\draw[->, line width=1.5pt] (2.0,0.5)--(2.5,0.5);

% derivative
\\node[scale=1.2] at (4.0,0.5) {$\\frac{\\delta \\Gamma}{\\delta \\eta(r,r')} = \\frac{1}{2}$};

% result graph
\\begin{scope}[shift={(5.3,0)}]
\\fill (0.5,1) circle (2pt);
\\draw (0,0) circle (2pt);
\\draw (1,0) circle (2pt);

\\draw (0.5,1)--(0,0);
\\draw (0.5,1)--(1,0);

\\node at (0,-0.35) {$\\mathbf  r$};
\\node at (1,-0.35) {$\\mathbf r'$};
\\end{scope}

\\end{tikzpicture}`;

  console.log('Starting compile...');
  if (messageHandler) {
    await messageHandler({
      data: {
        type: 'compile',
        code,
        files
      }
    });
  } else {
    console.error('No message handler registered!');
  }
}

interface FontMetricCharacter {
  width: number;
  height: number;
  depth: number;
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
      `<svg beginpicture viewBox="0 0 10 10" style="overflow: visible; position: relative;">`
    );
    replacedSvg = replacedSvg.replace(
      '<svg>',
      `<svg viewBox="0 0 10 10" style="overflow: visible; position: relative;">`
    );

    replacedSvg = replacedSvg.replace(/{\?x}/g, left.toString());
    replacedSvg = replacedSvg.replace(/{\?y}/g, top.toString());
    this.output.write(replacedSvg);
  }

  override putRule(rule: any): void {
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

    console.log(`[DEBUG] putText: Font = ${this.font.name}, text bytes =`, Array.from(text));

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
        console.log(`  char = ${c} (special) -> shifted = ${shifted}`);
        htmlText += `&#${shifted};`;
      } else {
        console.log(`  char = ${c} -> '${String.fromCharCode(c)}'`);
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

// 5. Convert compiled DVI to SVG
async function convertDviToSvg(dvi: Uint8Array) {
  let html = '';
  const page = new Writable({
    write(chunk, _, callback) {
      html += String(chunk);
      callback();
    }
  });

  async function* streamBuffer() {
    yield Buffer.from(dvi);
    return;
  }

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

  console.log('--- HTML OUTPUT ---');
  console.log(html);
  console.log('--- END HTML OUTPUT ---');
}

run().catch(err => {
  console.error('Run failed:', err);
});
