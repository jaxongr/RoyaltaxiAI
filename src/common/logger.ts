import pino, { type Logger } from 'pino';
import { config, isProduction } from './config.js';

const baseOptions = {
  level: config.LOG_LEVEL,
  base: { app: 'royaltaxi-ai' },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger: Logger = isProduction
  ? pino(baseOptions)
  : pino({
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname,app',
          singleLine: false,
        },
      },
    });

export function childLogger(module: string): Logger {
  return logger.child({ module });
}
