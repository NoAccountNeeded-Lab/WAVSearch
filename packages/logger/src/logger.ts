import pino, { type Logger as PinoLogger, type LoggerOptions as PinoLoggerOptions } from 'pino'

export const STANDARD_LOG_FIELDS = [
  'service',
  'env',
  'requestId',
  'runId',
  'jobId',
  'queue',
  'sourceId',
  'listingId',
  'provider',
  'model',
  'durationMs',
] as const

export type LoggerEnvironment = 'development' | 'test' | 'production' | string

export type LoggerContext = {
  [K in (typeof STANDARD_LOG_FIELDS)[number]]?: string | number
} & Record<string, unknown>

export type LogMethod = PinoLogger['info']

export interface WivWavLogger {
  debug: LogMethod
  info: LogMethod
  warn: LogMethod
  error: LogMethod
  level: string
  child(bindings: LoggerContext): WivWavLogger
}

export interface LoggerOptions {
  service: string
  env: LoggerEnvironment
  level?: string
  pretty?: boolean
}

const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'authorization',
  '*.authorization',
  'headers.authorization',
  'req.headers.authorization',
  'cookie',
  '*.cookie',
  'headers.cookie',
  'req.headers.cookie',
  'secret',
  '*.secret',
  'encryptedValue',
  '*.encryptedValue',
]

export function createPinoLoggerOptions(options: LoggerOptions): PinoLoggerOptions {
  const pretty =
    options.pretty ??
    (process.env['LOG_FORMAT'] !== 'json' &&
      options.env !== 'production' &&
      options.env !== 'test')

  return {
    level: options.level ?? process.env['LOG_LEVEL'] ?? 'info',
    base: {
      service: options.service,
      env: options.env,
    },
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
    formatters: {
      log(object) {
        if ('reqId' in object && !('requestId' in object)) {
          const { reqId, ...rest } = object
          return { ...rest, requestId: reqId }
        }
        return object
      },
    },
    ...(pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
            },
          },
        }
      : {}),
  }
}

export function createLogger(options: LoggerOptions): WivWavLogger {
  return pino(createPinoLoggerOptions(options))
}

export function createNoopLogger(): WivWavLogger {
  const noop = (() => {}) as PinoLogger['info']
  const logger: WivWavLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    level: 'silent',
    child: () => logger,
  }

  return logger
}
