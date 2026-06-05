/* eslint-disable */
import { tfmData } from 'dvi2html';

interface VirtualFile {
  filename: string;
  position: number;
  erstat: number;
  buffer: Uint8Array;
  descriptor?: number;
  stdin?: boolean;
  stdout?: boolean;
  eof?: boolean;
  eoln?: boolean;
}

// Simulated virtual filesystem
let files: VirtualFile[] = [];
let virtualFilesystem: Record<string, Uint8Array> = {};

export function deleteEverything() {
  files = [];
  virtualFilesystem = {};
}

export function writeFileSync(filename: string, buffer: Uint8Array) {
  virtualFilesystem[filename] = buffer;
}

export function readFileSync(filename: string): Uint8Array {
  for (const f of files) {
    if (f.filename === filename) {
      return f.buffer.slice(0, f.position);
    }
  }
  throw new Error(`Could not find file ${filename}`);
}

function openSync(filename: string, mode: string): number {
  let buffer: any = new Uint8Array();

  if (virtualFilesystem[filename]) {
    buffer = virtualFilesystem[filename];
  }

  if (filename.endsWith('.tfm')) {
    const fontName = filename.replace(/\.tfm$/, '');
    const data = tfmData(fontName);
    if (data) {
      buffer = Uint8Array.from(data as any);
    }
  }

  files.push({
    filename: filename,
    position: 0,
    erstat: 0,
    buffer: buffer,
    descriptor: files.length
  });

  return files.length - 1;
}

function closeSync(fd: number) {
  // Ignore close sync
}

function writeSync(file: any, buffer: Uint8Array, pointer?: number, length?: number) {
  const p = pointer === undefined ? 0 : pointer;
  let len = length === undefined ? buffer.length - p : length;

  while (len > file.buffer.length - file.position) {
    const b = new Uint8Array(1 + file.buffer.length * 2);
    b.set(file.buffer);
    file.buffer = b;
  }

  file.buffer.subarray(file.position).set(buffer.subarray(p, p + len));
  file.position += len;
}

function readSync(
  file: any,
  buffer: Uint8Array,
  pointer?: number,
  length?: number,
  seek?: number
): number {
  const p = pointer === undefined ? 0 : pointer;
  let len = length === undefined ? buffer.length - p : length;
  const s = seek === undefined ? 0 : seek;

  if (len > file.buffer.length - s) {
    len = file.buffer.length - s;
  }

  buffer.subarray(p).set(file.buffer.subarray(s, s + len));
  return len;
}

// Console output collection
let consoleBuffer = '';
function writeToConsole(x: string) {
  consoleBuffer = consoleBuffer + x;
  if (consoleBuffer.indexOf('\n') >= 0) {
    const lines = consoleBuffer.split('\n');
    consoleBuffer = lines.pop() || '';
    for (const line of lines) {
      console.log(line);
    }
  }
}

const customProcess = {
  stdout: {
    write: writeToConsole
  }
};

// WebAssembly instance memory variables
let memory: ArrayBuffer | undefined = undefined;
let inputBuffer = '';
let callback: (() => void) | undefined = undefined;

export function setMemory(m: ArrayBuffer) {
  memory = m;
}

export function setInput(input: string, cb?: () => void) {
  inputBuffer = input;
  if (cb) callback = cb;
}

// Time functions requested by TeX
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

// TeX print output helper methods
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function printString(descriptor: number, x: number) {
  if (!memory) return;
  const file = descriptor < 0 ? ({ stdout: true } as any) : files[descriptor];
  const length = new Uint8Array(memory, x, 1)[0];
  const buffer = new Uint8Array(memory, x + 1, length);
  const string = textDecoder.decode(buffer);

  if (file.stdout) {
    customProcess.stdout.write(string);
    return;
  }

  writeSync(file, textEncoder.encode(string));
}

export function printBoolean(descriptor: number, x: boolean) {
  const file = descriptor < 0 ? ({ stdout: true } as any) : files[descriptor];
  const result = x ? 'TRUE' : 'FALSE';

  if (file.stdout) {
    customProcess.stdout.write(result);
    return;
  }

  writeSync(file, textEncoder.encode(result));
}

export function printChar(descriptor: number, x: number) {
  const file = descriptor < 0 ? ({ stdout: true } as any) : files[descriptor];
  if (file.stdout) {
    customProcess.stdout.write(String.fromCharCode(x));
    return;
  }

  const b = new Uint8Array([x]);
  writeSync(file, b);
}

export function printInteger(descriptor: number, x: number) {
  const file = descriptor < 0 ? ({ stdout: true } as any) : files[descriptor];
  const str = x.toString();
  if (file.stdout) {
    customProcess.stdout.write(str);
    return;
  }

  writeSync(file, textEncoder.encode(str));
}

export function printFloat(descriptor: number, x: number) {
  const file = descriptor < 0 ? ({ stdout: true } as any) : files[descriptor];
  const str = x.toString();
  if (file.stdout) {
    customProcess.stdout.write(str);
    return;
  }

  writeSync(file, textEncoder.encode(str));
}

export function printNewline(descriptor: number) {
  const file = descriptor < 0 ? ({ stdout: true } as any) : files[descriptor];
  if (file.stdout) {
    customProcess.stdout.write('\n');
    return;
  }

  writeSync(file, textEncoder.encode('\n'));
}

