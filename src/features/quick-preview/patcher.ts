import { around } from 'monkey-around';
import LatexReferencer from 'main';
import { PopoverManager } from './popoverManager';
import { PatchedSuggester, PreviewInfo, Suggester } from './types';

export function patchSuggesterWithQuickPreview<T>(
  plugin: LatexReferencer,
  suggesterClass: new (...args: unknown[]) => Suggester<T>,
  itemNormalizer: (item: T) => PreviewInfo | null
) {
  const uninstaller = around(suggesterClass.prototype, {
    open(old) {
      return function (this: PatchedSuggester<T>) {
        old.call(this);
        if (!this.popoverManager) {
          this.popoverManager = new PopoverManager<T>(plugin, this, itemNormalizer);
        }
        this.popoverManager.load();
      };
    },
    close(old) {
      return function (this: PatchedSuggester<T>) {
        old.call(this);
        // close() can be called before open() at startup, so we need the optional chaining (?.)
        this.popoverManager?.unload();
      };
    }
  });

  plugin.register(uninstaller);
  return uninstaller;
}
