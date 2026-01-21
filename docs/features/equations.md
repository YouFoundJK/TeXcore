# Equation Numbering & Referencing

The core feature of LaTeX Equation Referencer is automatic equation numbering using LaTeX `\tag{}` commands and smart referencing via internal links.

## How Equation IDs Work

Unlike Obsidian's built-in block references (`^block-id` after content), this plugin uses LaTeX comments inside math blocks:

```latex
$$
E = mc^2
% id: eq-einstein
$$
```

The `% id: eq-einstein` comment:

- Is invisible in rendered output (it's a LaTeX comment)
- Creates a unique identifier for the equation
- Must use the format `eq-` followed by alphanumeric characters and hyphens
- Must be on its own line before the closing `$$`

## Automatic Numbering

When an equation has an ID and is referenced somewhere in the note, the plugin automatically inserts a `\tag{}` command:

**Before (what you write):**
```latex
$$
E = mc^2
% id: eq-einstein
$$

See equation [[#^eq-einstein]].
```

**After (what the plugin generates):**
```latex
$$
E = mc^2 \tag{1}
% id: eq-einstein
$$

See equation [[#^eq-einstein]].
```

!!! note "Number Only Referenced Equations"
    By default, equations are only numbered if they're referenced somewhere. This can be changed in settings.

## Number Styles

Configure the numbering style in plugin settings:

| Style | Example Output |
|-------|----------------|
| `arabic` | 1, 2, 3, ... |
| `alph` | a, b, c, ... |
| `Alph` | A, B, C, ... |
| `roman` | i, ii, iii, ... |
| `Roman` | I, II, III, ... |

## Prefix and Suffix

Add custom text before/after equation numbers:

| Setting | Value | Result |
|---------|-------|--------|
| Prefix: `§` | - | (§1) |
| Suffix: `.` | - | (1.) |
| Prefix: `Eq.` | - | (Eq.1) |

## Sub-Equations

For multi-line equations, reference individual lines using sub-indices:

```latex
$$
a &= b + c \\
d &= e + f
% id: eq-system
$$

First equation: [[#^eq-system-1]]
Second equation: [[#^eq-system-2]]
```

The plugin generates:

- `\tag{1.1}` for the first row
- `\tag{1.2}` for the second row

## Referencing Equations

### Using Autocomplete

1. Type your trigger string (default: `\eqref`)
2. A suggestion popup appears with all equations in the current note
3. Select an equation using arrow keys or mouse
4. Press Enter to insert `[[#^eq-id]]`

### Jump to Equation

Hold the modifier key (default: `Ctrl`/`Cmd`) while pressing Enter on a suggestion to jump to the equation instead of inserting a link.

### Reference Display Format

Configure how equation links are displayed:

| Setting | Display Format |
|---------|----------------|
| Show note title: ON | `Note Title > (1)` |
| Show note title: OFF | `(1)` |
| Reference prefix: `Eq.` | `Eq.(1)` |
| Reference suffix: none | `(1)` |

## Live Preview vs Reading View

The plugin works in both Obsidian views:

- **Live Preview**: Uses CodeMirror extensions for real-time numbering
- **Reading View**: Uses Markdown post-processors for rendered output

Both views stay synchronized - editing in one updates the other.

## Equation Cache

The plugin maintains a cache of all equations in the current note for fast lookup. This cache is:

- Built when a note is opened
- Updated on every document change
- Used for autocomplete suggestions and hover previews
