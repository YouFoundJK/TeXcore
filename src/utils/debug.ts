type DebugCapablePlugin = {
  settings?: { debug?: boolean };
  app?: {
    vault?: {
      adapter?: {
        basePath?: string;
        append(path: string, data: string): Promise<void>;
        write(path: string, data: string): Promise<void>;
      };
    };
  };
};

let sequence = 0;

function getDefaultLogPath(plugin?: DebugCapablePlugin): string {
  const basePath = plugin?.app?.vault?.adapter?.basePath;
  if (typeof basePath === 'string' && basePath.length > 0) {
    return `${basePath}/latex-referencer-debug.log`;
  }
  return 'latex-referencer-debug.log';
}

function canDebug(plugin?: DebugCapablePlugin): boolean {
  return !!plugin?.settings?.debug;
}

function writeDebugLine(line: string, plugin?: DebugCapablePlugin) {
  try {
    const adapter = plugin?.app?.vault?.adapter;
    if (adapter && typeof adapter.append === 'function') {
      adapter.append('latex-referencer-debug.log', `${line}\n`);
    }
  } catch (_) {
    // Best-effort only. Console logging should still work.
  }
}

/**
 * Structured debug logging helper used in edit/render loops.
 * This is opt-in and gated by plugin.settings.debug.
 */
export function logDebugEvent(
  plugin: DebugCapablePlugin | undefined,
  scope: string,
  event: string,
  data?: Record<string, unknown> | (() => Record<string, unknown>)
) {
  if (!canDebug(plugin)) return;
  sequence += 1;

  const payload = typeof data === 'function' ? data() : (data ?? {});
  const line = JSON.stringify({
    seq: sequence,
    ts: new Date().toISOString(),
    scope,
    event,
    ...payload
  });
  writeDebugLine(line, plugin);
}

export function clearDebugLog(plugin?: DebugCapablePlugin) {
  try {
    const adapter = plugin?.app?.vault?.adapter;
    if (adapter && typeof adapter.write === 'function') {
      adapter.write('latex-referencer-debug.log', '');
    }
  } catch (_) {
    // Ignore write failures.
  }
}

export function getDebugLogPath(plugin?: DebugCapablePlugin): string {
  return getDefaultLogPath(plugin);
}
