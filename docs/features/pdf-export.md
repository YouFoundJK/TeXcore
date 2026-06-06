# PDF Compilation & Export

TeXcore provides an advanced PDF rendering module to export your mathematical notes with full math layout support. Accessible via ++ctrl+p++ (search `Export current file to PDF`) or by right-clicking any file/folder in the file explorer to choose **Better Export PDF**, this modal splits into a real-time responsive 2/3 preview pane and a 1/3 export configuration sidebar.

---

## Core Layout Settings

Customize document geometry, printing limits, and margins before compilation.

| Control Option | Description | Typical Options |
| :--- | :--- | :--- |
| **Page Size** | Select standard sheet geometry or define millimeters. | `A4`, `Letter`, `Legal`, `Tabloid`, or `Custom` |
| **Orientation** | Vertical portrait layout or horizontal landscape. | `Portrait`, `Landscape` |
| **Margins** | Inner safety margins specified in millimeters per edge. | `None`, `Default (10mm)`, `Small`, or `Custom` |
| **Downscale** | Scales content down (0–100%) to fit complex tables/formulas. | Integer slider percentage |

---

## Headers & Footers Configuration

Headers and footers render HTML dynamically using dedicated style selectors.

### HTML Template Classes
Include these target element class names in your header/footer HTML code. TeXcore will parse and replace them with print values:

- `<span class="title"></span>`: Resolves to note file title.
- `<span class="pageNumber"></span>`: Resolves to current page index.
- `<span class="totalPages"></span>`: Resolves to total compiled pages.
- `<span class="date"></span>`: Inserts local print timestamp.
- `<span class="url"></span>`: Inserts workspace source path.

=== "Header Template"
    ```html
    <div style="width: 100vw; font-size: 10px; text-align: center;">
      <span class="title"></span>
    </div>
    ```

=== "Footer Template"
    ```html
    <div style="width: 100vw; font-size: 10px; text-align: center;">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>
    ```

---

## Accessing Custom CSS Styling

Style your PDF print outputs independently of Obsidian's active theme. 

1. Write a custom `.css` template sheet and save it inside your vault folder: `.obsidian/snippets/`.
2. Keep this snippet **disabled** in Obsidian settings. This prevents it from altering your editor UI.
3. Open the TeXcore Export Dialog, and choose your stylesheet in the dropdown menu. The snippet's styling will be injected exclusively during PDF compilation.

---

## Advanced Compiler Operations

???+ info "Batch Compilation & Tables of Contents"
    When right-clicking a folder, you can choose **Export each file to PDF** to compile all children in parallel. The **Generate TOC.md file** action generates a table of contents file (`_TOC_.md`) automatically. Configure parallel limits under the [Settings Reference](configuration/settings.md#limit-concurrent-renders).

???+ warning "Metadata & Bookmark Outlines"
    If enabled in [Settings Panel](configuration/settings.md#pdf-metadata), TeXcore compiles Frontmatter fields (`title`, `author`, `keywords`, `subject`) into metadata tags inside the output PDF. Outlines index heading levels 1 through 6 dynamically depending on user preferences.

---

## Troubleshooting Print Errors

!!! failure "Common Rendering Obstacles"
    - **Broken Equations / Untagged Math**: If preview is incomplete, wait a few seconds before hitting export. MathJax runs asynchronously and needs time to process large nodes.
    - **Missing Snippet Styles**: Double check that your snippet stylesheet is in `.obsidian/snippets/` and is *disabled* in standard Obsidian settings.
    - **Write Failures**: Ensure the output path is writable and not locked by another PDF reader app.
    - **Webview Crashes**: If errors persist, enable **Debug Mode** in the [Settings Reference](configuration/settings.md#debug-mode) and click the **Debug** button in the modal to inspect the Electron DevTools container.
