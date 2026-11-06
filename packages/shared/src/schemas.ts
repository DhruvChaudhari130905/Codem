import { z } from 'zod'
import { LANGUAGE_IDS } from './languages.js'
import { LIMITS } from './limits.js'

export const usernameSchema = z.string().regex(/^[a-z0-9_]{3,20}$/, 'username: 3-20 chars, a-z 0-9 _')
export const idSchema = z.string().min(1).max(64)
export const languageSchema = z.enum(LANGUAGE_IDS)
export const difficultySchema = z.enum(['easy', 'medium', 'hard'])
export type Difficulty = z.infer<typeof difficultySchema>

export const signupBody = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  username: usernameSchema,
  password: z.string().min(8).max(200),
})
export const loginBody = z.object({
  email: z.string().max(254).transform((s) => s.toLowerCase()),
  password: z.string().max(200),
})
export const setUsernameBody = z.object({ username: usernameSchema })

export const searchQuery = z.object({ q: z.string().max(20).default('') })
export const friendRequestBody = z.object({ username: usernameSchema })

export const createGroupBody = z.object({
  name: z.string().trim().min(1).max(60),
  memberIds: z.array(idSchema).max(LIMITS.groupMaxMembers),
})
export const addMemberBody = z.object({ userId: idSchema })
export const messagesQuery = z.object({
  before: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
})
export const postMessageBody = z.object({ body: z.string().trim().min(1).max(4000) })

export const testCaseSchema = z.object({ stdin: z.string().max(LIMITS.outputBytesMax), expected: z.string().max(LIMITS.outputBytesMax) })
export type TestCase = z.infer<typeof testCaseSchema>

export const customProblemBody = z.object({
  title: z.string().trim().min(1).max(100),
  statementMd: z.string().min(1).max(20_000),
  difficulty: difficultySchema,
  samples: z.array(testCaseSchema).min(1).max(10),
  hidden: z.array(testCaseSchema).min(1).max(100),
})
export const problemsQuery = z.object({ difficulty: difficultySchema.optional() })

export const createMatchBody = z.object({
  mode: z.enum(['coding', 'prompting']),
  problemId: z.union([idSchema, z.literal('random')]),
  difficulty: difficultySchema.optional(),
  timeLimitSec: z.number().int().min(300).max(7200).default(LIMITS.defaultTimeLimitSec),
  language: languageSchema.optional(),
})
export type CreateMatchBody = z.infer<typeof createMatchBody>

export const sourceBody = z.object({
  source: z.string().max(LIMITS.sourceBytesMax),
  language: languageSchema,
})
export const promptBody = z.object({ text: z.string().trim().min(1).max(LIMITS.promptMaxChars), language: languageSchema.optional() })

export const typingPayload = z.object({ chatId: idSchema })
