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

When any transformation runs, TeXcore displays a notice toast in the top-right corner indicating whether the change was successfully applied.
