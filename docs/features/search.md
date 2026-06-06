# Equation Search & Autocomplete

TeXcore offers a robust, keyboard-driven interface to search, preview, and link equations inside your vault. This module consists of two main interfaces: an editor-integrated **Autocomplete Popup** and a dedicated **Search Modal**.

---

## Editor Autocomplete Popup

Trigger autocompletion anywhere in your notes by typing your configured trigger string (default is `\eqref`). A dropdown menu instantly pops up at your cursor, displaying all equations matching your query along with their parsed line numbers and live math previews.

| Action Key | Result | Description |
| :--- | :--- | :--- |
| `↑` / `↓` | Highlight suggestion | Navigate the list of cached equations. |
| ++enter++ | Insert reference link | Appends `[[#^eq-id]]` at cursor. |
| ++ctrl+enter++ (1) | Jump to definition | Instantly shifts editor focus to the math block declaration. |
| ++escape++ | Close popup | Discards current search query. |

1. Maps to ++cmd+enter++ on macOS environments. Instructions are displayed inline inside the popup if configured in settings.

!!! info "Automatic Identifier Generation"
    If you reference an equation that has no identifier tag, TeXcore automatically generates a unique ID (e.g. `% id: eq-b5x3e2`), appends it before the closing `$$`, and inserts the resolved link to ensure referencing consistency.

---

## Vault Search Modal

Access the dedicated note-wide search dialog by triggering ++ctrl+p++ and running `Search equations in active note`. This modal provides an expanded viewport displaying equation previews on hover. It uses two search algorithms configurable in your [Autocomplete Settings](configuration/settings.md#autocomplete-search):

- **Fuzzy Search (Default)**: Matches partial strings and typos (e.g., query `intgl` matches `\integral` or `\int`) using Obsidian's internal `prepareFuzzySearch` utility.
- **Simple Search**: Matches exact substrings (e.g., query `int` matches `\int` and `point` but not `frac`) using Obsidian's `prepareSimpleSearch` utility.

---

## Navigation Target Configuration

When jumping to equation definitions via the autocomplete suggestion list, you can configure the editor target split layout in [Settings Reference](configuration/settings.md#open-location):

=== "Standard Navigation (Default)"
    Resolves the jump within your active tab view, replacing current focus.

=== "Split Tab Right"
    Splits the active pane vertically and focuses the equation on the right-hand panel.

=== "New Window / Split Down"
    Opens a detached editor window or horizontal split viewport to show equations side-by-side.

---

## Performance Notes & Best Practices

- **Vault Performance**: The search indexing index is scoped to the **active note only**. This prevents vault-wide scan lag, resulting in instant search evaluations even on low-end hardware.
- **Custom Triggers**: You can change the trigger string in [Autocomplete & Search Settings](configuration/settings.md#autocomplete-search) to `#eq` or `@eq` if you want to avoid overlaps with other LaTeX parser plugins.
