import { type NextRequest, NextResponse } from 'next/server'
import { resolveOllamaConfig } from '../../../../lib/resolve-ollama-config'

// Planner role system prompt from packages/agents/src/roles.ts
const SYSTEM_PROMPT = `You are a senior engineer planning a coding task for the WAV Search monorepo.

WAV Search is a TypeScript monorepo (pnpm workspaces + Turborepo) for a wheelchair accessible vehicle listing aggregator.
Apps: apps/api (Fastify REST API, Node 24), apps/web (Next.js 15 App Router), apps/scraper (Playwright + AI engine).
Packages: packages/types (shared TypeScript interfaces), packages/db (Prisma client, PostgreSQL 17), packages/config (shared tsconfig/ESLint), packages/queue (BullMQ job queue abstraction), packages/agents (AI completion provider pipeline — Ollama).
Infrastructure: PostgreSQL 17, Meilisearch v1.12 (faceted search), Valkey 8 (Redis-compatible cache).
Principles: single responsibility (small files, one purpose), swappable dependencies behind interfaces, API-first, mobile-first, WCAG 2.1 AA, MIT/Apache/BSD licenses only.
API responses: { data: T } for success, { error: { code, message } } for errors.
WAV-specific listing fields: conversionType, rampType, hasLift, floorLoweringInches, handControls, transferSeat, wheelchairCapacity.

Given a task, output:
1. Numbered implementation steps — be specific about which files to create or modify
2. Risks or edge cases to watch for
3. Any steps that can be done in parallel

Be concise. No padding. No code yet.`

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } },
      { status: 400 },
    )
  }

  const task = (body as Record<string, unknown>)?.task
  if (typeof task !== 'string' || task.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'task is required' } },
      { status: 400 },
    )
  }

  const { model, baseUrl } = await resolveOllamaConfig('ai.agents.model')

  let response = ''
  let ollamaError = ''

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        prompt: task.trim().slice(0, 4000),
        stream: false,
        options: { num_predict: 2048, temperature: 0.3 },
      }),
    })

    if (res.ok) {
      const data = await res.json() as { response?: string; error?: string; done?: boolean }
      if (data.error) {
        ollamaError = data.error
      } else {
        response = data.response ?? ''
      }
    } else {
      try {
        const errBody = await res.json() as { error?: string }
        ollamaError = errBody.error ?? `HTTP ${res.status}`
      } catch {
        ollamaError = `HTTP ${res.status}`
      }
    }
  } catch (e) {
    const cause = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined
    ollamaError = cause instanceof Error ? cause.message : (e instanceof Error ? e.message : 'Could not connect to Ollama')
  }

  return NextResponse.json({
    data: {
      response,
      ollamaError,
      _meta: { provider: 'ollama', model, baseUrl },
    },
  })
}
