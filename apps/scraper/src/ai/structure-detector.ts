import type { CompletionProvider } from './completion-provider.js'
import type { FieldMapping } from '@wav-search/types'

const SYSTEM_PROMPT = `You are an expert at analyzing HTML structure and deriving CSS selectors for data extraction.
Given a previous field mapping and updated HTML from a WAV (wheelchair accessible vehicle) listing page,
output new CSS selectors that correctly target the same data fields.
Always respond with valid JSON matching the schema provided. No markdown, no explanation — only JSON.`

interface RemapResult {
  mappings: FieldMapping[]
  confidence: number
  notes: string
}

export class StructureDetector {
  constructor(private readonly provider: CompletionProvider) {}

  async remapFields(options: {
    sourceName: string
    previousMappings: FieldMapping[]
    sampleHtml: string
  }): Promise<RemapResult> {
    const userPrompt = `Source: ${options.sourceName}

Previous mappings:
${JSON.stringify(options.previousMappings, null, 2)}

Updated HTML sample (first 8000 chars):
${options.sampleHtml.slice(0, 8000)}

Return JSON: { "mappings": [{ "targetField": string, "selector": string, "attribute": string|null, "transform": string|null }], "confidence": 0-1, "notes": string }`

    const text = await this.provider.complete(SYSTEM_PROMPT, userPrompt)

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch?.[0]) throw new Error('AI provider did not return valid JSON')

    return JSON.parse(jsonMatch[0]) as RemapResult
  }
}
