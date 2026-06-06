# Callout Support

TeXcore seamlessly integrates with Obsidian's native Callout system. Writing display math inside block quotes requires prepending the callout character `>` to every single line. TeXcore parses these prefixes automatically to keep your formula coordinates indexed, numbered, and styled correctly without breaking the callout container.

---

## Indentation Syntax

When drafting formulas inside a callout box, make sure that all lines inside the math block maintain the correct prefix.

=== "Standard Callout"
    ```markdown
    > [!theorem] Green's Theorem
    > $$
    > \oint_C (L \, dx + M \, dy) = \iint_D \left(\frac{\partial M}{\partial x} - \frac{\partial L}{\partial y}\right) dx \, dy
    > % id: eq-greens
    > $$
    ```

=== "Nested Callouts"
    ```markdown
    > [!note] Parent Callout
    > Outer text body.
    > > [!tip] Nested Equation
    > > $$
    > > e^{i\pi} + 1 = 0
    > > % id: eq-euler
    > > $$
    ```

---

## Automatic Fix Command

Inconsistent callout prefixes (like a missing `>` on the `% id:` line or closing `$$`) will cause Obsidian to break out of the callout box. To resolve this, use the automatic fix tool:

1. Open the Command Palette using ++ctrl+p++ (or ++cmd+p++ on macOS).
2. Type and select `Fix callout equations in active note`.
3. TeXcore will scan your active note, detect broken display blocks inside callouts, and automatically prepend missing prefixes or normalize spacing to a clean `> `.

| Prefix Error Pattern | Fix Applied | Result |
| :--- | :--- | :--- |
| **Missing `>` prefix on `% id` line** | Injects missing callout character. | `> % id: eq-name` |
| **Missing `>` prefix on closing `$$`** | Injects missing callout character. | `> $$` |
| **Inconsistent spacing (e.g. `>  $$`)** | Normalizes prefix spacing. | `> $$` |

---

## PDF Export & Preview Compatibility

Callouts containing math blocks fully support all other TeXcore features:
- **Hover Previews**: Hovering over inline references correctly renders the callout box context inside the [Page Preview Popup](quick-preview.md).
- **PDF Compilation**: The callout color styles, borders, and equation number tags are preserved in the compiled [PDF Export](pdf-export.md).
