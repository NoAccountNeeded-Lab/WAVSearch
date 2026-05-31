import type { JobContext, JobProgress } from '@wav-search/queue'

export interface CountProgress {
  stage: string
  current: number
  total: number
  message?: string
}

export const noopJobContext: JobContext = {
  async log(message: string): Promise<void> {
    console.log(message)
  },
  async updateProgress(_progress: unknown): Promise<void> {},
}

export async function report(
  context: JobContext | undefined,
  message: string,
  progress?: JobProgress,
): Promise<void> {
  console.log(message)
  await context?.log(message)
  if (progress !== undefined) {
    await context?.updateProgress(progress)
  }
}
