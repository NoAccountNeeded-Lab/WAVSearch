import { type NextRequest, NextResponse } from 'next/server'
import type { IntakeFilters } from '@wivwav/types'
import { sanitizeIntakeFilters } from '../../../lib/sanitize-intake'
import { getServerApiBaseUrl } from '../../../lib/api-url'

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

interface IntakeProviderConfig {
  provider: string
  model: string
  apiKey: string | null
}

async function resolveIntakeProvider(): Promise<IntakeProviderConfig> {
  const apiBase = getServerApiBaseUrl()
  const defaultModel = 'claude-haiku-4-5-20251001'

  try {
    const [providerRes, modelRes, apiKeyIdRes] = await Promise.all([
      fetch(`${apiBase}/admin/config/ai.intake.provider`, { cache: 'no-store' }),
      fetch(`${apiBase}/admin/config/ai.intake.model`, { cache: 'no-store' }),
      fetch(`${apiBase}/admin/config/ai.intake.apiKeyId`, { cache: 'no-store' }),
    ])

    const providerBody = providerRes.ok ? (await providerRes.json() as { data: { value: unknown } }) : null
    const modelBody = modelRes.ok ? (await modelRes.json() as { data: { value: unknown } }) : null
    const apiKeyIdBody = apiKeyIdRes.ok ? (await apiKeyIdRes.json() as { data: { value: unknown } }) : null

    const provider = typeof providerBody?.data?.value === 'string' ? providerBody.data.value : 'anthropic'
    const model = typeof modelBody?.data?.value === 'string' ? modelBody.data.value : defaultModel
    const apiKeyId = typeof apiKeyIdBody?.data?.value === 'string' ? apiKeyIdBody.data.value : null

    let apiKey: string | null = null
    if (apiKeyId) {
      const internalSecret = process.env.INTERNAL_API_SECRET
      const keyRes = await fetch(`${apiBase}/admin/config/${encodeURIComponent(apiKeyId)}/decrypt`, {
        cache: 'no-store',
        headers: internalSecret ? { Authorization: `Bearer ${internalSecret}` } : {},
      })
      if (keyRes.ok) {
        const keyBody = (await keyRes.json()) as { data: { value: unknown } }
        if (typeof keyBody.data?.value === 'string') apiKey = keyBody.data.value
      }
    }

    return { provider, model, apiKey }
  } catch {
    return { provider: 'anthropic', model: defaultModel, apiKey: null }
  }
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

  const rawBody = body as Record<string, unknown>
  const rawDescription = rawBody?.description
  if (typeof rawDescription !== 'string' || rawDescription.trim().length === 0) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'description is required' } },
      { status: 400 },
    )
  }

  const description = rawDescription.trim().slice(0, 2000)

  const { provider, model, apiKey } = await resolveIntakeProvider()

  if (!apiKey || provider !== 'anthropic') {
    // No API key or non-Anthropic provider configured — return empty filters so caller redirects to /filters
    return NextResponse.json({ data: { filters: {} } })
  }

  let filters: IntakeFilters = {}

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }],
      }),
    })

    if (anthropicRes.ok) {
      const anthropicBody = await anthropicRes.json() as {
        content: Array<{ type: string; text: string }>
      }
      const text = anthropicBody.content?.[0]?.text ?? ''
      try {
        const parsed: unknown = JSON.parse(text)
        filters = sanitizeIntakeFilters(parsed)
      } catch {
        // JSON parse failed — return empty filters
      }
    }
  } catch {
    // Network or API error — return empty filters so caller falls back gracefully
  }

  return NextResponse.json({ data: { filters } })
}
