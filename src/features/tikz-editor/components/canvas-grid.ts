import { type TikzEditorContext, type EditorElement } from '../types';
import { renderMath, finishRenderMath } from 'obsidian';

export class CanvasGrid {
  private draggingId: string | null = null;
  private dragStartCoords: { x: number; y: number } | null = null;
  private dragOffset: { x: number; y: number } | null = null;
  private wireStart: { x: number; y: number } | null = null;
  private wireCurrent: { x: number; y: number } | null = null;

  constructor(
    private context: TikzEditorContext,
    private containerEl: HTMLElement,
    private workspaceEl: HTMLDivElement,
    private wiresOverlayEl: SVGElement
  ) {
    // Canvas mousedown listener
    this.workspaceEl.addEventListener('mousedown', e => this.handleCanvasMouseDown(e));
  }

  public render() {
    const gridBg = this.workspaceEl.querySelector('.grid-background');
    if (gridBg) {
      gridBg.className = 'grid-background' + (this.context.isHalfGrid() ? ' half-grid' : '');
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
    for (let x = 0; x <= 12; x++) {
      const text = activeDocument.createElementNS(svgNS, 'text');
      text.setAttribute('x', (this.context.ORIGIN_X + x * this.context.PX_PER_UNIT).toString());
      text.setAttribute('y', (this.context.ORIGIN_Y + 18).toString());
      text.textContent = x.toString();
      axisOverlay.appendChild(text);
    }

    // Y labels
    for (let y = -4; y <= 4; y++) {
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
    const selectedElementId = this.context.getSelectedElementId();
    const elements = this.context.getElements();

    // Draw elements
    elements.forEach(elem => {
      if (elem.type !== 'wire' || elem.x2 === undefined || elem.y2 === undefined) return;

      const group = activeDocument.createElementNS(svgNS, 'g');
      group.setAttribute(
        'class',
        'wire-group' + (selectedElementId === elem.id ? ' selected' : '')
      );
      group.addEventListener('mousedown', e => this.handleElementMouseDown(e, elem));

      const lineClick = activeDocument.createElementNS(svgNS, 'line');
      lineClick.setAttribute('x1', elem.x.toString());
      lineClick.setAttribute('y1', elem.y.toString());
      lineClick.setAttribute('x2', elem.x2.toString());
      lineClick.setAttribute('y2', elem.y2.toString());
      lineClick.setAttribute('stroke', 'transparent');
      lineClick.setAttribute('stroke-width', '12');
      lineClick.style.cursor = 'pointer';
      group.appendChild(lineClick);

      if (elem.name === 'Wire') {
        const line = activeDocument.createElementNS(svgNS, 'line');
        line.setAttribute('x1', elem.x.toString());
        line.setAttribute('y1', elem.y.toString());
        line.setAttribute('x2', elem.x2.toString());
        line.setAttribute('y2', elem.y2.toString());
        line.setAttribute(
          'stroke',
          selectedElementId === elem.id
            ? 'var(--text-accent)'
            : elem.style.color || 'var(--text-normal)'
        );
        line.setAttribute('stroke-width', (elem.style.thickness ?? 1.0).toString());
        group.appendChild(line);
      } else {
        const dx = elem.x2 - elem.x;
        const dy = elem.y2 - elem.y;
        const len = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        const midX = elem.x + dx / 2;
        const midY = elem.y + dy / 2;

        const margin = Math.min(20, len / 2);
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
          selectedElementId === elem.id
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
          selectedElementId === elem.id
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

        const rect = activeDocument.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', '-2');
        rect.setAttribute('y', '-2');
        rect.setAttribute('width', '54');
        rect.setAttribute('height', '24');
        rect.setAttribute('fill', 'var(--background-primary)');
        rect.setAttribute('stroke', 'none');
        innerG.appendChild(rect);

        const svgWrap = activeDocument.createElementNS(svgNS, 'g');
        svgWrap.setAttribute('class', 'comp-svg-fill');
        svgWrap.style.color =
          selectedElementId === elem.id
            ? 'var(--text-accent)'
            : elem.style.color || 'var(--text-normal)';
        svgWrap.innerHTML = elem.svgMarkup;
        innerG.appendChild(svgWrap);
        group.appendChild(innerG);

        if (elem.label) {
          if (elem.style.math) {
            const foreign = activeDocument.createElementNS(svgNS, 'foreignObject');
            foreign.setAttribute('x', (midX - 100).toString());
            foreign.setAttribute('y', (midY - 28).toString());
            foreign.setAttribute('width', '200');
            foreign.setAttribute('height', '24');
            foreign.style.overflow = 'visible';

            const div = activeDocument.createElement('div');
            div.style.display = 'flex';
            div.style.justifyContent = 'center';
            div.style.alignItems = 'center';
            div.style.width = '100%';
            div.style.height = '100%';
            div.style.fontSize = `${elem.style.fontSize}px`;
            div.style.color = elem.style.color || 'var(--text-normal)';

            try {
              const mathEl = renderMath(elem.label, false);
              div.appendChild(mathEl);
              const MathJax = (window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } }).MathJax;
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
            text.setAttribute('font-size', `${elem.style.fontSize}px`);
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

      // Draw handles if this wire is selected
      if (selectedElementId === elem.id) {
        const handleStart = activeDocument.createElementNS(svgNS, 'circle');
        handleStart.setAttribute('cx', elem.x.toString());
        handleStart.setAttribute('cy', elem.y.toString());
        handleStart.setAttribute('r', '6');
        handleStart.setAttribute('fill', 'var(--interactive-accent)');
        handleStart.setAttribute('stroke', 'var(--text-on-accent)');
        handleStart.setAttribute('stroke-width', '1.5');
        handleStart.style.cursor = 'move';
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
        handleEnd.style.cursor = 'move';
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
      if (activeTemplate && activeTemplate.type === 'wire') {
        const dx = this.wireCurrent.x - this.wireStart.x;
        const dy = this.wireCurrent.y - this.wireStart.y;
        const len = Math.hypot(dx, dy);
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
        innerG.style.opacity = '0.7';

        const rect = activeDocument.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', '-2');
        rect.setAttribute('y', '-2');
        rect.setAttribute('width', '54');
        rect.setAttribute('height', '24');
        rect.setAttribute('fill', 'var(--background-primary)');
        rect.setAttribute('stroke', 'none');
        innerG.appendChild(rect);

        const svgWrap = activeDocument.createElementNS(svgNS, 'g');
        svgWrap.style.color = 'var(--text-accent)';
        svgWrap.innerHTML = activeTemplate.svgMarkup;
        innerG.appendChild(svgWrap);
        this.wiresOverlayEl.appendChild(innerG);
      } else {
        const line = activeDocument.createElementNS(svgNS, 'line');
        line.setAttribute('x1', this.wireStart.x.toString());
        line.setAttribute('y1', this.wireStart.y.toString());
        line.setAttribute('x2', this.wireCurrent.x.toString());
        line.setAttribute('y2', this.wireCurrent.y.toString());
        line.setAttribute('stroke', 'var(--text-accent)');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '4,4');
        this.wiresOverlayEl.appendChild(line);
      }
    }
  }

  private renderPlacedElements() {
    this.workspaceEl.querySelectorAll('.placed-element').forEach(el => el.remove());
    const selectedElementId = this.context.getSelectedElementId();
    const elements = this.context.getElements();

    elements.forEach(elem => {
      if (elem.type !== 'component' && elem.type !== 'text') return;

      const el = activeDocument.createElement('div');
      el.className =
        'placed-element' +
        (selectedElementId === elem.id ? ' selected' : '') +
        (elem.type === 'text' ? ' is-text' : '');
      el.style.left = `${elem.x}px`;
      el.style.top = `${elem.y}px`;
      el.style.transform = `rotate(${elem.rotation}deg)`;

      el.addEventListener('mousedown', e => this.handleElementMouseDown(e, elem));

      if (elem.type === 'text') {
        const content = activeDocument.createElement('div');
        content.className = 'text-element-content';
        content.style.fontSize = `${elem.style.fontSize}px`;
        content.style.fontWeight = elem.style.bold ? 'bold' : 'normal';
        content.style.fontStyle = elem.style.italic ? 'italic' : 'normal';
        content.style.color = elem.style.color || 'var(--text-normal)';
        if (elem.style.math && elem.label) {
          try {
            const mathEl = renderMath(elem.label, false);
            content.appendChild(mathEl);
            const MathJax = (window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } }).MathJax;
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
        visual.innerHTML = svg;
        el.appendChild(visual);

        if (elem.label) {
          const label = activeDocument.createElement('div');
          label.className = 'node-label';
          label.style.fontSize = `${elem.style.fontSize}px`;
          label.style.color = elem.style.color || 'var(--text-normal)';
          if (elem.style.math) {
            try {
              const mathEl = renderMath(elem.label, false);
              label.appendChild(mathEl);
              const MathJax = (window as typeof window & { MathJax?: { chtmlStylesheet?: unknown } }).MathJax;
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

  private getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const rect = this.workspaceEl.getBoundingClientRect();
    const zoom = this.context.getZoom();
    const rawX = (e.clientX - rect.left) / zoom;
    const rawY = (e.clientY - rect.top) / zoom;

    if (this.context.isSnapToGrid() && !e.ctrlKey) {
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

    console.log(
      '[CanvasGrid] handleCanvasMouseDown button:',
      e.button,
      'activeTool:',
      activeTool,
      'activeTemplate:',
      activeTemplate?.name
    );
    if (e.button !== 0) return;

    const coords = this.getCanvasCoords(e);
    console.log('[CanvasGrid] handleCanvasMouseDown coords:', coords);

    if (activeTemplate && activeTemplate.type === 'component') {
      this.context.handleAddElement({
        type: 'component',
        name: activeTemplate.name,
        x: coords.x,
        y: coords.y,
        label: '',
        rotation: 0,
        style: { bold: false, italic: false, math: false, color: '#f8e7ad', fontSize: 12, thickness: 1.0 },
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
          console.log('[CanvasGrid] handleCanvasMouseMove wire drawing coords:', mCoords);
          this.wireCurrent = mCoords;
          this.renderWires();
        }
      };

      const onMouseUp = (upEvent: MouseEvent) => {
        console.log('[CanvasGrid] handleCanvasMouseUp wireStart:', this.wireStart);
        if (this.wireStart && this.wireCurrent) {
          const dist = Math.hypot(
            this.wireCurrent.x - this.wireStart.x,
            this.wireCurrent.y - this.wireStart.y
          );
          if (dist > 10) {
            const angleVal = Math.round(Math.atan2(this.wireCurrent.y - this.wireStart.y, this.wireCurrent.x - this.wireStart.x) * (180 / Math.PI));
            const normalizedAngle = (angleVal + 360) % 360;

            if (activeTemplate && activeTemplate.type === 'wire') {
              this.context.handleAddElement({
                type: 'wire',
                name: activeTemplate.name,
                x: this.wireStart.x,
                y: this.wireStart.y,
                x2: this.wireCurrent.x,
                y2: this.wireCurrent.y,
                label: activeTemplate.name,
                rotation: normalizedAngle,
                style: { bold: false, italic: false, math: false, color: '#f8e7ad', fontSize: 12, thickness: 1.0 },
                svgMarkup: activeTemplate.svgMarkup,
                tikzCommand: activeTemplate.tikzCommand
              });
            } else {
              this.context.handleAddElement({
                type: 'wire',
                name: 'Wire',
                x: this.wireStart.x,
                y: this.wireStart.y,
                x2: this.wireCurrent.x,
                y2: this.wireCurrent.y,
                label: '',
                rotation: normalizedAngle,
                style: { bold: false, italic: false, math: false, color: '#f8e7ad', fontSize: 12, thickness: 1.0 },
                svgMarkup: `<svg viewBox="0 0 40 40"><line x1="0" y1="20" x2="40" y2="20" stroke="currentColor" stroke-width="2"/></svg>`,
                tikzCommand: '\\draw[line width=0.8pt] ({x}, {y}) -- ({x2}, {y2});'
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
        style: { bold: false, italic: false, math: true, color: '#f8e7ad', fontSize: 12, thickness: 1.0 },
        svgMarkup: template.svgMarkup,
        tikzCommand: template.tikzCommand
      });
    } else if (activeTool === 'select') {
      this.context.handleSelectElement(null);
    }
  }

  private handleElementMouseDown(e: MouseEvent, elem: EditorElement) {
    const activeTool = this.context.getActiveTool();
    console.log(
      '[CanvasGrid] handleElementMouseDown element:',
      elem.id,
      elem.name,
      'activeTool:',
      activeTool
    );
    e.stopPropagation();
    if (e.button !== 0) return;

    if (activeTool === 'erase') {
      this.context.handleDeleteElement(elem.id);
      return;
    }

    this.context.handleSelectElement(elem.id);

    if (activeTool === 'select') {
      this.draggingId = elem.id;
      this.dragStartCoords = { x: e.clientX, y: e.clientY };
      this.dragOffset = { x: elem.x, y: elem.y };

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!this.draggingId || !this.dragStartCoords || !this.dragOffset) return;
        console.log('[CanvasGrid] handleElementMouseMove draggingId:', this.draggingId);

        const zoom = this.context.getZoom();
        const dx = (moveEvent.clientX - this.dragStartCoords.x) / zoom;
        const dy = (moveEvent.clientY - this.dragStartCoords.y) / zoom;

        let newX = this.dragOffset.x + dx;
        let newY = this.dragOffset.y + dy;

        if (this.context.isSnapToGrid() && !moveEvent.ctrlKey) {
          const gridSize = this.context.isHalfGrid()
            ? this.context.PX_PER_UNIT / 2
            : this.context.PX_PER_UNIT;
          newX = Math.round((newX - this.context.ORIGIN_X) / gridSize) * gridSize + this.context.ORIGIN_X;
          newY = Math.round((newY - this.context.ORIGIN_Y) / gridSize) * gridSize + this.context.ORIGIN_Y;
        } else {
          newX = Math.round(newX);
          newY = Math.round(newY);
        }

        const el = this.context.getElements().find(item => item.id === this.draggingId);
        if (!el) return;

        if (el.type === 'wire' && el.x2 !== undefined && el.y2 !== undefined) {
          const wireDx = el.x2 - el.x;
          const wireDy = el.y2 - el.y;
          this.context.handleUpdateElementPosition(
            this.draggingId,
            newX,
            newY,
            newX + wireDx,
            newY + wireDy,
            false
          );
        } else {
          this.context.handleUpdateElementPosition(this.draggingId, newX, newY, undefined, undefined, false);
        }
      };

      const onMouseUp = () => {
        console.log('[CanvasGrid] handleElementMouseUp finished dragging');
        this.context.saveHistoryState();
        this.draggingId = null;
        this.dragStartCoords = null;
        this.dragOffset = null;
        activeDocument.removeEventListener('mousemove', onMouseMove);
        activeDocument.removeEventListener('mouseup', onMouseUp);
      };

      activeDocument.addEventListener('mousemove', onMouseMove);
      activeDocument.addEventListener('mouseup', onMouseUp);
    }
  }

  private handleWireHandleMouseDown(e: MouseEvent, elem: EditorElement, handleType: 'start' | 'end') {
    e.stopPropagation();
    if (e.button !== 0) return;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const coords = this.getCanvasCoords(moveEvent);
      let newX = elem.x;
      let newY = elem.y;
      let newX2 = elem.x2!;
      let newY2 = elem.y2!;

      if (handleType === 'start') {
        newX = coords.x;
        newY = coords.y;
      } else {
        newX2 = coords.x;
        newY2 = coords.y;
      }

      const angleVal = Math.round(Math.atan2(newY2 - newY, newX2 - newX) * (180 / Math.PI));
      const normalizedAngle = (angleVal + 360) % 360;

      this.context.handleUpdateElement({
        ...elem,
        x: newX,
        y: newY,
        x2: newX2,
        y2: newY2,
        rotation: normalizedAngle
      }, false);
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
