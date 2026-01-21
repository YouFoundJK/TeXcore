# Settings Reference

Complete reference for all LaTeX Equation Referencer settings.

## Equation Numbering & Referencing

### Number only referenced equations
- **Type:** Toggle
- **Default:** On
- **Description:** Only add equation numbers to equations that have at least one reference in the note. Unreferenced equations remain unnumbered.

### Equation number prefix
- **Type:** Text
- **Default:** (empty)
- **Description:** Text to prepend to equation numbers. Example: `§` → `(§1)`

### Equation number suffix
- **Type:** Text
- **Default:** (empty)
- **Description:** Text to append to equation numbers. Example: `.` → `(1.)`

### Equation number initial count
- **Type:** Number
- **Default:** `1`
- **Description:** Starting number for equation counting. Set to `0` to start from zero.

### Equation number style
- **Type:** Dropdown
- **Default:** `arabic`
- **Options:**

| Style | Output |
|-------|--------|
| `arabic` | 1, 2, 3, ... |
| `alph` | a, b, c, ... |
| `Alph` | A, B, C, ... |
| `roman` | i, ii, iii, ... |
| `Roman` | I, II, III, ... |

### Reference link prefix
- **Type:** Text
- **Default:** (empty)
- **Description:** Text before equation references. Example: `Eq.` → `Eq.(1)`

### Reference link suffix
- **Type:** Text
- **Default:** (empty)
- **Description:** Text after equation references.

### Show note title in equation link
- **Type:** Toggle
- **Default:** On
- **Description:** Display format for links. On: `Note Title > (1)`, Off: `(1)`

---

## Autocomplete & Search

### Enable autocompletion
- **Type:** Toggle
- **Default:** On
- **Description:** Enable the `\eqref` trigger autocomplete system.

### Trigger for autocompletion
- **Type:** Text
- **Default:** `\eqref`
- **Description:** Character sequence that opens the equation suggestion popup.

### Render math in suggestions
- **Type:** Toggle
- **Default:** On
- **Description:** Show rendered LaTeX in the suggestion list. Off shows raw LaTeX text.

---

## PDF Export

### Add file name as title
- **Type:** Toggle
- **Default:** On
- **Description:** Include the file name as an `<h1>` heading at the top of the PDF.

### Display headers
- **Type:** Toggle
- **Default:** On
- **Description:** Show header on each PDF page.

### Display footer
- **Type:** Toggle
- **Default:** On
- **Description:** Show footer on each PDF page.

### Print background
- **Type:** Toggle
- **Default:** Off
- **Description:** Include background colors and images in PDF output.

### Generate tagged PDF
- **Type:** Toggle
- **Default:** Off
- **Description:** Create accessible PDF with document structure tags (experimental).

### Max headings level of the outline
- **Type:** Dropdown (1-6)
- **Default:** `6`
- **Description:** Maximum heading level to include in PDF bookmarks/outline.

### PDF metadata
- **Type:** Toggle
- **Default:** Off
- **Description:** Include frontmatter fields (title, author, keywords) in PDF metadata.

---

## Advanced PDF Settings

### Header Template
- **Type:** Textarea
- **Default:**
```html
<div style="width: 100vw;font-size:10px;text-align:center;">
  <span class="title"></span>
</div>
```
- **Description:** HTML template for page headers. Use classes: `date`, `title`, `url`, `pageNumber`, `totalPages`.

### Footer Template
- **Type:** Textarea
- **Default:**
```html
<div style="width: 100vw;font-size:10px;text-align:center;">
  <span class="pageNumber"></span> / <span class="totalPages"></span>
</div>
```
- **Description:** HTML template for page footers.

### Add timestamp to output file name
- **Type:** Toggle
- **Default:** Off
- **Description:** Append export timestamp to PDF filename.

### Select CSS snippets
- **Type:** Toggle
- **Default:** Off
- **Description:** Enable selection of disabled CSS snippets to apply to PDF export only.

### Limit concurrent renders
- **Type:** Text
- **Default:** `5`
- **Description:** Maximum parallel file renders during batch export.

---

## Debug

### Debug mode
- **Type:** Toggle
- **Default:** Off
- **Description:** Enable debug button in export modal to open DevTools for the preview webview.

---

## Snippets

### Manage Snippets
Access via the **Add Snippet** button. Each snippet has:

- **Name:** Display name in command palette
- **Content:** LaTeX code to insert

Snippets are stored in `data.json` with the plugin settings.
