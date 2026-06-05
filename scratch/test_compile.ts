import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { dvi2html } from 'dvi2html';
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

  const code = `\\begin{tikzpicture}[scale=1.8, transform shape, thick]

\\node at (-0.2,0.5) {$\\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Upsilon \\Phi \\Psi \\Omega$};

\\fill (0.5,1) circle (2pt);
\\fill (1,0) circle (2pt);
\\draw (0,0) circle (2pt);

\\draw (0.5,1)--(1,0);
\\draw (0.5,1)--(0,0);
\\draw (0,0)--(1,0);

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

import { dviParser, mergeText, specials, Machines } from 'dvi2html';

// 5. Convert compiled DVI to SVG using dvi2html
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

  const machine = new Machines.HTML(page);
  let currentPageIndex = -1;
  const pageSizes: { width: number; height: number }[] = [];

  // Override putSVG to correctly track svgDepth and handle <svg beginpicture>
  (machine as any).putSVG = function (svgStr: string) {
    const self = this as any;
    const left = self.position.h * self.pointsPerDviUnit;
    const top = self.position.v * self.pointsPerDviUnit;

    self.svgDepth = self.svgDepth || 0;
    self.svgDepth += (svgStr.match(/<svg/g) || []).length;
    self.svgDepth -= (svgStr.match(/<\/svg>/g) || []).length;

    let replacedSvg = svgStr.replace(
      '<svg beginpicture>',
      '<svg beginpicture width="10pt" height="10pt" viewBox="0 0 10 10" style="overflow: visible; position: absolute;">'
    );
    replacedSvg = replacedSvg.replace(
      '<svg>',
      '<svg width="10pt" height="10pt" viewBox="0 0 10 10" style="overflow: visible; position: absolute;">'
    );

    replacedSvg = replacedSvg.replace(/{\?x}/g, left.toString());
    replacedSvg = replacedSvg.replace(/{\?y}/g, top.toString());
    self.output.write(replacedSvg);
  };

  (machine as any).putText = function (text: number[]) {
    const self = this as any;
    let textWidth = 0;
    let textHeight = 0;
    let textDepth = 0;
    let htmlText = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const metrics = self.font.metrics.characters[c];
      if (metrics === undefined) {
        throw Error(`Could not find font metric for ${c}`);
      }
      textWidth += metrics.width;
      textHeight = Math.max(textHeight, metrics.height);
      textDepth = Math.max(textDepth, metrics.depth);
      if (c < 32) {
        htmlText += `&#${127 + c + 32 + 2};`; // Shift by 2 instead of 4
      } else {
        htmlText += String.fromCharCode(c);
      }
    }
    const dviUnitsPerFontUnit =
      (self.font.metrics.designSize / 1048576.0) * (65536 / 1048576);
    const left = self.position.h * self.pointsPerDviUnit;
    const height = textHeight * self.pointsPerDviUnit * dviUnitsPerFontUnit;
    const top = self.position.v * self.pointsPerDviUnit;
    const fontsize =
      (self.font.metrics.designSize / 1048576.0) *
      self.font.scaleFactor /
      self.font.designSize;

    if (self.svgDepth === 0) {
      self.output.write(
        `<span style="color: ${self.color}; font-family: ${self.font.name}; font-size: ${fontsize}pt; position: absolute; top: ${top - height}pt; left: ${left}pt; overflow: visible;"><span style="margin-top: -${fontsize}pt; line-height: 0pt; height: ${fontsize}pt; display: inline-block; vertical-align: baseline; ">${htmlText}</span><span style="display: inline-block; vertical-align: ${height}pt; height: 0pt; line-height: 0;"></span></span>\n`
      );
    } else {
      const bottom = self.position.v * self.pointsPerDviUnit;
      self.output.write(
        `<text alignment-baseline="baseline" y="${bottom}" x="${left}" style="font-family: ${self.font.name}; font-size: ${fontsize};">${htmlText}</text>\n`
      );
    }
    return (
      (textWidth * dviUnitsPerFontUnit * self.font.scaleFactor) /
      self.font.designSize
    );
  };

  for await (const command of parser) {
    if (command.opcode === 139) {
      // Bop
      if (currentPageIndex >= 0) {
        page.write('</div>');
      }
      currentPageIndex++;
      pageSizes[currentPageIndex] = { width: 0, height: 0 };
      page.write(`<div class="texcore-page" data-page="${currentPageIndex}">`);
    } else if ('width' in command && 'height' in command) {
      if (currentPageIndex >= 0) {
        pageSizes[currentPageIndex] = {
          width: (command as any).width,
          height: (command as any).height
        };
      }
    }
    command.execute(machine);
  }

  if (currentPageIndex >= 0) {
    page.write('</div>');
  }

  console.log('Custom parser finished.');
  console.log('Page sizes:', pageSizes);

  console.log('--- HTML OUTPUT ---');
  console.log(html.substring(0, 1500));
  console.log('--- END HTML OUTPUT ---');

  // Verify by regex matching the structured divs
  const pageRegex = /<div class="texcore-page" data-page="(\d+)">([\s\S]*?)<\/div>/g;
  let match;
  while ((match = pageRegex.exec(html)) !== null) {
    const pageNum = match[1];
    const pageContent = match[2];
    const hasSvg = pageContent.includes('<svg');
    console.log(`Page ${pageNum} has SVG:`, hasSvg, 'Size:', pageSizes[parseInt(pageNum, 10)]);
  }
}

run().catch(err => {
  console.error('Run failed:', err);
});
