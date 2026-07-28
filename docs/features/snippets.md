# Editor Command Snippets

TeXcore features quick helper shortcuts to automate note metadata setup and perform text capitalization transforms inside the editor. These commands are registered globally and can be triggered via the command palette using ++ctrl+p++ (or ++cmd+p++ on macOS).

---

## Frontmatter Metadata Injection

The **Add Tags** command injects a standardized frontmatter YAML block at the very top of your active note, facilitating quick categorization and alias indexing:

```yaml
---
tags:
  - 
aliases:
  - 
---
```

!!! note "Duplication Prevention"
    If the plugin detects that your note already starts with a valid YAML frontmatter block (delimiters `---`), the command terminates safely and does not write duplicates.

---

## Editor Text Transformations

The **Run Text Transform Snippet** command processes your highlighted editor text (or the active cursor line if no text is selected) through predefined formatting filters. You can use this with multi-cursor selections.

| Transformation | Output Example | Typical Use Case |
| :--- | :--- | :--- |
| **Kebab Case** | `example-text-string` | Fast URL or note alias linking. |
| **Title Kebab Case** | `Example-Text-String` | Title heading slugifications. |
| **Title Case** | `Example Text String` | Formatting article or note headings. |
| **Clean Zotero Highlight** | Reformats HTML tags to raw markdown | Converting Zotero desktop highlights into blockquotes. |
| **Clean Double Dollar Symbols** | `$$` &rarr; `$` | Replaces all double dollar signs with single dollar signs in the selected text/line. |
| **Clean Inline Double Dollar Symbols** | `$$x$$` &rarr; `$x$` | Converts inline double dollar math into single dollar inline math while preserving display/block math blocks. |
| **Compact Display Math** | Multi-line fragmented `$$` block &rarr; compact, readable form | Tidying over-expanded display math pasted from OCR, Pandoc, or web clippers. |

When any transformation runs, TeXcore displays a notice toast in the top-right corner indicating whether the change was successfully applied.

---

## Compact Display Math

The **Compact Display Math** transform tidies fragmented display math blocks — the kind produced by OCR engines, Pandoc conversions, or copy-paste from web sources — into a compact, readable form while preserving all intentional structure (matrix rows, `align` rows, `cases` rows, nested environments of any depth).

### How It Works

The formatter performs a single token-stream pass over the math content. At each newline it inspects the surrounding tokens and applies one rule:

- **Keep the newline** if the preceding token is a row-break command (`\\` or `\\[...]`), an environment opener (`\begin{…}`), or if the following token is an environment boundary (`\begin{…}` / `\end{…}`).
- **Replace with a space** in every other case — joining fragmented operator lines, lone symbol lines, and other cosmetic splits into a single readable line.

This approach is depth-agnostic: `\boxed{\begin{aligned}{\begin{bmatrix}…\end{bmatrix}}\end{aligned}}` at any nesting level is handled correctly without special-casing.

### Usage Modes

=== "Single Block"
    Select the entire `$$ … $$` block (including both delimiters), open the snippet picker, and choose **Compact Display Math**.

    ```latex
    $$
    \mathbf I
    -
    \boldsymbol\rho
    \mathbf K^0
    =
    0
    \tag{1}
    $$
    ```

    Becomes:

    ```latex
    $$
    \mathbf I - \boldsymbol\rho \mathbf K^0 = 0 \tag{1}
    $$
    ```

=== "Whole Document"
    Select all (++ctrl+a++) to select the entire note, open the snippet picker, and choose **Compact Display Math**. Every `$$ … $$` block in the document is compacted independently. Blocks inside fenced code fences (` ``` `) are never touched.

!!! note "Preserved Structure"
    Matrix environments (`bmatrix`, `pmatrix`, `cases`, `aligned`, `align`, etc.) keep each row on its own line. Only cosmetic, non-structural newlines between tokens are collapsed. The `\tag{…}` command is always hoisted to the end of the last content line. Obsidian block IDs (`^eq-id`) on the closing `$$` are preserved.
