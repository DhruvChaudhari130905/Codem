import Anthropic from '@anthropic-ai/sdk'

/** The one call the worker makes to Claude. Tests and AI_FAKE swap in their own implementation. */
export type AiClient = { create(params: Anthropic.Beta.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.BetaMessage> }

let sdk: Anthropic | null = null

/** Real client. Server-side refusal fallbacks are on, so a safety decline re-runs on a fallback model. */
export const anthropicClient: AiClient = {
  create(params) {
    sdk ??= new Anthropic()
    return sdk.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
  },
}

export function textOf(msg: Anthropic.Beta.BetaMessage): string {
  return msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

/** Tokens charged to a player's budget: fresh input plus output. Cache reads (resent history) are free here. */
export function billableTokens(msg: Anthropic.Beta.BetaMessage): number {
  return (msg.usage.input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0) + (msg.usage.output_tokens ?? 0)
}
