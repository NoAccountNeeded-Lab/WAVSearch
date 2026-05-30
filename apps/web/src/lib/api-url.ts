const DEFAULT_PUBLIC_API_URL = 'http://localhost:3003'

export function getServerApiBaseUrl(): string {
  return process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_PUBLIC_API_URL
}

export function getPublicApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_PUBLIC_API_URL
}
