export const env = {
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  judge0Url: process.env.JUDGE0_URL ?? 'http://127.0.0.1:2358',
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  aiConcurrency: Number(process.env.AI_CONCURRENCY ?? 8),
  socketKey: process.env.SOCKET_IO_KEY ?? 'socket.io',
  port: Number(process.env.WORKER_PORT ?? 4100),
}
