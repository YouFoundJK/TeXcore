import {
  Component,
  Keymap,
  KeymapEventHandler,
  PopoverSuggest,
  SuggestModal,
  Suggestions
} from 'obsidian';

import LatexReferencer from 'main';
import { QuickPreviewHoverParent } from './hoverParent';
import { getSelectedItem } from './utils';
import { PatchedSuggester, PreviewInfo } from './types';

export class PopoverManager<T> extends Component {
  suggestions: Suggestions<T>;
  currentHoverParent: QuickPreviewHoverParent<T> | null = null;
  currentOpenHoverParent: QuickPreviewHoverParent<T> | null = null;
  lastEvent: MouseEvent | PointerEvent | null = null;
  handlers: KeymapEventHandler[] = [];
  popoverHeight: number | null = null;
  popoverWidth: number | null = null;

  constructor(
    private plugin: LatexReferencer,
    public suggest: PatchedSuggester<T>,
    private itemNormalizer: (item: T) => PreviewInfo | null
  ) {
    super();

    if (suggest instanceof PopoverSuggest) {
      this.suggestions = suggest.suggestions;
    } else {
      // The 'as any' cast is no longer needed because the types now match perfectly
      this.suggestions = (suggest as SuggestModal<T>).chooser;
    }
  }

  get doc() {
    return this.suggestions.containerEl.doc;
  }

  get win() {
    return this.doc.win;
  }

  onload() {
    const modifier = this.plugin.settings.modifierToJump;

    this.registerDomEvent(this.win, 'keydown', event => {
      if (this.suggest.isOpen && Keymap.isModifier(event, modifier)) {
        if (this.currentOpenHoverParent) this.hide();
        else {
          const item = getSelectedItem(this.suggestions);
          if (item) this.spawnPreview(item);
        }
      }
    });

    this.registerDomEvent(this.win, 'keyup', (event: KeyboardEvent) => {
      // We check for the specific key, not the modifier state, to avoid conflicts.
      if (event.key === modifier) this.hide();
    });

    this.registerDomEvent(this.win, 'mousemove', (event: MouseEvent) => {
      if (!Keymap.isModifier(event, modifier)) this.hide();
    });

    if (this.suggest instanceof PopoverSuggest) {
      this.handlers.push(
        this.suggest.scope.register([modifier], 'ArrowUp', event => {
          this.suggestions.moveUp(event);
          return false;
        }),
        this.suggest.scope.register([modifier], 'ArrowDown', event => {
          this.suggestions.moveDown(event);
          return false;
        })
      );
    }
  }

  onunload() {
    this.handlers.forEach(handler => {
      this.suggest.scope.unregister(handler);
    });
    this.handlers.length = 0;

    this.currentHoverParent?.hide();
    this.currentHoverParent = null;
    this.currentOpenHoverParent?.hide();
    this.currentOpenHoverParent = null;
    this.lastEvent = null;
  }

  hide() {
    this.currentHoverParent?.hide();
    this.currentHoverParent = null;
  }

  spawnPreview(item: T) {
    this.hide();
    this.currentHoverParent = new QuickPreviewHoverParent(this.suggest);
    const info = this.itemNormalizer(item);

    if (info) {
      const self = this.plugin.app.internalPlugins.getPluginById('page-preview')?.instance as {
        onLinkHover(
          parent: unknown,
          body: HTMLElement,
          linktext: string,
          sourcePath: string,
          state: { scroll?: number }
        ): void;
      } | null;
      if (self) {
        self.onLinkHover(this.currentHoverParent, this.doc.body, info.linktext, info.sourcePath, {
          scroll: info.line
        });
      }
    }
  }

  getShownPos(): { x: number; y: number } {
    return this.getShownPosAuto();
  }

  getShownPosCorner(position: 'Top left' | 'Top right' | 'Bottom left' | 'Bottom right') {
    if (position === 'Top left') return { x: 0, y: 0 };
    if (position === 'Top right') return { x: this.win.innerWidth, y: 0 };
    if (position === 'Bottom left') return { x: 0, y: this.win.innerHeight };
    return { x: this.win.innerWidth, y: this.win.innerHeight };
  }

  getShownPosAuto(): { x: number; y: number } {
    const el = this.suggestions.containerEl;
    const { top, bottom, left, right, width } = el.getBoundingClientRect();

    const popover = this.currentHoverParent?.hoverPopover;
    this.popoverWidth = popover?.hoverEl.offsetWidth ?? this.popoverWidth ?? null;

    if (this.popoverWidth) {
      const offsetX = width * 0.1;
      if (right - offsetX + this.popoverWidth < this.win.innerWidth) {
        return { x: right - offsetX, y: top + 20 };
      }
      if (left > this.popoverWidth + offsetX) {
        return { x: left - this.popoverWidth - offsetX, y: top + 20 };
      }
    }

    const x = (left + right) * 0.5;
    const y = (top + bottom) * 0.5;

    if (x >= this.win.innerWidth * 0.6) {
      return y >= this.win.innerHeight * 0.5
        ? this.getShownPosCorner('Top left')
        : this.getShownPosCorner('Bottom left');
    }
    return y >= this.win.innerHeight * 0.5
      ? this.getShownPosCorner('Top right')
      : this.getShownPosCorner('Bottom right');
  }
}
