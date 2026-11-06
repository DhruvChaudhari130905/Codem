import { randomBytes } from 'node:crypto'
import type { User } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../db.js'
import { env } from '../env.js'
import { HttpError } from '../errors.js'

export const SESSION_COOKIE = 'codem_sid'
const SESSION_MS = 30 * 24 * 3600 * 1000

export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString('base64url')
  await prisma.session.create({ data: { id, userId, expiresAt: new Date(Date.now() + SESSION_MS) } })
  return id
}

export function setSessionCookie(reply: FastifyReply, sid: string) {
  reply.setCookie(SESSION_COOKIE, sid, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    signed: true,
    maxAge: SESSION_MS / 1000,
  })
}

/** Resolve a session id (already unsigned) to its user, or null if missing/expired. */
export async function userFromSid(sid: string | undefined | null): Promise<User | null> {
  if (!sid) return null
  const s = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } })
  if (!s || s.expiresAt < new Date()) return null
  return s.user
}

export function sidFromRequest(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE]
  if (!raw) return null
  const u = req.unsignCookie(raw)
  return u.valid ? u.value : null
}

const cache = new WeakMap<FastifyRequest, User>()

/** The signed-in user; throws 401. Users still choosing a username (Google signup) get 403 unless allowed. */
export async function requireUser(req: FastifyRequest, opts: { allowNoUsername?: boolean } = {}): Promise<User & { username: string }> {
  let user = cache.get(req) ?? null
  if (!user) {
    user = await userFromSid(sidFromRequest(req))
    if (!user) throw new HttpError(401, 'not signed in', 'unauthenticated')
    cache.set(req, user)
  }
  if (!user.username && !opts.allowNoUsername) throw new HttpError(403, 'choose a username first', 'needs_username')
  return user as User & { username: string }
}
