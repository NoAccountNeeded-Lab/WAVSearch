export interface CatalogModel {
  name: string
  label: string
  description: string
  paramBillions: number
  sizeGB: number
}

/**
 * Curated list of Ollama-compatible models.
 * Names match what `ollama pull <name>` expects.
 */
export const MODEL_CATALOG: readonly CatalogModel[] = [
  // ── Llama 3 family ────────────────────────────────────────
  {
    name: 'llama3.2',
    label: 'Llama 3.2 (3B)',
    description: 'Meta\'s fast 3B model. Excellent at instruction following and structured text extraction — the best all-round default for most WAV Search tasks.',
    paramBillions: 3,
    sizeGB: 2.0,
  },
  {
    name: 'llama3.2:1b',
    label: 'Llama 3.2 (1B)',
    description: 'The smallest Llama 3.2 variant. Ultra-low latency and minimal memory, at the cost of some accuracy on complex prompts.',
    paramBillions: 1,
    sizeGB: 0.6,
  },
  {
    name: 'llama3.1:8b',
    label: 'Llama 3.1 (8B)',
    description: 'Larger Llama 3.1 with stronger multi-step reasoning. Good for agent pipelines that require planning and conditional logic.',
    paramBillions: 8,
    sizeGB: 4.7,
  },
  {
    name: 'llama3.1:70b',
    label: 'Llama 3.1 (70B)',
    description: 'Meta\'s largest public model. Near-GPT-4 quality but requires 48 GB+ VRAM. Only practical on dedicated GPU hardware.',
    paramBillions: 70,
    sizeGB: 40.0,
  },

  // ── Mistral family ─────────────────────────────────────────
  {
    name: 'mistral',
    label: 'Mistral 7B',
    description: 'Mistral AI\'s flagship open model. Fast, well-tested in production, and handles JSON extraction reliably.',
    paramBillions: 7,
    sizeGB: 4.1,
  },
  {
    name: 'mistral-nemo',
    label: 'Mistral Nemo (12B)',
    description: 'Mistral\'s larger 12B model, jointly built with NVIDIA. Better reasoning than 7B with a 128k context window.',
    paramBillions: 12,
    sizeGB: 7.1,
  },

  // ── Gemma family ───────────────────────────────────────────
  {
    name: 'gemma2:2b',
    label: 'Gemma 2 (2B)',
    description: 'Google\'s 2B model that punches above its weight. Great for lightweight structure detection where speed matters more than depth.',
    paramBillions: 2,
    sizeGB: 1.6,
  },
  {
    name: 'gemma2:9b',
    label: 'Gemma 2 (9B)',
    description: 'Larger Gemma 2 with strong general-purpose performance. A good step up when 2B accuracy isn\'t quite enough.',
    paramBillions: 9,
    sizeGB: 5.4,
  },

  // ── Qwen family ────────────────────────────────────────────
  {
    name: 'qwen2.5:7b',
    label: 'Qwen 2.5 (7B)',
    description: 'Alibaba\'s 7B model with strong instruction following and multilingual support. Solid for extraction tasks.',
    paramBillions: 7,
    sizeGB: 4.4,
  },
  {
    name: 'qwen2.5-coder:7b',
    label: 'Qwen 2.5 Coder (7B)',
    description: 'Qwen 2.5 tuned for code and structured output. Reliably generates valid CSS selectors for the scraper field-remap job.',
    paramBillions: 7,
    sizeGB: 4.4,
  },

  // ── Phi family ─────────────────────────────────────────────
  {
    name: 'phi3.5',
    label: 'Phi 3.5 (3.8B)',
    description: 'Microsoft\'s efficient 3.8B model. Strong for structured tasks relative to its size; good memory-constrained alternative to llama3.2.',
    paramBillions: 3.8,
    sizeGB: 2.2,
  },
  {
    name: 'phi3:medium',
    label: 'Phi 3 Medium (14B)',
    description: 'The larger Phi 3 variant. Better reasoning quality, useful for agent pipelines when llama3.1:8b is unavailable.',
    paramBillions: 14,
    sizeGB: 8.2,
  },

  // ── Reasoning models ───────────────────────────────────────
  {
    name: 'deepseek-r1:7b',
    label: 'DeepSeek R1 (7B)',
    description: 'DeepSeek\'s reasoning model with chain-of-thought. Slower than standard models but excels at multi-step planning in agent pipelines.',
    paramBillions: 7,
    sizeGB: 4.7,
  },
]

/**
 * Ordered list of recommended model names per AI job.
 * First entry is the primary recommendation.
 */
export const JOB_RECOMMENDATIONS: Readonly<Record<string, readonly string[]>> = {
  intake: ['llama3.2', 'mistral', 'qwen2.5:7b'],
  'scraper.structure': ['llama3.2', 'gemma2:2b', 'phi3.5'],
  'scraper.remap': ['qwen2.5-coder:7b', 'llama3.2', 'mistral'],
  agents: ['llama3.1:8b', 'deepseek-r1:7b', 'qwen2.5:7b'],
}
