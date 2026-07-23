// Raw TFM font metric data (base64-encoded) bundled with dvi2html
// This is exactly what the TeX engine needs when it opens a .tfm file
import fontsJson from 'dvi2html/lib/tfm/fonts.json';

function lookupTfmData(fontName: string): Uint8Array | null {
  const entry = (fontsJson as Record<string, string>)[fontName];
  if (!entry) return null;
  // Decode base64 → raw TFM bytes
  const binary = atob(entry);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Virtual Filesystem ──────────────────────────────────────────────────────

interface VirtualFile {
  filename: string;
  position: number;
  erstat: number;
  content: Uint8Array; // NOTE: named 'content', not 'buffer' — matches original
  stdin?: boolean;
  stdout?: boolean;
  eof?: boolean;
  eoln?: boolean;
}

// Open file list (mirrors original's `uq`)
let files: VirtualFile[] = [];
// Preloaded file dict (mirrors original's `cq`) — filename → content
let preloadedFiles: Record<string, Uint8Array> = {};

// ─── WASM State ──────────────────────────────────────────────────────────────

interface TeXWasmExports {
  main(): void;
  asyncify_stop_unwind?(): void;
}
// WASM exports reference (needed to call main() after asyncify rewind)
let wasmExports: TeXWasmExports | null = null;
// Linear memory buffer
let memory: ArrayBuffer | undefined = undefined;
// Page count for the WASM memory allocation
const PAGES = 1100;

// ─── TeX Engine State ─────────────────────────────────────────────────────────

// Input string fed to TeX (mirrors original's `xq`)
let inputBuffer = '';
// Promise resolved by tex_final_end (mirrors original's `Oq`)
let texDoneResolve: (() => void) | undefined = undefined;

// ─── Console Output ───────────────────────────────────────────────────────────

let consoleBuffer = '';
const texLogs: string[] = [];
function writeToConsole(x: string) {
  consoleBuffer += x;
  if (consoleBuffer.indexOf('\n') >= 0) {
    const lines = consoleBuffer.split('\n');
    consoleBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.length > 0) {
        texLogs.push(line);
      }
    }
  }
}

// ─── Filesystem Helpers ───────────────────────────────────────────────────────

export function deleteEverything() {
  files = [];
  preloadedFiles = {};
  memory = undefined;
  wasmExports = null;
  consoleBuffer = '';
  inputBuffer = '';
  texDoneResolve = undefined;
}

export function writeFileSync(filename: string, content: Uint8Array) {
  preloadedFiles[filename] = content;
}

export function readFileSync(filename: string): Uint8Array {
  for (const f of files) {
    if (f.filename === filename) {
      return f.content.slice(0, f.position);
    }
  }
  const available = files.map(f => f.filename).join(', ');
  throw new Error(`Could not find file ${filename}. Available: [${available}]`);
}

export function setMemory(m: ArrayBuffer) {
  memory = m;
}

export function setInput(input: string) {
  inputBuffer = input;
}

// ─── Asyncify-aware openSync ─────────────────────────────────────────────────
//
// All available TeX files are pre-sent to the worker by the main thread.
// If a file isn't in preloadedFiles, it simply doesn't exist — mark erstat=1.
// .tfm font metrics are served from the dvi2html bundle.
//
function openSync(filename: string, mode: string): number {
  let content: Uint8Array<ArrayBufferLike> = new Uint8Array();

  if (preloadedFiles[filename]) {
    content = preloadedFiles[filename];
  } else if (filename.endsWith('.tfm')) {
    const fontName = filename.replace(/\.tfm$/, '');
    const data = lookupTfmData(fontName);
    if (data) content = data;
  } else {
    // Check if this file was generated during the current run (like input.aux)
    // Search backwards to get the most recent version of the file
    const generatedFile = files
      .slice()
      .reverse()
      .find(f => f.filename === filename);

    if (generatedFile) {
      // Copy only the actual written bytes (the underlying buffer is over-allocated)
      content = generatedFile.content.slice(0, generatedFile.position);
    } else if (mode === 'r') {
      // File not available — mark as missing so TeX can handle the error gracefully
      files.push({ filename, erstat: 1, content: new Uint8Array(), position: 0 });
      return files.length - 1;
    }
  }

  files.push({
    filename,
    position: 0,
    erstat: 0,
    content,
    eof: false,
    eoln: false
  });
  return files.length - 1;
}

// ─── Time Functions ───────────────────────────────────────────────────────────

export function getCurrentMinutes(): number {
  const d = new Date();
  return 60 * d.getHours() + d.getMinutes();
}
export function getCurrentDay(): number {
  return new Date().getDate();
}
export function getCurrentMonth(): number {
  return new Date().getMonth() + 1;
}
export function getCurrentYear(): number {
  return new Date().getFullYear();
}

