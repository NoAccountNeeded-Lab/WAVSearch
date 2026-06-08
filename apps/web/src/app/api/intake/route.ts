import { type NextRequest, NextResponse } from 'next/server'
import type { IntakeFilters } from '@wivwav/types'
import { sanitizeIntakeFilters } from '../../../lib/sanitize-intake'
import { resolveOllamaConfig } from '../../../lib/resolve-ollama-config'

const SYSTEM_PROMPT = `You are a helpful assistant for WAV Search, a site that helps people find wheelchair accessible vehicles (WAVs).

Given a user's plain-language description of their needs, extract structured filter values for the search.

Respond ONLY with a JSON object matching this exact shape — no markdown fences, no extra keys, no commentary:
{
  "conversionType": "rear_entry" | "side_entry" | null,
  "rampType": "in_floor" | "fold_out" | "fold_in" | null,
  "hasLift": true | false | null,
  "handControls": true | false | null,
  "condition": "new" | "used" | "certified_pre_owned" | null,
  "priceMax": number (in US dollars, integer) | null,
  "state": two-letter US state abbreviation | null
}

Rules:
- Use null for any field not mentioned or inferable.
- "stays in wheelchair" / "wheelchair user" / "in-chair" → set conversionType to "rear_entry" unless the user says side entry.
- "transfers to seat" / "can walk a little" / "transfers" → leave conversionType null (both entry types work).
- "lift" / "platform lift" → hasLift: true; do NOT set rampType.
- "ramp" without further detail → rampType: "in_floor" (most common).
- "fold-out ramp" / "fold out" → rampType: "fold_out".
- "hand controls" / "hand operated" → handControls: true.
- Budget like "$30k", "30000", "under $40,000" → priceMax as integer dollars.
- "new" → condition: "new"; "used" → condition: "used"; "certified pre-owned" / "CPO" → condition: "certified_pre_owned".
- State: extract from city name if unambiguous (e.g. "Miami" → "FL"). Use two-letter abbreviation.
- Never invent values. When uncertain, use null.`


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

  const rawBody = body as Record<string, unknown>
  const rawDescription = rawBody?.description
  if (typeof rawDescription !== 'string' || rawDescription.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'description is required' } },
      { status: 400 },
    )
  }

  const description = rawDescription.trim().slice(0, 2000)
  const { model, baseUrl } = await resolveOllamaConfig('ai.intake.model')

  let filters: IntakeFilters = {}
  let rawText = ''
  let ollamaError = ''

  try {
    const ollamaRes = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: SYSTEM_PROMPT,
        prompt: description,
        stream: false,
        options: { num_predict: 512, temperature: 0.2 },
      }),
    })

    if (ollamaRes.ok) {
      const ollamaBody = await ollamaRes.json() as { response: string; done: boolean }
      rawText = ollamaBody.response
      try {
        // Models sometimes wrap JSON in markdown fences — strip them first
        const match = rawText.match(/\{[\s\S]*\}/)
        if (match?.[0]) {
          const parsed: unknown = JSON.parse(match[0])
          filters = sanitizeIntakeFilters(parsed)
        }
      } catch {
        // JSON parse failed — return empty filters
      }
    } else {
      try {
        const errBody = await ollamaRes.json() as { error?: string }
        ollamaError = errBody.error ?? `HTTP ${ollamaRes.status}`
      } catch {
        ollamaError = `HTTP ${ollamaRes.status}`
      }
    }
  } catch (e) {
    const cause = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined
    ollamaError = cause instanceof Error ? cause.message : (e instanceof Error ? e.message : 'Could not connect to Ollama')
  }

  return NextResponse.json({ data: { filters, rawText, ollamaError, _meta: { provider: 'ollama', model, baseUrl } } })
}
