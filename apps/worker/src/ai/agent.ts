import type Anthropic from '@anthropic-ai/sdk'
import { AGENT_MODEL, entryFile, LANGUAGES, LIMITS, outputsMatch, type AgentEvent, type Language, type TestCase } from '@codem/shared'
import { z } from 'zod'
import type { Executor } from '../executor.js'
import { billableTokens, type AiClient } from './client.js'

type MessageParam = Anthropic.Beta.BetaMessageParam
type ToolResult = Anthropic.Beta.BetaToolResultBlockParam

export const MAX_TOOL_ITERATIONS = 10
const MAX_FILES = 10
const SHOW_CHARS = 4000

/** Problem as the agent may see it: statement and sample tests only. */
export type AgentProblem = { statementMd: string; samples: TestCase[]; cpuSec: number; memMb: number }

export type AgentTurnInput = {
  matchId: string
  turn: number
  prompt: string
  history: MessageParam[]
  files: Record<string, string>
  problem: AgentProblem
  language: Language
  tokensLeft: number
}
export type AgentTurnOutput = { transcript: MessageParam[]; files: Record<string, string>; tokens: number; samples: { passed: number; total: number } | null }
export type AgentDeps = { client: AiClient; executor: Executor; emit: (e: Omit<AgentEvent, 'matchId' | 'turn'>) => void }

const pathSchema = z.string().regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/, 'use a plain file name like main.py')
const inputs = {
  write_file: z.object({ path: pathSchema, content: z.string().max(LIMITS.sourceBytesMax) }),
  read_file: z.object({ path: pathSchema }),
  run_samples: z.object({}),
  run_custom: z.object({ stdin: z.string().max(100_000) }),
}

