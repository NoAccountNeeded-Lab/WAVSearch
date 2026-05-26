import Anthropic from '@anthropic-ai/sdk'
import type { FieldMapping } from '@wav-search/types'

interface RemapResult {
  mappings: FieldMapping[]
  confidence: number
  notes: string
}

export class StructureDetector {
  private readonly client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async remapFields(options: {
    sourceName: string
    previousMappings: FieldMapping[]
    sampleHtml: string
  }): Promise<RemapResult> {
    const message = await this.client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: `You are an expert at analyzing HTML structure and deriving CSS selectors for data extraction.
Given a previous field mapping and updated HTML from a WAV (wheelchair accessible vehicle) listing page,
output new CSS selectors that correctly target the same data fields.
Always respond with valid JSON matching the schema provided.`,
      messages: [
        {
          role: 'user',
          content: `Source: ${options.sourceName}

Previous mappings:
${JSON.stringify(options.previousMappings, null, 2)}

Updated HTML sample (first 8000 chars):
${options.sampleHtml.slice(0, 8000)}

Return JSON: { "mappings": [{ "targetField": string, "selector": string, "attribute": string|null, "transform": string|null }], "confidence": 0-1, "notes": string }`,
        },
      ],
    })

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch?.[0]) throw new Error('AI did not return valid JSON')

    return JSON.parse(jsonMatch[0]) as RemapResult
  }
}
