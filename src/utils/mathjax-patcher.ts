import { loadMathJax } from 'obsidian';
import { logDebug, logWarn } from './logger';

interface MathJaxTags {
  labels?: Record<string, unknown>;
  allLabels?: Record<string, unknown>;
  addLabel?: MathJaxAddLabelFn;
}

interface MathJaxAddLabelFn {
  (this: MathJaxTags, labelName: string, num: string, tag: string): unknown;
  _obsitexPatched?: boolean;
}

interface MathJaxParseOptions {
  tags?: MathJaxTags;
}

interface MathJaxInputJax {
  parseOptions?: MathJaxParseOptions;
}

interface MathJaxModuleTag {
  AbstractTags?: { prototype?: MathJaxTags };
  AmsTags?: { prototype?: MathJaxTags };
  AllTags?: { prototype?: MathJaxTags };
}

interface MathJaxConverterFn {
  (this: unknown, math: string, options?: unknown): unknown;
  _obsitexPatched?: boolean;
}

interface MathJaxGlobal {
  _?: Record<string, MathJaxModuleTag>;
  startup?: Record<string, { inputJax?: MathJaxInputJax[] }>;
  tex2chtml?: MathJaxConverterFn;
  tex2svg?: MathJaxConverterFn;
  tex2chtmlPromise?: MathJaxConverterFn;
  tex2svgPromise?: MathJaxConverterFn;
}

/**
 * Strips all HTML `<br>`, `< br >`, and `&lt;br&gt;` tags from math text before MathJax compiles it.
 */
