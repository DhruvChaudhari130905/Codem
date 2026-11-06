import { expect, type Browser, type Page } from '@playwright/test'

export const uid = () => Math.random().toString(36).slice(2, 8)

export async function newUser(browser: Browser, name: string): Promise<{ page: Page; username: string }> {
  const ctx = await browser.newContext()
  // The app must not depend on third-party CDNs (e.g. Monaco from jsdelivr).
  await ctx.route(/cdn\.jsdelivr\.net|unpkg\.com/, (r) => r.abort())
  const page = await ctx.newPage()
  const username = `${name}_${uid()}`
  await page.goto('/signup')
  await page.getByLabel('Email').fill(`${username}@e2e.dev`)
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/chats/)
  return { page, username }
}

export async function befriend(a: { page: Page }, b: { page: Page; username: string }) {
  await a.page.getByRole('button', { name: 'Friends' }).click()
  await a.page.getByPlaceholder('Search by username').fill(b.username)
  await a.page.getByRole('button', { name: `Add ${b.username}` }).click()
  await a.page.keyboard.press('Escape')
  await b.page.getByRole('button', { name: 'Friends' }).click()
  await b.page.getByRole('button', { name: 'Accept' }).first().click()
  await b.page.keyboard.press('Escape')
}

export async function openChat(page: Page, title: string) {
  await page.getByRole('link', { name: new RegExp(title) }).first().click()
}

export async function createGroup(owner: { page: Page }, name: string, members: string[]) {
  await owner.page.getByRole('button', { name: 'New group' }).click()
  await owner.page.getByLabel('Group name').fill(name)
  for (const m of members) await owner.page.getByLabel(m).check()
  await owner.page.getByRole('button', { name: 'Create group' }).click()
  await expect(owner.page.getByRole('heading', { name })).toBeVisible()
}

/** Host opens the challenge modal in the current chat and sends a coding invite for a library problem. */
export async function sendChallenge(page: Page, opts: { mode?: 'Coding' | 'Prompting'; problem?: string; language?: string } = {}) {
  await page.getByRole('button', { name: /Start challenge/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Start a challenge' })
  await dialog.locator('label', { has: page.getByRole('radio', { name: opts.mode ?? 'Coding' }) }).click()
  await expect(dialog.getByRole('radio', { name: opts.mode ?? 'Coding' })).toBeChecked()
  if (opts.problem) await dialog.getByLabel('Problem', { exact: true }).selectOption({ label: opts.problem })
  if (opts.language) await dialog.getByLabel('Language').selectOption(opts.language)
  await dialog.getByRole('button', { name: 'Send invite to chat' }).click()
}

/** Put code into the arena editor through its per-match autosave, then reload so the editor picks it up. */
export async function setArenaCode(page: Page, code: string) {
  const matchId = page.url().split('/match/')[1].split(/[/?#]/)[0]
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`codem:code:${matchId}`, JSON.stringify({ language: 'python', code })])
  await page.reload()
  await expect(page.getByTestId('editor-ready')).toBeVisible()
}

export async function startGroupMatch(browser: import('@playwright/test').Browser, opts: { mode?: 'Coding' | 'Prompting'; problem: string; language?: string }) {
  const a = await newUser(browser, 'alpha')
  const b = await newUser(browser, 'bravo')
  await befriend(a, b)
  const group = `arena ${uid()}`
  await createGroup(a, group, [b.username])
  await sendChallenge(a.page, opts)
  await openChat(b.page, group)
  await b.page.getByRole('article', { name: 'Challenge' }).last().getByRole('button', { name: 'Join' }).click()
  await a.page.getByRole('article', { name: 'Challenge' }).last().getByRole('button', { name: 'Start now' }).click()
  await expect(a.page).toHaveURL(/\/match\/[^/]+$/)
  await expect(b.page).toHaveURL(/\/match\/[^/]+$/)
  return { a, b, group }
}
