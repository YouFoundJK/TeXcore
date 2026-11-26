import {
  EQ_ID_COMMENT_REGEX,
  TOP_LEVEL_EQ_ENVS,
  findTopLevelEndEnvMatch,
  isEscapedAt,
  isLikelyCorruptedMathBlock,
  splitMathIntoTopLevelRows,
  stripCalloutPrefix
} from 'utils/parse';

export interface TagUpdateOptions {
  printName: string | null;
  subIndices?: Set<number>;
}

interface TextRange {
  from: number;
  to: number;
}

interface LatexTagSpan {
  from: number;
  to: number;
  content: string;
  braceDepth: number;
  isStarred: boolean;
}

interface LatexStructure {
  commentRanges: TextRange[];
  tags: LatexTagSpan[];
  hasMalformedTag: boolean;
  hasUnbalancedTopLevelEnv: boolean;
}

const STICKY_ENV_RE = /\\(begin|end)\{\s*([a-zA-Z*]+)\s*\}/y;
const STICKY_LINEBREAK_RE = /\\\\(?:\s*\[[^\]]*\])?/y;
const STICKY_END_ENV_RE = /\\end\{\s*([a-zA-Z*]+)\s*\}/y;

function scanLatexStructure(text: string): LatexStructure {
  const commentRanges: TextRange[] = [];
  const tags: LatexTagSpan[] = [];
  const envStack: string[] = [];
  let hasMalformedTag = false;
  let hasUnbalancedTopLevelEnv = false;
  let braceDepth = 0;

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // LaTeX comment (unescaped %)
    if (ch === '%' && !isEscapedAt(text, i)) {
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      commentRanges.push({ from: i, to: end });
      i = end;
      continue;
    }

    if (ch === '{' && !isEscapedAt(text, i)) {
      braceDepth++;
      i++;
      continue;
    }

    if (ch === '}' && !isEscapedAt(text, i)) {
      braceDepth = Math.max(0, braceDepth - 1);
      i++;
      continue;
    }

    // Check for \tag{...} or \tag*{...}
    if (
      ch === '\\' &&
      !isEscapedAt(text, i) &&
      text.startsWith('\\tag', i) &&
      (i + 4 >= text.length || !/[a-zA-Z]/.test(text[i + 4]))
    ) {
      let j = i + 4;
      let isStarred = false;
      if (j < text.length && text[j] === '*') {
        isStarred = true;
        j++;
      }
      while (j < text.length && /[ \t]/.test(text[j])) {
        j++;
      }
      if (j < text.length && text[j] === '{') {
        const tagOuterDepth = braceDepth;
        let innerDepth = 1;
        let k = j + 1;
        while (k < text.length && innerDepth > 0) {
          if (text[k] === '%' && !isEscapedAt(text, k)) {
            const nl = text.indexOf('\n', k);
            k = nl === -1 ? text.length : nl;
            continue;
          }
          if (
            text[k] === '\\' &&
            !isEscapedAt(text, k) &&
            text.startsWith('\\tag', k) &&
            (k + 4 >= text.length || !/[a-zA-Z]/.test(text[k + 4]))
          ) {
            hasMalformedTag = true;
          }
          if (text[k] === '{' && !isEscapedAt(text, k)) innerDepth++;
          else if (text[k] === '}' && !isEscapedAt(text, k)) innerDepth--;
          k++;
        }
        if (innerDepth !== 0) {
          hasMalformedTag = true;
          i = j + 1;
          continue;
        }
        const tagContent = text.slice(j + 1, k - 1);
        tags.push({
          from: i,
          to: k,
          content: tagContent,
          braceDepth: tagOuterDepth,
          isStarred
        });
        i = k;
        continue;
      }
    }

    // Check for \begin{env} and \end{env} for top-level equation environments
    if (ch === '\\' && !isEscapedAt(text, i)) {
      STICKY_ENV_RE.lastIndex = i;
      const envMatch = STICKY_ENV_RE.exec(text);
      if (envMatch) {
        const kind = envMatch[1];
        const envName = envMatch[2];
        if (TOP_LEVEL_EQ_ENVS.has(envName)) {
          if (kind === 'begin') {
            envStack.push(envName);
          } else {
            const idx = envStack.lastIndexOf(envName);
            if (idx === -1) {
              hasUnbalancedTopLevelEnv = true;
            } else {
              envStack.splice(idx, 1);
            }
          }
        }
        i += envMatch[0].length;
        continue;
      }
    }

    i++;
  }

  if (envStack.length > 0) {
    hasUnbalancedTopLevelEnv = true;
  }

  return {
    commentRanges,
    tags,
    hasMalformedTag,
    hasUnbalancedTopLevelEnv
  };
}

