/**
 * equation-scroll-fix.ts
 *
 * Enables smooth mouse-wheel horizontal scrolling for display math equations
 * (including tagged equations) when they overflow the page width.
 */

import LatexReferencer from 'main';

export function setupEquationScrollFix(plugin: LatexReferencer): () => void {
  const root = plugin.app.workspace.containerEl;

  function handleWheel(ev: WheelEvent): void {
    // Only intercept pure vertical mouse wheel scrolling (deltaY !== 0, deltaX === 0)
    if (ev.deltaY === 0 || ev.deltaX !== 0) return;

    const target = ev.target as HTMLElement | null;
    if (!target) return;

    const mathBlock = target.closest<HTMLElement>(
      '.math.math-block, mjx-container[display="true"]'
    );
    if (!mathBlock) return;

    // Only scroll horizontally if the container actually overflows
    if (mathBlock.scrollWidth > mathBlock.clientWidth) {
      mathBlock.scrollLeft += ev.deltaY;
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  // Use capture phase so wheel events on math containers are handled reliably
  root.addEventListener('wheel', handleWheel, { capture: true, passive: false });

  return () => {
    root.removeEventListener('wheel', handleWheel, { capture: true });
  };
}