export function reset(length: number, pointer: number): number {
  if (!memory) return -1;
  const buffer = new Uint8Array(memory, pointer, length);
  let filename = textDecoder.decode(buffer);

  filename = filename.replace(/ +$/g, '');
  filename = filename.replace(/^\*/, '');
  filename = filename.replace(/^TeXfonts:/, '');

  if (filename === 'TeXformats:TEX.POOL') {
    filename = 'tex.pool';
  }

  if (filename === 'TTY:') {
    files.push({
      filename: 'stdin',
      stdin: true,
      position: 0,
      erstat: 0,
      buffer: new Uint8Array()
    });
    return files.length - 1;
  }

  return openSync(filename, 'r');
}

export function rewrite(length: number, pointer: number): number {
  if (!memory) return -1;
  const buffer = new Uint8Array(memory, pointer, length);
  let filename = textDecoder.decode(buffer);

  filename = filename.replace(/ +$/g, '');

  if (filename === 'TTY:') {
    files.push({
      filename: 'stdout',
      stdout: true,
      position: 0,
      erstat: 0,
      buffer: new Uint8Array()
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
  const r = new Uint8Array(memory, buffer_pointer, length);
  const X = new Uint32Array(memory, first_pointer, 4);
  const H = new Uint32Array(memory, last_pointer, 4);

  H[0] = X[0];

  if (bypass_eof && !file.eof && file.eoln) {
    file.position = file.position + 1;
  }

  let t = file.buffer.indexOf(10, file.position);
  if (t < 0) {
    t = file.buffer.length;
  }

  if (file.position >= file.buffer.length) {
    file.eof = true;
    return 0;
  }

  const sourceSlice = file.buffer.subarray(file.position, t);
  r.subarray(X[0]).set(sourceSlice);
  H[0] = X[0] + t - file.position;

  while (H[0] > X[0] && r[H[0] - 1] === 32) {
    H[0] = H[0] - 1;
  }

  file.position = t;
  file.eoln = true;
  return 1;
}

export function tex_final_end() {
  // Finalizer function called when the TeX engine completes execution.
}

export function close(descriptor: number) {
  const file = files[descriptor];
  if (file && file.descriptor !== undefined) {
    closeSync(file.descriptor);
  }
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
    if (file.position >= inputBuffer.length) {
      buffer[pointer] = 13;
      file.eof = true;
      file.eoln = true;
      if (callback) callback();
    } else {
      buffer[pointer] = inputBuffer[file.position].charCodeAt(0);
    }
  } else {
    if (file.descriptor !== undefined) {
      if (readSync(file, buffer, pointer, length, file.position) === 0) {
        buffer[pointer] = 0;
        file.eof = true;
        file.eoln = true;
        return;
      }
    } else {
      file.eof = true;
      file.eoln = true;
      return;
    }
  }

  file.eoln = false;
  if (buffer[pointer] === 10 || buffer[pointer] === 13) {
    file.eoln = true;
  }

  file.position = file.position + length;
}

export function put(descriptor: number, pointer: number, length: number) {
  if (!memory) return;
  const file = files[descriptor];
  const buffer = new Uint8Array(memory);
  writeSync(file, buffer, pointer, length);
}

// Main execution function
async function compile(
  code: string,
  preloadedFiles: Record<string, Uint8Array>
): Promise<Uint8Array> {
  deleteEverything();

  // Populate virtual filesystem
  for (const [filepath, content] of Object.entries(preloadedFiles)) {
    if (filepath !== 'tex.wasm' && filepath !== 'core.dump') {
      writeFileSync(filepath, content);
    }
  }

  const wasmBinary = preloadedFiles['tex.wasm'];
  const coreDump = preloadedFiles['core.dump'];

  if (!wasmBinary) throw new Error('Missing tex.wasm binary');
  if (!coreDump) throw new Error('Missing core.dump binary');

  // Input LaTeX code
  let input = code;
  if (!input.includes('\\begin{document}')) {
    input = '\\begin{document}\n' + input;
  }
  if (!input.includes('\\end{document}')) {
    input = input + '\n\\end{document}\n';
  }

  writeFileSync('sample.tex', textEncoder.encode(input));

  const pages = 1100;
  const memoryInstance = new WebAssembly.Memory({ initial: pages, maximum: pages });
  const memoryBuffer = new Uint8Array(memoryInstance.buffer, 0, pages * 65536);

  // Load core dump into memory
  memoryBuffer.set(coreDump);

  setMemory(memoryInstance.buffer);
  setInput(' sample.tex \n\\end\n');

  // Instantiate TeX WebAssembly
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

  await WebAssembly.instantiate(wasmBinary, importObject);

  // Read generated output DVI
  return readFileSync('sample.dvi');
}

// Worker message handling
self.addEventListener('message', async (e: MessageEvent) => {
  const { type, code, files } = e.data;

  if (type === 'compile') {
    try {
      const dvi = await compile(code, files);
      // Transfer the array buffer back for optimal performance
      (self as any).postMessage({ type: 'success', dvi }, [dvi.buffer as any]);
    } catch (err: any) {
      (self as any).postMessage({ type: 'error', error: err?.message || String(err) });
    }
  }
});
