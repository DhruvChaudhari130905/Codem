# One image per app: docker build --target server|worker|web .
FROM node:22-bookworm-slim AS base
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY apps/server/prisma apps/server/prisma
RUN pnpm install --frozen-lockfile

FROM deps AS source
COPY packages packages
COPY apps apps
COPY problems problems
RUN pnpm -F server exec prisma generate && pnpm -F worker exec prisma generate --schema ../server/prisma/schema.prisma

FROM source AS server
ENV NODE_ENV=production
WORKDIR /app/apps/server
EXPOSE 4000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm db:seed && pnpm exec tsx src/main.ts"]

FROM source AS worker
ENV NODE_ENV=production
WORKDIR /app/apps/worker
CMD ["pnpm", "exec", "tsx", "src/main.ts"]

FROM source AS web-build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm -F web build

FROM web-build AS web
ENV NODE_ENV=production
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-p", "3000"]
