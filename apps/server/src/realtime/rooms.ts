import { room } from '@codem/shared'
import type { Server } from 'socket.io'

let io: Server | null = null
export function setIo(server: Server | null) {
  io = server
}

// All emits go through the Redis adapter, so they reach sockets on every server instance.
export function emitToChat(chatId: string, ev: string, payload: unknown) {
  io?.to(room.chat(chatId)).emit(ev, payload)
}
export function emitToUser(userId: string, ev: string, payload: unknown) {
  io?.to(room.user(userId)).emit(ev, payload)
}
export function emitToMatch(matchId: string, ev: string, payload: unknown) {
  io?.to(room.match(matchId)).emit(ev, payload)
}
/** Subscribe every live socket of `userId` to a chat room (after they are added to a chat). */
export function joinUserToChat(userId: string, chatId: string) {
  io?.in(room.user(userId)).socketsJoin(room.chat(chatId))
}
