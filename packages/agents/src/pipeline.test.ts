import { describe, it, expect, vi } from 'vitest'
import { AgentPipeline } from './pipeline.js'
import { ROLES } from './roles.js'
import type { CompletionProvider } from './provider.js'
import type { WivWavLogger } from '@wivwav/logger'

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
  accessibility: 'No accessibility issues found.\nREVISION_NEEDED: no',
  tester: 'Tests look complete.\nREVISION_NEEDED: no',
  qa: 'QA ready.\nREVISION_NEEDED: no',
  docs: 'No docs changes needed',
  release: 'Deploy normally. Smoke test health and listing search.',
}

describe('AgentPipeline — normal success', () => {
  it('runs all roles in order and returns success', async () => {
    const provider = makeProvider(PASS)
    const run = await new AgentPipeline(provider, ROLES).run('test task')

    expect(run.status).toBe('success')
    expect(run.revision).toBe(0)
    expect(run.steps.map((s) => s.role)).toEqual([
      'planner',
      'architect',
      'coder',
      'reviewer',
      'accessibility',
      'tester',
      'qa',
      'docs',
      'release',
    ])
    expect(run.steps.every((s) => s.status === 'completed')).toBe(true)
    expect(run.steps.every((s) => !s.requestsRevision)).toBe(true)
    expect(run.completedAt).toBeDefined()
  })

  it('includes artifacts with content and revision 0', async () => {
    const run = await new AgentPipeline(makeProvider(PASS), ROLES).run('test task')
    for (const step of run.steps) {
      expect(step.artifact?.content).toBeTruthy()
      expect(step.artifact?.revision).toBe(0)
    }
  })

  it('passes role and run context to the provider for usage logging', async () => {
    const usageContexts: Array<{ role?: string; runId?: string }> = []
    const provider: CompletionProvider = {
      name: 'mock',
      complete: vi.fn(async (_system, user, options) => {
        usageContexts.push(options?.usageContext ?? {})
        const role = user.match(/# Your role: (\w+)/)?.[1]?.toLowerCase() ?? 'unknown'
        return PASS[role as keyof typeof PASS] ?? `${role} output`
      }),
    }

    const run = await new AgentPipeline(provider, ROLES).run('test task')

    expect(usageContexts).toEqual(
      run.steps.map((step) => ({
        role: step.role,
        runId: run.id,
      })),
    )
  })

  it('logs each completed agent step with provider and duration', async () => {
    const info = vi.fn()
    const child = vi.fn(() => ({
      info,
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      level: 'info',
      child: vi.fn(),
    }))
    const logger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      level: 'info',
      child,
    } as unknown as WivWavLogger

    await new AgentPipeline(makeProvider(PASS), ROLES, 3, logger).run('test task')

    expect(child).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agents.step',
        provider: 'mock',
        role: 'planner',
      }),
    )
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        durationMs: expect.any(Number),
      }),
      'Agent step completed',
    )
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

    const coderSteps = run.steps.filter((s) => s.role === 'coder')
    expect(coderSteps).toHaveLength(2)
    expect(coderSteps[0]?.artifact?.revision).toBe(0)
    expect(coderSteps[1]?.artifact?.revision).toBe(1)

    const reviewerSteps = run.steps.filter((s) => s.role === 'reviewer')
    expect(reviewerSteps).toHaveLength(2)
    expect(reviewerSteps[0]?.requestsRevision).toBe(true)
    expect(reviewerSteps[1]?.requestsRevision).toBe(false)
  })
})

describe('AgentPipeline — accessibility requests revision', () => {
  it('re-runs coder then passes on second accessibility review', async () => {
    let accessibilityCalls = 0
    const provider: CompletionProvider = {
      name: 'mock',
      complete: vi.fn(async (_s: string, u: string) => {
        const role = u.match(/# Your role: (\w+)/)?.[1]?.toLowerCase() ?? ''
        if (role === 'accessibility') {
          accessibilityCalls++
          return accessibilityCalls === 1
            ? '[CRITICAL] Missing label on filter input.\nREVISION_NEEDED: yes'
            : 'Accessibility issue resolved.\nREVISION_NEEDED: no'
        }
        return PASS[role as keyof typeof PASS] ?? `${role} output`
      }),
    }

    const run = await new AgentPipeline(provider, ROLES, 3).run('test task')

    expect(run.status).toBe('success')
    expect(run.revision).toBe(1)
    expect(run.steps.filter((s) => s.role === 'coder')).toHaveLength(2)
    expect(run.steps.filter((s) => s.role === 'accessibility')).toHaveLength(2)
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

    const coderSteps = run.steps.filter((s) => s.role === 'coder')
    expect(coderSteps).toHaveLength(2)

    const testerSteps = run.steps.filter((s) => s.role === 'tester')
    expect(testerSteps).toHaveLength(2)
    expect(testerSteps[0]?.requestsRevision).toBe(true)
    expect(testerSteps[1]?.requestsRevision).toBe(false)
  })
})

describe('AgentPipeline — QA requests revision', () => {
  it('re-runs coder then passes on second QA review', async () => {
    let qaCalls = 0
    const provider: CompletionProvider = {
      name: 'mock',
      complete: vi.fn(async (_s: string, u: string) => {
        const role = u.match(/# Your role: (\w+)/)?.[1]?.toLowerCase() ?? ''
        if (role === 'qa') {
          qaCalls++
          return qaCalls === 1
            ? 'Acceptance criterion not verified.\nREVISION_NEEDED: yes'
            : 'Acceptance criteria verified.\nREVISION_NEEDED: no'
        }
        return PASS[role as keyof typeof PASS] ?? `${role} output`
      }),
    }

    const run = await new AgentPipeline(provider, ROLES, 3).run('test task')

    expect(run.status).toBe('success')
    expect(run.revision).toBe(1)
    expect(run.steps.filter((s) => s.role === 'coder')).toHaveLength(2)
    expect(run.steps.filter((s) => s.role === 'qa')).toHaveLength(2)
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
    const coderSteps = run.steps.filter((s) => s.role === 'coder')
    expect(coderSteps).toHaveLength(maxRevisions + 1)
    // docs and release must not have run
    expect(run.steps.find((s) => s.role === 'docs')).toBeUndefined()
    expect(run.steps.find((s) => s.role === 'release')).toBeUndefined()
    expect(run.completedAt).toBeDefined()
  })

  it('stops with needs_revision when tester always rejects', async () => {
    const provider = makeProvider({
      ...PASS,
      tester: 'Missing tests.\nREVISION_NEEDED: yes',
    })

    const run = await new AgentPipeline(provider, ROLES, 1).run('test task')

    expect(run.status).toBe('needs_revision')
    expect(run.steps.find((s) => s.role === 'docs')).toBeUndefined()
  })
})
