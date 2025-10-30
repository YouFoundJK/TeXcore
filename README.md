# LaTeX-like Equation Referencer for Obsidian

**LaTeX-like Equation Referencer** is an [Obsidian.md](https://obsidian.md/) is the minimalistic version of the original more powerful plugin of the [same name](https://ryotaushio.github.io/obsidian-latex-theorem-equation-referencer/).

This fork has been reduced to just doing the following with perfection - 
- Only parses the current active note - meaning no vault wide scans and not cross-notes referencing.
- No theorem / proof support - only equation referencing.

- No longer uses obsidians inbuild math block or its block referencing (which are very buggy and inflexible) - we handle all the block identification and referencing via unique id added to the new line equations (enclosed with `$$`) as a latex comment inside the equation.
