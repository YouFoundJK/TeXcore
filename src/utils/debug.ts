/**
 * A simple synchronous file logger used for intense UI diagnostic tracing.
 * 
 * Usage:
 * Inject `logDebug("My message")` aggressively into CodeMirror rendering loops
 * or DOM observers to output an absolute timeline of execution to `debug.log`. 
 * This is especially useful for capturing logs in contexts where the Obsidian 
 * Developer Console might be silenced, asynchronous, or overwhelmed.
 */
import * as fs from "fs";

export function logDebug(msg: string) {
  try {
    fs.appendFileSync("d:\\Codes\\plugin-latex-referencer\\debug.log", msg + "\n", { encoding: "utf-8" });
  } catch (e) { }
}