function isNonTaggableMathLine(trimmedMathWithoutCallout: string): boolean {
  if (trimmedMathWithoutCallout.length === 0) return true;
  if (/^\\begin\{\s*[a-zA-Z*]+\s*\}(?:\[[^\]]*\])?$/.test(trimmedMathWithoutCallout)) {
    return true;
  }
  if (/(?:^|[^a-zA-Z])\\no(?:tag|number)$/.test(trimmedMathWithoutCallout)) {
    return true;
  }
  return false;
}

/**
 * Finds the offset right after the last non-whitespace, non-comment,
 * non-callout-prefix math character in `segment`.
 * Skips lines that are only `\begin{...}` or end with `\notag`/`\nonumber`.
 * Returns -1 if `segment` contains no taggable math content.
 */
function findLastMathContentEnd(segment: string, commentRanges: TextRange[]): number {
  let lineEnd = segment.length;

  while (lineEnd > 0) {
    const prevNl = segment.lastIndexOf('\n', lineEnd - 1);
    const lineStart = prevNl === -1 ? 0 : prevNl + 1;

    let effectiveEnd = lineEnd;
    for (const c of commentRanges) {
      if (c.from >= lineStart && c.from < lineEnd) {
        effectiveEnd = Math.min(effectiveEnd, c.from);
      }
    }

    const lineMath = segment.slice(lineStart, effectiveEnd);
    const withoutCallout = stripCalloutPrefix(lineMath).trim();
    if (!isNonTaggableMathLine(withoutCallout)) {
      let endOffset = effectiveEnd;
      while (endOffset > lineStart && /[ \t\r]/.test(segment[endOffset - 1])) {
        endOffset--;
      }
      return endOffset;
    }

    lineEnd = prevNl;
  }

  return -1;
}

/**
 * Strips trailing top-level `\\` or `\\[...]` at the end of `scope` so Mode 2
 * never inserts a `\tag{...}` onto a phantom empty trailing row before `\end{align}`.
 */
function stripTrailingLineBreakFromScope(scope: string, commentRanges: TextRange[]): string {
  const endOffset = findLastMathContentEnd(scope, commentRanges);
  if (endOffset === -1) return scope;
  const lineStart = scope.lastIndexOf('\n', endOffset - 1) + 1;
  const lineUpToEnd = scope.slice(lineStart, endOffset);
  const trailingBreakMatch = lineUpToEnd.match(/(\\\\(?:\s*\[[^\]]*\])?)$/);
  if (trailingBreakMatch && trailingBreakMatch.index !== undefined) {
    const breakPos = lineStart + trailingBreakMatch.index;
    if (!isEscapedAt(scope, breakPos)) {
      return scope.slice(0, breakPos);
    }
  }
  return scope;
}

function stripTagsFromSegment(segment: string, tags: LatexTagSpan[]): string {
  if (tags.length === 0) return segment;
  let result = '';
  let cursor = 0;
  for (const tag of tags) {
    let cutStart = tag.from;
    while (cutStart > cursor && segment[cutStart - 1] === ' ') {
      cutStart--;
    }
    const hadLeadingSpace = cutStart < tag.from;
    const afterChar = tag.to < segment.length ? segment[tag.to] : '';
    const keepSpace =
      hadLeadingSpace && cutStart > cursor && afterChar !== '' && !/[\r\n \t]/.test(afterChar);
    result += segment.slice(cursor, keepSpace ? cutStart + 1 : cutStart);
    cursor = tag.to;
  }
  result += segment.slice(cursor);
  return result;
}

function isTagAtTerminalPosition(text: string, tag: LatexTagSpan): boolean {
  const lineEnd = text.indexOf('\n', tag.to);
  const effectiveLineEnd = lineEnd === -1 ? text.length : lineEnd;
  let pos = tag.to;
  while (pos < effectiveLineEnd && /[ \t\r]/.test(text[pos])) {
    pos++;
  }
  if (pos >= effectiveLineEnd) return true;
  if (text[pos] === '%' && !isEscapedAt(text, pos)) return true;

  STICKY_LINEBREAK_RE.lastIndex = pos;
  const lbMatch = STICKY_LINEBREAK_RE.exec(text);
  if (lbMatch && !isEscapedAt(text, pos)) {
    let afterLb = pos + lbMatch[0].length;
    while (afterLb < effectiveLineEnd && /[ \t\r]/.test(text[afterLb])) {
      afterLb++;
    }
    if (afterLb >= effectiveLineEnd) return true;
    if (text[afterLb] === '%' && !isEscapedAt(text, afterLb)) return true;
    pos = afterLb;
  }

  STICKY_END_ENV_RE.lastIndex = pos;
  const endMatch = STICKY_END_ENV_RE.exec(text);
  if (endMatch && TOP_LEVEL_EQ_ENVS.has(endMatch[1])) {
    return true;
  }

  return false;
}

