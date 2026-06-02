/**
 * Tiny structured logger. Keeps logs JSON-ish for easy ingestion in Vercel
 * log drains. Avoids logging secrets/PII at info level.
 */

function base(level, msg, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ? { meta } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const logger = {
  info: (msg, meta) => base('info', msg, meta),
  warn: (msg, meta) => base('warn', msg, meta),
  error: (msg, meta) => base('error', msg, meta),
  /** Create a child logger that always attaches a context object. */
  child(context) {
    return {
      info: (msg, meta) => base('info', msg, { ...context, ...meta }),
      warn: (msg, meta) => base('warn', msg, { ...context, ...meta }),
      error: (msg, meta) => base('error', msg, { ...context, ...meta }),
    };
  },
};

module.exports = { logger };
