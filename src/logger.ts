import pino from 'pino';

const pretty = Boolean(process.stdout.isTTY) && process.env.LOG_PRETTY !== 'false';

export const logger = pino({
  base: undefined,
  level: process.env.LOG_LEVEL ?? 'info',
  messageKey: 'message',
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    error: pino.stdSerializers.errWithCause,
  },
  transport: pretty
    ? {
        target: 'pino-pretty',
        options: {
          messageKey: 'message',
          singleLine: true,
        },
      }
    : undefined,
});

export function ensureError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
