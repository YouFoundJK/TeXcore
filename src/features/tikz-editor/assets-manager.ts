import { ComponentTemplate, TikzPackage } from './types';

export class AssetsManager {
  private static corePackages: ComponentTemplate[] = [
    {
      name: 'Text',
      type: 'text',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-size="22" font-family="serif" font-weight="bold" fill="currentColor">Aa</text></svg>`,
      tikzCommand: '\\node[font={fontSize}] at ({x}, {y}) {{label}};'
    },
    {
      name: 'Wire',
      type: 'wire',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><line x1="5" y1="20" x2="35" y2="20" stroke="currentColor" stroke-width="2.5" /><circle cx="5" cy="20" r="3" fill="currentColor"/><circle cx="35" cy="20" r="3" fill="currentColor"/></svg>`,
      tikzCommand: '\\draw[line width=0.8pt] ({x}, {y}) -- ({x2}, {y2});'
    },
    {
      name: 'End node',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><line x1="5" y1="20" x2="25" y2="20" stroke="currentColor" stroke-width="2" /><circle cx="25" cy="20" r="5" fill="currentColor" /></svg>`,
      tikzCommand: '\\fill ({x}, {y}) circle (2pt) node[anchor=west] {{label}};'
    },
    {
      name: 'Filled node',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><circle cx="20" cy="20" r="5" fill="currentColor" /></svg>`,
      tikzCommand: '\\fill ({x}, {y}) circle (2pt);'
    },
    {
      name: 'Open node',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><circle cx="20" cy="20" r="5" fill="none" stroke="currentColor" stroke-width="2" /></svg>`,
      tikzCommand: '\\draw ({x}, {y}) circle (2pt);'
    },
    {
      name: 'Junction node',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><line x1="5" y1="20" x2="35" y2="20" stroke="currentColor" stroke-width="2" /><line x1="20" y1="20" x2="20" y2="35" stroke="currentColor" stroke-width="2" /><circle cx="20" cy="20" r="5" fill="currentColor" /></svg>`,
      tikzCommand: '\\fill ({x}, {y}) circle (2.5pt);'
    },
    {
      name: 'Dashed Wire',
      type: 'wire',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><line x1="5" y1="20" x2="35" y2="20" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4,3" /><circle cx="5" cy="20" r="3" fill="currentColor"/><circle cx="35" cy="20" r="3" fill="currentColor"/></svg>`,
      tikzCommand: '\\draw[line width=0.8pt, dashed] ({x}, {y}) -- ({x2}, {y2});'
    },
    {
      name: 'Arrow',
      type: 'wire',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><line x1="5" y1="20" x2="30" y2="20" stroke="currentColor" stroke-width="2.5" /><polygon points="30,15 38,20 30,25" fill="currentColor"/><circle cx="5" cy="20" r="3" fill="currentColor"/></svg>`,
      tikzCommand: '\\draw[line width=0.8pt, -stealth] ({x}, {y}) -- ({x2}, {y2});'
    },
    {
      name: 'Circle',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="2" /></svg>`,
      tikzCommand: '\\draw ({x}, {y}) circle (12pt);'
    },
    {
      name: 'Filled Circle',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><circle cx="20" cy="20" r="12" fill="currentColor" /></svg>`,
      tikzCommand: '\\fill ({x}, {y}) circle (12pt);'
    },
    {
      name: 'Rectangle',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><rect x="8" y="8" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" /></svg>`,
      tikzCommand: '\\draw ({x}, {y}) +(-0.4,-0.4) rectangle +(0.4,0.4);'
    },
    {
      name: 'Triangle',
      type: 'component',
      category: 'Basic',
      svgMarkup: `<svg viewBox="0 0 40 40" width="30" height="30" style="color: var(--text-normal);"><polygon points="20,8 8,30 32,30" fill="none" stroke="currentColor" stroke-width="2" /></svg>`,
      tikzCommand: '\\draw ({x}, {y}) +(0,0.4) -- +(-0.4,-0.3) -- +(0.4,-0.3) -- cycle;'
    }
  ];

