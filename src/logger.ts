import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatFilestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function formatTimestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// __dirname is src/, so go up one level to reach the project root
const logsDir = resolve(__dirname, '..', 'logs');
mkdirSync(logsDir, { recursive: true });

export const logFile = join(logsDir, `${formatFilestamp()}.log`);

writeFileSync(logFile, `=== AutoClicker started ${new Date().toISOString()} ===\n`);

function writeLine(level: string, args: unknown[]): void {
  const message = args
    .map(a => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  appendFileSync(logFile, `[${formatTimestamp()}] ${level} ${message}\n`);
}

const _log = console.log.bind(console);
const _error = console.error.bind(console);
const _warn = console.warn.bind(console);

// Only print loop-header lines to the console; everything else goes to the file only.
function isLoopHeader(args: unknown[]): boolean {
  return typeof args[0] === 'string' && args[0].startsWith('--- Loop');
}

console.log = (...args: unknown[]) => { if (isLoopHeader(args)) _log(...args); writeLine('LOG', args); };
console.error = (...args: unknown[]) => { _error(...args); writeLine('ERR', args); };
console.warn = (...args: unknown[]) => { writeLine('WRN', args); };
