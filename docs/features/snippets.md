# Command Snippets

Use command palette snippets for fast note metadata and text transformations.

## Available Commands

### Add Tags

Adds this frontmatter block at the top of the active note:

```yaml
---
tags:
  -
aliases:
  -
---
```

How to use:

1. Open Command Palette (`Ctrl/Cmd + P`)
2. Search for "Add Tags"
3. Run the command

Behavior:

- Inserts the frontmatter block at the top of the file
- If frontmatter already exists at the top of the note, no change is made

### Run Text Transform Snippet

Applies a built-in transformation to the selected text, or to the current line if no text is selected.

How to use:

1. Open Command Palette (`Ctrl/Cmd + P`)
2. Search for "Run Text Transform Snippet"
3. Choose a transform from the list

Built-in transforms:

- Kebab Case (`my-selected-text`)
- Title Kebab Case (`My-Selected-Text`)
- Title Case (`My Selected Text`)
- Clean Zotero Highlight Line (`<mark>...</mark>` to quote + source format)

## Notes

- Multi-cursor selections are supported for text transforms
- Transform commands show a notice indicating whether changes were applied
