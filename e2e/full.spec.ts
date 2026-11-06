import { expect, test, type Page } from '@playwright/test'
import { befriend, createGroup, newUser, openChat, sendChallenge, setArenaCode, uid } from './helpers.js'

async function submit(page: Page) {
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Submit', exact: true }).click()
}

test('three friends: group coding match, rematch, then a prompting match', async ({ browser }) => {
  test.setTimeout(300_000)
  const a = await newUser(browser, 'ana')
  const b = await newUser(browser, 'bo')
  const c = await newUser(browser, 'cy')
  await befriend(a, b)
  await befriend(a, c)
  const group = `trio ${uid()}`
  await createGroup(a, group, [b.username, c.username])

  async function playCodingRound(problem?: string) {
    if (problem) await sendChallenge(a.page, { problem, language: 'python' })
    for (const p of [b, c]) {
      await p.page.goto('/chats')
      await openChat(p.page, group)
      await p.page.getByRole('article', { name: 'Challenge' }).last().getByRole('button', { name: 'Join' }).click()
    }
    await a.page.goto('/chats')
    await openChat(a.page, group)
    await a.page.getByRole('article', { name: 'Challenge' }).last().getByRole('button', { name: 'Start now' }).click()
    for (const p of [a, b, c]) await expect(p.page).toHaveURL(/\/match\/[^/]+$/)
    await expect(a.page.getByRole('button', { name: 'Run samples' })).toBeVisible({ timeout: 20_000 })
  }

  // Round 1: c writes the correct solution, a and b do not.
  await playCodingRound('Reverse the words (easy)')
  await setArenaCode(c.page, "print(' '.join(input().split()[::-1]))")
  for (const p of [a, b, c]) await submit(p.page)
  await expect(a.page).toHaveURL(/\/results$/, { timeout: 120_000 })
  await expect(a.page.getByRole('list', { name: 'Podium' }).getByRole('listitem').first()).toContainText(c.username)

  // Rematch: a new invite lands in the group with a fresh easy problem.
  await a.page.getByRole('button', { name: 'Rematch' }).click()
  await expect(a.page).toHaveURL(/\/chats\//)
  await expect(a.page.getByRole('article', { name: 'Challenge' }).last()).toContainText('Waiting for players')
  await playCodingRound()
  for (const p of [a, b, c]) await submit(p.page)
  await expect(b.page).toHaveURL(/\/results$/, { timeout: 120_000 })
  await expect(b.page.getByRole('list', { name: 'Podium' }).getByRole('listitem')).toHaveCount(3)

  // Prompting round in a's and b's direct chat: it starts as soon as b joins.
  await a.page.goto('/chats')
  await openChat(a.page, b.username)
  await sendChallenge(a.page, { mode: 'Prompting', problem: 'Reverse the words (easy)', language: 'python' })
  await b.page.goto('/chats')
  await openChat(b.page, a.username)
  await b.page.getByRole('article', { name: 'Challenge' }).last().getByRole('button', { name: 'Join' }).click()
  for (const p of [a, b]) await expect(p.page).toHaveURL(/\/match\/[^/]+$/)
  await a.page.getByLabel('Prompt the agent').fill("```python\nprint(' '.join(input().split()[::-1]))\n```")
  await a.page.getByRole('button', { name: 'Send prompt' }).click()
  await expect(a.page.getByRole('region', { name: 'Agent code' }).getByText('2/2 sample tests passed')).toBeVisible({ timeout: 60_000 })
  for (const p of [a, b]) await submit(p.page)
  await expect(a.page).toHaveURL(/\/results$/, { timeout: 120_000 })
  await expect(a.page.getByRole('list', { name: 'Podium' }).getByRole('listitem').first()).toContainText(a.username)
  await expect(a.page.getByText('Clarity', { exact: true })).toBeVisible()
})
