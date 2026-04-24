// Ring-buffer logger — mirrors to console so Metro shows output, and keeps
// the last N entries so the in-app debug panel can render them.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number;
  level: LogLevel;
  msg: string;
}

const MAX = 200;
const buf: LogEntry[] = [];
const listeners = new Set<() => void>();

export function log(level: LogLevel, msg: string): void {
  const entry: LogEntry = { t: Date.now(), level, msg };
  buf.push(entry);
  if (buf.length > MAX) buf.shift();
  const line = `[zeed ${level}] ${msg}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  listeners.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

export const logger = {
  debug: (m: string) => log('debug', m),
  info: (m: string) => log('info', m),
  warn: (m: string) => log('warn', m),
  error: (m: string) => log('error', m),
};

export function getLogs(): LogEntry[] {
  return buf.slice();
}

export function clearLogs(): void {
  buf.length = 0;
  listeners.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Wraps a promise with a timeout; rejects with `${label} timed out (Xms)`. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      logger.warn(`${label} timed out after ${ms}ms`);
      reject(new Error(`${label} timed out (${ms}ms)`));
    }, ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}
