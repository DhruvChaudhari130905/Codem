import { expect, test } from '@playwright/test'
import { befriend, newUser, openChat } from './helpers.js'

test('two friends chat live in a direct chat', async ({ browser }) => {
  const a = await newUser(browser, 'ann')
  const b = await newUser(browser, 'ben')
  await befriend(a, b)

  await openChat(a.page, b.username)
  await a.page.getByPlaceholder('Message').fill('hi')
  await a.page.keyboard.press('Enter')

  const row = b.page.getByRole('link', { name: new RegExp(a.username) })
  await expect(row.getByLabel('1 unread')).toBeVisible()
  await row.click()
  await expect(b.page.getByText('hi', { exact: true })).toBeVisible()
})
