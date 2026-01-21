# Callout Support

Use math blocks inside Obsidian callouts with automatic indentation handling.

## The Challenge

Obsidian callouts require `>` prefixes on every line:

```markdown
> [!note]
> This is a callout with
> multiple lines.
```

Math blocks inside callouts need the same treatment:

```markdown
> [!theorem]
> $$
> E = mc^2
> % id: eq-callout
> $$
```

Without proper indentation, the math block breaks the callout.

## Automatic Handling

The plugin automatically handles callout prefixes when:

- Adding `\tag{}` commands
- Inserting ID comments
- Managing multi-line equations

### Example

**Input (with proper prefixes):**
```markdown
> [!theorem] Einstein's Equation
> $$
> E = mc^2
> % id: eq-einstein
> $$
```

**After plugin processing:**
```markdown
> [!theorem] Einstein's Equation
> $$
> E = mc^2 \tag{1}
> % id: eq-einstein
> $$
```

The plugin preserves the `>` prefix on all lines.

## Fix Command

If your callout equations have broken indentation, use the fix command:

1. Open Command Palette (`Ctrl/Cmd + P`)
2. Search for "Fix callout equations in active note"
3. Run the command

This scans all math blocks and fixes any incorrect indentation.

### What It Fixes

| Before | After |
|--------|-------|
| Missing `>` on ID line | Adds `>` prefix |
| Missing `>` on closing `$$` | Adds `>` prefix |
| Inconsistent spacing | Normalizes to `> ` |

## Nested Callouts

The plugin supports nested callouts:

```markdown
> [!note]
> Outer callout
> > [!tip]
> > $$
> > x^2 + y^2 = z^2
> > % id: eq-nested
> > $$
```

The prefix `> > ` is detected and preserved on all lines.

## Supported Formats

The plugin recognizes these callout prefix patterns:

| Pattern | Example |
|---------|---------|
| Standard | `> ` |
| Nested | `> > ` |
| Triple nested | `> > > ` |
| With leading space | `  > ` |

## Live Preview Behavior

In Live Preview mode:

1. The opening `$$` line's prefix is detected
2. All subsequent lines use the same prefix
3. The closing `$$` line uses the same prefix

This ensures consistent rendering across the entire math block.

## Common Issues

### Breaking Out of Callout

If your math appears below the callout:

```markdown
> [!note]
> Some text
$$
E = mc^2   <!-- This breaks out! -->
$$
```

**Fix:** Add `>` prefix to the math block lines, or use the fix command.

### Missing ID After Fix

If the ID disappears after a fix:

1. The ID line may have had invalid characters
2. Manually re-add: `> % id: eq-xxx`

### PDF Export

Callout math blocks export correctly to PDF with:

- Callout styling preserved
- Math rendering intact
- Equation numbers displayed
