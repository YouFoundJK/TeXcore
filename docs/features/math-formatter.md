# Display Math Formatter

The **Display Math Formatter** is a pure, side-effect-free formatting engine (`src/features/math-formatter/`) that compacts fragmented `$$ ... $$` display math blocks into a clean, readable form. It is exposed to users via the [Text Transform Snippet](snippets.md) system — no separate command registration is needed.

---

## Problem It Solves

LaTeX math blocks pasted from OCR engines, Pandoc, or web clippers tend to arrive in a maximally-fragmented form where each token or operator occupies its own line:

```latex
$$
\mathbf I
-
\boldsymbol\rho
\mathbf K^0
=
\mathbf W^{-1}
\left(
...
\right)
\tag{1}
$$
```

This is visually unreadable in a source editor. The formatter compacts it to:

```latex
$$
\mathbf I-\boldsymbol\rho\mathbf K^0 = \mathbf W^{-1} \left( ... \right) \tag{1}
$$
```

while keeping matrix rows, `align` rows, and `cases` rows on their own lines.

---

## Module Layout

```
src/features/math-formatter/
├── formatter.ts    — Pure formatting logic. Zero Obsidian dependencies.
├── parser.ts       — Document-level $$ block scanner.
└── index.ts        — Public re-export barrel.
```

### `formatter.ts`

**Entry points:**

| Export | Signature | Description |
| :--- | :--- | :--- |
| `formatMathContent` | `(inner: string) => string` | Formats the text *between* the `$$` delimiters. Pure function; safe to call in unit tests. |
| `formatMathBlock` | `(block: string) => string` | Formats a full `$$ ... $$` block including delimiters. Preserves trailing Obsidian block IDs (`^blockid`). |

**Algorithm — token-stream walk:**

The formatter does a single linear pass over the content, tokenising it into five kinds:

| Token Kind | Matches |
| :--- | :--- |
| `text` | Any non-structural content: commands (`\frac`, `\mathbf`…), symbols, letters, digits |
| `newline` | A literal `\n` character |
| `row_break` | `\\` or `\\[spacing]` — a LaTeX row separator |
| `env_begin` | `\begin{name}` |
| `env_end` | `\end{name}` |

At each `newline` token it peeks at the closest non-empty token **before** and **after** it and asks:

> Is the preceding token a `row_break` or `env_begin`?  
> Is the following token an `env_begin` or `env_end`?  
> Are there two or more consecutive newlines (blank line)?

**Yes** to any → keep as `\n`.  
**No** to all → replace with a single space (cosmetic join).

This makes the algorithm inherently depth-agnostic: `\boxed{\begin{aligned}{\begin{bmatrix}…}}}` at arbitrary nesting depth is handled without any environment-specific special-casing.

**Post-processing pipeline:**

1. `compact(tokens)` — applies the newline decision loop described above.
2. `normaliseSpaces(s)` — collapses multiple consecutive spaces to one per line, trims line ends.
3. `trimLines(s)` — strips leading/trailing blank lines from the block body.
4. `hoistTag(s)` — finds a trailing `\tag{...}` (possibly on its own line) and moves it to the end of the last content line, separated by a single space.

### `parser.ts`

Provides document-level utilities that use the existing `findDisplayMathBlocks` function from `utils/parse` as its block-detection backend (inheriting all its robustness: code fence exclusion, inline code exclusion, escaped-dollar handling).

| Export | Signature | Description |
| :--- | :--- | :--- |
| `replaceMathBlocksInDocument` | `(text, formatter) => string` | Applies `formatter` to every `$$ ... $$` block in a Markdown document. Processes in reverse-offset order so splices don't invalidate earlier positions. |
| `collectFormattedBlocks` | `(text, formatter) => FormattedBlock[]` | Returns metadata (offsets, original, formatted) for all blocks — useful for previewing or counting changes. |
| `findBlockAtCursor` | `(text, offset) => {from, to} \| null` | Given a flat character offset, returns the range of the enclosing `$$` block, or `null` if the cursor is not inside one. |

### `index.ts`

A clean re-export barrel. Contains no logic. Allows internal consumers to import from `features/math-formatter` without reaching into sub-modules.

---

## Integration Point — Snippet System

The formatter is wired into the existing **Text Transform Snippet** infrastructure in `src/features/snippets/transforms.ts` as a single entry in `BUILTIN_TEXT_TRANSFORM_SNIPPETS`:

```typescript
{
  id: 'compact-display-math',
  name: 'Compact Display Math',
  transform: (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
      return formatMathBlock(trimmed);          // single-block selection
    }
    return replaceMathBlocksInDocument(input, formatMathBlock); // document fragment
  }
}
```

The snippet system's `runTextTransformSnippet` handles all editor interaction: applying the transform to each selection range (in reverse order for multi-cursor safety), or to the cursor line if nothing is selected. The formatter requires no `Plugin` instance, no editor callbacks, and no Obsidian lifecycle hooks.

---

## Test Coverage

Tests live in `test_helpers/math-formatter.test.ts` and run under Jest with `ts-jest`. They import directly from `../src/features/math-formatter/formatter` — no Obsidian mocking required.

Coverage includes:

- Simple token collapse (operators, commands on separate lines)
- `\left( ... \right)` collapsing to one line
- `bmatrix`, `pmatrix`, `cases`, `aligned`, `align` row preservation
- `\tag{...}` hoisting
- Obsidian block ID preservation
- Empty / whitespace-only block safety
- The full complex user example: `\boxed{\begin{aligned}...}` with multiply-nested `bmatrix`, `\left[`, `\left(`, `\left\{`, and interleaved `\\` row breaks at three levels
- `replaceMathBlocksInDocument` with multiple blocks and code fence exclusion
