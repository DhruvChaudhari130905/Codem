# Deploying Codem

One Linux VM running Docker Compose. Caddy terminates HTTPS for `DOMAIN` (web) and `api.DOMAIN` (API + Socket.IO).
Postgres, Redis, the worker and Judge0 sit on an internal network with no published ports.

## 1. Host

- Ubuntu 22.04+ with Docker Engine and the Compose plugin; 4+ vCPU, 8+ GB RAM (8 GB programs need more).
- **Judge0 needs cgroup v1.** On Ubuntu 22.04+: add `systemd.unified_cgroup_hierarchy=0` to
  `GRUB_CMDLINE_LINUX` in `/etc/default/grub`, run `sudo update-grub`, reboot. Check with `stat -fc %T /sys/fs/cgroup` (prints `tmpfs`, not `cgroup2fs`).
- DNS: `A` records for `DOMAIN` and `api.DOMAIN` pointing at the VM. Open ports 80 and 443 only.

## 2. Configure

```sh
git clone <repo> codem && cd codem
cp deploy/.env.example deploy/.env    # fill in DOMAIN, passwords, ANTHROPIC_API_KEY
```

Change the Judge0 passwords in `judge0.conf` before the first start.
Google sign-in: set the OAuth redirect URI to `https://api.DOMAIN/auth/google/callback`.

## 3. Start

```sh
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

The server container applies migrations and seeds the problem library on every start (both are idempotent).

## 4. Check

```sh
curl https://api.DOMAIN/health                     # {"ok":true}
docker compose -f deploy/docker-compose.prod.yml logs -f worker
```

## Scaling

Run more workers with `docker compose ... up -d --scale worker=3`, or point extra worker machines at the same
`REDIS_URL`, `DATABASE_URL` and a `JUDGE0_URL` on a private network. Judge0 scales by adding `judge0-workers`.

## Rollback

`git checkout <previous tag>` then the same `up -d --build`. Migrations are additive; restore Postgres from a
`pg_dump` backup if a migration must be undone.
