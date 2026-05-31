import type { FastifyPluginAsync } from 'fastify'
import type { PrismaClient } from '@wav-search/db'

interface AdminAiPluginOptions {
  db: PrismaClient
  ollamaBaseUrl: string
}

interface OllamaModel {
  name: string
}

interface OllamaTagsResponse {
  models: OllamaModel[]
}

interface OllamaRunningModel {
  name?: string
  model?: string
  size?: number
  size_vram?: number
  processor?: string
  context?: number
  expires_at?: string
}

interface OllamaPsResponse {
  models?: OllamaRunningModel[]
}

export const adminAiRoutes: FastifyPluginAsync<AdminAiPluginOptions> = async (
  app,
  { db, ollamaBaseUrl },
) => {
  // GET /admin/ai/status — Ollama health, loaded models, installed models, and sources flagged for remapping
  app.get('/status', async (_req, reply) => {
    let available = false
    let models: string[] = []
    let runningModels: Array<{
      name: string
      sizeBytes: number | null
      vramBytes: number | null
      processor: string | null
      contextWindow: number | null
      expiresAt: string | null
    }> = []

    try {
      const res = await fetch(`${ollamaBaseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        available = true
        const data = (await res.json()) as OllamaTagsResponse
        models = (data.models ?? []).map(m => m.name)
      }
    } catch {
      // Ollama unreachable — leave defaults
    }

    if (available) {
      try {
        const res = await fetch(`${ollamaBaseUrl}/api/ps`, {
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) {
          const data = (await res.json()) as OllamaPsResponse
          runningModels = (data.models ?? []).map(m => ({
            name: m.model ?? m.name ?? 'unknown',
            sizeBytes: typeof m.size === 'number' ? m.size : null,
            vramBytes: typeof m.size_vram === 'number' ? m.size_vram : null,
            processor: m.processor ?? null,
            contextWindow: typeof m.context === 'number' ? m.context : null,
            expiresAt: m.expires_at ?? null,
          }))
        }
      } catch {
        // Runtime model stats are best-effort; availability comes from /api/tags.
      }
    }

    const sourcesNeedingRemap = await db.source.findMany({
      where: { status: 'needs_remapping' },
      select: { id: true, name: true, errorMessage: true, lastScrapedAt: true },
      orderBy: { name: 'asc' },
    })

    return reply.send({
      data: {
        ollama: { available, baseUrl: ollamaBaseUrl, models, runningModels },
        sourcesNeedingRemap,
      },
    })
  })
}
