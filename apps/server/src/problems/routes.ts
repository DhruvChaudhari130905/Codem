import { randomBytes } from 'node:crypto'
import { customProblemBody, idSchema, problemsQuery } from '@codem/shared'
import type { Problem } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { requireUser } from '../auth/session.js'
import { prisma } from '../db.js'
import { HttpError, parse } from '../errors.js'
import { toProblemSummary, toPublicProblem } from './serialize.js'

/** Seed problems are public; a custom problem is visible to its creator and to members of chats whose matches use it. */
export async function canSeeProblem(p: Problem, userId: string): Promise<boolean> {
  if (!p.isCustom || p.createdById === userId) return true
  const m = await prisma.match.findFirst({ where: { problemId: p.id, chat: { members: { some: { userId } } } }, select: { id: true } })
  return !!m
}

export async function problemRoutes(app: FastifyInstance) {
  app.get('/problems', async (req) => {
    const me = await requireUser(req)
    const { difficulty } = parse(problemsQuery, req.query)
    const rows = await prisma.problem.findMany({
      where: { difficulty, OR: [{ isCustom: false }, { createdById: me.id }] },
      orderBy: [{ isCustom: 'desc' }, { difficulty: 'asc' }, { title: 'asc' }],
      omit: { hidden: true, samples: true, statementMd: true },
    })
    return rows.map((r) => toProblemSummary(r as Problem))
  })

  app.get('/problems/:id', async (req) => {
    const me = await requireUser(req)
    const id = parse(idSchema, (req.params as { id: string }).id)
    const p = await prisma.problem.findUnique({ where: { id } })
    if (!p || !(await canSeeProblem(p, me.id))) throw new HttpError(404, 'problem not found')
    return toPublicProblem(p)
  })

  app.post('/problems/custom', async (req, reply) => {
    const me = await requireUser(req)
    const body = parse(customProblemBody, req.body)
    const p = await prisma.problem.create({
      data: { ...body, slug: `custom-${randomBytes(6).toString('hex')}`, isCustom: true, createdById: me.id },
    })
    return reply.code(201).send(toPublicProblem(p))
  })
}