const strictObject = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object' as const, properties, required, additionalProperties: false })
const TOOLS: Anthropic.Beta.BetaTool[] = [
  { name: 'write_file', description: 'Create or overwrite a file in the workspace with the full content given.', strict: true, input_schema: strictObject({ path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']) },
  { name: 'read_file', description: 'Read a file from the workspace.', strict: true, input_schema: strictObject({ path: { type: 'string' } }, ['path']) },
  { name: 'run_samples', description: 'Run the entry file against the sample tests and report which pass.', strict: true, input_schema: strictObject({}, []) },
  { name: 'run_custom', description: 'Run the entry file with custom stdin and return its output.', strict: true, input_schema: strictObject({ stdin: { type: 'string' } }, ['stdin']) },
]

const clip = (s: string) => (s.length > SHOW_CHARS ? `${s.slice(0, SHOW_CHARS)}\n… (${s.length - SHOW_CHARS} more characters)` : s)

export function agentSystem(problem: AgentProblem, language: Language): string {
  const entry = entryFile(language)
  const samples = problem.samples.map((s, i) => `Sample ${i + 1} input:\n${s.stdin}\nSample ${i + 1} expected output:\n${s.expected}`).join('\n\n')
  return `You are a coding agent in a timed contest. A player directs you with prompts; they cannot edit code, so you write and run all of it.
Follow the player's direction. Keep messages short: say what you changed and what the runs showed.

Language: ${LANGUAGES[language].label}. The entry file is ${entry}. The program reads stdin and writes stdout.
Limits per run: ${problem.cpuSec}s CPU, ${problem.memMb} MB memory, no network.
When you are done with a request, the final code must be in ${entry}; that file is what the player submits.
You only see the sample tests below. Hidden tests are run when the player submits, so handle edge cases and large inputs.

Problem statement:
${problem.statementMd}

${samples}`
}

/** One player prompt: call Claude, run its tool calls, loop until it ends its turn, hits 10 tool rounds, or runs out of tokens. */
export async function runAgentTurn(i: AgentTurnInput, deps: AgentDeps): Promise<AgentTurnOutput> {
  const files = { ...i.files }
  const entry = entryFile(i.language)
  const transcript: MessageParam[] = []
  let tokens = 0
  let samples: AgentTurnOutput['samples'] = null
  const names = Object.keys(files)
  const userText = `${i.prompt}\n\n(Workspace files: ${names.length ? names.join(', ') : 'none yet'}.)`
  transcript.push({ role: 'user', content: [{ type: 'text', text: userText }] })
  deps.emit({ kind: 'user', text: i.prompt })

  const run = (stdins: string[]) => deps.executor.runBatch({ language: i.language, source: files[entry] ?? '', cpuSec: i.problem.cpuSec, memMb: i.problem.memMb, stdins })

  async function execute(name: string, raw: unknown): Promise<{ text: string; isError?: boolean }> {
    const schema = inputs[name as keyof typeof inputs]
    if (!schema) return { text: `Unknown tool ${name}.`, isError: true }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) return { text: `Invalid input: ${parsed.error.issues.map((x) => x.message).join('; ')}`, isError: true }
    const input = parsed.data as Record<string, string>
    if (name === 'write_file') {
      if (!(input.path in files) && Object.keys(files).length >= MAX_FILES) return { text: `The workspace holds at most ${MAX_FILES} files.`, isError: true }
      files[input.path] = input.content
      deps.emit({ kind: 'files', files: { ...files } })
      return { text: `Wrote ${input.path} (${input.content.length} characters).` }
    }
    if (name === 'read_file') {
      return input.path in files ? { text: files[input.path] } : { text: `${input.path} does not exist.`, isError: true }
    }
    if (!(entry in files)) return { text: `${entry} does not exist yet. Write it first.`, isError: true }
    if (name === 'run_samples') {
      const outs = await run(i.problem.samples.map((s) => s.stdin))
      const passed = outs.filter((o, k) => o.status === 'ok' && outputsMatch(o.stdout, i.problem.samples[k].expected)).length
      samples = { passed, total: outs.length }
      const lines = outs.map((o, k) => {
        const ok = o.status === 'ok' && outputsMatch(o.stdout, i.problem.samples[k].expected)
        return `Sample ${k + 1}: ${ok ? 'passed' : `FAILED (${o.status})`}${ok ? '' : `\nstdout:\n${clip(o.stdout)}\nstderr:\n${clip(o.stderr)}`}`
      })
      return { text: `${passed}/${outs.length} sample tests passed.\n${lines.join('\n')}` }
    }
    const [o] = await run([input.stdin])
    return { text: `status: ${o.status}, ${o.timeMs} ms\nstdout:\n${clip(o.stdout)}\nstderr:\n${clip(o.stderr)}` }
  }

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const msg = await deps.client.create({
      model: AGENT_MODEL,
      max_tokens: 16000,
      system: agentSystem(i.problem, i.language),
      tools: TOOLS,
      cache_control: { type: 'ephemeral' },
      output_config: { effort: 'medium' },
      messages: [...i.history, ...transcript],
    })
    tokens += billableTokens(msg)
    // Content goes back unchanged on later requests (thinking blocks included).
    transcript.push({ role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] })
    for (const b of msg.content) {
      if (b.type === 'text' && b.text.trim()) deps.emit({ kind: 'text', text: b.text })
      if (b.type === 'tool_use') deps.emit({ kind: 'tool_call', tool: b.name, input: b.name === 'write_file' ? { path: (b.input as { path?: string }).path } : b.input })
    }
    if (msg.stop_reason === 'refusal') {
      deps.emit({ kind: 'error', text: 'The agent declined this request. Try rephrasing it.' })
      break
    }
    const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
    if (msg.stop_reason !== 'tool_use' || !calls.length) break

    const results: ToolResult[] = []
    for (const call of calls) {
      const r = await execute(call.name, call.input).catch((e: unknown) => ({ text: `Tool failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }))
      deps.emit({ kind: 'tool_result', tool: call.name, text: clip(r.text) })
      results.push({ type: 'tool_result', tool_use_id: call.id, content: r.text, ...(r.isError && { is_error: true }) })
    }
    // Every tool_use gets its result, even when the turn stops here, so the history stays valid.
    transcript.push({ role: 'user', content: results })
    if (tokens >= i.tokensLeft) {
      deps.emit({ kind: 'error', text: 'Token budget used up. Submit what you have.' })
      break
    }
  }
  return { transcript, files, tokens, samples }
}
