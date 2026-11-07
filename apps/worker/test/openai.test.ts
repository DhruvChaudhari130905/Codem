import { describe, expect, it } from 'vitest'
import { openAiClient } from '../src/ai/openai.js'

const cfg = { baseUrl: 'https://api.example.com/v1/', apiKey: 'k', model: 'some-model' }

function stubFetch(reply: unknown) {
  const requests: { url: string; body: Record<string, unknown>; auth: string }[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).authorization })
    return new Response(JSON.stringify(reply), { status: 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, requests }
}

describe('openAiClient', () => {
  it('translates a tool loop history and a tool-call reply', async () => {
    const { fetchImpl, requests } = stubFetch({
      choices: [{ message: { content: 'Writing.', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'write_file', arguments: '{"path":"main.py","content":"x"}' } }] }, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 50, completion_tokens: 7 },
    })
    const msg = await openAiClient(cfg, fetchImpl).create({
      model: 'claude-x',
      max_tokens: 100,
      system: 'sys',
      tools: [{ name: 'run_samples', description: 'run', input_schema: { type: 'object', properties: {} } }],
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'solve it' }] },
        { role: 'assistant', content: [{ type: 'thinking', thinking: 'hm', signature: 's' }, { type: 'tool_use', id: 'c1', name: 'run_samples', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'main.py does not exist', is_error: true }] },
      ],
    })

    const req = requests[0]
    expect(req.url).toBe('https://api.example.com/v1/chat/completions')
    expect(req.auth).toBe('Bearer k')
    expect(req.body.model).toBe('some-model')
    expect(req.body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'solve it' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_samples', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'c1', content: 'Error: main.py does not exist' },
    ])
    expect(req.body.tools).toEqual([{ type: 'function', function: { name: 'run_samples', description: 'run', parameters: { type: 'object', properties: {} } } }])

    expect(msg.stop_reason).toBe('tool_use')
    expect(msg.content).toEqual([
      { type: 'text', text: 'Writing.', citations: null },
      { type: 'tool_use', id: 'c2', name: 'write_file', input: { path: 'main.py', content: 'x' } },
    ])
    expect(msg.usage.input_tokens).toBe(50)
    expect(msg.usage.output_tokens).toBe(7)
  })

  it('sends structured output as a json_schema response format', async () => {
    const { fetchImpl, requests } = stubFetch({ choices: [{ message: { content: '{"score":7}' }, finish_reason: 'stop' }] })
    const schema = { type: 'object', properties: { score: { type: 'number' } }, required: ['score'], additionalProperties: false }
    const msg = await openAiClient(cfg, fetchImpl).create({
      model: 'claude-x',
      max_tokens: 100,
      output_config: { format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: 'review' }],
    })
    expect(requests[0].body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'report', schema, strict: true } })
    expect(msg.stop_reason).toBe('end_turn')
    expect(msg.content).toEqual([{ type: 'text', text: '{"score":7}', citations: null }])
  })

  it('throws on an HTTP error so the job retries', async () => {
    const fetchImpl = (async () => new Response('quota exceeded', { status: 429 })) as unknown as typeof fetch
    await expect(openAiClient(cfg, fetchImpl).create({ model: 'm', max_tokens: 1, messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('AI API 429: quota exceeded')
  })
})
