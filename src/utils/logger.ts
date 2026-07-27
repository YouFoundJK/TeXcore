/**
 * Comprehensive Debug Logger for ObsiTeX.
 * Enabled when window.ObsiTeXDebug is true or when debugMode is enabled in plugin settings.
 */

let debugEnabled = true; // Default to true for easy debugging as requested by user

export function setDebugMode(enabled: boolean): void {
  debugEnabled = enabled;
  if (typeof window !== 'undefined') {
    (window as unknown as { ObsiTeXDebug?: boolean }).ObsiTeXDebug = enabled;
  }
}

export function isDebugEnabled(): boolean {
  if (
    typeof window !== 'undefined' &&
    (window as unknown as { ObsiTeXDebug?: boolean }).ObsiTeXDebug !== undefined
  ) {
    return Boolean((window as unknown as { ObsiTeXDebug?: boolean }).ObsiTeXDebug);
  }
  return debugEnabled;
}

export function logDebug(component: string, message: string, data?: unknown): void {
  if (!isDebugEnabled()) return;
  const timestamp = new Date().toISOString().substring(11, 23);
  if (data !== undefined) {
    console.log(`[ObsiTeX ${timestamp}] [${component}] ${message}`, data);
  } else {
    console.log(`[ObsiTeX ${timestamp}] [${component}] ${message}`);
  }
}

export function logWarn(component: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString().substring(11, 23);
  if (data !== undefined) {
    console.warn(`[ObsiTeX ${timestamp}] [${component}] ${message}`, data);
  } else {
    console.warn(`[ObsiTeX ${timestamp}] [${component}] ${message}`);
  }
}

export function logError(component: string, message: string, error?: unknown): void {
  const timestamp = new Date().toISOString().substring(11, 23);
  if (error !== undefined) {
    console.error(`[ObsiTeX ${timestamp}] [${component}] ${message}`, error);
  } else {
    console.error(`[ObsiTeX ${timestamp}] [${component}] ${message}`);
  }
}
