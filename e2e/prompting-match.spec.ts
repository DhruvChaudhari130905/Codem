import { expect, test } from '@playwright/test'
import { startGroupMatch } from './helpers.js'

// Runs with AI_FAKE=1: the fake agent writes the code block from the prompt into main.py and runs the samples.
test('prompting match: prompt the agent, see its code, submit, get a prompting breakdown', async ({ browser }) => {
  const { a, b } = await startGroupMatch(browser, { mode: 'Prompting', problem: 'Reverse the words (easy)', language: 'python' })
  await expect(a.page.getByRole('heading', { name: 'Reverse the words' })).toBeVisible({ timeout: 20_000 })

  const box = a.page.getByLabel('Prompt the agent')
  await box.fill("Write this:\n```python\nprint(' '.join(input().split()[::-1]))\n```")
  await a.page.getByRole('button', { name: 'Send prompt' }).click()

  const code = a.page.getByRole('region', { name: 'Agent code' })
  await expect(code).toContainText("input().split()[::-1]", { timeout: 60_000 })
  await expect(code.getByText('2/2 sample tests passed')).toBeVisible({ timeout: 60_000 })
  await expect(a.page.getByLabel('Prompts used')).toContainText('1 / 25')
  await expect(b.page.getByLabel(`${a.username} progress`)).toContainText('1 prompts')

  for (const p of [a.page, b.page]) {
    p.once('dialog', (d) => d.accept())
    await p.getByRole('button', { name: 'Submit', exact: true }).click()
  }
  await expect(a.page).toHaveURL(/\/results$/, { timeout: 90_000 })
  await expect(a.page.getByRole('list', { name: 'Podium' }).getByRole('listitem').first()).toContainText(a.username)
  await expect(a.page.getByText('Prompt quality', { exact: false }).first()).toBeVisible()
  await expect(a.page.getByText('Clarity', { exact: true })).toBeVisible()
})
