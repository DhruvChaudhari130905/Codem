import type Anthropic from '@anthropic-ai/sdk'
import { EV, LIMITS } from '@codem/shared'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { AiClient } from '../src/ai/client.js'
import { prisma } from '../src/db.js'
import { processAgentTurn } from '../src/jobs/agentTurn.js'
import { FakeExecutor, fakeEmitter, HIDDEN, resetDb, seedMatch } from './fixtures.js'

beforeEach(resetDb)
afterAll(() => prisma.$disconnect())

type Reply = { content: unknown[]; stop: string }
function scripted(replies: Reply[] | ((n: number) => Reply)) {
  const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = []
  const client: AiClient = {
    async create(params) {
      calls.push(structuredClone(params))
      const r = typeof replies === 'function' ? replies(calls.length) : replies.shift()!
      return { content: r.content, stop_reason: r.stop, usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } as unknown as Anthropic.Beta.BetaMessage
    },
  }
  return { client, calls }
}
const tool = (name: string, input: object, id = `t_${name}_${Math.random()}`) => ({ type: 'tool_use', id, name, input })

async function prompting() {
  const s = await seedMatch({ code: '', mode: 'prompting' })
  await prisma.matchPlayer.update({ where: { matchId_userId: { matchId: s.match.id, userId: s.user.id } }, data: { submittedAt: null, code: null, promptsUsed: 1 } })
  return s
}

describe('agent turn', () => {
  it('writes code, runs samples, persists the turn and never sees hidden tests', async () => {
    const { match, user } = await prompting()
    const { client, calls } = scripted([
      { content: [{ type: 'text', text: 'Writing it.' }, tool('write_file', { path: 'main.py', content: 'a=>a' })], stop: 'tool_use' },
      { content: [tool('run_samples', {})], stop: 'tool_use' },
      { content: [{ type: 'text', text: 'All samples pass.' }], stop: 'end_turn' },
    ])
    const em = fakeEmitter()
    const cleared: string[] = []
    await processAgentTurn({ matchId: match.id, userId: user.id, prompt: 'echo the input' }, { client, executor: new FakeExecutor(), emit: em.emit, clearInflight: async (m) => void cleared.push(m) })

    expect(calls).toHaveLength(3)
    const wire = JSON.stringify(calls)
    expect(wire).toContain('echo the input')
    expect(wire).toContain('Echo the input.')
    expect(wire).toContain('Sample 1 input')
    for (const h of HIDDEN) {
      expect(wire).not.toContain(h.stdin)
      expect(wire).not.toContain(h.expected)
    }
    // run_samples reported a pass from the executor
    const runResult = JSON.stringify(calls[2].messages.at(-1))
    expect(runResult).toMatch(/1\/1 sample tests passed/)

    const p = await prisma.matchPlayer.findUniqueOrThrow({ where: { matchId_userId: { matchId: match.id, userId: user.id } } })
    expect(p.files).toEqual({ 'main.py': 'a=>a' })
    expect(p.tokensUsed).toBe(450)
    const turn = await prisma.agentTurn.findFirstOrThrow({ where: { matchId: match.id } })
    expect(turn).toMatchObject({ index: 0, prompt: 'echo the input', tokens: 450 })
    expect(cleared).toEqual([match.id])

    const agentEvents = em.out.filter((e) => e.ev === EV.agentEvent)
    expect(agentEvents.length).toBeGreaterThan(3)
    expect(agentEvents.every((e) => e.room === `user:${user.id}`)).toBe(true)
    expect(em.out.filter((e) => e.room === `match:${match.id}`).every((e) => e.ev === EV.matchProgress)).toBe(true)
    expect(JSON.stringify(em.out.filter((e) => e.room.startsWith('match:')))).not.toContain('a=>a')
  })

  it('sends earlier turns as history on the next turn', async () => {
    const { match, user } = await prompting()
    const deps = (client: AiClient) => ({ client, executor: new FakeExecutor(), emit: () => {}, clearInflight: async () => {} })
    await processAgentTurn({ matchId: match.id, userId: user.id, prompt: 'first ask' }, deps(scripted([{ content: [{ type: 'text', text: 'ok one' }], stop: 'end_turn' }]).client))
    const second = scripted([{ content: [{ type: 'text', text: 'ok two' }], stop: 'end_turn' }])
    await processAgentTurn({ matchId: match.id, userId: user.id, prompt: 'second ask' }, deps(second.client))
    const msgs = JSON.stringify(second.calls[0].messages)
    expect(msgs.indexOf('first ask')).toBeLessThan(msgs.indexOf('ok one'))
    expect(msgs.indexOf('ok one')).toBeLessThan(msgs.indexOf('second ask'))
    expect(await prisma.agentTurn.count({ where: { matchId: match.id } })).toBe(2)
  })

  it('stops after 10 tool iterations', async () => {
    const { match, user } = await prompting()
    const { client, calls } = scripted(() => ({ content: [tool('read_file', { path: 'main.py' })], stop: 'tool_use' }))
    await processAgentTurn({ matchId: match.id, userId: user.id, prompt: 'loop' }, { client, executor: new FakeExecutor(), emit: () => {}, clearInflight: async () => {} })
    expect(calls).toHaveLength(10)
  })

  it('stops when the token budget runs out', async () => {
    const { match, user } = await prompting()
    await prisma.matchPlayer.update({ where: { matchId_userId: { matchId: match.id, userId: user.id } }, data: { tokensUsed: LIMITS.tokenBudget.easy - 100 } })
    const { client, calls } = scripted(() => ({ content: [tool('read_file', { path: 'main.py' })], stop: 'tool_use' }))
    await processAgentTurn({ matchId: match.id, userId: user.id, prompt: 'go' }, { client, executor: new FakeExecutor(), emit: () => {}, clearInflight: async () => {} })
    expect(calls).toHaveLength(1)
  })

  it('rejects unsafe file paths', async () => {
    const { match, user } = await prompting()
    const { client, calls } = scripted([
      { content: [tool('write_file', { path: '../etc/passwd', content: 'x' })], stop: 'tool_use' },
      { content: [{ type: 'text', text: 'ok' }], stop: 'end_turn' },
    ])
    await processAgentTurn({ matchId: match.id, userId: user.id, prompt: 'go' }, { client, executor: new FakeExecutor(), emit: () => {}, clearInflight: async () => {} })
    expect(JSON.stringify(calls[1].messages.at(-1))).toContain('"is_error":true')
    const p = await prisma.matchPlayer.findUniqueOrThrow({ where: { matchId_userId: { matchId: match.id, userId: user.id } } })
    expect(p.files ?? {}).toEqual({})
  })
})
