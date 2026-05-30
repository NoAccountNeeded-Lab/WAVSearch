export interface RedisConnectionOptions {
  host: string
  port: number
  password?: string
  username?: string
  db?: number
  maxRetriesPerRequest: null
}

export function parseRedisUrl(url: string): RedisConnectionOptions {
  const parsed = new URL(url)
  const result: RedisConnectionOptions = {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    db: parseInt(parsed.pathname.slice(1) || '0', 10),
    // Required for BullMQ workers — disables ioredis's default retry-on-timeout
    // behaviour which conflicts with BullMQ's own blocking-pop connection handling.
    maxRetriesPerRequest: null,
  }
  if (parsed.password) result.password = parsed.password
  if (parsed.username) result.username = parsed.username
  return result
}

export function connectionFromEnv(): RedisConnectionOptions {
  const url =
    process.env['QUEUE_REDIS_URL'] ??
    process.env['VALKEY_URL'] ??
    'redis://localhost:6379'
  return parseRedisUrl(url)
}
