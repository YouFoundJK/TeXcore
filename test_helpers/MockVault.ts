import {
  DataAdapter,
  DataWriteOptions,
  EventRef,
  TAbstractFile,
  TFile,
  TFolder,
  Vault
} from 'obsidian';

const normalizeSlashes = (value: string): string => value.replace(/\\/g, '/');
const joinPath = (...parts: string[]): string => {
  const joined = parts
    .map(normalizeSlashes)
    .filter((part, index) => (part !== '' && part !== '.') || index === 0)
    .join('/')
    .replace(/\/+/, '/');
  return joined === '' ? '.' : joined;
};
const dirName = (path: string): string => {
  const normalized = normalizeSlashes(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash > 0 ? normalized.slice(0, lastSlash) : '';
};
const baseName = (path: string): string => {
  const normalized = normalizeSlashes(path);
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
};

const collectChildren = (folder: TFolder): TAbstractFile[] => {
  return folder.children.flatMap(f => {
    if (f instanceof TFolder) {
      return [f, ...collectChildren(f)];
    } else {
      return f;
    }
  });
};

export class MockVault implements Vault {
  root: TFolder;
  contents: Map<string, string>;

  constructor(root: TFolder, contents: Map<string, string>) {
    this.root = root;
    this.contents = contents;
  }

  adapter: DataAdapter = {} as DataAdapter;
  configDir: string = '';

  getName(): string {
    return 'Mock Vault';
  }

  getAllLoadedFiles(): TAbstractFile[] {
    return [this.root, ...collectChildren(this.root)];
  }

  getAbstractFileByPath(path: string): TAbstractFile | null {
    const normalize = (p: string) => p.replace(/\\/g, '/').replace(/^\//, '');
    const normalizedPath = normalize(path);

    if (normalizedPath === '') {
      return this.root;
    }

    const parts = normalizedPath.split('/');
    let current: TAbstractFile | undefined = this.root;

    for (const part of parts) {
      if (!(current instanceof TFolder)) {
        return null;
      }
      current = current.children.find(child => child.name === part);
      if (!current) {
        return null;
      }
    }
    return current || null;
  }

  read(file: TFile): Promise<string> {
    const p = joinPath('/', file.path);
    const contents = this.contents.get(p);
    if (!contents) {
      throw new Error(`File at path ${p} does not have contents`);
    }
    return Promise.resolve(contents);
  }

  getFileByPath(path: string): TFile | null {
    const file = this.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return file;
    }
    return null;
  }

  getFolderByPath(path: string): TFolder | null {
    console.warn(`MockVault.getFolderByPath called with: ${path}`);
    return null;
  }
  getRoot(): TFolder {
    return this.root;
  }

  cachedRead(file: TFile): Promise<string> {
    return this.read(file);
  }

  cachedReadSync(file: TFile): string {
    const p = joinPath('/', file.path);
    return this.contents.get(p) ?? '';
  }

  getFiles(): TFile[] {
    return this.getAllLoadedFiles().flatMap(f => (f instanceof TFile ? f : []));
  }

  getMarkdownFiles(): TFile[] {
    return this.getFiles().filter(f => f.extension.toLowerCase() === 'md');
  }

  private setParent(path: string, f: TAbstractFile) {
    const parentPath = dirName(path);
    const folder = this.getAbstractFileByPath(parentPath);
    if (folder instanceof TFolder) {
      f.parent = folder;
      folder.children.push(f);
      return;
    }
    throw new Error('Parent path is not folder.');
  }

  create(path: string, data: string, options?: DataWriteOptions): Promise<TFile> {
    if (this.getAbstractFileByPath(path)) {
      throw new Error('File already exists.');
    }
    const file = new TFile();
    file.name = baseName(path);
    this.setParent(path, file);
    this.contents.set(joinPath('/', path), data);
    return Promise.resolve(file);
  }
  createFolder(path: string): Promise<TFolder> {
    const folder = new TFolder();
    folder.name = baseName(path);
    this.setParent(path, folder);
    return Promise.resolve(folder);
  }

  delete(file: TAbstractFile, force?: boolean): Promise<void> {
    if (file.parent) {
      const index = file.parent.children.indexOf(file);
      if (index > -1) {
        file.parent.children.splice(index, 1);
      }
    }
    this.contents.delete(joinPath('/', file.path));
    return Promise.resolve();
  }
  trash(file: TAbstractFile, system: boolean): Promise<void> {
    return this.delete(file);
  }
  process(file: TFile, fn: (data: string) => string, options?: DataWriteOptions): Promise<string> {
    throw new Error('Method not implemented.');
  }

  getAllFolders(): TFolder[] {
    return this.getAllLoadedFiles().filter((f): f is TFolder => f instanceof TFolder);
  }
  rename(file: TAbstractFile, newPath: string): Promise<void> {
    const newParentPath = dirName(newPath);
    const newParent = this.getAbstractFileByPath(newParentPath);
    if (!(newParent instanceof TFolder)) {
      throw new Error(`No such folder: ${newParentPath}`);
    }

    if (file.parent) {
      const index = file.parent.children.indexOf(file);
      if (index > -1) {
        file.parent.children.splice(index, 1);
      }
    }
    newParent.children.push(file);

    if (file instanceof TFile) {
      const contents = this.contents.get(joinPath('/', file.path));
      if (!contents) {
        throw new Error(`File did not have contents: ${file.path}`);
      }
      this.contents.delete(joinPath('/', file.path));

      file.parent = newParent;
      file.name = baseName(newPath);
      this.contents.set(joinPath('/', file.path), contents);
    } else if (file instanceof TFolder) {
      const filesAndContents = collectChildren(file)
        .flatMap(f => (f instanceof TFile ? f : []))
        .map((f): [TFile, string] => {
          const contents = this.contents.get(joinPath('/', f.path));
          if (!contents) {
            throw new Error(`File did not have contents: ${f.path}`);
          }
          this.contents.delete(joinPath('/', f.path));
          return [f, contents];
        });

      file.parent = newParent;
      file.name = baseName(newPath);

      for (const [f, contents] of filesAndContents) {
        this.contents.set(joinPath('/', f.path), contents);
      }
    } else {
      throw new Error(`File is not a file or folder: ${file.path}`);
    }
    return Promise.resolve();
  }

  modify(file: TFile, data: string, options?: DataWriteOptions): Promise<void> {
    this.contents.set(joinPath('/', file.path), data);
    return Promise.resolve();
  }
  loadLocalStorage(): void {}

  saveLocalStorage(): void {}

  async copy<T extends TAbstractFile>(file: T, newPath: string): Promise<T> {
    if (!(file instanceof TFile)) {
      throw new Error('MockVault.copy only supports TFile in this mock.');
    }
    const data = await this.read(file);
    const newFile = await this.create(newPath, data);
    return newFile as unknown as T;
  }

  on(name: 'create', callback: (file: TAbstractFile) => unknown, ctx?: unknown): EventRef;
  on(name: 'modify', callback: (file: TAbstractFile) => unknown, ctx?: unknown): EventRef;
  on(name: 'delete', callback: (file: TAbstractFile) => unknown, ctx?: unknown): EventRef;
  on(
    name: 'rename',
    callback: (file: TAbstractFile, oldPath: string) => unknown,
    ctx?: unknown
  ): EventRef;
  on(name: 'closed', callback: () => unknown, ctx?: unknown): EventRef;
  on(name: unknown, callback: unknown, ctx?: unknown): EventRef {
    throw new Error('Method not implemented.');
  }
  off(name: string, callback: (...data: unknown[]) => unknown): void {
    throw new Error('Method not implemented.');
  }
  offref(ref: EventRef): void {
    throw new Error('Method not implemented.');
  }
  trigger(name: string, ...data: unknown[]): void {
    throw new Error('Method not implemented.');
  }
  tryTrigger(evt: EventRef, args: unknown[]): void {
    throw new Error('Method not implemented.');
  }
  append(file: TFile, data: string, options?: DataWriteOptions): Promise<void> {
    throw new Error('Method not implemented.');
  }

  appendBinary(file: TFile, data: ArrayBuffer, options?: DataWriteOptions): Promise<void> {
    throw new Error('Method not implemented.');
  }

  createBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<TFile> {
    throw new Error('Method not implemented.');
  }
  readBinary(file: TFile): Promise<ArrayBuffer> {
    throw new Error('Method not implemented.');
  }

  modifyBinary(file: TFile, data: ArrayBuffer, options?: DataWriteOptions): Promise<void> {
    throw new Error('Method not implemented.');
  }

  getResourcePath(file: TFile): string {
    throw new Error('Method not implemented.');
  }
}
