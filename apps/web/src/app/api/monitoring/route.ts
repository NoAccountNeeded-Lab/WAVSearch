import { type NextRequest, NextResponse } from 'next/server'

const ORG_ID_PATTERN = /^\d+$/
const PROJECT_ID_PATTERN = /^\d+$/
const REGION_PATTERN = /^[a-z]{2}$/

function buildEnvelopeUrl(searchParams: URLSearchParams): string | null {
  const orgId = searchParams.get('o')
  const projectId = searchParams.get('p')
  const region = searchParams.get('r')

  if (!orgId || !ORG_ID_PATTERN.test(orgId)) return null
  if (!projectId || !PROJECT_ID_PATTERN.test(projectId)) return null
  if (region !== null && !REGION_PATTERN.test(region)) return null

  const host = region ? `o${orgId}.ingest.${region}.sentry.io` : `o${orgId}.ingest.sentry.io`
  return `https://${host}/api/${projectId}/envelope/?hsts=0`
}

export async function POST(req: NextRequest): Promise<Response> {
  const envelopeUrl = buildEnvelopeUrl(req.nextUrl.searchParams)
  if (!envelopeUrl) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid Sentry tunnel parameters' } },
      { status: 400 },
    )
  }

  const upstream = await fetch(envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': req.headers.get('content-type') ?? 'application/x-sentry-envelope',
    },
    body: await req.text(),
    cache: 'no-store',
  })

  return new Response(null, { status: upstream.status })
}
