import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import type { BullMQQueueFactory } from './factory.js'

export function createBullBoardQueues(factory: BullMQQueueFactory): BullMQAdapter[] {
  return factory.getBullMQQueues().map((q) => new BullMQAdapter(q))
}
