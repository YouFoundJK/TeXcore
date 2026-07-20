import { parseYaml } from 'obsidian';

export interface ObsitexConfig {
  eqPrefix?: string;
}

/**
 * Parses all ```obsitex ... ``` code blocks in document content using standard YAML parsing.
 */
export function parseObsitexConfig(content: string): ObsitexConfig {
  const config: ObsitexConfig = {};
  if (!content) return config;

  const codeBlockRegex = /```obsitex\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const rawYaml = match[1];
    if (!rawYaml.trim()) continue;

    try {
      const parsed = parseYaml(rawYaml) as unknown;
      extractConfigFromParsedYaml(parsed, config);
    } catch {
      // If YAML parsing fails, ignore silently
    }
  }

  return config;
}

function extractConfigFromParsedYaml(parsed: unknown, config: ObsitexConfig): void {
  if (!parsed) return;

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      extractConfigFromParsedYaml(item, config);
    }
  } else if (typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    const val = record['eq-prefix'];
    if (typeof val === 'string' || typeof val === 'number') {
      config.eqPrefix = String(val).trim();
    }
  }
}
