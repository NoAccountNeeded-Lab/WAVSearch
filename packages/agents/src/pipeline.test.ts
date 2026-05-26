import { describe, it, expect, vi } from 'vitest'
import { AgentPipeline } from './pipeline.js'
import { ROLES } from './roles.js'
import type { CompletionProvider } from './provider.js'

// Returns a provider whose response per role is determined by the given map.
function makeProvider(responsesByRole: Record<string, string>): CompletionProvider {
  return {
    name: 'mock',
    complete: vi.fn(async (_system: string, user: string): Promise<string> => {
      const match = user.match(/# Your role: (\w+)/)
      const role = match?.[1]?.toLowerCase() ?? 'unknown'
      return responsesByRole[role] ?? `${role} output`
    }),
  }
}

const PASS = {
  planner: 'Plan: step 1, step 2',
  architect: 'Architecture: files A, B, C',
  coder: 'Code: implementation done',
  reviewer: 'No issues found.\nREVISION_NEEDED: no',
  tester: 'Tests look complete.\nREVISION_NEEDED: no',
  docs: 'No docs changes needed',
}

describe('AgentPipeline — normal success', () => {
  it('runs all six roles in order and returns success', async () => {
    const provider = makeProvider(PASS)
    const run = await new AgentPipeline(provider, ROLES).run('test task')

    expect(run.status).toBe('success')
    expect(run.revision).toBe(0)
    expect(run.steps.map(s => s.role)).toEqual([
      'planner',
      'architect',
      'coder',
      'reviewer',
      'tester',
      'docs',
    ])
    expect(run.steps.every(s => s.status === 'completed')).toBe(true)
    expect(run.steps.every(s => !s.requestsRevision)).toBe(true)
    expect(run.completedAt).toBeDefined()
  })

  it('includes artifacts with content and revision 0', async () => {
    const run = await new AgentPipeline(makeProvider(PASS), ROLES).run('test task')
    for (const step of run.steps) {
      expect(step.artifact?.content).toBeTruthy()
      expect(step.artifact?.revision).toBe(0)
    }
  })
})

describe('AgentPipeline — reviewer requests revision', () => {
  it('re-runs coder then passes on second review', async () => {
    let reviewerCalls = 0
    const provider: CompletionProvider = {
      name: 'mock',
      complete: vi.fn(async (_s: string, u: string) => {
        const role = u.match(/# Your role: (\w+)/)?.[1]?.toLowerCase() ?? ''
        if (role === 'reviewer') {
          reviewerCalls++
          return reviewerCalls === 1
            ? '[CRITICAL] Null pointer on line 5.\nREVISION_NEEDED: yes'
            : 'All issues resolved.\nREVISION_NEEDED: no'
        }
        return PASS[role as keyof typeof PASS] ?? `${role} output`
      }),
    }

    const run = await new AgentPipeline(provider, ROLES, 3).run('test task')

    expect(run.status).toBe('success')
    expect(run.revision).toBe(1)

    const coderSteps = run.steps.filter(s => s.role === 'coder')
    expect(coderSteps).toHaveLength(2)
    expect(coderSteps[0]?.artifact?.revision).toBe(0)
    expect(coderSteps[1]?.artifact?.revision).toBe(1)

    const reviewerSteps = run.steps.filter(s => s.role === 'reviewer')
    expect(reviewerSteps).toHaveLength(2)
    expect(reviewerSteps[0]?.requestsRevision).toBe(true)
    expect(reviewerSteps[1]?.requestsRevision).toBe(false)
  })
})

describe('AgentPipeline — tester requests revision', () => {
  it('re-runs coder then passes on second test', async () => {
    let testerCalls = 0
    const provider: CompletionProvider = {
      name: 'mock',
      complete: vi.fn(async (_s: string, u: string) => {
        const role = u.match(/# Your role: (\w+)/)?.[1]?.toLowerCase() ?? ''
        if (role === 'tester') {
          testerCalls++
          return testerCalls === 1
            ? 'Error path untested.\nREVISION_NEEDED: yes'
            : 'All paths covered.\nREVISION_NEEDED: no'
        }
        return PASS[role as keyof typeof PASS] ?? `${role} output`
      }),
    }

    const run = await new AgentPipeline(provider, ROLES, 3).run('test task')

    expect(run.status).toBe('success')
    expect(run.revision).toBe(1)

    const coderSteps = run.steps.filter(s => s.role === 'coder')
    expect(coderSteps).toHaveLength(2)

    const testerSteps = run.steps.filter(s => s.role === 'tester')
    expect(testerSteps).toHaveLength(2)
    expect(testerSteps[0]?.requestsRevision).toBe(true)
    expect(testerSteps[1]?.requestsRevision).toBe(false)
  })
})

describe('AgentPipeline — max revision limit', () => {
  it('stops with needs_revision when reviewer always rejects', async () => {
    const provider = makeProvider({
      ...PASS,
      reviewer: '[CRITICAL] Still broken.\nREVISION_NEEDED: yes',
    })

    const maxRevisions = 2
    const run = await new AgentPipeline(provider, ROLES, maxRevisions).run('test task')

    expect(run.status).toBe('needs_revision')
    // coder runs once per iteration before the reviewer stops it
    const coderSteps = run.steps.filter(s => s.role === 'coder')
    expect(coderSteps).toHaveLength(maxRevisions + 1)
    // docs must not have run
    expect(run.steps.find(s => s.role === 'docs')).toBeUndefined()
    expect(run.completedAt).toBeDefined()
  })

  it('stops with needs_revision when tester always rejects', async () => {
    const provider = makeProvider({
      ...PASS,
      tester: 'Missing tests.\nREVISION_NEEDED: yes',
    })

    const run = await new AgentPipeline(provider, ROLES, 1).run('test task')

    expect(run.status).toBe('needs_revision')
    expect(run.steps.find(s => s.role === 'docs')).toBeUndefined()
  })
})
