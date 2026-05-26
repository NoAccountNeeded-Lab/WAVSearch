import { writeFile, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { AgentArtifact, AgentRun, AgentStep } from './types.js'

const OUTPUT_DIR = '.agents'

export async function saveRun(run: AgentRun): Promise<string> {
  const dir = resolve(OUTPUT_DIR)
  await mkdir(dir, { recursive: true })

  const slug = run.task
    .slice(0, 50)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  const ts = (run.completedAt ?? run.startedAt).slice(0, 19).replace(/[T:]/g, '-')
  const filename = `${ts}-${slug}.md`
  const filepath = join(dir, filename)

  const statusLine = `Status: ${run.status} · Revisions: ${run.revision} · Provider: ${run.provider}`

  const sections = run.steps
    .filter((s): s is AgentStep & { artifact: AgentArtifact } => s.artifact !== undefined)
    .map(s => {
      const label =
        s.artifact.revision > 0
          ? `${capitalize(s.role)} (revision ${s.artifact.revision})`
          : capitalize(s.role)
      const flag = s.requestsRevision ? '\n\n> Revision requested' : ''
      return `## ${label}\n\n${s.artifact.content}${flag}`
    })

  const content = [
    `# ${run.task}`,
    `_${statusLine} · Generated: ${run.completedAt ?? run.startedAt}_`,
    '',
    ...sections,
  ].join('\n\n')

  await writeFile(filepath, content, 'utf8')
  return `${OUTPUT_DIR}/${filename}`
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
