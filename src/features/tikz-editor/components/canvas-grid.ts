import { type TikzEditorContext, type EditorElement } from '../types';
import { renderMath, finishRenderMath } from 'obsidian';
import { AssetsManager } from '../assets-manager';

export class CanvasGrid {
  private draggingId: string | null = null;
  private dragStartCoords: { x: number; y: number } | null = null;
  private dragOffset: { x: number; y: number } | null = null;
  private dragInitialState: EditorElement[] = [];
  private wireStart: { x: number; y: number } | null = null;
  private wireCurrent: { x: number; y: number } | null = null;
  private lassoStart: { x: number; y: number } | null = null;
  private lassoCurrent: { x: number; y: number } | null = null;

  constructor(
    private context: TikzEditorContext,
    private containerEl: HTMLElement,
    private workspaceEl: HTMLDivElement,
    private wiresOverlayEl: SVGElement
  ) {
    // Canvas mousedown listener
    this.workspaceEl.addEventListener('mousedown', e => this.handleCanvasMouseDown(e));
  }

  public ptToCanvasPx(pt: number): number {
    return pt * (this.context.PX_PER_UNIT / 28.452756);
  }

  public getBracketGeometry(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    direction: 'right' | 'left' = 'right',
    amplitude = 16
  ): { pathD: string; cuspX: number; cuspY: number; normalX: number; normalY: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) {
      return { pathD: '', cuspX: x1, cuspY: y1, normalX: 1, normalY: 0 };
    }

    const ux = dx / len;
    const uy = dy / len;

    const isVertical = Math.abs(dy) >= Math.abs(dx);
    let nx = dy / len;
    let ny = -dx / len;

    if (isVertical) {
      if (direction === 'right' && nx < 0) {
        nx = -nx;
        ny = -ny;
      } else if (direction === 'left' && nx > 0) {
        nx = -nx;
        ny = -ny;
      }
    } else {
      if (direction === 'right' && ny < 0) {
        nx = -nx;
        ny = -ny;
      } else if (direction === 'left' && ny > 0) {
        nx = -nx;
        ny = -ny;
      }
    }

    const amp = amplitude;
    const r = Math.min(16, len / 6);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    const cuspX = midX + nx * amp;
    const cuspY = midY + ny * amp;

    const p1x = x1 + ux * r + nx * (amp * 0.5);
    const p1y = y1 + uy * r + ny * (amp * 0.5);

    const p2x = midX - ux * r + nx * (amp * 0.5);
    const p2y = midY - uy * r + ny * (amp * 0.5);

    const p4x = midX + ux * r + nx * (amp * 0.5);
    const p4y = midY + uy * r + ny * (amp * 0.5);

    const p5x = x2 - ux * r + nx * (amp * 0.5);
    const p5y = y2 - uy * r + ny * (amp * 0.5);

    const cp0_1x = x1 + nx * (amp * 0.1);
    const cp0_1y = y1 + ny * (amp * 0.1);
    const cp0_2x = x1 + ux * (r * 0.5) + nx * (amp * 0.5);
    const cp0_2y = y1 + uy * (r * 0.5) + ny * (amp * 0.5);

    const cp1_1x = midX - ux * (r * 0.5) + nx * (amp * 0.5);
    const cp1_1y = midY - uy * (r * 0.5) + ny * (amp * 0.5);
    const cp1_2x = midX - ux * (r * 0.2) + nx * (amp * 0.95);
    const cp1_2y = midY - uy * (r * 0.2) + ny * (amp * 0.95);

    const cp2_1x = midX + ux * (r * 0.2) + nx * (amp * 0.95);
    const cp2_1y = midY + uy * (r * 0.2) + ny * (amp * 0.95);
    const cp2_2x = midX + ux * (r * 0.5) + nx * (amp * 0.5);
    const cp2_2y = midY + uy * (r * 0.5) + ny * (amp * 0.5);

    const cp3_1x = x2 - ux * (r * 0.5) + nx * (amp * 0.5);
    const cp3_1y = y2 - uy * (r * 0.5) + ny * (amp * 0.5);
    const cp3_2x = x2 + nx * (amp * 0.1);
    const cp3_2y = y2 + ny * (amp * 0.1);

    const pathD = [
      `M ${x1} ${y1}`,
      `C ${cp0_1x} ${cp0_1y}, ${cp0_2x} ${cp0_2y}, ${p1x} ${p1y}`,
      `L ${p2x} ${p2y}`,
      `C ${cp1_1x} ${cp1_1y}, ${cp1_2x} ${cp1_2y}, ${cuspX} ${cuspY}`,
      `C ${cp2_1x} ${cp2_1y}, ${cp2_2x} ${cp2_2y}, ${p4x} ${p4y}`,
      `L ${p5x} ${p5y}`,
      `C ${cp3_1x} ${cp3_1y}, ${cp3_2x} ${cp3_2y}, ${x2} ${y2}`
    ].join(' ');

