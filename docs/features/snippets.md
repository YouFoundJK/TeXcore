# LaTeX Snippets

Create reusable LaTeX code snippets for quick insertion via command palette.

## Overview

The snippet system allows you to:

- Save frequently used LaTeX code
- Insert snippets via command palette
- Each snippet becomes its own command

## Managing Snippets

### Adding a Snippet

1. Open **Settings** → **LaTeX Equation Referencer** → **Snippets**
2. Click **Add Snippet**
3. Enter:
   - **Name**: Display name (e.g., "Matrix 2x2")
   - **Content**: The LaTeX code to insert

### Editing a Snippet

Click the pencil icon next to any snippet to edit its name or content.

### Deleting a Snippet

Click the trash icon next to a snippet and confirm deletion.

!!! note "Reload Required"
    After adding or editing snippets, you may need to reload Obsidian for command palette changes to take effect.

## Using Snippets

### Main Snippet Command

1. Open Command Palette (`Ctrl/Cmd + P`)
2. Search for "Insert LaTeX Snippet"
3. Select from the suggestion modal
4. Snippet content is inserted at cursor

### Individual Snippet Commands

Each snippet also creates its own command:

- Command name: `Insert Snippet: <snippet name>`
- Example: `Insert Snippet: Matrix 2x2`

This allows you to:

- Assign hotkeys to specific snippets
- Access frequently used snippets directly

## Example Snippets

### Fraction Template
```latex
\frac{numerator}{denominator}
```

### Matrix 2×2
```latex
\begin{pmatrix}
a & b \\
c & d
\end{pmatrix}
```

### Aligned Equations
```latex
\begin{aligned}
a &= b + c \\
d &= e + f
\end{aligned}
```

### Summation
```latex
\sum_{i=1}^{n} x_i
```

### Integral
```latex
\int_{a}^{b} f(x) \, dx
```

### Equation with ID Template
```latex
$$
% equation here
% id: eq-
$$
```

### Greek Letters Set
```latex
\alpha, \beta, \gamma, \delta, \epsilon, \theta, \lambda, \mu, \pi, \sigma, \omega
```

## Snippet Tips

### Cursor Placement
Currently, snippets insert content as-is. For multi-part snippets, use placeholder text:

```latex
\frac{NUM}{DEN}
```

### Complex Snippets
For multi-line content, the full text is inserted. Example output:

```latex
\begin{cases}
x & \text{if } x > 0 \\
-x & \text{if } x \leq 0
\end{cases}
```

### Integration with Equations
Combine snippets with the equation system:

1. Insert equation template snippet
2. Fill in the math content
3. Add your `% id: eq-xxx` comment
4. Reference with `\eqref` autocomplete
