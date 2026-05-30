import type { Worker } from 'bullmq'
import type { WorkerAdapter } from '../types.js'

export class BullMQWorkerAdapter implements WorkerAdapter {
  constructor(private readonly worker: Worker) {}

  async close(): Promise<void> {
    await this.worker.close()
  }
}
