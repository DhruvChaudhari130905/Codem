import { REVIEW_MODEL, type CodingReport, type Language, type PromptingReport } from '@codem/shared'
import { z } from 'zod'
import { anthropicClient, textOf, type AiClient } from './client.js'
import { CODE_REVIEW_SYSTEM, codeReviewUser, PROMPT_REVIEW_SYSTEM, promptReviewUser } from './prompts.js'

const clampScore = (n: number) => Math.round(Math.min(10, Math.max(0, n)) * 10) / 10

const codingSchema = z.object({
  score: z.number(),
  readability: z.string(),
  structure: z.string(),
  complexity: z.string(),
  edgeCases: z.string(),
  refactor: z.string(),
})
const promptingSchema = z.object({
  score: z.number(),
  clarity: z.string(),
  decomposition: z.string(),
  feedbackUse: z.string(),
  wastedTurns: z.string(),
  tip: z.string(),
})

/** Structured-output JSON schema for an object of the given string fields plus a numeric score. */
function jsonSchema(fields: string[]) {
  return {
    type: 'object',
    properties: { score: { type: 'number', description: '0 to 10' }, ...Object.fromEntries(fields.map((f) => [f, { type: 'string' }])) },
    required: ['score', ...fields],
    additionalProperties: false,
  } as const
}

/** One review call with one retry. Never throws: AI failure must not block results. */
async function review<T extends { score: number }>(client: AiClient, system: string, user: string, schema: z.ZodType<T>, fields: string[]): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const msg = await client.create({
        model: REVIEW_MODEL,
        max_tokens: 8000,
        system,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: jsonSchema(fields) } },
        messages: [{ role: 'user', content: user }],
      })
      if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') continue
      const parsed = schema.safeParse(JSON.parse(textOf(msg)))
      if (parsed.success) return { ...parsed.data, score: clampScore(parsed.data.score) }
    } catch (e) {
      console.error('review attempt failed', e instanceof Error ? e.message : e)
    }
  }
  return null
}

export function reviewCode(
  i: { problemMd: string; language: Language; source: string; testsPassed: number; testsTotal: number },
  client: AiClient = anthropicClient,
): Promise<CodingReport | null> {
  return review(client, CODE_REVIEW_SYSTEM, codeReviewUser(i), codingSchema, ['readability', 'structure', 'complexity', 'edgeCases', 'refactor'])
}

export function reviewPrompts(
  i: { problemMd: string; prompts: string[]; testsPassed: number; testsTotal: number },
  client: AiClient = anthropicClient,
): Promise<PromptingReport | null> {
  return review(client, PROMPT_REVIEW_SYSTEM, promptReviewUser(i), promptingSchema, ['clarity', 'decomposition', 'feedbackUse', 'wastedTurns', 'tip'])
}
