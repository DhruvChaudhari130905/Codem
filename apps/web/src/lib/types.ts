export type Member = { id: string; username: string; role: 'admin' | 'member'; online: boolean }
export type MessageKind = 'text' | 'match_invite' | 'match_live' | 'match_result'
export type MessageView = {
  id: string
  chatId: string
  senderId: string | null
  senderName: string | null
  kind: MessageKind
  body: string
  matchId: string | null
  createdAt: string
}
export type ChatSummary = {
  id: string
  kind: 'direct' | 'group'
  title: string
  role: 'admin' | 'member'
  inviteCode: string | null
  members: Member[]
  lastMessage: MessageView | null
  unread: number
  liveMatch: { id: string; status: string } | null
}
export type UserRef = { id: string; username: string }
export type FriendsResponse = { friends: UserRef[]; incoming: { id: string; user: UserRef }[]; outgoing: { id: string; user: UserRef }[] }

export type ProblemSummary = { id: string; slug: string; title: string; difficulty: 'easy' | 'medium' | 'hard'; isCustom: boolean }
export type TestCase = { stdin: string; expected: string }
export type PublicProblem = ProblemSummary & { statementMd: string; samples: TestCase[]; cpuSec: number; memMb: number }
export type InviteBody = { mode: 'coding' | 'prompting'; problemTitle: string; difficulty: string; timeLimitSec: number; language: string | null }
export type ResultBody = { mode: 'coding' | 'prompting'; problemTitle: string; podium: { userId: string; username: string; total: number; rank: number; testsPassed: number; testsTotal: number }[] }
