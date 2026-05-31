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

export const adminAiRoutes: FastifyPluginAsync<AdminAiPluginOptions> = async (
  app,
  { db, ollamaBaseUrl },
) => {
  // GET /admin/ai/status — Ollama health + installed models + sources flagged for remapping
  app.get('/status', async (_req, reply) => {
    let available = false
    let models: string[] = []
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

    const sourcesNeedingRemap = await db.source.findMany({
      where: { status: 'needs_remapping' },
      select: { id: true, name: true, errorMessage: true, lastScrapedAt: true },
      orderBy: { name: 'asc' },
    })

    return reply.send({
      data: {
        ollama: { available, baseUrl: ollamaBaseUrl, models },
        sourcesNeedingRemap,
      },
    })
  })
}
