# Equation Search & Autocomplete

Find and reference equations quickly using fuzzy search and autocomplete.

## Autocomplete

### Triggering Autocomplete

Type the trigger string (default: `\eqref`) in the editor to open the suggestion popup:

```markdown
As shown in \eqref
              ↑ popup appears here
```

### Suggestion List

The popup shows all equations in the current note with:

- Rendered math preview (can be disabled)
- Line number where the equation appears
- Sorted by relevance to your query

### Selecting a Suggestion

| Action | Result |
|--------|--------|
| `↑` / `↓` | Navigate suggestions |
| `Enter` | Insert `[[#^eq-id]]` link |
| `Mod + Enter` | Jump to equation location |
| `Esc` | Close popup |
| Click | Select and insert |

!!! tip "Modifier Key"
    The "jump" modifier is `Ctrl` on Windows/Linux or `Cmd` on macOS by default. Configure this in settings.

### After Selection

When you select an equation:

1. If the equation has an ID, the link is inserted immediately
2. If no ID exists, one is auto-generated and inserted

Inserted link format:
```markdown
[[#^eq-gaussian]]
```

With `insertSpace` enabled (default):
```markdown
[[#^eq-gaussian]] 
```

## Search Modal

### Opening the Modal

1. Press `Ctrl/Cmd + P`
2. Search for "Search equations in active note"
3. Or use the hotkey if you've assigned one

### Modal Features

The search modal provides:

- Full equation search across the active note
- Same fuzzy/simple search as autocomplete
- Keyboard navigation
- Quick preview on hover

## Search Methods

### Fuzzy Search (Default)

Matches partial strings with typos allowed:

| Query | Matches |
|-------|---------|
| `intgl` | `\integral`, `\int` |
| `frac` | `\frac`, `fraction` |
| `sumx` | `\sum_{x}`, `\sum_x` |

Uses Obsidian's built-in `prepareFuzzySearch` algorithm.

### Simple Search

Exact substring matching:

| Query | Matches |
|-------|---------|
| `int` | `\int`, `\integral`, `point` |
| `frac` | `\frac`, `fraction` |

Uses Obsidian's `prepareSimpleSearch` algorithm.

Toggle between methods in plugin settings.

## Configuration

### Autocomplete Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Enable autocompletion | Toggle autocomplete feature | ✅ On |
| Trigger string | Text that opens the popup | `\eqref` |
| Render math in suggestions | Show rendered or raw LaTeX | ✅ On |

### Navigation Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Modifier to jump | Key for jump action | `Mod` |
| Show modifier instruction | Display keyboard hints | ✅ On |
| Open location | Where to open file when jumping | Current tab |

### Jump Location Options

When jumping to an equation, choose target:

| Option | Behavior |
|--------|----------|
| Current tab | Replace current view |
| Split right | Open in right split |
| Split down | Open in bottom split |
| New tab | Open in new tab |
| New window | Open in new window |

## Tips

### Custom Trigger

Change the trigger string to avoid conflicts:

- `\ref` - Shorter alternative
- `#eq` - Hash-based trigger
- `@eq` - Symbol-based trigger

### Performance

The search operates on the active note only:

- No vault-wide scanning
- Instant results
- Works offline

### Combining with Snippets

1. Create a snippet with equation template
2. Insert using snippet command
3. Fill in the equation
4. Add ID immediately
5. Reference later with `\eqref`