// ─── Text Encoding ────────────────────────────────────────────────────────────

const textDecoder: TextDecoder | undefined =
  typeof TextDecoder !== 'undefined' ? new TextDecoder() : undefined;
const textEncoder: TextEncoder | undefined =
  typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined;

// ─── Print Functions ──────────────────────────────────────────────────────────

export function printString(descriptor: number, x: number) {
  if (!memory) return;
  const file = descriptor < 0 ? null : files[descriptor];
  const length = new Uint8Array(memory, x, 1)[0];
  const buf = new Uint8Array(memory, x + 1, length);
  const string = textDecoder?.decode(buf) ?? '';

  if (!file || file.stdout) {
    writeToConsole(string);
    return;
  }
  writeContent(file, textEncoder?.encode(string) ?? new Uint8Array());
}

export function printBoolean(descriptor: number, x: boolean) {
  const file = descriptor < 0 ? null : files[descriptor];
  const result = x ? 'TRUE' : 'FALSE';
  if (!file || file.stdout) {
    writeToConsole(result);
    return;
  }
  writeContent(file, textEncoder?.encode(result) ?? new Uint8Array());
}

export function printChar(descriptor: number, x: number) {
  const file = descriptor < 0 ? null : files[descriptor];
  if (!file || file.stdout) {
    writeToConsole(String.fromCharCode(x));
    return;
  }
  writeContent(file, new Uint8Array([x]));
}

export function printInteger(descriptor: number, x: number) {
  const file = descriptor < 0 ? null : files[descriptor];
  const str = x.toString();
  if (!file || file.stdout) {
    writeToConsole(str);
    return;
  }
  writeContent(file, textEncoder?.encode(str) ?? new Uint8Array());
}

export function printFloat(descriptor: number, x: number) {
  const file = descriptor < 0 ? null : files[descriptor];
  const str = x.toString();
  if (!file || file.stdout) {
    writeToConsole(str);
    return;
  }
  writeContent(file, textEncoder?.encode(str) ?? new Uint8Array());
}

export function printNewline(descriptor: number) {
  const file = descriptor < 0 ? null : files[descriptor];
  if (!file || file.stdout) {
    writeToConsole('\n');
    return;
  }
  writeContent(file, textEncoder?.encode('\n') ?? new Uint8Array());
}

function writeContent(file: VirtualFile, buf: Uint8Array, offset = 0, len = buf.length - offset) {
  while (len > file.content.length - file.position) {
    const b = new Uint8Array(1 + file.content.length * 2);
    b.set(file.content);
    file.content = b;
  }
  file.content.subarray(file.position).set(buf.subarray(offset, offset + len));
  file.position += len;
}

// ─── WASM File I/O Imports ────────────────────────────────────────────────────

