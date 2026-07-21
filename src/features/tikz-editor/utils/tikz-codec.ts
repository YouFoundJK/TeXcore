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

  private colorNameToHex(name: string): string | null {
    const map: Record<string, string> = {
      black: '#000000',
      white: '#ffffff',
      red: '#ff0000',
      green: '#00cc00',
      blue: '#0000ff',
      cyan: '#00ffff',
      magenta: '#ff00ff',
      yellow: '#ffff00',
      gray: '#808080',
      grey: '#808080',
      darkgray: '#404040',
      lightgray: '#d3d3d3',
      orange: '#ffa500',
      purple: '#800080',
      violet: '#8a2be2',
      teal: '#008080',
      olive: '#808000',
      lime: '#00ff00',
      brown: '#a52a2a',
      pink: '#ffc0cb'
    };
    return map[name.toLowerCase()] ?? null;
  }

  private parseHex(hex: string): { r: number; g: number; b: number } | null {
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map(c => c + c)
        .join('');
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16);
      if (!isNaN(num)) {
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
      }
    }
    return null;
  }

  private parseTikzColor(colorStr: string): { hex: string; raw: string } | null {
    const trimmed = colorStr.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('#')) {
      return { hex: trimmed, raw: trimmed };
    }

    const parts = trimmed.split('!');
    if (parts.length === 1) {
      const hex = this.colorNameToHex(parts[0]);
      return hex ? { hex, raw: trimmed } : null;
    }

    const c1Hex = this.colorNameToHex(parts[0]) || '#000000';
    const pct = parseFloat(parts[1]);
    const weight = isNaN(pct) ? 1.0 : pct / 100;
    const c2Hex = parts[2] ? this.colorNameToHex(parts[2]) || '#ffffff' : '#ffffff';

    const rgb1 = this.parseHex(c1Hex) || { r: 0, g: 0, b: 0 };
    const rgb2 = this.parseHex(c2Hex) || { r: 255, g: 255, b: 255 };

    const r = Math.round(rgb1.r * weight + rgb2.r * (1 - weight));
    const g = Math.round(rgb1.g * weight + rgb2.g * (1 - weight));
    const b = Math.round(rgb1.b * weight + rgb2.b * (1 - weight));

    const hex = `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
    return { hex, raw: trimmed };
  }

  private parseOptions(optsStr: string): {
    color?: string;
    rawColor?: string;
    thickness?: number;
    lineStyle?: 'solid' | 'dashed' | 'dotted';
    arrowStyle?: boolean;
    fontSize?: number;
  } {
    if (!optsStr) return {};
    const res: ReturnType<typeof this.parseOptions> = {};

    const colorMatch = optsStr.match(/color\s*=\s*([a-zA-Z0-9!#_]+)/i);
    if (colorMatch) {
      const parsedColor = this.parseTikzColor(colorMatch[1]);
      if (parsedColor) {
        res.color = parsedColor.hex;
        res.rawColor = parsedColor.raw;
      }
    } else {
      const tokens = optsStr.split(/[\s,]+/);
      for (const token of tokens) {
        const parsedColor = this.parseTikzColor(token);
        if (parsedColor) {
          res.color = parsedColor.hex;
          res.rawColor = parsedColor.raw;
          break;
        }
      }
    }

    const widthMatch = optsStr.match(/line\s*width\s*=\s*(\d+(?:\.\d+)?)\s*(pt|cm|mm)?/i);
    if (widthMatch) {
      let val = parseFloat(widthMatch[1]);
      const unit = widthMatch[2]?.toLowerCase();
      if (unit === 'cm') val *= 28.45;
      else if (unit === 'mm') val *= 2.845;
      res.thickness = val;
    } else if (optsStr.includes('ultra thick')) res.thickness = 3.0;
    else if (optsStr.includes('very thick')) res.thickness = 2.0;
    else if (optsStr.includes('thick')) res.thickness = 1.5;
    else if (optsStr.includes('semithick')) res.thickness = 1.2;
    else if (optsStr.includes('very thin')) res.thickness = 0.4;
    else if (optsStr.includes('ultra thin')) res.thickness = 0.2;
    else if (optsStr.includes('thin')) res.thickness = 0.8;

    if (optsStr.includes('dotted')) res.lineStyle = 'dotted';
    else if (optsStr.includes('dashed')) res.lineStyle = 'dashed';

    if (
      optsStr.includes('->') ||
      optsStr.includes('-stealth') ||
      optsStr.includes('Triangle') ||
      optsStr.includes('-latex') ||
      optsStr.includes('->>')
    ) {
      res.arrowStyle = true;
    }

    const scaleMatch = optsStr.match(/scale\s*=\s*(\d+(?:\.\d+)?)/i);
    if (scaleMatch) {
      res.fontSize = Math.round(12 * parseFloat(scaleMatch[1]));
    } else if (optsStr.includes('\\Huge')) res.fontSize = 24;
    else if (optsStr.includes('\\Large')) res.fontSize = 18;
    else if (optsStr.includes('\\large')) res.fontSize = 14;
    else if (optsStr.includes('\\small')) res.fontSize = 10;

    return res;
  }

  private parsePoint(
    value: string,
    shift: { x: number; y: number },
    namedCoords?: Map<string, { x: number; y: number }>
  ): { x: number; y: number } | null {
    const literalMatch = value.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
    if (literalMatch) {
      return {
        x: this.parseNumber(literalMatch[1]) + shift.x,
        y: this.parseNumber(literalMatch[2]) + shift.y
      };
    }
    const namedMatch = value.match(/\(\s*([A-Za-z0-9_]+)\s*\)/);
    if (namedMatch && namedCoords) {
      const coord = namedCoords.get(namedMatch[1]);
      if (coord) {
        return {
          x: coord.x + shift.x,
          y: coord.y + shift.y
        };
      }
    }
    return null;
  }

  private expandForeach(source: string): string {
    let prev = '';
    let curr = source;
    for (let iter = 0; iter < 10 && curr !== prev; iter++) {
      prev = curr;
      curr = curr.replace(
        /\\foreach\s*\\([a-zA-Z0-9_]+)\s*in\s*\{([^}]+)\}\s*([\s\S]*?;)/g,
        (_fullMatch: string, varName: string, valuesList: string, body: string): string => {
          const items: string[] = [];
          const rawItems = valuesList.split(',');
          for (const item of rawItems) {
            const trimmed = item.trim();
            const rangeMatch = trimmed.match(/^(-?\d+)\s*\.\.\.\s*(-?\d+)$/);
            if (rangeMatch) {
              const start = parseInt(rangeMatch[1]);
              const end = parseInt(rangeMatch[2]);
              const step = start <= end ? 1 : -1;
              for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
                items.push(i.toString());
              }
            } else if (trimmed) {
              items.push(trimmed);
            }
          }
          const regex = new RegExp(`\\\\${varName}\\b`, 'g');
          return items.map(val => body.replace(regex, val)).join('\n');
        }
      );
    }
    return curr;
  }

  private stripComments(source: string): string {
    return source
      .split('\n')
      .map(line => {
        const idx = line.indexOf('%');
        if (idx !== -1) return line.substring(0, idx);
        return line;
      })
      .join('\n');
  }

  private makeWire(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    optsStyle?: ReturnType<typeof this.parseOptions>
  ): EditorElement {
    let name = 'Wire';
    if (optsStyle?.lineStyle === 'dashed' || optsStyle?.lineStyle === 'dotted') {
      name = 'Dashed Wire';
    } else if (optsStyle?.arrowStyle) {
      name = 'Arrow';
    }

    const wire = AssetsManager.getCoreComponents().find(t => t.name === name);
    if (!wire) {
      throw new Error(`Core component '${name}' not found`);
    }

    const style: EditorElementStyle = {
      ...this.defaultStyle,
      color: optsStyle?.color ?? this.defaultStyle.color,
      rawColor: optsStyle?.rawColor,
      thickness: optsStyle?.thickness ?? this.defaultStyle.thickness,
      lineStyle: optsStyle?.lineStyle,
      arrowStyle: optsStyle?.arrowStyle
    };

    return {
      id: this.createId(),
      type: 'wire',
      name,
      x: this.toCanvasX(x1),
      y: this.toCanvasY(y1),
      x2: this.toCanvasX(x2),
      y2: this.toCanvasY(y2),
      label: '',
      rotation: 0,
      style,
      svgMarkup: wire.svgMarkup,
      tikzCommand: wire.tikzCommand
    };
  }

  private makeNode(
    name: 'Filled node' | 'Open node' | 'Circle' | 'Filled Circle',
    x: number,
    y: number,
    label = '',
    radius?: number,
    optsStyle?: ReturnType<typeof this.parseOptions>
  ): EditorElement {
    const template = AssetsManager.getCoreComponents().find(t => t.name === name);
    if (!template) {
      throw new Error(`Core component '${name}' not found`);
    }

    const style: EditorElementStyle = {
      ...this.defaultStyle,
      color: optsStyle?.color ?? this.defaultStyle.color,
      rawColor: optsStyle?.rawColor,
      thickness: optsStyle?.thickness ?? this.defaultStyle.thickness
    };

    return {
      id: this.createId(),
      type: 'component',
      name,
      x: this.toCanvasX(x),
      y: this.toCanvasY(y),
      label,
      rotation: 0,
      radius: radius ?? (name.toLowerCase().includes('circle') ? 12.0 : 2.0),
      style,
      svgMarkup: template.svgMarkup,
      tikzCommand: template.tikzCommand
    };
  }

  private makeText(
    x: number,
    y: number,
    rawLabel: string,
    optsStyle?: ReturnType<typeof this.parseOptions>
  ): EditorElement {
    const template = AssetsManager.getCoreComponents().find(t => t.name === 'Text');
    if (!template) {
      throw new Error("Core component 'Text' not found");
    }
    let label = rawLabel.trim();
    let math = false;
    let bold = false;
    let italic = false;

    if (label.startsWith('$') && label.endsWith('$')) {
      label = label.substring(1, label.length - 1);
      math = true;
    }
    if (label.includes('\\textbf{')) {
      bold = true;
      label = label.replace(/\\textbf\{([^}]+)\}/, '$1');
    }
    if (label.includes('\\textit{')) {
      italic = true;
      label = label.replace(/\\textit\{([^}]+)\}/, '$1');
    }

    const style: EditorElementStyle = {
      ...this.defaultStyle,
      math,
      bold,
      italic,
      color: optsStyle?.color ?? this.defaultStyle.color,
      rawColor: optsStyle?.rawColor,
      fontSize: optsStyle?.fontSize ?? this.defaultStyle.fontSize
    };

    return {
      id: this.createId(),
      type: 'text',
      name: 'Text',
      x: this.toCanvasX(x),
      y: this.toCanvasY(y),
      label,
      rotation: 0,
      style,
      svgMarkup: template.svgMarkup,
      tikzCommand: template.tikzCommand
    };
  }

  public parse(source: string): { elements: EditorElement[]; pictureOptions: string } {
    const parsedElements: EditorElement[] = [];
    const beginMatch = source.match(/\\begin\{tikzpicture\}(\[[^\]]*\])?/);
    const pictureOptions = beginMatch?.[1] ?? '';

    const rawCleaned = this.expandForeach(this.stripComments(source));
    const cleaned = rawCleaned
      .replace(/\\begin\{tikzpicture\}(\[[^\]]*\])?/g, '')
      .replace(/\\end\{tikzpicture\}/g, '')
      .replace(/\\usepackage(?:\s*\[[^\]]*\])?\s*\{[^}]+\}/g, '')
      .replace(/\\usetikzlibrary\s*\{[^}]+\}/g, '');
    const namedCoords = new Map<string, { x: number; y: number }>();

    // Pre-pass for named coordinates: \coordinate (A) at (x,y);
    const coordMatches = cleaned.matchAll(
      /\\coordinate(?:\s*\[[^\]]*\])?\s*\(\s*([A-Za-z0-9_]+)\s*\)\s*at\s*(\([^)]+\))\s*;/g
    );
    for (const match of coordMatches) {
      const pt = this.parsePoint(match[2], { x: 0, y: 0 });
      if (pt) {
        namedCoords.set(match[1], pt);
      }
    }

    // Node pre-pass for named nodes: \node (A) at (x,y) or \node at (x,y) (A)
    const nodeCoordMatches = cleaned.matchAll(
      /\\node(?:\s*\[[^\]]*\])?\s*(?:\(\s*([A-Za-z0-9_]+)\s*\)\s*)?at\s*(\([^)]+\))(?:\s*\(\s*([A-Za-z0-9_]+)\s*\))?/g
    );
    for (const match of nodeCoordMatches) {
      const name = match[1] || match[3];
      if (name) {
        const pt = this.parsePoint(match[2], { x: 0, y: 0 });
        if (pt) namedCoords.set(name, pt);
      }
    }

    const shifts: { x: number; y: number }[] = [{ x: 0, y: 0 }];
    const statements = cleaned.split(';');

    for (const rawStmt of statements) {
      const stmt = rawStmt.replace(/\s+/g, ' ').trim();
      if (
        !stmt ||
        stmt.startsWith('\\usepackage') ||
        stmt.startsWith('\\usetikzlibrary') ||
        stmt.startsWith('\\begin{tikzpicture}') ||
        stmt.startsWith('\\end{tikzpicture}')
      ) {
        continue;
      }

      const currentShift = shifts[shifts.length - 1];

      const scopeMatch = stmt.match(
        /\\begin\{scope\}\s*\[shift=\{\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\}\]/
      );
      if (scopeMatch) {
        shifts.push({
          x: currentShift.x + this.parseNumber(scopeMatch[1]),
          y: currentShift.y + this.parseNumber(scopeMatch[2])
        });
        continue;
      }
      if (stmt.startsWith('\\end{scope}')) {
        if (shifts.length > 1) shifts.pop();
        continue;
      }

      // 1. Node matching
      const nodeMatch = stmt.match(
        /\\node(?:\s*\[([^\]]*)\])?(?:\s*\(([A-Za-z0-9_]+)\))?\s*at\s*(\([^)]+\))\s*(?:(?:\(([A-Za-z0-9_]+)\))?\s*)?\{((?:[^{}]|\{[^{}]*\})*)\}/
      );
      if (nodeMatch) {
        const point = this.parsePoint(nodeMatch[3], currentShift, namedCoords);
        if (point) {
          const optsStyle = this.parseOptions(nodeMatch[1] ?? '');
          parsedElements.push(this.makeText(point.x, point.y, nodeMatch[5], optsStyle));
        }
        continue;
      }

      // 2. Circle matching
      const circleMatch = stmt.match(
        /\\(fill|draw)(?:\s*\[([^\]]*)\])?\s*(\([^)]+\))\s*circle\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pt|cm)?\s*\)(?:\s*node\[[^\]]*\]\s*\{(.*)\})?/
      );
      if (circleMatch) {
        const point = this.parsePoint(circleMatch[3], currentShift, namedCoords);
        if (point) {
          const parsedRadius = parseFloat(circleMatch[4]);
          const isFilled = circleMatch[1] === 'fill';
          const isLarge = !isNaN(parsedRadius) && parsedRadius >= 6.0;
          let nodeName: 'Filled node' | 'Open node' | 'Circle' | 'Filled Circle';
          if (isFilled) {
            nodeName = isLarge ? 'Filled Circle' : 'Filled node';
          } else {
            nodeName = isLarge ? 'Circle' : 'Open node';
          }

          const optsStyle = this.parseOptions(circleMatch[2] ?? '');
          parsedElements.push(
            this.makeNode(
              nodeName,
              point.x,
              point.y,
              circleMatch[5] ?? '',
              isNaN(parsedRadius) ? undefined : parsedRadius,
              optsStyle
            )
          );
        }
        continue;
      }

      // 3. Circuit component matching
      const circuitMatch = stmt.match(
        /\\draw(?:\s*\[([^\]]*)\])?\s*(\([^)]+\))\s*to\s*\[\s*([A-Za-z]+).*?(?:l=\{(.*?)\})?.*?\]\s*(\([^)]+\))/
      );
      if (circuitMatch) {
        const start = this.parsePoint(circuitMatch[2], currentShift, namedCoords);
        const end = this.parsePoint(circuitMatch[5], currentShift, namedCoords);
        if (start && end) {
          const templates = [
            ...AssetsManager.getCoreComponents(),
            ...AssetsManager.getRegistry().flatMap(p => p.components)
          ];
          const wireTemplate = templates.find(t => t.name === 'Wire');
          if (!wireTemplate) {
            throw new Error("Core component 'Wire' not found");
          }
          const template =
            templates.find(t => t.tikzCommand.includes(`to[${circuitMatch[3]}`)) ?? wireTemplate;
          const optsStyle = this.parseOptions(circuitMatch[1] ?? '');
          parsedElements.push({
            id: this.createId(),
            type: 'wire',
            name: template.name,
            x: this.toCanvasX(start.x),
            y: this.toCanvasY(start.y),
            x2: this.toCanvasX(end.x),
            y2: this.toCanvasY(end.y),
            label: circuitMatch[4] ?? template.name,
            rotation: 0,
            style: {
              ...this.defaultStyle,
              color: optsStyle.color ?? this.defaultStyle.color,
              rawColor: optsStyle.rawColor,
              thickness: optsStyle.thickness ?? this.defaultStyle.thickness
            },
            svgMarkup: template.svgMarkup,
            tikzCommand: template.tikzCommand
          });
        }
        continue;
      }

      // 4. Plot coordinates matching
      const plotMatch = stmt.match(
        /\\draw(?:\s*\[([^\]]*)\])?\s*plot(?:\s*\[[^\]]*\])?\s*coordinates\s*\{([^}]+)\}/
      );
      if (plotMatch) {
        const optsStyle = this.parseOptions(plotMatch[1] ?? '');
        const rawCoordsStr = plotMatch[2];
        const coordMatchesList = Array.from(rawCoordsStr.matchAll(/\([^)]+\)/g));
        const pts: { x: number; y: number }[] = [];
        for (const m of coordMatchesList) {
          const p = this.parsePoint(m[0], currentShift, namedCoords);
          if (p) pts.push(p);
        }
        for (let i = 0; i < pts.length - 1; i++) {
          parsedElements.push(
            this.makeWire(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, optsStyle)
          );
        }
        continue;
      }

      // 5. Rectangle matching
      const rectMatch = stmt.match(
        /\\(draw|fill)(?:\s*\[([^\]]*)\])?\s*(\([^)]+\))\s*\+\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*rectangle\s*\+\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/
      );
      if (rectMatch) {
        const point = this.parsePoint(rectMatch[3], currentShift, namedCoords);
        if (point) {
          const template = AssetsManager.getCoreComponents().find(t => t.name === 'Rectangle');
          if (!template) {
            throw new Error("Core component 'Rectangle' not found");
          }
          const optsStyle = this.parseOptions(rectMatch[2] ?? '');
          parsedElements.push({
            id: this.createId(),
            type: 'component',
            name: 'Rectangle',
            x: this.toCanvasX(point.x),
            y: this.toCanvasY(point.y),
            label: '',
            rotation: 0,
            style: {
              ...this.defaultStyle,
              color: optsStyle.color ?? this.defaultStyle.color,
              rawColor: optsStyle.rawColor
            },
            svgMarkup: template.svgMarkup,
            tikzCommand: template.tikzCommand
          });
        }
        continue;
      }

      // 6. Generic \draw paths matching (multi-point lines / arrows)
      if (stmt.startsWith('\\draw')) {
        const drawOptsMatch = stmt.match(/^\\draw\s*\[([^\]]*)\]/);
        const optsStyle = this.parseOptions(drawOptsMatch?.[1] ?? '');

        const pointMatchesList = Array.from(stmt.matchAll(/\([^)]+\)/g));
        const pts: { x: number; y: number }[] = [];
        for (const m of pointMatchesList) {
          const p = this.parsePoint(m[0], currentShift, namedCoords);
          if (p) pts.push(p);
        }

        for (let index = 0; index < pts.length - 1; index++) {
          const startPt = pts[index];
          const endPt = pts[index + 1];
          parsedElements.push(this.makeWire(startPt.x, startPt.y, endPt.x, endPt.y, optsStyle));
        }
      }
    }

    return { elements: parsedElements, pictureOptions };
  }

  public generate(elements: EditorElement[], pictureOptions: string): string {
    const neededPackages = new Set<string>();
    const neededLibraries = new Set<string>();

    elements.forEach(elem => {
      if (
        elem.name === 'Arrow' ||
        elem.style.arrowStyle ||
        elem.tikzCommand?.includes('stealth') ||
        elem.tikzCommand?.includes('Triangle')
      ) {
        neededLibraries.add('arrows.meta');
      }
      const regPkg = AssetsManager.getRegistry().find(p =>
        p.components.some(comp => comp.name === elem.name)
      );

      if (regPkg) {
        if (regPkg.name === 'circuitikz') {
          neededPackages.add('circuitikz');
        } else if (regPkg.name === 'tikz-logic') {
          neededLibraries.add('circuits.logic.US');
        } else if (regPkg.name === 'tikz-flowchart') {
          neededLibraries.add('shapes.geometric');
        }
      }
    });

    let preamble = '';
    neededPackages.forEach(pkg => {
      preamble += `\\usepackage{${pkg}}\n`;
    });
    neededLibraries.forEach(lib => {
      preamble += `\\usetikzlibrary{${lib}}\n`;
    });
    if (preamble) {
      preamble += '\n';
    }

    let output = '';
    output += preamble;
    output += `\\begin{tikzpicture}${pictureOptions}\n\n`;

    elements.forEach(elem => {
      const xVal = this.fromCanvasX(elem.x).toFixed(2);
      const yVal = this.fromCanvasY(elem.y).toFixed(2);

      let cmd = elem.tikzCommand;
      if (!cmd) return;

      if (elem.radius !== undefined) {
        cmd = cmd.replace(/circle\s*\([^)]*\)/g, `circle (${elem.radius}pt)`);
      }

      // Handle style options insertion into TikZ command
      const opts: string[] = [];

      if (elem.style.thickness && elem.style.thickness !== 1.0) {
        opts.push(`line width=${elem.style.thickness}pt`);
      }
      if (elem.style.lineStyle === 'dotted') {
        opts.push('dotted');
      } else if (elem.style.lineStyle === 'dashed') {
        opts.push('dashed');
      }
      if (elem.style.rawColor) {
        opts.push(`color=${elem.style.rawColor}`);
      } else if (elem.style.color && elem.style.color !== '#f8e7ad') {
        opts.push(`color=${elem.style.color}`);
      }

      if (opts.length > 0) {
        const optsStr = opts.join(', ');
        if (cmd.startsWith('\\draw[')) {
          cmd = cmd.replace(/\\draw\[/, `\\draw[${optsStr}, `);
        } else if (cmd.startsWith('\\draw')) {
          cmd = cmd.replace(/\\draw/, `\\draw[${optsStr}]`);
        } else if (cmd.startsWith('\\fill[')) {
          cmd = cmd.replace(/\\fill\[/, `\\fill[${optsStr}, `);
        } else if (cmd.startsWith('\\fill')) {
          cmd = cmd.replace(/\\fill/, `\\fill[${optsStr}]`);
        } else if (cmd.startsWith('\\node[')) {
          cmd = cmd.replace(/\\node\[/, `\\node[${optsStr}, `);
        } else if (cmd.startsWith('\\node')) {
          cmd = cmd.replace(/\\node/, `\\node[${optsStr}]`);
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
