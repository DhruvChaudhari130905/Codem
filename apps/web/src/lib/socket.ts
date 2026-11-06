'use client'
import { useEffect } from 'react'
import { io, type Socket } from 'socket.io-client'
import { API_URL } from './api'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) socket = io(API_URL, { withCredentials: true, transports: ['websocket'] })
  return socket
}

export function closeSocket() {
  socket?.disconnect()
  socket = null
}

/** Subscribe to a socket event for the component's lifetime. */
export function useSocketEvent<T>(ev: string, handler: (payload: T) => void) {
  useEffect(() => {
    const s = getSocket()
    s.on(ev, handler)
    return () => {
      s.off(ev, handler)
    }
  }, [ev, handler])
}