export function cleanBrFromMathText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  const brRegex = /(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi;
  if (!brRegex.test(text)) return text;

  let cleaned = text;
  cleaned = cleaned.replace(
    /^(\s*(?:\$\$|\$)?)\s*(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi,
    '$1 '
  );
  cleaned = cleaned.replace(
    /(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+\s*((?:\$\$|\$)?\s*)$/gi,
    ' $1'
  );
  cleaned = cleaned.replace(
    /\\begin\{([a-zA-Z*]+)\}\s*(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+/gi,
    '\\begin{$1} '
  );
  cleaned = cleaned.replace(
    /(?:<\s*b\s*r\s*\/?\s*>|&lt;\s*b\s*r\s*\/?\s*&gt;)+\s*\\end\{([a-zA-Z*]+)\}/gi,
    ' \\end{$1}'
  );
  cleaned = cleaned.replace(brRegex, ' ');
  return cleaned.replace(/[ \t]{2,}/g, ' ');
}

/**
 * Strips callout/blockquote prefixes (`>`, `> `, `>> `) from lines inside math text
 * before MathJax compiles it. In Obsidian callouts, Markdown syntax requires each line
 * inside $$ ... $$ to start with '>', but MathJax would otherwise render those '>' as
 * greater-than math symbols inside the equation.
 */
export function cleanCalloutPrefixesFromMathText(text: string): string {
  if (!text || typeof text !== 'string' || !text.includes('>')) return text;

  const lines = text.split('\n');
  const hasCalloutPrefix = lines.some(line => /^\s*(?:>\s*)+/.test(line));
  if (!hasCalloutPrefix) return text;

  return lines.map(line => line.replace(/^\s*(?:>\s*)+/, '')).join('\n');
}

/**
 * Deeply patches Obsidian's global MathJax 3 instance so that re-rendering
 * equations during editing/keystrokes never throws "Label '...' multiply defined"
 * and never renders illegal `<br>` tags inside equations.
 */
export function setupMathJaxPatcher(): void {
  const clearLabel = (tagsObj: MathJaxTags | undefined, labelName: string): void => {
    if (!tagsObj) return;
    if (tagsObj.labels && Object.prototype.hasOwnProperty.call(tagsObj.labels, labelName)) {
      logDebug('MathJaxPatcher', `Cleared label "${labelName}" from tags.labels`);
      delete tagsObj.labels[labelName];
    }
    if (tagsObj.allLabels && Object.prototype.hasOwnProperty.call(tagsObj.allLabels, labelName)) {
      delete tagsObj.allLabels[labelName];
    }
  };

  const patchPrototype = (proto: MathJaxTags | undefined, name: string): boolean => {
    if (!proto || typeof proto.addLabel !== 'function' || proto.addLabel._obsitexPatched) {
      return false;
    }

    const originalAddLabel = proto.addLabel;
    const patchedAddLabel: MathJaxAddLabelFn = function (
      this: MathJaxTags,
      labelName: string,
      num: string,
      tag: string
    ): unknown {
      clearLabel(this, labelName);
      try {
        return originalAddLabel.call(this, labelName, num, tag);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('multiply defined')) {
          logDebug(
            'MathJaxPatcher',
            `[${name}] Suppressed duplicate label error for "${labelName}".`
          );
          if (this.labels) {
            this.labels[labelName] = { format: () => num, tag };
          }
          return;
        }
        throw err;
      }
    };
    patchedAddLabel._obsitexPatched = true;
    proto.addLabel = patchedAddLabel;
    logDebug('MathJaxPatcher', `Successfully patched ${name}.prototype.addLabel!`);
    return true;
  };

  const patch = () => {
    if (typeof window === 'undefined') return;
    const MathJax = (window as unknown as { MathJax?: MathJaxGlobal }).MathJax;
    if (!MathJax) return;

    try {
      // 1. Patch MathJax 3 Module Registry prototypes (_ object)
      const modules = MathJax._;
      if (modules) {
        const tagsMod = modules['input/tex/Tags']?.AbstractTags?.prototype;
        if (tagsMod) {
          patchPrototype(tagsMod, 'AbstractTags');
        }
        const amsMod = modules['input/tex/ams/AmsTags']?.AmsTags?.prototype;
        if (amsMod) {
          patchPrototype(amsMod, 'AmsTags');
        }
        const allMod = modules['input/tex/all/AllTags']?.AllTags?.prototype;
        if (allMod) {
          patchPrototype(allMod, 'AllTags');
        }
      }

      // 2. Patch active InputJax instances and parseOptions
      const inputJax = MathJax.startup?.['document']?.inputJax;
      if (Array.isArray(inputJax)) {
        for (const jax of inputJax) {
          const tags = jax.parseOptions?.tags;
          if (tags) {
            patchPrototype(Object.getPrototypeOf(tags) as MathJaxTags, 'InputJaxTagsProto');
            patchPrototype(tags, 'InputJaxTagsInstance');
          }
        }
      }

      // 3. Patch tex2chtml and tex2svg to auto-clear label and clean <br> tags before conversion
      const patchConverter = (methodName: keyof MathJaxGlobal) => {
        const targetFn = MathJax[methodName] as MathJaxConverterFn | undefined;
        if (typeof targetFn === 'function' && !targetFn._obsitexPatched) {
          const originalConverter = targetFn;
          const patchedConverter: MathJaxConverterFn = function (
            this: unknown,
            math: string,
            options?: unknown
          ): unknown {
            let processedMath = math;
            if (typeof processedMath === 'string') {
              processedMath = cleanBrFromMathText(processedMath);
              processedMath = cleanCalloutPrefixesFromMathText(processedMath);
            }
            try {
              if (typeof processedMath === 'string' && processedMath.includes('\\label{')) {
                const matches = processedMath.matchAll(/\\label\{([^{}]+)\}/g);
                const inputJaxList = MathJax.startup?.['document']?.inputJax;
                if (Array.isArray(inputJaxList)) {
                  for (const jax of inputJaxList) {
                    const tags = jax.parseOptions?.tags;
                    if (tags) {
                      for (const m of matches) {
                        clearLabel(tags, m[1]);
                      }
                    }
                  }
                }
              }
            } catch {
              // Best effort cleanup
            }
            return originalConverter.call(this, processedMath, options);
          };
          patchedConverter._obsitexPatched = true;
          (MathJax as unknown as Record<string, MathJaxConverterFn>)[methodName] = patchedConverter;
          logDebug('MathJaxPatcher', `Successfully patched MathJax.${methodName}`);
        }
      };

      patchConverter('tex2chtml');
      patchConverter('tex2svg');
      patchConverter('tex2chtmlPromise');
      patchConverter('tex2svgPromise');
    } catch (e) {
      logWarn('MathJaxPatcher', 'Failed to patch MathJax label handler:', e);
    }
  };

  // 1. Trigger via Obsidian's loadMathJax API
  void loadMathJax()
    .then(() => {
      logDebug('MathJaxPatcher', 'loadMathJax() resolved! Applying MathJax patches...');
      patch();
    })
    .catch(err => {
      logWarn('MathJaxPatcher', 'loadMathJax() failed:', err);
    });

  // 2. Fallback periodic check
  patch();
  if (typeof window !== 'undefined') {
    const interval = window.setInterval(() => patch(), 1000);
    window.setTimeout(() => window.clearInterval(interval), 15000);
  }
}
