/**
 * index.ts — Public API for the math-formatter feature.
 *
 * The two user-facing operations are now registered as Text Transform Snippets
 * in `features/snippets/transforms.ts` and accessible via the
 * "Run text transform snippet" command (fuzzy picker).
 *
 * This file re-exports the core API for any internal consumers.
 */

export { formatMathContent, formatMathBlock } from './formatter';
export { replaceMathBlocksInDocument, collectFormattedBlocks, findBlockAtCursor } from './parser';
