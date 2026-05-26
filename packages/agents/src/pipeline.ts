import { randomUUID } from 'node:crypto'
import type { CompletionProvider } from './provider.js'
import type { Role } from './roles.js'
import type { AgentArtifact, AgentRole, AgentRun, AgentStep } from './types.js'

// Roles that can signal REVISION_NEEDED to send the task back to coder.
const REVISION_GATE_ROLES: ReadonlySet<AgentRole> = new Set(['reviewer', 'tester'])

export class AgentPipeline {
  constructor(
    private readonly provider: CompletionProvider,
    private readonly roles: Role[],
    private readonly maxRevisions: number = 3,
  ) {}

  async run(task: string, onStep?: (step: AgentStep) => void): Promise<AgentRun> {
    const run: AgentRun = {
      id: randomUUID(),
      task,
      provider: this.provider.name,
      status: 'success',
      steps: [],
      revision: 0,
      maxRevisions: this.maxRevisions,
      startedAt: new Date().toISOString(),
    }

    // Phase 1: planner and architect run exactly once.
    for (const roleName of ['planner', 'architect'] as const) {
      const step = await this.executeStep(run, roleName)
      run.steps.push(step)
      onStep?.(step)
      if (step.status === 'failed') return this.finish(run, 'failed')
    }

    // Phase 2: coder → reviewer → tester, with revision loop.
    // If reviewer or tester signals REVISION_NEEDED, coder re-runs up to maxRevisions times.
    while (true) {
      const coderStep = await this.executeStep(run, 'coder')
      run.steps.push(coderStep)
      onStep?.(coderStep)
      if (coderStep.status === 'failed') return this.finish(run, 'failed')

      let revisionRequested = false
      for (const roleName of ['reviewer', 'tester'] as const) {
        const step = await this.executeStep(run, roleName)
        run.steps.push(step)
        onStep?.(step)
        if (step.status === 'failed') return this.finish(run, 'failed')

        if (step.requestsRevision) {
          run.revision++
          revisionRequested = true
          break
        }
      }

      if (!revisionRequested) break

      if (run.revision > run.maxRevisions) return this.finish(run, 'needs_revision')
    }

    // Phase 3: docs runs once after coder/reviewer/tester all pass.
    const docsStep = await this.executeStep(run, 'docs')
    run.steps.push(docsStep)
    onStep?.(docsStep)

    return this.finish(run, docsStep.status === 'failed' ? 'failed' : 'success')
  }

  private async executeStep(run: AgentRun, roleName: AgentRole): Promise<AgentStep> {
    const role = this.roles.find(r => r.name === roleName)
    if (!role) throw new Error(`Role not found: ${roleName}`)

    const userPrompt = buildUserPrompt(run.task, buildContext(run.steps), role, run.revision)

    try {
      const content = await this.provider.complete(role.systemPrompt, userPrompt, { maxTokens: 4096 })
      const requestsRevision = REVISION_GATE_ROLES.has(roleName) && detectsRevisionRequest(content)
      const artifact: AgentArtifact = { role: roleName, content, revision: run.revision }
      return { role: roleName, status: 'completed', artifact, requestsRevision }
    } catch (err) {
      return {
        role: roleName,
        status: 'failed',
        requestsRevision: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private finish(run: AgentRun, status: AgentRun['status']): AgentRun {
    run.status = status
    run.completedAt = new Date().toISOString()
    return run
  }
}

function buildContext(steps: AgentStep[]): string {
  return steps
    .filter((s): s is AgentStep & { artifact: AgentArtifact } => s.artifact !== undefined)
    .map(s => {
      const label =
        s.artifact.revision > 0
          ? `${s.role} output (revision ${s.artifact.revision})`
          : `${s.role} output`
      return `# ${label}\n\n${s.artifact.content}`
    })
    .join('\n\n---\n\n')
}

function buildUserPrompt(task: string, context: string, role: Role, revision: number): string {
  const parts: string[] = [`# Task\n\n${task}`]
  if (context) parts.push(`# Prior work\n\n${context}`)
  if (revision > 0)
    parts.push(`# Note\n\nThis is revision ${revision}. Address the reviewer or tester feedback above.`)
  parts.push(`# Your role: ${role.name}\n\n${role.description}\n\nProvide your output now:`)
  return parts.join('\n\n---\n\n')
}

function detectsRevisionRequest(output: string): boolean {
  return /^REVISION_NEEDED:\s*yes\s*$/im.test(output)
}
