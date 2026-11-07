const aiProvider = process.env.AI_PROVIDER ?? 'claude'
if (aiProvider !== 'claude' && aiProvider !== 'openai') throw new Error(`AI_PROVIDER must be claude or openai, got ${aiProvider}`)
if (aiProvider === 'openai' && process.env.AI_FAKE !== '1' && (!process.env.AI_BASE_URL || !process.env.AI_MODEL)) {
  throw new Error('AI_PROVIDER=openai needs AI_BASE_URL and AI_MODEL')
}

export const env = {
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  judge0Url: process.env.JUDGE0_URL ?? 'http://127.0.0.1:2358',
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
  aiConcurrency: Number(process.env.AI_CONCURRENCY ?? 8),
  socketKey: process.env.SOCKET_IO_KEY ?? 'socket.io',
  aiProvider,
  openAi: { baseUrl: process.env.AI_BASE_URL ?? '', apiKey: process.env.AI_API_KEY ?? '', model: process.env.AI_MODEL ?? '' },
  port: Number(process.env.WORKER_PORT ?? 4100),
}
