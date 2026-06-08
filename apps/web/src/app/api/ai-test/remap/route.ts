import { type NextRequest, NextResponse } from 'next/server'
import { resolveOllamaConfig } from '../../../../lib/resolve-ollama-config'

// Exact system prompt used by apps/scraper/src/ai/structure-detector.ts
const SYSTEM_PROMPT = `You are an expert at analyzing HTML structure and deriving CSS selectors for data extraction.
Given a previous field mapping and updated HTML from a WAV (wheelchair accessible vehicle) listing page,
output new CSS selectors that correctly target the same data fields.
Always respond with valid JSON matching the schema provided. No markdown, no explanation — only JSON.`

interface FieldMapping {
  targetField: string
  selector: string
  attribute: string | null
  transform: string | null
}

interface RemapResult {
  mappings: FieldMapping[]
  confidence: number
  notes: string
}

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

  const raw = body as Record<string, unknown>
  const sourceName = typeof raw.sourceName === 'string' ? raw.sourceName.trim() : 'Test Source'
  const html = raw.html
  const previousMappings = raw.previousMappings

  if (typeof html !== 'string' || html.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'html is required' } },
      { status: 400 },
    )
  }

  const { model, baseUrl } = await resolveOllamaConfig('ai.scraper.remap.model')

  const userPrompt = `Source: ${sourceName}

Previous mappings:
${JSON.stringify(previousMappings ?? [], null, 2)}

Updated HTML sample (first 8000 chars):
${html.trim().slice(0, 8000)}

Return JSON: { "mappings": [{ "targetField": string, "selector": string, "attribute": string|null, "transform": string|null }], "confidence": 0-1, "notes": string }`

  let result: RemapResult = { mappings: [], confidence: 0, notes: '' }
  let rawText = ''
  let ollamaError = ''

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        stream: false,
        options: { num_predict: 1024, temperature: 0.1 },
      }),
    })

    if (res.ok) {
      const data = await res.json() as { response: string; done: boolean }
      rawText = data.response
      try {
        const match = rawText.match(/\{[\s\S]*\}/)
        if (match?.[0]) {
          result = JSON.parse(match[0]) as RemapResult
        }
      } catch {
        // JSON parse failed — return raw text
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
      ...result,
      rawText,
      ollamaError,
      _meta: { provider: 'ollama', model, baseUrl },
    },
  })
}
