import oauth2, { type OAuth2Namespace } from '@fastify/oauth2'
import { loginBody, setUsernameBody, signupBody } from '@codem/shared'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { prisma } from '../db.js'
import { env } from '../env.js'
import { HttpError, parse } from '../errors.js'
import { rateLimit } from '../ratelimit.js'
import { hashPassword, verifyPassword } from './password.js'
import { createSession, requireUser, SESSION_COOKIE, setSessionCookie, sidFromRequest } from './session.js'

const publicMe = (u: { id: string; username: string | null; email: string }) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  needsUsername: !u.username,
})

function isUniqueViolation(e: unknown, field: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && String(e.meta?.target ?? '').includes(field)
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', async (req, reply) => {
    await rateLimit('auth', req.ip)
    const body = parse(signupBody, req.body)
    try {
      const user = await prisma.user.create({
        data: { email: body.email, username: body.username, passwordHash: await hashPassword(body.password) },
      })
      setSessionCookie(reply, await createSession(user.id))
      return reply.code(201).send(publicMe(user))
    } catch (e) {
      if (isUniqueViolation(e, 'username')) throw new HttpError(409, 'username taken', 'username_taken')
      if (isUniqueViolation(e, 'email')) throw new HttpError(409, 'email already registered', 'email_taken')
      throw e
    }
  })

  app.post('/auth/login', async (req, reply) => {
    await rateLimit('auth', req.ip)
    const body = parse(loginBody, req.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.password))) {
      throw new HttpError(401, 'wrong email or password', 'bad_credentials')
    }
    setSessionCookie(reply, await createSession(user.id))
    return publicMe(user)
  })

  app.post('/auth/logout', async (req, reply) => {
    const sid = sidFromRequest(req)
    if (sid) await prisma.session.deleteMany({ where: { id: sid } })
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/auth/me', async (req) => publicMe(await requireUser(req, { allowNoUsername: true })))

  app.post('/auth/username', async (req) => {
    const user = await requireUser(req, { allowNoUsername: true })
    if (user.username) throw new HttpError(409, 'username already set', 'username_set')
    const { username } = parse(setUsernameBody, req.body)
    try {
      return publicMe(await prisma.user.update({ where: { id: user.id }, data: { username } }))
    } catch (e) {
      if (isUniqueViolation(e, 'username')) throw new HttpError(409, 'username taken', 'username_taken')
      throw e
    }
  })

  if (env.googleClientId) await registerGoogle(app)
}

async function registerGoogle(app: FastifyInstance) {
  await app.register(oauth2, {
    name: 'googleOAuth2',
    scope: ['openid', 'email', 'profile'],
    credentials: {
      client: { id: env.googleClientId, secret: env.googleClientSecret },
      auth: oauth2.GOOGLE_CONFIGURATION,
    },
    startRedirectPath: '/auth/google',
    callbackUri: `${env.apiUrl}/auth/google/callback`,
    cookie: { secure: env.isProd, sameSite: 'lax' },
  })

  app.get('/auth/google/callback', async (req, reply) => {
    const oauth = (app as unknown as { googleOAuth2: OAuth2Namespace }).googleOAuth2
    const { token } = await oauth.getAccessTokenFromAuthorizationCodeFlow(req)
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${token.access_token}` },
    })
    if (!res.ok) throw new HttpError(502, 'google userinfo failed')
    const info = (await res.json()) as { sub: string; email?: string; email_verified?: boolean }
    if (!info.email || !info.email_verified) throw new HttpError(400, 'google account has no verified email')
    const email = info.email.toLowerCase()
    const user =
      (await prisma.user.findUnique({ where: { googleId: info.sub } })) ??
      (await prisma.user.upsert({ where: { email }, update: { googleId: info.sub }, create: { email, googleId: info.sub } }))
    setSessionCookie(reply, await createSession(user.id))
    return reply.redirect(user.username ? `${env.webUrl}/chats` : `${env.webUrl}/signup?google=1`)
  })
}
