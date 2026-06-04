# Getting Started

## Installation

### From Community Plugins

1. Open Obsidian Settings → **Community plugins**
2. Click **Browse** and search for "ObsiTeXcore"
3. Click **Install**, then **Enable**

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/YouFoundJK/ObsiTeXcore/releases)
2. Create folder: `<vault>/.obsidian/plugins/obsitexcore/`
3. Copy the downloaded files into this folder
4. Restart Obsidian and enable the plugin

## Your First Equation

### Step 1: Create a Display Math Block

Write a display math block using `$$` delimiters:

```latex
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$
```

### Step 2: Add an Equation ID

Add a LaTeX comment with a unique ID on a new line before the closing `$$`:

```latex
$$
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
% id: eq-gaussian
$$
```

!!! tip "ID Format"
    IDs must start with `eq-` followed by alphanumeric characters and hyphens. Examples: `eq-main`, `eq-theorem-1`, `eq-proof-step-2`

### Step 3: Reference the Equation

Type `\eqref` to trigger the autocomplete menu, then select your equation:

```markdown
The Gaussian integral [[#^eq-gaussian]] is fundamental in probability theory.
```

### Step 4: View the Result

The plugin automatically:

- Adds `\tag{1}` to number the equation
- Renders the reference as a clickable link showing `(1)`
- Shows a preview popup when you hover over the link

## Basic Workflow

```mermaid
graph LR
    A[Write equation] --> B[Add % id: eq-xxx]
    B --> C[Type \eqref]
    C --> D[Select from suggestions]
    D --> E[Link inserted]
```

## Commands

Access these commands via the Command Palette (`Ctrl/Cmd + P`):

| Command | Description |
|---------|-------------|
| **Insert display math** | Insert `$$...$$` block with ID template |
| **Search equations in active note** | Open equation search modal |
| **Fix callout equations in active note** | Fix indentation in callout math blocks |
| **Export current file to PDF** | Open PDF export dialog |
| **Insert LaTeX Snippet** | Insert a saved LaTeX snippet |

## Next Steps

- [Equation Numbering](features/equations.md) - Learn about numbering styles and sub-equations
- [PDF Export](features/pdf-export.md) - Export notes to PDF with equations
- [Settings Reference](configuration/settings.md) - Configure all plugin options
