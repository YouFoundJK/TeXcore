# LaTeX Equation Referencer

A minimalistic Obsidian plugin for automatic equation numbering and referencing.

!!! info "Fork of Math Booster"
    This plugin is a streamlined fork of the original [LaTeX-like Theorem & Equation Referencer](https://ryotaushio.github.io/obsidian-latex-theorem-equation-referencer/) by Ryota Ushio. It focuses solely on equation referencing with improved performance and reliability.

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

## How It Differs from Original

| Feature | Original Math Booster | LaTeX Equation Referencer |
|---------|----------------------|---------------------------|
| Scope | Vault-wide scanning | Active note only |
| Theorem Support | ✅ Full support | ❌ Removed |
| Block References | Obsidian's built-in | Custom `% id:` comments |
| Dependencies | Quick Preview, Math Links | Built-in (no dependencies) |
| Performance | Slower (vault scans) | Faster (single file) |

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
