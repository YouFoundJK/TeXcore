# TeXcore: LaTeX-Grade Referencing in Obsidian

Welcome to **TeXcore** (:material-sigma:), the ultimate Obsidian plugin designed to bridge the gap between markdown notes and publication-ready LaTeX documents. By introducing automated equation numbering, smart referencing, and advanced styling modules, TeXcore transforms your vault into a rich ecosystem for scientific drafting and study. 

[Getting Started Guide :octicons-arrow-right-24:](getting-started.md){: .md-button .md-button--primary }
[Settings Reference :octicons-gear-24:](configuration/settings.md){: .md-button }

---

## Capabilities Overview

Our core features are organized into logical modules designed to enhance your equation workflows:

<div class="grid cards" markdown>

- :material-numeric: **[Equation Numbering](features/equations.md)**

  LaTeX-like automatic tag insertion with multi-style options (`arabic`, `roman`, `alph`) and multi-line sub-equation tracking.

- :material-link-variant: **[Smart Referencing](features/quick-preview.md)**

  Autocompleted backlinks utilizing `[[#^eq-id]]` linking. Supports hover popups, click-navigation, and live synchronizations.

- :material-file-pdf-box: **[PDF Export](features/pdf-export.md)**

  Interactive PDF compiling with side-by-side preview widgets, customizable page headers/footers, margins, and custom CSS snippet injection.

- :material-code-braces: **[LaTeX Snippets](features/snippets.md)**

  Quick-insertion presets mapped to keyboard triggers, allowing faster math notation drafting without repetitive typing.

- :material-magnify: **[Equation Search](features/search.md)**

  Note-wide lookup indexing that simplifies equation retrieval and reference updates through an intuitive, keyboard-first modal.

- :material-card-text-outline: **[Callout Support](features/callout-support.md)**

  Seamless integration with native callouts, preserving Markdown formatting rules while automatically indexing equations.

- :material-vector-square: **[TikZ Diagrams](features/tikz.md)**

  Real-time rendering of vector graphical TikZ scripts directly inside your notes, backed by an isolated component library.

</div>

---

## Quick Start Demonstration

Writing and referencing equations in TeXcore is extremely straightforward. 

=== "1. Writing the Equation"
    To set up a trackable equation, use standard display math delimiters `$$` and insert a LaTeX comment stating the identifier:
    
    ```latex
    $$
    E = mc^2
    % id: eq-einstein
    $$
    ```

=== "2. Referencing the Equation"
    Simply type your trigger (default: `\eqref`) to select the equation via autocompletion, inserting an Obsidian reference link:
    
    ```markdown
    As demonstrated by Einstein in [[#^eq-einstein]], mass and energy are equivalent.
    ```

=== "3. Rendered Output"
    The equation will be automatically indexed, adding a right-aligned numbering tag. The reference link resolves to a neat hyperlink:
    
    $$
    E = mc^2 \tag{1}
    $$
    
    As demonstrated by Einstein in [(1)](#), mass and energy are equivalent.

!!! note "Smart Numbering"
    By default, TeXcore employs **lazy numbering**. Equations are only assigned a tag when they are actively referenced elsewhere in your note. This ensures clean note margins and prevents cluttered layouts. Read more in the [Settings Reference](configuration/settings.md#number-only-referenced-equations).