    return { pathD, cuspX, cuspY, normalX: nx, normalY: ny };
  }

  public render() {
    const gridBg = this.workspaceEl.querySelector('.grid-background');
    if (gridBg) {
      gridBg.className = `grid-background${this.context.isHalfGrid() ? ' half-grid' : ''}`;
    }

    // Axes
    this.renderAxes();

    // Wires
    this.renderWires();

    // Placed Elements
    this.renderPlacedElements();
  }

  private renderAxes() {
    const axisOverlay = this.workspaceEl.querySelector('.axis-overlay');
    if (!axisOverlay) return;
    axisOverlay.innerHTML = '';

    const svgNS = 'http://www.w3.org/2000/svg';
    const lineX = activeDocument.createElementNS(svgNS, 'line');
    lineX.setAttribute('x1', '0');
    lineX.setAttribute('y1', this.context.ORIGIN_Y.toString());
    lineX.setAttribute('x2', this.context.CANVAS_WIDTH.toString());
    lineX.setAttribute('y2', this.context.ORIGIN_Y.toString());
    axisOverlay.appendChild(lineX);

    const lineY = activeDocument.createElementNS(svgNS, 'line');
    lineY.setAttribute('x1', this.context.ORIGIN_X.toString());
    lineY.setAttribute('y1', '0');
    lineY.setAttribute('x2', this.context.ORIGIN_X.toString());
    lineY.setAttribute('y2', this.context.CANVAS_HEIGHT.toString());
    axisOverlay.appendChild(lineY);

    // X labels
    for (let x = -20; x <= 20; x++) {
      const text = activeDocument.createElementNS(svgNS, 'text');
      text.setAttribute('x', (this.context.ORIGIN_X + x * this.context.PX_PER_UNIT).toString());
      text.setAttribute('y', (this.context.ORIGIN_Y + 18).toString());
      text.textContent = x.toString();
      axisOverlay.appendChild(text);
    }

    // Y labels
    for (let y = -20; y <= 20; y++) {
      if (y !== 0) {
        const text = activeDocument.createElementNS(svgNS, 'text');
        text.setAttribute('x', (this.context.ORIGIN_X - 12).toString());
        text.setAttribute(
          'y',
          (this.context.ORIGIN_Y - y * this.context.PX_PER_UNIT + 4).toString()
        );
        text.textContent = y.toString();
        axisOverlay.appendChild(text);
      }
    }
  }

  public renderWires() {
    this.wiresOverlayEl.innerHTML = '';
    const svgNS = 'http://www.w3.org/2000/svg';
    const selectedVertices = this.context.getSelectedVertices();
    const elements = this.context.getElements();
    // Draw elements
    elements.forEach(elem => {
      if (elem.type !== 'wire' || elem.x2 === undefined || elem.y2 === undefined) return;

      const group = activeDocument.createElementNS(svgNS, 'g');
      group.setAttribute(
        'class',
        `wire-group${selectedVertices.some(v => v.elementId === elem.id) ? ' selected' : ''}`
      );
      group.addEventListener('mousedown', e => this.handleElementMouseDown(e, elem));

      const isBracket =
        elem.name === 'Right bracket' ||
        elem.name === 'Left bracket' ||
        elem.name.toLowerCase().includes('bracket');

      if (isBracket) {
        const strokeColor = selectedVertices.some(v => v.elementId === elem.id)
          ? 'var(--text-accent)'
          : elem.style.color && elem.style.color !== '#f8e7ad'
            ? elem.style.color
            : '#e2e8f0';

        const dir =
          elem.style.bracketDirection ?? (elem.name === 'Left bracket' ? 'left' : 'right');
        const amp = elem.style.bracketAmplitude ?? 16;
        const geom = this.getBracketGeometry(elem.x, elem.y, elem.x2, elem.y2, dir, amp);

        const pathClick = activeDocument.createElementNS(svgNS, 'path');
        pathClick.setAttribute('d', geom.pathD);
        pathClick.setAttribute('stroke', 'transparent');
        pathClick.setAttribute('stroke-width', '16');
        pathClick.setAttribute('fill', 'none');
        pathClick.setCssStyles({ cursor: 'pointer' });
        group.appendChild(pathClick);

        const path = activeDocument.createElementNS(svgNS, 'path');
        path.setAttribute('d', geom.pathD);
        path.setAttribute('stroke', strokeColor);
        path.setAttribute('stroke-width', (elem.style.thickness ?? 1.5).toString());
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        group.appendChild(path);

        if (elem.label) {
          const isRight = geom.normalX >= 0;
          const lx = geom.cuspX + geom.normalX * 10;
          const ly = geom.cuspY + geom.normalY * 10;
          const fontSizePx = this.ptToCanvasPx(elem.style.fontSize);

          if (elem.style.math) {
            const foreign = activeDocument.createElementNS(svgNS, 'foreignObject');
            foreign.setAttribute('x', (isRight ? lx : lx - 200).toString());
            foreign.setAttribute('y', (ly - 20).toString());
            foreign.setAttribute('width', '200');
            foreign.setAttribute('height', '40');
            foreign.setCssStyles({ overflow: 'visible' });

            const div = activeDocument.createElement('div');
            div.setCssStyles({
              display: 'flex',
              justifyContent: isRight ? 'flex-start' : 'flex-end',
              alignItems: 'center',
              width: '100%',
              height: '100%',
              fontSize: `${fontSizePx}px`,
              color: elem.style.color || 'var(--text-normal)'
            });

            try {
              const mathEl = renderMath(elem.label, false);
              mathEl.style.fontSize = `${fontSizePx}px`;
              div.appendChild(mathEl);
              const MathJax = (
                window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } }
              ).MathJax;
              if (MathJax && typeof MathJax.chtmlStylesheet === 'function') {
                void finishRenderMath();
              }
            } catch {
              div.textContent = elem.label;
            }
            foreign.appendChild(div);
            group.appendChild(foreign);
          } else {
            const text = activeDocument.createElementNS(svgNS, 'text');
            text.setAttribute('x', lx.toString());
            text.setAttribute('y', ly.toString());
            text.setAttribute('font-size', `${fontSizePx}px`);
            text.setAttribute('font-weight', elem.style.bold ? 'bold' : 'normal');
            text.setAttribute('font-style', elem.style.italic ? 'italic' : 'normal');
            text.setAttribute('fill', elem.style.color || 'var(--text-normal)');
            text.setAttribute('text-anchor', isRight ? 'start' : 'end');
            text.setAttribute('dominant-baseline', 'middle');
            text.textContent = elem.label;
            group.appendChild(text);
          }
        }
      } else {
        const lineClick = activeDocument.createElementNS(svgNS, 'line');
        lineClick.setAttribute('x1', elem.x.toString());
        lineClick.setAttribute('y1', elem.y.toString());
        lineClick.setAttribute('x2', elem.x2.toString());
        lineClick.setAttribute('y2', elem.y2.toString());
        lineClick.setAttribute('stroke', 'transparent');
        lineClick.setAttribute('stroke-width', '12');
        lineClick.setCssStyles({ cursor: 'pointer' });
        group.appendChild(lineClick);

        const isBasicWire =
          elem.name === 'Wire' || elem.name === 'Dashed Wire' || elem.name === 'Arrow';
        if (isBasicWire) {
          const strokeColor = selectedVertices.some(v => v.elementId === elem.id)
            ? 'var(--text-accent)'
            : elem.style.color && elem.style.color !== '#f8e7ad'
              ? elem.style.color
              : '#e2e8f0';

          if (elem.style.lineStyle === 'crossed') {
            const dx = elem.x2 - elem.x;
            const dy = elem.y2 - elem.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
              const path = activeDocument.createElementNS(svgNS, 'path');
              const ux = dx / len;
              const uy = dy / len;
              const vx = -uy;
              const vy = ux;
              const crossSize = Math.max(3.5, 3 * (elem.style.thickness ?? 1.0));
              const d1x = (ux + vx) * crossSize * 0.7071;
              const d1y = (uy + vy) * crossSize * 0.7071;
              const d2x = (ux - vx) * crossSize * 0.7071;
              const d2y = (uy - vy) * crossSize * 0.7071;

              const step = 8;
              let pathData = '';
              const count = Math.max(1, Math.floor(len / step));
              for (let i = 0; i <= count; i++) {
                const d = (i / count) * len;
                const cx = elem.x + ux * d;
                const cy = elem.y + uy * d;
                pathData += `M ${cx - d1x} ${cy - d1y} L ${cx + d1x} ${cy + d1y} `;
                pathData += `M ${cx - d2x} ${cy - d2y} L ${cx + d2x} ${cy + d2y} `;
              }
              path.setAttribute('d', pathData.trim());
              path.setAttribute('stroke', strokeColor);
              path.setAttribute('stroke-width', (elem.style.thickness ?? 1.5).toString());
              path.setAttribute('stroke-linecap', 'round');
              group.appendChild(path);
            }
          } else {
            const line = activeDocument.createElementNS(svgNS, 'line');
            line.setAttribute('x1', elem.x.toString());
            line.setAttribute('y1', elem.y.toString());
            line.setAttribute('x2', elem.x2.toString());
            line.setAttribute('y2', elem.y2.toString());
            line.setAttribute('stroke', strokeColor);
            line.setAttribute('stroke-width', (elem.style.thickness ?? 1.0).toString());

            if (elem.name === 'Dashed Wire' || elem.style.lineStyle === 'dashed') {
              line.setAttribute('stroke-dasharray', '6,4');
            } else if (elem.style.lineStyle === 'dotted') {
              line.setAttribute('stroke-dasharray', '2,4');
            }

            group.appendChild(line);
          }

          if (elem.name === 'Arrow' || elem.style.arrowStyle) {
            const dx = elem.x2 - elem.x;
            const dy = elem.y2 - elem.y;
            const len = Math.hypot(dx, dy);
            if (len > 0) {
              const angle = Math.atan2(dy, dx);
              const headLen = Math.min(10, len);
              const p1x = elem.x2 - headLen * Math.cos(angle - Math.PI / 6);
              const p1y = elem.y2 - headLen * Math.sin(angle - Math.PI / 6);
              const p2x = elem.x2 - headLen * Math.cos(angle + Math.PI / 6);
              const p2y = elem.y2 - headLen * Math.sin(angle + Math.PI / 6);
              const head = activeDocument.createElementNS(svgNS, 'polygon');
              head.setAttribute('points', `${elem.x2},${elem.y2} ${p1x},${p1y} ${p2x},${p2y}`);
              head.setAttribute('fill', strokeColor);
              group.appendChild(head);
            }
          }
        } else {
          const dx = elem.x2 - elem.x;
          const dy = elem.y2 - elem.y;
          const len = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const midX = elem.x + dx / 2;
          const midY = elem.y + dy / 2;

          const margin = Math.min(25, len / 2);
          const startX = elem.x + (dx / len) * (len / 2 - margin);
          const startY = elem.y + (dy / len) * (len / 2 - margin);
          const endX = elem.x2 - (dx / len) * (len / 2 - margin);
          const endY = elem.y2 - (dy / len) * (len / 2 - margin);

          const line1 = activeDocument.createElementNS(svgNS, 'line');
          line1.setAttribute('x1', elem.x.toString());
          line1.setAttribute('y1', elem.y.toString());
          line1.setAttribute('x2', startX.toString());
          line1.setAttribute('y2', startY.toString());
          line1.setAttribute(
            'stroke',
            selectedVertices.some(v => v.elementId === elem.id)
              ? 'var(--text-accent)'
              : elem.style.color || 'var(--text-normal)'
          );
          line1.setAttribute('stroke-width', (elem.style.thickness ?? 1.0).toString());
          group.appendChild(line1);

          const line2 = activeDocument.createElementNS(svgNS, 'line');
          line2.setAttribute('x1', endX.toString());
          line2.setAttribute('y1', endY.toString());
          line2.setAttribute('x2', elem.x2.toString());
          line2.setAttribute('y2', elem.y2.toString());
          line2.setAttribute(
            'stroke',
            selectedVertices.some(v => v.elementId === elem.id)
              ? 'var(--text-accent)'
              : elem.style.color || 'var(--text-normal)'
          );
          line2.setAttribute('stroke-width', (elem.style.thickness ?? 1.0).toString());
          group.appendChild(line2);

          const innerG = activeDocument.createElementNS(svgNS, 'g');
          innerG.setAttribute(
            'transform',
            `translate(${midX}, ${midY}) rotate(${angle}) translate(-25, -10)`
          );

          const svgWrap = activeDocument.createElementNS(svgNS, 'g');
          svgWrap.setAttribute('class', 'comp-svg-fill');
          const wireColor = selectedVertices.some(v => v.elementId === elem.id)
            ? 'var(--text-accent)'
            : elem.style.color || 'var(--text-normal)';
          svgWrap.style.color = wireColor;

          const parser = new DOMParser();
          const doc = parser.parseFromString(elem.svgMarkup, 'text/html');
          const svgNode = doc.querySelector('svg');
          if (svgNode) {
            svgNode.setCssStyles({ color: wireColor });
            svgNode.setAttribute('stroke', wireColor);
            svgNode.setAttribute('stroke-width', (elem.style.thickness ?? 1.0).toString());
            svgWrap.appendChild(activeDocument.importNode(svgNode, true));
          }
          innerG.appendChild(svgWrap);
          group.appendChild(innerG);

          if (elem.label) {
            const fontSizePx = this.ptToCanvasPx(elem.style.fontSize);
            if (elem.style.math) {
              const foreign = activeDocument.createElementNS(svgNS, 'foreignObject');
              foreign.setAttribute('x', (midX - 100).toString());
              foreign.setAttribute('y', (midY - 28).toString());
              foreign.setAttribute('width', '200');
              foreign.setAttribute('height', '24');
              foreign.setCssStyles({ overflow: 'visible' });

              const div = activeDocument.createElement('div');
              div.setCssStyles({
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: '100%',
                fontSize: `${fontSizePx}px`,
                color: elem.style.color || 'var(--text-normal)'
              });

              try {
                const mathEl = renderMath(elem.label, false);
                mathEl.style.fontSize = `${fontSizePx}px`;
                div.appendChild(mathEl);
                const MathJax = (
                  window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } }
                ).MathJax;
                if (MathJax && typeof MathJax.chtmlStylesheet === 'function') {
                  void finishRenderMath();
                }
              } catch {
                div.textContent = elem.label;
              }
              foreign.appendChild(div);
              group.appendChild(foreign);
            } else {
              const text = activeDocument.createElementNS(svgNS, 'text');
              text.setAttribute('x', midX.toString());
              text.setAttribute('y', (midY - 18).toString());
              text.setAttribute('font-size', `${fontSizePx}px`);
              text.setAttribute('font-weight', elem.style.bold ? 'bold' : 'normal');
              text.setAttribute('font-style', elem.style.italic ? 'italic' : 'normal');
              text.setAttribute('fill', elem.style.color || 'var(--text-normal)');
              text.setAttribute('text-anchor', 'middle');
              text.setAttribute('dominant-baseline', 'middle');
              text.textContent = elem.label;
              group.appendChild(text);
            }
          }
        }
      }

      // Draw handles if this wire is selected
      if (selectedVertices.some(v => v.elementId === elem.id)) {
        const handleStart = activeDocument.createElementNS(svgNS, 'circle');
        handleStart.setAttribute('cx', elem.x.toString());
        handleStart.setAttribute('cy', elem.y.toString());
        handleStart.setAttribute('r', '6');
        handleStart.setAttribute('fill', 'var(--interactive-accent)');
        handleStart.setAttribute('stroke', 'var(--text-on-accent)');
        handleStart.setAttribute('stroke-width', '1.5');
        handleStart.setCssStyles({ cursor: 'move' });
        handleStart.addEventListener('mousedown', e => {
          this.handleWireHandleMouseDown(e, elem, 'start');
        });
        group.appendChild(handleStart);

        const handleEnd = activeDocument.createElementNS(svgNS, 'circle');
        handleEnd.setAttribute('cx', elem.x2.toString());
        handleEnd.setAttribute('cy', elem.y2.toString());
        handleEnd.setAttribute('r', '6');
        handleEnd.setAttribute('fill', 'var(--interactive-accent)');
        handleEnd.setAttribute('stroke', 'var(--text-on-accent)');
        handleEnd.setAttribute('stroke-width', '1.5');
        handleEnd.setCssStyles({ cursor: 'move' });
        handleEnd.addEventListener('mousedown', e => {
          this.handleWireHandleMouseDown(e, elem, 'end');
        });
        group.appendChild(handleEnd);
      }

      this.wiresOverlayEl.appendChild(group);
    });

    // Draw active wire preview
    if (this.wireStart && this.wireCurrent) {
      const activeTemplate = this.context.getActiveTemplate();
      if (
        activeTemplate &&
        (activeTemplate.name === 'Right bracket' || activeTemplate.name === 'Left bracket')
      ) {
        const dir = activeTemplate.name === 'Left bracket' ? 'left' : 'right';
        const geom = this.getBracketGeometry(
          this.wireStart.x,
          this.wireStart.y,
          this.wireCurrent.x,
          this.wireCurrent.y,
          dir,
          16
        );
        const path = activeDocument.createElementNS(svgNS, 'path');
        path.setAttribute('d', geom.pathD);
        path.setAttribute('stroke', 'var(--text-accent)');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-dasharray', '4,4');
        this.wiresOverlayEl.appendChild(path);
      } else if (activeTemplate && activeTemplate.type === 'wire') {
        const dx = this.wireCurrent.x - this.wireStart.x;
        const dy = this.wireCurrent.y - this.wireStart.y;

        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const midX = this.wireStart.x + dx / 2;
        const midY = this.wireStart.y + dy / 2;

        const line = activeDocument.createElementNS(svgNS, 'line');
        line.setAttribute('x1', this.wireStart.x.toString());
        line.setAttribute('y1', this.wireStart.y.toString());
        line.setAttribute('x2', this.wireCurrent.x.toString());
        line.setAttribute('y2', this.wireCurrent.y.toString());
        line.setAttribute('stroke', 'var(--text-accent)');
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '4,4');
        this.wiresOverlayEl.appendChild(line);

        const innerG = activeDocument.createElementNS(svgNS, 'g');
        innerG.setAttribute(
          'transform',
          `translate(${midX}, ${midY}) rotate(${angle}) translate(-25, -10)`
        );
        innerG.setCssStyles({ opacity: '0.7' });

        const svgWrap = activeDocument.createElementNS(svgNS, 'g');
        svgWrap.setCssStyles({ color: 'var(--text-accent)' });

        const parser = new DOMParser();
        const doc = parser.parseFromString(activeTemplate.svgMarkup, 'text/html');
        const svgNode = doc.querySelector('svg');
        if (svgNode) {
          svgNode.setCssStyles({ color: 'var(--text-accent)' });
          svgNode.setAttribute('stroke', 'var(--text-accent)');
          svgNode.setAttribute('stroke-width', '1.5');
          svgWrap.appendChild(activeDocument.importNode(svgNode, true));
        }
        innerG.appendChild(svgWrap);
        this.wiresOverlayEl.appendChild(innerG);
      } else {
        const wireStyle = this.context.getActiveWireStyle();
        if (wireStyle === 'crossed') {
          const dx = this.wireCurrent.x - this.wireStart.x;
          const dy = this.wireCurrent.y - this.wireStart.y;
          const len = Math.hypot(dx, dy);
          if (len > 0) {
            const path = activeDocument.createElementNS(svgNS, 'path');
            const ux = dx / len;
            const uy = dy / len;
            const vx = -uy;
            const vy = ux;
            const crossSize = 3.5;
            const d1x = (ux + vx) * crossSize * 0.7071;
            const d1y = (uy + vy) * crossSize * 0.7071;
            const d2x = (ux - vx) * crossSize * 0.7071;
            const d2y = (uy - vy) * crossSize * 0.7071;

            const step = 8;
            let pathData = '';
            const count = Math.max(1, Math.floor(len / step));
            for (let i = 0; i <= count; i++) {
              const d = (i / count) * len;
              const cx = this.wireStart.x + ux * d;
              const cy = this.wireStart.y + uy * d;
              pathData += `M ${cx - d1x} ${cy - d1y} L ${cx + d1x} ${cy + d1y} `;
              pathData += `M ${cx - d2x} ${cy - d2y} L ${cx + d2x} ${cy + d2y} `;
            }
            path.setAttribute('d', pathData.trim());
            path.setAttribute('stroke', 'var(--text-accent)');
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('stroke-linecap', 'round');
            this.wiresOverlayEl.appendChild(path);
          }
        } else {
          const line = activeDocument.createElementNS(svgNS, 'line');
          line.setAttribute('x1', this.wireStart.x.toString());
          line.setAttribute('y1', this.wireStart.y.toString());
          line.setAttribute('x2', this.wireCurrent.x.toString());
          line.setAttribute('y2', this.wireCurrent.y.toString());
          line.setAttribute('stroke', 'var(--text-accent)');
          line.setAttribute('stroke-width', '2');
          if (wireStyle === 'dashed') {
            line.setAttribute('stroke-dasharray', '6,4');
          } else if (wireStyle === 'dotted') {
            line.setAttribute('stroke-dasharray', '2,4');
          } else {
            line.setAttribute('stroke-dasharray', '4,4');
          }
          this.wiresOverlayEl.appendChild(line);
        }
      }
    }

    // Draw lasso
    if (this.lassoStart && this.lassoCurrent) {
      const rect = activeDocument.createElementNS(svgNS, 'rect');
      const left = Math.min(this.lassoStart.x, this.lassoCurrent.x);
      const right = Math.max(this.lassoStart.x, this.lassoCurrent.x);
      const top = Math.min(this.lassoStart.y, this.lassoCurrent.y);
      const bottom = Math.max(this.lassoStart.y, this.lassoCurrent.y);

      const isEraseMode = this.context.getActiveTool() === 'erase';
      const lassoColor = isEraseMode ? 'var(--text-error)' : 'var(--interactive-accent)';

      rect.setAttribute('x', left.toString());
      rect.setAttribute('y', top.toString());
      rect.setAttribute('width', (right - left).toString());
      rect.setAttribute('height', (bottom - top).toString());
      rect.setAttribute('fill', lassoColor);
      rect.setAttribute('fill-opacity', '0.2');
      rect.setAttribute('stroke', lassoColor);
      rect.setAttribute('stroke-width', '1');
      rect.setAttribute('stroke-dasharray', '4,4');
      this.wiresOverlayEl.appendChild(rect);
    }
  }

  private renderPlacedElements() {
    this.workspaceEl.querySelectorAll('.placed-element').forEach(el => el.remove());
    const selectedVertices = this.context.getSelectedVertices();
    const elements = this.context.getElements();

    elements.forEach(elem => {
      if (elem.type !== 'component' && elem.type !== 'text') return;

      const el = activeDocument.createElement('div');
      el.className = `placed-element${selectedVertices.some(v => v.elementId === elem.id) ? ' selected' : ''}${elem.type === 'text' ? ' is-text' : ''}`;
      el.style.left = `${elem.x}px`;
      el.style.top = `${elem.y}px`;
      el.style.transform = `rotate(${elem.rotation}deg)`;

      el.addEventListener('mousedown', e => this.handleElementMouseDown(e, elem));

      if (elem.type === 'text') {
        const content = activeDocument.createElement('div');
        content.className = 'text-element-content';
        const fontSizePx = this.ptToCanvasPx(elem.style.fontSize);
        content.style.fontSize = `${fontSizePx}px`;
        content.style.fontWeight = elem.style.bold ? 'bold' : 'normal';
        content.style.fontStyle = elem.style.italic ? 'italic' : 'normal';
        content.style.color = elem.style.color || 'var(--text-normal)';
        if (elem.style.math && elem.label) {
          try {
            const mathEl = renderMath(elem.label, false);
            mathEl.style.fontSize = `${fontSizePx}px`;
            content.appendChild(mathEl);
            const MathJax = (window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } })
              .MathJax;
            if (MathJax && typeof MathJax.chtmlStylesheet === 'function') {
              void finishRenderMath();
            }
          } catch {
            content.textContent = elem.label;
          }
        } else {
          content.textContent = elem.label || 'Text';
        }
        el.appendChild(content);
      } else {
        const visual = activeDocument.createElement('div');
        visual.className = 'node-visual';
        visual.style.color = elem.style.color || 'var(--text-normal)';

        let svg = elem.svgMarkup;
        if (elem.radius !== undefined) {
          const svgRadius = elem.radius * 2.5;
          svg = svg.replace(/r="\d+(\.\d+)?"/g, `r="${svgRadius}"`);
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(svg, 'text/html');
        const svgNode = doc.querySelector('svg');
        if (svgNode) {
          visual.appendChild(activeDocument.importNode(svgNode, true));
        }
        el.appendChild(visual);

        if (elem.label) {
          const label = activeDocument.createElement('div');
          label.className = 'node-label';
          const fontSizePx = this.ptToCanvasPx(elem.style.fontSize);
          label.style.fontSize = `${fontSizePx}px`;
          label.style.color = elem.style.color || 'var(--text-normal)';
          if (elem.style.math) {
            try {
              const mathEl = renderMath(elem.label, false);
              mathEl.style.fontSize = `${fontSizePx}px`;
              label.appendChild(mathEl);
              const MathJax = (
                window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } }
              ).MathJax;
              if (MathJax && typeof MathJax.chtmlStylesheet === 'function') {
                void finishRenderMath();
              }
            } catch {
              label.textContent = elem.label;
            }
          } else {
            label.textContent = elem.label;
          }
          el.appendChild(label);
        }
      }
      this.workspaceEl.appendChild(el);
    });
  }

  private getCanvasCoords(e: MouseEvent, snap = true): { x: number; y: number } {
    const rect = this.workspaceEl.getBoundingClientRect();
    const zoom = this.context.getZoom();
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;

    if (snap && this.context.isSnapToGrid() && !e.ctrlKey) {
      const gridSize = this.context.isHalfGrid()
        ? this.context.PX_PER_UNIT / 2
        : this.context.PX_PER_UNIT;
      return {
        x: Math.round((rawX - this.context.ORIGIN_X) / gridSize) * gridSize + this.context.ORIGIN_X,
        y: Math.round((rawY - this.context.ORIGIN_Y) / gridSize) * gridSize + this.context.ORIGIN_Y
      };
    }
    return { x: Math.round(rawX), y: Math.round(rawY) };
  }

  private handleCanvasMouseDown(e: MouseEvent) {
    const activeTool = this.context.getActiveTool();
    const activeTemplate = this.context.getActiveTemplate();

    if (e.button !== 0) return;

    const coords = this.getCanvasCoords(e);

    if (activeTemplate && activeTemplate.type === 'component') {
      this.context.handleAddElement({
        type: 'component',
        name: activeTemplate.name,
        x: coords.x,
        y: coords.y,
        label: '',
        rotation: 0,
        style: {
          bold: false,
          italic: false,
          math: false,
          color: '#f8e7ad',
          fontSize: 12,
          thickness: 1.0
        },
        svgMarkup: activeTemplate.svgMarkup,
        tikzCommand: activeTemplate.tikzCommand
      });
      e.preventDefault();
    } else if (activeTool === 'wire' || (activeTemplate && activeTemplate.type === 'wire')) {
      this.wireStart = coords;
      this.wireCurrent = coords;
      e.preventDefault();

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (this.wireStart) {
          const mCoords = this.getCanvasCoords(moveEvent);

          this.wireCurrent = mCoords;
          this.renderWires();
        }
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        if (this.wireStart && this.wireCurrent) {
          const dist = Math.hypot(
            this.wireCurrent.x - this.wireStart.x,
            this.wireCurrent.y - this.wireStart.y
          );
          const isBracket =
            activeTemplate &&
            (activeTemplate.name === 'Right bracket' || activeTemplate.name === 'Left bracket');

          if (dist > 10 || isBracket) {
            let startX = this.wireStart.x;
            let startY = this.wireStart.y;
            let endX = this.wireCurrent.x;
            let endY = this.wireCurrent.y;

            if (dist <= 10 && isBracket) {
              const halfH = this.context.PX_PER_UNIT;
              startY = this.wireStart.y - halfH;
              endY = this.wireStart.y + halfH;
            }

            const angleVal = Math.round(Math.atan2(endY - startY, endX - startX) * (180 / Math.PI));
            const normalizedAngle = (angleVal + 360) % 360;

            if (isBracket && activeTemplate) {
              const dir = activeTemplate.name === 'Left bracket' ? 'left' : 'right';
              this.context.handleAddElement({
                type: 'wire',
                name: activeTemplate.name,
                x: startX,
                y: startY,
                x2: endX,
                y2: endY,
                label: '',
                rotation: 0,
                style: {
                  bold: false,
                  italic: false,
                  math: false,
                  color: '#f8e7ad',
                  fontSize: 12,
                  thickness: 1.5,
                  bracketDirection: dir,
                  bracketAmplitude: 16
                },
                svgMarkup: activeTemplate.svgMarkup,
                tikzCommand: activeTemplate.tikzCommand
              });
            } else if (activeTemplate && activeTemplate.type === 'wire') {
              const isWireComp = activeTemplate.name === 'Wire';
              const wireStyle = isWireComp ? this.context.getActiveWireStyle() : undefined;
              this.context.handleAddElement({
                type: 'wire',
                name: activeTemplate.name,
                x: this.wireStart.x,
                y: this.wireStart.y,
                x2: this.wireCurrent.x,
                y2: this.wireCurrent.y,
                label: isWireComp ? '' : activeTemplate.name,
                rotation: normalizedAngle,
                style: {
                  bold: false,
                  italic: false,
                  math: false,
                  color: '#f8e7ad',
                  fontSize: 12,
                  thickness: 1.0,
                  lineStyle: wireStyle
                },
                svgMarkup:
                  isWireComp && wireStyle
                    ? AssetsManager.getWireSvgMarkup(wireStyle)
                    : activeTemplate.svgMarkup,
                tikzCommand:
                  isWireComp && wireStyle
                    ? AssetsManager.getWireTikzCommand(wireStyle)
                    : activeTemplate.tikzCommand
              });
            } else {
              const wireStyle = this.context.getActiveWireStyle();
              this.context.handleAddElement({
                type: 'wire',
                name: 'Wire',
                x: this.wireStart.x,
                y: this.wireStart.y,
                x2: this.wireCurrent.x,
                y2: this.wireCurrent.y,
                label: '',
                rotation: normalizedAngle,
                style: {
                  bold: false,
                  italic: false,
                  math: false,
                  color: '#f8e7ad',
                  fontSize: 12,
                  thickness: 1.0,
                  lineStyle: wireStyle
                },
                svgMarkup: AssetsManager.getWireSvgMarkup(wireStyle),
                tikzCommand: AssetsManager.getWireTikzCommand(wireStyle)
              });
            }
          }
        }
        this.wireStart = null;
        this.wireCurrent = null;
        this.renderWires();
        activeDocument.removeEventListener('mousemove', onMouseMove);
        activeDocument.removeEventListener('mouseup', onMouseUp);
      };

      activeDocument.addEventListener('mousemove', onMouseMove);
      activeDocument.addEventListener('mouseup', onMouseUp);
    } else if (activeTool === 'text') {
      const template = activeTemplate ?? {
        name: 'Text',
        type: 'text',
        category: 'Basic',
        svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-size="22" font-family="serif" font-weight="bold" fill="currentColor">Aa</text></svg>`,
        tikzCommand: '\\node[font={fontSize}] at ({x}, {y}) {{label}};'
      };
      this.context.handleAddElement({
        type: 'text',
        name: 'Text',
        x: coords.x,
        y: coords.y,
        label: template.name === 'Text' ? 'Label Text' : template.name,
        rotation: 0,
        style: {
          bold: false,
          italic: false,
          math: true,
          color: '#f8e7ad',
          fontSize: 12,
          thickness: 1.0
        },
        svgMarkup: template.svgMarkup,
        tikzCommand: template.tikzCommand
      });
    } else if (activeTool === 'select' || activeTool === 'erase') {
      const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
      if (activeTool === 'select' && !isMultiSelect) {
        this.context.handleSelectVertices([]);
      }

      const nonSnappedCoords = this.getCanvasCoords(e, false);
      this.lassoStart = nonSnappedCoords;
      this.lassoCurrent = nonSnappedCoords;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const mCoords = this.getCanvasCoords(moveEvent, false);
        this.lassoCurrent = mCoords;
        this.renderWires();
      };

      const onMouseUp = () => {
        if (this.lassoStart && this.lassoCurrent) {
          if (activeTool === 'erase') {
            this.applyLassoErase();
          } else {
            this.applyLassoSelection(isMultiSelect);
          }
        }
        this.lassoStart = null;
        this.lassoCurrent = null;
        this.renderWires();
        activeDocument.removeEventListener('mousemove', onMouseMove);
        activeDocument.removeEventListener('mouseup', onMouseUp);
      };

      activeDocument.addEventListener('mousemove', onMouseMove);
      activeDocument.addEventListener('mouseup', onMouseUp);
    }
  }

  private applyLassoErase() {
    if (!this.lassoStart || !this.lassoCurrent) return;

    const left = Math.min(this.lassoStart.x, this.lassoCurrent.x);
    const right = Math.max(this.lassoStart.x, this.lassoCurrent.x);
    const top = Math.min(this.lassoStart.y, this.lassoCurrent.y);
    const bottom = Math.max(this.lassoStart.y, this.lassoCurrent.y);

    const isInside = (x: number, y: number) => {
      return x >= left && x <= right && y >= top && y <= bottom;
    };

    const toDeleteIds: string[] = [];
    this.context.getElements().forEach(elem => {
      if (elem.type === 'wire' && elem.x2 !== undefined && elem.y2 !== undefined) {
        if (isInside(elem.x, elem.y) || isInside(elem.x2, elem.y2)) {
          toDeleteIds.push(elem.id);
        }
      } else {
        if (isInside(elem.x, elem.y)) {
          toDeleteIds.push(elem.id);
        }
      }
    });

    if (toDeleteIds.length > 0) {
      this.context.handleDeleteElements(toDeleteIds);
    }
  }

  private applyLassoSelection(isMultiSelect = false) {
    if (!this.lassoStart || !this.lassoCurrent) return;

    const left = Math.min(this.lassoStart.x, this.lassoCurrent.x);
    const right = Math.max(this.lassoStart.x, this.lassoCurrent.x);
    const top = Math.min(this.lassoStart.y, this.lassoCurrent.y);
    const bottom = Math.max(this.lassoStart.y, this.lassoCurrent.y);

    const isInside = (x: number, y: number) => {
      return x >= left && x <= right && y >= top && y <= bottom;
    };

    const lassoVertices: import('../types').SelectedVertex[] = [];
    this.context.getElements().forEach(elem => {
      if (elem.type === 'wire' && elem.x2 !== undefined && elem.y2 !== undefined) {
        if (isInside(elem.x, elem.y)) {
          lassoVertices.push({ elementId: elem.id, vertex: 'start' });
        }
        if (isInside(elem.x2, elem.y2)) {
          lassoVertices.push({ elementId: elem.id, vertex: 'end' });
        }
      } else {
        if (isInside(elem.x, elem.y)) {
          lassoVertices.push({ elementId: elem.id, vertex: 'center' });
        }
      }
    });

    if (isMultiSelect) {
      const existing = this.context.getSelectedVertices();
      const merged = [...existing];
      lassoVertices.forEach(v => {
        if (!merged.some(e => e.elementId === v.elementId && e.vertex === v.vertex)) {
          merged.push(v);
        }
      });
      this.context.handleSelectVertices(merged);
    } else {
      this.context.handleSelectVertices(lassoVertices);
    }
  }

  private handleElementMouseDown(e: MouseEvent, elem: EditorElement) {
    const activeTool = this.context.getActiveTool();
    e.stopPropagation();
    if (e.button !== 0) return;

    if (activeTool === 'erase') {
      this.context.handleDeleteElement(elem.id);
      return;
    }

    const isMultiSelect = e.shiftKey || e.ctrlKey || e.metaKey;
    const clickedVertices: import('../types').SelectedVertex[] =
      elem.type === 'wire'
        ? [
            { elementId: elem.id, vertex: 'start' as const },
            { elementId: elem.id, vertex: 'end' as const }
          ]
        : [{ elementId: elem.id, vertex: 'center' as const }];

    const selectedVertices = this.context.getSelectedVertices();
    const isAlreadySelected = selectedVertices.some(v => v.elementId === elem.id);

    if (isMultiSelect) {
      if (isAlreadySelected) {
        const newSel = selectedVertices.filter(v => v.elementId !== elem.id);
        this.context.handleSelectVertices(newSel);
      } else {
        const newSel = [...selectedVertices, ...clickedVertices];
        this.context.handleSelectVertices(newSel);
      }
    } else {
      if (!isAlreadySelected) {
        this.context.handleSelectVertices(clickedVertices);
      }
    }

    if (activeTool === 'select') {
      this.dragStartCoords = { x: e.clientX, y: e.clientY };
      // Copy initial state of all elements to calculate relative moves
      this.dragInitialState = JSON.parse(
        JSON.stringify(this.context.getElements())
      ) as EditorElement[];

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!this.dragStartCoords) return;

        const zoom = this.context.getZoom();
        const rawDx = (moveEvent.clientX - this.dragStartCoords.x) / zoom;
        const rawDy = (moveEvent.clientY - this.dragStartCoords.y) / zoom;

        let snappedDx = rawDx;
        let snappedDy = rawDy;

        if (this.context.isSnapToGrid() && !moveEvent.ctrlKey) {
          const gridSize = this.context.isHalfGrid()
            ? this.context.PX_PER_UNIT / 2
            : this.context.PX_PER_UNIT;
          snappedDx = Math.round(rawDx / gridSize) * gridSize;
          snappedDy = Math.round(rawDy / gridSize) * gridSize;
        } else {
          snappedDx = Math.round(rawDx);
          snappedDy = Math.round(rawDy);
        }

        const currentSelVertices = this.context.getSelectedVertices();

        const newElements = this.dragInitialState.map(initialEl => {
          const el = { ...initialEl };

          if (el.type === 'wire' && el.x2 !== undefined && el.y2 !== undefined) {
            const hasStart = currentSelVertices.some(
              v => v.elementId === el.id && v.vertex === 'start'
            );
            const hasEnd = currentSelVertices.some(
              v => v.elementId === el.id && v.vertex === 'end'
            );
            if (hasStart) {
              el.x = initialEl.x + snappedDx;
              el.y = initialEl.y + snappedDy;
            }
            if (hasEnd) {
              el.x2 = (initialEl.x2 ?? 0) + snappedDx;
              el.y2 = (initialEl.y2 ?? 0) + snappedDy;
            }
          } else {
            const hasCenter = currentSelVertices.some(
              v => v.elementId === el.id && v.vertex === 'center'
            );
            if (hasCenter) {
              el.x = initialEl.x + snappedDx;
              el.y = initialEl.y + snappedDy;
            }
          }
          return el;
        });

        this.context.setElements(newElements);
        this.context.renderCanvas();
      };

      const onMouseUp = () => {
        this.context.saveHistoryState();
        this.dragStartCoords = null;
        this.dragInitialState = [];
        activeDocument.removeEventListener('mousemove', onMouseMove);
        activeDocument.removeEventListener('mouseup', onMouseUp);
      };

      activeDocument.addEventListener('mousemove', onMouseMove);
      activeDocument.addEventListener('mouseup', onMouseUp);
    }
  }

  private handleWireHandleMouseDown(
    e: MouseEvent,
    elem: EditorElement,
    handleType: 'start' | 'end'
  ) {
    e.stopPropagation();
    if (e.button !== 0) return;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const coords = this.getCanvasCoords(moveEvent);
      let newX = elem.x;
      let newY = elem.y;
      let newX2 = elem.x2 ?? 0;
      let newY2 = elem.y2 ?? 0;

      if (handleType === 'start') {
        newX = coords.x;
        newY = coords.y;
      } else {
        newX2 = coords.x;
        newY2 = coords.y;
      }

      const angleVal = Math.round(Math.atan2(newY2 - newY, newX2 - newX) * (180 / Math.PI));
      const normalizedAngle = (angleVal + 360) % 360;

      this.context.handleUpdateElement(
        {
          ...elem,
          x: newX,
          y: newY,
          x2: newX2,
          y2: newY2,
          rotation: normalizedAngle
        },
        false
      );
    };

    const onMouseUp = () => {
      this.context.saveHistoryState();
      activeDocument.removeEventListener('mousemove', onMouseMove);
      activeDocument.removeEventListener('mouseup', onMouseUp);
    };

    activeDocument.addEventListener('mousemove', onMouseMove);
    activeDocument.addEventListener('mouseup', onMouseUp);
  }
}
