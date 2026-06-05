import { type EditorElement, type EditorElementStyle } from '../types';
import { AssetsManager } from '../assets-manager';

export class TikzCodec {
  constructor(
    private toCanvasX: (x: number) => number,
    private toCanvasY: (y: number) => number,
    private fromCanvasX: (x: number) => number,
    private fromCanvasY: (y: number) => number,
    private createId: () => string,
    private defaultStyle: EditorElementStyle
  ) {}

  private parseNumber(value: string) {
    return Number.parseFloat(value.trim());
  }

  private parsePoint(value: string, shift: { x: number; y: number }) {
    const match = value.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
    if (!match) return null;
    return {
      x: this.parseNumber(match[1]) + shift.x,
      y: this.parseNumber(match[2]) + shift.y
    };
  }

  private makeWire(x1: number, y1: number, x2: number, y2: number): EditorElement {
    const wire = AssetsManager.getCoreComponents().find(t => t.name === 'Wire')!;
    return {
      id: this.createId(),
      type: 'wire',
      name: 'Wire',
      x: this.toCanvasX(x1),
      y: this.toCanvasY(y1),
      x2: this.toCanvasX(x2),
      y2: this.toCanvasY(y2),
      label: '',
      rotation: 0,
      style: { ...this.defaultStyle },
      svgMarkup: wire.svgMarkup,
      tikzCommand: wire.tikzCommand
    };
  }

  private makeNode(
    name: 'Filled node' | 'Open node' | 'Circle' | 'Filled Circle',
    x: number,
    y: number,
    label = '',
    radius?: number
  ): EditorElement {
    const template = AssetsManager.getCoreComponents().find(t => t.name === name)!;
    return {
      id: this.createId(),
      type: 'component',
      name,
      x: this.toCanvasX(x),
      y: this.toCanvasY(y),
      label,
      rotation: 0,
      radius: radius ?? (name.toLowerCase().includes('circle') ? 12.0 : 2.0),
      style: { ...this.defaultStyle },
      svgMarkup: template.svgMarkup,
      tikzCommand: template.tikzCommand
    };
  }

  private makeText(x: number, y: number, rawLabel: string): EditorElement {
    const template = AssetsManager.getCoreComponents().find(t => t.name === 'Text')!;
    let label = rawLabel.trim();
    let math = false;
    if (label.startsWith('$') && label.endsWith('$')) {
      label = label.substring(1, label.length - 1);
      math = true;
    }

    return {
      id: this.createId(),
      type: 'text',
      name: 'Text',
      x: this.toCanvasX(x),
      y: this.toCanvasY(y),
      label,
      rotation: 0,
      style: { ...this.defaultStyle, math },
      svgMarkup: template.svgMarkup,
      tikzCommand: template.tikzCommand
    };
  }

  public parse(source: string): { elements: EditorElement[]; pictureOptions: string } {
    const parsedElements: EditorElement[] = [];
    const beginMatch = source.match(/\\begin\{tikzpicture\}(\[[^\]]*\])?/);
    const pictureOptions = beginMatch?.[1] ?? '';