function splitLineAtComment(line: string): { mathPart: string; commentPart: string } {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '%' && !isEscapedAt(line, i)) {
      return { mathPart: line.slice(0, i), commentPart: line.slice(i) };
    }
  }
  return { mathPart: line, commentPart: '' };
}

function stripTagsAndHorizWs(mathPart: string): string {
  const { tags } = scanLatexStructure(mathPart);
  let noTags = '';
  let cursor = 0;
  for (const tag of tags) {
    noTags += mathPart.slice(cursor, tag.from);
    cursor = tag.to;
  }
  noTags += mathPart.slice(cursor);
  return noTags.replace(/[ \t\r]+/g, '');
}

function extractIdTokens(text: string): string[] {
  const ids: string[] = [];
  const commentRe = new RegExp(EQ_ID_COMMENT_REGEX.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = commentRe.exec(text)) !== null) {
    ids.push(`comment:${m[1]}`);
  }
  const labelRe = /\\label\{(eq-[\w.-]+)\}/g;
  while ((m = labelRe.exec(text)) !== null) {
    ids.push(`label:${m[1]}`);
  }
  return ids;
}

function findTargetEndEnvIndex(text: string): number {
  let lastInnerEnd = -1;
  let lastAnyEnd = -1;
  let offset = 0;

  while (offset < text.length) {
    const m = findTopLevelEndEnvMatch(text.slice(offset));
    if (!m) break;
    const matchPos = offset + m.index;
    lastAnyEnd = matchPos;
    if (!/^\\end\{\s*subequations\*?\s*\}$/.test(m.matchText)) {
      lastInnerEnd = matchPos;
    }
    offset = matchPos + m.matchText.length;
  }

  return lastInnerEnd !== -1 ? lastInnerEnd : lastAnyEnd;
}

function computeCandidateTagUpdate(blockContent: string, options: TagUpdateOptions): string | null {
  if (!options.printName || blockContent.trim() === '') return null;
  if (isLikelyCorruptedMathBlock(blockContent)) return null;

  const structure = scanLatexStructure(blockContent);
  if (structure.hasMalformedTag || structure.hasUnbalancedTopLevelEnv) {
    return null;
  }
  if (structure.tags.some(t => t.isStarred)) {
    return null;
  }

  // Mode 1: Sub-equations
  if (options.subIndices && options.subIndices.size > 0) {
    const baseName = options.printName.slice(1, -1);
    const parts = splitMathIntoTopLevelRows(blockContent);
    const newParts = [...parts];
    let subIndex = 0;
    let changed = false;

    for (let i = 0; i < parts.length; i += 2) {
      const row = parts[i];
      const rowStructure = scanLatexStructure(row);
      if (rowStructure.tags.some(t => t.isStarred)) {
        continue;
      }

      const endEnvIdx = findTargetEndEnvIndex(row);
      const mathSearchScope = endEnvIdx !== -1 ? row.slice(0, endEnvIdx) : row;

      const lastMathOffset = findLastMathContentEnd(mathSearchScope, rowStructure.commentRanges);
      if (lastMathOffset === -1) {
        continue;
      }

      subIndex++;
      const expectedTagContent = `${baseName}.${subIndex}`;
      const expectedTag = `\\tag{${expectedTagContent}}`;

      const rowTags = rowStructure.tags;
      if (
        rowTags.length === 1 &&
        rowTags[0].braceDepth === 0 &&
        rowTags[0].content === expectedTagContent &&
        isTagAtTerminalPosition(row, rowTags[0])
      ) {
        continue;
      }

      changed = true;
      if (
        rowTags.length === 1 &&
        rowTags[0].braceDepth === 0 &&
        isTagAtTerminalPosition(row, rowTags[0])
      ) {
        newParts[i] = row.slice(0, rowTags[0].from) + expectedTag + row.slice(rowTags[0].to);
      } else {
        const strippedRow = stripTagsFromSegment(row, rowTags);
        const strippedStructure = scanLatexStructure(strippedRow);
        const strippedEndEnvIdx = findTargetEndEnvIndex(strippedRow);
        const strippedScope =
          strippedEndEnvIdx !== -1 ? strippedRow.slice(0, strippedEndEnvIdx) : strippedRow;
        const insertPos = findLastMathContentEnd(strippedScope, strippedStructure.commentRanges);
        if (insertPos === -1) return null;

        newParts[i] =
          `${strippedRow.slice(0, insertPos)} ${expectedTag}${strippedRow.slice(insertPos)}`;
      }
    }

    if (!changed) return null;
    return newParts.join('');
  }

  // Mode 2: Normal equations
  const requiredTagContent = options.printName.slice(1, -1);
  const expectedTagStr = `\\tag{${requiredTagContent}}`;
  const { tags } = structure;

  if (
    tags.length === 1 &&
    tags[0].braceDepth === 0 &&
    !tags[0].isStarred &&
    isTagAtTerminalPosition(blockContent, tags[0])
  ) {
    if (tags[0].content === requiredTagContent) {
      return null;
    }
    return blockContent.slice(0, tags[0].from) + expectedTagStr + blockContent.slice(tags[0].to);
  }

  const baseText = tags.length > 0 ? stripTagsFromSegment(blockContent, tags) : blockContent;
  const baseStructure = tags.length > 0 ? scanLatexStructure(baseText) : structure;

  const targetEndEnvIdx = findTargetEndEnvIndex(baseText);
  let searchScope = targetEndEnvIdx !== -1 ? baseText.slice(0, targetEndEnvIdx) : baseText;
  searchScope = stripTrailingLineBreakFromScope(searchScope, baseStructure.commentRanges);

  const insertPos = findLastMathContentEnd(searchScope, baseStructure.commentRanges);
  if (insertPos === -1) return null;

  return `${baseText.slice(0, insertPos)} ${expectedTagStr}${baseText.slice(insertPos)}`;
}

