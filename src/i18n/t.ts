import en from './en.json';

export function t(key: string, vars?: Record<string, string>): string {
  const parts = key.split('.');
  let current: unknown = en;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  if (typeof current !== 'string') {
    return key;
  }
  let result: string = current;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return result;
}
