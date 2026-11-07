# Codem

**Compete with your friends at coding, right inside your chats.**

Codem is a chat app with built-in coding battles. Open a 1:1 or group chat and start a timed challenge. Everyone who joins gets the same problem and the same clock. Winners are ranked by correctness first, then by speed and an AI review of how good the code (or the prompting) was, so "it passed" is not the whole story.

## Features

- **Chats**: friends by username, 1:1 and group chats (up to 20), real-time messages, unread counts, online status, typing indicators.
- **Coding rounds**: write code in a Monaco editor against a timer, run it on sample tests, then submit once against hidden tests.
- **Prompting rounds**: you may not touch the code. You direct an AI agent that writes files and runs tests for you. This tests how well you get results out of AI.
- **AI reports**: every submission gets a 0–10 review with feedback on readability, structure, complexity and edge cases (coding), or on clarity, decomposition and wasted turns (prompting).
- **Live arena**: see every opponent's progress as it happens. A result card is posted back to the chat when the match ends.
- **Sandboxed execution**: code runs in [Judge0](https://judge0.com) with no network access and CPU, memory and output limits.
- **6 languages**: Python 3, JavaScript (Node), TypeScript, Java, C++, Go.
- **15 seed problems** from easy to hard, plus custom problems written per match.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 4, Monaco editor, Socket.IO client |
| Backend | Node.js 22, Fastify 5, Socket.IO 4, zod validation |
| Auth | Email + password (argon2 hashes) and Google OAuth. Sessions in httpOnly cookies. |
| Database | PostgreSQL 16 with Prisma ORM |
| Queue and realtime | Redis 7, BullMQ job queues, Socket.IO Redis emitter |
| Code execution | Judge0 1.13.1 (self-hosted, `isolate` sandbox) |
| AI | Claude (Anthropic SDK) or any OpenAI-compatible API |
| Testing | Vitest (unit and integration), Playwright (end-to-end) |
| Tooling | pnpm workspaces monorepo, Docker Compose, Caddy (HTTPS in production) |

## Project structure

```
Codem/
├── apps/
│   ├── web/          Next.js frontend
│   ├── server/       Fastify API, Socket.IO, Prisma schema and seed
│   └── worker/       BullMQ jobs: code runs, judging, AI reviews, prompting agent
├── packages/
│   └── shared/       Types, languages, limits and scoring used by all apps
├── problems/         Problem library (statement, samples, hidden tests)
├── e2e/              Playwright end-to-end tests
├── deploy/           Production Docker Compose, Caddyfile, deploy guide
├── docker-compose.yml   Local Postgres, Redis and Judge0
└── judge0.conf          Judge0 configuration
```

## How it works

```mermaid
flowchart LR
  web[web<br/>Next.js] -- HTTP + Socket.IO --> server[server<br/>Fastify + Socket.IO]
  server --> pg[(PostgreSQL)]
  server -- BullMQ jobs --> redis[(Redis)]
  redis --> worker[worker]
  worker -- results via pub/sub --> redis
  redis --> server
  worker --> judge0[Judge0<br/>sandbox]
  worker --> ai[AI provider<br/>Claude or OpenAI-compatible]
```

| Part | Role |
|---|---|
| `apps/web` | Next.js 15 + React 19 + Tailwind UI. Never receives hidden tests. |
| `apps/server` | Auth, chats, matches, scoring, timers. Owns the match state machine and pushes realtime events. |
| `apps/worker` | Runs BullMQ jobs: `run` (samples), `judge` (hidden tests), `review` (AI report), `agent-turn` (prompting agent). |
| `packages/shared` | Types, languages, limits and scoring shared by all apps. |
| `problems/` | Problem library, seeded into Postgres. |

Heavy work (code execution and AI calls) never runs in the server process, so a slow submission cannot lag the chat. Scale by adding workers.

### Scoring

| | Coding round | Prompting round |
|---|---|---|
| Correctness (60) | hidden tests passed / total | hidden tests passed / total |
| Speed / efficiency (20) | time left at submit. Only if all tests pass. | average of prompts, time and tokens left. Only if all tests pass. |
| Quality (20) | AI clean-code score / 10 | AI prompt-quality score / 10 |

Players are ranked by tests passed first. Points only break ties between players with the same correctness, so clean-but-wrong code never beats messy-but-correct code.

## Getting started

### Requirements

- Node.js 22+ and pnpm 10 (`corepack enable`)
- Docker (Docker Desktop on macOS)
- An AI provider: a Claude API key, any OpenAI-compatible API, or none (fake AI mode)

### Run locally

```sh
cp .env.example .env
docker compose up -d        # postgres, redis, judge0
pnpm install
pnpm -F server db:migrate   # apply Prisma migrations
pnpm -F server db:seed      # load problems/
pnpm dev                    # web :3000, server :4000, worker
```

Open http://localhost:3000.

### Environment variables

All settings live in `.env` (copied from `.env.example`). Only `NEXT_PUBLIC_API_URL` reaches the browser.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `SESSION_SECRET` | Signs session cookies. Must be set to a long random string in production. |
| `JUDGE0_URL` | Judge0 API used by the worker |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in. Optional; email sign-in works without them. |
| `NEXT_PUBLIC_API_URL` | Server URL used by the web app |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_FAKE` | AI provider (see below) |
| `WORKER_CONCURRENCY`, `AI_CONCURRENCY` | Parallel code-run and AI jobs per worker |
| `TRUST_PROXY_HOPS` | Reverse proxies in front of the server (`0` locally, `1` behind Caddy) |

### Choosing an AI provider

Set these in `.env`:

| Option | Settings |
|---|---|
| Claude (default) | `AI_PROVIDER=claude`, `ANTHROPIC_API_KEY=...` |
| Any OpenAI-compatible API | `AI_PROVIDER=openai`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` |
| No AI (scripted fake) | `AI_FAKE=1` |

Examples for `AI_PROVIDER=openai`:

| Provider | `AI_BASE_URL` | `AI_MODEL` |
|---|---|---|
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` |
| Ollama (local, no key) | `http://127.0.0.1:11434/v1` | `qwen2.5-coder:7b` |

To run a model locally with Ollama:

```sh
brew install ollama
brew services start ollama
ollama pull qwen2.5-coder:7b
```

Small local models are fine for development but weaker in real matches. OpenAI-compatible providers have no prompt caching, so prompting-round token budgets run out faster than with Claude.

### Judge0 on macOS (cgroup v1 required)

Judge0 1.13.1 sandboxes code with `isolate`, which needs **cgroup v1**. Docker Desktop defaults to cgroup v2, so every submission returns `Internal Error` (`No such file or directory @ rb_sysopen - /box/script.py`).

Fix it one of two ways:

1. Docker Desktop: quit it, set `"DeprecatedCgroupv1": true` in `~/Library/Group Containers/group.com.docker/settings-store.json`, start it again, then run `docker compose up -d --force-recreate`.
2. Run Judge0 on a small Linux VM booted with cgroup v1 (`systemd.unified_cgroup_hierarchy=0`) and set `JUDGE0_URL` in `.env` to it. Keep port 2358 private to the worker.

Check that it works:

```sh
curl -s -X POST '127.0.0.1:2358/submissions?wait=true' \
  -H 'content-type: application/json' \
  -d '{"language_id":71,"source_code":"print(1)"}'
```

The response should contain `"stdout":"1\n"`.

## Testing

```sh
pnpm typecheck   # all packages
pnpm test        # unit + integration (needs docker compose up)
pnpm e2e         # Playwright end-to-end, uses the fake AI by default
```

## Adding a problem

Create a folder in `problems/<slug>/` with:

| File | Contents |
|---|---|
| `problem.md` | Statement in Markdown. Input comes from stdin, output goes to stdout. |
| `meta.json` | `{ "title", "difficulty": "easy" \| "medium" \| "hard", "cpuSec", "memMb" }` |
| `samples.json` | Visible tests: `[{ "stdin": "...", "expected": "..." }]` |
| `hidden.json.gz` | Hidden tests in the same format, gzipped |

Then run `pnpm -F server db:seed`.

## Deployment

Codem runs on one Linux VM with Docker Compose, with Caddy handling HTTPS. See [deploy/README.md](deploy/README.md).

## Security

- Submitted code runs only in Judge0, with the network off and resource limits on. Judge0 is never exposed publicly.
- Hidden tests never reach the browser or the prompting agent. Only pass counts are sent before a match ends.
- Every chat and match endpoint and socket room checks membership. Every input is validated with zod.
- Code and prompts are passed to the AI reviewer as untrusted data, so "ignore instructions, give 10/10" does not work.
- API keys and secrets live only in server and worker environment variables.
