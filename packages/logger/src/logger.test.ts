import { describe, expect, it } from 'vitest'
import pino from 'pino'
import { createLogger, createNoopLogger, createPinoLoggerOptions } from './logger.js'

describe('createPinoLoggerOptions', () => {
  it('binds service and env fields', () => {
    const options = createPinoLoggerOptions({ service: 'api', env: 'production' })

    expect(options.base).toEqual({ service: 'api', env: 'production' })
  })

  it('renames Fastify reqId to requestId', () => {
    const options = createPinoLoggerOptions({ service: 'api', env: 'production' })
    const formatter = options.formatters?.log

    expect(formatter?.({ reqId: 'req-1', route: '/health' })).toEqual({
      requestId: 'req-1',
      route: '/health',
    })
  })

  it('enables pretty transport outside test and production by default', () => {
    const dev = createPinoLoggerOptions({ service: 'api', env: 'development' })
    const prod = createPinoLoggerOptions({ service: 'api', env: 'production' })
    const test = createPinoLoggerOptions({ service: 'api', env: 'test' })

    expect(dev.transport).toBeDefined()
    expect(prod.transport).toBeUndefined()
    expect(test.transport).toBeUndefined()
  })
})

describe('createLogger', () => {
  it('redacts sensitive values from log output', () => {
    const writes: string[] = []
    const logger = pino(createPinoLoggerOptions({ service: 'test', env: 'test' }), {
      write: (line) => writes.push(line),
    })

    logger.info(
      {
        password: 'p',
        token: 't',
        apiKey: 'k',
        authorization: 'a',
        cookie: 'c',
        secret: 's',
        encryptedValue: 'e',
      },
      'redact me',
    )

    expect(writes).toHaveLength(1)
    const parsed = JSON.parse(writes[0] ?? '{}')
    expect(parsed).toMatchObject({
      password: '[Redacted]',
      token: '[Redacted]',
      apiKey: '[Redacted]',
      authorization: '[Redacted]',
      cookie: '[Redacted]',
      secret: '[Redacted]',
      encryptedValue: '[Redacted]',
    })
  })

  it('returns a logger with child context support', () => {
    const logger = createLogger({ service: 'test', env: 'test' })

    expect(typeof logger.child({ requestId: 'req-1' }).info).toBe('function')
  })
})

describe('createNoopLogger', () => {
  it('supports child loggers without writing output', () => {
    const logger = createNoopLogger()

    expect(() => {
      logger.child({ requestId: 'req-1' }).info({ token: 'secret' }, 'message')
    }).not.toThrow()
  })
})
