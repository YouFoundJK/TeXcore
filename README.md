# LaTeX Equation Referencer for Obsidian

**LaTeX Equation Referencer** is an [Obsidian.md](https://obsidian.md/) and is the minimalistic version of the original more powerful plugin [LaTeX-like Theorem & Equation Referencer](https://ryotaushio.github.io/obsidian-latex-theorem-equation-referencer/).

This fork has been reduced to just doing the following things with perfection - 
- Only parses the current active note - meaning no vault wide scans and no cross-notes referencing.
- No theorem / proof support - only equation referencing.

- No longer uses obsidians inbuild math block or its block referencing (which are very buggy and inflexible) - we handle all the block identification and referencing via unique id added to the new line equations (enclosed with `$$`) as a latex comment inside the equation.