export function reset(length: number, pointer: number): number {
  if (!memory) return -1;
  let filename = textDecoder?.decode(new Uint8Array(memory, pointer, length)) ?? '';
  filename = filename.replace(/ +$/g, '');
  filename = filename.replace(/^\*/, '');
  filename = filename.replace(/^TeXfonts:/, '');
  filename = filename.replace(/"/g, '');

  if (filename === 'TeXformats:TEX.POOL') filename = 'tex.pool';

  if (filename === 'TTY:') {
    files.push({
      filename: 'stdin',
      stdin: true,
      position: 0,
      erstat: 0,
      content: new Uint8Array()
    });
    return files.length - 1;
  }

  return openSync(filename, 'r');
}

export function rewrite(length: number, pointer: number): number {
  if (!memory) return -1;
  let filename = textDecoder?.decode(new Uint8Array(memory, pointer, length)) ?? '';
  filename = filename.replace(/ +$/g, '');
  filename = filename.replace(/"/g, '');

  if (filename === 'TTY:') {
    files.push({
      filename: 'stdout',
      stdout: true,
      position: 0,
      erstat: 0,
      content: new Uint8Array()
    });
    return files.length - 1;
  }

  return openSync(filename, 'w');
}

export function inputln(
  descriptor: number,
  bypass_eof: number,
  buffer_pointer: number,
  first_pointer: number,
  last_pointer: number,
  max_length_pointer: number,
  length: number
): number {
  if (!memory) return 0;
  const file = files[descriptor];

  // stdin: serve from inputBuffer
  if (file.stdin) {
    const r = new Uint8Array(memory, buffer_pointer, length);
    const X = new Uint32Array(memory, first_pointer, 4);
    const H = new Uint32Array(memory, last_pointer, 4);
    H[0] = X[0];

    const encoded = textEncoder?.encode(inputBuffer) ?? new Uint8Array();

    // Advance past the \n from the previous read (mirrors the file-read branch)
    if (bypass_eof && !file.eof && file.eoln) {
      file.position = file.position + 1;
    }

    let t = encoded.indexOf(10, file.position);
    if (t < 0) t = encoded.length;

    if (file.position >= encoded.length) {
      file.eof = true;
      return 0;
    }

    const sourceSlice = encoded.subarray(file.position, t);
    r.subarray(X[0]).set(sourceSlice);
    H[0] = X[0] + t - file.position;
    while (H[0] > X[0] && r[H[0] - 1] === 32) H[0]--;
    file.position = t;
    file.eoln = true;
    return 1;
  }

  const r = new Uint8Array(memory, buffer_pointer, length);
  const X = new Uint32Array(memory, first_pointer, 4);
  const H = new Uint32Array(memory, last_pointer, 4);
  H[0] = X[0];

  if (bypass_eof && !file.eof && file.eoln) {
    file.position = file.position + 1;
  }

  let startPos = file.position;
  if (file.position === 1 && !file.eoln) {
    startPos = 0;
  }

  let t = file.content.indexOf(10, startPos);
  if (t < 0) t = file.content.length;

  if (startPos >= file.content.length) {
    file.eof = true;
    return 0;
  }

  const sourceSlice = file.content.subarray(startPos, t);
  r.subarray(X[0]).set(sourceSlice);
  H[0] = X[0] + t - startPos;
  while (H[0] > X[0] && r[H[0] - 1] === 32) H[0]--;
  file.position = t;
  file.eoln = true;
  return 1;
}

export function tex_final_end() {
  // TeX engine signals it is done — resolve the compile promise
  if (texDoneResolve) {
    texDoneResolve();
    texDoneResolve = undefined;
  }
}

export function close(descriptor: number) {
  // No-op: files are kept in memory for reading after close
}

export function eof(descriptor: number): number {
  const file = files[descriptor];
  return file && file.eof ? 1 : 0;
}

export function erstat(descriptor: number): number {
  const file = files[descriptor];
  return file ? file.erstat : 0;
}

export function eoln(descriptor: number): number {
  const file = files[descriptor];
  return file && file.eoln ? 1 : 0;
}

export function get(descriptor: number, pointer: number, length: number) {
  if (!memory) return;
  const file = files[descriptor];
  const buffer = new Uint8Array(memory);

  if (file.stdin) {
    const encoded = textEncoder?.encode(inputBuffer) ?? new Uint8Array();
    if (file.position >= encoded.length) {
      buffer[pointer] = 13;
      file.eof = true;
      file.eoln = true;
    } else {
      buffer[pointer] = encoded[file.position];
    }
  } else {
    if (file.position >= file.content.length) {
      buffer[pointer] = 0;
      file.eof = true;
      file.eoln = true;
      return;
    }
    buffer[pointer] = file.content[file.position];
  }

  file.eoln = false;
  if (buffer[pointer] === 10 || buffer[pointer] === 13) {
    file.eoln = true;
  }
  file.position += length;
}

export function put(descriptor: number, pointer: number, length: number) {
  if (!memory) return;
  const file = files[descriptor];
  const buffer = new Uint8Array(memory);
  writeContent(file, buffer, pointer, length);
}

// ─── Main Compile Function ────────────────────────────────────────────────────

async function compile(code: string, filesMap: Record<string, Uint8Array>): Promise<Uint8Array> {
  deleteEverything();

  // Strip the ObsiTeXState comment to prevent WebAssembly/TeX line buffer out-of-bounds crashes
  const strippedCode = code.replace(/%.*\[ObsiTeXState:.*\].*/g, '');

  // Populate preloaded file dict (excludes the WASM binary and core dump)
  for (const [filepath, content] of Object.entries(filesMap)) {
    if (filepath !== 'tex.wasm' && filepath !== 'core.dump') {
      writeFileSync(filepath, content);
    }
  }

  const wasmBinary = filesMap['tex.wasm'];
  const coreDump = filesMap['core.dump'];

  if (!wasmBinary) throw new Error('Missing tex.wasm binary');
  if (!coreDump) throw new Error('Missing core.dump binary');

  // Build the TeX source.
  // The core.dump file is pre-loaded with \documentclass[margin=0pt]{standalone}
  // and \usepackage{tikz} already executed, so we must strip any duplicate declarations
  // of \documentclass or \usepackage{tikz} to avoid "Two \documentclass" or package errors.
  let input: string;
  if (strippedCode.includes('\\begin{document}')) {
    let cleanCode = strippedCode.replace(/\\documentclass\s*(\[[^\]]*\])?\s*\{[^}]*\}/g, '');
    cleanCode = cleanCode.replace(/\\usepackage\s*(\[[^\]]*\])?\s*\{tikz\}/g, '');
    input = `\n${cleanCode}`;
  } else {
    let cleanCode = strippedCode.replace(/\\documentclass\s*(\[[^\]]*\])?\s*\{[^}]*\}/g, '');
    cleanCode = cleanCode.replace(/\\usepackage\s*(\[[^\]]*\])?\s*\{tikz\}/g, '');

    // Split cleanCode into preamble and body. Preamble commands (like \usepackage,
    // \usetikzlibrary, \newcommand, etc.) must go before \begin{document}.
    const lines = cleanCode.split('\n');
    const preambleLines: string[] = [];
    const bodyLines: string[] = [];
    let inPreamble = true;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inPreamble) preambleLines.push(line);
        else bodyLines.push(line);
        continue;
      }
      if (trimmed.startsWith('%')) {
        if (inPreamble) preambleLines.push(line);
        else bodyLines.push(line);
        continue;
      }

      const isPreambleCommand =
        trimmed.startsWith('\\usepackage') ||
        trimmed.startsWith('\\usetikzlibrary') ||
        trimmed.startsWith('\\newcommand') ||
        trimmed.startsWith('\\renewcommand') ||
        trimmed.startsWith('\\def') ||
        trimmed.startsWith('\\let') ||
        trimmed.startsWith('\\pgfplotsset') ||
        trimmed.startsWith('\\tikzset') ||
        trimmed.startsWith('\\usepgfplotslibrary');

      if (inPreamble && isPreambleCommand) {
        preambleLines.push(line);
      } else {
        inPreamble = false;
        bodyLines.push(line);
      }
    }

    input = `\n${preambleLines.join('\n')}
\\begin{document}
${bodyLines.join('\n')}
\\end{document}
`;
  }

  // Write input to the virtual fs; TeX engine outputs input.dvi
  writeFileSync('input.tex', textEncoder?.encode(input) ?? new Uint8Array());

  // Set up WASM memory and load the core dump (TeX format file)
  const memoryInstance = new WebAssembly.Memory({ initial: PAGES, maximum: PAGES });
  new Uint8Array(memoryInstance.buffer, 0, PAGES * 65536).set(coreDump);
  setMemory(memoryInstance.buffer);

  // Keep the leading space, but remove the newline between the commands
  setInput(' \\nonstopmode\\input input.tex \n');

  // Create the deferred promise — tex_final_end will resolve it
  const texDone = new Promise<void>(resolve => {
    texDoneResolve = resolve;
  });

  const importObject = {
    library: {
      deleteEverything,
      writeFileSync,
      readFileSync,
      getCurrentMinutes,
      getCurrentDay,
      getCurrentMonth,
      getCurrentYear,
      printString,
      printBoolean,
      printChar,
      printInteger,
      printFloat,
      printNewline,
      reset,
      rewrite,
      inputln,
      close,
      eof,
      erstat,
      eoln,
      get,
      put,
      tex_final_end
    },
    env: {
      memory: memoryInstance
    }
  };

  const wasmResult = await WebAssembly.instantiate(wasmBinary.buffer ?? wasmBinary, importObject);
  wasmExports = (wasmResult as unknown as WebAssembly.WebAssemblyInstantiatedSource).instance
    .exports as unknown as TeXWasmExports;

  // Kick off the TeX engine. It may asyncify-unwind multiple times (to load
  // missing files on demand); each time it does, openSync schedules a rewind
  // via setTimeout so the microtask queue drains before we re-enter main().
  if (wasmExports) {
    wasmExports.main();
    wasmExports.asyncify_stop_unwind?.();
  }

  if (texDoneResolve) {
    texDoneResolve = undefined;
    throw new Error('TeX engine halted or exited without signaling completion.');
  }

  // Wait for tex_final_end to be called — signals successful compilation
  await texDone;

  // Read the DVI output file
  return readFileSync('input.dvi');
}

// ─── Worker Message Handling ──────────────────────────────────────────────────

self.addEventListener('message', (e: MessageEvent) => {
  const { type, code, files } = e.data as {
    type: string;
    code: string;
    files: Record<string, Uint8Array>;
  };

  if (type === 'compile') {
    texLogs.length = 0;
    void (async () => {
      try {
        const dvi = await compile(code, files);
        (
          self as unknown as { postMessage(message: unknown, transfer?: Transferable[]): void }
        ).postMessage({ type: 'success', dvi }, [dvi.buffer]);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        (
          self as unknown as { postMessage(message: unknown, transfer?: Transferable[]): void }
        ).postMessage({ type: 'error', error: `${errMsg}\nTeX logs:\n${texLogs.join('\n')}` });
      }
    })();
  }
});
