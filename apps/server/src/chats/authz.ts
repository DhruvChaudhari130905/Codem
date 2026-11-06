import type { ChatMember } from '@prisma/client'
import { prisma } from '../db.js'
import { HttpError } from '../errors.js'

export async function assertMember(chatId: string, userId: string): Promise<ChatMember> {
  const m = await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } } })
  if (!m) throw new HttpError(403, 'not a member of this chat', 'forbidden')
  return m
}

export async function isMember(chatId: string, userId: string): Promise<boolean> {
  return !!(await prisma.chatMember.findUnique({ where: { chatId_userId: { chatId, userId } }, select: { userId: true } }))
}
