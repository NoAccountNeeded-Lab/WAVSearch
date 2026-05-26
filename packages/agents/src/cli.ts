#!/usr/bin/env node
import { createProvider } from './factory.js'
import { AgentPipeline } from './pipeline.js'
import { ROLES } from './roles.js'
import { saveRun } from './output.js'
import type { AgentStep } from './types.js'

const task = process.argv.slice(2).join(' ').trim()

if (!task) {
  console.error('Usage: pnpm agents "<task description>"')
  console.error('')
  console.error('Environment:')
  console.error('  AGENTS_PROVIDER   anthropic (default) | ollama | openai | copilot')
  console.error('  AGENTS_MODEL      model override (e.g. claude-opus-4-7)')
  console.error('  AGENTS_MAX_REVISIONS  max coder revision loops (default: 3)')
  process.exit(1)
}

const provider = createProvider()
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
