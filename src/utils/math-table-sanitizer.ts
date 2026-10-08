/**
 * Sanitizes LaTeX math strings specifically within Markdown table cells.
 * Resolves HTML <br> tags, line-breaks inside environments, MathJax 4 label placement,
 * and handles re-rendering of MathJax error elements and surgical DOM pruning of < b r > glyphs.
 */

import { renderMath, finishRenderMath } from 'obsidian';
import { logDebug } from './logger';

export interface SanitizedMathResult {
  /** Clean LaTeX string suitable for MathJax 4 rendering */
  cleanLatex: string;
  /** Whether the string had illegal HTML tags or misplaced labels */
  wasModified: boolean;
  /** Extracted label ID if present (e.g., "eq-4a8b2c0d") */
  labelId: string | null;
}

const BR_REGEX = /<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;/gi;
const LABEL_REGEX = /\\label\{([^{}]+)\}/;

/**
 * Sanitizes LaTeX code extracted from table cells for safe MathJax 4 rendering.
 */
export function sanitizeTableMath(rawMath: string): SanitizedMathResult {
  if (!rawMath) {
    return { cleanLatex: '', wasModified: false, labelId: null };
  }

  let text = rawMath.trim();
  const original = text;

  // 1. Extract label if present
  let labelId: string | null = null;
  const labelMatch = text.match(LABEL_REGEX);
  if (labelMatch) {
    labelId = labelMatch[1].trim();
  }

  // 2. Check if math uses an environment like \begin{align}, \begin{aligned}, etc.
  const hasBeginEnv = /\\begin\{([a-zA-Z*]+)\}/.test(text);

  if (hasBeginEnv) {
    // When inside an environment:
    // Strip <br> immediately preceding \begin{...}
    text = text.replace(new RegExp(`^(\\s*(${BR_REGEX.source})\\s*)+`, 'gi'), '');

    // Strip <br> immediately after \begin{...}
    text = text.replace(
      /(\\begin\{[a-zA-Z*]+\})\s*(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi,
      '$1 '
    );

    // Strip <br> immediately preceding \end{...}
    text = text.replace(
      /(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+\s*(\\end\{[a-zA-Z*]+\})/gi,
      ' $1'
    );

    // Replace internal \\ followed by <br> with just \\
    text = text.replace(/(\\\\)\s*(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi, '$1\n');

    // Any remaining standalone <br> inside environments that were meant to be row breaks
    text = text.replace(BR_REGEX, ' ');

    // Ensure \label is placed INSIDE before \end{...} rather than trailing outside
    if (labelMatch) {
      const labelStr = labelMatch[0];
      const allEndMatches = Array.from(text.matchAll(/\\end\{([a-zA-Z*]+)\}/g));
      const endMatch = allEndMatches[allEndMatches.length - 1];
      if (endMatch && endMatch.index !== undefined && (labelMatch.index ?? 0) > endMatch.index) {
        // Label was outside \end - move it inside before outermost \end
        text = text.replace(labelStr, '');
        const endPos = text.lastIndexOf(endMatch[0]);
        text = `${text.substring(0, endPos).trimEnd()} ${labelStr} ${text.substring(endPos)}`;
      }
    }
  } else {
    // Single row or simple equation without align environment
    // Strip leading and trailing <br>
    text = text.replace(new RegExp(`^(\\s*(${BR_REGEX.source})\\s*)+`, 'gi'), '');
    text = text.replace(new RegExp(`(\\s*(${BR_REGEX.source})\\s*)+$`, 'gi'), '');
    // Replace internal <br> with space
    text = text.replace(BR_REGEX, ' ');
  }

  // Normalize excessive whitespace
  text = text.replace(/[ \t]{2,}/g, ' ').trim();

  return {
    cleanLatex: text,
    wasModified: text !== original,
    labelId
  };
}

/**
 * Resets MathJax 4 internal label registry and configures it to ignore duplicate labels.
 */
interface MathJaxJaxInput {
  parseOptions?: {
    options?: { ignoreDuplicateLabels?: boolean };
    tags?: {
      reset?: () => void;
      allLabels?: Record<string, unknown>;
      labels?: Record<string, unknown>;
      allIds?: Record<string, unknown>;
    };
  };
  options?: { ignoreDuplicateLabels?: boolean };
}

interface GlobalMathJax {
  texReset?: () => void;
  config?: { tex?: { ignoreDuplicateLabels?: boolean } };
  startup?: {
    ['document']?: {
      inputJax?: MathJaxJaxInput[];
    };
  };
}

export function resetMathJaxLabels(): void {
  if (typeof window === 'undefined') return;
  const anyWindow = window as unknown as {
    MathJax?: GlobalMathJax;
  };

  const mj = anyWindow.MathJax;
  if (!mj) return;

  try {
    if (mj.config?.tex) {
      mj.config.tex.ignoreDuplicateLabels = true;
    }
  } catch {
    // Ignore fallback
  }

  try {
    if (typeof mj.texReset === 'function') {
      mj.texReset();
    }
  } catch {
    // Ignore fallback
  }

  try {
    const inputJax = mj.startup?.document?.inputJax;
    if (Array.isArray(inputJax)) {
      for (const jax of inputJax) {
        if (jax.parseOptions?.options) {
          jax.parseOptions.options.ignoreDuplicateLabels = true;
        }
        if (jax.parseOptions?.tags) {
          if (typeof jax.parseOptions.tags.reset === 'function') {
            jax.parseOptions.tags.reset();
          }
          jax.parseOptions.tags.allLabels = {};
          jax.parseOptions.tags.labels = {};
          jax.parseOptions.tags.allIds = {};
        }
        if (jax.options) {
          jax.options.ignoreDuplicateLabels = true;
        }
      }
    }
  } catch {
    // Ignore fallback
  }
}

/**
 * Surgically prunes MathJax-rendered < b r > glyph sequences in both MathJax 3 and MathJax 4 DOM structures.
 */
export function pruneMathBrGlyphs(container: HTMLElement): void {
  if (!container) return;

  // 1. MathJax 4: <mjx-mo>&lt;</mjx-mo><mjx-mi>b</mjx-mi><mjx-mi>r</mjx-mi><mjx-mo>&gt;</mjx-mo>
  //    MathJax 3: mjx-c[c="3C"], mjx-c.mjx-c3C
  const openCandidates = container.querySelectorAll<HTMLElement>(
    'mjx-mo, mjx-c[c="3C"], mjx-c.mjx-c3C'
  );

  openCandidates.forEach(candidate => {
    const moOpen =
      candidate.tagName.toLowerCase() === 'mjx-mo'
        ? candidate
        : candidate.closest<HTMLElement>('mjx-mo');
    if (!moOpen) return;

    const isOpen =
      moOpen.textContent?.trim() === '<' ||
      moOpen.querySelector('mjx-c[c="3C"], .mjx-c3C') !== null;
    if (!isOpen) return;

    const bEl = moOpen.nextElementSibling as HTMLElement | null;
    const rEl = bEl?.nextElementSibling as HTMLElement | null;
    const moClose = rEl?.nextElementSibling as HTMLElement | null;

    if (bEl && rEl && moClose) {
      const bText = bEl.textContent?.trim() || '';
      const bHTML = bEl.innerHTML || '';
      const isB = bText === 'b' || bHTML.includes('1D44F') || bHTML.includes('c1D44F');

      const rText = rEl.textContent?.trim() || '';
      const rHTML = rEl.innerHTML || '';
      const isR = rText === 'r' || rHTML.includes('1D45F') || rHTML.includes('c1D45F');

      const closeText = moClose.textContent?.trim() || '';
      const closeHTML = moClose.innerHTML || '';
      const isCloseGt =
        closeText === '>' ||
        closeHTML.includes('3E') ||
        closeHTML.includes('c3E') ||
        moClose.textContent?.trim() === '>';

      if (isB && isR && isCloseGt) {
        moOpen.remove();
        bEl.remove();
        rEl.remove();
        moClose.remove();
      }
    }
  });

  // 2. Remove entire MathJax rows/cells whose only content is <br>
  const cells = container.querySelectorAll<HTMLElement>('mjx-mtd, mjx-mtr');
  cells.forEach(cell => {
    const text = (cell.textContent || '').trim().replace(/\s+/g, '').toLowerCase();
    if (text === '<br>' || text === '<br/>') {
      if (cell.tagName.toLowerCase() === 'mjx-mtr') {
        cell.remove();
      } else {
        cell.innerHTML = '';
      }
    }
  });
}

/**
 * Detects and re-renders MathJax error boxes (<mjx-merror>) that failed due to <br> or invalid label syntax.
 */
export function fixTableMerrors(container: HTMLElement): void {
  if (!container) return;

  const merrors = container.querySelectorAll<HTMLElement>(
    'mjx-merror, [data-mjx-error], .mjx-error'
  );
  if (merrors.length === 0) return;

  for (const merror of Array.from(merrors)) {
    if (
      merror.getAttribute('data-obsitex-cleaned') === 'true' ||
      merror.closest('[data-obsitex-cleaned="true"]')
    ) {
      continue;
    }

    const rawLatex = merror.textContent || '';
    if (!rawLatex.trim()) continue;

    const sanitized = sanitizeTableMath(rawLatex);
    if (!sanitized.cleanLatex || !sanitized.wasModified) {
      // Mark legitimate syntax errors so they are not repeatedly re-rendered in mutation loops
      merror.setAttribute('data-obsitex-cleaned', 'true');
      continue;
    }

    const mjxContainer = merror.closest<HTMLElement>('mjx-container');
    const targetParent = mjxContainer?.parentElement || merror.parentElement;
    if (!targetParent) continue;

    try {
      resetMathJaxLabels();
      const newMathEl = renderMath(sanitized.cleanLatex, true);
      newMathEl.setAttribute('data-obsitex-cleaned', 'true');

      if (mjxContainer) {
        mjxContainer.replaceWith(newMathEl);
      } else {
        merror.replaceWith(newMathEl);
      }

      if (sanitized.labelId) {
        const cell = targetParent.closest<HTMLElement>('td, th');
        if (cell && !cell.id) {
          cell.id = sanitized.labelId;
        }
      }

      void finishRenderMath();
      logDebug(
        'MathTableSanitizer',
        `Successfully recovered equation "${sanitized.labelId || 'table-math'}"`
      );
    } catch (e) {
      logDebug('MathTableSanitizer', 'Failed to re-render sanitized math:', e);
    }
  }
}

/**
 * Detects and cleanly re-renders MathJax containers that contain <br> or &lt;br&gt; in their LaTeX source.
 */
export function fixTableMathWithBr(container: HTMLElement): void {
  if (!container) return;

  const mathContainers = container.querySelectorAll<HTMLElement>('mjx-container, .math');
  for (const el of Array.from(mathContainers)) {
    if (
      el.getAttribute('data-obsitex-cleaned') === 'true' ||
      el.closest('[data-obsitex-cleaned="true"]')
    ) {
      continue;
    }

    const mathNode =
      el.tagName.toLowerCase() === 'mjx-container' ? el.querySelector('mjx-math') : el;
    const rawLatex =
      mathNode?.getAttribute('data-latex') ||
      el.getAttribute('data-math') ||
      el.getAttribute('data-latex') ||
      '';

    if (
      rawLatex &&
      (rawLatex.includes('<br>') || rawLatex.includes('&lt;br&gt;') || BR_REGEX.test(rawLatex))
    ) {
      const sanitized = sanitizeTableMath(rawLatex);
      if (sanitized.wasModified && sanitized.cleanLatex) {
        const targetToReplace = el.closest<HTMLElement>('mjx-container') || el;
        const targetParent = targetToReplace.parentElement;
        if (!targetParent) continue;

        try {
          resetMathJaxLabels();
          const newMathEl = renderMath(sanitized.cleanLatex, true);
          newMathEl.setAttribute('data-obsitex-cleaned', 'true');
          targetToReplace.replaceWith(newMathEl);

          if (sanitized.labelId) {
            const cell = targetParent.closest<HTMLElement>('td, th');
            if (cell && !cell.id) {
              cell.id = sanitized.labelId;
            }
          }
          void finishRenderMath();
          logDebug(
            'MathTableSanitizer',
            `Successfully re-rendered contaminated table equation "${sanitized.labelId || 'table-math'}"`
          );
        } catch (e) {
          logDebug('MathTableSanitizer', 'Failed to re-render sanitized math with <br>:', e);
        }
      }
    }
  }
}

/**
 * Comprehensive fixer for table math elements.
 * Runs error recovery, clean LaTeX re-rendering for <br>-contaminated math,
 * and fallback surgical glyph pruning.
 */
export function fixMathInTableElement(container: HTMLElement): void {
  if (!container) return;

  // 1. Recover any MathJax syntax errors (<mjx-merror>) caused by table markup
  fixTableMerrors(container);

  // 2. Re-render any math elements whose LaTeX source contains <br>
  fixTableMathWithBr(container);

  // 3. Fallback surgical prune for any stray rendered < b r > glyphs
  pruneMathBrGlyphs(container);
}
