import { CustomCalloutManager, formatColorToRgb } from '../src/features/custom-callouts/manager';
import type LatexReferencer from '../src/main';

describe('CustomCalloutManager & formatColorToRgb', () => {
  describe('formatColorToRgb', () => {
    it('formats hex colors (#rrggbb and #rgb)', () => {
      expect(formatColorToRgb('#ebdbb2')).toBe('235, 219, 178');
      expect(formatColorToRgb('#fb4934')).toBe('251, 73, 52');
      expect(formatColorToRgb('#f30')).toBe('255, 51, 0');
    });

    it('formats rgb and rgba strings', () => {
      expect(formatColorToRgb('rgb(235, 219, 178)')).toBe('235, 219, 178');
      expect(formatColorToRgb('rgba(251, 73, 52, 0.8)')).toBe('251, 73, 52');
    });

    it('returns raw triplet strings unchanged', () => {
      expect(formatColorToRgb('235, 219, 178')).toBe('235, 219, 178');
    });

    it('handles empty input gracefully', () => {
      expect(formatColorToRgb('')).toBe('');
      expect(formatColorToRgb('   ')).toBe('');
    });
  });

  describe('CustomCalloutManager.updateStyles and removeStyles', () => {
    let styleEl: HTMLStyleElement | null = null;

    beforeEach(() => {
      document.head.innerHTML = '';
      document.body.innerHTML = '';
      document.body.removeAttribute('style');
    });

    afterEach(() => {
      const existing = document.getElementById('obsitexcore-custom-callouts');
      if (existing) existing.remove();
    });

    it('injects dynamic CSS style tag with callout data-attribute selectors', () => {
      const mockPlugin = {
        settings: {
          customCallouts: [
            {
              id: '1',
              type: 'cite',
              color: '#ebdbb2',
              registerCommand: true
            },
            {
              id: '2',
              type: 'authors',
              color: '251, 73, 52',
              registerCommand: true
            },
            {
              id: '3',
              type: 'definition',
              color: '219, 51, 96',
              icon: 'lucide-bookmark',
              registerCommand: true
            }
          ]
        }
      } as unknown as LatexReferencer;

      const manager = new CustomCalloutManager(mockPlugin);
      manager.updateStyles();

      // Check inline body style properties
      expect(document.body.style.getPropertyValue('--callout-color-cite')).toBe('235, 219, 178');
      expect(document.body.style.getPropertyValue('--callout-color-authors')).toBe('251, 73, 52');
      expect(document.body.style.getPropertyValue('--callout-color-definition')).toBe('219, 51, 96');
      expect(document.body.style.getPropertyValue('--callout-icon-definition')).toBe('lucide-bookmark');

      // Check dynamic <style id="obsitexcore-custom-callouts">
      const injectedStyleTag = document.getElementById('obsitexcore-custom-callouts') as HTMLStyleElement;
      expect(injectedStyleTag).not.toBeNull();
      const css = injectedStyleTag.textContent || '';

      expect(css).toContain('body .callout[data-callout="cite"]');
      expect(css).toContain('--callout-color: 235, 219, 178;');
      expect(css).toContain('border: 1px solid rgba(235, 219, 178, 0.35);');
      expect(css).toContain('background-color: rgba(235, 219, 178, 0.08);');
      expect(css).toContain('color: rgb(235, 219, 178);');
      expect(css).toContain('body .callout[data-callout="authors"]');
      expect(css).toContain('--callout-color: 251, 73, 52;');
      expect(css).toContain('body .callout[data-callout="definition"]');
      expect(css).toContain('--callout-color: 219, 51, 96;');
      expect(css).toContain('--callout-icon: lucide-bookmark;');
    });

    it('removes custom callout style properties and <style> element on removeStyles', () => {
      const mockPlugin = {
        settings: {
          customCallouts: [
            {
              id: '1',
              type: 'cite',
              color: '#ebdbb2',
              registerCommand: true
            }
          ]
        }
      } as unknown as LatexReferencer;

      const manager = new CustomCalloutManager(mockPlugin);
      manager.updateStyles();
      expect(document.getElementById('obsitexcore-custom-callouts')).not.toBeNull();

      manager.removeStyles();
      expect(document.body.style.getPropertyValue('--callout-color-cite')).toBe('');
      expect(document.getElementById('obsitexcore-custom-callouts')).toBeNull();
    });
  });
});
