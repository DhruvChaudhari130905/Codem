import { describe, expect, it } from 'vitest'
import { Judge0Executor, SourceTooLarge } from '../src/executor.js'

const ex = new Judge0Executor(process.env.JUDGE0_URL!)
const base = { cpuSec: 5, memMb: 256, stdin: '' }

const hello: Record<string, string> = {
  python: 'print("hello")',
  javascript: 'console.log("hello")',
  typescript: 'const s: string = "hello"; console.log(s)',
  java: 'public class Main { public static void main(String[] a) { System.out.println("hello"); } }',
  cpp: '#include <iostream>\nint main(){ std::cout << "hello\\n"; }',
  go: 'package main\nimport "fmt"\nfunc main(){ fmt.Println("hello") }',
}

describe('Judge0Executor', () => {
  it('runs python with stdin', async () => {
    const r = await ex.run({ ...base, language: 'python', source: 'print(input()[::-1])', stdin: 'abc' })
    expect(r.status).toBe('ok')
    expect(r.stdout).toBe('cba\n')
  })

  it('stops a C++ infinite loop with time_limit', async () => {
    const r = await ex.run({ ...base, cpuSec: 1, language: 'cpp', source: 'int main(){ volatile long x=0; while(true) x++; }' })
    expect(r.status).toBe('time_limit')
  })

  it('reports memory_limit for a 2 GB allocation under 256 MB', async () => {
    const r = await ex.run({ ...base, language: 'python', source: 'x = bytearray(2 * 1024**3)\nprint(len(x))' })
    expect(r.status).toBe('memory_limit')
  })

  it('has no network access', async () => {
    const r = await ex.run({ ...base, language: 'python', source: "import urllib.request\nprint(urllib.request.urlopen('http://example.com', timeout=3).status)" })
    expect(r.status).not.toBe('ok')
  })

  it('reports compile_error for bad C++', async () => {
    const r = await ex.run({ ...base, language: 'cpp', source: 'int main( { return 0 }' })
    expect(r.status).toBe('compile_error')
    expect(r.stderr.length).toBeGreaterThan(0)
  })

  it('reports runtime_error for an uncaught exception', async () => {
    const r = await ex.run({ ...base, language: 'python', source: 'raise ValueError("boom")' })
    expect(r.status).toBe('runtime_error')
    expect(r.stderr).toContain('boom')
  })

  it.each(Object.keys(hello))('runs hello world in %s', async (language) => {
    const r = await ex.run({ ...base, cpuSec: 10, language: language as never, source: hello[language] })
    expect(r).toMatchObject({ status: 'ok', stdout: 'hello\n' })
  })

  it('runs a batch of stdins in order', async () => {
    const rs = await ex.runBatch({ ...base, language: 'python', source: 'print(int(input())*2)', stdins: ['1', '2', '3'] })
    expect(rs.map((r) => r.stdout)).toEqual(['2\n', '4\n', '6\n'])
  })

  it('rejects source over 64 KB before calling Judge0', async () => {
    await expect(ex.run({ ...base, language: 'python', source: '#'.repeat(65_537) })).rejects.toBeInstanceOf(SourceTooLarge)
  })
})
