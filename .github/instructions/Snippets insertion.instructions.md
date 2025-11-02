---
applyTo: "src/*, /*.ts, **/*.js, **/*.tsx, **/*.jsx, **/*.css" 
exclude:  "**/*.txt"
---
Scan through my codebase and find the necessary files and intelligently make the suggested changes to it. Do not overwrite the files, but only modify the snippets as required. Only if you cannot find the file required will you create a new file and write into it.

IMPORTANT:
- Follow the instructions exactly and do not deviate from them or main your own interpretation.
- Do not suggest any changes that are not in the context of the instructions.
- Its recommended to update the logs for all the changes done so far in a new file in the obsidian vault folder `VSCODE blueprints`.

Key points:
- Ensure that the changes are made in a way that they do not disrupt existing functionality.
- Prioritze implementation with the least code changes so that its easier to debug.
- Maintain modularity and reuse as much as possible.