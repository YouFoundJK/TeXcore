<div align="right">
  <img src="https://img.shields.io/github/downloads/YouFoundJK/ObsiTeXcore/total?label=Downloads" alt="Downloads" />
  <a href="https://youfoundjk.github.io/ObsiTeXcore/"><img src="https://img.shields.io/badge/Version-v_0.0.1-blue" alt="Version" /></a>
</div>

# ObsiTeXcore for Obsidian

A minimalistic [Obsidian.md](https://obsidian.md/) plugin for automatic equation numbering and referencing.

📚 **[Full Documentation](https://youfoundjk.github.io/ObsiTeXcore/)**

## Key Differences from Original

This fork has been redesigned with a focus on simplicity and performance:

- **Single-note focus** — Only parses the current active note, no vault-wide scans
- **Equation-only** — No theorem/proof support, just equation referencing
- **Custom ID system** — Uses `% id: eq-xxx` LaTeX comments instead of Obsidian's block references
- **Zero dependencies** — Quick Preview and Math Links functionality built-in

## Features

### 🔢 Automatic Equation Numbering

Add a unique ID to any display math block:

```latex
$$
E = mc^2
% id: eq-einstein
$$
```

Reference it with `[[#^eq-einstein]]` and the equation is automatically numbered with `\tag{1}`.

**Numbering styles:** arabic (1, 2, 3), alph (a, b, c), Alph (A, B, C), roman (i, ii, iii), Roman (I, II, III)

### 🔗 Smart Referencing

- Type `\eqref` to trigger autocomplete with all equations in the note
- Fuzzy or simple search to find equations quickly
- Rendered math preview in suggestions
- Hover over links to see equation popups

### 📄 PDF Export

Full-featured PDF export with:

- Live preview modal
- Page size, margins, orientation settings
- Custom headers and footers
- CSS snippet support
- Batch folder export
- Table of contents generation

### ✂️ LaTeX Snippets

Create reusable LaTeX code snippets:

- Accessible via command palette
- Each snippet becomes its own command
- Assign hotkeys to frequently used snippets

### 📦 Callout Support

Math blocks work inside Obsidian callouts with automatic indentation handling:

```markdown
> [!theorem]
> $$
> x^2 + y^2 = z^2
> % id: eq-pythagoras
> $$
```

Use the "Fix callout equations" command to repair broken indentation.

## Installation

### From Community Plugins

1. Open Obsidian Settings → **Community plugins**
2. Click **Browse** and search for "ObsiTeXcore"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/YouFoundJK/ObsiTeXcore/releases)
2. Create folder: `<vault>/.obsidian/plugins/obsitexcore/`
3. Copy the files into this folder
4. Restart Obsidian and enable the plugin

## Quick Start

1. Write a display math block with `$$...$$`
2. Add `% id: eq-yourname` on a new line before the closing `$$`
3. Type `\eqref` anywhere to search and insert a reference
4. The equation is numbered and the link displays as `(1)`

## Commands

| Command | Description |
|---------|-------------|
| Insert display math | Insert `$$...$$` block template |
| Search equations in active note | Open equation search modal |
| Fix callout equations in active note | Repair callout indentation |
| Export current file to PDF | Open PDF export dialog |
| Insert LaTeX Snippet | Insert a saved snippet |

## Configuration

See the [Settings Reference](https://youfoundjk.github.io/ObsiTeXcore/configuration/settings/) for all configuration options.


## License

MIT License - see [LICENSE](LICENSE) for details.