/**
 * Computes a safe, idempotent tag update for the inner content of a $$...$$ block
 * (excluding outer $$ delimiters). Returns `null` if no update is needed or if any
 * pre-condition or Heavy Gate post-validation invariant fails.
 */
export function computeSafeTagUpdate(
  blockContent: string,
  options: TagUpdateOptions
): string | null {
  if (!options.printName) {
    return null;
  }

  const candidate = computeCandidateTagUpdate(blockContent, options);
  if (candidate === null || candidate === blockContent) {
    return null;
  }

  // Heavy Gate 1: Line-Preserving Non-Tag Equivalence
  const oldLines = blockContent.split('\n');
  const newLines = candidate.split('\n');
  if (oldLines.length !== newLines.length) {
    return null;
  }
  for (let i = 0; i < oldLines.length; i++) {
    const oldParts = splitLineAtComment(oldLines[i]);
    const newParts = splitLineAtComment(newLines[i]);
    if (oldParts.commentPart !== newParts.commentPart) {
      return null;
    }
    if (stripCalloutPrefix(oldParts.mathPart).trim() === '') {
      if (newLines[i] !== oldLines[i]) {
        return null;
      }
    } else if (stripTagsAndHorizWs(oldParts.mathPart) !== stripTagsAndHorizWs(newParts.mathPart)) {
      return null;
    }
  }

  // Heavy Gate 2: ID Preservation
  const oldIds = extractIdTokens(blockContent);
  const newIds = extractIdTokens(candidate);
  if (oldIds.length !== newIds.length || oldIds.some((id, idx) => id !== newIds[idx])) {
    return null;
  }

  // Heavy Gate 3: Strict Tag Placement Grammar Gate
  const newStructure = scanLatexStructure(candidate);
  if (newStructure.hasMalformedTag || newStructure.hasUnbalancedTopLevelEnv) {
    return null;
  }
  for (const tag of newStructure.tags) {
    if (tag.braceDepth !== 0 || tag.isStarred) {
      return null;
    }
    if (!isTagAtTerminalPosition(candidate, tag)) {
      return null;
    }
    const lineStart = candidate.lastIndexOf('\n', tag.from - 1) + 1;
    const beforeOnLine = stripCalloutPrefix(candidate.slice(lineStart, tag.from)).trim();
    if (isNonTaggableMathLine(beforeOnLine)) {
      return null;
    }
    if (/(\\\\(?:\s*\[[^\]]*\])?|\\tag\*?\{[^{}]*\})$/.test(beforeOnLine)) {
      return null;
    }
    const endBeforeMatch = beforeOnLine.match(/\\end\{\s*([a-zA-Z*]+)\s*\}$/);
    if (endBeforeMatch && TOP_LEVEL_EQ_ENVS.has(endBeforeMatch[1])) {
      return null;
    }
  }

  // Heavy Gate 4: Exact Tag Count & Format
  const requiredBase = options.printName.slice(1, -1);
  if (options.subIndices && options.subIndices.size > 0) {
    if (newStructure.tags.length === 0) return null;
    const subTagRe = new RegExp(`^${requiredBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d+$`);
    if (newStructure.tags.some(t => !subTagRe.test(t.content))) {
      return null;
    }
  } else {
    if (newStructure.tags.length !== 1 || newStructure.tags[0].content !== requiredBase) {
      return null;
    }
  }

  // Heavy Gate 5: Idempotency
  if (computeCandidateTagUpdate(candidate, options) !== null) {
    return null;
  }

  return candidate;
}
