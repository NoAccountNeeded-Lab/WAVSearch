#!/usr/bin/env node
import { OllamaProvider } from './provider.js'
import { AnthropicProvider } from './anthropic-provider.js'
import type { CompletionProvider } from './provider.js'
import { AgentPipeline } from './pipeline.js'
import { ROLES } from './roles.js'
import { saveRun } from './output.js'
import type { AgentStep } from './types.js'
import { logCompletionUsage } from './usage.js'

const task = process.argv.slice(2).join(' ').trim()

if (!task) {
  console.error('Usage: pnpm agents "<task description>"')
  console.error('')
  console.error('Environment:')
  console.error('  AGENTS_OLLAMA_BASE_URL  Ollama base URL (default: http://localhost:11434)')
  console.error('  AGENTS_MODEL            model name (default: llama3.2)')
  console.error('  AGENTS_MAX_REVISIONS    max coder revision loops (default: 3)')
  console.error('  AGENTS_PROMPT_CACHE     set to 0 to disable Anthropic prompt caching')
  console.error('  CONFIG_API_URL          WAVSearch config API base URL (optional, enables runtime provider config)')
  process.exit(1)
}

async function readConfigValue(key: string): Promise<string | null> {
  const configApiUrl = process.env['CONFIG_API_URL']
  if (!configApiUrl) return null
  try {
    const res = await fetch(`${configApiUrl}/admin/config/${encodeURIComponent(key)}`)
    if (!res.ok) return null
    const body = (await res.json()) as { data: { value: unknown } }
    return typeof body.data?.value === 'string' ? body.data.value : null
  } catch {
    return null
  }
}

async function readSecretValue(key: string): Promise<string | null> {
  const configApiUrl = process.env['CONFIG_API_URL']
  if (!configApiUrl) return null
  try {
    const res = await fetch(`${configApiUrl}/admin/config/${encodeURIComponent(key)}/decrypt`)
    if (!res.ok) return null
    const body = (await res.json()) as { data: { value: unknown } }
    return typeof body.data?.value === 'string' ? body.data.value : null
  } catch {
    return null
  }
}

async function resolveProvider(): Promise<CompletionProvider> {
  const configProvider = await readConfigValue('ai.agents.provider')
  const configModel = await readConfigValue('ai.agents.model')
  const configApiKeyId = await readConfigValue('ai.agents.apiKeyId')
  const provider = configProvider ?? 'ollama'

  if (provider === 'anthropic') {
    const apiKey = configApiKeyId ? await readSecretValue(configApiKeyId) : null
    if (!apiKey) {
      console.warn('[agents] Provider set to anthropic but no API key found in config DB (set ai.agents.apiKeyId via /ops/ai) — falling back to ollama')
    } else {
      return new AnthropicProvider({
        apiKey,
        ...(configModel ? { model: configModel } : {}),
        promptCaching: process.env['AGENTS_PROMPT_CACHE'] !== '0',
        usageLogger: logCompletionUsage,
      })
    }
  }

  const ollamaBaseUrl = process.env['AGENTS_OLLAMA_BASE_URL']
  const ollamaModel = configModel ?? process.env['AGENTS_MODEL']
  return new OllamaProvider({
    ...(ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : {}),
    ...(ollamaModel ? { model: ollamaModel } : {}),
    usageLogger: logCompletionUsage,
  })
}

const provider = await resolveProvider()
const maxRevisions = Number(process.env['AGENTS_MAX_REVISIONS'] ?? 3)

console.log(`\nProvider: ${provider.name}`)
console.log(`Task: ${task}`)
console.log(`Max revisions: ${maxRevisions}`)
console.log('\n' + '='.repeat(60))

const pipeline = new AgentPipeline(provider, ROLES, maxRevisions)

const run = await pipeline.run(task, (step: AgentStep) => {
  const label =
    step.artifact && step.artifact.revision > 0
      ? `${step.role.toUpperCase()} (revision ${step.artifact.revision})`
      : step.role.toUpperCase()

  console.log(`\n## ${label}\n`)

  if (step.status === 'failed') {
    console.error(`[FAILED] ${step.error ?? 'unknown error'}`)
  } else if (step.artifact) {
    console.log(step.artifact.content)
    if (step.requestsRevision) console.log('\n> Revision requested — sending back to coder')
  }

  console.log('\n' + '─'.repeat(60))
})

console.log(`\nStatus: ${run.status.toUpperCase()}`)
if (run.revision > 0) console.log(`Revisions: ${run.revision}`)

const savedPath = await saveRun(run)
console.log(`Saved: ${savedPath}\n`)
