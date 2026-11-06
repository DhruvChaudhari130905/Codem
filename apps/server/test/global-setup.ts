import { execSync } from 'node:child_process'
import pg from 'pg'

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://codem:codem@127.0.0.1:5432/codem_test'
  const admin = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') })
  await admin.connect()
  const db = new URL(url).pathname.slice(1)
  const { rowCount } = await admin.query('select 1 from pg_database where datname = $1', [db])
  if (!rowCount) await admin.query(`create database "${db}"`)
  await admin.end()
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' })
}
