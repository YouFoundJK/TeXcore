/**
 * @file changelogData.ts
 * @brief Version changelog data for ObsiTeXcore.
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
