# ObsiTeXcore

A minimalistic Obsidian plugin for automatic equation numbering, referencing with support for PDE exports and .



## Key Features

<div class="grid cards" markdown>

-   :material-numeric: **Automatic Numbering**

    ---

    Equations are automatically numbered using LaTeX `\tag{}` commands with 5 numbering styles.

-   :material-link-variant: **Smart Referencing**

    ---

    Reference equations using `[[#^eq-id]]` links with live preview and hover popups.

-   :material-file-pdf-box: **PDF Export**

    ---

    Full-featured PDF export with live preview, customizable margins, headers, and CSS support.

-   :material-code-braces: **LaTeX Snippets**

    ---

    Create custom LaTeX snippets accessible via command palette.

-   :material-magnify: **Equation Search**

    ---

    Search and insert equation references using fuzzy or simple search.

-   :material-card-text-outline: **Callout Support**

    ---

    Math blocks work inside Obsidian callouts with automatic indentation handling.

</div>

## Quick Example

Write your equation with an ID comment:

```latex
$$
E = mc^2
% id: eq-einstein
$$
```

Reference it anywhere in the same note:

```markdown
As shown in [[#^eq-einstein]], energy and mass are equivalent.
```

The equation will be automatically numbered as `(1)` and the link will display as a clickable reference.

## Getting Started

[:octicons-arrow-right-24: Installation Guide](getting-started.md)

## Special Thanks to 
- [LaTeX-like Theorem & Equation Referencer](https://ryotaushio.github.io/obsidian-latex-theorem-equation-referencer/) by Ryota Ushio on which this is inspired.
- PDF export motivated by [better-export-pdf](https://github.com/l1xnan/obsidian-better-export-pdf)
- [obsidian-tikzjax](https://github.com/artisticat1/obsidian-tikzjax) by [artisticat1](https://github.com/artisticat1)