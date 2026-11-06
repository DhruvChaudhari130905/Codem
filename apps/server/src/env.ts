export const env = {
  port: Number(process.env.PORT ?? 4000),
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-session-secret-change-me',
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  isProd: process.env.NODE_ENV === 'production',
  /** Reverse proxies in front of the server whose X-Forwarded-For is trusted (1 behind Caddy). 0 = use the socket address. */
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
  /** Redis key prefix shared by the Socket.IO adapter (server) and emitter (worker). */
  socketKey: process.env.SOCKET_IO_KEY ?? 'socket.io',
}
if (env.isProd && env.sessionSecret.startsWith('dev-only')) throw new Error('SESSION_SECRET must be set in production')
