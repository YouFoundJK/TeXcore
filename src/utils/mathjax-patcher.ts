import { loadMathJax } from 'obsidian';
import { logDebug, logWarn } from './logger';

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
 * Deeply patches Obsidian's global MathJax 3 instance so that re-rendering
 * equations during editing/keystrokes never throws "Label '...' multiply defined"
 * and never renders illegal `<br>` tags inside equations.
 */
export function setupMathJaxPatcher(): void {
  const clearLabel = (tagsObj: any, labelName: string) => {
    if (!tagsObj) return;
    if (tagsObj.labels && tagsObj.labels[labelName]) {
      logDebug('MathJaxPatcher', `Cleared label "${labelName}" from tags.labels`);
      delete tagsObj.labels[labelName];
    }
    if (tagsObj.allLabels && tagsObj.allLabels[labelName]) {
      delete tagsObj.allLabels[labelName];
    }
  };

  const patchPrototype = (proto: any, name: string) => {
    if (!proto || typeof proto.addLabel !== 'function' || proto.addLabel._obsitexPatched)
      return false;

    const originalAddLabel = proto.addLabel;
    proto.addLabel = function (labelName: string, num: string, tag: string) {
      clearLabel(this, labelName);
      try {
        return originalAddLabel.call(this, labelName, num, tag);
      } catch (err: any) {
        const msg = String(err?.message || err);
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
    proto.addLabel._obsitexPatched = true;
    logDebug('MathJaxPatcher', `Successfully patched ${name}.prototype.addLabel!`);
    return true;
  };

  const patch = () => {
    if (typeof window === 'undefined') return;
    const MathJax = (window as unknown as { MathJax?: any }).MathJax;
    if (!MathJax) return;

    try {
      // 1. Patch MathJax 3 Module Registry prototypes (_ object)
      const modules = MathJax._;
      if (modules) {
        if (modules['input/tex/Tags']?.AbstractTags?.prototype) {
          patchPrototype(modules['input/tex/Tags'].AbstractTags.prototype, 'AbstractTags');
        }
        if (modules['input/tex/ams/AmsTags']?.AmsTags?.prototype) {
          patchPrototype(modules['input/tex/ams/AmsTags'].AmsTags.prototype, 'AmsTags');
        }
        if (modules['input/tex/all/AllTags']?.AllTags?.prototype) {
          patchPrototype(modules['input/tex/all/AllTags'].AllTags.prototype, 'AllTags');
        }
      }

      // 2. Patch active InputJax instances and parseOptions
      const inputJax = MathJax.startup?.document?.inputJax;
      if (Array.isArray(inputJax)) {
        for (const jax of inputJax) {
          const tags = jax.parseOptions?.tags;
          if (tags) {
            patchPrototype(Object.getPrototypeOf(tags), 'InputJaxTagsProto');
            patchPrototype(tags, 'InputJaxTagsInstance');
          }
        }
      }

      // 3. Patch tex2chtml and tex2svg to auto-clear label and clean <br> tags before conversion
      const patchConverter = (methodName: string) => {
        if (typeof MathJax[methodName] === 'function' && !MathJax[methodName]._obsitexPatched) {
          const originalConverter = MathJax[methodName];
          MathJax[methodName] = function (math: string, options: any) {
            if (typeof math === 'string') {
              math = cleanBrFromMathText(math);
            }
            try {
              if (typeof math === 'string' && math.includes('\\label{')) {
                const matches = math.matchAll(/\\label\{([^{}]+)\}/g);
                const inputJaxList = MathJax.startup?.document?.inputJax;
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
            return originalConverter.call(this, math, options);
          };
          MathJax[methodName]._obsitexPatched = true;
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
