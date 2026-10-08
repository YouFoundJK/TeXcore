import LatexReferencer from '../../../main';
import { renderMath, finishRenderMath } from 'obsidian';

export class TikzTextRenderer {
  private cache = new Map<string, SVGElement>();
  private activeRenders = new Map<HTMLElement, string>();

  constructor(
    private plugin: LatexReferencer,
    private pxPerUnit: number = 80
  ) {}

  public clearCache(): void {
    this.cache.clear();
  }

  public scaleSvgToCanvas(svg: SVGElement): void {
    let widthPt =
      parseFloat(svg.getAttribute('data-bbox-width') || '') ||
      parseFloat(svg.getAttribute('width') || '') ||
      0;
    let heightPt =
      parseFloat(svg.getAttribute('data-bbox-height') || '') ||
      parseFloat(svg.getAttribute('height') || '') ||
      0;

    if ((!widthPt || !heightPt) && svg.getAttribute('viewBox')) {
      const parts = (svg.getAttribute('viewBox') || '')
        .trim()
        .split(/[\s,]+/)
        .map(parseFloat)
        .filter(n => !isNaN(n));
      if (parts.length === 4) {
        widthPt = parts[2];
        heightPt = parts[3];
      }
    }

    const pxPerPt = this.pxPerUnit / 28.452756;
    if (widthPt > 0 && heightPt > 0) {
      const wPx = Math.round(widthPt * pxPerPt * 100) / 100;
      const hPx = Math.round(heightPt * pxPerPt * 100) / 100;
      svg.setAttribute('width', `${wPx}px`);
      svg.setAttribute('height', `${hPx}px`);
      svg.style.width = `${wPx}px`;
      svg.style.height = `${hPx}px`;
    }
  }

  public async renderTextOrMath(
    container: HTMLElement,
    label: string,
    fontSizePt: number,
    color?: string
  ): Promise<void> {
    if (!label) {
      this.emptyContainer(container);
      return;
    }

    const hasDollarMath = label.includes('$');
    const hasLatexCommands = /\\[a-zA-Z]+|[_^]/.test(label);

    // 1. Pure text case: render immediately with no TeX overhead
    if (!hasDollarMath && !hasLatexCommands) {
      this.emptyContainer(container);
      const fontSizePx = Math.round(fontSizePt * (this.pxPerUnit / 28.452756));
      container.style.fontSize = `${fontSizePx}px`;
      container.textContent = label;
      return;
    }

    // 2. TeX / LaTeX case: check cache
    const cacheKey = `${this.pxPerUnit}:${fontSizePt}:${color ?? ''}:${label}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.emptyContainer(container);
      container.appendChild(cached.cloneNode(true) as SVGElement);
      return;
    }

    // 3. Instant MathJax / Text preview while TikZJax compiles in worker
    this.renderInstantFallback(container, label, fontSizePt, color);

    // Track active render target to prevent race conditions
    this.activeRenders.set(container, cacheKey);

    // 4. Compile through TikZJax for 100% exact Computer Modern TeX rendering
    if (this.plugin.tikzRenderer) {
      try {
        const fontMacro = this.getFontMacro(fontSizePt);
        let teXContent = label;
        if (!teXContent.includes('$') && hasLatexCommands) {
          teXContent = `$${teXContent}$`;
        }

        const colorOption =
          color && color !== '#f8e7ad' && color !== 'currentColor' ? `, text={${color}}` : '';

        const snippet = `\\begin{tikzpicture}\n\\node[inner sep=0pt, outer sep=0pt${colorOption}, font=${fontMacro}] at (0, 0) {${teXContent}};\n\\end{tikzpicture}`;

        const svg = await this.plugin.tikzRenderer.render(snippet);
        svg.classList.add('tikzjax-text-svg');
        if (color) {
          svg.style.color = color;
        }

        // Scale the SVG to match canvas coordinate units
        this.scaleSvgToCanvas(svg);

        // Cache the rendered SVG
        this.cache.set(cacheKey, svg.cloneNode(true) as SVGElement);

        // Verify container hasn't changed to a newer render request
        if (this.activeRenders.get(container) === cacheKey) {
          this.emptyContainer(container);
          container.appendChild(svg);
        }
      } catch (err) {
        console.warn('TeXcore: TikZJax text render failed, using fallback', err);
        // Fallback is already displayed
      } finally {
        if (this.activeRenders.get(container) === cacheKey) {
          this.activeRenders.delete(container);
        }
      }
    }
  }

  private emptyContainer(container: HTMLElement): void {
    if (typeof container.empty === 'function') {
      container.empty();
    } else {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
  }

  private appendSpan(container: HTMLElement, text: string, fontSizePx: number): void {
    const span = container.createSpan();
    span.textContent = text;
    span.style.fontSize = `${fontSizePx}px`;
  }

  private renderInstantFallback(
    container: HTMLElement,
    label: string,
    fontSizePt: number,
    color?: string
  ): void {
    this.emptyContainer(container);
    const fontSizePx = Math.round(fontSizePt * (this.pxPerUnit / 28.452756));

    if (label.includes('$')) {
      const parts = label.split(/(\$[^$]+\$)/g);
      let usedMathJax = false;

      for (const part of parts) {
        if (!part) continue;
        if (part.startsWith('$') && part.endsWith('$')) {
          const mathSource = part.slice(1, -1);
          try {
            const mathEl = renderMath(mathSource, false);
            mathEl.style.fontSize = `${fontSizePx}px`;
            if (color) mathEl.style.color = color;
            container.appendChild(mathEl);
            usedMathJax = true;
          } catch {
            this.appendSpan(container, part, fontSizePx);
          }
        } else {
          this.appendSpan(container, part, fontSizePx);
        }
      }

      if (usedMathJax) {
        try {
          void finishRenderMath();
        } catch {
          // ignore
        }
      }
    } else {
      try {
        const mathEl = renderMath(label, false);
        mathEl.style.fontSize = `${fontSizePx}px`;
        if (color) mathEl.style.color = color;
        container.appendChild(mathEl);
        try {
          void finishRenderMath();
        } catch {
          // ignore
        }
      } catch {
        container.textContent = label;
      }
    }
  }

  private getFontMacro(fontSizePt: number): string {
    if (fontSizePt <= 6) return '\\tiny';
    if (fontSizePt <= 8) return '\\scriptsize';
    if (fontSizePt <= 9) return '\\footnotesize';
    if (fontSizePt <= 10) return '\\small';
    if (fontSizePt <= 12) return '\\normalsize';
    if (fontSizePt <= 14) return '\\large';
    if (fontSizePt <= 18) return '\\Large';
    if (fontSizePt <= 20) return '\\LARGE';
    if (fontSizePt <= 24) return '\\huge';
    return '\\Huge';
  }
}
