# Settings Reference

Configure TeXcore to adapt to your academic writing workflow. This page outlines all settings grouped by feature categories.

---

## Equation Numbering & Referencing

Adjust how equations are counted, tagged, and linked inside Obsidian. For details on how math indexing operates, see the [Equation Numbering Guide](../features/equations.md).

| Setting Name | Type & Default | Description |
| :--- | :--- | :--- |
| **Number only referenced equations** | Toggle (`On`) | Only add number tags to equations that have at least one active reference in the note. Unreferenced equations remain unnumbered. |
| **Equation number prefix** | Text (empty) | Appends custom characters before the equation number. Example: `§` renders as `(§1)`. |
| **Equation number suffix** | Text (empty) | Appends custom characters after the equation number. Example: `.` renders as `(1.)`. |
| **Equation number initial count** | Number (`1`) | The starting integer for equation counting. Set to `0` to begin from zero. |
| **Equation number style** | Dropdown (`arabic`) | The numeric formatting system used. Options: `arabic` (1, 2, 3), `alph` (a, b, c), `Alph` (A, B, C), `roman` (i, ii, iii), `Roman` (I, II, III). |
| **Reference link prefix** | Text (empty) | Character string injected before references. Example: `Eq.` renders as `Eq.(1)`. |
| **Reference link suffix** | Text (empty) | Character string injected after references. |
| **Show note title in equation link** | Toggle (`On`) | Format for display links. `On` resolves to `Note Title > (1)`; `Off` resolves to `(1)`. |

---

## Autocomplete & Search

Customize the autocompletion popup and fuzzy search indexing behaviors. For search behavior explanations, consult the [Search and Autocomplete Guide](../features/search.md).

| Setting Name | Type & Default | Description |
| :--- | :--- | :--- |
| **Enable autocompletion** | Toggle (`On`) | Enables the popup suggestion list while editing. |
| **Trigger for autocompletion** | Text (`\eqref`) | The character trigger sequence that opens the autocomplete suggestions dropdown. |
| **Render math in suggestions** | Toggle (`On`) | Render LaTeX formulas dynamically inside suggestion listings. Disabling shows raw code. |
| **Search method** | Dropdown (`Fuzzy`) | Matches query to equations. Options: `Fuzzy` (allows typos/partial matching) or `Simple` (exact substring matching). |
| **Modifier to jump** | Key Selection (`Mod`) (1) | Keyboard modifier key held down when selecting a suggestion to jump to the equation instead of inserting it. |
| **Show modifier instruction** | Toggle (`On`) | Shows hint key instructions inside the autocomplete popup window. |
| **Open location** | Dropdown (`Current tab`) | Select editor layout focus when jumping. Options: `Current tab`, `Split right`, `Split down`, `New tab`, `New window`. |

1. `Mod` defaults to ++ctrl++ on Windows/Linux and ++cmd++ on macOS.

---

## PDF Export

Configure default options for the compiled PDF output. Learn about layout customization on the [PDF Export Page](../features/pdf-export.md).

| Setting Name | Type & Default | Description |
| :--- | :--- | :--- |
| **Add file name as title** | Toggle (`On`) | Prepends the markdown file name as an `<h1>` element at the start of the compiled PDF. |
| **Display headers** | Toggle (`On`) | Renders headers on each page. Custom templates can be set under Advanced settings. |
| **Display footer** | Toggle (`On`) | Renders footers on each page. |
| **Print background** | Toggle (`Off`) | Includes editor background colors and styling assets in PDF print output. |
| **Generate tagged PDF** | Toggle (`Off`) | Generates accessible PDF document structures containing layout tags (experimental). |
| **Max headings level of outline** | Dropdown (`6`) | Maximum outline depth (h1–h6) parsed to build PDF bookmark trees. |
| **PDF metadata** | Toggle (`Off`) | Extracts yaml frontmatter parameters to populate PDF document metadata fields. |

---

## Advanced PDF Settings

Customize HTML layout templates and manage style overrides during compilation.

| Setting Name | Type & Default | Description |
| :--- | :--- | :--- |
| **Header Template** | Textarea (standard layout) | Custom HTML template for page headers. Supports class variable tags (e.g. `date`, `title`). |
| **Footer Template** | Textarea (standard layout) | Custom HTML template for page footers. Supports class variable tags (e.g. `pageNumber`, `totalPages`). |
| **Add timestamp to filename** | Toggle (`Off`) | Appends the export compile timestamp to the output `.pdf` filename. |
| **Select CSS snippets** | Toggle (`Off`) | Allows choosing disabled CSS snippets to compile and apply to PDF layout only. |
| **Limit concurrent renders** | Text (`5`) | Limit concurrent parallel rendering tasks during folder/batch exports. |

---

## Snippets & Debugging

| Setting Name | Type & Default | Description |
| :--- | :--- | :--- |
| **Manage Snippets** | Modal Dialog | Add, edit, or remove custom LaTeX command snippets triggered via the Command Palette. |
| **Debug mode** | Toggle (`Off`) | Enables the **Debug** button in the PDF export dialog to open Electron DevTools for inspecting the render webview. |
