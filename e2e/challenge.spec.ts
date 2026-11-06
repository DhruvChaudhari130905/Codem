import { expect, test } from '@playwright/test'
import { befriend, createGroup, newUser, openChat, sendChallenge, uid } from './helpers.js'

test('host sends a challenge in a group, friend joins, host starts, both enter the arena', async ({ browser }) => {
  const a = await newUser(browser, 'host')
  const b = await newUser(browser, 'guest')
  await befriend(a, b)
  const group = `crew ${uid()}`
  await createGroup(a, group, [b.username])

  await sendChallenge(a.page, { problem: 'Reverse the words (easy)' })
  await openChat(b.page, group)
  const card = b.page.getByRole('article', { name: 'Challenge' }).last()
  await expect(card).toContainText('Reverse the words')
  await card.getByRole('button', { name: 'Join' }).click()

  const hostCard = a.page.getByRole('article', { name: 'Challenge' }).last()
  await expect(hostCard).toContainText(b.username)
  await hostCard.getByRole('button', { name: 'Start now' }).click()

  await expect(a.page).toHaveURL(/\/match\/[^/]+$/)
  await expect(b.page).toHaveURL(/\/match\/[^/]+$/)
})
