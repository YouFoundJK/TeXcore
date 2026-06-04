import { MockAppBuilder } from './AppBuilder';
import { FileBuilder } from './FileBuilder';
import { TFile, TFolder } from 'obsidian';

describe('MockVault API tests', () => {
  it('verify vault basic properties and name', () => {
    const app = MockAppBuilder.make().file('test.md', new FileBuilder().text('hello')).done();
    const vault = app.vault;

    expect(vault.getName()).toBe('Mock Vault');
    expect(vault.getRoot().isRootVal).toBe(true);
    expect(vault.getRoot().name).toBe('');
  });

  it('verify getFileByPath, getFolderByPath, getFiles, getMarkdownFiles, getAllFolders', async () => {
    const app = MockAppBuilder.make()
      .file('root.md', new FileBuilder().text('root'))
      .folder(
        new MockAppBuilder('folder1')
          .file('sub.md', new FileBuilder().text('sub'))
          .file('sub.txt', new FileBuilder().text('text file'))
      )
      .done();
    const vault = app.vault;

    // getFileByPath
    const rootFile = vault.getFileByPath('root.md');
    expect(rootFile).toBeInstanceOf(TFile);
    expect(rootFile?.name).toBe('root.md');

    const missingFile = vault.getFileByPath('does-not-exist.md');
    expect(missingFile).toBeNull();

    const notAFile = vault.getFileByPath('folder1');
    expect(notAFile).toBeNull();

    // getFolderByPath (returns null in MockVault, but we call it to cover the method)
    const folder = vault.getFolderByPath('folder1');
    expect(folder).toBeNull();

    // getFiles & getMarkdownFiles
    const allFiles = vault.getFiles();
    expect(allFiles.length).toBe(3); // root.md, sub.md, sub.txt
    const mdFiles = vault.getMarkdownFiles();
    expect(mdFiles.length).toBe(2); // root.md, sub.md

    // getAllFolders
    const allFolders = vault.getAllFolders();
    expect(allFolders.length).toBe(2); // root, folder1
  });

  it('verify create, createFolder, delete, trash, modify, copy, read errors', async () => {
    const app = MockAppBuilder.make().done();
    const vault = app.vault;

    // createFolder
    const folder1 = await vault.createFolder('folder1');
    expect(folder1).toBeInstanceOf(TFolder);
    expect(folder1.name).toBe('folder1');

    // create file
    const file1 = await vault.create('folder1/file1.md', 'hello world');
    expect(file1).toBeInstanceOf(TFile);
    expect(file1.name).toBe('file1.md');

    // create duplicate error
    expect(() => vault.create('folder1/file1.md', 'dup')).toThrow('File already exists.');

    // create file inside non-existent parent error
    expect(() => vault.create('folder2/file2.md', 'no parent')).toThrow(
      'Parent path is not folder.'
    );

    // read file
    const data = await vault.read(file1);
    expect(data).toBe('hello world');

    // read invalid file path error
    const fakeFile = new TFile();
    fakeFile.name = 'fake.md';
    // path is empty, which joins to "/." or throws
    expect(() => vault.read(fakeFile)).toThrow('File at path /fake.md does not have contents');

    // modify file
    await vault.modify(file1, 'modified contents');
    expect(await vault.read(file1)).toBe('modified contents');

    // copy file
    const copiedFile = await vault.copy(file1, 'folder1/copied.md');
    expect(copiedFile).toBeInstanceOf(TFile);
    expect(copiedFile.name).toBe('copied.md');
    expect(await vault.read(copiedFile)).toBe('modified contents');

    // copy folder error (not supported)
    const fakeFolderAsFile = new TFolder();
    await expect(vault.copy(fakeFolderAsFile as any, 'copied_folder')).rejects.toThrow(
      'MockVault.copy only supports TFile in this mock.'
    );

    // delete file
    await vault.delete(copiedFile);
    expect(vault.getFileByPath('folder1/copied.md')).toBeNull();

    // trash file (delegates to delete)
    await vault.trash(file1, false);
    expect(vault.getFileByPath('folder1/file1.md')).toBeNull();
  });

  it('verify rename file and folder', async () => {
    const app = MockAppBuilder.make()
      .folder(new MockAppBuilder('folder1').file('sub.md', new FileBuilder().text('sub')))
      .done();
    const vault = app.vault;

    const subFile = vault.getFileByPath('folder1/sub.md');
    expect(subFile).not.toBeNull();

    // rename file
    if (subFile) {
      await vault.rename(subFile, 'folder1/new_sub.md');
      expect(vault.getFileByPath('folder1/sub.md')).toBeNull();
      const renamed = vault.getFileByPath('folder1/new_sub.md');
      expect(renamed).not.toBeNull();
      expect(await vault.read(renamed!)).toBe('sub\n');
    }

    // create another folder
    const folder2 = await vault.createFolder('folder2');

    // rename folder
    const folder1 = vault.getAbstractFileByPath('folder1');
    expect(folder1).toBeInstanceOf(TFolder);
    if (folder1) {
      await vault.rename(folder1, 'folder2/folder1_moved');
      expect(vault.getAbstractFileByPath('folder1')).toBeNull();
      const movedFolder = vault.getAbstractFileByPath('folder2/folder1_moved');
      expect(movedFolder).toBeInstanceOf(TFolder);
      const movedFile = vault.getFileByPath('folder2/folder1_moved/new_sub.md');
      expect(movedFile).not.toBeNull();
      expect(await vault.read(movedFile!)).toBe('sub\n');
    }
  });

  it('verify rename errors', async () => {
    const app = MockAppBuilder.make().file('file1.md', new FileBuilder().text('hello')).done();
    const vault = app.vault;

    const file1 = vault.getFileByPath('file1.md');
    expect(file1).not.toBeNull();

    if (file1) {
      // rename to non-existent folder
      expect(() => vault.rename(file1, 'nonexistent/file1.md')).toThrow(
        'No such folder: nonexistent'
      );

      // rename file without contents
      const fakeFile = new TFile();
      fakeFile.name = 'fake.md';
      fakeFile.parent = vault.getRoot();
      expect(() => vault.rename(fakeFile, 'file_renamed.md')).toThrow(
        'File did not have contents: fake.md'
      );
    }

    // rename invalid type error
    const fakeObject = { path: 'fake' } as any;
    expect(() => vault.rename(fakeObject, 'renamed')).toThrow('File is not a file or folder');
  });

  it('verify unimplemented / stub methods on vault, app, cache', async () => {
    const app = MockAppBuilder.make().file('test.md', new FileBuilder().text('hello')).done();
    const vault = app.vault;
    const cache = app.metadataCache;

    // MockApp stubs
    expect(app.isDarkMode()).toBe(false);
    app.loadLocalStorage();
    app.saveLocalStorage();

    // MockCache stubs
    const file = vault.getFileByPath('test.md')!;
    expect(() => cache.getFirstLinkpathDest('link', 'source')).toThrow('Method not implemented.');
    expect(() => cache.fileToLinktext(file, 'source')).toThrow('Method not implemented.');
    expect(() => cache.on('changed', () => {})).toThrow('Method not implemented.');
    expect(() => cache.off('changed', () => {})).toThrow('Method not implemented.');
    expect(() => cache.offref({} as any)).toThrow('Method not implemented.');
    expect(() => cache.trigger('changed')).toThrow('Method not implemented.');
    expect(() => cache.tryTrigger({} as any, [])).toThrow('Method not implemented.');

    // MockVault unimplemented methods
    expect(() => vault.append(file, 'data')).toThrow('Method not implemented.');
    expect(() => vault.appendBinary(file, new ArrayBuffer(0))).toThrow('Method not implemented.');
    expect(() => vault.createBinary('path.png', new ArrayBuffer(0))).toThrow(
      'Method not implemented.'
    );
    expect(() => vault.readBinary(file)).toThrow('Method not implemented.');
    expect(() => vault.modifyBinary(file, new ArrayBuffer(0))).toThrow('Method not implemented.');
    expect(() => vault.getResourcePath(file)).toThrow('Method not implemented.');
    expect(() => vault.on('create', () => {})).toThrow('Method not implemented.');
    expect(() => vault.off('create', () => {})).toThrow('Method not implemented.');
    expect(() => vault.offref({} as any)).toThrow('Method not implemented.');
    expect(() => vault.trigger('create')).toThrow('Method not implemented.');
    expect(() => vault.tryTrigger({} as any, [])).toThrow('Method not implemented.');
    expect(() => vault.process(file, d => d)).toThrow('Method not implemented.');
    vault.loadLocalStorage();
    vault.saveLocalStorage();
  });
});
