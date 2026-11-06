import { prisma } from '../db.js'

export async function areFriends(a: string, b: string): Promise<boolean> {
  const f = await prisma.friendship.findFirst({
    where: { status: 'accepted', OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
    select: { id: true },
  })
  return !!f
}

/** Ids of every accepted friend of `userId`. */
export async function friendIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.friendship.findMany({
    where: { status: 'accepted', OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  })
  return new Set(rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId)))
}
