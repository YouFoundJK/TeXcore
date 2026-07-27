# Equation & Sub-Equation Numbering

The core engine of TeXcore provides automatic equation numbering using LaTeX `\tag{}` commands, allowing you to generate academic-grade numbering schemes inside Obsidian. This feature is heavily integrated with the plugin's [Autocomplete System](search.md) and [Quick Hover Previews](quick-preview.md) to keep references synchronized in both Live Preview and Reading View.

---

## Defining Equation Identifiers

Unlike Obsidian's standard markdown block references which append identifiers at the end of elements, TeXcore indexes equations using LaTeX comments inside the display math block. Add a `% id: eq-name` comment line immediately before the closing `$$` delimiter. The prefix `eq-` is required, followed by alphanumeric characters or hyphens. 

```latex
$$
E = mc^2
% id: eq-einstein   (1)
$$
```

1. This comment is invisible in the final rendered note but is parsed by TeXcore's background indexing system to build the active note cache.

---

## Lazy Numbering Mechanism

To keep your document layout clean, TeXcore uses **lazy numbering** by default. An equation is only assigned a right-aligned number tag if it is actively referenced somewhere in the vault. If the equation is not referenced, no tag is injected, keeping margins clear. You can disable this behavior to force-number all equations in the [Settings Reference](configuration/settings.md#number-only-referenced-equations).

=== "1. Editor Code"
    Write the math block and reference it inline using Obsidian double brackets:
    
    ```latex
    $$
    E = mc^2
    % id: eq-einstein
    $$
    
    As shown in [[#^eq-einstein]], mass is equivalent to energy.
    ```

=== "2. Generated Output"
    The compiler automatically appends the `\tag{}` macro and renders the link with the assigned index:
    
    $$
    E = mc^2 \tag{1}
    $$
    
    As shown in [(1)](#), mass is equivalent to energy.

---

## Numbering Customization

Configure the layout of your math indices globally via the [Settings Panel](configuration/settings.md#equation-numbering-referencing). Numbering formats support a variety of typographic styles, prefixes, and suffixes.

### Number Styles Matrix

| Style Name | Description | Output Example |
| :--- | :--- | :--- |
| `arabic` | Standard Hindu-Arabic numerals. | `(1)`, `(2)`, `(3)` |
| `alph` | Lowercase Latin alphabetical indexing. | `(a)`, `(b)`, `(c)` |
| `Alph` | Uppercase Latin alphabetical indexing. | `(A)`, `(B)`, `(C)` |
| `roman` | Lowercase Roman numerals. | `(i)`, `(ii)`, `(iii)` |
| `Roman` | Uppercase Roman numerals. | `(I)`, `(II)`, `(III)` |

!!! info "Prefixes & Suffixes"
    Prepending prefixes (e.g., `Eq.`) or appending suffixes (e.g., `.`) will modify the output. For example, a prefix of `Eq.` with style `arabic` renders as `(Eq.1)`. A suffix of `.` renders as `(1.)`. See [Reference Link Customization](configuration/settings.md#reference-link-prefix) for additional details.

---

## Section & Document Equation Formatting (`obsitex`)

You can specify section-level equation prefixes (e.g. `A` for Appendix equations like `(A1)`, `(A2)`, or `S` for supplementary sections), control numbering continuity, and declare supplemented notes for cross-referencing using an `obsitex` YAML codeblock:

```obsitex
eq-prefix: A          # Prefix added to equation numbers (e.g., 'A' for (A1), (A2))
eq-continuity: false  # 'false' resets numbering to 1; 'true' continues counting
supplements:          # Declare supplemented notes for cross-referencing
 - [[NoteName]]: S1   # Option 1: Cross-reference with prefix alias (e.g., (S1-A1))
 - [[NoteName]]       # Option 2: Cross-reference without prefix alias (e.g., (A1))
```

### Configuration Keys

| Key | Description | Example |
| :--- | :--- | :--- |
| `eq-prefix` | Prefix string appended to equation numbers in the section/note. | `eq-prefix: A` -> `(A1)` |
| `eq-continuity` | Resets equation counter to 1 when `false`; continues counting when `true`. | `eq-continuity: false` |
| `supplements` | List of target notes to cross-reference with optional prefix aliases. | `- [[Appendix B]]: B0` |

### Features & Behavior
- **Position Scoped**: `obsitex` properties only apply to equations located **after** the codeblock's position in the document. Equations prior to the codeblock retain standard numbering or previous section settings.
- **Continuity Control (`eq-continuity`)**:
  - `eq-continuity: false` (or `eq-continuous: false`): Resets the equation counter back to 1 (or `eqNumberInit`) starting from this codeblock location.
  - `eq-continuity: true` (or omitted): Keeps continuous counting across section transitions (e.g. equation 1 becomes tag `(1)`, and next section equation with prefix `A` becomes `(A2)`).
- **Cross-Note Supplement Referencing (`supplements`)**:
  - Links to target equations in supplemented files (e.g. `[[Appendix B#^eq-id]]` or local `[[#^eq-id]]`) automatically resolve using the target file's prefix and optional supplement alias.
  - If a supplement alias (e.g. `B0`) is defined, references display as `(B0-A1)`. If no alias is specified, references display using the target equation's tag directly `(A1)`.
- **Auto-Templating**: Typing an empty ```` ```obsitex ```` codeblock immediately populates it with default keys (`eq-prefix`, `eq-continuity`) and commented-out `supplements` syntax examples for quick copy-paste editing.
- **Command Palette Integration**: Includes an `ObsiTeX: Insert configuration block` command to insert pre-filled blocks at cursor.
- **Hidden Rendering**: The `obsitex` codeblock is invisible in Live Preview, Reading View, and PDF exports.

### Architectural Engine Details
- **Positional YAML & Comment Preprocessing**: `parsePositionalObsitexConfigs(content)` pre-processes WikiLinks `[[Note]]` into scalar strings to prevent standard YAML parser warnings, strips inline `#` comments cleanly, and parses character offsets using Obsidian's `parseYaml` API.
- **Unified Equation & Tag Manager Engine**: `processActiveNoteEquations` enumerates equations top-to-bottom and dynamically assigns equation tags based on position, `obsitex` config, and workspace backlinks. In Live Preview, `createTagManagerPlugin` delegates directly to `processActiveNoteEquations`, managing LaTeX `\tag{...}` tags across views on doc, viewport, and focus events.
- **Subpath Link & Preview Resolution**: `LatexLinkProvider` and `setupPagePreviewPatcher` resolve cross-note equation links and Ctrl+Hover page previews efficiently in `O(1)` time using Obsidian's internal `metadataCache.resolvedLinks` without full-vault disk scanning.

---

## Sub-Equation System

Multi-line equations (such as systems of equations using LaTeX `align` or split blocks) can be individually referenced using sub-indices. Reference rows sequentially by appending the row number to the parent ID:

```latex
$$
\begin{aligned}
a &= b + c \\
d &= e + f
\end{aligned}
% id: eq-system
$$

Referencing row 1: [[#^eq-system-1]]
Referencing row 2: [[#^eq-system-2]]
```

The plugin automatically parses the structure and appends sub-tags such as `\tag{1.1}` to the first equation line and `\tag{1.2}` to the second.

---

## Inserting References

To reference an equation quickly, type your trigger (default is `\eqref`) to activate the autocomplete dialog. Use your keyboard arrow keys to scroll, and press ++enter++ to insert the formatted wiki-link. 

!!! tip "Jump-to-Equation Shortcut"
    Holding the ++ctrl++ key (or ++cmd++ on macOS) while pressing ++enter++ on a suggestion in the autocomplete list will instantly jump your cursor to the equation definition instead of inserting the link.
