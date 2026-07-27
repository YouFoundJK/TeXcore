import { parseYaml } from 'obsidian';

export interface ObsitexConfig {
  eqPrefix?: string;
  eqContinuity?: boolean;
  supplements?: Record<string, string>;
}

export interface PositionalObsitexConfig {
  from: number;
  to: number;
  config: ObsitexConfig;
}

/**
 * Parses all ```obsitex ... ``` code blocks in document content along with their positions.
 */
export function parsePositionalObsitexConfigs(content: string): PositionalObsitexConfig[] {
  const configs: PositionalObsitexConfig[] = [];
  if (!content) return configs;

  const codeBlockRegex = /```obsitex\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const from = match.index;
    const to = match.index + match[0].length;
    const rawYaml = match[1];
    if (!rawYaml.trim()) continue;

    const config: ObsitexConfig = {};
    try {
      // Preprocess WikiLinks [[Note]] -> "Note" so parseYaml receives valid scalar strings instead of collection keys
      const preprocessedYaml = rawYaml.replace(/\[\[([^\]]+)\]\]/g, '"$1"');
      const parsed = parseYaml(preprocessedYaml) as unknown;
      extractConfigFromParsedYaml(parsed, config);
    } catch {
      // If YAML parsing fails, ignore silently
    }
    // Also parse line-by-line to handle markdown list formats robustly
    parseYamlLines(rawYaml, config);

    configs.push({ from, to, config });
  }

  return configs;
}

/**
 * Gets the merged ObsitexConfig effective at a specific character offset in the document.
 * If position is omitted, returns the merged config up to the end of the document.
 */
export function getObsitexConfigAtPosition(content: string, position?: number): ObsitexConfig {
  const configs = parsePositionalObsitexConfigs(content);
  const cutoff = position ?? (content ? content.length : 0);
  const merged: ObsitexConfig = {};

  for (const item of configs) {
    if (item.from <= cutoff) {
      if (item.config.eqPrefix !== undefined) {
        merged.eqPrefix = item.config.eqPrefix;
      }
      if (item.config.eqContinuity !== undefined) {
        merged.eqContinuity = item.config.eqContinuity;
      }
      if (item.config.supplements) {
        merged.supplements = { ...merged.supplements, ...item.config.supplements };
      }
    } else {
      break;
    }
  }

  return merged;
}

/**
 * Parses ```obsitex ... ``` code blocks up to a given position (or full content if omitted).
 */
export function parseObsitexConfig(content: string, position?: number): ObsitexConfig {
  return getObsitexConfigAtPosition(content, position);
}

function cleanYamlVal(rawVal: string): string {
  if (!rawVal) return '';
  let cleaned = rawVal.split('\n')[0].split('#')[0].trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }
  return cleaned;
}

function cleanNoteLink(raw: string): string {
  let cleaned = cleanYamlVal(raw);
  while (cleaned.startsWith('[')) cleaned = cleaned.substring(1).trim();
  while (cleaned.endsWith(']')) cleaned = cleaned.substring(0, cleaned.length - 1).trim();
  if (cleaned.includes('|')) {
    cleaned = cleaned.split('|')[0].trim();
  }
  return cleaned.trim();
}

function parseSupplementItem(itemStr: string, config: ObsitexConfig): void {
  const trimmed = itemStr.trim();
  if (!trimmed) return;
  const colonIdx = trimmed.indexOf(':');
  let rawKey = trimmed;
  let alias = '';
  if (colonIdx !== -1) {
    rawKey = trimmed.substring(0, colonIdx);
    alias = cleanYamlVal(trimmed.substring(colonIdx + 1));
  }
  const noteKey = cleanNoteLink(rawKey);
  if (noteKey) {
    config.supplements = config.supplements || {};
    config.supplements[noteKey] = alias;
  }
}

function processSupplementYamlValue(val: unknown, config: ObsitexConfig): void {
  if (!val) return;

  if (Array.isArray(val)) {
    for (const item of val) {
      processSupplementYamlValue(item, config);
    }
  } else if (typeof val === 'string') {
    parseSupplementItem(val, config);
  } else if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const noteKey = cleanNoteLink(k);
      if (noteKey) {
        config.supplements = config.supplements || {};
        let aliasVal = '';
        if (typeof v === 'string') {
          aliasVal = cleanYamlVal(v);
        } else if (typeof v === 'number') {
          aliasVal = String(v);
        } else if (v && typeof v === 'object') {
          // If v is object or nested array, extract if non-empty
          processSupplementYamlValue(v, config);
          continue;
        }
        config.supplements[noteKey] = aliasVal;
      }
    }
  }
}

function extractConfigFromParsedYaml(parsed: unknown, config: ObsitexConfig): void {
  if (!parsed) return;

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      extractConfigFromParsedYaml(item, config);
    }
  } else if (typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;

    const prefixVal = record['eq-prefix'] ?? record['eqPrefix'] ?? record['prefix'];
    if (typeof prefixVal === 'string' || typeof prefixVal === 'number') {
      const cleanStr = cleanYamlVal(String(prefixVal));
      if (cleanStr) {
        config.eqPrefix = cleanStr;
      }
    }

    const contVal =
      record['eq-continuity'] ??
      record['eq-continuous'] ??
      record['eqContinuity'] ??
      record['eqContinuous'] ??
      record['continuity'] ??
      record['continuous'];

    if (typeof contVal === 'boolean') {
      config.eqContinuity = contVal;
    } else if (typeof contVal === 'string' || typeof contVal === 'number') {
      const lower = cleanYamlVal(String(contVal)).toLowerCase();
      if (lower === 'false' || lower === 'no' || lower === '0') {
        config.eqContinuity = false;
      } else if (lower === 'true' || lower === 'yes' || lower === '1') {
        config.eqContinuity = true;
      }
    }

    const suppVal = record['supplements'];
    if (suppVal !== undefined && suppVal !== null) {
      processSupplementYamlValue(suppVal, config);
    }
  }
}

function parseYamlLines(rawYaml: string, config: ObsitexConfig): void {
  const lines = rawYaml.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Direct match for [[note]]: alias or [[note]]
    const wikiMatch = line.match(
      /\s*(?:[-*]\s*)?\[\[([^\]|]+)(?:\|[^\]]+)?\]\](?:\s*:\s*([\w.-]+))?/
    );
    if (wikiMatch && wikiMatch[1]) {
      const notePath = wikiMatch[1].trim();
      const alias = wikiMatch[2] ? cleanYamlVal(wikiMatch[2]) : '';
      if (notePath) {
        config.supplements = config.supplements || {};
        config.supplements[notePath] = alias;
      }
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.substring(0, colonIdx).trim().toLowerCase();
    const rawVal = trimmed.substring(colonIdx + 1).trim();
    const cleanedVal = cleanYamlVal(rawVal);

    if (key === 'eq-prefix' || key === 'eqprefix' || key === 'prefix') {
      if (cleanedVal) config.eqPrefix = cleanedVal;
    } else if (
      key === 'eq-continuity' ||
      key === 'eq-continuous' ||
      key === 'eqcontinuity' ||
      key === 'eqcontinuous' ||
      key === 'continuity' ||
      key === 'continuous'
    ) {
      const lower = cleanedVal.toLowerCase();
      if (lower === 'false' || lower === 'no' || lower === '0') {
        config.eqContinuity = false;
      } else if (lower === 'true' || lower === 'yes' || lower === '1') {
        config.eqContinuity = true;
      }
    }
  }
}