    const shifts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    const lines = source.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith('%') ||
        trimmed.startsWith('\\begin{tikzpicture}') ||
        trimmed.startsWith('\\end{tikzpicture}')
      ) {
        continue;
      }

      const currentShift = shifts[shifts.length - 1];
      const scopeMatch = trimmed.match(
        /\\begin\{scope\}\s*\[shift=\{\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\}\]/
      );
      if (scopeMatch) {
        shifts.push({
          x: currentShift.x + this.parseNumber(scopeMatch[1]),
          y: currentShift.y + this.parseNumber(scopeMatch[2])
        });
        continue;
      }
      if (trimmed.startsWith('\\end{scope}')) {
        if (shifts.length > 1) shifts.pop();
        continue;
      }

      const nodeMatch = trimmed.match(
        /\\node(?:\s*\[[^\]]*\])?\s*at\s*(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))\s*(?:\(\w+\)\s*)?\{(.*)\}\s*;/
      );
      if (nodeMatch) {
        const point = this.parsePoint(nodeMatch[1], currentShift);
        if (point) parsedElements.push(this.makeText(point.x, point.y, nodeMatch[2]));
        continue;
      }

      const circleMatch = trimmed.match(
        /\\(fill|draw)\s*(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))\s*circle\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pt|cm)?\s*\)(?:\s*node\[[^\]]*\]\s*\{(.*)\})?\s*;/
      );
      if (circleMatch) {
        const point = this.parsePoint(circleMatch[2], currentShift);
        if (point) {
          const parsedRadius = parseFloat(circleMatch[3]);
          const isFilled = circleMatch[1] === 'fill';
          const isLarge = !isNaN(parsedRadius) && parsedRadius >= 6.0;
          let nodeName: 'Filled node' | 'Open node' | 'Circle' | 'Filled Circle' = 'Open node';
          if (isFilled) {
            nodeName = isLarge ? 'Filled Circle' : 'Filled node';
          } else {
            nodeName = isLarge ? 'Circle' : 'Open node';
          }

          parsedElements.push(
            this.makeNode(
              nodeName,
              point.x,
              point.y,
              circleMatch[4] ?? '',
              isNaN(parsedRadius) ? undefined : parsedRadius
            )
          );
        }
        continue;
      }

      const circuitMatch = trimmed.match(
        /\\draw\s*(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))\s*to\s*\[\s*([A-Za-z]+).*?(?:l=\{(.*?)\})?.*?\]\s*(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))\s*;/
      );
      if (circuitMatch) {
        const start = this.parsePoint(circuitMatch[1], currentShift);
        const end = this.parsePoint(circuitMatch[4], currentShift);
        if (start && end) {
          const templates = [
            ...AssetsManager.getCoreComponents(),
            ...AssetsManager.getRegistry().flatMap(p => p.components)
          ];
          const template =
            templates.find(t => t.tikzCommand.includes(`to[${circuitMatch[2]}`)) ??
            templates.find(t => t.name === 'Wire')!;
          parsedElements.push({
            id: this.createId(),
            type: 'wire',
            name: template.name,
            x: this.toCanvasX(start.x),
            y: this.toCanvasY(start.y),
            x2: this.toCanvasX(end.x),
            y2: this.toCanvasY(end.y),
            label: circuitMatch[3] ?? template.name,
            rotation: 0,
            style: { ...this.defaultStyle },
            svgMarkup: template.svgMarkup,
            tikzCommand: template.tikzCommand
          });
        }
        continue;
      }

      const rectMatch = trimmed.match(
        /\\(draw|fill)\s*(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))\s*\+\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*rectangle\s*\+\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*;/
      );
      if (rectMatch) {
        const point = this.parsePoint(rectMatch[2], currentShift);
        if (point) {
          const template = AssetsManager.getCoreComponents().find(t => t.name === 'Rectangle')!;
          parsedElements.push({
            id: this.createId(),
            type: 'component',
            name: 'Rectangle',
            x: this.toCanvasX(point.x),
            y: this.toCanvasY(point.y),
            label: '',
            rotation: 0,
            style: { ...this.defaultStyle },
            svgMarkup: template.svgMarkup,
            tikzCommand: template.tikzCommand
          });
        }
        continue;
      }

      const triMatch = trimmed.match(
        /\\draw\s*(\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\))\s*\+\(0\s*,\s*0\.4\)\s*--\s*\+\(-0\.4\s*,\s*-0\.3\)\s*--\s*\+\(0\.4\s*,\s*-0\.3\)\s*--\s*cycle\s*;/
      );
      if (triMatch) {
        const point = this.parsePoint(triMatch[1], currentShift);
        if (point) {
          const template = AssetsManager.getCoreComponents().find(t => t.name === 'Triangle')!;
          parsedElements.push({
            id: this.createId(),
            type: 'component',
            name: 'Triangle',
            x: this.toCanvasX(point.x),
            y: this.toCanvasY(point.y),
            label: '',
            rotation: 0,
            style: { ...this.defaultStyle },
            svgMarkup: template.svgMarkup,
            tikzCommand: template.tikzCommand
          });
        }
        continue;
      }

      if (trimmed.startsWith('\\draw')) {
        const drawOptsMatch = trimmed.match(/^\\draw\s*\[([^\]]*)\]/);
        const opts = drawOptsMatch?.[1] ?? '';
        let wireName: 'Wire' | 'Dashed Wire' | 'Arrow' = 'Wire';
        if (opts.includes('dashed')) {
          wireName = 'Dashed Wire';
        } else if (opts.includes('-stealth') || opts.includes('->') || opts.includes('-latex')) {
          wireName = 'Arrow';
        }

        const pointMatches = Array.from(
          trimmed.matchAll(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g)
        );
        for (let index = 0; index < pointMatches.length - 1; index++) {
          const first = pointMatches[index];
          const second = pointMatches[index + 1];
          const startX = this.parseNumber(first[1]) + currentShift.x;
          const startY = this.parseNumber(first[2]) + currentShift.y;
          const endX = this.parseNumber(second[1]) + currentShift.x;
          const endY = this.parseNumber(second[2]) + currentShift.y;
          const template = AssetsManager.getCoreComponents().find(t => t.name === wireName)!;

          parsedElements.push({
            id: this.createId(),
            type: 'wire',
            name: wireName,
            x: this.toCanvasX(startX),
            y: this.toCanvasY(startY),
            x2: this.toCanvasX(endX),
            y2: this.toCanvasY(endY),
            label: '',
            rotation: 0,
            style: { ...this.defaultStyle },
            svgMarkup: template.svgMarkup,
            tikzCommand: template.tikzCommand
          });
        }
      }
    }

    return { elements: parsedElements, pictureOptions };
  }

  public generate(elements: EditorElement[], pictureOptions: string): string {
    let output = '';
    output += `\\begin{tikzpicture}${pictureOptions}\n`;

    const stateObj = { elements, pictureOptions };
    output += `  % [ObsiTeXState:${JSON.stringify(stateObj)}]\n\n`;

    elements.forEach(elem => {
      const xVal = this.fromCanvasX(elem.x).toFixed(2);
      const yVal = this.fromCanvasY(elem.y).toFixed(2);

      let cmd = elem.tikzCommand;
      if (!cmd) return;

      if (elem.radius !== undefined) {
        cmd = cmd.replace(/circle\s*\([^)]*\)/g, `circle (${elem.radius}pt)`);
      }

      if (elem.style.thickness && elem.style.thickness !== 1.0) {
        if (cmd.startsWith('\\draw') && cmd.includes('line width=')) {
          cmd = cmd.replace(/line width=[^,\]]+/, `line width=${elem.style.thickness}pt`);
        } else if (cmd.startsWith('\\draw[')) {
          cmd = cmd.replace(/\\draw\[/, `\\draw[line width=${elem.style.thickness}pt, `);
        } else if (cmd.startsWith('\\draw')) {
          cmd = cmd.replace(/\\draw/, `\\draw[line width=${elem.style.thickness}pt]`);
        }
      }

      let formattedLabel = elem.label || '';
      if (formattedLabel) {
        if (elem.style.bold) formattedLabel = `\\textbf{${formattedLabel}}`;
        if (elem.style.italic) formattedLabel = `\\textit{${formattedLabel}}`;
        if (elem.style.math) formattedLabel = `$${formattedLabel}$`;
      }

      const fontCommand =
        elem.style.fontSize <= 10
          ? '\\small'
          : elem.style.fontSize <= 12
            ? '\\normalsize'
            : elem.style.fontSize <= 14
              ? '\\large'
              : elem.style.fontSize <= 18
                ? '\\Large'
                : '\\Huge';

      cmd = cmd.replace(/{x}/g, xVal);
      cmd = cmd.replace(/{y}/g, yVal);
      cmd = cmd.replace(/{label}/g, formattedLabel);
      cmd = cmd.replace(/{fontSize}/g, fontCommand);

      if (elem.x2 !== undefined && elem.y2 !== undefined) {
        const x2Val = this.fromCanvasX(elem.x2).toFixed(2);
        const y2Val = this.fromCanvasY(elem.y2).toFixed(2);
        cmd = cmd.replace(/{x2}/g, x2Val);
        cmd = cmd.replace(/{y2}/g, y2Val);
      }

      output += `  ${cmd}\n`;
    });

    output += '\\end{tikzpicture}';
    return output;
  }
}
