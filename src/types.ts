import { Pos } from 'obsidian';

// This is the single, lightweight data structure for our plugin.
export interface EquationBlock {
  // Core properties
  $file: string;
  $type: 'equation';
  $blockId?: string;
  $pos: Pos;
  $position: { start: number; end: number };

  // Equation-specific properties
  $mathText: string;
  $manualTag: string | null;
  $label?: string;
  $display?: string;

  // Properties added during processing
  $printName: string | null;
  $refName: string | null;
  $index?: number;
  $subIndices?: Set<number>; // Add this line
  $supplementAlias?: string;
  $isSupplement?: boolean;
}
