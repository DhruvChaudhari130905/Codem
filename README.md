# Codem

Chat-first platform where friends compete in timed coding and prompting challenges.
See `docs/superpowers/specs/2026-11-06-codem-design.md`.

## Local dev

```sh
cp .env.example .env
docker compose up -d        # postgres, redis, judge0
pnpm install
pnpm -F server db:migrate   # apply Prisma migrations
pnpm -F server db:seed      # load problems/
pnpm dev                    # web :3000, server :4000, worker
```

## Judge0 on macOS (cgroup v1 required)

Judge0 1.13.1 sandboxes code with `isolate`, which needs **cgroup v1**. Docker Desktop
defaults to cgroup v2, so every submission returns `Internal Error`
(`No such file or directory @ rb_sysopen - /box/script.py`).

Fix one of two ways:

1. Docker Desktop: quit it, set `"DeprecatedCgroupv1": true` in
   `~/Library/Group Containers/group.com.docker/settings-store.json`, start it again,
   then `docker compose up -d --force-recreate`.
2. Run Judge0 on a small Linux VM booted with cgroup v1
   (`systemd.unified_cgroup_hierarchy=0`) and set `JUDGE0_URL` in `.env` to it.
   Keep port 2358 private to the worker.

Check: `curl -s -X POST '127.0.0.1:2358/submissions?wait=true' -H 'content-type: application/json' -d '{"language_id":71,"source_code":"print(1)"}'` returns `"stdout":"1\n"`.
