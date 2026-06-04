import { around } from 'monkey-around';
import LatexReferencer from 'main';
import { PopoverManager } from './popoverManager';
import { PatchedSuggester, PreviewInfo, Suggester } from './types';

export function patchSuggesterWithQuickPreview<T>(
  plugin: LatexReferencer,
  suggesterClass: new (plugin: LatexReferencer) => Suggester<T>,
  itemNormalizer: (item: T) => PreviewInfo | null
) {
  const uninstaller = around(suggesterClass.prototype, {
    open(old: unknown) {
      const oldFunc = old as (this: unknown) => void;
      return function (this: PatchedSuggester<T>) {
        oldFunc.call(this);
        if (!this.popoverManager) {
          this.popoverManager = new PopoverManager<T>(plugin, this, itemNormalizer);
        }
        this.popoverManager.load();
      };
    },
    close(old: unknown) {
      const oldFunc = old as (this: unknown) => void;
      return function (this: PatchedSuggester<T>) {
        oldFunc.call(this);
        // close() can be called before open() at startup, so we need the optional chaining (?.)
        this.popoverManager?.unload();
      };
    }
  });

  plugin.register(uninstaller);
  return uninstaller;
}
