import { createLogger, format, transports } from 'winston'

import { env } from './env'

export const logger = createLogger({
  level: env.LOG_LEVEL,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const suffix = stack ? `\n${stack}` : ''
      return `${timestamp} [${level}] ${message}${suffix}`
    }),
  ),
  transports: [new transports.Console()],
})