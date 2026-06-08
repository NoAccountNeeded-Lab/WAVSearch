import { type NextRequest, NextResponse } from 'next/server'
import { resolveOllamaConfig } from '../../../../lib/resolve-ollama-config'

const SYSTEM_PROMPT = `You analyze HTML from WAV (wheelchair accessible vehicle) dealer listing pages.

Given an HTML snippet, identify every data field visible on the page that is relevant to a WAV listing.
For each field, suggest a CSS selector that would reliably extract it.

Respond ONLY with a JSON object — no markdown, no commentary:
{
  "fields": [
    { "name": string, "selector": string, "sample": string | null }
  ]
}

Field names to look for: title, price, year, make, model, trim, mileage, vin, condition, conversionType, rampType, hasLift, handControls, stockNumber, location, imageUrl, description.
Only include fields that are actually present in the HTML.`

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

  const html = (body as Record<string, unknown>)?.html
  if (typeof html !== 'string' || html.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'html is required' } },
      { status: 400 },
    )
  }

  const { model, baseUrl } = await resolveOllamaConfig('ai.scraper.structure.model')

  let fields: Array<{ name: string; selector: string; sample: string | null }> = []
  let rawText = ''
  let ollamaError = ''

  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        prompt: `HTML snippet:\n${html.trim().slice(0, 8000)}`,
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
          const parsed = JSON.parse(match[0]) as { fields?: unknown }
          if (Array.isArray(parsed.fields)) {
            fields = parsed.fields as typeof fields
          }
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
      fields,
      rawText,
      ollamaError,
      _meta: { provider: 'ollama', model, baseUrl },
    },
  })
}
