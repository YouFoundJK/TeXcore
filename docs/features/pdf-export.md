# PDF Export

Export your notes to PDF with full equation rendering, customizable layouts, and live preview.

## Opening the Export Dialog

### Via Command Palette
1. Press `Ctrl/Cmd + P`
2. Search for "Export current file to PDF"
3. The export modal opens with a live preview

### Via File Menu
Right-click a file or folder in the file explorer → **Better Export PDF**

### Folder Export Options
For folders, you get additional options:

- **Export each file to PDF**: Creates separate PDFs for each file
- **Generate TOC.md file**: Creates a table of contents file

## Export Modal

The export dialog has two panels:

| Left Panel (2/3) | Right Panel (1/3) |
|------------------|-------------------|
| Live PDF preview | Export settings |

### Preview Features
- Real-time preview updates as you change settings
- Scales to fit the container
- Shows print dimensions for custom page sizes

## Page Settings

### Page Size
Choose from standard sizes or custom dimensions:

| Size | Dimensions (mm) |
|------|-----------------|
| A0 - A6 | Standard ISO sizes |
| Letter | 215.9 × 279.4 |
| Legal | 215.9 × 355.6 |
| Tabloid | 279.4 × 431.8 |
| Ledger | 431.8 × 279.4 |
| Custom | User-defined |

For custom sizes, enter width and height in millimeters.

### Margins

| Type | Description |
|------|-------------|
| None | No margins |
| Default | 10mm all sides |
| Small | Minimal margins |
| Custom | User-defined per side |

Custom margins are specified in millimeters for top, bottom, left, and right.

### Orientation
- **Portrait**: Standard vertical layout
- **Landscape**: Horizontal layout

### Downscale Percent
Reduce content size (0-100%). Useful for fitting more content per page.

## Header & Footer

### Toggle Display
Enable/disable headers and footers separately.

### Template Variables
Use these classes in your HTML templates:

| Class | Content |
|-------|---------|
| `date` | Formatted print date |
| `title` | Document title |
| `url` | Document location |
| `pageNumber` | Current page number |
| `totalPages` | Total page count |

### Example Templates

**Header (centered title):**
```html
<div style="width: 100vw; font-size: 10px; text-align: center;">
  <span class="title"></span>
</div>
```

**Footer (page numbers):**
```html
<div style="width: 100vw; font-size: 10px; text-align: center;">
  <span class="pageNumber"></span> / <span class="totalPages"></span>
</div>
```

## Additional Options

### Include File Name as Title
Adds an `<h1>` with the file name at the top of the PDF.

### Print Background
Include background colors and images in the PDF.

### Generate Tagged PDF
Creates an accessible PDF with document structure tags. Note: This is experimental.

### Open After Export
Automatically open the PDF after export completes.

### CSS Snippets
Apply custom CSS to the exported PDF:

1. Create a CSS file in `.obsidian/snippets/`
2. Keep the snippet **disabled** in Obsidian settings
3. Select it in the export dialog dropdown

The snippet CSS will only apply to the PDF, not your regular Obsidian view.

## Advanced Settings

### Max Heading Level
Control which headings appear in the PDF outline/bookmarks (h1-h6).

### PDF Metadata
Add frontmatter fields to PDF metadata:

```yaml
---
title: My Document
author: John Doe
keywords: math, equations
subject: Academic Paper
---
```

### Timestamp in Filename
Append export timestamp to the output filename.

### Concurrent Renders
For batch exports, limit concurrent file processing (default: 5).

## Batch Export

When exporting a folder:

1. Right-click the folder
2. Select **Export to PDF...** → **Export each file to PDF**
3. Choose output directory
4. All files export in parallel with progress indicator

## Table of Contents

Generate a TOC file for folder exports:

1. Right-click a folder
2. Select **Export to PDF...** → **Generate TOC.md file**
3. A `_TOC_.md` file is created with links to all files

The TOC uses frontmatter `toc: true` to enable special processing during export.

## Troubleshooting

### Debug Mode
Enable debug mode in settings to access the **Debug** button in the export modal, which opens browser DevTools for the preview webview.

### Common Issues

| Issue | Solution |
|-------|----------|
| Equations not rendering | Wait for preview to fully load |
| CSS not applying | Ensure snippet is disabled in Obsidian |
| Export fails | Check file permissions on output path |
