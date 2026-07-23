import { parseYaml } from 'obsidian';

export interface ObsitexConfig {
  eqPrefix?: string;
  eqContinuity?: boolean;
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
      const parsed = parseYaml(rawYaml) as unknown;
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
      const cleanStr = String(prefixVal).split('\n')[0].trim();
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
    } else if (typeof contVal === 'string') {
      const lower = contVal.trim().toLowerCase();
      if (lower === 'false' || lower === 'no' || lower === '0') {
        config.eqContinuity = false;
      } else if (lower === 'true' || lower === 'yes' || lower === '1') {
        config.eqContinuity = true;
      }
    }
  }
}

function parseYamlLines(rawYaml: string, config: ObsitexConfig): void {
  const lines = rawYaml.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.substring(0, colonIdx).trim().toLowerCase();
    const rawVal = trimmed.substring(colonIdx + 1).trim();

    if (key === 'eq-prefix' || key === 'eqprefix' || key === 'prefix') {
      if (rawVal) config.eqPrefix = rawVal;
    } else if (
      key === 'eq-continuity' ||
      key === 'eq-continuous' ||
      key === 'eqcontinuity' ||
      key === 'eqcontinuous' ||
      key === 'continuity' ||
      key === 'continuous'
    ) {
      const lower = rawVal.toLowerCase();
      if (lower === 'false' || lower === 'no' || lower === '0') {
        config.eqContinuity = false;
      } else if (lower === 'true' || lower === 'yes' || lower === '1') {
        config.eqContinuity = true;
      }
    }
  }
}
