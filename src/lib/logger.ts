const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  debug: (...args: unknown[]) => { if (isDev) console.log(...args); },
  info: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
