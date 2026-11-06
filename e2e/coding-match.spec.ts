import { expect, test } from '@playwright/test'
import { openChat, setArenaCode, startGroupMatch } from './helpers.js'

test('full coding match: correct beats wrong, result card lands in the chat', async ({ browser }) => {
  const { a, b, group } = await startGroupMatch(browser, { problem: 'Reverse the words (easy)', language: 'python' })
  await expect(a.page.getByRole('heading', { name: 'Reverse the words' })).toBeVisible({ timeout: 20_000 })

  await setArenaCode(a.page, "print(' '.join(input().split()[::-1]))")
  await a.page.getByRole('button', { name: 'Run samples' }).click()
  await expect(a.page.getByText('2/2 samples passed')).toBeVisible({ timeout: 60_000 })
  await expect(b.page.getByLabel(`${a.username} progress`)).toContainText('2/2')

  a.page.once('dialog', (d) => d.accept())
  await a.page.getByRole('button', { name: 'Submit', exact: true }).click()
  await setArenaCode(b.page, 'print(input())')
  b.page.once('dialog', (d) => d.accept())
  await b.page.getByRole('button', { name: 'Submit', exact: true }).click()

  await expect(a.page).toHaveURL(/\/results$/, { timeout: 90_000 })
  const podium = a.page.getByRole('list', { name: 'Podium' })
  await expect(podium.getByRole('listitem').first()).toContainText(a.username)

  await b.page.goto('/chats')
  await openChat(b.page, group)
  await expect(b.page.getByRole('article', { name: 'Match results' })).toBeVisible()
})
