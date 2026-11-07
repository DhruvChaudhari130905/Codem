import type Anthropic from '@anthropic-ai/sdk'
import type { AiClient } from './client.js'

export type OpenAiConfig = { baseUrl: string; apiKey: string; model: string }

type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }
type ChatResponse = {
  id?: string
  choices: { message: { content?: string | null; refusal?: string | null; tool_calls?: ToolCall[] }; finish_reason: string }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

const textFrom = (content: unknown): string =>
  typeof content === 'string' ? content : Array.isArray(content) ? content.map((b) => (b.type === 'text' ? b.text : '')).join('') : ''

/** Anthropic-shaped history to OpenAI chat messages. Thinking blocks are Claude-only and are dropped. */
function toChat(params: Anthropic.Beta.MessageCreateParamsNonStreaming): ChatMessage[] {
  const out: ChatMessage[] = []
  const system = textFrom(params.system)
  if (system) out.push({ role: 'system', content: system })
  for (const m of params.messages) {
    const blocks = typeof m.content === 'string' ? [{ type: 'text' as const, text: m.content }] : (m.content ?? [])
    if (m.role === 'assistant') {
      const calls = blocks.flatMap((b): ToolCall[] =>
        b.type === 'tool_use' ? [{ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }] : [],
      )
      out.push({ role: 'assistant', content: textFrom(blocks) || null, ...(calls.length && { tool_calls: calls }) })
      continue
    }
    // Tool results must directly follow the assistant message that called them.
    for (const b of blocks) {
      if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: (b.is_error ? 'Error: ' : '') + textFrom(b.content) })
    }
    const text = textFrom(blocks)
    if (text) out.push({ role: 'user', content: text })
  }
  return out
}

const STOP: Record<string, Anthropic.Beta.BetaStopReason> = { tool_calls: 'tool_use', length: 'max_tokens', content_filter: 'refusal' }

/**
 * Any OpenAI-compatible chat-completions API (OpenAI, Gemini, Groq, OpenRouter, Ollama, ...),
 * translated to and from the Anthropic message shape the rest of the worker uses.
 * The configured model replaces the Claude model ids the callers pass.
 */
export function openAiClient(cfg: OpenAiConfig, fetchImpl: typeof fetch = fetch): AiClient {
  return {
    async create(params) {
      const format = params.output_config?.format as { type: 'json_schema'; schema: Record<string, unknown> } | undefined
      const body = {
        model: cfg.model,
        max_tokens: params.max_tokens,
        messages: toChat(params),
        ...(params.tools?.length && {
          tools: params.tools.map((t) => {
            const tool = t as Anthropic.Beta.BetaTool
            return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }
          }),
        }),
        ...(format && { response_format: { type: 'json_schema', json_schema: { name: 'report', schema: format.schema, strict: true } } }),
      }
      const res = await fetchImpl(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`AI API ${res.status}: ${(await res.text()).slice(0, 500)}`)
      const data = (await res.json()) as ChatResponse
      const choice = data.choices[0]
      const content: Anthropic.Beta.BetaContentBlock[] = []
      if (choice.message.content) content.push({ type: 'text', text: choice.message.content, citations: null })
      for (const c of choice.message.tool_calls ?? []) {
        let input: unknown = {}
        try {
          input = JSON.parse(c.function.arguments || '{}')
        } catch {
          input = { _unparsed: c.function.arguments } // fails tool validation, so the model sees the error and retries
        }
        content.push({ type: 'tool_use', id: c.id, name: c.function.name, input } as Anthropic.Beta.BetaToolUseBlock)
      }
      const stop_reason = choice.message.refusal ? 'refusal' : (STOP[choice.finish_reason] ?? (choice.message.tool_calls?.length ? 'tool_use' : 'end_turn'))
      const usage = { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
      return { id: data.id ?? `chat_${Date.now()}`, type: 'message', role: 'assistant', model: cfg.model, content, stop_reason, usage } as unknown as Anthropic.Beta.BetaMessage
    },
  }
}