  private static registry: TikzPackage[] = [
    {
      name: 'circuitikz',
      displayName: 'CircuiTikZ',
      installed: false,
      components: [
        {
          name: 'Resistor (IEC)',
          type: 'wire',
          category: 'Circuits',
          svgMarkup: `<svg viewBox="0 0 50 20" width="40" height="20" style="color: var(--text-normal);"><line x1="0" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="2"/><rect x="10" y="4" width="30" height="12" fill="none" stroke="currentColor" stroke-width="2"/><line x1="40" y1="10" x2="50" y2="10" stroke="currentColor" stroke-width="2"/></svg>`,
          tikzCommand: '\\draw ({x}, {y}) to[R, l={label}] ({x2}, {y2});'
        },
        {
          name: 'American Resistor',
          type: 'wire',
          category: 'Circuits',
          svgMarkup: `<svg viewBox="0 0 50 20" width="40" height="20" style="color: var(--text-normal);"><path d="M0,10 L10,10 L13,3 L19,17 L25,3 L31,17 L37,3 L40,10 L50,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
          tikzCommand: '\\draw ({x}, {y}) to[R, style=american, l={label}] ({x2}, {y2});'
        },
        {
          name: 'Capacitor (IEC)',
          type: 'wire',
          category: 'Circuits',
          svgMarkup: `<svg viewBox="0 0 50 20" width="40" height="20" style="color: var(--text-normal);"><line x1="0" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="2"/><line x1="22" y1="2" x2="22" y2="18" stroke="currentColor" stroke-width="2"/><line x1="28" y1="2" x2="28" y2="18" stroke="currentColor" stroke-width="2"/><line x1="28" y1="10" x2="50" y2="10" stroke="currentColor" stroke-width="2"/></svg>`,
          tikzCommand: '\\draw ({x}, {y}) to[C, l={label}] ({x2}, {y2});'
        },
        {
          name: 'Variable Capacitor',
          type: 'wire',
          category: 'Circuits',
          svgMarkup: `<svg viewBox="0 0 50 20" width="40" height="20" style="color: var(--text-normal);"><line x1="0" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="2"/><line x1="22" y1="2" x2="22" y2="18" stroke="currentColor" stroke-width="2"/><line x1="28" y1="2" x2="28" y2="18" stroke="currentColor" stroke-width="2"/><line x1="28" y1="10" x2="50" y2="10" stroke="currentColor" stroke-width="2"/><line x1="16" y1="16" x2="34" y2="4" stroke="currentColor" stroke-width="1.5"/></svg>`,
          tikzCommand: '\\draw ({x}, {y}) to[vC, l={label}] ({x2}, {y2});'
        },
        {
          name: 'Polarized Capacitor',
          type: 'wire',
          category: 'Circuits',
          svgMarkup: `<svg viewBox="0 0 50 20" width="40" height="20" style="color: var(--text-normal);"><line x1="0" y1="10" x2="22" y2="10" stroke="currentColor" stroke-width="2"/><line x1="22" y1="2" x2="22" y2="18" stroke="currentColor" stroke-width="2"/><path d="M 28 2 Q 31 10 28 18" fill="none" stroke="currentColor" stroke-width="2"/><line x1="29" y1="10" x2="50" y2="10" stroke="currentColor" stroke-width="2"/></svg>`,
          tikzCommand: '\\draw ({x}, {y}) to[pC, l={label}] ({x2}, {y2});'
        },
        {
          name: 'Inductor',
          type: 'wire',
          category: 'Circuits',
          svgMarkup: `<svg viewBox="0 0 50 20" width="40" height="20" style="color: var(--text-normal);"><path d="M0,10 L10,10 Q14,3 18,10 Q22,3 26,10 Q30,3 34,10 Q38,3 40,10 L50,10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
          tikzCommand: '\\draw ({x}, {y}) to[L, l={label}] ({x2}, {y2});'
        }
      ]
    },
    {
      name: 'tikz-logic',
      displayName: 'Logic Gates',
      installed: false,
      components: [
        {
          name: 'AND Gate',
          type: 'component',
          category: 'Logic',
          svgMarkup: `<svg viewBox="0 0 50 30" width="40" height="25" style="color: var(--text-normal);"><path d="M5,5 L20,5 A10,10 0 0 1 30,15 A10,10 0 0 1 20,25 L5,25 Z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="0" y1="10" x2="5" y2="10" stroke="currentColor" stroke-width="2"/><line x1="0" y1="20" x2="5" y2="20" stroke="currentColor" stroke-width="2"/><line x1="30" y1="15" x2="45" y2="15" stroke="currentColor" stroke-width="2"/></svg>`,
          tikzCommand:
            '\\node[and gate US, draw, logic gate inputs=nn] at ({x}, {y}) (and1) {{label}};'
        },
        {
          name: 'OR Gate',
          type: 'component',
          category: 'Logic',
          svgMarkup: `<svg viewBox="0 0 50 30" width="40" height="25" style="color: var(--text-normal);"><path d="M5,5 Q15,15 5,25 Q18,25 30,15 Q18,5 5,5 Z" fill="none" stroke="currentColor" stroke-width="2"/><line x1="0" y1="10" x2="7" y2="10" stroke="currentColor" stroke-width="2"/><line x1="0" y1="20" x2="7" y2="20" stroke="currentColor" stroke-width="2"/><line x1="30" y1="15" x2="45" y2="15" stroke="currentColor" stroke-width="2"/></svg>`,
          tikzCommand:
            '\\node[or gate US, draw, logic gate inputs=nn] at ({x}, {y}) (or1) {{label}};'
        },
        {
          name: 'NOT Gate',
          type: 'component',
          category: 'Logic',
          svgMarkup: `<svg viewBox="0 0 50 30" width="40" height="25" style="color: var(--text-normal);"><polygon points="10,5 30,15 10,25" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="34" cy="15" r="3" fill="none" stroke="currentColor" stroke-width="2"/><line x1="0" y1="15" x2="10" y2="15" stroke="currentColor" stroke-width="2"/><line x1="37" y1="15" x2="47" y2="15" stroke="currentColor" stroke-width="2"/></svg>`,
          tikzCommand: '\\node[not gate US, draw] at ({x}, {y}) (not1) {{label}};'
        }
      ]
    }
  ];

  public static getCoreComponents(): ComponentTemplate[] {
    return [...this.corePackages];
  }

  public static getRegistry(): TikzPackage[] {
    return this.registry;
  }

  public static async installPackage(packageName: string): Promise<boolean> {
    const pkg = this.registry.find(p => p.name === packageName);
    if (!pkg) return false;

    // Simulate package metadata and asset download latency
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Optional: Real fetch for additional dynamic data if required, e.g.
    // try {
    //   const res = await requestUrl(`https://raw.githubusercontent.com/YouFoundJK/ObsiTeXcore/main/assets/packages/${packageName}.json`);
    //   if (res.status === 200) { ... }
    // } catch (e) { console.log("Fetch failed, using fallback"); }

    pkg.installed = true;
    return true;
  }

  public static async uninstallPackage(packageName: string): Promise<boolean> {
    const pkg = this.registry.find(p => p.name === packageName);
    if (!pkg) return false;
    pkg.installed = false;
    return true;
  }
}
