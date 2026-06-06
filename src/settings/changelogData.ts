/**
 * @file changelogData.ts
 * @brief Version changelog data for TeXcore.
 */

export interface ChangelogItem {
  version: string;
  date: string;
  changes: {
    type: 'new' | 'improvement' | 'fix';
    description: string;
  }[];
}

export const changelogData: ChangelogItem[] = [
  {
    version: '0.0.3',
    date: '2026-06-06',
    changes: [
      {
        type: 'new',
        description:
          'Interactive TikZ Editor: Visual diagram builder with snapping, shape tools, and live preview for faster workflow.'
      },
      {
        type: 'improvement',
        description:
          'Smarter TikZ Rendering: More accurate symbols, better font handling, and consistent diagram output across themes.'
      },
      {
        type: 'improvement',
        description:
          'Enhanced Layout & Responsiveness: Improved diagram alignment, spacing, and adaptive rendering for complex TikZ structures.'
      },
      {
        type: 'improvement',
        description:
          'Editing Experience Upgrades: Multi-select editing, lasso selection, and thickness controls for precise diagram customization.'
      },
      {
        type: 'fix',
        description:
          'Rendering Fixes: Resolved symbol mismatches (e.g., Γ, Ω, ⊗) and clipping issues in SVG output.'
      },
      {
        type: 'fix',
        description:
          'Reliable Package Loading: Fixed missing TikZ libraries to ensure diagrams using advanced packages render correctly.'
      }
    ]
  },
  {
    version: '0.0.1',
    date: '2026-06-04',
    changes: [
      {
        type: 'new',
        description: 'Equation Numbering: Automatic theorem environments and equation referencing.'
      },
      {
        type: 'new',
        description:
          'LaTeX Autocomplete: Fast suggestions and search for equations/notes in your vault.'
      },
      {
        type: 'new',
        description:
          'PDF Export: Custom print templates (headers, footers) with background graphics support.'
      },
      {
        type: 'new',
        description: 'TikZJax Rendering: Adapt diagrams dynamically to light and dark themes.'
      },
      {
        type: 'new',
        description:
          'Custom Notes: Assign custom keyboard shortcuts to instantly open preferred notes.'
      },
      {
        type: 'new',
        description:
          'Quick Preview: Inline equation and reference previewing directly in autocomplete lists.'
      }
    ]
  }
];
