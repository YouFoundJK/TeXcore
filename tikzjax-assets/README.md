# TikZJax Assets Sourcing

The assets in this directory are the compiled format dumps, WebAssembly binaries, font stylesheets, and LaTeX package dependency files used by the TikZJax rendering engine in the TeXcore plugin.

## Asset Origins

- **Core TeX Engine (`tex.wasm.gz` & `core.dump.gz`)**: Extracted from the pre-compiled, offline-capable `tikzjax.js` bundle of [artisticat1/obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax).
- **TeX Files & LaTeX Packages (`tex_files/*.gz`)**: The LaTeX package files (such as `chemfig`, `circuitikz`, and TikZ library code blocks) were also extracted from the monolithic bundle of `artisticat1/obsidian-tikzjax` to serve as lazy-loaded dependencies.
- **Font Stylesheet (`tikzjax.css`)**: Downloaded from the official styling asset `styles.css` in [artisticat1/obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax). It contains `@font-face` declarations with embedded base64 font data for math and glyph symbols.

## Lineage of TikZJax
1. **[kisonecat/tikzjax](https://github.com/kisonecat/tikzjax)**: The original browser-based TeX-in-WASM compiler created by Jim Fowler, which compiles TeX's Pascal source to WebAssembly via `web2js`.
2. **[drgrice1/tikzjax](https://github.com/drgrice1/tikzjax)**: Glenn Rice's fork which added Web Worker support and support for additional LaTeX packages and libraries.
3. **[artisticat1/obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax)**: The Obsidian plugin wrapper created by `artisticat1` which packaged these components for offline usage in Obsidian notes.
