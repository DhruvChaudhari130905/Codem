import type Anthropic from '@anthropic-ai/sdk'
import type { AiClient } from './client.js'

/**
 * Scripted stand-in for Claude, enabled with AI_FAKE=1 (E2E tests, local dev without an API key).
 * Reviews return a fixed report. The agent copies the first fenced code block in the latest prompt
 * into the entry file, runs the samples, then reports back.
 */
export const fakeClient: AiClient = {
  async create(params) {
    const usage = { input_tokens: 400, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    const msg = (content: unknown[], stop_reason: string) =>
      ({ id: `fake_${Date.now()}`, type: 'message', role: 'assistant', model: params.model, content, stop_reason, usage }) as unknown as Anthropic.Beta.BetaMessage

    if (params.output_config?.format) {
      const fields = Object.keys((params.output_config.format as unknown as { schema: { properties: Record<string, unknown> } }).schema.properties)
      const report = Object.fromEntries(fields.map((f) => [f, f === 'score' ? 7 : `Fake ${f} feedback.`]))
      return msg([{ type: 'text', text: JSON.stringify(report) }], 'end_turn')
    }

    const last = params.messages.at(-1)!
    const blocks = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }]
    const results = blocks.filter((b) => b.type === 'tool_result')
    if (results.some((r) => (r as { tool_use_id?: string }).tool_use_id?.startsWith('toolu_write'))) {
      return msg([{ type: 'tool_use', id: `toolu_run_${Date.now()}`, name: 'run_samples', input: {} }], 'tool_use')
    }
    if (results.length) return msg([{ type: 'text', text: 'Done. I wrote the code and ran the samples.' }], 'end_turn')

    const prompt = blocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n')
    const code = /```[a-z]*\n([\s\S]*?)```/.exec(prompt)?.[1]
    if (!code) return msg([{ type: 'text', text: 'Send me the code in a fenced block and I will write it.' }], 'end_turn')
    const system = typeof params.system === 'string' ? params.system : JSON.stringify(params.system)
    const path = /entry file is ([\w-]+\.\w+)/.exec(system)?.[1] ?? 'main.py'
    return msg(
      [
        { type: 'text', text: `Writing ${path}.` },
        { type: 'tool_use', id: `toolu_write_${Date.now()}`, name: 'write_file', input: { path, content: code } },
      ],
      'tool_use',
    )
  },
}
