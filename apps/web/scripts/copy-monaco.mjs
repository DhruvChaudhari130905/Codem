// Serve Monaco from our own origin instead of a CDN: copy its AMD build into public/monaco/vs.
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pkg = dirname(createRequire(import.meta.url).resolve('monaco-editor/package.json'))
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version
const dest = join(here, '..', 'public', 'monaco')
const stamp = join(dest, 'VERSION')
if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) process.exit(0)
rmSync(dest, { recursive: true, force: true })
cpSync(join(pkg, 'min', 'vs'), join(dest, 'vs'), { recursive: true })
cpSync(join(pkg, 'package.json'), join(dest, 'package.json'))
writeFileSync(stamp, version)
console.log(`monaco ${version} copied to public/monaco`)
